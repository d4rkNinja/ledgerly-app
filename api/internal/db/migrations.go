package db

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

const invitationDeduplicationBatchSize = 500

// legacyTransactionDateBatchSize bounds the compatibility backfill work per
// cursor page. The backfill only touches records with an absent/zero
// occurred_at and a valid created_at; a non-zero declared date is never
// selected or overwritten.
const legacyTransactionDateBatchSize = 500

type transactionSequenceMigrationRow struct {
	ID            string        `bson:"_id"`
	WorkspaceID   string        `bson:"workspace_id"`
	Type          string        `bson:"type"`
	TransactionID string        `bson:"transaction_id"`
	SequenceScope string        `bson:"sequence_scope"`
	Splits        []model.Split `bson:"splits"`
}

type transactionSequenceMigrationKey struct {
	WorkspaceID     string
	TransactionType string
}

type pendingInvitationIdentity struct {
	ID          string `bson:"_id"`
	WorkspaceID string `bson:"workspace_id"`
	Email       string `bson:"email"`
}

type pendingInvitationDeduplicator struct {
	seen map[string]struct{}
}

func newPendingInvitationDeduplicator() *pendingInvitationDeduplicator {
	return &pendingInvitationDeduplicator{seen: make(map[string]struct{})}
}

func (d *pendingInvitationDeduplicator) isDuplicate(row pendingInvitationIdentity) bool {
	key := row.WorkspaceID + "\x00" + canonicalInvitationEmail(row.Email)
	if _, exists := d.seen[key]; exists {
		return true
	}
	d.seen[key] = struct{}{}
	return false
}

func canonicalInvitationEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func (mc *MongoClient) invalidateLegacyWorkspaceJoinCodes(ctx context.Context, now time.Time) error {
	_, err := mc.Database.Collection(workspacesCollection).UpdateMany(
		ctx,
		legacyWorkspaceJoinCodeFilter(),
		bson.M{"$set": bson.M{"join_code_expires_at": now}},
	)
	if err != nil {
		return fmt.Errorf("invalidate legacy workspace join codes: %w", err)
	}
	return nil
}

func legacyWorkspaceJoinCodeFilter() bson.M {
	return bson.M{
		"join_code_hash": bson.M{
			"$exists": true,
			"$type":   "string",
			"$ne":     "",
		},
		"join_code_expires_at": bson.M{"$exists": false},
	}
}

func legacyTransactionDateFilter() bson.M {
	return bson.M{
		"_id":        bson.M{"$type": "string"},
		"created_at": bson.M{"$type": "date"},
		"$or": bson.A{
			bson.M{"occurred_at": bson.M{"$exists": false}},
			bson.M{"occurred_at": time.Time{}},
		},
	}
}

// backfillLegacyTransactionDates is an idempotent compatibility migration.
// It is deliberately narrower than a general date migration: only legacy
// records with no usable occurred_at receive the already-documented created_at
// fallback. Existing user-selected dates remain untouched. The runtime still
// supports the fallback so a partial/interrupted migration is safe.
func (mc *MongoClient) backfillLegacyTransactionDates(ctx context.Context) error {
	collection := mc.Database.Collection(transactionsCollection)
	for {
		cursor, err := collection.Find(ctx, legacyTransactionDateFilter(), options.Find().
			SetProjection(bson.M{"_id": 1, "created_at": 1}).
			SetLimit(legacyTransactionDateBatchSize))
		if err != nil {
			return fmt.Errorf("scan legacy transaction dates: %w", err)
		}
		processed := 0
		for cursor.Next(ctx) {
			var row struct {
				ID        string    `bson:"_id"`
				CreatedAt time.Time `bson:"created_at"`
			}
			if err := cursor.Decode(&row); err != nil {
				_ = cursor.Close(ctx)
				return fmt.Errorf("decode legacy transaction date: %w", err)
			}
			if row.ID == "" || row.CreatedAt.IsZero() {
				continue
			}
			if _, err := collection.UpdateOne(ctx, bson.M{
				"_id": row.ID,
				"$or": bson.A{
					bson.M{"occurred_at": bson.M{"$exists": false}},
					bson.M{"occurred_at": time.Time{}},
				},
			}, bson.M{"$set": bson.M{"occurred_at": row.CreatedAt.UTC()}}); err != nil {
				_ = cursor.Close(ctx)
				return fmt.Errorf("backfill legacy transaction %s: %w", row.ID, err)
			}
			processed++
		}
		cursorErr := cursor.Err()
		_ = cursor.Close(ctx)
		if cursorErr != nil {
			return fmt.Errorf("iterate legacy transaction dates: %w", cursorErr)
		}
		if processed == 0 {
			break
		}
	}
	return nil
}

