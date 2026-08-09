package service

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

var errExactDashboardAggregationUnavailable = errors.New("exact dashboard aggregation is unavailable")

type exactAggregationCapability interface {
	SupportsExactServerAggregation() bool
}

func supportsExactDashboardAggregation(store repository.Store) bool {
	capability, ok := store.(exactAggregationCapability)
	return ok && capability.SupportsExactServerAggregation()
}

type dashboardAggregateSummary struct {
	Count          int64 `bson:"count"`
	TotalMinor     int64 `bson:"total_minor"`
	IncomeMinor    int64 `bson:"income_minor"`
	SpendingMinor  int64 `bson:"spending_minor"`
	HighestIncome  int64 `bson:"highest_income"`
	HighestExpense int64 `bson:"highest_expense"`
}

type dashboardCategoryAggregate struct {
	Name     string `bson:"_id"`
	Amount   int64  `bson:"amount"`
	Count    int64  `bson:"count"`
	Currency string `bson:"currency"`
}

type dashboardSourceAggregate struct {
	Key struct {
		Label    string `bson:"label"`
		Merchant string `bson:"merchant"`
		Category string `bson:"category"`
		Type     string `bson:"type"`
	} `bson:"_id"`
	Amount   int64  `bson:"amount"`
	Count    int64  `bson:"count"`
	Currency string `bson:"currency"`
}

type dashboardContactAggregate struct {
	ID          string    `bson:"_id"`
	IncomeMinor int64     `bson:"income_minor"`
	PaidMinor   int64     `bson:"paid_minor"`
	Count       int64     `bson:"count"`
	LatestDate  time.Time `bson:"latest_date"`
	Currency    string    `bson:"currency"`
}

type dashboardAccountAggregate struct {
	ID          string `bson:"_id"`
	IncomeMinor int64  `bson:"income_minor"`
	PaidMinor   int64  `bson:"paid_minor"`
	Count       int64  `bson:"count"`
	Currency    string `bson:"currency"`
}

type dashboardCashflowAggregate struct {
	Period        string `bson:"_id"`
	IncomeMinor   int64  `bson:"income_minor"`
	SpendingMinor int64  `bson:"spending_minor"`
	Count         int64  `bson:"count"`
	Currency      string `bson:"currency"`
}

type dashboardRepeatedAggregate struct {
	Key struct {
		Label    string `bson:"label"`
		Category string `bson:"category"`
		Type     string `bson:"type"`
		Amount   int64  `bson:"amount"`
		Currency string `bson:"currency"`
	} `bson:"_id"`
	Count int64 `bson:"count"`
}

type dashboardAggregateRecord struct {
	ID          string    `bson:"_id"`
	Label       string    `bson:"dashboard_label"`
	Type        string    `bson:"type"`
	Category    string    `bson:"category"`
	AccountID   string    `bson:"account_id"`
	ContactID   string    `bson:"contact_id"`
	Description string    `bson:"description"`
	AmountMinor int64     `bson:"amount_minor"`
	Currency    string    `bson:"currency"`
	OccurredAt  time.Time `bson:"effective_date"`
}

type dashboardTransactionFacet struct {
	Summary        []dashboardAggregateSummary  `bson:"summary"`
	Categories     []dashboardCategoryAggregate `bson:"categories"`
	Sources        []dashboardSourceAggregate   `bson:"sources"`
	Types          []dashboardCategoryAggregate `bson:"types"`
	Contacts       []dashboardContactAggregate  `bson:"contacts"`
	Accounts       []dashboardAccountAggregate  `bson:"accounts"`
	Daily          []dashboardCashflowAggregate `bson:"daily"`
	Monthly        []dashboardCashflowAggregate `bson:"monthly"`
	Repeated       []dashboardRepeatedAggregate `bson:"repeated"`
	LargestIncome  []dashboardAggregateRecord   `bson:"largest_income"`
	LargestExpense []dashboardAggregateRecord   `bson:"largest_expense"`
	Recent         []dashboardAggregateRecord   `bson:"recent"`
}

type dashboardTransactionMetrics struct {
	Summary        dashboardAggregateSummary
	Analytics      DashboardAnalytics
	RecentIDs      []string
	LargestIncome  string
	LargestExpense string
}

func dashboardEffectiveDateExpression() repository.Filter {
	return repository.Filter{"$cond": []any{
		repository.Filter{"$or": []any{
			repository.Filter{"$eq": []any{"$occurred_at", nil}},
			repository.Filter{"$eq": []any{"$occurred_at", time.Time{}}},
		}},
		"$created_at",
		"$occurred_at",
	}}
}

func dashboardIncomeExpression() repository.Filter {
	return repository.Filter{"$in": []any{"$type", []string{"income", "refund", "reimbursement"}}}
}

func dashboardExpenseExpression() repository.Filter {
	return repository.Filter{"$eq": []any{"$type", "expense"}}
}

