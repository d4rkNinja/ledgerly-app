package service

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type recordActionStore struct {
	workspace    model.Workspace
	memberships  map[string]model.Membership
	users        map[string]model.User
	vaults       map[string]model.Vault
	accounts     map[string]model.Account
	transactions map[string]model.Transaction
	budgets      map[string]model.Budget
	goals        map[string]model.Goal
	audits       []model.AuditEvent
	lastPipeline repository.Pipeline
	updated      []string
	deleted      []string
	txRuns       int
}

func (s *recordActionStore) Insert(_ context.Context, collection string, document any) error {
	if collection == "audit_events" {
		s.audits = append(s.audits, *document.(*model.AuditEvent))
		return nil
	}
	return nil
}

func (s *recordActionStore) FindOne(_ context.Context, collection string, filter repository.Filter, destination any) error {
	switch collection {
	case "workspaces":
		if item, ok := s.workspaceMatch(filter); ok {
			*destination.(*model.Workspace) = item
			return nil
		}
	case "memberships":
		workspaceID, _ := filter["workspace_id"].(string)
		userID, _ := filter["user_id"].(string)
		if item, ok := s.memberships[userID]; ok && item.WorkspaceID == workspaceID {
			*destination.(*model.Membership) = item
			return nil
		}
	case "users":
		id, _ := filter["_id"].(string)
		if item, ok := s.users[id]; ok {
			*destination.(*model.User) = item
			return nil
		}
	case "vaults":
		if item, ok := s.vaultMatch(filter); ok {
			*destination.(*model.Vault) = item
			return nil
		}
	case "accounts":
		if item, ok := s.accountMatch(filter); ok {
			*destination.(*model.Account) = item
			return nil
		}
	case "transactions":
		id, _ := filter["_id"].(string)
		if item, ok := s.transactions[id]; ok && recordWorkspaceMatch(item.WorkspaceID, filter) {
			*destination.(*model.Transaction) = item
			return nil
		}
	case "budgets":
		id, _ := filter["_id"].(string)
		if item, ok := s.budgets[id]; ok && recordWorkspaceMatch(item.WorkspaceID, filter) {
			*destination.(*model.Budget) = item
			return nil
		}
	case "goals":
		id, _ := filter["_id"].(string)
		if item, ok := s.goals[id]; ok && recordWorkspaceMatch(item.WorkspaceID, filter) {
			*destination.(*model.Goal) = item
			return nil
		}
	}
	return repository.ErrNotFound
}

func (s *recordActionStore) FindMany(_ context.Context, collection string, filter repository.Filter, destination any, _, _ int64, _ repository.Sort) error {
	switch collection {
	case "vaults":
		out := destination.(*[]model.Vault)
		for _, item := range s.vaults {
			if matchesVault(item, filter) {
				*out = append(*out, item)
			}
		}
	case "accounts":
		out := destination.(*[]model.Account)
		for _, item := range s.accounts {
			if matchesAccount(item, filter) {
				*out = append(*out, item)
			}
		}
	case "transactions":
		out := destination.(*[]model.Transaction)
		for _, item := range s.transactions {
			if matchesTransaction(item, filter) {
				*out = append(*out, item)
			}
		}
	case "users":
		out := destination.(*[]model.User)
		for _, item := range s.users {
			if matchesIDFilter(item.ID, filter["_id"]) {
				*out = append(*out, item)
			}
		}
	case "memberships":
		out := destination.(*[]model.Membership)
		workspaceID, _ := filter["workspace_id"].(string)
		for _, membership := range s.memberships {
			if membership.WorkspaceID == workspaceID && matchesIDFilter(membership.UserID, filter["user_id"]) {
				*out = append(*out, membership)
			}
		}
	case "budgets":
		out := destination.(*[]model.Budget)
		for _, item := range s.budgets {
			if recordWorkspaceMatch(item.WorkspaceID, filter) {
				*out = append(*out, item)
			}
		}
	case "goals":
		out := destination.(*[]model.Goal)
		for _, item := range s.goals {
			if recordWorkspaceMatch(item.WorkspaceID, filter) {
				*out = append(*out, item)
			}
		}
	}
	return nil
}