func transactionSequenceMigrationSort() bson.D {
	return bson.D{
		{Key: "occurred_at", Value: 1},
		{Key: "created_at", Value: 1},
		{Key: "_id", Value: 1},
	}
}

func missingTransactionIDFilter() bson.M {
	return bson.M{"$or": bson.A{
		bson.M{"transaction_id": bson.M{"$exists": false}},
		bson.M{"transaction_id": ""},
		bson.M{"transaction_id": nil},
	}}
}

func transactionSequenceMigrationScope(row transactionSequenceMigrationRow) string {
	if model.IsTransactionSequenceType(row.SequenceScope) {
		return row.SequenceScope
	}
	return model.TransactionSequenceScope(row.Type, len(row.Splits) > 0)
}

func (mc *MongoClient) scanTransactionSequenceHighWater(
	ctx context.Context,
) (map[transactionSequenceMigrationKey]int64, error) {
	collection := mc.Database.Collection(transactionsCollection)
	cursor, err := collection.Find(
		ctx,
		bson.M{"workspace_id": bson.M{"$type": "string", "$gt": ""}},
		options.Find().
			SetProjection(bson.M{
				"_id": 1, "workspace_id": 1, "type": 1, "splits": 1,
				"transaction_id": 1, "sequence_scope": 1,
			}).
			SetSort(transactionSequenceMigrationSort()).
			SetAllowDiskUse(true),
	)
	if err != nil {
		return nil, fmt.Errorf("scan transaction sequence high-water marks: %w", err)
	}
	defer cursor.Close(ctx)

	highWater := make(map[transactionSequenceMigrationKey]int64)
	for cursor.Next(ctx) {
		var row transactionSequenceMigrationRow
		if err := cursor.Decode(&row); err != nil {
			return nil, fmt.Errorf("decode transaction sequence row: %w", err)
		}
		if row.ID == "" || row.WorkspaceID == "" {
			continue
		}
		scope := transactionSequenceMigrationScope(row)
		key := transactionSequenceMigrationKey{WorkspaceID: row.WorkspaceID, TransactionType: scope}
		if _, exists := highWater[key]; !exists {
			highWater[key] = 0
		}
		if row.SequenceScope != scope {
			if _, err := collection.UpdateOne(
				ctx,
				bson.M{"_id": row.ID, "workspace_id": row.WorkspaceID},
				bson.M{"$set": bson.M{"sequence_scope": scope}},
			); err != nil {
				return nil, fmt.Errorf("persist transaction sequence scope for %s: %w", row.ID, err)
			}
		}
		if row.TransactionID == "" {
			continue
		}
		number, err := model.ParseTransactionSequenceNumber(row.TransactionID)
		if err != nil {
			return nil, fmt.Errorf("transaction %s has invalid transaction_id %q: %w", row.ID, row.TransactionID, err)
		}
		if number > highWater[key] {
			highWater[key] = number
		}
	}
	if err := cursor.Err(); err != nil {
		return nil, fmt.Errorf("iterate transaction sequence high-water marks: %w", err)
	}
	return highWater, nil
}

func (mc *MongoClient) seedTransactionSequence(
	ctx context.Context,
	key transactionSequenceMigrationKey,
	minimumNext int64,
) error {
	defaults := model.DefaultTransactionSequence(key.WorkspaceID, key.TransactionType)
	collection := mc.Database.Collection(transactionSequencesCollection)
	if _, err := collection.UpdateOne(
		ctx,
		bson.M{"_id": defaults.ID},
		bson.M{"$setOnInsert": bson.M{
			"workspace_id": key.WorkspaceID, "transaction_type": key.TransactionType,
			"auto_generate": true, "next_number": int64(1),
			"minimum_digits": model.DefaultTransactionSequenceMinimumDigits,
		}},
		options.Update().SetUpsert(true),
	); err != nil && !mongo.IsDuplicateKeyError(err) {
		return fmt.Errorf("create transaction sequence %s/%s: %w", key.WorkspaceID, key.TransactionType, err)
	}
	if minimumNext < 1 {
		minimumNext = 1
	}
	if _, err := collection.UpdateOne(
		ctx,
		bson.M{"_id": defaults.ID},
		bson.M{"$max": bson.M{"next_number": minimumNext}},
	); err != nil {
		return fmt.Errorf("advance transaction sequence %s/%s: %w", key.WorkspaceID, key.TransactionType, err)
	}
	return nil
}

