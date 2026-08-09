package service

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type replayingFinanceStore struct {
	*financeStore
	committed       *model.Transaction
	request         model.Transaction
	idempotencyKey  string
	requestTimes    []*time.Time
	attemptedIDs    []string
	transactionCall int
}

func (s *replayingFinanceStore) CreateFinancialTransaction(
	_ context.Context,
	transaction *model.Transaction,
	idempotencyKey string,
	requestOccurredAt *time.Time,
	_ *model.AuditEvent,
) (*model.Transaction, error) {
	s.transactionCall++
	s.requestTimes = append(s.requestTimes, requestOccurredAt)
	s.attemptedIDs = append(s.attemptedIDs, transaction.ID)
	if s.committed == nil {
		committed := *transaction
		s.committed = &committed
		s.request = idempotencyRequest(transaction, requestOccurredAt)
		s.idempotencyKey = idempotencyKey
		return &committed, nil
	}
	if idempotencyKey != s.idempotencyKey ||
		!reflect.DeepEqual(
			idempotencyRequest(transaction, requestOccurredAt),
			s.request,
		) {
		return nil, repository.ErrConflict
	}
	replayed := *s.committed
	return &replayed, nil
}

func idempotencyRequest(
	transaction *model.Transaction,
	requestOccurredAt *time.Time,
) model.Transaction {
	request := *transaction
	request.ID = ""
	request.CreatedAt = time.Time{}
	request.UpdatedAt = time.Time{}
	if requestOccurredAt == nil {
		request.OccurredAt = time.Time{}
	} else {
		request.OccurredAt = requestOccurredAt.UTC()
	}
	return request
}

func TestCreateTransactionIdempotentRetryReturnsCommittedResponseWhenOccurredAtOmitted(t *testing.T) {
	_, baseStore := testFinance()
	store := &replayingFinanceStore{financeStore: baseStore}
	finance := NewFinanceService(store, NewAccessService(store))
	input := TransactionInput{
		VaultID:     "vault-a",
		AccountID:   "account-a",
		Type:        "expense",
		AmountMinor: 1299,
		Currency:    "INR",
		Category:    "Food",
		Merchant:    "Cafe",
		Notes:       "Lunch",
	}

	first, err := finance.CreateTransaction(
		context.Background(),
		"workspace-a",
		"user-a",
		"request-1234",
		input,
	)
	if err != nil {
		t.Fatalf("first CreateTransaction() error = %v", err)
	}
	retry, err := finance.CreateTransaction(
		context.Background(),
		"workspace-a",
		"user-a",
		"request-1234",
		input,
	)
	if err != nil {
		t.Fatalf("retry CreateTransaction() error = %v", err)
	}

	if store.transactionCall != 2 {
		t.Fatalf("repository calls = %d, want 2", store.transactionCall)
	}
	if len(store.requestTimes) != 2 ||
		store.requestTimes[0] != nil ||
		store.requestTimes[1] != nil {
		t.Fatalf("request occurredAt values = %#v, want two omitted values", store.requestTimes)
	}
	if len(store.attemptedIDs) != 2 ||
		store.attemptedIDs[0] == store.attemptedIDs[1] {
		t.Fatalf("generated attempt IDs = %#v, want distinct IDs", store.attemptedIDs)
	}
	if retry.ID != first.ID ||
		!retry.OccurredAt.Equal(first.OccurredAt) ||
		!retry.CreatedAt.Equal(first.CreatedAt) {
		t.Fatalf("retry response = %#v, want first committed response %#v", retry, first)
	}

	changed := input
	changed.Notes = "Dinner"
	if _, err := finance.CreateTransaction(
		context.Background(),
		"workspace-a",
		"user-a",
		"request-1234",
		changed,
	); !errors.Is(err, repository.ErrConflict) {
		t.Fatalf("changed retry error = %v, want conflict", err)
	}
}

func TestAuditRequiresExplicitPermissionBeforeTenantQuery(t *testing.T) {
	tests := []struct {
		name        string
		role        string
		permissions []string
		wantErr     error
		wantQuery   bool
	}{
		{
			name:      "viewer is denied",
			role:      "viewer",
			wantErr:   ErrForbidden,
			wantQuery: false,
		},
		{
			name:        "custom audit permission is honored",
			role:        "viewer",
			permissions: []string{model.PermViewAudit},
			wantQuery:   true,
		},
		{
			name:      "finance manager role is allowed",
			role:      "finance_manager",
			wantQuery: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			finance, store := testFinance()
			store.membership.Role = test.role
			store.membership.Permissions = test.permissions

			events, err := finance.Audit(
				context.Background(),
				"workspace-a",
				"user-a",
				30,
				0,
			)
			if test.wantErr != nil {
				if !errors.Is(err, test.wantErr) {
					t.Fatalf("Audit() error = %v, want %v", err, test.wantErr)
				}
			} else if err != nil {
				t.Fatalf("Audit() error = %v", err)
			}

			filter, queried := store.filters["audit_events"]
			if queried != test.wantQuery {
				t.Fatalf("audit query executed = %v, want %v; filter = %#v", queried, test.wantQuery, filter)
			}
			if !test.wantQuery {
				if events != nil {
					t.Fatalf("denied audit result = %#v, want nil", events)
				}
				return
			}
			wantFilter := repository.Filter{"workspace_id": "workspace-a"}
			if !reflect.DeepEqual(filter, wantFilter) {
				t.Fatalf("audit filter = %#v, want %#v", filter, wantFilter)
			}
		})
	}
}

func TestTransactionQueryKeepsTenantAndPrivateScopesConjunctive(t *testing.T) {
	vaultIDs := []string{"workspace-vault", "owned-private-vault"}
	accountIDs := []string{"workspace-account", "owned-private-account"}

	filter, empty, err := transactionQueryForScope(
		"workspace-a",
		"user-a",
		TransactionFilter{},
		vaultIDs,
		accountIDs,
	)
	if err != nil {
		t.Fatalf("transactionQueryForScope() error = %v", err)
	}
	if empty {
		t.Fatal("transactionQueryForScope() unexpectedly returned an empty scope")
	}
	want := repository.Filter{
		"workspace_id": "workspace-a",
		"vault_id":     repository.Filter{"$in": vaultIDs},
		"account_id":   repository.Filter{"$in": accountIDs},
		"$or": []repository.Filter{
			{"privacy": "workspace"},
			{"created_by": "user-a"},
		},
	}
	if !reflect.DeepEqual(filter, want) {
		t.Fatalf("transaction filter = %#v, want %#v", filter, want)
	}

	_, _, err = transactionQueryForScope(
		"workspace-a",
		"user-a",
		TransactionFilter{VaultID: "another-users-private-vault"},
		vaultIDs,
		accountIDs,
	)
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("private vault filter error = %v, want forbidden", err)
	}

	_, _, err = transactionQueryForScope(
		"workspace-a",
		"user-a",
		TransactionFilter{AccountID: "another-users-private-account"},
		vaultIDs,
		accountIDs,
	)
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("private account filter error = %v, want forbidden", err)
	}
}
