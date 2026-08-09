package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

func TestGoalActionIdempotencyKeysAreBoundedAndStable(t *testing.T) {
	if _, err := normalizeGoalIdempotencyKey("short"); !errors.Is(err, ErrValidation) {
		t.Fatalf("short idempotency key error = %v, want validation", err)
	}
	key := "goal-action-key-123"
	if got, err := normalizeGoalIdempotencyKey(key); err != nil || got != key {
		t.Fatalf("normalizeGoalIdempotencyKey() = %q, %v", got, err)
	}
	first := goalTransactionIdempotencyKey("goal-a", key)
	if len(first) > 128 {
		t.Fatalf("derived transaction idempotency key length = %d, want <= 128", len(first))
	}
	if first != goalTransactionIdempotencyKey("goal-a", key) {
		t.Fatal("derived transaction idempotency key was not stable")
	}
	if first == goalTransactionIdempotencyKey("goal-b", key) {
		t.Fatal("different goals shared a derived transaction idempotency key")
	}
}

func TestGoalActionFingerprintsDistinguishRetriesFromConflicts(t *testing.T) {
	date := time.Date(2026, time.July, 15, 0, 0, 0, 0, time.UTC)
	first := goalActionFingerprint("transaction", 1250, date, "transaction-a")
	if first != goalActionFingerprint("transaction", 1250, date, "transaction-a") {
		t.Fatal("identical goal action fingerprints differed")
	}
	for name, other := range map[string]string{
		"amount":      goalActionFingerprint("transaction", 1251, date, "transaction-a"),
		"date":        goalActionFingerprint("transaction", 1250, date.AddDate(0, 0, 1), "transaction-a"),
		"transaction": goalActionFingerprint("transaction", 1250, date, "transaction-b"),
		"action":      goalActionFingerprint("progress", 1250, date, "transaction-a"),
	} {
		if first == other {
			t.Errorf("fingerprint collision for %s", name)
		}
	}
}

func TestGoalTransactionDirectionValidation(t *testing.T) {
	tests := []struct {
		name      string
		direction string
		kind      string
		wantError bool
	}{
		{name: "receive income", direction: model.GoalDirectionReceive, kind: "income"},
		{name: "receive expense", direction: model.GoalDirectionReceive, kind: "expense", wantError: true},
		{name: "pay expense", direction: model.GoalDirectionPay, kind: "expense"},
		{name: "save transfer", direction: model.GoalDirectionSave, kind: "transfer"},
		{name: "save income", direction: model.GoalDirectionSave, kind: "income", wantError: true},
		{name: "neutral refund", direction: model.GoalDirectionNeutral, kind: "refund"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateGoalTransactionType(model.Goal{Direction: test.direction}, test.kind)
			if (err != nil) != test.wantError {
				t.Fatalf("validateGoalTransactionType() error = %v, wantError %t", err, test.wantError)
			}
		})
	}
}

func TestGoalTransactionFingerprintCoversEveryEffectField(t *testing.T) {
	date := time.Date(2026, time.July, 15, 0, 0, 0, 0, time.UTC)
	base := TransactionInput{
		VaultID: "vault-a", AccountID: "account-a", DestinationAccountID: "account-b",
		Type: "expense", AmountMinor: 1250, Currency: "INR", Category: "Utilities",
		Description: "July bill", Notes: "scheduled", ContactID: "contact-a", Privacy: "workspace",
	}
	first := goalTransactionFingerprint("goal-a", base, date)
	if first != goalTransactionFingerprint("goal-a", base, date) {
		t.Fatal("same canonical goal transaction payload did not produce the same fingerprint")
	}
	variants := map[string]func(*TransactionInput){
		"amount":      func(input *TransactionInput) { input.AmountMinor++ },
		"occurredAt":  func(input *TransactionInput) {},
		"account":     func(input *TransactionInput) { input.AccountID = "account-c" },
		"destination": func(input *TransactionInput) { input.DestinationAccountID = "account-d" },
		"type":        func(input *TransactionInput) { input.Type = "income" },
		"category":    func(input *TransactionInput) { input.Category = "Travel" },
		"description": func(input *TransactionInput) { input.Description = "changed" },
		"notes":       func(input *TransactionInput) { input.Notes = "changed" },
		"contact":     func(input *TransactionInput) { input.ContactID = "contact-b" },
		"currency":    func(input *TransactionInput) { input.Currency = "USD" },
		"privacy":     func(input *TransactionInput) { input.Privacy = "private" },
		"goal":        func(input *TransactionInput) { input.GoalID = "goal-b" },
	}
	for name, mutate := range variants {
		t.Run(name, func(t *testing.T) {
			candidate := base
			mutate(&candidate)
			candidateDate := date
			if name == "occurredAt" {
				candidateDate = date.AddDate(0, 0, 1)
			}
			goalID := "goal-a"
			if name == "goal" {
				goalID = "goal-b"
			}
			if goalTransactionFingerprint(goalID, candidate, candidateDate) == first {
				t.Fatalf("changed %s payload reused the original fingerprint", name)
			}
		})
	}
}

