package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type GoalProgressInput struct {
	AmountMinor int64     `json:"amountMinor"`
	OccurredAt  time.Time `json:"occurredAt"`
}

type GoalTransactionInput struct {
	AmountMinor          int64     `json:"amountMinor"`
	OccurredAt           time.Time `json:"occurredAt"`
	AccountID            string    `json:"accountId"`
	DestinationAccountID string    `json:"destinationAccountId"`
	TransactionType      string    `json:"transactionType"`
	Category             string    `json:"category"`
	Description          string    `json:"description"`
	Notes                string    `json:"notes"`
	ContactID            string    `json:"contactId"`
	Currency             string    `json:"currency"`
	Privacy              string    `json:"privacy"`
}

type GoalLinkInput struct {
	TransactionID string `json:"transactionId"`
}

type GoalRescheduleInput struct {
	DueDate *time.Time `json:"dueDate"`
}

type goalActionRecord struct {
	ID             string    `bson:"_id"`
	WorkspaceID    string    `bson:"workspace_id"`
	GoalID         string    `bson:"goal_id"`
	IdempotencyKey string    `bson:"idempotency_key"`
	Action         string    `bson:"action"`
	AmountMinor    int64     `bson:"amount_minor,omitempty"`
	TransactionID  string    `bson:"transaction_id,omitempty"`
	OccurredAt     time.Time `bson:"occurred_at,omitempty"`
	CreatedBy      string    `bson:"created_by"`
	CreatedAt      time.Time `bson:"created_at"`
	Fingerprint    string    `bson:"fingerprint"`
}

type GoalActionResult struct {
	Goal        *model.Goal        `json:"goal"`
	Transaction *model.Transaction `json:"transaction,omitempty"`
	Applied     bool               `json:"applied"`
}

func normalizeGoalIdempotencyKey(raw string) (string, error) {
	key := strings.TrimSpace(raw)
	if len(key) < 8 || len(key) > 128 {
		return "", &FieldError{Field: "Idempotency-Key", Message: "header must contain 8 to 128 characters"}
	}
	return key, nil
}

func goalActionFingerprint(action string, amountMinor int64, occurredAt time.Time, transactionID string) string {
	payload := fmt.Sprintf("%s\x00%d\x00%s\x00%s", action, amountMinor, occurredAt.UTC().Format(time.RFC3339Nano), transactionID)
	sum := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(sum[:])
}

type goalTransactionFingerprintPayload struct {
	Action               string `json:"action"`
	GoalID               string `json:"goalId"`
	AmountMinor          int64  `json:"amountMinor"`
	OccurredAt           string `json:"occurredAt"`
	AccountID            string `json:"accountId"`
	DestinationAccountID string `json:"destinationAccountId"`
	TransactionType      string `json:"transactionType"`
	Category             string `json:"category"`
	Description          string `json:"description"`
	Notes                string `json:"notes"`
	ContactID            string `json:"contactId"`
	Currency             string `json:"currency"`
	Privacy              string `json:"privacy"`
	VaultID              string `json:"vaultId"`
}

type goalLinkFingerprintPayload struct {
	Action               string    `json:"action"`
	GoalID               string    `json:"goalId"`
	TransactionID        string    `json:"transactionId"`
	AmountMinor          int64     `json:"amountMinor"`
	OccurredAt           time.Time `json:"occurredAt"`
	AccountID            string    `json:"accountId"`
	DestinationAccountID string    `json:"destinationAccountId"`
	TransactionType      string    `json:"transactionType"`
	Category             string    `json:"category"`
	Description          string    `json:"description"`
	Notes                string    `json:"notes"`
	ContactID            string    `json:"contactId"`
	Currency             string    `json:"currency"`
	Privacy              string    `json:"privacy"`
	VaultID              string    `json:"vaultId"`
}