func (s *recordActionStore) Aggregate(_ context.Context, _ string, pipeline repository.Pipeline, destination any) error {
	s.lastPipeline = pipeline
	match := repository.Filter{}
	if len(pipeline) > 0 {
		match, _ = pipeline[0]["$match"].(repository.Filter)
	}
	totals := map[string]int64{}
	for _, transaction := range s.transactions {
		if !matchesTransaction(transaction, match) {
			continue
		}
		totals[transaction.Type] += transaction.AmountMinor
	}
	if output, ok := destination.(*[]transactionTypeTotal); ok {
		for kind, total := range totals {
			*output = append(*output, transactionTypeTotal{Type: kind, Total: total})
		}
	}
	return nil
}

func (s *recordActionStore) UpdateOne(_ context.Context, collection string, filter, update repository.Filter, destination any) error {
	set, _ := update["$set"].(repository.Filter)
	inc, _ := update["$inc"].(repository.Filter)
	switch collection {
	case "accounts":
		id, _ := filter["_id"].(string)
		item, ok := s.accounts[id]
		if !ok || !recordWorkspaceMatch(item.WorkspaceID, filter) {
			return repository.ErrNotFound
		}
		applyMoneyIncrement(&item.BalanceMinor, inc)
		applyAccountSet(&item, set)
		s.accounts[id] = item
		*destination.(*model.Account) = item
	case "vaults":
		id, _ := filter["_id"].(string)
		item, ok := s.vaults[id]
		if !ok || !recordWorkspaceMatch(item.WorkspaceID, filter) {
			return repository.ErrNotFound
		}
		applyMoneyIncrement(&item.BalanceMinor, inc)
		if updatedAt, ok := set["updated_at"].(time.Time); ok {
			item.UpdatedAt = updatedAt
		}
		s.vaults[id] = item
		*destination.(*model.Vault) = item
	case "transactions":
		id, _ := filter["_id"].(string)
		item, ok := s.transactions[id]
		if !ok || !recordWorkspaceMatch(item.WorkspaceID, filter) {
			return repository.ErrNotFound
		}
		applyTransactionSet(&item, set)
		s.transactions[id] = item
		*destination.(*model.Transaction) = item
	case "budgets":
		id, _ := filter["_id"].(string)
		item, ok := s.budgets[id]
		if !ok || !recordWorkspaceMatch(item.WorkspaceID, filter) {
			return repository.ErrNotFound
		}
		applyBudgetSet(&item, set)
		s.budgets[id] = item
		*destination.(*model.Budget) = item
	case "goals":
		id, _ := filter["_id"].(string)
		item, ok := s.goals[id]
		if !ok || !recordWorkspaceMatch(item.WorkspaceID, filter) {
			return repository.ErrNotFound
		}
		applyGoalSet(&item, set)
		s.goals[id] = item
		*destination.(*model.Goal) = item
	default:
		return repository.ErrNotFound
	}
	s.updated = append(s.updated, collection)
	return nil
}

func (s *recordActionStore) UpdateMany(context.Context, string, repository.Filter, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *recordActionStore) DeleteOne(_ context.Context, collection string, filter repository.Filter) error {
	id, _ := filter["_id"].(string)
	switch collection {
	case "transactions":
		if item, ok := s.transactions[id]; ok && recordWorkspaceMatch(item.WorkspaceID, filter) {
			delete(s.transactions, id)
			s.deleted = append(s.deleted, collection)
			return nil
		}
	case "budgets":
		if item, ok := s.budgets[id]; ok && recordWorkspaceMatch(item.WorkspaceID, filter) {
			delete(s.budgets, id)
			s.deleted = append(s.deleted, collection)
			return nil
		}
	case "goals":
		if item, ok := s.goals[id]; ok && recordWorkspaceMatch(item.WorkspaceID, filter) {
			delete(s.goals, id)
			s.deleted = append(s.deleted, collection)
			return nil
		}
	case "idempotency":
		return nil
	}
	return repository.ErrNotFound
}