func dashboardLabelExpression() repository.Filter {
	return repository.Filter{"$cond": []any{
		repository.Filter{"$ne": []any{repository.Filter{"$ifNull": []any{"$merchant", ""}}, ""}},
		"$merchant",
		repository.Filter{"$cond": []any{
			repository.Filter{"$ne": []any{repository.Filter{"$ifNull": []any{"$category", ""}}, ""}},
			"$category",
			"$type",
		}},
	}}
}

func dashboardDateStringExpression(format string) repository.Filter {
	return repository.Filter{"$dateToString": repository.Filter{
		"format":   format,
		"date":     dashboardEffectiveDateExpression(),
		"timezone": "UTC",
	}}
}

func dashboardSummaryGroup() repository.Filter {
	return repository.Filter{"$group": repository.Filter{
		"_id":             nil,
		"count":           repository.Filter{"$sum": 1},
		"total_minor":     repository.Filter{"$sum": "$amount_minor"},
		"income_minor":    repository.Filter{"$sum": repository.Filter{"$cond": []any{dashboardIncomeExpression(), "$amount_minor", 0}}},
		"spending_minor":  repository.Filter{"$sum": repository.Filter{"$cond": []any{dashboardExpenseExpression(), "$amount_minor", 0}}},
		"highest_income":  repository.Filter{"$max": repository.Filter{"$cond": []any{dashboardIncomeExpression(), "$amount_minor", 0}}},
		"highest_expense": repository.Filter{"$max": repository.Filter{"$cond": []any{dashboardExpenseExpression(), "$amount_minor", 0}}},
	}}
}

func dashboardCategoryFacet() repository.Pipeline {
	return repository.Pipeline{
		{"$match": repository.Filter{"$expr": dashboardExpenseExpression()}},
		{"$group": repository.Filter{
			"_id": repository.Filter{"$cond": []any{
				repository.Filter{"$ne": []any{repository.Filter{"$ifNull": []any{"$category", ""}}, ""}},
				"$category", "Uncategorised",
			}},
			"amount":   repository.Filter{"$sum": "$amount_minor"},
			"count":    repository.Filter{"$sum": 1},
			"currency": repository.Filter{"$first": "$currency"},
		}},
		{"$sort": repository.Filter{"amount": -1, "_id": 1}},
	}
}

func dashboardSourceFacet() repository.Pipeline {
	return repository.Pipeline{
		{"$match": repository.Filter{"$expr": dashboardIncomeExpression()}},
		{"$group": repository.Filter{
			"_id": repository.Filter{
				"label":    "$dashboard_label",
				"merchant": "$merchant",
				"category": "$category",
				"type":     "$type",
			},
			"amount":   repository.Filter{"$sum": "$amount_minor"},
			"count":    repository.Filter{"$sum": 1},
			"currency": repository.Filter{"$first": "$currency"},
		}},
		{"$sort": repository.Filter{"amount": -1, "_id": 1}},
	}
}

func dashboardTypeFacet() repository.Pipeline {
	return repository.Pipeline{
		{"$group": repository.Filter{
			"_id":      "$type",
			"amount":   repository.Filter{"$sum": "$amount_minor"},
			"count":    repository.Filter{"$sum": 1},
			"currency": repository.Filter{"$first": "$currency"},
		}},
		{"$sort": repository.Filter{"amount": -1, "_id": 1}},
	}
}

func dashboardContactFacet() repository.Pipeline {
	return repository.Pipeline{
		{"$match": repository.Filter{"contact_id": repository.Filter{"$exists": true, "$ne": ""}}},
		{"$group": repository.Filter{
			"_id":          "$contact_id",
			"income_minor": repository.Filter{"$sum": repository.Filter{"$cond": []any{dashboardIncomeExpression(), "$amount_minor", 0}}},
			"paid_minor":   repository.Filter{"$sum": repository.Filter{"$cond": []any{dashboardExpenseExpression(), "$amount_minor", 0}}},
			"count":        repository.Filter{"$sum": 1},
			"latest_date":  repository.Filter{"$max": "$effective_date"},
			"currency":     repository.Filter{"$first": "$currency"},
		}},
		{"$sort": repository.Filter{"income_minor": -1, "paid_minor": -1, "_id": 1}},
	}
}

func dashboardAccountFacet() repository.Pipeline {
	return repository.Pipeline{
		{"$group": repository.Filter{
			"_id":          "$account_id",
			"income_minor": repository.Filter{"$sum": repository.Filter{"$cond": []any{dashboardIncomeExpression(), "$amount_minor", 0}}},
			"paid_minor":   repository.Filter{"$sum": repository.Filter{"$cond": []any{dashboardExpenseExpression(), "$amount_minor", 0}}},
			"count":        repository.Filter{"$sum": 1},
			"currency":     repository.Filter{"$first": "$currency"},
		}},
		{"$sort": repository.Filter{"income_minor": -1, "paid_minor": -1, "_id": 1}},
	}
}

