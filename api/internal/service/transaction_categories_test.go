package service

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"sort"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type transactionCategoryStore struct {
	memberships  map[string]model.Membership
	workspaces   map[string]model.Workspace
	vaults       map[string]model.Vault
	accounts     map[string]model.Account
	categories   map[string]model.TransactionCategory
	transactions map[string]model.Transaction
	audits       []model.AuditEvent
	seeded       map[string]time.Time
}

func newTransactionCategoryStore() *transactionCategoryStore {
	return &transactionCategoryStore{
		memberships: map[string]model.Membership{
			"workspace-a:owner-a":  {ID: "membership-a", WorkspaceID: "workspace-a", UserID: "owner-a", Role: "owner"},
			"workspace-a:viewer-a": {ID: "membership-viewer", WorkspaceID: "workspace-a", UserID: "viewer-a", Role: "viewer"},
			"workspace-b:owner-b":  {ID: "membership-b", WorkspaceID: "workspace-b", UserID: "owner-b", Role: "owner"},
		},
		workspaces: map[string]model.Workspace{
			"workspace-a": {ID: "workspace-a"},
			"workspace-b": {ID: "workspace-b"},
		},
		vaults: map[string]model.Vault{
			"": {ID: "", WorkspaceID: "workspace-a", Privacy: "workspace"},
		},
		accounts: map[string]model.Account{
			"": {ID: "", WorkspaceID: "workspace-a", VaultID: "", Privacy: "workspace"},
		},
		categories:   make(map[string]model.TransactionCategory),
		transactions: make(map[string]model.Transaction),
		seeded:       make(map[string]time.Time),
	}
}

func newTransactionCategoryService(store *transactionCategoryStore) *FinanceService {
	return NewFinanceService(store, NewAccessService(store))
}

func (s *transactionCategoryStore) Insert(_ context.Context, collection string, document any) error {
	switch collection {
	case transactionCategoriesCollection:
		category := *document.(*model.TransactionCategory)
		for _, existing := range s.categories {
			if existing.WorkspaceID == category.WorkspaceID &&
				existing.TransactionType == category.TransactionType &&
				existing.NormalizedName == category.NormalizedName {
				return repository.ErrConflict
			}
		}
		s.categories[category.ID] = category
		return nil
	case transactionCategorySeeds:
		marker := document.(*transactionCategorySeedState)
		if _, exists := s.seeded[marker.WorkspaceID]; exists {
			return repository.ErrConflict
		}
		s.seeded[marker.WorkspaceID] = marker.SeededAt
		return nil
	case "audit_events":
		s.audits = append(s.audits, *document.(*model.AuditEvent))
		return nil
	default:
		return errors.New("unexpected insert collection: " + collection)
	}
}

func (s *transactionCategoryStore) FindOne(_ context.Context, collection string, filter repository.Filter, destination any) error {
	switch collection {
	case "memberships":
		workspaceID, _ := filter["workspace_id"].(string)
		userID, _ := filter["user_id"].(string)
		membership, exists := s.memberships[workspaceID+":"+userID]
		if !exists {
			return repository.ErrNotFound
		}
		*destination.(*model.Membership) = membership
		return nil
	case transactionCategorySeeds:
		workspaceID, _ := filter["_id"].(string)
		seededAt, exists := s.seeded[workspaceID]
		if !exists {
			return repository.ErrNotFound
		}
		*destination.(*transactionCategorySeedState) = transactionCategorySeedState{WorkspaceID: workspaceID, SeededAt: seededAt}
		return nil
	case transactionCategoriesCollection:
		for _, category := range s.categories {
			if transactionCategoryMatches(category, filter) {
				*destination.(*model.TransactionCategory) = category
				return nil
			}
		}
		return repository.ErrNotFound
	case "workspaces":
		workspace, exists := s.workspaces[filter["_id"].(string)]
		if !exists {
			return repository.ErrNotFound
		}
		*destination.(*model.Workspace) = workspace
		return nil
	default:
		return repository.ErrNotFound
	}
}