func (s *recordActionStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *recordActionStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	s.txRuns++
	return fn(ctx)
}

func (s *recordActionStore) CreateFinancialTransaction(context.Context, *model.Transaction, string, *time.Time, *model.AuditEvent) (*model.Transaction, error) {
	return nil, errors.New("unexpected financial transaction")
}

func (s *recordActionStore) workspaceMatch(filter repository.Filter) (model.Workspace, bool) {
	id, _ := filter["_id"].(string)
	return s.workspace, id == s.workspace.ID
}

func (s *recordActionStore) vaultMatch(filter repository.Filter) (model.Vault, bool) {
	id, _ := filter["_id"].(string)
	item, ok := s.vaults[id]
	return item, ok && recordWorkspaceMatch(item.WorkspaceID, filter) && matchesArchived(item.Archived, filter)
}

func (s *recordActionStore) accountMatch(filter repository.Filter) (model.Account, bool) {
	id, _ := filter["_id"].(string)
	item, ok := s.accounts[id]
	return item, ok && recordWorkspaceMatch(item.WorkspaceID, filter) && matchesArchived(item.Archived, filter)
}

func recordWorkspaceMatch(workspaceID string, filter repository.Filter) bool {
	want, has := filter["workspace_id"].(string)
	return !has || want == workspaceID
}

func matchesArchived(archived bool, filter repository.Filter) bool {
	want, has := filter["archived"].(bool)
	return !has || want == archived
}

func matchesIDFilter(id string, raw any) bool {
	if raw == nil {
		return true
	}
	filter, ok := raw.(repository.Filter)
	if !ok {
		return raw == id
	}
	ids, _ := filter["$in"].([]string)
	for _, candidate := range ids {
		if candidate == id {
			return true
		}
	}
	return false
}

func matchesVault(item model.Vault, filter repository.Filter) bool {
	if !recordWorkspaceMatch(item.WorkspaceID, filter) || !matchesArchived(item.Archived, filter) {
		return false
	}
	if currency, ok := filter["currency"].(string); ok && item.Currency != currency {
		return false
	}
	if privacy, ok := filter["privacy"].(string); ok && item.Privacy != privacy {
		return false
	}
	return matchesIDFilter(item.ID, filter["_id"])
}

func matchesAccount(item model.Account, filter repository.Filter) bool {
	if !recordWorkspaceMatch(item.WorkspaceID, filter) || !matchesArchived(item.Archived, filter) {
		return false
	}
	if !matchesIDFilter(item.ID, filter["_id"]) || !matchesIDFilter(item.VaultID, filter["vault_id"]) {
		return false
	}
	return true
}