func dashboardCashflowFacet(format string) repository.Pipeline {
	return repository.Pipeline{
		{"$group": repository.Filter{
			"_id":            dashboardDateStringExpression(format),
			"income_minor":   repository.Filter{"$sum": repository.Filter{"$cond": []any{dashboardIncomeExpression(), "$amount_minor", 0}}},
			"spending_minor": repository.Filter{"$sum": repository.Filter{"$cond": []any{dashboardExpenseExpression(), "$amount_minor", 0}}},
			"count":          repository.Filter{"$sum": 1},
			"currency":       repository.Filter{"$first": "$currency"},
		}},
		{"$sort": repository.Filter{"_id": 1}},
	}
}

func dashboardRepeatedFacet() repository.Pipeline {
	return repository.Pipeline{
		{"$group": repository.Filter{
			"_id": repository.Filter{
				"label":    "$dashboard_label",
				"category": "$category",
				"type":     "$type",
				"amount":   "$amount_minor",
				"currency": "$currency",
			},
			"count": repository.Filter{"$sum": 1},
		}},
		{"$match": repository.Filter{"count": repository.Filter{"$gte": 2}}},
		{"$sort": repository.Filter{"count": -1, "_id.label": 1}},
		{"$limit": 10},
	}
}

func dashboardRecordFacet(income bool) repository.Pipeline {
	expression := dashboardExpenseExpression()
	if income {
		expression = dashboardIncomeExpression()
	}
	return repository.Pipeline{
		{"$match": repository.Filter{"$expr": expression}},
		{"$sort": repository.Filter{"amount_minor": -1, "effective_date": -1, "_id": 1}},
		{"$limit": 1},
		{"$project": repository.Filter{
			"_id": 1, "dashboard_label": 1, "type": 1, "category": 1,
			"account_id": 1, "contact_id": 1, "description": 1,
			"amount_minor": 1, "currency": 1, "effective_date": 1,
		}},
	}
}

func dashboardRecentFacet() repository.Pipeline {
	return repository.Pipeline{
		{"$sort": repository.Filter{"effective_date": -1, "_id": -1}},
		{"$limit": 10},
		{"$project": repository.Filter{"_id": 1}},
	}
}

func dashboardTransactionPipeline(query repository.Filter) repository.Pipeline {
	return repository.Pipeline{
		{"$match": query},
		{"$set": repository.Filter{
			"effective_date":  dashboardEffectiveDateExpression(),
			"dashboard_label": dashboardLabelExpression(),
		}},
		{"$facet": repository.Filter{
			"summary":         repository.Pipeline{dashboardSummaryGroup()},
			"categories":      dashboardCategoryFacet(),
			"sources":         dashboardSourceFacet(),
			"types":           dashboardTypeFacet(),
			"contacts":        dashboardContactFacet(),
			"accounts":        dashboardAccountFacet(),
			"daily":           dashboardCashflowFacet("%Y-%m-%d"),
			"monthly":         dashboardCashflowFacet("%Y-%m"),
			"repeated":        dashboardRepeatedFacet(),
			"largest_income":  dashboardRecordFacet(true),
			"largest_expense": dashboardRecordFacet(false),
			"recent":          dashboardRecentFacet(),
		}},
	}
}