func canonicalGoalFingerprint(payload any) string {
	encoded, err := json.Marshal(payload)
	if err != nil {
		// All callers pass fixed, JSON-safe value structs. Keep a deterministic
		// fallback if that invariant is ever violated rather than dropping the
		// idempotency guard.
		encoded = []byte(fmt.Sprintf("%#v", payload))
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func goalTransactionFingerprint(goalID string, input TransactionInput, occurredAt time.Time) string {
	return canonicalGoalFingerprint(goalTransactionFingerprintPayload{
		Action:               "transaction",
		GoalID:               goalID,
		AmountMinor:          input.AmountMinor,
		OccurredAt:           occurredAt.UTC().Format(time.RFC3339Nano),
		AccountID:            strings.TrimSpace(input.AccountID),
		DestinationAccountID: strings.TrimSpace(input.DestinationAccountID),
		TransactionType:      strings.ToLower(strings.TrimSpace(input.Type)),
		Category:             strings.TrimSpace(input.Category),
		Description:          strings.TrimSpace(input.Description),
		Notes:                strings.TrimSpace(input.Notes),
		ContactID:            strings.TrimSpace(input.ContactID),
		Currency:             strings.ToUpper(strings.TrimSpace(input.Currency)),
		Privacy:              strings.ToLower(strings.TrimSpace(input.Privacy)),
		VaultID:              strings.TrimSpace(input.VaultID),
	})
}

func goalProgressFingerprint(goalID, action string, amountMinor int64, occurredAt time.Time) string {
	return canonicalGoalFingerprint(struct {
		Action      string    `json:"action"`
		GoalID      string    `json:"goalId"`
		AmountMinor int64     `json:"amountMinor"`
		OccurredAt  time.Time `json:"occurredAt"`
	}{action, goalID, amountMinor, occurredAt.UTC()})
}

func goalLinkFingerprint(goalID string, transaction model.Transaction) string {
	return canonicalGoalFingerprint(goalLinkFingerprintPayload{
		Action:               "linked_transaction",
		GoalID:               goalID,
		TransactionID:        transaction.ID,
		AmountMinor:          transaction.AmountMinor,
		OccurredAt:           effectiveTransactionDate(transaction).UTC(),
		AccountID:            transaction.AccountID,
		DestinationAccountID: transaction.DestinationAccountID,
		TransactionType:      transaction.Type,
		Category:             transaction.Category,
		Description:          transaction.Description,
		Notes:                transaction.Notes,
		ContactID:            transaction.ContactID,
		Currency:             transaction.Currency,
		Privacy:              transaction.Privacy,
		VaultID:              transaction.VaultID,
	})
}

func goalTransactionIdempotencyKey(goalID, key string) string {
	sum := sha256.Sum256([]byte(goalID + "\x00" + key))
	return "goal-" + hex.EncodeToString(sum[:])
}

func (s *FinanceService) findGoalAction(ctx context.Context, workspaceID, goalID, key string) (*goalActionRecord, error) {
	filters := []repository.Filter{
		{"workspace_id": workspaceID, "goal_id": goalID, "idempotency_key": key},
		// A key is effect-bearing across goals too. The exact-goal lookup keeps
		// the existing unique-index path fast; this workspace lookup prevents a
		// caller from reusing one key for a different goal with a new transaction.
		{"workspace_id": workspaceID, "idempotency_key": key},
	}
	for _, filter := range filters {
		var record goalActionRecord
		if err := s.store.FindOne(ctx, "goal_action_idempotency", filter, &record); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				continue
			}
			return nil, err
		}
		return &record, nil
	}
	return nil, nil
}