func (s *transactionCategoryStore) FindMany(_ context.Context, collection string, filter repository.Filter, destination any, limit, _ int64, _ repository.Sort) error {
	switch collection {
	case transactionCategoriesCollection:
		items := destination.(*[]model.TransactionCategory)
		for _, category := range s.categories {
			if transactionCategoryMatches(category, filter) {
				*items = append(*items, category)
			}
		}
	case "transactions":
		items := destination.(*[]model.Transaction)
		for _, transaction := range s.transactions {
			if transactionMatchesCategoryFilter(transaction, filter) {
				*items = append(*items, transaction)
				if limit > 0 && int64(len(*items)) >= limit {
					break
				}
			}
		}
	case "vaults":
		items := destination.(*[]model.Vault)
		for _, vault := range s.vaults {
			if matchesVault(vault, filter) {
				*items = append(*items, vault)
			}
		}
	case "accounts":
		items := destination.(*[]model.Account)
		for _, account := range s.accounts {
			if matchesAccount(account, filter) {
				*items = append(*items, account)
			}
		}
	default:
		return errors.New("unexpected find-many collection: " + collection)
	}
	return nil
}

func (s *transactionCategoryStore) Aggregate(context.Context, string, repository.Pipeline, any) error {
	return errors.New("unexpected aggregate")
}

func (s *transactionCategoryStore) UpdateOne(_ context.Context, collection string, filter, update repository.Filter, destination any) error {
	if collection == "workspaces" {
		workspace, exists := s.workspaces[filter["_id"].(string)]
		if !exists {
			return repository.ErrNotFound
		}
		inc, _ := update["$inc"].(repository.Filter)
		workspace.LedgerVersion += inc["ledger_version"].(int64)
		s.workspaces[workspace.ID] = workspace
		*destination.(*model.Workspace) = workspace
		return nil
	}
	if collection != transactionCategoriesCollection {
		return errors.New("unexpected update-one collection: " + collection)
	}
	var category model.TransactionCategory
	found := false
	for _, candidate := range s.categories {
		if transactionCategoryMatches(candidate, filter) {
			category = candidate
			found = true
			break
		}
	}
	if !found {
		return repository.ErrNotFound
	}
	set, _ := update["$set"].(repository.Filter)
	if value, ok := set["name"].(string); ok {
		category.Name = value
	}
	if value, ok := set["normalized_name"].(string); ok {
		for _, existing := range s.categories {
			if existing.ID != category.ID && existing.WorkspaceID == category.WorkspaceID &&
				existing.TransactionType == category.TransactionType && existing.NormalizedName == value {
				return repository.ErrConflict
			}
		}
		category.NormalizedName = value
	}
	if value, ok := set["description"].(string); ok {
		category.Description = value
	}
	if value, ok := set["icon"].(string); ok {
		category.Icon = value
	}
	if value, ok := set["color"].(string); ok {
		category.Color = value
	}
	if value, ok := set["is_active"].(bool); ok {
		category.IsActive = value
	}
	if value, ok := set["sort_order"].(int); ok {
		category.SortOrder = value
	}
	if value, ok := set["updated_at"].(time.Time); ok {
		category.UpdatedAt = value
	}
	s.categories[category.ID] = category
	*destination.(*model.TransactionCategory) = category
	return nil
}

func (s *transactionCategoryStore) UpdateMany(_ context.Context, collection string, filter, update repository.Filter) (int64, error) {
	if collection != "transactions" {
		return 0, errors.New("unexpected update-many collection: " + collection)
	}
	set, _ := update["$set"].(repository.Filter)
	category, _ := set["category"].(string)
	updatedAt, _ := set["updated_at"].(time.Time)
	var count int64
	for id, transaction := range s.transactions {
		if transactionMatchesCategoryFilter(transaction, filter) {
			transaction.Category = category
			transaction.UpdatedAt = updatedAt
			s.transactions[id] = transaction
			count++
		}
	}
	return count, nil
}

func (s *transactionCategoryStore) DeleteOne(_ context.Context, collection string, filter repository.Filter) error {
	if collection != transactionCategoriesCollection {
		return errors.New("unexpected delete collection: " + collection)
	}
	for id, category := range s.categories {
		if transactionCategoryMatches(category, filter) {
			delete(s.categories, id)
			return nil
		}
	}
	return repository.ErrNotFound
}

