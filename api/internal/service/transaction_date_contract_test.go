package service

import (
	"context"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

func TestCreateTransactionAcceptsExplicitPastAndFutureUTCDate(t *testing.T) {
	tests := []struct {
		name       string
		occurredAt time.Time
	}{
		{
			name:       "past date",
			occurredAt: time.Date(2020, time.February, 29, 0, 0, 0, 0, time.UTC),
		},
		{
			name:       "future date",
			occurredAt: time.Date(2035, time.January, 12, 0, 0, 0, 0, time.UTC),
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			finance, store := testFinance()
			created, err := finance.CreateTransaction(
				context.Background(),
				"workspace-a",
				"user-a",
				"transaction-date-"+test.name,
				TransactionInput{
					VaultID:     "vault-a",
					AccountID:   "account-a",
					Type:        "expense",
					AmountMinor: 1250,
					Currency:    "INR",
					OccurredAt:  test.occurredAt,
				},
			)
			if err != nil {
				t.Fatalf("CreateTransaction() error = %v", err)
			}
			if !created.OccurredAt.Equal(test.occurredAt) {
				t.Fatalf("occurredAt = %s, want %s", created.OccurredAt, test.occurredAt)
			}
			if created.OccurredAt.Location() != time.UTC {
				t.Fatalf("occurredAt location = %s, want UTC", created.OccurredAt.Location())
			}
			if store.requestTime == nil || !store.requestTime.Equal(test.occurredAt) {
				t.Fatalf("idempotency occurredAt = %#v, want %s", store.requestTime, test.occurredAt)
			}
		})
	}
}

func TestUpdateTransactionPreservesOmittedOccurredAt(t *testing.T) {
	finance, store := newRecordActionService()
	originalDate := time.Date(2026, time.August, 3, 0, 0, 0, 0, time.UTC)
	store.transactions["transaction-a"] = model.Transaction{
		ID: "transaction-a", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
		CreatedBy: "owner-a", Type: "expense", AmountMinor: 1000, Currency: "INR", Privacy: "workspace",
		OccurredAt: originalDate,
	}

	updated, err := finance.UpdateTransaction(context.Background(), "workspace-a", "owner-a", "transaction-a", TransactionInput{
		AccountID: "account-a", Type: "expense", AmountMinor: 1000, Currency: "INR", Privacy: "workspace",
	})
	if err != nil {
		t.Fatalf("UpdateTransaction() error = %v", err)
	}
	if !updated.OccurredAt.Equal(originalDate) {
		t.Fatalf("occurredAt = %s, want preserved %s", updated.OccurredAt, originalDate)
	}
}

func TestUpdateLegacyTransactionPreservesCreatedAtFallback(t *testing.T) {
	finance, store := newRecordActionService()
	created := time.Date(2026, time.August, 6, 12, 0, 0, 0, time.UTC)
	store.transactions["legacy-transaction"] = model.Transaction{
		ID: "legacy-transaction", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
		CreatedBy: "owner-a", Type: "expense", AmountMinor: 1000, Currency: "INR", Privacy: "workspace",
		CreatedAt: created,
	}

	updated, err := finance.UpdateTransaction(context.Background(), "workspace-a", "owner-a", "legacy-transaction", TransactionInput{
		AccountID: "account-a", Type: "expense", AmountMinor: 1000, Currency: "INR", Privacy: "workspace",
		Category: "Updated category",
	})
	if err != nil {
		t.Fatalf("UpdateTransaction() error = %v", err)
	}
	if !updated.OccurredAt.IsZero() {
		t.Fatalf("legacy occurredAt = %s, want zero field preserved", updated.OccurredAt)
	}
	if got := effectiveTransactionDate(*updated); !got.Equal(created) {
		t.Fatalf("legacy effective date = %s, want createdAt fallback %s", got, created)
	}
}