// existingGoalActionResult makes retries idempotent before action-specific
// validation can reject an already-applied action (for example, a completed
// goal has no remaining amount on the second identical request).
func (s *FinanceService) existingGoalActionResult(
	ctx context.Context,
	workspaceID, actorID string,
	goal *model.Goal,
	key, fingerprint string,
) (*GoalActionResult, bool, error) {
	existing, err := s.findGoalAction(ctx, workspaceID, goal.ID, key)
	if err != nil {
		return nil, false, err
	}
	if existing == nil {
		return nil, false, nil
	}
	matches, err := s.goalActionFingerprintMatches(ctx, workspaceID, actorID, goal, existing, fingerprint)
	if err != nil {
		return nil, false, err
	}
	if !matches {
		return nil, false, ErrConflict
	}
	updated, err := s.GetGoal(ctx, workspaceID, actorID, goal.ID)
	if err != nil {
		return nil, false, err
	}
	result := &GoalActionResult{Goal: updated, Applied: false}
	if existing.TransactionID != "" {
		transaction, err := s.GetTransaction(ctx, workspaceID, actorID, existing.TransactionID)
		if err != nil {
			return nil, false, err
		}
		result.Transaction = transaction
	}
	return result, true, nil
}

func (s *FinanceService) goalActionFingerprintMatches(ctx context.Context, workspaceID, actorID string, goal *model.Goal, existing *goalActionRecord, fingerprint string) (bool, error) {
	if existing == nil || existing.Fingerprint == "" {
		return false, nil
	}
	if existing.Fingerprint == fingerprint {
		return true, nil
	}
	// Records written before the full-request fingerprint was introduced used
	// only action/amount/date/transaction ID. Reconstruct the canonical request
	// from the stored transaction when possible so legacy retries remain safe,
	// while any changed effect-bearing field still conflicts.
	if existing.Fingerprint != goalActionFingerprint(existing.Action, existing.AmountMinor, existing.OccurredAt, existing.TransactionID) {
		return false, nil
	}
	switch existing.Action {
	case "progress":
		return goalProgressFingerprint(goal.ID, existing.Action, existing.AmountMinor, existing.OccurredAt) == fingerprint, nil
	case "transaction", "linked_transaction":
		if existing.TransactionID == "" {
			return false, nil
		}
		transaction, err := s.GetTransaction(ctx, workspaceID, actorID, existing.TransactionID)
		if err != nil {
			return false, err
		}
		if existing.Action == "linked_transaction" {
			return goalLinkFingerprint(goal.ID, *transaction) == fingerprint, nil
		}
		input := TransactionInput{
			VaultID:              transaction.VaultID,
			AccountID:            transaction.AccountID,
			DestinationAccountID: transaction.DestinationAccountID,
			Type:                 transaction.Type,
			AmountMinor:          transaction.AmountMinor,
			Currency:             transaction.Currency,
			Category:             transaction.Category,
			Description:          transaction.Description,
			Notes:                transaction.Notes,
			ContactID:            transaction.ContactID,
			GoalID:               transaction.GoalID,
			Privacy:              transaction.Privacy,
			OccurredAt:           effectiveTransactionDate(*transaction),
		}
		return goalTransactionFingerprint(goal.ID, input, effectiveTransactionDate(*transaction)) == fingerprint, nil
	default:
		return false, nil
	}
}

func (s *FinanceService) RecordGoalProgress(ctx context.Context, workspaceID, actorID, goalID, idempotencyKey string, input GoalProgressInput) (*GoalActionResult, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageGoals); err != nil {
		return nil, err
	}
	key, err := normalizeGoalIdempotencyKey(idempotencyKey)
	if err != nil {
		return nil, err
	}
	if err := validateMoney("amountMinor", input.AmountMinor, false); err != nil {
		return nil, err
	}
	if input.OccurredAt.IsZero() {
		return nil, &FieldError{Field: "occurredAt", Message: "is required"}
	}
	goal, err := s.GetGoal(ctx, workspaceID, actorID, goalID)
	if err != nil {
		return nil, err
	}
	fingerprint := goalProgressFingerprint(goal.ID, "progress", input.AmountMinor, input.OccurredAt.UTC())
	return s.persistGoalProgress(ctx, workspaceID, actorID, goal, key, "progress", input.AmountMinor, input.OccurredAt.UTC(), "", fingerprint)
}

