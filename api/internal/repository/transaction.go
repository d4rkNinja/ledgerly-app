package repository

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

const (
	accountsCollection        = "accounts"
	auditEventsCollection     = "audit_events"
	idempotencyCollection     = "idempotency"
	transactionsCollection    = "transactions"
	vaultsCollection          = "vaults"
	workspacesCollection      = "workspaces"
	idempotencyRecordLifetime = 24 * time.Hour
)

type financialIdempotencyPayload struct {
	WorkspaceID          string        `bson:"workspace_id"`
	VaultID              string        `bson:"vault_id"`
	AccountID            string        `bson:"account_id"`
	DestinationAccountID string        `bson:"destination_account_id"`
	AmountMinor          int64         `bson:"amount_minor"`
	Currency             string        `bson:"currency"`
	Type                 string        `bson:"type"`
	TransactionID        string        `bson:"transaction_id"`
	SequenceScope        string        `bson:"sequence_scope"`
	Category             string        `bson:"category"`
	Merchant             string        `bson:"merchant"`
	Notes                string        `bson:"notes"`
	GoalID               string        `bson:"goal_id"`
	Tags                 []string      `bson:"tags"`
	Splits               []model.Split `bson:"splits"`
	Privacy              string        `bson:"privacy"`
	OccurredAt           time.Time     `bson:"occurred_at"`
}

type vaultBalanceAdjustment struct {
	vaultID string
	delta   int64
}

func (s *MongoStore) CreateFinancialTransaction(
	ctx context.Context,
	tx *model.Transaction,
	idempotencyKey string,
	requestOccurredAt *time.Time,
	audit *model.AuditEvent,
) (*model.Transaction, error) {
	if tx == nil {
		return nil, errors.New("transaction is required")
	}
	sourceDelta, err := transactionSourceDelta(tx)
	if err != nil {
		return nil, err
	}
	payloadHash, err := financialPayloadHash(tx, requestOccurredAt)
	if err != nil {
		return nil, fmt.Errorf("hash transaction payload: %w", err)
	}
	idempotencyNow := time.Now().UTC()
	if err := s.releaseExpiredIdempotencyKey(ctx, tx.CreatedBy, idempotencyKey, idempotencyNow); err != nil {
		return nil, err
	}
	if existing, found, err := s.idempotentResult(ctx, tx.CreatedBy, idempotencyKey, payloadHash, idempotencyNow); err != nil {
		return nil, err
	} else if found {
		return existing, nil
	}

	result, err := s.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if err := s.prepareTransactionIdentifier(transactionCtx, tx); err != nil {
			return nil, err
		}
		if idempotencyKey != "" {
			record := bson.M{
				"_id":          tx.ID,
				"user_id":      tx.CreatedBy,
				"key":          idempotencyKey,
				"payload_hash": payloadHash,
				"response":     tx,
				"expires_at":   time.Now().UTC().Add(idempotencyRecordLifetime),
			}
			if _, err := s.database.Collection(idempotencyCollection).InsertOne(transactionCtx, record); err != nil {
				return nil, err
			}
		}

		if _, err := s.database.Collection(transactionsCollection).InsertOne(transactionCtx, tx); err != nil {
			if mongo.IsDuplicateKeyError(err) {
				return nil, ErrTransactionIDDuplicate
			}
			return nil, err
		}

		var sourceAccount model.Account
		if err := s.incrementBalance(
			transactionCtx,
			accountsCollection,
			bson.M{
				"_id":          tx.AccountID,
				"workspace_id": tx.WorkspaceID,
				"vault_id":     tx.VaultID,
				"currency":     tx.Currency,
				"archived":     false,
			},
			sourceDelta,
			tx.UpdatedAt,
			&sourceAccount,
		); err != nil {
			return nil, fmt.Errorf("update source account: %w", err)
		}

		var destinationAccount model.Account
		if tx.Type == "transfer" {
			if err := s.incrementBalance(
				transactionCtx,
				accountsCollection,
				bson.M{
					"_id":          tx.DestinationAccountID,
					"workspace_id": tx.WorkspaceID,
					"currency":     tx.Currency,
					"archived":     false,
				},
				tx.AmountMinor,
				tx.UpdatedAt,
				&destinationAccount,
			); err != nil {
				return nil, fmt.Errorf("update destination account: %w", err)
			}
		}

		for _, adjustment := range transactionVaultAdjustments(tx, sourceAccount.VaultID, destinationAccount.VaultID, sourceDelta) {
			if err := s.incrementVaultBalance(transactionCtx, tx, adjustment.vaultID, adjustment.delta); err != nil {
				return nil, fmt.Errorf("update vault %s: %w", adjustment.vaultID, err)
			}
		}
		if audit != nil {
			ledgerVersion, err := s.nextWorkspaceLedgerVersion(transactionCtx, tx.WorkspaceID)
			if err != nil {
				return nil, fmt.Errorf("advance workspace ledger: %w", err)
			}
			audit.LedgerVersion = ledgerVersion
			audit.Before = nil
			audit.After = model.NewTransactionRevisionSnapshot(tx)
			if _, err := s.database.Collection(auditEventsCollection).InsertOne(transactionCtx, audit); err != nil {
				return nil, fmt.Errorf("insert transaction audit: %w", err)
			}
		}
		return tx, nil
	})
	if err != nil {
		if errors.Is(err, ErrConflict) || mongo.IsDuplicateKeyError(err) {
			if existing, found, findErr := s.idempotentResult(ctx, tx.CreatedBy, idempotencyKey, payloadHash, idempotencyNow); findErr != nil {
				return nil, findErr
			} else if found {
				return existing, nil
			}
		}
		return nil, normalize(err)
	}
	created, ok := result.(*model.Transaction)
	if !ok {
		return nil, errors.New("unexpected transaction result")
	}
	return created, nil
}