func (mc *MongoClient) allocateMigrationTransactionID(
	ctx context.Context,
	key transactionSequenceMigrationKey,
) (string, error) {
	var sequence model.TransactionSequence
	err := mc.Database.Collection(transactionSequencesCollection).FindOneAndUpdate(
		ctx,
		bson.M{
			"_id": key.WorkspaceID + ":" + key.TransactionType,
			"next_number": bson.M{
				"$gte": int64(1),
				"$lte": model.MaximumTransactionSequenceNumber,
			},
		},
		bson.M{"$inc": bson.M{"next_number": int64(1)}},
		options.FindOneAndUpdate().SetReturnDocument(options.Before),
	).Decode(&sequence)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return "", fmt.Errorf("transaction sequence %s/%s is exhausted", key.WorkspaceID, key.TransactionType)
	}
	if err != nil {
		return "", fmt.Errorf("allocate transaction sequence %s/%s: %w", key.WorkspaceID, key.TransactionType, err)
	}
	return model.FormatTransactionSequenceNumber(sequence.NextNumber, sequence.MinimumDigits), nil
}

// backfillTransactionSequences assigns IDs only to legacy rows that do not
// have one. Existing IDs are never renumbered. The ordered scan makes each
// scope stable by occurred_at, created_at, then _id; persisted atomic counters
// make interrupted reruns safe and retain all previously reserved numbers.
func (mc *MongoClient) backfillTransactionSequences(ctx context.Context) error {
	highWater, err := mc.scanTransactionSequenceHighWater(ctx)
	if err != nil {
		return err
	}
	keys := make([]transactionSequenceMigrationKey, 0, len(highWater))
	for key := range highWater {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(left, right int) bool {
		if keys[left].WorkspaceID == keys[right].WorkspaceID {
			return keys[left].TransactionType < keys[right].TransactionType
		}
		return keys[left].WorkspaceID < keys[right].WorkspaceID
	})
	for _, key := range keys {
		if err := mc.seedTransactionSequence(ctx, key, highWater[key]+1); err != nil {
			return err
		}
	}

	collection := mc.Database.Collection(transactionsCollection)
	filter := missingTransactionIDFilter()
	filter["workspace_id"] = bson.M{"$type": "string", "$gt": ""}
	cursor, err := collection.Find(
		ctx,
		filter,
		options.Find().
			SetProjection(bson.M{"_id": 1, "workspace_id": 1, "type": 1, "splits": 1, "sequence_scope": 1}).
			SetSort(transactionSequenceMigrationSort()).
			SetAllowDiskUse(true),
	)
	if err != nil {
		return fmt.Errorf("scan transactions missing transaction IDs: %w", err)
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var row transactionSequenceMigrationRow
		if err := cursor.Decode(&row); err != nil {
			return fmt.Errorf("decode transaction missing transaction ID: %w", err)
		}
		if row.ID == "" || row.WorkspaceID == "" {
			continue
		}
		scope := transactionSequenceMigrationScope(row)
		key := transactionSequenceMigrationKey{WorkspaceID: row.WorkspaceID, TransactionType: scope}
		if _, exists := highWater[key]; !exists {
			if err := mc.seedTransactionSequence(ctx, key, 1); err != nil {
				return err
			}
			highWater[key] = 0
		}
		transactionID, err := mc.allocateMigrationTransactionID(ctx, key)
		if err != nil {
			return err
		}
		conditional := missingTransactionIDFilter()
		conditional["_id"] = row.ID
		conditional["workspace_id"] = row.WorkspaceID
		if _, err := collection.UpdateOne(
			ctx,
			conditional,
			bson.M{"$set": bson.M{"transaction_id": transactionID, "sequence_scope": scope}},
		); err != nil {
			return fmt.Errorf("backfill transaction ID for %s: %w", row.ID, err)
		}
	}
	if err := cursor.Err(); err != nil {
		return fmt.Errorf("iterate transactions missing transaction IDs: %w", err)
	}
	return nil
}