func matchesTransaction(item model.Transaction, filter repository.Filter) bool {
	if clauses, ok := filter["$and"].([]repository.Filter); ok {
		for _, clause := range clauses {
			if !matchesTransaction(item, clause) {
				return false
			}
		}
	}
	if clauses, ok := filter["$or"].([]repository.Filter); ok && len(clauses) > 0 {
		matched := false
		for _, clause := range clauses {
			if matchesTransaction(item, clause) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	if !recordWorkspaceMatch(item.WorkspaceID, filter) || !matchesIDFilter(item.AccountID, filter["account_id"]) || !matchesIDFilter(item.VaultID, filter["vault_id"]) {
		return false
	}
	if currency, ok := filter["currency"].(string); ok && item.Currency != currency {
		return false
	}
	if kind, ok := filter["type"].(string); ok && item.Type != kind {
		return false
	}
	if privacy, ok := filter["privacy"].(string); ok && item.Privacy != privacy {
		return false
	}
	if rawDate, hasDate := filter["occurred_at"]; hasDate {
		occurredAt := item.OccurredAt
		if occurredAt.IsZero() {
			occurredAt = item.CreatedAt
		}
		switch date := rawDate.(type) {
		case repository.Filter:
			if exists, ok := date["$exists"].(bool); ok && exists != !item.OccurredAt.IsZero() {
				return false
			}
			if from, ok := date["$gte"].(time.Time); ok && occurredAt.Before(from) {
				return false
			}
			if to, ok := date["$lt"].(time.Time); ok && !occurredAt.Before(to) {
				return false
			}
			if to, ok := date["$lte"].(time.Time); ok && occurredAt.After(to) {
				return false
			}
		case time.Time:
			if !item.OccurredAt.Equal(date) {
				return false
			}
		}
	}
	return true
}

func applyMoneyIncrement(value *int64, inc repository.Filter) {
	if delta, ok := inc["balance_minor"].(int64); ok {
		*value += delta
	}
}

func applyAccountSet(item *model.Account, set repository.Filter) {
	if value, ok := set["name"].(string); ok {
		item.Name = value
	}
	if value, ok := set["type"].(string); ok {
		item.Type = value
	}
	if value, ok := set["bank_name"].(string); ok {
		item.BankName = value
	}
	if value, ok := set["masked_identifier"].(string); ok {
		item.MaskedIdentifier = value
	}
	if value, ok := set["color"].(string); ok {
		item.Color = value
	}
	if value, ok := set["icon"].(string); ok {
		item.Icon = value
	}
	if value, ok := set["notes"].(string); ok {
		item.Notes = value
	}
	if value, ok := set["status"].(string); ok {
		item.Status = value
	}
	if value, ok := set["opening_minor"].(int64); ok {
		item.OpeningMinor = value
	}
	if value, ok := set["exclude_from_total"].(bool); ok {
		item.ExcludeFromTotal = value
	}
	if value, ok := set["privacy"].(string); ok {
		item.Privacy = value
	}
	if value, ok := set["archived"].(bool); ok {
		item.Archived = value
	}
	if value, ok := set["updated_at"].(time.Time); ok {
		item.UpdatedAt = value
	}
}

func applyTransactionSet(item *model.Transaction, set repository.Filter) {
	if value, ok := set["account_id"].(string); ok {
		item.AccountID = value
	}
	if value, ok := set["vault_id"].(string); ok {
		item.VaultID = value
	}
	if value, ok := set["destination_account_id"].(string); ok {
		item.DestinationAccountID = value
	}
	if value, ok := set["type"].(string); ok {
		item.Type = value
	}
	if value, ok := set["amount_minor"].(int64); ok {
		item.AmountMinor = value
	}
	if value, ok := set["currency"].(string); ok {
		item.Currency = value
	}
	if value, ok := set["category"].(string); ok {
		item.Category = value
	}
	if value, ok := set["merchant"].(string); ok {
		item.Merchant = value
	}
	if value, ok := set["notes"].(string); ok {
		item.Notes = value
	}
	if value, ok := set["tags"].([]string); ok {
		item.Tags = value
	}
	if value, ok := set["splits"].([]model.Split); ok {
		item.Splits = value
	}
	if value, ok := set["privacy"].(string); ok {
		item.Privacy = value
	}
	if value, ok := set["occurred_at"].(time.Time); ok {
		item.OccurredAt = value
	}
	if value, ok := set["updated_at"].(time.Time); ok {
		item.UpdatedAt = value
	}
}

func applyBudgetSet(item *model.Budget, set repository.Filter) {
	if value, ok := set["name"].(string); ok {
		item.Name = value
	}
	if value, ok := set["amount_minor"].(int64); ok {
		item.AmountMinor = value
	}
	if value, ok := set["period"].(string); ok {
		item.Period = value
	}
	if value, ok := set["categories"].([]string); ok {
		item.Categories = value
	}
	if value, ok := set["rollover"].(bool); ok {
		item.Rollover = value
	}
	if value, ok := set["start_at"].(time.Time); ok {
		item.StartAt = value
	}
	if value, ok := set["end_at"].(time.Time); ok {
		item.EndAt = value
	}
	if value, ok := set["updated_at"].(time.Time); ok {
		item.UpdatedAt = value
	}
}

func applyGoalSet(item *model.Goal, set repository.Filter) {
	if value, ok := set["name"].(string); ok {
		item.Name = value
	}
	if value, ok := set["target_minor"].(int64); ok {
		item.TargetMinor = value
	}
	if value, ok := set["current_minor"].(int64); ok {
		item.CurrentMinor = value
	}
	if value, ok := set["target_date"].(*time.Time); ok {
		item.TargetDate = value
	}
	if value, ok := set["visibility"].(string); ok {
		item.Visibility = value
	}
	if value, ok := set["updated_at"].(time.Time); ok {
		item.UpdatedAt = value
	}
}

func newRecordActionService() (*FinanceService, *recordActionStore) {
	store := &recordActionStore{
		workspace: model.Workspace{ID: "workspace-a", Currency: "INR", FinancialMonth: 1},
		memberships: map[string]model.Membership{
			"owner-a":  {WorkspaceID: "workspace-a", UserID: "owner-a", Role: "owner"},
			"member-a": {WorkspaceID: "workspace-a", UserID: "member-a", Role: "member"},
		},
		users: map[string]model.User{
			"owner-a":  {ID: "owner-a", Name: "Owner A"},
			"member-a": {ID: "member-a", Name: "Member A"},
		},
		vaults: map[string]model.Vault{
			"vault-a": {ID: "vault-a", WorkspaceID: "workspace-a", OwnerID: "owner-a", Currency: "INR", Privacy: "workspace"},
		},
		accounts: map[string]model.Account{
			"account-a": {ID: "account-a", WorkspaceID: "workspace-a", VaultID: "vault-a", OwnerID: "owner-a", Currency: "INR", BalanceMinor: 10_000, Privacy: "workspace"},
			"account-b": {ID: "account-b", WorkspaceID: "workspace-a", VaultID: "vault-a", OwnerID: "owner-a", Currency: "INR", BalanceMinor: 3_000, Privacy: "workspace"},
		},
		transactions: map[string]model.Transaction{},
		budgets:      map[string]model.Budget{},
		goals:        map[string]model.Goal{},
	}
	return NewFinanceService(store, NewAccessService(store)), store
}

func TestUpdateTransactionRebalancesChangedAccountsAndAudits(t *testing.T) {
	finance, store := newRecordActionService()
	store.vaults["vault-a"] = model.Vault{ID: "vault-a", WorkspaceID: "workspace-a", OwnerID: "owner-a", Currency: "INR", Privacy: "workspace", BalanceMinor: 13_000}
	store.transactions["transaction-a"] = model.Transaction{
		ID: "transaction-a", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
		CreatedBy: "owner-a", Type: "expense", AmountMinor: 1_000, Currency: "INR", Merchant: "Old shop",
		Privacy: "workspace", OccurredAt: time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC), CreatedAt: time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC),
	}

	updated, err := finance.UpdateTransaction(context.Background(), "workspace-a", "owner-a", "transaction-a", TransactionInput{
		AccountID: "account-b", Type: "expense", AmountMinor: 2_500, Currency: "INR", Merchant: "Groceries",
		OccurredAt: time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC), Privacy: "workspace",
	})
	if err != nil {
		t.Fatalf("UpdateTransaction: %v", err)
	}
	if updated.AccountID != "account-b" || updated.CreatedBy != "owner-a" || updated.ID != "transaction-a" {
		t.Fatalf("updated transaction identity = %#v", updated)
	}
	if got := store.accounts["account-a"].BalanceMinor; got != 11_000 {
		t.Fatalf("old account balance = %d, want 11000", got)
	}
	if got := store.accounts["account-b"].BalanceMinor; got != 500 {
		t.Fatalf("new account balance = %d, want 500", got)
	}
	if got := store.vaults["vault-a"].BalanceMinor; got != 11_500 {
		t.Fatalf("vault balance = %d, want 11500", got)
	}
	if len(store.audits) != 1 || store.audits[0].Action != "transaction.updated" {
		t.Fatalf("audits = %#v", store.audits)
	}
	if store.txRuns != 1 {
		t.Fatalf("transaction runs = %d, want 1", store.txRuns)
	}
}