func (s *FinanceService) aggregateDashboardTransactions(ctx context.Context, workspaceID, actorID string, query repository.Filter, accounts []model.Account) (*dashboardTransactionMetrics, error) {
	if !supportsExactDashboardAggregation(s.store) {
		return nil, errExactDashboardAggregationUnavailable
	}
	var facets []dashboardTransactionFacet
	if err := s.store.Aggregate(ctx, "transactions", dashboardTransactionPipeline(query), &facets); err != nil {
		return nil, err
	}
	metrics := &dashboardTransactionMetrics{Analytics: emptyDashboardAnalytics()}
	if len(facets) == 0 {
		return metrics, nil
	}
	facet := facets[0]
	if len(facet.Summary) > 0 {
		metrics.Summary = facet.Summary[0]
	}
	currency := ""
	if len(accounts) > 0 {
		currency = accounts[0].Currency
	}
	for _, item := range facet.Categories {
		metrics.Analytics.ByCategory = append(metrics.Analytics.ByCategory, DashboardCategoryInsight{Name: item.Name, Category: item.Name, Type: "expense", AmountMinor: item.Amount, Count: item.Count, Currency: valueOrDefault(item.Currency, currency)})
	}
	metrics.Analytics.TopCategories = append(metrics.Analytics.TopCategories, metrics.Analytics.ByCategory...)
	if len(metrics.Analytics.TopCategories) > 5 {
		metrics.Analytics.TopCategories = metrics.Analytics.TopCategories[:5]
	}
	for _, item := range facet.Sources {
		filterCategory := strings.TrimSpace(item.Key.Category)
		filterMerchant := strings.TrimSpace(item.Key.Merchant)
		filterType := strings.TrimSpace(item.Key.Type)
		if filterMerchant == "" && filterCategory == "" {
			filterType = valueOrDefault(filterType, "income")
		}
		metrics.Analytics.BySource = append(metrics.Analytics.BySource, DashboardCategoryInsight{Name: item.Key.Label, Merchant: filterMerchant, Category: filterCategory, Type: filterType, AmountMinor: item.Amount, Count: item.Count, Currency: valueOrDefault(item.Currency, currency)})
	}
	for _, item := range facet.Types {
		metrics.Analytics.ByType = append(metrics.Analytics.ByType, DashboardCategoryInsight{Name: friendlyTransactionType(item.Name), Type: item.Name, AmountMinor: item.Amount, Count: item.Count, Currency: valueOrDefault(item.Currency, currency)})
	}
	accountNames := make(map[string]string, len(accounts))
	for _, account := range accounts {
		accountNames[account.ID] = account.Name
	}
	for _, item := range facet.Accounts {
		metrics.Analytics.ByAccount = append(metrics.Analytics.ByAccount, DashboardAccountInsight{ID: item.ID, Name: valueOrDefault(accountNames[item.ID], "Account"), IncomeMinor: item.IncomeMinor, PaidMinor: item.PaidMinor, NetMinor: item.IncomeMinor - item.PaidMinor, Count: item.Count, Currency: valueOrDefault(item.Currency, currency)})
	}
	contactNames, err := s.dashboardContactNames(ctx, workspaceID, facet.Contacts)
	if err != nil {
		return nil, err
	}
	for _, item := range facet.Contacts {
		metrics.Analytics.ByContact = append(metrics.Analytics.ByContact, DashboardContactInsight{ID: item.ID, Name: valueOrDefault(contactNames[item.ID], "Contact"), IncomeMinor: item.IncomeMinor, PaidMinor: item.PaidMinor, NetMinor: item.IncomeMinor - item.PaidMinor, Count: item.Count, LatestDate: item.LatestDate, Currency: valueOrDefault(item.Currency, currency)})
	}
	for _, item := range facet.Daily {
		metrics.Analytics.Cashflow = append(metrics.Analytics.Cashflow, DashboardCashflowPoint{Period: item.Period, IncomeMinor: item.IncomeMinor, SpendingMinor: item.SpendingMinor, NetMinor: item.IncomeMinor - item.SpendingMinor, Currency: valueOrDefault(item.Currency, currency)})
	}
	for _, item := range facet.Monthly {
		metrics.Analytics.MonthlyTrend = append(metrics.Analytics.MonthlyTrend, DashboardCashflowPoint{Period: item.Period, IncomeMinor: item.IncomeMinor, SpendingMinor: item.SpendingMinor, NetMinor: item.IncomeMinor - item.SpendingMinor, Currency: valueOrDefault(item.Currency, currency)})
	}
	for _, item := range facet.Repeated {
		metrics.Analytics.MonthDetails.RepeatedTransactions = append(metrics.Analytics.MonthDetails.RepeatedTransactions, DashboardRepeatedTransaction{Label: item.Key.Label, Category: item.Key.Category, Type: item.Key.Type, AmountMinor: item.Key.Amount, Count: item.Count, Currency: item.Key.Currency})
	}
	if len(metrics.Analytics.ByCategory) > 0 {
		metrics.Analytics.MonthDetails.TopSpendingCategory = metrics.Analytics.ByCategory[0].Name
	}
	if len(metrics.Analytics.ByContact) > 0 {
		copyContacts := append([]DashboardContactInsight(nil), metrics.Analytics.ByContact...)
		sort.SliceStable(copyContacts, func(left, right int) bool {
			leftTotal := copyContacts[left].IncomeMinor + copyContacts[left].PaidMinor
			rightTotal := copyContacts[right].IncomeMinor + copyContacts[right].PaidMinor
			if leftTotal != rightTotal {
				return leftTotal > rightTotal
			}
			return copyContacts[left].Name < copyContacts[right].Name
		})
		metrics.Analytics.ByContact = copyContacts
		metrics.Analytics.MonthDetails.HighestValueContact = copyContacts[0]
	}
	if len(facet.LargestIncome) > 0 {
		metrics.LargestIncome = facet.LargestIncome[0].ID
	}
	if len(facet.LargestExpense) > 0 {
		metrics.LargestExpense = facet.LargestExpense[0].ID
	}
	for _, item := range facet.Recent {
		metrics.RecentIDs = append(metrics.RecentIDs, item.ID)
	}
	metrics.Analytics.MonthDetails.MostActiveDay = mostActiveDashboardDay(metrics.Analytics.Cashflow, facet.Daily)
	return metrics, nil
}

func mostActiveDashboardDay(points []DashboardCashflowPoint, raw []dashboardCashflowAggregate) string {
	if len(points) == 0 || len(raw) == 0 {
		return ""
	}
	bestPeriod := ""
	bestCount := int64(0)
	for _, point := range raw {
		if point.Count > bestCount || (point.Count == bestCount && (bestPeriod == "" || point.Period < bestPeriod)) {
			bestPeriod, bestCount = point.Period, point.Count
		}
	}
	return bestPeriod
}