// preparePendingInvitationIndex upgrades legacy data before creating the
// partial unique (workspace_id, email) index. TTL deletion is asynchronous, so
// expired pending rows must first leave the partial-index set. Historical race
// duplicates are then deterministically cancelled, keeping the newest row.
func (mc *MongoClient) preparePendingInvitationIndex(ctx context.Context, now time.Time) error {
	collection := mc.Database.Collection(invitationsCollection)
	// Older deployments created this index with only status=pending, which
	// incorrectly indexed valid code-only invitations with an empty email. Drop
	// it before recreating the compatible, email-only definition below.
	if err := dropInvitationEmailIndex(ctx, collection); err != nil {
		return err
	}
	if _, err := collection.UpdateMany(
		ctx,
		bson.M{
			"status": "pending",
			"$or": bson.A{
				bson.M{"expires_at": bson.M{"$lte": now}},
				bson.M{"expires_at": bson.M{"$not": bson.M{"$type": "date"}}},
			},
		},
		bson.M{"$set": bson.M{"status": "expired", "expired_at": now}},
	); err != nil {
		return fmt.Errorf("expire stale invitations: %w", err)
	}

	cursor, err := collection.Find(
		ctx,
		bson.M{"status": "pending", "expires_at": bson.M{"$gt": now}},
		options.Find().
			SetProjection(bson.M{"_id": 1, "workspace_id": 1, "email": 1}).
			SetSort(bson.D{
				{Key: "created_at", Value: -1},
				{Key: "_id", Value: -1},
			}).
			SetAllowDiskUse(true),
	)
	if err != nil {
		return fmt.Errorf("scan pending invitations: %w", err)
	}
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), disconnectTimeout)
		defer cancel()
		_ = cursor.Close(cleanupCtx)
	}()

	deduplicator := newPendingInvitationDeduplicator()
	duplicateIDs := make([]string, 0, invitationDeduplicationBatchSize)
	invalidIDs := make([]string, 0, invitationDeduplicationBatchSize)
	flush := func() error {
		if len(duplicateIDs) == 0 {
			return nil
		}
		ids := append([]string(nil), duplicateIDs...)
		duplicateIDs = duplicateIDs[:0]
		if _, err := collection.UpdateMany(
			ctx,
			bson.M{"_id": bson.M{"$in": ids}, "status": "pending"},
			bson.M{"$set": bson.M{"status": "cancelled", "cancelled_at": now}},
		); err != nil {
			return fmt.Errorf("cancel duplicate pending invitations: %w", err)
		}
		return nil
	}
	flushInvalid := func() error {
		if len(invalidIDs) == 0 {
			return nil
		}
		ids := append([]string(nil), invalidIDs...)
		invalidIDs = invalidIDs[:0]
		if _, err := collection.UpdateMany(
			ctx,
			bson.M{"_id": bson.M{"$in": ids}, "status": "pending"},
			bson.M{"$set": bson.M{"status": "cancelled", "cancelled_at": now, "cancel_reason": "invalid_identity"}},
		); err != nil {
			return fmt.Errorf("cancel malformed pending invitations: %w", err)
		}
		return nil
	}

	for cursor.Next(ctx) {
		var row pendingInvitationIdentity
		if err := cursor.Decode(&row); err != nil {
			return fmt.Errorf("decode pending invitation: %w", err)
		}
		canonicalEmail := canonicalInvitationEmail(row.Email)
		if row.ID == "" || row.WorkspaceID == "" {
			if row.ID != "" {
				invalidIDs = append(invalidIDs, row.ID)
				if len(invalidIDs) == invitationDeduplicationBatchSize {
					if err := flushInvalid(); err != nil {
						return err
					}
				}
			}
			continue
		}
		// Empty email means this is a manual token invitation. It must remain
		// pending and is intentionally outside the email uniqueness index.
		if canonicalEmail == "" {
			continue
		}
		if !deduplicator.isDuplicate(row) {
			if canonicalEmail != row.Email {
				if _, err := collection.UpdateOne(
					ctx,
					bson.M{"_id": row.ID, "status": "pending"},
					bson.M{"$set": bson.M{"email": canonicalEmail}},
				); err != nil {
					return fmt.Errorf("normalize pending invitation email: %w", err)
				}
			}
			continue
		}
		duplicateIDs = append(duplicateIDs, row.ID)
		if len(duplicateIDs) == invitationDeduplicationBatchSize {
			if err := flush(); err != nil {
				return err
			}
		}
	}
	if err := cursor.Err(); err != nil {
		return fmt.Errorf("iterate pending invitations: %w", err)
	}
	if err := flush(); err != nil {
		return err
	}
	return flushInvalid()
}

func dropInvitationEmailIndex(ctx context.Context, collection *mongo.Collection) error {
	specifications, err := collection.Indexes().ListSpecifications(ctx)
	if err != nil {
		return fmt.Errorf("inspect pending invitation indexes: %w", err)
	}
	for _, specification := range specifications {
		if specification.Name != "pending_workspace_email_unique" {
			continue
		}
		if _, err := collection.Indexes().DropOne(ctx, specification.Name); err != nil {
			return fmt.Errorf("remove legacy pending invitation index: %w", err)
		}
		break
	}
	return nil
}