func (s *MongoStore) nextWorkspaceLedgerVersion(ctx context.Context, workspaceID string) (int64, error) {
	var workspace model.Workspace
	err := s.database.Collection(workspacesCollection).FindOneAndUpdate(
		ctx,
		bson.M{"_id": workspaceID},
		bson.M{"$inc": bson.M{"ledger_version": int64(1)}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&workspace)
	if err != nil {
		return 0, normalize(err)
	}
	return workspace.LedgerVersion, nil
}

func transactionSourceDelta(tx *model.Transaction) (int64, error) {
	if tx.AmountMinor <= 0 {
		return 0, errors.New("transaction amount must be greater than zero")
	}
	if tx.AmountMinor > model.MaxMoneyMinor {
		return 0, errors.New("transaction amount exceeds the supported maximum")
	}
	switch tx.Type {
	case "expense", "transfer":
		if tx.Type == "transfer" && (tx.DestinationAccountID == "" || tx.DestinationAccountID == tx.AccountID) {
			return 0, errors.New("transfer destination account must be different from source account")
		}
		return -tx.AmountMinor, nil
	case "income", "refund", "reimbursement":
		return tx.AmountMinor, nil
	case "adjustment":
		return 0, nil
	default:
		return 0, fmt.Errorf("unsupported transaction type %q", tx.Type)
	}
}

func transactionVaultAdjustments(
	tx *model.Transaction,
	sourceVaultID string,
	destinationVaultID string,
	sourceDelta int64,
) []vaultBalanceAdjustment {
	if tx.Type != "transfer" {
		return []vaultBalanceAdjustment{{vaultID: sourceVaultID, delta: sourceDelta}}
	}
	if destinationVaultID == sourceVaultID {
		return nil
	}
	return []vaultBalanceAdjustment{
		{vaultID: sourceVaultID, delta: sourceDelta},
		{vaultID: destinationVaultID, delta: tx.AmountMinor},
	}
}

func balanceRangeForDelta(delta int64) (int64, int64, error) {
	if delta < -model.MaxMoneyMinor || delta > model.MaxMoneyMinor {
		return 0, 0, errors.New("balance delta exceeds the supported range")
	}
	minimum := -model.MaxMoneyMinor
	maximum := model.MaxMoneyMinor
	if delta < 0 {
		minimum -= delta
	}
	if delta > 0 {
		maximum -= delta
	}
	return minimum, maximum, nil
}

func (s *MongoStore) incrementBalance(
	ctx context.Context,
	collection string,
	filter bson.M,
	delta int64,
	updatedAt time.Time,
	destination any,
) error {
	minimum, maximum, err := balanceRangeForDelta(delta)
	if err != nil {
		return err
	}
	filter["balance_minor"] = bson.M{"$gte": minimum, "$lte": maximum}
	result := s.database.Collection(collection).FindOneAndUpdate(
		ctx,
		filter,
		bson.M{
			"$inc": bson.M{"balance_minor": delta},
			"$set": bson.M{"updated_at": updatedAt},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	if err := result.Decode(destination); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return fmt.Errorf("balance mutation rejected: %w", ErrConflict)
		}
		return normalize(err)
	}
	return nil
}

func (s *MongoStore) incrementVaultBalance(ctx context.Context, tx *model.Transaction, vaultID string, delta int64) error {
	var vault model.Vault
	return s.incrementBalance(
		ctx,
		vaultsCollection,
		bson.M{
			"_id":          vaultID,
			"workspace_id": tx.WorkspaceID,
			"currency":     tx.Currency,
			"archived":     false,
		},
		delta,
		tx.UpdatedAt,
		&vault,
	)
}

func (s *MongoStore) releaseExpiredIdempotencyKey(ctx context.Context, userID, key string, now time.Time) error {
	if key == "" {
		return nil
	}
	_, err := s.database.Collection(idempotencyCollection).
		DeleteOne(ctx, expiredIdempotencyFilter(userID, key, now))
	return normalize(err)
}

func (s *MongoStore) idempotentResult(
	ctx context.Context,
	userID,
	key,
	payloadHash string,
	now time.Time,
) (*model.Transaction, bool, error) {
	if key == "" {
		return nil, false, nil
	}
	var existing struct {
		PayloadHash string            `bson:"payload_hash"`
		Response    model.Transaction `bson:"response"`
	}
	err := s.database.Collection(idempotencyCollection).
		FindOne(ctx, activeIdempotencyFilter(userID, key, now)).
		Decode(&existing)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, normalize(err)
	}
	if existing.PayloadHash != payloadHash {
		return nil, false, ErrConflict
	}
	return &existing.Response, true, nil
}