func (s *FinanceService) dashboardContactNames(ctx context.Context, workspaceID string, aggregates []dashboardContactAggregate) (map[string]string, error) {
	ids := make([]string, 0, len(aggregates))
	for _, item := range aggregates {
		if strings.TrimSpace(item.ID) != "" {
			ids = append(ids, item.ID)
		}
	}
	result := make(map[string]string, len(ids))
	if len(ids) == 0 {
		return result, nil
	}
	var contacts []model.Contact
	if err := s.store.FindMany(ctx, "contacts", repository.Filter{"workspace_id": workspaceID, "_id": repository.Filter{"$in": ids}}, &contacts, int64(len(ids)), 0, nil); err != nil {
		return nil, err
	}
	for _, contact := range contacts {
		result[contact.ID] = contact.Name
	}
	return result, nil
}

func (s *FinanceService) loadDashboardTransaction(ctx context.Context, workspaceID, actorID, id string) (*model.Transaction, error) {
	if id == "" {
		return nil, nil
	}
	return s.GetTransaction(ctx, workspaceID, actorID, id)
}

func (s *FinanceService) loadDashboardRecentTransactions(ctx context.Context, workspaceID, actorID string, query repository.Filter, ids []string) ([]model.Transaction, error) {
	if len(ids) == 0 {
		return []model.Transaction{}, nil
	}
	var items []model.Transaction
	filter := repository.Filter{"$and": []repository.Filter{
		query,
		{"_id": repository.Filter{"$in": ids}},
	}}
	if err := s.store.FindMany(ctx, "transactions", filter, &items, int64(len(ids)), 0, nil); err != nil {
		return nil, err
	}
	if err := s.hydrateTransactionCreators(ctx, actorID, items); err != nil {
		return nil, err
	}
	if err := s.hydrateTransactionContacts(ctx, items); err != nil {
		return nil, err
	}
	byID := make(map[string]model.Transaction, len(items))
	for _, item := range items {
		byID[item.ID] = item
	}
	ordered := make([]model.Transaction, 0, len(ids))
	for _, id := range ids {
		if item, ok := byID[id]; ok {
			ordered = append(ordered, item)
		}
	}
	return ordered, nil
}

func (s *FinanceService) applyExactDashboardTransactions(ctx context.Context, workspaceID, actorID string, query repository.Filter, result *Dashboard, metrics *dashboardTransactionMetrics) error {
	result.IncomeMinor = metrics.Summary.IncomeMinor
	result.SpendingMinor = metrics.Summary.SpendingMinor
	result.TransactionCount = metrics.Summary.Count
	if metrics.Summary.Count > 0 {
		result.AverageValueMinor = metrics.Summary.TotalMinor / metrics.Summary.Count
	}
	result.HighestIncomeMinor = metrics.Summary.HighestIncome
	result.HighestExpenseMinor = metrics.Summary.HighestExpense
	result.AmountReceivedMinor = metrics.Summary.IncomeMinor
	result.AmountPaidMinor = metrics.Summary.SpendingMinor
	result.DashboardAnalytics = metrics.Analytics
	recent, err := s.loadDashboardRecentTransactions(ctx, workspaceID, actorID, query, metrics.RecentIDs)
	if err != nil {
		return err
	}
	result.Recent = recent
	result.RecentActivity = make([]DashboardActivity, 0, len(recent))
	for _, transaction := range recent {
		occurredAt := effectiveTransactionDate(transaction)
		label := valueOrDefault(strings.TrimSpace(transaction.Merchant), valueOrDefault(strings.TrimSpace(transaction.Category), friendlyTransactionType(transaction.Type)))
		result.RecentActivity = append(result.RecentActivity, dashboardActivityForTransaction(transaction, label, occurredAt, result.Currency))
	}
	if metrics.LargestIncome != "" {
		transaction, err := s.loadDashboardTransaction(ctx, workspaceID, actorID, metrics.LargestIncome)
		if err != nil {
			return err
		}
		if transaction != nil {
			label := valueOrDefault(strings.TrimSpace(transaction.Merchant), valueOrDefault(strings.TrimSpace(transaction.Category), friendlyTransactionType(transaction.Type)))
			result.MonthDetails.LargestIncome = dashboardActivityForTransaction(*transaction, label, effectiveTransactionDate(*transaction), result.Currency)
		}
	}
	if metrics.LargestExpense != "" {
		transaction, err := s.loadDashboardTransaction(ctx, workspaceID, actorID, metrics.LargestExpense)
		if err != nil {
			return err
		}
		if transaction != nil {
			label := valueOrDefault(strings.TrimSpace(transaction.Merchant), valueOrDefault(strings.TrimSpace(transaction.Category), friendlyTransactionType(transaction.Type)))
			result.MonthDetails.LargestExpense = dashboardActivityForTransaction(*transaction, label, effectiveTransactionDate(*transaction), result.Currency)
		}
	}
	return nil
}