func (s *transactionCategoryStore) Count(_ context.Context, collection string, filter repository.Filter) (int64, error) {
	var count int64
	switch collection {
	case transactionCategoriesCollection:
		for _, category := range s.categories {
			if transactionCategoryMatches(category, filter) {
				count++
			}
		}
	case "transactions":
		for _, transaction := range s.transactions {
			if transactionMatchesCategoryFilter(transaction, filter) {
				count++
			}
		}
	default:
		return 0, errors.New("unexpected count collection: " + collection)
	}
	return count, nil
}

func (s *transactionCategoryStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	return fn(ctx)
}

func (s *transactionCategoryStore) CreateFinancialTransaction(context.Context, *model.Transaction, string, *time.Time, *model.AuditEvent) (*model.Transaction, error) {
	return nil, errors.New("unexpected financial transaction")
}

func transactionCategoryMatches(category model.TransactionCategory, filter repository.Filter) bool {
	if value, ok := filter["_id"].(string); ok && category.ID != value {
		return false
	}
	if value, ok := filter["workspace_id"].(string); ok && category.WorkspaceID != value {
		return false
	}
	if value, ok := filter["transaction_type"].(string); ok && category.TransactionType != value {
		return false
	}
	if value, ok := filter["normalized_name"].(string); ok && category.NormalizedName != value {
		return false
	}
	return true
}