func (s *FinanceService) CreateGoalTransaction(ctx context.Context, workspaceID, actorID, goalID, idempotencyKey string, input GoalTransactionInput) (*GoalActionResult, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageGoals); err != nil {
		return nil, err
	}
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermCreateTransactions); err != nil {
		return nil, err
	}
	key, err := normalizeGoalIdempotencyKey(idempotencyKey)
	if err != nil {
		return nil, err
	}
	if err := validateMoney("amountMinor", input.AmountMinor, false); err != nil {
		return nil, err
	}
	if input.OccurredAt.IsZero() {
		return nil, &FieldError{Field: "occurredAt", Message: "is required"}
	}
	goal, err := s.GetGoal(ctx, workspaceID, actorID, goalID)
	if err != nil {
		return nil, err
	}
	transactionInput, err := normalizeGoalTransactionInput(*goal, input)
	if err != nil {
		return nil, err
	}
	if err := validateGoalTransactionType(*goal, transactionInput.Type); err != nil {
		return nil, err
	}
	if transactionInput.AccountID == "" {
		return nil, &FieldError{Field: "accountId", Message: "is required for a transaction-backed goal action"}
	}
	if transactionInput.Currency != goal.Currency {
		return nil, &FieldError{Field: "currency", Message: "must match the goal currency"}
	}
	fingerprint := goalTransactionFingerprint(goal.ID, transactionInput, transactionInput.OccurredAt)
	if result, found, err := s.existingGoalActionResult(ctx, workspaceID, actorID, goal, key, fingerprint); err != nil {
		return nil, err
	} else if found {
		return result, nil
	}
	if goal.Status == model.GoalStatusCancelled {
		return nil, &FieldError{Field: "goal", Message: "cancelled goals must be reopened before recording progress"}
	}
	if goal.RemainingMinor < input.AmountMinor {
		return nil, &FieldError{Field: "amountMinor", Message: "cannot exceed the goal's remaining amount"}
	}

	resultValue, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		transaction, err := s.CreateTransaction(transactionCtx, workspaceID, actorID, goalTransactionIdempotencyKey(goal.ID, key), transactionInput)
		if err != nil {
			return nil, err
		}
		result, err := s.persistGoalProgress(transactionCtx, workspaceID, actorID, goal, key, "transaction", input.AmountMinor, transactionInput.OccurredAt, transaction.ID, fingerprint)
		if err != nil {
			return nil, err
		}
		result.Transaction = transaction
		return result, nil
	})
	if err != nil {
		return nil, err
	}
	result, ok := resultValue.(*GoalActionResult)
	if !ok {
		return nil, errors.New("unexpected goal transaction result")
	}
	return result, nil
}

func normalizeGoalTransactionInput(goal model.Goal, input GoalTransactionInput) (TransactionInput, error) {
	transactionType := strings.ToLower(strings.TrimSpace(input.TransactionType))
	if transactionType == "" {
		transactionType = transactionTypeForGoal(goal)
	}
	currency, err := validCurrency(valueOrDefault(strings.TrimSpace(input.Currency), goal.Currency))
	if err != nil {
		return TransactionInput{}, err
	}
	category, err := validatedText("category", valueOrDefault(input.Category, goal.Category), 0, 100)
	if err != nil {
		return TransactionInput{}, err
	}
	notes, err := validatedText("notes", valueOrDefault(input.Notes, goal.Notes), 0, 2000)
	if err != nil {
		return TransactionInput{}, err
	}
	description, err := validatedText("description", input.Description, 0, 2000)
	if err != nil {
		return TransactionInput{}, err
	}
	privacy, err := validPrivacy(input.Privacy, "workspace")
	if err != nil {
		return TransactionInput{}, err
	}
	return TransactionInput{
		AccountID:            strings.TrimSpace(valueOrDefault(input.AccountID, goal.AccountID)),
		VaultID:              strings.TrimSpace(goal.VaultID),
		DestinationAccountID: strings.TrimSpace(input.DestinationAccountID),
		Type:                 transactionType,
		AmountMinor:          input.AmountMinor,
		Currency:             currency,
		Category:             category,
		Description:          description,
		Notes:                notes,
		ContactID:            strings.TrimSpace(valueOrDefault(input.ContactID, goal.ContactID)),
		GoalID:               goal.ID,
		Privacy:              privacy,
		OccurredAt:           input.OccurredAt.UTC(),
	}, nil
}

