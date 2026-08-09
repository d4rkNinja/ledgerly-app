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

type deletionStore struct {
	workspace        model.Workspace
	memberships      map[string]model.Membership
	transactions     map[string]model.Transaction
	accounts         map[string]model.Account
	vaults           map[string]model.Vault
	workspaceRecords map[string]int
	audits           []model.AuditEvent
	deleted          []string
	updated          []string
	txRuns           int
}

func (s *deletionStore) Insert(_ context.Context, collection string, document any) error {
	switch collection {
	case "audit_events":
		s.audits = append(s.audits, *document.(*model.AuditEvent))
	case "workspaces":
		s.workspace = *document.(*model.Workspace)
	}
	return nil
}

func (s *deletionStore) FindOne(_ context.Context, collection string, filter repository.Filter, destination any) error {
	switch collection {
	case "workspaces":
		if filter["_id"] == s.workspace.ID {
			*destination.(*model.Workspace) = s.workspace
			return nil
		}
	case "memberships":
		workspaceID, _ := filter["workspace_id"].(string)
		userID, _ := filter["user_id"].(string)
		membership, ok := s.memberships[userID]
		if ok && membership.WorkspaceID == workspaceID {
			*destination.(*model.Membership) = membership
			return nil
		}
	case "transactions":
		transaction, ok := s.transactions[filter["_id"].(string)]
		if ok && transaction.WorkspaceID == filter["workspace_id"] {
			*destination.(*model.Transaction) = transaction
			return nil
		}
	case "accounts":
		account, ok := s.accounts[filter["_id"].(string)]
		if ok && account.WorkspaceID == filter["workspace_id"] {
			*destination.(*model.Account) = account
			return nil
		}
	case "vaults":
		vault, ok := s.vaults[filter["_id"].(string)]
		if ok && vault.WorkspaceID == filter["workspace_id"] {
			*destination.(*model.Vault) = vault
			return nil
		}
	}
	return repository.ErrNotFound
}

func (s *deletionStore) FindMany(_ context.Context, collection string, _ repository.Filter, destination any, _, _ int64, _ repository.Sort) error {
	switch collection {
	case "memberships":
		out := destination.(*[]model.Membership)
		for _, membership := range s.memberships {
			*out = append(*out, membership)
		}
	case "transactions":
		out := destination.(*[]model.Transaction)
		for _, transaction := range s.transactions {
			*out = append(*out, transaction)
		}
	}
	return nil
}

func (s *deletionStore) Aggregate(context.Context, string, repository.Pipeline, any) error {
	return nil
}

func (s *deletionStore) UpdateOne(_ context.Context, collection string, filter, update repository.Filter, destination any) error {
	id, _ := filter["_id"].(string)
	inc, _ := update["$inc"].(repository.Filter)
	delta, _ := inc["balance_minor"].(int64)
	s.updated = append(s.updated, collection+":"+id)
	switch collection {
	case "accounts":
		account, ok := s.accounts[id]
		if !ok || account.WorkspaceID != filter["workspace_id"] {
			return repository.ErrNotFound
		}
		account.BalanceMinor += delta
		s.accounts[id] = account
		*destination.(*model.Account) = account
		return nil
	case "vaults":
		vault, ok := s.vaults[id]
		if !ok || vault.WorkspaceID != filter["workspace_id"] {
			return repository.ErrNotFound
		}
		vault.BalanceMinor += delta
		s.vaults[id] = vault
		*destination.(*model.Vault) = vault
		return nil
	}
	return repository.ErrNotFound
}

func (s *deletionStore) UpdateMany(context.Context, string, repository.Filter, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *deletionStore) DeleteOne(_ context.Context, collection string, filter repository.Filter) error {
	s.deleted = append(s.deleted, collection)
	if collection == "transactions" {
		id, _ := filter["_id"].(string)
		if id != "" {
			if _, ok := s.transactions[id]; !ok {
				return repository.ErrNotFound
			}
			delete(s.transactions, id)
			return nil
		}
		if count := s.workspaceRecords[collection]; count > 0 {
			s.workspaceRecords[collection] = count - 1
			return nil
		}
		return repository.ErrNotFound
	}
	if collection == "workspaces" {
		if filter["_id"] != s.workspace.ID {
			return repository.ErrNotFound
		}
		s.workspace = model.Workspace{}
		return nil
	}
	if collection == "memberships" {
		workspaceID, _ := filter["workspace_id"].(string)
		for userID, membership := range s.memberships {
			if membership.WorkspaceID == workspaceID {
				delete(s.memberships, userID)
				return nil
			}
		}
		return repository.ErrNotFound
	}
	if count := s.workspaceRecords[collection]; count > 0 {
		s.workspaceRecords[collection] = count - 1
		return nil
	}
	return repository.ErrNotFound
}