func TestGoalLinkFingerprintCoversStoredTransactionEffect(t *testing.T) {
	transaction := model.Transaction{
		ID: "transaction-a", VaultID: "vault-a", AccountID: "account-a", DestinationAccountID: "account-b",
		Type: "expense", AmountMinor: 1250, Currency: "INR", Category: "Utilities", Description: "July bill",
		Notes: "scheduled", ContactID: "contact-a", Privacy: "workspace", OccurredAt: time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC),
	}
	first := goalLinkFingerprint("goal-a", transaction)
	transaction.AmountMinor++
	if goalLinkFingerprint("goal-a", transaction) == first {
		t.Fatal("changed linked transaction amount reused the original fingerprint")
	}
}

type goalAtomicTestStore struct {
	*financeStore
	goal             model.Goal
	action           *goalActionRecord
	transaction      *model.Transaction
	financialKey     string
	transactionCount int
	auditCount       int
	outerRuns        int
	inTransaction    bool
	failGoalAction   bool
}

func newGoalAtomicTestStore(failGoalAction bool) *goalAtomicTestStore {
	baseFinance, baseStore := testFinance()
	_ = baseFinance
	baseStore.membership.Role = "owner"
	dueDate := time.Now().UTC().AddDate(0, 0, 30)
	return &goalAtomicTestStore{
		financeStore: baseStore,
		goal: model.Goal{
			ID: "goal-a", WorkspaceID: "workspace-a", VaultID: "vault-a", Name: "Utilities",
			Type: model.GoalTypeBillPayment, Direction: model.GoalDirectionPay,
			TargetMinor: 2000, Currency: "INR", Visibility: "workspace", CreatedBy: "user-a",
			AccountID: "account-a", Category: "Utilities", DueDate: &dueDate,
		},
		failGoalAction: failGoalAction,
	}
}

func (s *goalAtomicTestStore) FindOne(ctx context.Context, collection string, filter repository.Filter, destination any) error {
	switch collection {
	case "goals":
		if filter["_id"] != s.goal.ID || filter["workspace_id"] != s.goal.WorkspaceID {
			return repository.ErrNotFound
		}
		*destination.(*model.Goal) = s.goal
		return nil
	case "goal_action_idempotency":
		if s.action == nil || filter["idempotency_key"] != s.action.IdempotencyKey {
			return repository.ErrNotFound
		}
		if goalID, hasGoal := filter["goal_id"]; hasGoal && goalID != s.action.GoalID {
			return repository.ErrNotFound
		}
		*destination.(*goalActionRecord) = *s.action
		return nil
	case "transactions":
		if s.transaction == nil || filter["_id"] != s.transaction.ID {
			return repository.ErrNotFound
		}
		*destination.(*model.Transaction) = *s.transaction
		return nil
	default:
		return s.financeStore.FindOne(ctx, collection, filter, destination)
	}
}

func (s *goalAtomicTestStore) UpdateOne(ctx context.Context, collection string, filter repository.Filter, update repository.Filter, destination any) error {
	if collection != "goals" {
		return s.financeStore.UpdateOne(ctx, collection, filter, update, destination)
	}
	if filter["_id"] != s.goal.ID || filter["workspace_id"] != s.goal.WorkspaceID || filter["current_minor"] != s.goal.CurrentMinor {
		return repository.ErrNotFound
	}
	set, _ := update["$set"].(repository.Filter)
	if value, ok := set["current_minor"].(int64); ok {
		s.goal.CurrentMinor = value
	}
	if value, ok := set["updated_at"].(time.Time); ok {
		s.goal.UpdatedAt = value
	}
	if value, ok := set["completion_date"].(time.Time); ok {
		s.goal.CompletionDate = &value
	}
	if push, ok := update["$push"].(repository.Filter); ok {
		if entry, ok := push["history"].(model.GoalHistoryEntry); ok {
			s.goal.History = append(s.goal.History, entry)
		}
		if transactionID, ok := push["linked_transaction_ids"].(string); ok {
			s.goal.LinkedTransactionIDs = append(s.goal.LinkedTransactionIDs, transactionID)
		}
	}
	*s.destinationGoal(destination) = s.goal
	return nil
}

func (s *goalAtomicTestStore) destinationGoal(destination any) *model.Goal {
	return destination.(*model.Goal)
}

