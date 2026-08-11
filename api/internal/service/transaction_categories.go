package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const (
	transactionCategoriesCollection = "transaction_categories"
	transactionCategorySeeds        = "transaction_category_seed_state"
	transactionCategoryMigrationMax = 5_000 // Keep migrations inside one bounded Mongo transaction.
)

type TransactionCategoryCreateInput struct {
	TransactionType string `json:"transactionType"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	Icon            string `json:"icon"`
	Color           string `json:"color"`
	SortOrder       *int   `json:"sortOrder"`
}

type TransactionCategoryUpdateInput struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Icon        *string `json:"icon"`
	Color       *string `json:"color"`
	IsActive    *bool   `json:"isActive"`
}

type TransactionCategoryReorderInput struct {
	TransactionType string   `json:"transactionType"`
	CategoryIDs     []string `json:"categoryIds"`
}

type TransactionCategoryDuplicateError struct {
	Name            string
	TransactionType string
}

func (e *TransactionCategoryDuplicateError) Error() string {
	return fmt.Sprintf("a %s category named %q already exists", e.TransactionType, e.Name)
}

func (e *TransactionCategoryDuplicateError) Unwrap() error { return ErrConflict }

type TransactionCategoryInUseError struct {
	Name            string
	UsageCount      int64
	UsageCountExact bool
}

func (e *TransactionCategoryInUseError) Error() string {
	return fmt.Sprintf("category %q is used by %d transactions", e.Name, e.UsageCount)
}

func (e *TransactionCategoryInUseError) Unwrap() error { return ErrConflict }

type transactionCategorySeedState struct {
	WorkspaceID string    `bson:"_id"`
	SeededAt    time.Time `bson:"seeded_at"`
}

type transactionCategoryDefault struct {
	TransactionType string
	Name            string
	Icon            string
	Color           string
}

var transactionCategoryDefaults = []transactionCategoryDefault{
	{model.TransactionCategoryExpense, "General", "shapes", "#64748b"},
	{model.TransactionCategoryExpense, "Groceries", "shopping-basket", "#16a34a"},
	{model.TransactionCategoryExpense, "Dining", "utensils", "#f97316"},
	{model.TransactionCategoryExpense, "Transport", "car", "#2563eb"},
	{model.TransactionCategoryExpense, "Utilities", "plug", "#7c3aed"},
	{model.TransactionCategoryExpense, "Housing", "house", "#0f766e"},
	{model.TransactionCategoryExpense, "Health", "heart-pulse", "#dc2626"},
	{model.TransactionCategoryExpense, "Shopping", "shopping-bag", "#db2777"},
	{model.TransactionCategoryExpense, "Entertainment", "ticket", "#9333ea"},
	{model.TransactionCategoryExpense, "Travel", "plane", "#0284c7"},
	{model.TransactionCategoryExpense, "Fees", "receipt", "#475569"},
	{model.TransactionCategoryIncome, "Salary", "briefcase-business", "#16a34a"},
	{model.TransactionCategoryIncome, "Freelance", "laptop", "#0d9488"},
	{model.TransactionCategoryIncome, "Business", "building-2", "#2563eb"},
	{model.TransactionCategoryIncome, "Bonus", "sparkles", "#ca8a04"},
	{model.TransactionCategoryIncome, "Interest", "percent", "#7c3aed"},
	{model.TransactionCategoryIncome, "Investment", "chart-no-axes-combined", "#059669"},
	{model.TransactionCategoryIncome, "Refund", "rotate-ccw", "#0891b2"},
	{model.TransactionCategoryIncome, "Gift", "gift", "#db2777"},
	{model.TransactionCategoryIncome, "Other income", "circle-plus", "#64748b"},
	{model.TransactionCategoryTransfer, "Transfer", "arrow-right-left", "#2563eb"},
	{model.TransactionCategorySplit, "Split expense", "users", "#7c3aed"},
}

func validTransactionCategoryType(raw string, allowEmpty bool) (string, error) {
	value := strings.ToLower(strings.TrimSpace(raw))
	if value == "" && allowEmpty {
		return "", nil
	}
	switch value {
	case model.TransactionCategoryExpense,
		model.TransactionCategoryIncome,
		model.TransactionCategoryTransfer,
		model.TransactionCategorySplit:
		return value, nil
	default:
		return "", &FieldError{Field: "transactionType", Message: "must be expense, income, transfer, or split"}
	}
}

func normalizedTransactionCategoryName(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}

func normalizeTransactionCategoryMetadata(description, icon, color string) (string, string, string, error) {
	var err error
	if description, err = validatedText("description", description, 0, 500); err != nil {
		return "", "", "", err
	}
	if icon, err = validatedText("icon", icon, 0, 100); err != nil {
		return "", "", "", err
	}
	if color, err = validAccountColor(color); err != nil {
		return "", "", "", err
	}
	return description, icon, color, nil
}

// ensureTransactionCategoryDefaults seeds once per workspace. The separate
// marker is intentional: after seeding, defaults are ordinary rows and a user
// may rename or delete every one without a later list call recreating them.
func (s *FinanceService) ensureTransactionCategoryDefaults(ctx context.Context, workspaceID string) error {
	var marker transactionCategorySeedState
	if err := s.store.FindOne(ctx, transactionCategorySeeds, repository.Filter{"_id": workspaceID}, &marker); err == nil {
		return nil
	} else if !errors.Is(err, repository.ErrNotFound) {
		return err
	}

	now := time.Now().UTC()
	nextOrder := map[string]int{}
	for _, definition := range transactionCategoryDefaults {
		normalizedName := normalizedTransactionCategoryName(definition.Name)
		var existing model.TransactionCategory
		err := s.store.FindOne(ctx, transactionCategoriesCollection, repository.Filter{
			"workspace_id": workspaceID, "transaction_type": definition.TransactionType, "normalized_name": normalizedName,
		}, &existing)
		if err == nil {
			nextOrder[definition.TransactionType]++
			continue
		}
		if !errors.Is(err, repository.ErrNotFound) {
			return err
		}
		category := &model.TransactionCategory{
			ID: newID(), WorkspaceID: workspaceID, TransactionType: definition.TransactionType,
			Name: definition.Name, NormalizedName: normalizedName, Icon: definition.Icon, Color: definition.Color,
			SortOrder: nextOrder[definition.TransactionType], IsActive: true, CreatedAt: now, UpdatedAt: now,
		}
		nextOrder[definition.TransactionType]++
		if err := s.store.Insert(ctx, transactionCategoriesCollection, category); err != nil && !errors.Is(err, repository.ErrConflict) {
			return err
		}
	}
	if err := s.store.Insert(ctx, transactionCategorySeeds, &transactionCategorySeedState{WorkspaceID: workspaceID, SeededAt: now}); err != nil && !errors.Is(err, repository.ErrConflict) {
		return err
	}
	return nil
}

func (s *FinanceService) ListTransactionCategories(ctx context.Context, workspaceID, actorID, transactionType string) ([]model.TransactionCategory, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	transactionType, err := validTransactionCategoryType(transactionType, true)
	if err != nil {
		return nil, err
	}
	if err := s.ensureTransactionCategoryDefaults(ctx, workspaceID); err != nil {
		return nil, err
	}
	filter := repository.Filter{"workspace_id": workspaceID}
	if transactionType != "" {
		filter["transaction_type"] = transactionType
	}
	var categories []model.TransactionCategory
	if err := s.store.FindMany(ctx, transactionCategoriesCollection, filter, &categories, 0, 0, nil); err != nil {
		return nil, err
	}
	sortTransactionCategories(categories)
	visibleBase, empty, err := s.visibleTransactionCategoryBaseFilter(ctx, workspaceID, actorID)
	if err != nil {
		return nil, err
	}
	for index := range categories {
		if empty {
			categories[index].UsageCount = 0
			continue
		}
		usageCount, err := s.store.Count(ctx, "transactions", mergeTransactionCategoryFilter(visibleBase, transactionCategoryUsageFilter(
			workspaceID, categories[index].TransactionType, categories[index].Name,
		)))
		if err != nil {
			return nil, err
		}
		categories[index].UsageCount = usageCount
	}
	return categories, nil
}

func sortTransactionCategories(categories []model.TransactionCategory) {
	typeOrder := map[string]int{
		model.TransactionCategoryExpense:  0,
		model.TransactionCategoryIncome:   1,
		model.TransactionCategoryTransfer: 2,
		model.TransactionCategorySplit:    3,
	}
	sort.SliceStable(categories, func(left, right int) bool {
		leftType, rightType := typeOrder[categories[left].TransactionType], typeOrder[categories[right].TransactionType]
		if leftType != rightType {
			return leftType < rightType
		}
		if categories[left].SortOrder != categories[right].SortOrder {
			return categories[left].SortOrder < categories[right].SortOrder
		}
		leftName, rightName := strings.ToLower(categories[left].Name), strings.ToLower(categories[right].Name)
		if leftName != rightName {
			return leftName < rightName
		}
		return categories[left].ID < categories[right].ID
	})
}

func (s *FinanceService) CreateTransactionCategory(ctx context.Context, workspaceID, actorID string, input TransactionCategoryCreateInput) (*model.TransactionCategory, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditWorkspace); err != nil {
		return nil, err
	}
	transactionType, err := validTransactionCategoryType(input.TransactionType, false)
	if err != nil {
		return nil, err
	}
	name, err := validatedText("name", input.Name, 1, 100)
	if err != nil {
		return nil, err
	}
	description, icon, color, err := normalizeTransactionCategoryMetadata(input.Description, input.Icon, input.Color)
	if err != nil {
		return nil, err
	}
	if err := s.ensureTransactionCategoryDefaults(ctx, workspaceID); err != nil {
		return nil, err
	}
	normalizedName := normalizedTransactionCategoryName(name)
	var duplicate model.TransactionCategory
	if err := s.store.FindOne(ctx, transactionCategoriesCollection, repository.Filter{
		"workspace_id": workspaceID, "transaction_type": transactionType, "normalized_name": normalizedName,
	}, &duplicate); err == nil {
		return nil, &TransactionCategoryDuplicateError{Name: name, TransactionType: transactionType}
	} else if !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}

	sortOrder, err := s.transactionCategorySortOrder(ctx, workspaceID, transactionType, input.SortOrder)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	category := &model.TransactionCategory{
		ID: newID(), WorkspaceID: workspaceID, TransactionType: transactionType,
		Name: name, NormalizedName: normalizedName, Description: description, Icon: icon, Color: color,
		SortOrder: sortOrder, IsActive: true, CreatedAt: now, UpdatedAt: now,
	}
	if err := s.store.Insert(ctx, transactionCategoriesCollection, category); err != nil {
		if errors.Is(err, repository.ErrConflict) {
			return nil, &TransactionCategoryDuplicateError{Name: name, TransactionType: transactionType}
		}
		return nil, err
	}
	return category, nil
}

func (s *FinanceService) transactionCategorySortOrder(ctx context.Context, workspaceID, transactionType string, requested *int) (int, error) {
	if requested != nil {
		if *requested < 0 || *requested > 1_000_000 {
			return 0, &FieldError{Field: "sortOrder", Message: "must be between 0 and 1000000"}
		}
		return *requested, nil
	}
	var categories []model.TransactionCategory
	if err := s.store.FindMany(ctx, transactionCategoriesCollection, repository.Filter{
		"workspace_id": workspaceID, "transaction_type": transactionType,
	}, &categories, 0, 0, nil); err != nil {
		return 0, err
	}
	next := 0
	for _, category := range categories {
		if category.SortOrder >= next {
			next = category.SortOrder + 1
		}
	}
	return next, nil
}

func (s *FinanceService) UpdateTransactionCategory(ctx context.Context, workspaceID, actorID, categoryID string, input TransactionCategoryUpdateInput) (*model.TransactionCategory, error) {
	categoryID = strings.TrimSpace(categoryID)
	name := ""
	if input.Name != nil {
		var err error
		name, err = validatedText("name", *input.Name, 1, 100)
		if err != nil {
			return nil, err
		}
	}
	description, icon, color := "", "", ""
	var err error
	if input.Description != nil {
		description, err = validatedText("description", *input.Description, 0, 500)
		if err != nil {
			return nil, err
		}
	}
	if input.Icon != nil {
		icon, err = validatedText("icon", *input.Icon, 0, 100)
		if err != nil {
			return nil, err
		}
	}
	if input.Color != nil {
		color, err = validAccountColor(*input.Color)
		if err != nil {
			return nil, err
		}
	}
	result, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if _, err := s.access.Require(transactionCtx, workspaceID, actorID, model.PermEditWorkspace); err != nil {
			return nil, err
		}
		var locked model.TransactionCategory
		if err := s.store.FindOne(transactionCtx, transactionCategoriesCollection, repository.Filter{"_id": categoryID, "workspace_id": workspaceID}, &locked); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		newName := locked.Name
		fields := repository.Filter{"updated_at": time.Now().UTC()}
		if input.Name != nil {
			newName = name
			fields["name"] = name
			fields["normalized_name"] = normalizedTransactionCategoryName(name)
		}
		if input.Description != nil {
			fields["description"] = description
		}
		if input.Icon != nil {
			fields["icon"] = icon
		}
		if input.Color != nil {
			fields["color"] = color
		}
		if input.IsActive != nil {
			fields["is_active"] = *input.IsActive
		}
		if locked.Name != newName {
			usageCount, err := s.store.Count(transactionCtx, "transactions", transactionCategoryMigrationFilter(
				workspaceID, locked.TransactionType, locked.Name, newName,
			))
			if err != nil {
				return nil, err
			}
			if usageCount > transactionCategoryMigrationMax {
				return nil, &FieldError{Field: "name", Message: "cannot migrate more than 5000 transactions in one request"}
			}
		}
		var updated model.TransactionCategory
		err := s.store.UpdateOne(transactionCtx, transactionCategoriesCollection, repository.Filter{
			"_id": categoryID, "workspace_id": workspaceID,
		}, repository.Filter{"$set": fields}, &updated)
		if err != nil {
			if errors.Is(err, repository.ErrConflict) {
				return nil, &TransactionCategoryDuplicateError{Name: newName, TransactionType: locked.TransactionType}
			}
			return nil, err
		}
		// Renames deliberately migrate only matching snapshots in this category's
		// projected mode. Raw transaction types and every other workspace remain
		// untouched, while history continues to show a meaningful category label.
		if locked.Name != newName {
			if _, err := s.migrateTransactionCategorySnapshots(
				transactionCtx, workspaceID, actorID, locked.TransactionType, locked.Name, newName,
			); err != nil {
				return nil, err
			}
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "transaction_category.updated", "transaction_category", categoryID, map[string]any{
			"transactionType": locked.TransactionType,
		}); err != nil {
			return nil, err
		}
		return &updated, nil
	})
	if err != nil {
		return nil, err
	}
	updated, ok := result.(*model.TransactionCategory)
	if !ok {
		return nil, errors.New("unexpected transaction category update result")
	}
	return updated, nil
}

func (s *FinanceService) DeleteTransactionCategory(ctx context.Context, workspaceID, actorID, categoryID, replacementCategoryID string) error {
	categoryID = strings.TrimSpace(categoryID)
	replacementCategoryID = strings.TrimSpace(replacementCategoryID)
	if replacementCategoryID != "" && replacementCategoryID == categoryID {
		return &FieldError{Field: "replacementCategoryId", Message: "must reference a different category"}
	}
	_, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if _, err := s.access.Require(transactionCtx, workspaceID, actorID, model.PermEditWorkspace); err != nil {
			return nil, err
		}
		var category model.TransactionCategory
		if err := s.store.FindOne(transactionCtx, transactionCategoriesCollection, repository.Filter{"_id": categoryID, "workspace_id": workspaceID}, &category); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		usageFilter := transactionCategoryUsageFilter(workspaceID, category.TransactionType, category.Name)
		usageCount, err := s.store.Count(transactionCtx, "transactions", usageFilter)
		if err != nil {
			return nil, err
		}
		var replacement model.TransactionCategory
		if replacementCategoryID != "" {
			if err := s.store.FindOne(transactionCtx, transactionCategoriesCollection, repository.Filter{
				"_id": replacementCategoryID, "workspace_id": workspaceID, "transaction_type": category.TransactionType,
			}, &replacement); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					return nil, &FieldError{Field: "replacementCategoryId", Message: "must reference a category of the same transaction type in this workspace"}
				}
				return nil, err
			}
			if !replacement.IsActive {
				return nil, &FieldError{Field: "replacementCategoryId", Message: "must reference an active category"}
			}
		}
		if usageCount > 0 && replacementCategoryID == "" {
			visibleCount, countErr := s.visibleTransactionCategoryUsageCount(
				transactionCtx, workspaceID, actorID, category.TransactionType, category.Name,
			)
			if countErr != nil {
				return nil, countErr
			}
			return nil, &TransactionCategoryInUseError{
				Name: category.Name, UsageCount: visibleCount, UsageCountExact: visibleCount == usageCount,
			}
		}
		if usageCount > 0 {
			if usageCount > transactionCategoryMigrationMax {
				return nil, &FieldError{Field: "replacementCategoryId", Message: "cannot migrate more than 5000 transactions in one request"}
			}
			if _, err := s.migrateTransactionCategorySnapshots(
				transactionCtx, workspaceID, actorID, category.TransactionType, category.Name, replacement.Name,
			); err != nil {
				return nil, err
			}
		}
		if err := s.store.DeleteOne(transactionCtx, transactionCategoriesCollection, repository.Filter{
			"_id": categoryID, "workspace_id": workspaceID,
		}); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "transaction_category.deleted", "transaction_category", categoryID, map[string]any{
			"transactionType": category.TransactionType,
		}); err != nil {
			return nil, err
		}
		return nil, nil
	})
	return err
}

func (s *FinanceService) ReorderTransactionCategories(ctx context.Context, workspaceID, actorID string, input TransactionCategoryReorderInput) ([]model.TransactionCategory, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditWorkspace); err != nil {
		return nil, err
	}
	transactionType, err := validTransactionCategoryType(input.TransactionType, false)
	if err != nil {
		return nil, err
	}
	if len(input.CategoryIDs) == 0 {
		return nil, &FieldError{Field: "categoryIds", Message: "must contain the full non-empty category order"}
	}
	var categories []model.TransactionCategory
	if err := s.store.FindMany(ctx, transactionCategoriesCollection, repository.Filter{
		"workspace_id": workspaceID, "transaction_type": transactionType,
	}, &categories, 0, 0, nil); err != nil {
		return nil, err
	}
	if len(categories) != len(input.CategoryIDs) {
		return nil, &FieldError{Field: "categoryIds", Message: "must contain every category of the selected transaction type exactly once"}
	}
	byID := make(map[string]model.TransactionCategory, len(categories))
	for _, category := range categories {
		byID[category.ID] = category
	}
	seen := make(map[string]struct{}, len(input.CategoryIDs))
	for _, categoryID := range input.CategoryIDs {
		if _, exists := byID[categoryID]; !exists {
			return nil, &FieldError{Field: "categoryIds", Message: "must contain only categories of the selected transaction type in this workspace"}
		}
		if _, duplicate := seen[categoryID]; duplicate {
			return nil, &FieldError{Field: "categoryIds", Message: "must not contain duplicate category IDs"}
		}
		seen[categoryID] = struct{}{}
	}
	now := time.Now().UTC()
	result, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		ordered := make([]model.TransactionCategory, 0, len(input.CategoryIDs))
		for sortOrder, categoryID := range input.CategoryIDs {
			var updated model.TransactionCategory
			if err := s.store.UpdateOne(transactionCtx, transactionCategoriesCollection, repository.Filter{
				"_id": categoryID, "workspace_id": workspaceID, "transaction_type": transactionType,
			}, repository.Filter{"$set": repository.Filter{"sort_order": sortOrder, "updated_at": now}}, &updated); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					return nil, ErrConflict
				}
				return nil, err
			}
			ordered = append(ordered, updated)
		}
		return ordered, nil
	})
	if err != nil {
		return nil, err
	}
	ordered, ok := result.([]model.TransactionCategory)
	if !ok {
		return nil, errors.New("unexpected transaction category reorder result")
	}
	return ordered, nil
}

func transactionCategoryType(rawType string, splits []model.Split) string {
	if len(splits) > 0 {
		return model.TransactionCategorySplit
	}
	switch strings.ToLower(strings.TrimSpace(rawType)) {
	case "income", "refund", "reimbursement":
		return model.TransactionCategoryIncome
	case "transfer":
		return model.TransactionCategoryTransfer
	default:
		return model.TransactionCategoryExpense
	}
}

func transactionCategoryUsageFilter(workspaceID, transactionType, name string) repository.Filter {
	filter := repository.Filter{
		"workspace_id": workspaceID,
		"category": repository.Filter{
			"$regex":   "^" + regexp.QuoteMeta(strings.TrimSpace(name)) + "$",
			"$options": "i",
		},
	}
	switch transactionType {
	case model.TransactionCategorySplit:
		filter["splits.0"] = repository.Filter{"$exists": true}
	case model.TransactionCategoryIncome:
		filter["splits.0"] = repository.Filter{"$exists": false}
		filter["type"] = repository.Filter{"$in": []string{"income", "refund", "reimbursement"}}
	case model.TransactionCategoryTransfer:
		filter["splits.0"] = repository.Filter{"$exists": false}
		filter["type"] = "transfer"
	default:
		filter["splits.0"] = repository.Filter{"$exists": false}
		filter["type"] = repository.Filter{"$in": []string{"expense", "adjustment"}}
	}
	return filter
}

func transactionCategoryMigrationFilter(workspaceID, transactionType, oldName, newName string) repository.Filter {
	filter := transactionCategoryUsageFilter(workspaceID, transactionType, oldName)
	category := filter["category"].(repository.Filter)
	category["$ne"] = newName
	return filter
}

func mergeTransactionCategoryFilter(base, category repository.Filter) repository.Filter {
	merged := make(repository.Filter, len(base)+len(category))
	for key, value := range base {
		merged[key] = value
	}
	for key, value := range category {
		merged[key] = value
	}
	return merged
}

func (s *FinanceService) visibleTransactionCategoryBaseFilter(ctx context.Context, workspaceID, actorID string) (repository.Filter, bool, error) {
	filter, empty, err := s.transactionQuery(ctx, workspaceID, actorID, TransactionFilter{})
	if errors.Is(err, ErrForbidden) {
		return nil, true, nil
	}
	return filter, empty, err
}

func (s *FinanceService) visibleTransactionCategoryUsageCount(ctx context.Context, workspaceID, actorID, transactionType, name string) (int64, error) {
	base, empty, err := s.visibleTransactionCategoryBaseFilter(ctx, workspaceID, actorID)
	if err != nil || empty {
		return 0, err
	}
	return s.store.Count(ctx, "transactions", mergeTransactionCategoryFilter(
		base, transactionCategoryUsageFilter(workspaceID, transactionType, name),
	))
}

func (s *FinanceService) migrateTransactionCategorySnapshots(
	ctx context.Context,
	workspaceID, actorID, transactionType, oldName, newName string,
) (int64, error) {
	usageFilter := transactionCategoryMigrationFilter(workspaceID, transactionType, oldName, newName)
	var affected []model.Transaction
	if err := s.store.FindMany(ctx, "transactions", usageFilter, &affected, transactionCategoryMigrationMax+1, 0, repository.Sort{"_id": 1}); err != nil {
		return 0, err
	}
	if len(affected) > transactionCategoryMigrationMax {
		return 0, &FieldError{Field: "category", Message: "cannot migrate more than 5000 transactions in one request"}
	}
	if len(affected) == 0 {
		return 0, nil
	}
	sort.Slice(affected, func(left, right int) bool {
		return affected[left].ID < affected[right].ID
	})
	now := time.Now().UTC()
	updatedCount, err := s.store.UpdateMany(ctx, "transactions", usageFilter, repository.Filter{
		"$set": repository.Filter{"category": newName, "updated_at": now},
	})
	if err != nil {
		return 0, err
	}
	if updatedCount != int64(len(affected)) {
		return 0, ErrConflict
	}
	lastLedgerVersion, err := s.advanceLedgerVersionBy(ctx, workspaceID, int64(len(affected)))
	if err != nil {
		return 0, err
	}
	firstLedgerVersion := lastLedgerVersion - int64(len(affected)) + 1
	if lastLedgerVersion == 0 {
		firstLedgerVersion = 0
	}
	for index := range affected {
		before := affected[index]
		after := before
		after.Category = newName
		after.UpdatedAt = now
		audit := transactionRevisionAudit(
			workspaceID, actorID, "transaction.updated", before.ID,
			model.NewTransactionRevisionSnapshot(&before), model.NewTransactionRevisionSnapshot(&after),
			firstLedgerVersion+int64(index),
		)
		if err := s.store.Insert(ctx, "audit_events", audit); err != nil {
			return 0, err
		}
	}
	return updatedCount, nil
}

// validateTransactionCategory keeps unconfigured legacy workspaces permissive,
// but once a mode has configured rows it accepts only active rows for new
// transactions. An unchanged historical snapshot remains valid during edits,
// including when its row is disabled or the string predates configuration.
func (s *FinanceService) validateTransactionCategory(
	ctx context.Context,
	workspaceID, rawType, requested string,
	splits []model.Split,
	existing *model.Transaction,
) (string, error) {
	requested = strings.TrimSpace(requested)
	if requested == "" {
		return "", nil
	}
	mode := transactionCategoryType(rawType, splits)
	normalizedName := normalizedTransactionCategoryName(requested)
	var category model.TransactionCategory
	err := s.store.FindOne(ctx, transactionCategoriesCollection, repository.Filter{
		"workspace_id": workspaceID, "transaction_type": mode, "normalized_name": normalizedName,
	}, &category)
	if err == nil {
		if category.IsActive {
			return category.Name, nil
		}
		if unchangedTransactionCategory(existing, mode, normalizedName) {
			return existing.Category, nil
		}
		return "", &FieldError{Field: "category", Message: "must reference an active category for this transaction type"}
	}
	if !errors.Is(err, repository.ErrNotFound) {
		return "", err
	}
	if unchangedTransactionCategory(existing, mode, normalizedName) {
		return existing.Category, nil
	}
	configured, err := s.store.Count(ctx, transactionCategoriesCollection, repository.Filter{
		"workspace_id": workspaceID, "transaction_type": mode,
	})
	if err != nil {
		return "", err
	}
	if configured == 0 {
		return requested, nil
	}
	return "", &FieldError{Field: "category", Message: "must reference an active category for this transaction type"}
}

func unchangedTransactionCategory(existing *model.Transaction, mode, normalizedName string) bool {
	return existing != nil &&
		transactionCategoryType(existing.Type, existing.Splits) == mode &&
		normalizedTransactionCategoryName(existing.Category) == normalizedName
}