type dashboardGoalAggregate struct {
	TotalGoals            int64 `bson:"total_goals"`
	ActiveCount           int64 `bson:"active_count"`
	ExpectedIncomeMinor   int64 `bson:"expected_income_minor"`
	ExpectedPaymentsMinor int64 `bson:"expected_payments_minor"`
	SavingsTargetMinor    int64 `bson:"savings_target_minor"`
	DueSoonCount          int64 `bson:"due_soon_count"`
	DueTodayCount         int64 `bson:"due_today_count"`
	OverdueCount          int64 `bson:"overdue_count"`
	AchievedCount         int64 `bson:"achieved_count"`
	PartialCount          int64 `bson:"partial_count"`
	TargetMinor           int64 `bson:"target_minor"`
	CurrentMinor          int64 `bson:"current_minor"`
	PendingMinor          int64 `bson:"pending_minor"`
	AchievedMinor         int64 `bson:"achieved_minor"`
}

type dashboardGoalAggregateFacet struct {
	All     []dashboardGoalAggregate `bson:"all"`
	Period  []dashboardGoalAggregate `bson:"period"`
	Nearest []DashboardGoalItem      `bson:"nearest"`
}

func goalEffectiveDueExpression() repository.Filter {
	return repository.Filter{"$ifNull": []any{"$due_date", "$target_date"}}
}

func goalStatusExpression(now, today, tomorrow, soonEnd time.Time) repository.Filter {
	dueSet := repository.Filter{"$ne": []any{"$effective_due", nil}}
	achieved := repository.Filter{"$and": []any{
		repository.Filter{"$gt": []any{"$target_minor", 0}},
		repository.Filter{"$gte": []any{"$current_minor", "$target_minor"}},
	}}
	activeDue := repository.Filter{"$and": []any{dueSet, repository.Filter{"$lt": []any{"$effective_due", today}}}}
	dueToday := repository.Filter{"$and": []any{dueSet, repository.Filter{"$gte": []any{"$effective_due", today}}, repository.Filter{"$lt": []any{"$effective_due", tomorrow}}}}
	dueSoon := repository.Filter{"$and": []any{dueSet, repository.Filter{"$gte": []any{"$effective_due", tomorrow}}, repository.Filter{"$lt": []any{"$effective_due", soonEnd}}}}
	return repository.Filter{"$switch": repository.Filter{"branches": []repository.Filter{
		{"case": repository.Filter{"$ne": []any{"$cancelled_at", nil}}, "then": model.GoalStatusCancelled},
		{"case": achieved, "then": model.GoalStatusAchieved},
		{"case": activeDue, "then": model.GoalStatusOverdue},
		{"case": dueToday, "then": model.GoalStatusDueToday},
		{"case": dueSoon, "then": model.GoalStatusDueSoon},
		{"case": repository.Filter{"$gt": []any{"$current_minor", 0}}, "then": model.GoalStatusInProgress},
	}, "default": model.GoalStatusNotStarted}}
}

func dashboardGoalGroup() repository.Filter {
	active := repository.Filter{"$and": []any{
		repository.Filter{"$ne": []any{"$goal_status", model.GoalStatusCancelled}},
		repository.Filter{"$ne": []any{"$goal_status", model.GoalStatusAchieved}},
	}}
	group := repository.Filter{"_id": nil}
	group["total_goals"] = repository.Filter{"$sum": 1}
	group["active_count"] = dashboardGoalConditionalSum(active, 1, 0)
	group["expected_income_minor"] = dashboardGoalConditionalSum(dashboardGoalDirection(active, model.GoalDirectionReceive), "$remaining_minor", 0)
	group["expected_payments_minor"] = dashboardGoalConditionalSum(dashboardGoalDirection(active, model.GoalDirectionPay), "$remaining_minor", 0)
	group["savings_target_minor"] = dashboardGoalConditionalSum(dashboardGoalDirection(active, model.GoalDirectionSave), "$remaining_minor", 0)
	group["due_soon_count"] = dashboardGoalConditionalSum(repository.Filter{"$eq": []any{"$goal_status", model.GoalStatusDueSoon}}, 1, 0)
	group["due_today_count"] = dashboardGoalConditionalSum(repository.Filter{"$eq": []any{"$goal_status", model.GoalStatusDueToday}}, 1, 0)
	group["overdue_count"] = dashboardGoalConditionalSum(repository.Filter{"$eq": []any{"$goal_status", model.GoalStatusOverdue}}, 1, 0)
	group["achieved_count"] = dashboardGoalConditionalSum(repository.Filter{"$eq": []any{"$goal_status", model.GoalStatusAchieved}}, 1, 0)
	partial := repository.Filter{"$and": []any{active, repository.Filter{"$gt": []any{"$current_minor", 0}}}}
	group["partial_count"] = dashboardGoalConditionalSum(partial, 1, 0)
	notCancelled := repository.Filter{"$ne": []any{"$goal_status", model.GoalStatusCancelled}}
	group["target_minor"] = dashboardGoalConditionalSum(notCancelled, "$target_minor", 0)
	group["current_minor"] = dashboardGoalConditionalSum(notCancelled, "$current_minor", 0)
	group["pending_minor"] = dashboardGoalConditionalSum(active, "$remaining_minor", 0)
	group["achieved_minor"] = dashboardGoalConditionalSum(repository.Filter{"$eq": []any{"$goal_status", model.GoalStatusAchieved}}, "$current_minor", 0)
	return repository.Filter{"$group": group}
}