func transactionTypeForGoal(goal model.Goal) string {
	switch goal.Direction {
	case model.GoalDirectionReceive:
		return "income"
	case model.GoalDirectionPay:
		return "expense"
	case model.GoalDirectionSave:
		return "transfer"
	default:
		return "expense"
	}
}

func validateGoalTransactionType(goal model.Goal, transactionType string) error {
	switch goal.Direction {
	case model.GoalDirectionReceive:
		if transactionType != "income" && transactionType != "refund" && transactionType != "reimbursement" {
			return &FieldError{Field: "transactionType", Message: "receive goals require an income-like transaction"}
		}
	case model.GoalDirectionPay:
		if transactionType != "expense" {
			return &FieldError{Field: "transactionType", Message: "pay goals require an expense transaction"}
		}
	case model.GoalDirectionSave:
		if transactionType != "transfer" {
			return &FieldError{Field: "transactionType", Message: "save goals require a transfer transaction"}
		}
	case model.GoalDirectionNeutral:
		if transactionType != "expense" && transactionType != "income" && transactionType != "refund" && transactionType != "reimbursement" && transactionType != "transfer" && transactionType != "adjustment" {
			return &FieldError{Field: "transactionType", Message: "must be a supported transaction type"}
		}
	}
	return nil
}

func (s *FinanceService) persistGoalProgress(ctx context.Context, workspaceID, actorID string, goal *model.Goal, key, action string, amountMinor int64, occurredAt time.Time, transactionID, fingerprint string) (*GoalActionResult, error) {
	if existing, err := s.findGoalAction(ctx, workspaceID, goal.ID, key); err != nil {
		return nil, err
	} else if existing != nil {
		matches, matchErr := s.goalActionFingerprintMatches(ctx, workspaceID, actorID, goal, existing, fingerprint)
		if matchErr != nil {
			return nil, matchErr
		}
		if !matches {
			return nil, ErrConflict
		}
		updated, err := s.GetGoal(ctx, workspaceID, actorID, goal.ID)
		if err != nil {
			return nil, err
		}
		return &GoalActionResult{Goal: updated, Applied: false}, nil
	}
	now := time.Now().UTC()
	result, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		var current model.Goal
		if err := s.store.FindOne(transactionCtx, "goals", repository.Filter{"_id": goal.ID, "workspace_id": workspaceID}, &current); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		current.ApplyDerived(now)
		if current.Status == model.GoalStatusCancelled {
			return nil, &FieldError{Field: "goal", Message: "cancelled goals must be reopened before recording progress"}
		}
		nextCurrent, err := checkedAddMoney(current.CurrentMinor, amountMinor)
		if err != nil || nextCurrent > current.TargetMinor {
			return nil, &FieldError{Field: "amountMinor", Message: "cannot exceed the goal's remaining amount"}
		}
		entry := model.GoalHistoryEntry{Action: action, ActorID: actorID, AmountMinor: amountMinor, Date: &occurredAt, CreatedAt: now}
		set := repository.Filter{"current_minor": nextCurrent, "updated_at": now}
		if nextCurrent >= current.TargetMinor {
			set["completion_date"] = occurredAt
		}
		push := repository.Filter{"history": entry}
		if transactionID != "" {
			push["linked_transaction_ids"] = transactionID
		}
		var updated model.Goal
		if err := s.store.UpdateOne(transactionCtx, "goals", repository.Filter{
			"_id": goal.ID, "workspace_id": workspaceID, "current_minor": current.CurrentMinor,
		}, repository.Filter{
			"$set":  set,
			"$push": push,
		}, &updated); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrConflict
			}
			return nil, err
		}
		record := &goalActionRecord{
			ID: newID(), WorkspaceID: workspaceID, GoalID: goal.ID, IdempotencyKey: key,
			Action: action, AmountMinor: amountMinor, TransactionID: transactionID,
			OccurredAt: occurredAt, CreatedBy: actorID, CreatedAt: now, Fingerprint: fingerprint,
		}
		if err := s.store.Insert(transactionCtx, "goal_action_idempotency", record); err != nil {
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "goal.progressed", "goal", goal.ID, map[string]any{
			"action": action, "amountMinor": amountMinor, "transactionId": transactionID,
		}); err != nil {
			return nil, err
		}
		updated.ApplyDerived(now)
		return &updated, nil
	})
	if err != nil {
		if existing, lookupErr := s.findGoalAction(ctx, workspaceID, goal.ID, key); lookupErr == nil && existing != nil {
			matches, matchErr := s.goalActionFingerprintMatches(ctx, workspaceID, actorID, goal, existing, fingerprint)
			if matchErr != nil {
				return nil, matchErr
			}
			if !matches {
				return nil, ErrConflict
			}
			updated, goalErr := s.GetGoal(ctx, workspaceID, actorID, goal.ID)
			if goalErr != nil {
				return nil, goalErr
			}
			return &GoalActionResult{Goal: updated, Applied: false}, nil
		}
		return nil, err
	}
	updated, ok := result.(*model.Goal)
	if !ok {
		return nil, errors.New("unexpected goal progress result")
	}
	return &GoalActionResult{Goal: updated, Applied: true}, nil
}

