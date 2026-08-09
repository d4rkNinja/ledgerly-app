package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type seedCaptureStore struct {
	accounts       map[string]model.Account
	vaults         map[string]model.Vault
	transactions   []model.Transaction
	conflictInsert bool
	openingUpdates map[string]int64
}

func (s *seedCaptureStore) Insert(_ context.Context, collection string, document any) error {
	if s.conflictInsert {
		return repository.ErrConflict
	}
	switch collection {
	case "accounts":
		account := *document.(*model.Account)
		s.accounts[account.ID] = account
	case "vaults":
		vault := *document.(*model.Vault)
		s.vaults[vault.ID] = vault
	case "transactions":
		transaction := *document.(*model.Transaction)
		s.transactions = append(s.transactions, transaction)
	}
	return nil
}

func (s *seedCaptureStore) FindOne(context.Context, string, repository.Filter, any) error {
	return repository.ErrNotFound
}

func (s *seedCaptureStore) FindMany(context.Context, string, repository.Filter, any, int64, int64, repository.Sort) error {
	return nil
}

func (s *seedCaptureStore) Aggregate(context.Context, string, repository.Pipeline, any) error {
	return nil
}

func (s *seedCaptureStore) UpdateOne(
	_ context.Context,
	collection string,
	filter,
	update repository.Filter,
	_ any,
) error {
	if collection != "accounts" && collection != "vaults" {
		return nil
	}
	set, _ := update["$set"].(repository.Filter)
	openingMinor, ok := set["opening_minor"].(int64)
	if !ok {
		return nil
	}
	if s.openingUpdates == nil {
		s.openingUpdates = make(map[string]int64)
	}
	id, _ := filter["_id"].(string)
	s.openingUpdates[collection+"/"+id] = openingMinor
	return nil
}

func (s *seedCaptureStore) UpdateMany(context.Context, string, repository.Filter, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *seedCaptureStore) DeleteOne(context.Context, string, repository.Filter) error {
	return repository.ErrNotFound
}

func (s *seedCaptureStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *seedCaptureStore) WithTransaction(context.Context, repository.TransactionFunc) (any, error) {
	return nil, errors.New("seed must not require a transaction")
}

func (s *seedCaptureStore) CreateFinancialTransaction(
	context.Context,
	*model.Transaction,
	string,
	*time.Time,
	*model.AuditEvent,
) (*model.Transaction, error) {
	return nil, errors.New("seed must use deterministic raw records")
}

func TestSeedBalancesReconcileWithSeededLedger(t *testing.T) {
	store := &seedCaptureStore{
		accounts: make(map[string]model.Account),
		vaults:   make(map[string]model.Vault),
	}
	if err := SeedDevelopment(context.Background(), store); err != nil {
		t.Fatalf("SeedDevelopment: %v", err)
	}

	accountDeltas := make(map[string]int64)
	vaultDeltas := make(map[string]int64)
	for _, transaction := range store.transactions {
		delta := transaction.AmountMinor
		switch transaction.Type {
		case "expense", "transfer":
			delta = -delta
		case "income", "refund", "reimbursement":
		default:
			t.Fatalf("seed transaction %q has unsupported type %q", transaction.ID, transaction.Type)
		}
		accountDeltas[transaction.AccountID] += delta
		vaultDeltas[transaction.VaultID] += delta
	}
	for _, account := range store.accounts {
		want := account.OpeningMinor + accountDeltas[account.ID]
		if account.BalanceMinor != want {
			t.Errorf(
				"account %q balance = %d, want opening %d + ledger delta %d = %d",
				account.ID,
				account.BalanceMinor,
				account.OpeningMinor,
				accountDeltas[account.ID],
				want,
			)
		}
	}
	for _, vault := range store.vaults {
		want := vault.OpeningMinor + vaultDeltas[vault.ID]
		if vault.BalanceMinor != want {
			t.Errorf(
				"vault %q balance = %d, want opening %d + ledger delta %d = %d",
				vault.ID,
				vault.BalanceMinor,
				vault.OpeningMinor,
				vaultDeltas[vault.ID],
				want,
			)
		}
	}
}

func TestSeedRerunUpgradesOpeningBalancesAfterInsertConflicts(t *testing.T) {
	store := &seedCaptureStore{conflictInsert: true}
	if err := SeedDevelopment(context.Background(), store); err != nil {
		t.Fatalf("SeedDevelopment conflict rerun: %v", err)
	}

	want := map[string]int64{
		"vaults/dev-vault-private":       3824500,
		"vaults/dev-vault-household":     1009600,
		"vaults/dev-vault-emergency":     5720000,
		"vaults/dev-vault-travel":        1780000,
		"vaults/dev-vault-petty":         415900,
		"vaults/dev-vault-project":       1396225,
		"accounts/dev-account-bank":      3824500,
		"accounts/dev-account-family":    1009600,
		"accounts/dev-account-emergency": 5720000,
		"accounts/dev-account-travel":    1780000,
		"accounts/dev-account-cash":      415900,
		"accounts/dev-account-project":   1396225,
	}
	if len(store.openingUpdates) != len(want) {
		t.Fatalf("opening-balance updates = %d, want %d: %#v", len(store.openingUpdates), len(want), store.openingUpdates)
	}
	for key, wantOpening := range want {
		if got := store.openingUpdates[key]; got != wantOpening {
			t.Errorf("%s opening = %d, want %d", key, got, wantOpening)
		}
	}
}