func dashboardGoalDirection(active repository.Filter, direction string) repository.Filter {
	return repository.Filter{
		"$and": []any{
			active,
			repository.Filter{"$eq": []any{"$direction", direction}},
		},
	}
}

func dashboardGoalConditionalSum(condition repository.Filter, whenTrue, whenFalse any) repository.Filter {
	return repository.Filter{"$sum": repository.Filter{"$cond": []any{condition, whenTrue, whenFalse}}}
}

func dashboardGoalPipeline(base repository.Filter, dateRange DateRange, now time.Time) repository.Pipeline {
	today := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)
	tomorrow := today.AddDate(0, 0, 1)
	soonEnd := today.AddDate(0, 0, 8)
	periodPipeline := repository.Pipeline{}
	if dateRange.From != nil || dateRange.To != nil {
		relevant := []repository.Filter{}
		if dateRange.From != nil || dateRange.To != nil {
			due := repository.Filter{}
			if dateRange.From != nil {
				due["$gte"] = dateRange.From.UTC()
			}
			if dateRange.To != nil {
				due["$lt"] = dateRange.To.UTC()
			}
			relevant = append(relevant, repository.Filter{"effective_due": due}, repository.Filter{"completion_date": due}, repository.Filter{"start_date": due})
		}
		periodPipeline = append(periodPipeline, repository.Filter{"$match": repository.Filter{"$or": relevant}})
	}
	goalSet := repository.Filter{
		"effective_due":   goalEffectiveDueExpression(),
		"remaining_minor": repository.Filter{"$cond": []any{repository.Filter{"$gt": []any{"$target_minor", "$current_minor"}}, repository.Filter{"$subtract": []any{"$target_minor", "$current_minor"}}, 0}},
	}
	goalSet["goal_status"] = goalStatusExpression(now, today, tomorrow, soonEnd)
	nearest := repository.Pipeline{
		{"$match": repository.Filter{"goal_status": repository.Filter{"$nin": []string{model.GoalStatusCancelled, model.GoalStatusAchieved}}, "effective_due": repository.Filter{"$ne": nil}}},
		{"$sort": repository.Filter{"effective_due": 1, "_id": 1}},
		{"$limit": 1},
		{"$project": repository.Filter{"_id": 1, "name": 1, "type": 1, "direction": 1, "goal_status": 1, "target_minor": 1, "current_minor": 1, "remaining_minor": 1, "currency": 1, "effective_due": 1}},
	}
	periodFacet := repository.Pipeline{}
	periodFacet = append(periodFacet, periodPipeline...)
	periodFacet = append(periodFacet, dashboardGoalGroup())
	return repository.Pipeline{
		{"$match": base},
		{"$set": goalSet},
		{"$facet": repository.Filter{
			"all":     repository.Pipeline{dashboardGoalGroup()},
			"period":  periodFacet,
			"nearest": nearest,
		}},
	}
}

func dashboardGoalSummaryFromAggregate(input dashboardGoalAggregate) DashboardGoalSummary {
	result := DashboardGoalSummary{
		ActiveCount:           input.ActiveCount,
		ExpectedIncomeMinor:   input.ExpectedIncomeMinor,
		ExpectedPaymentsMinor: input.ExpectedPaymentsMinor,
		SavingsTargetMinor:    input.SavingsTargetMinor,
		DueSoonCount:          input.DueSoonCount,
		DueTodayCount:         input.DueTodayCount,
		OverdueCount:          input.OverdueCount,
		AchievedCount:         input.AchievedCount,
		PartialCount:          input.PartialCount,
		PendingMinor:          input.PendingMinor,
		AchievedMinor:         input.AchievedMinor,
	}
	if input.TargetMinor > 0 {
		percent := float64(input.CurrentMinor) / float64(input.TargetMinor) * 100
		result.CompletionPercent = &percent
	}
	return result
}