func TestUpdateTransactionRejectsOtherUsersEntryWithoutEditAll(t *testing.T) {
	finance, store := newRecordActionService()
	store.transactions["transaction-a"] = model.Transaction{
		ID: "transaction-a", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
		CreatedBy: "owner-a", Type: "expense", AmountMinor: 1_000, Currency: "INR", Privacy: "workspace",
	}
	_, err := finance.UpdateTransaction(context.Background(), "workspace-a", "member-a", "transaction-a", TransactionInput{
		AccountID: "account-a", Type: "expense", AmountMinor: 2_000, Currency: "INR", Privacy: "workspace",
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("UpdateTransaction error = %v, want forbidden", err)
	}
	if len(store.updated) != 0 || len(store.audits) != 0 {
		t.Fatalf("denied update mutated store: updated=%#v audits=%#v", store.updated, store.audits)
	}
}

func TestUpdateTransactionPreservesOmittedTagsAndSplits(t *testing.T) {
	finance, store := newRecordActionService()
	store.transactions["transaction-a"] = model.Transaction{
		ID: "transaction-a", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
		CreatedBy: "owner-a", Type: "expense", AmountMinor: 1_000, Currency: "INR", Privacy: "workspace",
		Tags: []string{"household"}, Splits: []model.Split{{UserID: "owner-a", AmountMinor: 1_000}},
		OccurredAt: time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC),
	}

	updated, err := finance.UpdateTransaction(context.Background(), "workspace-a", "owner-a", "transaction-a", TransactionInput{
		AccountID: "account-a", Type: "expense", AmountMinor: 1_000, Currency: "INR", Merchant: "Updated shop",
		OccurredAt: time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC), Privacy: "workspace",
	})
	if err != nil {
		t.Fatalf("UpdateTransaction: %v", err)
	}
	if !reflect.DeepEqual(updated.Tags, []string{"household"}) {
		t.Fatalf("updated tags = %#v, want preserved tags", updated.Tags)
	}
	if !reflect.DeepEqual(updated.Splits, []model.Split{{UserID: "owner-a", AmountMinor: 1_000}}) {
		t.Fatalf("updated splits = %#v, want preserved splits", updated.Splits)
	}
}