func (s *FinanceService) LinkGoalTransaction(ctx context.Context, workspaceID, actorID, goalID, idempotencyKey string, input GoalLinkInput) (*GoalActionResult, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageGoals); err != nil {
		return nil, err
	}
	key, err := normalizeGoalIdempotencyKey(idempotencyKey)
	if err != nil {
		return nil, err
	}
	transactionID := strings.TrimSpace(input.TransactionID)
	if transactionID == "" {
		return nil, &FieldError{Field: "transactionId", Message: "is required"}
	}
	transaction, err := s.GetTransaction(ctx, workspaceID, actorID, transactionID)
	if err != nil {
		return nil, err
	}
	goal, err := s.GetGoal(ctx, workspaceID, actorID, goalID)
	if err != nil {
		return nil, err
	}
	effectiveDate := effectiveTransactionDate(*transaction)
	fingerprint := goalLinkFingerprint(goal.ID, *transaction)
	if result, found, err := s.existingGoalActionResult(ctx, workspaceID, actorID, goal, key, fingerprint); err != nil {
		return nil, err
	} else if found {
		return result, nil
	}
	if goal.Status == model.GoalStatusCancelled {
		return nil, &FieldError{Field: "goal", Message: "cancelled goals must be reopened before linking progress"}
	}
	if transaction.GoalID != "" && transaction.GoalID != goal.ID {
		return nil, &FieldError{Field: "transactionId", Message: "transaction is already linked to another goal"}
	}
	for _, linkedID := range goal.LinkedTransactionIDs {
		if linkedID == transaction.ID {
			return nil, &FieldError{Field: "transactionId", Message: "transaction is already linked to this goal"}
		}
	}
	if transaction.Currency != goal.Currency {
		return nil, &FieldError{Field: "transactionId", Message: "transaction currency must match the goal currency"}
	}
	if goal.VaultID != "" && transaction.VaultID != goal.VaultID {
		return nil, &FieldError{Field: "transactionId", Message: "transaction must belong to the goal vault"}
	}
	if goal.AccountID != "" && transaction.AccountID != goal.AccountID {
		return nil, &FieldError{Field: "transactionId", Message: "transaction must use the goal account"}
	}
	if goal.ContactID != "" && transaction.ContactID != "" && transaction.ContactID != goal.ContactID {
		return nil, &FieldError{Field: "transactionId", Message: "transaction must use the goal contact"}
	}
	if err := validateGoalTransactionType(*goal, transaction.Type); err != nil {
		return nil, err
	}
	if goal.RemainingMinor < transaction.AmountMinor {
		return nil, &FieldError{Field: "transactionId", Message: "transaction exceeds the goal's remaining amount"}
	}
	return s.persistGoalProgress(ctx, workspaceID, actorID, goal, key, "linked_transaction", transaction.AmountMinor, effectiveDate, transaction.ID, fingerprint)
}