func (s *deletionStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *deletionStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	s.txRuns++
	return fn(ctx)
}

func (s *deletionStore) CreateFinancialTransaction(context.Context, *model.Transaction, string, *time.Time, *model.AuditEvent) (*model.Transaction, error) {
	return nil, errors.New("unexpected financial transaction")
}

func newDeletionStore() *deletionStore {
	return &deletionStore{
		workspace: model.Workspace{ID: "workspace-a", OwnerID: "owner-a"},
		memberships: map[string]model.Membership{
			"owner-a": {WorkspaceID: "workspace-a", UserID: "owner-a", Role: "owner"},
		},
		transactions: map[string]model.Transaction{},
		accounts:     map[string]model.Account{},
		vaults:       map[string]model.Vault{},
		workspaceRecords: map[string]int{
			"vaults": 2, "accounts": 2, "transactions": 2, "budgets": 1,
			"recurring_transactions": 1, "goals": 1, "expense_claims": 1, "invitations": 1,
			"workspace_join_requests": 1, "notifications": 1, "audit_events": 1,
			"idempotency": 1,
		},
	}
}

func TestDeleteTransactionReversesExpenseBalancesAndAudits(t *testing.T) {
	store := newDeletionStore()
	store.accounts["account-a"] = model.Account{
		ID: "account-a", WorkspaceID: "workspace-a", VaultID: "vault-a", Currency: "INR", BalanceMinor: 875,
	}
	store.vaults["vault-a"] = model.Vault{
		ID: "vault-a", WorkspaceID: "workspace-a", Currency: "INR", BalanceMinor: 875,
	}
	store.transactions["transaction-a"] = model.Transaction{
		ID: "transaction-a", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
		CreatedBy: "owner-a", Type: "expense", AmountMinor: 125, Currency: "INR",
	}

	finance := NewFinanceService(store, NewAccessService(store))
	if err := finance.DeleteTransaction(context.Background(), "workspace-a", "owner-a", "transaction-a"); err != nil {
		t.Fatalf("DeleteTransaction: %v", err)
	}
	if _, ok := store.transactions["transaction-a"]; ok {
		t.Fatal("transaction still exists")
	}
	if got := store.accounts["account-a"].BalanceMinor; got != 1000 {
		t.Fatalf("account balance = %d, want 1000", got)
	}
	if got := store.vaults["vault-a"].BalanceMinor; got != 1000 {
		t.Fatalf("vault balance = %d, want 1000", got)
	}
	if len(store.audits) != 1 || store.audits[0].Action != "transaction.deleted" {
		t.Fatalf("audit events = %#v", store.audits)
	}
	if store.txRuns != 1 {
		t.Fatalf("transaction runs = %d, want 1", store.txRuns)
	}
}

func TestDeleteTransactionReversesBothSidesOfTransfer(t *testing.T) {
	store := newDeletionStore()
	store.accounts["source"] = model.Account{
		ID: "source", WorkspaceID: "workspace-a", VaultID: "vault-a", Currency: "INR", BalanceMinor: 900,
	}
	store.accounts["destination"] = model.Account{
		ID: "destination", WorkspaceID: "workspace-a", VaultID: "vault-b", Currency: "INR", BalanceMinor: 1100,
	}
	store.vaults["vault-a"] = model.Vault{ID: "vault-a", WorkspaceID: "workspace-a", Currency: "INR", BalanceMinor: 900}
	store.vaults["vault-b"] = model.Vault{ID: "vault-b", WorkspaceID: "workspace-a", Currency: "INR", BalanceMinor: 1100}
	store.transactions["transfer-a"] = model.Transaction{
		ID: "transfer-a", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "source",
		DestinationAccountID: "destination", CreatedBy: "owner-a", Type: "transfer", AmountMinor: 100, Currency: "INR",
	}

	finance := NewFinanceService(store, NewAccessService(store))
	if err := finance.DeleteTransaction(context.Background(), "workspace-a", "owner-a", "transfer-a"); err != nil {
		t.Fatalf("DeleteTransaction: %v", err)
	}
	if store.accounts["source"].BalanceMinor != 1000 || store.accounts["destination"].BalanceMinor != 1000 {
		t.Fatalf("account balances = %#v", store.accounts)
	}
	if store.vaults["vault-a"].BalanceMinor != 1000 || store.vaults["vault-b"].BalanceMinor != 1000 {
		t.Fatalf("vault balances = %#v", store.vaults)
	}
}