func TestArchiveAccountPreservesHistoricalTransactions(t *testing.T) {
	finance, store := newRecordActionService()
	store.transactions["transaction-a"] = model.Transaction{ID: "transaction-a", WorkspaceID: "workspace-a", AccountID: "account-a", VaultID: "vault-a", Type: "expense", AmountMinor: 100, Currency: "INR", CreatedBy: "owner-a"}

	if err := finance.ArchiveAccount(context.Background(), "workspace-a", "owner-a", "account-a"); err != nil {
		t.Fatalf("ArchiveAccount: %v", err)
	}
	if !store.accounts["account-a"].Archived {
		t.Fatal("account was not archived")
	}
	if _, ok := store.transactions["transaction-a"]; !ok {
		t.Fatal("transaction history was removed")
	}
	if len(store.audits) != 1 || store.audits[0].Action != "account.archived" {
		t.Fatalf("audits = %#v", store.audits)
	}
}

func TestArchiveAccountKeepsHistoricalTransactionsVisible(t *testing.T) {
	finance, store := newRecordActionService()
	store.transactions["transaction-a"] = model.Transaction{
		ID: "transaction-a", WorkspaceID: "workspace-a", AccountID: "account-a", VaultID: "vault-a",
		Type: "expense", AmountMinor: 100, Currency: "INR", CreatedBy: "owner-a",
		OccurredAt: time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC),
	}

	if err := finance.ArchiveAccount(context.Background(), "workspace-a", "owner-a", "account-a"); err != nil {
		t.Fatalf("ArchiveAccount: %v", err)
	}
	transactions, err := finance.ListTransactions(context.Background(), "workspace-a", "owner-a", TransactionFilter{})
	if err != nil {
		t.Fatalf("ListTransactions: %v", err)
	}
	if len(transactions) != 1 || transactions[0].ID != "transaction-a" {
		t.Fatalf("historical transactions after archive = %#v, want transaction-a", transactions)
	}
}