func activeIdempotencyFilter(userID, key string, now time.Time) bson.M {
	return bson.M{
		"user_id":    userID,
		"key":        key,
		"expires_at": bson.M{"$gt": now},
	}
}

func expiredIdempotencyFilter(userID, key string, now time.Time) bson.M {
	return bson.M{
		"user_id":    userID,
		"key":        key,
		"expires_at": bson.M{"$lte": now},
	}
}

func financialPayloadHash(tx *model.Transaction, requestOccurredAt *time.Time) (string, error) {
	occurredAt := time.Time{}
	if requestOccurredAt != nil {
		occurredAt = requestOccurredAt.UTC()
	}
	payload := financialIdempotencyPayload{
		WorkspaceID: tx.WorkspaceID, VaultID: tx.VaultID, AccountID: tx.AccountID,
		DestinationAccountID: tx.DestinationAccountID, AmountMinor: tx.AmountMinor,
		Currency: tx.Currency, Type: tx.Type, TransactionID: tx.TransactionID, SequenceScope: tx.SequenceScope,
		Category: tx.Category, Merchant: tx.Merchant,
		Notes: tx.Notes, GoalID: tx.GoalID, Tags: tx.Tags, Splits: tx.Splits, Privacy: tx.Privacy,
		// Hash the client request, not a timestamp generated by the server.
		// Retries that omitted occurredAt must resolve to the first committed
		// response instead of conflicting because time.Now changed.
		OccurredAt: occurredAt,
	}
	encoded, err := bson.Marshal(payload)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return base64.RawURLEncoding.EncodeToString(sum[:]), nil
}