func (s *goalAtomicTestStore) Insert(ctx context.Context, collection string, document any) error {
	switch collection {
	case "goal_action_idempotency":
		if s.failGoalAction {
			return errors.New("goal action write failed")
		}
		record := *(document.(*goalActionRecord))
		s.action = &record
		return nil
	case "audit_events":
		s.auditCount++
		return nil
	default:
		return s.financeStore.Insert(ctx, collection, document)
	}
}

func (s *goalAtomicTestStore) CreateFinancialTransaction(_ context.Context, transaction *model.Transaction, key string, _ *time.Time, _ *model.AuditEvent) (*model.Transaction, error) {
	if s.transaction != nil && s.financialKey == key {
		return s.transaction, nil
	}
	s.transactionCount++
	s.financialKey = key
	copy := *transaction
	s.transaction = &copy
	return &copy, nil
}

func (s *goalAtomicTestStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	if s.inTransaction {
		return fn(ctx)
	}
	s.outerRuns++
	goalSnapshot := s.goal
	var actionSnapshot *goalActionRecord
	if s.action != nil {
		copy := *s.action
		actionSnapshot = &copy
	}
	var transactionSnapshot *model.Transaction
	if s.transaction != nil {
		copy := *s.transaction
		transactionSnapshot = &copy
	}
	financialKey, transactionCount, auditCount := s.financialKey, s.transactionCount, s.auditCount
	s.inTransaction = true
	result, err := fn(ctx)
	s.inTransaction = false
	if err != nil {
		s.goal = goalSnapshot
		s.action = actionSnapshot
		s.transaction = transactionSnapshot
		s.financialKey = financialKey
		s.transactionCount = transactionCount
		s.auditCount = auditCount
	}
	return result, err
}

func TestCreateGoalTransactionUsesOneAtomicOuterTransactionAndIsIdempotent(t *testing.T) {
	store := newGoalAtomicTestStore(false)
	finance := NewFinanceService(store, NewAccessService(store))
	input := GoalTransactionInput{AmountMinor: 1000, OccurredAt: time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC), Description: "July bill"}
	first, err := finance.CreateGoalTransaction(context.Background(), "workspace-a", "user-a", "goal-a", "goal-action-1234", input)
	if err != nil {
		t.Fatalf("first goal transaction = %v", err)
	}
	if !first.Applied || first.Transaction == nil || store.outerRuns != 1 || store.transactionCount != 1 || store.action == nil || store.goal.CurrentMinor != 1000 {
		t.Fatalf("first completion state = result=%#v outer=%d transactions=%d action=%#v goal=%#v", first, store.outerRuns, store.transactionCount, store.action, store.goal)
	}
	second, err := finance.CreateGoalTransaction(context.Background(), "workspace-a", "user-a", "goal-a", "goal-action-1234", input)
	if err != nil {
		t.Fatalf("same-key retry = %v", err)
	}
	if second.Applied || second.Transaction == nil || store.outerRuns != 1 || store.transactionCount != 1 || store.goal.CurrentMinor != 1000 {
		t.Fatalf("retry was not idempotent = result=%#v outer=%d transactions=%d goal=%#v", second, store.outerRuns, store.transactionCount, store.goal)
	}
	changed := input
	changed.AmountMinor = 1100
	if _, err := finance.CreateGoalTransaction(context.Background(), "workspace-a", "user-a", "goal-a", "goal-action-1234", changed); !errors.Is(err, ErrConflict) {
		t.Fatalf("changed same-key request error = %v, want conflict", err)
	}
	if store.transactionCount != 1 || store.goal.CurrentMinor != 1000 {
		t.Fatalf("changed retry mutated committed state: transactions=%d goal=%#v", store.transactionCount, store.goal)
	}
}

func TestCreateGoalTransactionRollsBackFinancialAndGoalWritesOnFailure(t *testing.T) {
	store := newGoalAtomicTestStore(true)
	finance := NewFinanceService(store, NewAccessService(store))
	_, err := finance.CreateGoalTransaction(context.Background(), "workspace-a", "user-a", "goal-a", "goal-action-fail", GoalTransactionInput{
		AmountMinor: 1000, OccurredAt: time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC), Description: "July bill",
	})
	if err == nil {
		t.Fatal("failed goal action returned nil error")
	}
	if store.transaction != nil || store.transactionCount != 0 || store.action != nil || store.goal.CurrentMinor != 0 || len(store.goal.History) != 0 || store.auditCount != 0 {
		t.Fatalf("failed completion left partial state: transaction=%#v count=%d action=%#v goal=%#v audits=%d", store.transaction, store.transactionCount, store.action, store.goal, store.auditCount)
	}
	if store.outerRuns != 1 {
		t.Fatalf("failed completion used %d outer transactions, want one", store.outerRuns)
	}
}