func TestShareTransactionRequiresExportAndOmitsSensitiveFields(t *testing.T) {
	finance, store := newRecordActionService()
	store.transactions["transaction-a"] = model.Transaction{
		ID: "internal-transaction-id", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
		CreatedBy: "owner-a", Type: "expense", AmountMinor: 1_250, Currency: "INR", Category: "Food",
		Merchant: "Cafe https://private.example.test/receipt", Notes: "private note must not leave server", Privacy: "workspace",
		OccurredAt: time.Date(2026, 8, 3, 10, 30, 0, 0, time.UTC),
	}

	payload, err := finance.ShareTransaction(context.Background(), "workspace-a", "owner-a", "transaction-a")
	if err != nil {
		t.Fatalf("ShareTransaction: %v", err)
	}
	encoded, _ := json.Marshal(payload)
	text := string(encoded)
	for _, forbidden := range []string{"private note must not leave server", "internal-transaction-id", "workspace-a", "account-a", "https://"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("share payload leaked %q: %s", forbidden, text)
		}
	}
	if !strings.Contains(payload.Text, "Food") || !strings.Contains(payload.Text, "INR 12.50") {
		t.Fatalf("share payload omitted useful safe details: %#v", payload)
	}
	if len(store.audits) != 1 || store.audits[0].Action != "transaction.shared" {
		t.Fatalf("share audits = %#v", store.audits)
	}

	store.memberships["member-a"] = model.Membership{WorkspaceID: "workspace-a", UserID: "member-a", Role: "member"}
	_, err = finance.ShareTransaction(context.Background(), "workspace-a", "member-a", "transaction-a")
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("share without export permission = %v, want forbidden", err)
	}
}

func TestShareMoneyFormatsMinorUnits(t *testing.T) {
	tests := []struct {
		name        string
		currency    string
		amountMinor int64
		want        string
	}{
		{name: "whole amount", currency: "INR", amountMinor: 200_000, want: "INR 2,000"},
		{name: "fractional amount", currency: "INR", amountMinor: 1_250, want: "INR 12.50"},
		{name: "single minor unit", currency: "USD", amountMinor: 5, want: "USD 0.05"},
		{name: "negative amount", currency: "INR", amountMinor: -200_000, want: "-INR 2,000"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := shareMoney(test.currency, test.amountMinor); got != test.want {
				t.Fatalf("shareMoney(%q, %d) = %q, want %q", test.currency, test.amountMinor, got, test.want)
			}
		})
	}
}