func (s *FinanceService) aggregateDashboardGoals(ctx context.Context, workspaceID, actorID string, vaultIDs []string, dateRange DateRange, now time.Time) (DashboardGoalSummary, DashboardGoalSummary, *DashboardGoalItem, error) {
	if !supportsExactDashboardAggregation(s.store) {
		return DashboardGoalSummary{}, DashboardGoalSummary{}, nil, errExactDashboardAggregationUnavailable
	}
	base := repository.Filter{
		"workspace_id": workspaceID,
		"$and": []repository.Filter{
			{"$or": []repository.Filter{{"vault_id": repository.Filter{"$in": vaultIDs}}, {"vault_id": ""}, {"vault_id": repository.Filter{"$exists": false}}}},
			goalVisibilityFilter(actorID),
		},
	}
	var facets []dashboardGoalAggregateFacet
	if err := s.store.Aggregate(ctx, "goals", dashboardGoalPipeline(base, dateRange, now), &facets); err != nil {
		return DashboardGoalSummary{}, DashboardGoalSummary{}, nil, err
	}
	if len(facets) == 0 {
		return DashboardGoalSummary{}, DashboardGoalSummary{}, nil, nil
	}
	var all, period dashboardGoalAggregate
	if len(facets[0].All) > 0 {
		all = facets[0].All[0]
	}
	if len(facets[0].Period) > 0 {
		period = facets[0].Period[0]
	}
	var nearest *DashboardGoalItem
	if len(facets[0].Nearest) > 0 {
		nearest = &facets[0].Nearest[0]
	}
	return dashboardGoalSummaryFromAggregate(period), dashboardGoalSummaryFromAggregate(all), nearest, nil
}

func dashboardGoalHighlights(ctx context.Context, store repository.Store, workspaceID, actorID string, vaultIDs []string, dateRange DateRange, now time.Time) ([]DashboardGoalItem, error) {
	filter := repository.Filter{
		"workspace_id": workspaceID,
		"$and": []repository.Filter{
			{"$or": []repository.Filter{{"vault_id": repository.Filter{"$in": vaultIDs}}, {"vault_id": ""}, {"vault_id": repository.Filter{"$exists": false}}}},
			goalVisibilityFilter(actorID),
		},
	}
	if dateRange.From != nil || dateRange.To != nil {
		due := repository.Filter{}
		if dateRange.From != nil {
			due["$gte"] = dateRange.From.UTC()
		}
		if dateRange.To != nil {
			due["$lt"] = dateRange.To.UTC()
		}
		filter["$or"] = []repository.Filter{
			{"due_date": due},
			{"target_date": due},
			{"completion_date": due},
			{"start_date": due},
		}
	}
	var goals []model.Goal
	if err := store.FindMany(ctx, "goals", filter, &goals, dashboardGoalHighlightLimit, 0, repository.Sort{"due_date": 1, "target_date": 1, "created_at": -1}); err != nil {
		return nil, err
	}
	result := make([]DashboardGoalItem, 0, len(goals))
	for index := range goals {
		goals[index].ApplyDerived(now)
		due := goals[index].EffectiveDueDate()
		result = append(result, DashboardGoalItem{ID: goals[index].ID, Name: goals[index].Name, Type: goals[index].Type, Direction: goals[index].Direction, Status: goals[index].Status, TargetMinor: goals[index].TargetMinor, CurrentMinor: goals[index].CurrentMinor, RemainingMinor: goals[index].RemainingMinor, Currency: goals[index].Currency, DueDate: due})
	}
	return result, nil
}

func dashboardInsightList(dashboard Dashboard) []DashboardInsight {
	result := make([]DashboardInsight, 0, 5)
	if dashboard.IncomeMinor == 0 {
		result = append(result, DashboardInsight{Kind: "income", Title: "No income recorded", Detail: "There is no actual income in this period.", Currency: dashboard.Currency})
	}
	if dashboard.PreviousComparison != nil && dashboard.PreviousComparison.Expenses.Percent != nil {
		percent := *dashboard.PreviousComparison.Expenses.Percent
		result = append(result, DashboardInsight{Kind: "spending_change", Title: "Spending changed", Detail: "Spending changed versus the equivalent previous period.", Percent: &percent, Currency: dashboard.Currency})
	}
	if len(dashboard.TopCategories) > 0 && dashboard.SpendingMinor > 0 {
		share := float64(dashboard.TopCategories[0].AmountMinor) / float64(dashboard.SpendingMinor) * 100
		result = append(result, DashboardInsight{Kind: "category_share", Title: "Top spending category", Detail: dashboard.TopCategories[0].Name + " is the largest spending category.", MetricMinor: dashboard.TopCategories[0].AmountMinor, Percent: &share, Currency: dashboard.Currency})
	}
	if dashboard.GoalSummary.DueSoonCount > 0 || dashboard.GoalSummary.DueTodayCount > 0 {
		result = append(result, DashboardInsight{Kind: "goal_due", Title: "Goal due soon", Detail: "At least one goal needs attention soon.", Currency: dashboard.Currency})
	}
	for _, contact := range dashboard.ByContact {
		outstanding := contact.PaidMinor - contact.IncomeMinor
		if outstanding > 0 {
			result = append(result, DashboardInsight{Kind: "contact_outstanding", Title: "Highest outstanding contact", Detail: contact.Name + " has the highest paid-over-received amount.", MetricMinor: outstanding, Currency: dashboard.Currency})
			break
		}
	}
	return result
}