func transactionMatchesCategoryFilter(transaction model.Transaction, filter repository.Filter) bool {
	if clauses, ok := filter["$or"].([]repository.Filter); ok && len(clauses) > 0 {
		matched := false
		for _, clause := range clauses {
			if transactionMatchesCategoryFilter(transaction, clause) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	if value, ok := filter["workspace_id"].(string); ok && transaction.WorkspaceID != value {
		return false
	}
	if !matchesIDFilter(transaction.VaultID, filter["vault_id"]) || !matchesIDFilter(transaction.AccountID, filter["account_id"]) {
		return false
	}
	if value, ok := filter["privacy"].(string); ok && transaction.Privacy != value && !(value == "workspace" && transaction.Privacy == "") {
		return false
	}
	if value, ok := filter["created_by"].(string); ok && transaction.CreatedBy != value {
		return false
	}
	if criterion, ok := filter["category"].(repository.Filter); ok {
		pattern, _ := criterion["$regex"].(string)
		if options, _ := criterion["$options"].(string); options == "i" {
			pattern = "(?i)" + pattern
		}
		matched, err := regexp.MatchString(pattern, transaction.Category)
		if err != nil || !matched {
			return false
		}
		if value, ok := criterion["$ne"].(string); ok && transaction.Category == value {
			return false
		}
	}
	if criterion, ok := filter["splits.0"].(repository.Filter); ok {
		exists, _ := criterion["$exists"].(bool)
		if exists != (len(transaction.Splits) > 0) {
			return false
		}
	}
	switch criterion := filter["type"].(type) {
	case string:
		if transaction.Type != criterion {
			return false
		}
	case repository.Filter:
		values, _ := criterion["$in"].([]string)
		matched := false
		for _, value := range values {
			if transaction.Type == value {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

func categoryByName(t *testing.T, categories []model.TransactionCategory, transactionType, name string) model.TransactionCategory {
	t.Helper()
	for _, category := range categories {
		if category.TransactionType == transactionType && category.Name == name {
			return category
		}
	}
	t.Fatalf("category %s/%s not found", transactionType, name)
	return model.TransactionCategory{}
}

func categoryBoolPointer(value bool) *bool       { return &value }
func categoryStringPointer(value string) *string { return &value }

func TestTransactionCategorySeedAndListAllTypes(t *testing.T) {
	store := newTransactionCategoryStore()
	service := newTransactionCategoryService(store)

	items, err := service.ListTransactionCategories(context.Background(), "workspace-a", "owner-a", "")
	if err != nil {
		t.Fatalf("ListTransactionCategories: %v", err)
	}
	if len(items) != len(transactionCategoryDefaults) {
		t.Fatalf("seeded categories = %d, want %d", len(items), len(transactionCategoryDefaults))
	}
	seenTypes := map[string]bool{}
	for _, item := range items {
		seenTypes[item.TransactionType] = true
		if !item.IsActive {
			t.Fatalf("default category %q is inactive", item.Name)
		}
	}
	for _, transactionType := range []string{"expense", "income", "transfer", "split"} {
		if !seenTypes[transactionType] {
			t.Errorf("missing defaults for %q", transactionType)
		}
		filtered, err := service.ListTransactionCategories(context.Background(), "workspace-a", "owner-a", transactionType)
		if err != nil {
			t.Fatalf("filtered list %s: %v", transactionType, err)
		}
		for _, item := range filtered {
			if item.TransactionType != transactionType {
				t.Errorf("filtered %s list contains %s", transactionType, item.TransactionType)
			}
		}
	}

	again, err := service.ListTransactionCategories(context.Background(), "workspace-a", "owner-a", "")
	if err != nil {
		t.Fatalf("second list: %v", err)
	}
	if len(again) != len(items) {
		t.Fatalf("idempotent seed produced %d rows, want %d", len(again), len(items))
	}
	workspaceB, err := service.ListTransactionCategories(context.Background(), "workspace-b", "owner-b", "")
	if err != nil {
		t.Fatalf("workspace B list: %v", err)
	}
	if len(workspaceB) != len(items) {
		t.Fatalf("workspace B defaults = %d, want %d", len(workspaceB), len(items))
	}
	for _, item := range workspaceB {
		if item.WorkspaceID != "workspace-b" {
			t.Fatalf("workspace B response leaked workspace %q", item.WorkspaceID)
		}
	}
}

func TestTransactionCategoryCRUDDuplicateToggleAndIsolation(t *testing.T) {
	store := newTransactionCategoryStore()
	service := newTransactionCategoryService(store)
	ctx := context.Background()

	created, err := service.CreateTransactionCategory(ctx, "workspace-a", "owner-a", TransactionCategoryCreateInput{
		TransactionType: "expense", Name: "Pet Care", Description: "Animal costs", Icon: "paw-print", Color: "#ABCDEF",
	})
	if err != nil {
		t.Fatalf("CreateTransactionCategory: %v", err)
	}
	if created.Color != "#abcdef" || !created.IsActive {
		t.Fatalf("created category = %#v", created)
	}
	_, err = service.CreateTransactionCategory(ctx, "workspace-a", "owner-a", TransactionCategoryCreateInput{
		TransactionType: "expense", Name: "  pet   care ",
	})
	var duplicate *TransactionCategoryDuplicateError
	if !errors.As(err, &duplicate) || !errors.Is(err, ErrConflict) {
		t.Fatalf("case-insensitive duplicate error = %v", err)
	}

	updated, err := service.UpdateTransactionCategory(ctx, "workspace-a", "owner-a", created.ID, TransactionCategoryUpdateInput{
		Name: categoryStringPointer("Pets"), Description: categoryStringPointer(""), IsActive: categoryBoolPointer(false),
	})
	if err != nil {
		t.Fatalf("UpdateTransactionCategory: %v", err)
	}
	if updated.Name != "Pets" || updated.Description != "" || updated.IsActive {
		t.Fatalf("updated category = %#v", updated)
	}
	updated, err = service.UpdateTransactionCategory(ctx, "workspace-a", "owner-a", created.ID, TransactionCategoryUpdateInput{IsActive: categoryBoolPointer(true)})
	if err != nil || !updated.IsActive {
		t.Fatalf("enable category = %#v, %v", updated, err)
	}

	if _, err := service.CreateTransactionCategory(ctx, "workspace-a", "owner-a", TransactionCategoryCreateInput{TransactionType: "income", Name: "Pets"}); err != nil {
		t.Fatalf("same name in another type: %v", err)
	}
	if _, err := service.CreateTransactionCategory(ctx, "workspace-b", "owner-b", TransactionCategoryCreateInput{TransactionType: "expense", Name: "Pets"}); err != nil {
		t.Fatalf("same name in another workspace: %v", err)
	}
	if err := service.DeleteTransactionCategory(ctx, "workspace-a", "owner-a", created.ID, ""); err != nil {
		t.Fatalf("delete unused category: %v", err)
	}
	if _, exists := store.categories[created.ID]; exists {
		t.Fatal("unused category was not deleted")
	}
}

func TestTransactionCategoryPermissionsSeparateListingFromManagement(t *testing.T) {
	store := newTransactionCategoryStore()
	service := newTransactionCategoryService(store)
	ctx := context.Background()
	if _, err := service.ListTransactionCategories(ctx, "workspace-a", "viewer-a", "expense"); err != nil {
		t.Fatalf("viewer list: %v", err)
	}
	_, err := service.CreateTransactionCategory(ctx, "workspace-a", "viewer-a", TransactionCategoryCreateInput{
		TransactionType: "expense", Name: "Viewer category",
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer create error = %v, want forbidden", err)
	}
}

func TestTransactionCategoryUsageScopesAllFourTypes(t *testing.T) {
	store := newTransactionCategoryStore()
	service := newTransactionCategoryService(store)
	ctx := context.Background()
	all, err := service.ListTransactionCategories(ctx, "workspace-a", "owner-a", "")
	if err != nil {
		t.Fatalf("seed categories: %v", err)
	}
	tests := []struct {
		transactionType string
		name            string
		transaction     model.Transaction
	}{
		{"expense", "General", model.Transaction{ID: "expense", WorkspaceID: "workspace-a", Type: "adjustment", Category: "general"}},
		{"income", "Salary", model.Transaction{ID: "income", WorkspaceID: "workspace-a", Type: "refund", Category: "Salary"}},
		{"transfer", "Transfer", model.Transaction{ID: "transfer", WorkspaceID: "workspace-a", Type: "transfer", Category: "Transfer"}},
		{"split", "Split expense", model.Transaction{ID: "split", WorkspaceID: "workspace-a", Type: "expense", Category: "Split expense", Splits: []model.Split{{UserID: "member-a", AmountMinor: 1}}}},
	}
	for _, test := range tests {
		store.transactions[test.transaction.ID] = test.transaction
		category := categoryByName(t, all, test.transactionType, test.name)
		items, err := service.ListTransactionCategories(ctx, "workspace-a", "owner-a", test.transactionType)
		if err != nil {
			t.Fatalf("list %s: %v", test.transactionType, err)
		}
		if got := categoryByName(t, items, test.transactionType, test.name).UsageCount; got != 1 {
			t.Errorf("%s usage count = %d, want 1", test.transactionType, got)
		}
		err = service.DeleteTransactionCategory(ctx, "workspace-a", "owner-a", category.ID, "")
		var inUse *TransactionCategoryInUseError
		if !errors.As(err, &inUse) || inUse.UsageCount != 1 || !inUse.UsageCountExact {
			t.Errorf("%s delete conflict = %v", test.transactionType, err)
		}
	}
}

func TestTransactionCategoryReplacementAndRenameAreModeScoped(t *testing.T) {
	store := newTransactionCategoryStore()
	service := newTransactionCategoryService(store)
	ctx := context.Background()
	all, err := service.ListTransactionCategories(ctx, "workspace-a", "owner-a", "")
	if err != nil {
		t.Fatalf("seed categories: %v", err)
	}
	groceries := categoryByName(t, all, "expense", "Groceries")
	general := categoryByName(t, all, "expense", "General")
	salary := categoryByName(t, all, "income", "Salary")
	store.transactions["expense"] = model.Transaction{ID: "expense", WorkspaceID: "workspace-a", Type: "expense", Category: "groceries"}
	store.transactions["income-same-label"] = model.Transaction{ID: "income-same-label", WorkspaceID: "workspace-a", Type: "income", Category: "Groceries"}
	store.transactions["other-workspace"] = model.Transaction{ID: "other-workspace", WorkspaceID: "workspace-b", Type: "expense", Category: "Groceries"}

	if err := service.DeleteTransactionCategory(ctx, "workspace-a", "owner-a", groceries.ID, general.ID); err != nil {
		t.Fatalf("delete with replacement: %v", err)
	}
	if got := store.transactions["expense"].Category; got != "General" {
		t.Errorf("expense replacement = %q, want General", got)
	}
	if got := store.transactions["income-same-label"].Category; got != "Groceries" {
		t.Errorf("income snapshot changed to %q", got)
	}
	if got := store.transactions["other-workspace"].Category; got != "Groceries" {
		t.Errorf("other workspace snapshot changed to %q", got)
	}
	if store.transactions["expense"].UpdatedAt.IsZero() {
		t.Fatal("replacement did not update transaction timestamp")
	}

	store.transactions["refund"] = model.Transaction{ID: "refund", WorkspaceID: "workspace-a", Type: "refund", Category: "Salary"}
	store.transactions["expense-salary"] = model.Transaction{ID: "expense-salary", WorkspaceID: "workspace-a", Type: "expense", Category: "Salary"}
	updated, err := service.UpdateTransactionCategory(ctx, "workspace-a", "owner-a", salary.ID, TransactionCategoryUpdateInput{Name: categoryStringPointer("Pay")})
	if err != nil {
		t.Fatalf("rename category: %v", err)
	}
	if updated.Name != "Pay" || store.transactions["refund"].Category != "Pay" {
		t.Fatalf("income rename was not migrated: %#v / %#v", updated, store.transactions["refund"])
	}
	if got := store.transactions["expense-salary"].Category; got != "Salary" {
		t.Errorf("expense snapshot changed during income rename to %q", got)
	}
	transactionAudits := make([]model.AuditEvent, 0, 2)
	for _, audit := range store.audits {
		if audit.EntityType == "transaction" {
			transactionAudits = append(transactionAudits, audit)
		}
	}
	if len(transactionAudits) != 2 {
		t.Fatalf("transaction migration audits = %#v", transactionAudits)
	}
	for index, audit := range transactionAudits {
		if !reflect.DeepEqual(audit.ChangedFields, []string{"category"}) || audit.Before == nil || audit.After == nil || audit.Before.Category == audit.After.Category {
			t.Fatalf("migration audit[%d] = %#v", index, audit)
		}
		if audit.LedgerVersion != int64(index+1) {
			t.Fatalf("migration audit[%d] ledger version = %d", index, audit.LedgerVersion)
		}
	}
}

func TestTransactionCategoryUsageDoesNotDisclosePrivateTransactionCount(t *testing.T) {
	store := newTransactionCategoryStore()
	service := newTransactionCategoryService(store)
	ctx := context.Background()
	all, err := service.ListTransactionCategories(ctx, "workspace-a", "owner-a", "expense")
	if err != nil {
		t.Fatalf("seed categories: %v", err)
	}
	general := categoryByName(t, all, "expense", "General")
	store.vaults["private-vault"] = model.Vault{ID: "private-vault", WorkspaceID: "workspace-a", OwnerID: "member-b", Privacy: "private"}
	store.accounts["private-account"] = model.Account{ID: "private-account", WorkspaceID: "workspace-a", VaultID: "private-vault", OwnerID: "member-b", Privacy: "private"}
	store.transactions["visible"] = model.Transaction{ID: "visible", WorkspaceID: "workspace-a", Type: "expense", Category: "General", Privacy: "workspace"}
	store.transactions["hidden"] = model.Transaction{
		ID: "hidden", WorkspaceID: "workspace-a", VaultID: "private-vault", AccountID: "private-account",
		CreatedBy: "member-b", Type: "expense", Category: "General", Privacy: "private",
	}

	listed, err := service.ListTransactionCategories(ctx, "workspace-a", "owner-a", "expense")
	if err != nil {
		t.Fatalf("list categories: %v", err)
	}
	if got := categoryByName(t, listed, "expense", "General").UsageCount; got != 1 {
		t.Fatalf("visible usage count = %d, want 1", got)
	}
	err = service.DeleteTransactionCategory(ctx, "workspace-a", "owner-a", general.ID, "")
	var inUse *TransactionCategoryInUseError
	if !errors.As(err, &inUse) || inUse.UsageCount != 1 || inUse.UsageCountExact {
		t.Fatalf("private usage error = %#v / %v", inUse, err)
	}
}

func TestTransactionCategoryCaseOnlyRenameSkipsExactNoOpRows(t *testing.T) {
	store := newTransactionCategoryStore()
	service := newTransactionCategoryService(store)
	ctx := context.Background()
	all, err := service.ListTransactionCategories(ctx, "workspace-a", "owner-a", "expense")
	if err != nil {
		t.Fatalf("seed categories: %v", err)
	}
	general := categoryByName(t, all, "expense", "General")
	store.transactions["exact"] = model.Transaction{ID: "exact", WorkspaceID: "workspace-a", Type: "expense", Category: "general", Privacy: "workspace"}
	store.transactions["changed"] = model.Transaction{ID: "changed", WorkspaceID: "workspace-a", Type: "expense", Category: "GENERAL", Privacy: "workspace"}

	if _, err := service.UpdateTransactionCategory(ctx, "workspace-a", "owner-a", general.ID, TransactionCategoryUpdateInput{Name: categoryStringPointer("general")}); err != nil {
		t.Fatalf("case-only rename: %v", err)
	}
	if !store.transactions["exact"].UpdatedAt.IsZero() {
		t.Fatal("exact no-op row received an update timestamp")
	}
	if store.transactions["changed"].Category != "general" || store.transactions["changed"].UpdatedAt.IsZero() {
		t.Fatalf("changed row = %#v", store.transactions["changed"])
	}
	transactionAudits := 0
	for _, audit := range store.audits {
		if audit.EntityType == "transaction" {
			transactionAudits++
		}
	}
	if transactionAudits != 1 {
		t.Fatalf("transaction migration audits = %d, want 1", transactionAudits)
	}
}

func TestTransactionCategoryMigrationLimit(t *testing.T) {
	tests := []struct {
		name      string
		count     int
		wantError bool
	}{
		{name: "at limit", count: transactionCategoryMigrationMax},
		{name: "over limit", count: transactionCategoryMigrationMax + 1, wantError: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := newTransactionCategoryStore()
			service := newTransactionCategoryService(store)
			for index := 0; index < test.count; index++ {
				id := fmt.Sprintf("transaction-%05d", index)
				store.transactions[id] = model.Transaction{ID: id, WorkspaceID: "workspace-a", Type: "expense", Category: "General", Privacy: "workspace"}
			}
			updated, err := service.migrateTransactionCategorySnapshots(context.Background(), "workspace-a", "owner-a", "expense", "General", "Everyday")
			if test.wantError {
				var fieldErr *FieldError
				if !errors.As(err, &fieldErr) {
					t.Fatalf("migration error = %v, want FieldError", err)
				}
				if updated != 0 || len(store.audits) != 0 || store.workspaces["workspace-a"].LedgerVersion != 0 {
					t.Fatalf("overflow mutated state: updated=%d audits=%d ledger=%d", updated, len(store.audits), store.workspaces["workspace-a"].LedgerVersion)
				}
				return
			}
			if err != nil {
				t.Fatalf("migration at limit: %v", err)
			}
			if updated != int64(test.count) || len(store.audits) != test.count || store.workspaces["workspace-a"].LedgerVersion != int64(test.count) {
				t.Fatalf("migration result: updated=%d audits=%d ledger=%d", updated, len(store.audits), store.workspaces["workspace-a"].LedgerVersion)
			}
		})
	}
}

func TestTransactionCategoryReorderRequiresAndPersistsFullTypeOrder(t *testing.T) {
	store := newTransactionCategoryStore()
	service := newTransactionCategoryService(store)
	ctx := context.Background()
	expense, err := service.ListTransactionCategories(ctx, "workspace-a", "owner-a", "expense")
	if err != nil {
		t.Fatalf("list expense categories: %v", err)
	}
	ids := make([]string, len(expense))
	for index := range expense {
		ids[len(expense)-1-index] = expense[index].ID
	}
	ordered, err := service.ReorderTransactionCategories(ctx, "workspace-a", "owner-a", TransactionCategoryReorderInput{
		TransactionType: "expense", CategoryIDs: ids,
	})
	if err != nil {
		t.Fatalf("ReorderTransactionCategories: %v", err)
	}
	for index, category := range ordered {
		if category.ID != ids[index] || category.SortOrder != index {
			t.Fatalf("ordered[%d] = %#v, want ID %s/order %d", index, category, ids[index], index)
		}
	}
	listed, err := service.ListTransactionCategories(ctx, "workspace-a", "owner-a", "expense")
	if err != nil {
		t.Fatalf("list reordered categories: %v", err)
	}
	for index, category := range listed {
		if category.ID != ids[index] {
			t.Errorf("persisted order[%d] = %s, want %s", index, category.ID, ids[index])
		}
	}
	_, err = service.ReorderTransactionCategories(ctx, "workspace-a", "owner-a", TransactionCategoryReorderInput{
		TransactionType: "expense", CategoryIDs: ids[:len(ids)-1],
	})
	var fieldErr *FieldError
	if !errors.As(err, &fieldErr) || fieldErr.Field != "categoryIds" {
		t.Fatalf("incomplete reorder error = %v", err)
	}
}

func TestTransactionCategoryValidationSupportsLegacyAndDisabledHistory(t *testing.T) {
	store := newTransactionCategoryStore()
	service := newTransactionCategoryService(store)
	ctx := context.Background()

	legacy, err := service.validateTransactionCategory(ctx, "workspace-a", "expense", "Legacy custom", nil, nil)
	if err != nil || legacy != "Legacy custom" {
		t.Fatalf("legacy unconfigured category = %q, %v", legacy, err)
	}
	all, err := service.ListTransactionCategories(ctx, "workspace-a", "owner-a", "")
	if err != nil {
		t.Fatalf("seed categories: %v", err)
	}
	salary := categoryByName(t, all, "income", "Salary")
	canonical, err := service.validateTransactionCategory(ctx, "workspace-a", "refund", " salary ", nil, nil)
	if err != nil || canonical != "Salary" {
		t.Fatalf("active category canonicalization = %q, %v", canonical, err)
	}
	if _, err := service.UpdateTransactionCategory(ctx, "workspace-a", "owner-a", salary.ID, TransactionCategoryUpdateInput{IsActive: categoryBoolPointer(false)}); err != nil {
		t.Fatalf("disable Salary: %v", err)
	}
	if _, err := service.validateTransactionCategory(ctx, "workspace-a", "income", "Salary", nil, nil); err == nil {
		t.Fatal("new transaction accepted a disabled category")
	}
	historical := &model.Transaction{WorkspaceID: "workspace-a", Type: "refund", Category: "Salary"}
	kept, err := service.validateTransactionCategory(ctx, "workspace-a", "refund", "salary", nil, historical)
	if err != nil || kept != "Salary" {
		t.Fatalf("disabled historical category = %q, %v", kept, err)
	}
	legacyHistorical := &model.Transaction{WorkspaceID: "workspace-a", Type: "expense", Category: "Old category"}
	kept, err = service.validateTransactionCategory(ctx, "workspace-a", "expense", "Old category", nil, legacyHistorical)
	if err != nil || kept != "Old category" {
		t.Fatalf("legacy historical category = %q, %v", kept, err)
	}
	if _, err := service.validateTransactionCategory(ctx, "workspace-a", "expense", "Salary", nil, nil); err == nil {
		t.Fatal("new expense accepted an income category")
	}
}

func TestTransactionCategoryTypeProjectionPreservesRawTypes(t *testing.T) {
	tests := []struct {
		raw    string
		splits []model.Split
		want   string
	}{
		{"expense", nil, "expense"},
		{"adjustment", nil, "expense"},
		{"income", nil, "income"},
		{"refund", nil, "income"},
		{"reimbursement", nil, "income"},
		{"transfer", nil, "transfer"},
		{"transfer", []model.Split{{UserID: "a", AmountMinor: 1}}, "split"},
	}
	for _, test := range tests {
		if got := transactionCategoryType(test.raw, test.splits); got != test.want {
			t.Errorf("transactionCategoryType(%q) = %q, want %q", test.raw, got, test.want)
		}
	}
}

func TestSortTransactionCategoriesUsesTypeOrderThenSortOrderAndName(t *testing.T) {
	items := []model.TransactionCategory{
		{ID: "z", TransactionType: "split", Name: "Split", SortOrder: 0},
		{ID: "b", TransactionType: "expense", Name: "Zoo", SortOrder: 1},
		{ID: "a", TransactionType: "expense", Name: "alpha", SortOrder: 1},
		{ID: "i", TransactionType: "income", Name: "Salary", SortOrder: 0},
		{ID: "t", TransactionType: "transfer", Name: "Transfer", SortOrder: 0},
	}
	sortTransactionCategories(items)
	got := make([]string, len(items))
	for index, item := range items {
		got[index] = item.ID
	}
	want := []string{"a", "b", "i", "t", "z"}
	if !sort.StringsAreSorted([]string{got[0], got[1]}) {
		t.Fatalf("expense name tie-break is not sorted: %#v", got)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("sorted IDs = %#v, want %#v", got, want)
		}
	}
}