func TestBudgetAndGoalActionsValidateAndRespectManagementPermissions(t *testing.T) {
	finance, store := newRecordActionService()
	store.budgets["budget-a"] = model.Budget{
		ID: "budget-a", WorkspaceID: "workspace-a", VaultID: "vault-a", Name: "Food", AmountMinor: 10_000,
		Currency: "INR", Period: "monthly", StartAt: time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), EndAt: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
	}
	store.goals["goal-a"] = model.Goal{
		ID: "goal-a", WorkspaceID: "workspace-a", VaultID: "vault-a", Name: "Emergency", TargetMinor: 50_000,
		CurrentMinor: 10_000, Currency: "INR", Visibility: "workspace", CreatedBy: "owner-a",
	}

	_, err := finance.UpdateBudget(context.Background(), "workspace-a", "owner-a", "budget-a", BudgetInput{
		Name: "Food", AmountMinor: 10_000, Currency: "INR", Period: "monthly",
		StartAt: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), EndAt: time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC),
	})
	var fieldErr *FieldError
	if !errors.As(err, &fieldErr) || fieldErr.Field != "endAt" {
		t.Fatalf("invalid budget update error = %v, want endAt validation", err)
	}
	if len(store.updated) != 0 {
		t.Fatalf("invalid budget update mutated store: %#v", store.updated)
	}

	if _, err := finance.UpdateBudget(context.Background(), "workspace-a", "owner-a", "budget-a", BudgetInput{
		Name: "Food", AmountMinor: 12_000, Currency: "INR", Period: "monthly",
		StartAt: time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), EndAt: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("valid budget update: %v", err)
	}
	if err := finance.DeleteGoal(context.Background(), "workspace-a", "owner-a", "goal-a"); err != nil {
		t.Fatalf("DeleteGoal: %v", err)
	}
	if _, ok := store.goals["goal-a"]; ok {
		t.Fatal("goal was not deleted")
	}
	if len(store.audits) != 2 || store.audits[0].Action != "budget.updated" || store.audits[1].Action != "goal.deleted" {
		t.Fatalf("planning audits = %#v", store.audits)
	}
}

func TestDashboardMonthOnlyCountsSelectedUTCMonth(t *testing.T) {
	finance, store := newRecordActionService()
	store.transactions["aug-income"] = model.Transaction{
		ID: "aug-income", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", CreatedBy: "owner-a",
		Type: "income", AmountMinor: 12_000, Currency: "INR", Privacy: "workspace", OccurredAt: time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC),
	}
	store.transactions["aug-expense"] = model.Transaction{
		ID: "aug-expense", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", CreatedBy: "owner-a",
		Type: "expense", AmountMinor: 3_500, Currency: "INR", Privacy: "workspace", OccurredAt: time.Date(2026, 8, 31, 23, 59, 59, 0, time.UTC),
	}
	store.transactions["sep-income"] = model.Transaction{
		ID: "sep-income", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", CreatedBy: "owner-a",
		Type: "income", AmountMinor: 99_000, Currency: "INR", Privacy: "workspace", OccurredAt: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
	}

	month := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	dashboard, err := finance.Dashboard(context.Background(), "workspace-a", "owner-a", DashboardFilter{Month: &month})
	if err != nil {
		t.Fatalf("Dashboard: %v", err)
	}
	if dashboard.IncomeMinor != 12_000 || dashboard.SpendingMinor != 3_500 {
		t.Fatalf("selected month totals = income %d spending %d", dashboard.IncomeMinor, dashboard.SpendingMinor)
	}
	if len(dashboard.Recent) != 2 {
		t.Fatalf("selected month recent count = %d, want 2", len(dashboard.Recent))
	}
	match, ok := store.lastPipeline[0]["$match"].(repository.Filter)
	if !ok {
		t.Fatalf("dashboard pipeline = %#v", store.lastPipeline)
	}
	dateFilter := nestedTransactionFilter(match, "occurred_at")
	date, ok := dateFilter["occurred_at"].(repository.Filter)
	if !ok || date["$gte"] != month || date["$lt"] != time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC) {
		t.Fatalf("dashboard UTC range = %#v", date)
	}
}