func TestDeleteTransactionDoesNotAllowMemberToDeleteAnotherUsersEntry(t *testing.T) {
	store := newDeletionStore()
	store.memberships["member-a"] = model.Membership{
		WorkspaceID: "workspace-a", UserID: "member-a", Role: "member",
	}
	store.accounts["account-a"] = model.Account{
		ID: "account-a", WorkspaceID: "workspace-a", VaultID: "vault-a", Currency: "INR", BalanceMinor: 875,
	}
	store.vaults["vault-a"] = model.Vault{ID: "vault-a", WorkspaceID: "workspace-a", Currency: "INR", BalanceMinor: 875}
	store.transactions["transaction-a"] = model.Transaction{
		ID: "transaction-a", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
		CreatedBy: "owner-a", Type: "expense", AmountMinor: 125, Currency: "INR",
	}

	finance := NewFinanceService(store, NewAccessService(store))
	if err := finance.DeleteTransaction(context.Background(), "workspace-a", "member-a", "transaction-a"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("DeleteTransaction error = %v, want forbidden", err)
	}
	if store.accounts["account-a"].BalanceMinor != 875 || store.vaults["vault-a"].BalanceMinor != 875 {
		t.Fatalf("balances changed after denied deletion: accounts=%#v vaults=%#v", store.accounts, store.vaults)
	}
	if len(store.audits) != 0 || len(store.deleted) != 0 {
		t.Fatalf("denied deletion mutated store: audits=%#v deleted=%#v", store.audits, store.deleted)
	}
}

func TestDeleteWorkspaceCascadesWorkspaceOwnedCollectionsForOwner(t *testing.T) {
	store := newDeletionStore()
	finance := NewFinanceService(store, NewAccessService(store))

	if err := finance.DeleteWorkspace(context.Background(), "workspace-a", "owner-a"); err != nil {
		t.Fatalf("DeleteWorkspace: %v", err)
	}
	if store.workspace.ID != "" {
		t.Fatalf("workspace = %#v, want deleted", store.workspace)
	}
	if len(store.memberships) != 0 {
		t.Fatalf("memberships remain: %#v", store.memberships)
	}
	for collection, count := range store.workspaceRecords {
		if count != 0 {
			t.Errorf("%s remaining records = %d, want 0", collection, count)
		}
	}
	if store.txRuns != 1 {
		t.Fatalf("transaction runs = %d, want 1", store.txRuns)
	}
}

func TestDeleteWorkspaceIsOwnerOnly(t *testing.T) {
	store := newDeletionStore()
	store.memberships["admin-a"] = model.Membership{
		WorkspaceID: "workspace-a", UserID: "admin-a", Role: "administrator",
	}
	finance := NewFinanceService(store, NewAccessService(store))

	if err := finance.DeleteWorkspace(context.Background(), "workspace-a", "admin-a"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("DeleteWorkspace error = %v, want forbidden", err)
	}
	if store.workspace.ID != "workspace-a" || len(store.deleted) != 0 {
		t.Fatalf("workspace deletion mutated store: workspace=%#v deleted=%#v", store.workspace, store.deleted)
	}
}

func TestDeletionStoreSatisfiesRepositoryContract(t *testing.T) {
	var _ repository.Store = (*deletionStore)(nil)
	if !reflect.DeepEqual([]string{"owner-a"}, []string{"owner-a"}) {
		t.Fatal("unreachable contract guard")
	}
}