func (s *FinanceService) CancelGoal(ctx context.Context, workspaceID, actorID, goalID string) (*model.Goal, error) {
	return s.setGoalCancellation(ctx, workspaceID, actorID, goalID, true)
}

func (s *FinanceService) ReopenGoal(ctx context.Context, workspaceID, actorID, goalID string) (*model.Goal, error) {
	return s.setGoalCancellation(ctx, workspaceID, actorID, goalID, false)
}

func (s *FinanceService) setGoalCancellation(ctx context.Context, workspaceID, actorID, goalID string, cancelled bool) (*model.Goal, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageGoals); err != nil {
		return nil, err
	}
	goal, err := s.GetGoal(ctx, workspaceID, actorID, goalID)
	if err != nil {
		return nil, err
	}
	if cancelled && goal.Status == model.GoalStatusCancelled {
		return goal, nil
	}
	if !cancelled && goal.Status != model.GoalStatusCancelled {
		return goal, nil
	}
	now := time.Now().UTC()
	set := repository.Filter{"updated_at": now}
	entry := model.GoalHistoryEntry{Action: "reopened", ActorID: actorID, CreatedAt: now}
	if cancelled {
		set["cancelled_at"], set["cancelled_by"] = now, actorID
		entry.Action = "cancelled"
	} else {
		set["cancelled_at"], set["cancelled_by"] = nil, ""
	}
	update := repository.Filter{"$set": set, "$push": repository.Filter{"history": entry}}
	var updated model.Goal
	if err := s.store.UpdateOne(ctx, "goals", repository.Filter{"_id": goal.ID, "workspace_id": workspaceID}, update, &updated); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	updated.ApplyDerived(now)
	if err := s.audit(ctx, workspaceID, actorID, "goal."+entry.Action, "goal", goal.ID, nil); err != nil {
		return nil, err
	}
	return &updated, nil
}

func (s *FinanceService) RescheduleGoal(ctx context.Context, workspaceID, actorID, goalID string, input GoalRescheduleInput) (*model.Goal, error) {
	if input.DueDate == nil {
		return nil, &FieldError{Field: "dueDate", Message: "is required"}
	}
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageGoals); err != nil {
		return nil, err
	}
	goal, err := s.GetGoal(ctx, workspaceID, actorID, goalID)
	if err != nil {
		return nil, err
	}
	if goal.StartDate != nil && input.DueDate.Before(*goal.StartDate) {
		return nil, &FieldError{Field: "dueDate", Message: "must be on or after startDate"}
	}
	now := time.Now().UTC()
	due := input.DueDate.UTC()
	var updated model.Goal
	if err := s.store.UpdateOne(ctx, "goals", repository.Filter{"_id": goal.ID, "workspace_id": workspaceID}, repository.Filter{"$set": repository.Filter{
		"due_date": due, "target_date": due, "updated_at": now,
	}}, &updated); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	updated.ApplyDerived(now)
	return &updated, s.audit(ctx, workspaceID, actorID, "goal.rescheduled", "goal", goal.ID, map[string]any{"dueDate": due})
}
