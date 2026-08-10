package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type Dashboard struct {
	Currency            string               `json:"currency"`
	BalanceMinor        int64                `json:"balanceMinor"`
	IncomeMinor         int64                `json:"incomeMinor"`
	SpendingMinor       int64                `json:"spendingMinor"`
	TransactionCount    int64                `json:"transactionCount"`
	AverageValueMinor   int64                `json:"averageValueMinor"`
	HighestIncomeMinor  int64                `json:"highestIncomeMinor"`
	HighestExpenseMinor int64                `json:"highestExpenseMinor"`
	AmountReceivedMinor int64                `json:"amountReceivedMinor"`
	AmountPaidMinor     int64                `json:"amountPaidMinor"`
	PendingGoalMinor    int64                `json:"pendingGoalMinor"`
	AchievedGoalMinor   int64                `json:"achievedGoalMinor"`
	GoalSummary         DashboardGoalSummary `json:"goalSummary"`
	AllActiveGoals      DashboardGoalSummary `json:"allActiveGoals"`
	GoalHighlights      []DashboardGoalItem  `json:"goalHighlights"`
	Insights            []DashboardInsight   `json:"insights"`
	PreviousComparison  *DashboardComparison `json:"previousComparison,omitempty"`
	Recent              []model.Transaction  `json:"recentTransactions"`
	PendingApprovals    int64                `json:"pendingApprovals"`
	UnreadNotifications int64                `json:"unreadNotifications"`
	DashboardAnalytics
}

type DashboardAnalytics struct {
	ByCategory     []DashboardCategoryInsight `json:"byCategory"`
	BySource       []DashboardCategoryInsight `json:"bySource"`
	ByContact      []DashboardContactInsight  `json:"byContact"`
	ByAccount      []DashboardAccountInsight  `json:"byAccount"`
	ByType         []DashboardCategoryInsight `json:"byType"`
	Cashflow       []DashboardCashflowPoint   `json:"cashflow"`
	MonthlyTrend   []DashboardCashflowPoint   `json:"monthlyTrend"`
	RecentActivity []DashboardActivity        `json:"recentActivity"`
	TopCategories  []DashboardCategoryInsight `json:"topCategories"`
	MonthDetails   DashboardMonthDetails      `json:"monthDetails"`
}

type DashboardMetricChange struct {
	CurrentMinor  int64    `json:"currentMinor"`
	PreviousMinor int64    `json:"previousMinor"`
	DeltaMinor    int64    `json:"deltaMinor"`
	Percent       *float64 `json:"percent,omitempty"`
}

type DashboardComparison struct {
	From           time.Time             `json:"from"`
	To             time.Time             `json:"to"`
	Income         DashboardMetricChange `json:"income"`
	Expenses       DashboardMetricChange `json:"expenses"`
	Net            DashboardMetricChange `json:"net"`
	TransactionCnt DashboardMetricChange `json:"transactionCount"`
	AverageValue   DashboardMetricChange `json:"averageValue"`
}

type DashboardContactInsight struct {
	ID          string    `json:"id,omitempty"`
	Name        string    `json:"name"`
	IncomeMinor int64     `json:"incomeMinor"`
	PaidMinor   int64     `json:"paidMinor"`
	NetMinor    int64     `json:"netMinor"`
	Count       int64     `json:"count"`
	LatestDate  time.Time `json:"latestDate,omitempty"`
	Currency    string    `json:"currency,omitempty"`
}

type DashboardAccountInsight struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	IncomeMinor int64  `json:"incomeMinor"`
	PaidMinor   int64  `json:"paidMinor"`
	NetMinor    int64  `json:"netMinor"`
	Count       int64  `json:"count"`
	Currency    string `json:"currency,omitempty"`
}

type DashboardGoalItem struct {
	ID             string     `bson:"_id" json:"id"`
	Name           string     `bson:"name" json:"name"`
	Type           string     `bson:"type" json:"type,omitempty"`
	Direction      string     `bson:"direction" json:"direction,omitempty"`
	Status         string     `bson:"goal_status" json:"status"`
	TargetMinor    int64      `bson:"target_minor" json:"targetMinor"`
	CurrentMinor   int64      `bson:"current_minor" json:"currentMinor"`
	RemainingMinor int64      `bson:"remaining_minor" json:"remainingMinor"`
	Currency       string     `bson:"currency" json:"currency"`
	DueDate        *time.Time `bson:"effective_due" json:"dueDate,omitempty"`
}

type DashboardGoalSummary struct {
	ActiveCount           int64              `json:"activeCount"`
	ExpectedIncomeMinor   int64              `json:"expectedIncomeMinor"`
	ExpectedPaymentsMinor int64              `json:"expectedPaymentsMinor"`
	SavingsTargetMinor    int64              `json:"savingsTargetMinor"`
	DueSoonCount          int64              `json:"dueSoonCount"`
	DueTodayCount         int64              `json:"dueTodayCount"`
	OverdueCount          int64              `json:"overdueCount"`
	AchievedCount         int64              `json:"achievedCount"`
	PartialCount          int64              `json:"partialCount"`
	CompletionPercent     *float64           `json:"completionPercent,omitempty"`
	PendingMinor          int64              `json:"pendingMinor"`
	AchievedMinor         int64              `json:"achievedMinor"`
	NearestDue            *DashboardGoalItem `json:"nearestDue,omitempty"`
}

type DashboardInsight struct {
	Kind        string   `json:"kind"`
	Title       string   `json:"title"`
	Detail      string   `json:"detail"`
	MetricMinor int64    `json:"metricMinor,omitempty"`
	Percent     *float64 `json:"percent,omitempty"`
	Currency    string   `json:"currency,omitempty"`
}

type DashboardMonthDetails struct {
	OpeningBalanceMinor  *int64                         `json:"openingBalanceMinor,omitempty"`
	ClosingBalanceMinor  *int64                         `json:"closingBalanceMinor,omitempty"`
	LargestIncome        DashboardActivity              `json:"largestIncome,omitempty"`
	LargestExpense       DashboardActivity              `json:"largestExpense,omitempty"`
	MostActiveDay        string                         `json:"mostActiveDay,omitempty"`
	TopSpendingCategory  string                         `json:"topSpendingCategory,omitempty"`
	HighestValueContact  DashboardContactInsight        `json:"highestValueContact,omitempty"`
	RepeatedTransactions []DashboardRepeatedTransaction `json:"repeatedTransactions"`
}

type DashboardRepeatedTransaction struct {
	Label       string `json:"label"`
	Category    string `json:"category,omitempty"`
	Type        string `json:"type"`
	AmountMinor int64  `json:"amountMinor"`
	Count       int64  `json:"count"`
	Currency    string `json:"currency"`
}

type DashboardCategoryInsight struct {
	Name        string `json:"name"`
	Category    string `json:"category,omitempty"`
	Merchant    string `json:"merchant,omitempty"`
	Type        string `json:"type,omitempty"`
	AmountMinor int64  `json:"amountMinor"`
	Count       int64  `json:"count"`
	Currency    string `json:"currency,omitempty"`
}

type DashboardCashflowPoint struct {
	Period        string `json:"period"`
	IncomeMinor   int64  `json:"incomeMinor"`
	SpendingMinor int64  `json:"spendingMinor"`
	NetMinor      int64  `json:"netMinor"`
	Currency      string `json:"currency,omitempty"`
}

type DashboardActivity struct {
	ID            string                `json:"id"`
	TransactionID string                `json:"transactionId,omitempty"`
	Label         string                `json:"label"`
	Type          string                `json:"type"`
	Category      string                `json:"category,omitempty"`
	AccountID     string                `json:"accountId,omitempty"`
	ContactID     string                `json:"contactId,omitempty"`
	Contact       *model.ContactSummary `json:"contact,omitempty"`
	Creator       *model.CreatorSummary `json:"creator,omitempty"`
	Description   string                `json:"description,omitempty"`
	AmountMinor   int64                 `json:"amountMinor"`
	Currency      string                `json:"currency"`
	OccurredAt    time.Time             `json:"occurredAt"`
}

func emptyDashboardAnalytics() DashboardAnalytics {
	return DashboardAnalytics{
		ByCategory:     []DashboardCategoryInsight{},
		BySource:       []DashboardCategoryInsight{},
		ByContact:      []DashboardContactInsight{},
		ByAccount:      []DashboardAccountInsight{},
		ByType:         []DashboardCategoryInsight{},
		Cashflow:       []DashboardCashflowPoint{},
		MonthlyTrend:   []DashboardCashflowPoint{},
		RecentActivity: []DashboardActivity{},
		TopCategories:  []DashboardCategoryInsight{},
		MonthDetails:   DashboardMonthDetails{RepeatedTransactions: []DashboardRepeatedTransaction{}},
	}
}

func previousEquivalentDateRange(current DateRange) (DateRange, bool) {
	if current.From == nil || current.To == nil || !current.To.After(*current.From) {
		return DateRange{}, false
	}
	duration := current.To.Sub(*current.From)
	from := current.From.Add(-duration)
	to := *current.From
	return DateRange{From: &from, To: &to}, true
}

func metricChange(current, previous int64) DashboardMetricChange {
	delta := current - previous
	change := DashboardMetricChange{CurrentMinor: current, PreviousMinor: previous, DeltaMinor: delta}
	if previous != 0 {
		percent := float64(delta) / float64(previous) * 100
		change.Percent = &percent
	}
	return change
}

func (s *FinanceService) dashboardGoalTotals(ctx context.Context, workspaceID, actorID string, vaultIDs []string) (int64, int64, error) {
	if len(vaultIDs) == 0 {
		return 0, 0, nil
	}
	filter := repository.Filter{
		"workspace_id": workspaceID,
		"$and": []repository.Filter{
			{"$or": []repository.Filter{
				{"vault_id": repository.Filter{"$in": vaultIDs}},
				{"vault_id": ""},
				{"vault_id": repository.Filter{"$exists": false}},
			}},
			goalVisibilityFilter(actorID),
		},
	}
	var goals []model.Goal
	if err := s.store.FindMany(ctx, "goals", filter, &goals, dashboardFallbackDetailLimit, 0, repository.Sort{"due_date": 1, "created_at": -1}); err != nil {
		return 0, 0, err
	}
	var pending, achieved int64
	now := time.Now().UTC()
	for index := range goals {
		goals[index].ApplyDerived(now)
		var err error
		switch goals[index].Status {
		case model.GoalStatusAchieved:
			achieved, err = checkedAddMoney(achieved, goals[index].CurrentMinor)
		case model.GoalStatusCancelled:
			continue
		default:
			pending, err = checkedAddMoney(pending, goals[index].RemainingMinor)
		}
		if err != nil {
			return 0, 0, err
		}
	}
	return pending, achieved, nil
}

type transactionTypeTotal struct {
	Type  string `bson:"_id"`
	Total int64  `bson:"total"`
}

type transactionCategoryTotal struct {
	Key struct {
		Type     string `bson:"type"`
		Category string `bson:"category"`
	} `bson:"_id"`
	Total int64 `bson:"total"`
}

// These limits apply only to display samples. Production metrics are produced
// by aggregateDashboardTransactions and aggregateDashboardGoals, which never
// use a capped transaction/goal read for correctness.
const dashboardFallbackDetailLimit int64 = 10_000
const dashboardRecentLimit int64 = 10
const dashboardGoalHighlightLimit int64 = 30

// DashboardFilter narrows dashboard transaction aggregates to a UTC calendar
// month or an explicit half-open UTC date range. An omitted filter preserves
// the workspace's current financial-period behavior.
type DashboardFilter struct {
	Month   *time.Time
	From    *time.Time
	To      *time.Time
	AllTime bool
}

func (s *FinanceService) Dashboard(ctx context.Context, workspaceID, actorID string, filters ...DashboardFilter) (*Dashboard, error) {
	membership, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewBalances)
	if err != nil {
		return nil, err
	}
	if !hasPermission(*membership, model.PermViewTransactions) {
		return nil, ErrForbidden
	}
	workspace, err := s.requireWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	vaultIDs, err := s.accessibleVaultIDsUnchecked(ctx, workspaceID, actorID)
	if err != nil {
		return nil, err
	}
	accounts, err := s.visibleAccounts(ctx, workspaceID, actorID, vaultIDs)
	if err != nil {
		return nil, err
	}
	accounts = accountsInCurrency(accounts, workspace.Currency)
	visibleAccountIDs := accountIDs(accounts)
	selectedFilter := DashboardFilter{}
	if len(filters) > 0 {
		selectedFilter = filters[0]
	}
	dateRange, err := normalizeDateRange(DateRange{From: selectedFilter.From, To: selectedFilter.To})
	if err != nil {
		return nil, err
	}
	if selectedFilter.Month != nil && (dateRange.From != nil || dateRange.To != nil) {
		return nil, &FieldError{Field: "period", Message: "month cannot be combined with from or to"}
	}
	if selectedFilter.AllTime {
		dateRange = DateRange{}
	} else if selectedFilter.Month != nil {
		selectedMonth := selectedFilter.Month.UTC()
		monthStart := time.Date(selectedMonth.Year(), selectedMonth.Month(), 1, 0, 0, 0, 0, time.UTC)
		monthEnd := monthStart.AddDate(0, 1, 0)
		dateRange = DateRange{From: &monthStart, To: &monthEnd}
	} else if dateRange.From == nil && dateRange.To == nil {
		monthStart := financialPeriodStart(time.Now().UTC(), workspace.FinancialMonth)
		dateRange.From = &monthStart
	}
	query, empty, err := transactionQueryForScope(
		workspaceID,
		actorID,
		TransactionFilter{From: dateRange.From, To: dateRange.To},
		vaultIDs,
		visibleAccountIDs,
	)
	if err != nil {
		return nil, err
	}
	result := &Dashboard{Currency: workspace.Currency, DashboardAnalytics: emptyDashboardAnalytics()}
	for _, account := range accounts {
		if !account.ExcludeFromTotal {
			result.BalanceMinor, err = checkedAddMoney(result.BalanceMinor, account.BalanceMinor)
			if err != nil {
				return nil, err
			}
		}
	}
	if !empty {
		if supportsExactDashboardAggregation(s.store) {
			metrics, err := s.aggregateDashboardTransactions(ctx, workspaceID, actorID, query, accounts)
			if err != nil {
				return nil, err
			}
			if err := s.applyExactDashboardTransactions(ctx, workspaceID, actorID, query, result, metrics); err != nil {
				return nil, err
			}
		} else {
			var analyticsTransactions []model.Transaction
			if err := s.store.FindMany(
				ctx,
				"transactions",
				query,
				&analyticsTransactions,
				dashboardFallbackDetailLimit,
				0,
				repository.Sort{"occurred_at": -1},
			); err != nil {
				return nil, err
			}
			if err := s.hydrateTransactionCreators(ctx, actorID, analyticsTransactions); err != nil {
				return nil, err
			}
			analytics, err := buildDashboardAnalytics(analyticsTransactions, workspace.Currency)
			if err != nil {
				return nil, err
			}
			result.DashboardAnalytics = analytics
			summary, err := summarizeDashboardTransactions(analyticsTransactions)
			if err != nil {
				return nil, err
			}
			result.TransactionCount = summary.count
			result.AverageValueMinor = summary.average
			result.HighestIncomeMinor = summary.highestIncome
			result.HighestExpenseMinor = summary.highestExpense
			result.AmountReceivedMinor = summary.income
			result.AmountPaidMinor = summary.expenses

			var totals []transactionTypeTotal
			if err := s.store.Aggregate(ctx, "transactions", repository.Pipeline{
				{"$match": query},
				{"$group": repository.Filter{
					"_id":   "$type",
					"total": repository.Filter{"$sum": "$amount_minor"},
				}},
			}, &totals); err != nil {
				return nil, err
			}
			for _, total := range totals {
				switch total.Type {
				case "income", "refund", "reimbursement":
					result.IncomeMinor, err = checkedAddMoney(result.IncomeMinor, total.Total)
				case "expense":
					result.SpendingMinor, err = checkedAddMoney(result.SpendingMinor, total.Total)
				}
				if err != nil {
					return nil, err
				}
			}
			if len(totals) == 0 {
				// Some repository implementations may not expose aggregation for an
				// otherwise valid filtered read. Keep the response useful while the
				// production Mongo path remains server-side aggregated above.
				result.IncomeMinor = summary.income
				result.SpendingMinor = summary.expenses
			}
			if err := s.store.FindMany(
				ctx,
				"transactions",
				query,
				&result.Recent,
				10,
				0,
				repository.Sort{"occurred_at": -1},
			); err != nil {
				return nil, err
			}
			if err := s.hydrateTransactionCreators(ctx, actorID, result.Recent); err != nil {
				return nil, err
			}
		}
	}
	if !empty {
		previousRange, hasPrevious := previousEquivalentDateRange(dateRange)
		if hasPrevious {
			previousQuery, previousEmpty, err := transactionQueryForScope(
				workspaceID, actorID,
				TransactionFilter{From: previousRange.From, To: previousRange.To},
				vaultIDs, visibleAccountIDs,
			)
			if err != nil {
				return nil, err
			}
			if !previousEmpty {
				var previous dashboardTransactionSummary
				if supportsExactDashboardAggregation(s.store) {
					previousMetrics, aggregateErr := s.aggregateDashboardTransactions(ctx, workspaceID, actorID, previousQuery, accounts)
					if aggregateErr != nil {
						return nil, aggregateErr
					}
					previous = dashboardTransactionSummary{
						income:         previousMetrics.Summary.IncomeMinor,
						expenses:       previousMetrics.Summary.SpendingMinor,
						count:          previousMetrics.Summary.Count,
						highestIncome:  previousMetrics.Summary.HighestIncome,
						highestExpense: previousMetrics.Summary.HighestExpense,
					}
					if previous.count > 0 {
						previous.average = previousMetrics.Summary.TotalMinor / previous.count
					}
				} else {
					var previousTransactions []model.Transaction
					if err := s.store.FindMany(ctx, "transactions", previousQuery, &previousTransactions, dashboardFallbackDetailLimit, 0, repository.Sort{"occurred_at": -1}); err != nil {
						return nil, err
					}
					previous, err = summarizeDashboardTransactions(previousTransactions)
					if err != nil {
						return nil, err
					}
				}
				currentNet, err := checkedAddMoney(result.IncomeMinor, -result.SpendingMinor)
				if err != nil {
					return nil, err
				}
				previousNet, err := checkedAddMoney(previous.income, -previous.expenses)
				if err != nil {
					return nil, err
				}
				result.PreviousComparison = &DashboardComparison{
					From: *previousRange.From, To: *previousRange.To,
					Income:         metricChange(result.IncomeMinor, previous.income),
					Expenses:       metricChange(result.SpendingMinor, previous.expenses),
					Net:            metricChange(currentNet, previousNet),
					TransactionCnt: metricChange(result.TransactionCount, previous.count),
					AverageValue:   metricChange(result.AverageValueMinor, previous.average),
				}
			}
		}
	}
	now := time.Now().UTC()
	if supportsExactDashboardAggregation(s.store) {
		periodGoals, allGoals, nearestDue, aggregateErr := s.aggregateDashboardGoals(ctx, workspaceID, actorID, vaultIDs, dateRange, now)
		result.GoalSummary, result.AllActiveGoals, result.GoalSummary.NearestDue = periodGoals, allGoals, nearestDue
		err = aggregateErr
		if err != nil {
			return nil, err
		}
		result.PendingGoalMinor = result.GoalSummary.PendingMinor
		result.AchievedGoalMinor = result.GoalSummary.AchievedMinor
		result.AllActiveGoals.NearestDue = result.GoalSummary.NearestDue
		result.GoalHighlights, err = dashboardGoalHighlights(ctx, s.store, workspaceID, actorID, vaultIDs, dateRange, now)
		if err != nil {
			return nil, err
		}
	} else {
		result.PendingGoalMinor, result.AchievedGoalMinor, err = s.dashboardGoalTotals(ctx, workspaceID, actorID, vaultIDs)
		if err != nil {
			return nil, err
		}
		result.GoalSummary.PendingMinor = result.PendingGoalMinor
		result.GoalSummary.AchievedMinor = result.AchievedGoalMinor
	}
	result.Insights = dashboardInsightList(*result)
	if result.Recent == nil {
		result.Recent = []model.Transaction{}
	}
	if result.GoalHighlights == nil {
		result.GoalHighlights = []DashboardGoalItem{}
	}
	if result.Insights == nil {
		result.Insights = []DashboardInsight{}
	}
	if hasPermission(*membership, model.PermApproveExpenses) {
		if len(vaultIDs) > 0 {
			result.PendingApprovals, err = s.store.Count(ctx, "expense_claims", repository.Filter{
				"workspace_id": workspaceID,
				"vault_id":     repository.Filter{"$in": vaultIDs},
				"status":       "pending",
				"submitted_by": repository.Filter{"$ne": actorID},
			})
			if err != nil {
				return nil, err
			}
		}
	}
	result.UnreadNotifications, err = s.store.Count(ctx, "notifications", repository.Filter{"user_id": actorID, "read_at": nil})
	if err != nil {
		return nil, err
	}
	return result, nil
}

type dashboardCategoryAccumulator struct {
	amount int64
	count  int64
}

type dashboardCashflowAccumulator struct {
	income   int64
	spending int64
}

type dashboardContactAccumulator struct {
	id         string
	name       string
	income     int64
	paid       int64
	count      int64
	latestDate time.Time
	currency   string
}

type dashboardTypeAccumulator struct {
	total int64
	count int64
}

type dashboardRepeatedAccumulator struct {
	label    string
	category string
	typeName string
	amount   int64
	count    int64
	currency string
}

type dashboardTransactionSummary struct {
	income         int64
	expenses       int64
	count          int64
	average        int64
	highestIncome  int64
	highestExpense int64
}

func summarizeDashboardTransactions(transactions []model.Transaction) (dashboardTransactionSummary, error) {
	result := dashboardTransactionSummary{}
	for _, transaction := range transactions {
		result.count++
		var err error
		result.average, err = checkedAddMoney(result.average, transaction.AmountMinor)
		if err != nil {
			return result, err
		}
		switch transaction.Type {
		case "income", "refund", "reimbursement":
			result.income, err = checkedAddMoney(result.income, transaction.AmountMinor)
			if err != nil {
				return result, err
			}
			if transaction.AmountMinor > result.highestIncome {
				result.highestIncome = transaction.AmountMinor
			}
		case "expense":
			result.expenses, err = checkedAddMoney(result.expenses, transaction.AmountMinor)
			if err != nil {
				return result, err
			}
			if transaction.AmountMinor > result.highestExpense {
				result.highestExpense = transaction.AmountMinor
			}
		}
	}
	if result.count > 0 {
		result.average /= result.count
	}
	return result, nil
}

func buildDashboardAnalytics(transactions []model.Transaction, currency string) (DashboardAnalytics, error) {
	result := emptyDashboardAnalytics()
	ordered := append([]model.Transaction(nil), transactions...)
	sort.SliceStable(ordered, func(left, right int) bool {
		leftAt := effectiveTransactionDate(ordered[left])
		rightAt := effectiveTransactionDate(ordered[right])
		return leftAt.After(rightAt)
	})
	categories := make(map[string]*dashboardCategoryAccumulator)
	sources := make(map[string]*dashboardCategoryAccumulator)
	contacts := make(map[string]*dashboardContactAccumulator)
	types := make(map[string]*dashboardTypeAccumulator)
	repeated := make(map[string]*dashboardRepeatedAccumulator)
	activeDays := make(map[string]int64)
	daily := make(map[string]*dashboardCashflowAccumulator)
	monthly := make(map[string]*dashboardCashflowAccumulator)
	activities := make([]DashboardActivity, 0, minInt(len(ordered), 10))
	var largestIncome, largestExpense DashboardActivity

	for _, transaction := range ordered {
		occurredAt := effectiveTransactionDate(transaction)
		if occurredAt.IsZero() {
			continue
		}
		occurredAt = occurredAt.UTC()
		dailyPeriod := occurredAt.Format("2006-01-02")
		monthlyPeriod := occurredAt.Format("2006-01")
		activeDays[dailyPeriod]++
		dailyPoint := daily[dailyPeriod]
		if dailyPoint == nil {
			dailyPoint = &dashboardCashflowAccumulator{}
			daily[dailyPeriod] = dailyPoint
		}
		monthlyPoint := monthly[monthlyPeriod]
		if monthlyPoint == nil {
			monthlyPoint = &dashboardCashflowAccumulator{}
			monthly[monthlyPeriod] = monthlyPoint
		}

		label := valueOrDefault(strings.TrimSpace(transaction.Merchant), valueOrDefault(strings.TrimSpace(transaction.Category), friendlyTransactionType(transaction.Type)))
		typeAccumulator := types[transaction.Type]
		if typeAccumulator == nil {
			typeAccumulator = &dashboardTypeAccumulator{}
			types[transaction.Type] = typeAccumulator
		}
		var err error
		typeAccumulator.total, err = checkedAddMoney(typeAccumulator.total, transaction.AmountMinor)
		if err != nil {
			return result, err
		}
		typeAccumulator.count++
		repeatKey := strings.ToLower(strings.Join([]string{label, transaction.Category, transaction.Type, fmt.Sprintf("%d", transaction.AmountMinor)}, "\x00"))
		repeat := repeated[repeatKey]
		if repeat == nil {
			repeat = &dashboardRepeatedAccumulator{label: label, category: strings.TrimSpace(transaction.Category), typeName: transaction.Type, amount: transaction.AmountMinor, currency: transaction.Currency}
			repeated[repeatKey] = repeat
		}
		repeat.count++

		switch transaction.Type {
		case "income", "refund", "reimbursement":
			dailyPoint.income, err = checkedAddMoney(dailyPoint.income, transaction.AmountMinor)
			if err != nil {
				return result, err
			}
			monthlyPoint.income, err = checkedAddMoney(monthlyPoint.income, transaction.AmountMinor)
			if err != nil {
				return result, err
			}
			source := label
			sourceAccumulator := sources[source]
			if sourceAccumulator == nil {
				sourceAccumulator = &dashboardCategoryAccumulator{}
				sources[source] = sourceAccumulator
			}
			sourceAccumulator.amount, err = checkedAddMoney(sourceAccumulator.amount, transaction.AmountMinor)
			if err != nil {
				return result, err
			}
			sourceAccumulator.count++
			activity := dashboardActivityForTransaction(transaction, label, occurredAt, currency)
			if largestIncome.ID == "" || activity.AmountMinor > largestIncome.AmountMinor {
				largestIncome = activity
			}
		case "expense":
			dailyPoint.spending, err = checkedAddMoney(dailyPoint.spending, transaction.AmountMinor)
			if err != nil {
				return result, err
			}
			monthlyPoint.spending, err = checkedAddMoney(monthlyPoint.spending, transaction.AmountMinor)
			if err != nil {
				return result, err
			}
			category := valueOrDefault(strings.TrimSpace(transaction.Category), "Uncategorised")
			accumulator := categories[category]
			if accumulator == nil {
				accumulator = &dashboardCategoryAccumulator{}
				categories[category] = accumulator
			}
			accumulator.amount, err = checkedAddMoney(accumulator.amount, transaction.AmountMinor)
			if err != nil {
				return result, err
			}
			accumulator.count++
			activity := dashboardActivityForTransaction(transaction, label, occurredAt, currency)
			if largestExpense.ID == "" || activity.AmountMinor > largestExpense.AmountMinor {
				largestExpense = activity
			}
		}

		if transaction.ContactID != "" || transaction.Contact != nil {
			contactID := transaction.ContactID
			contactName := contactID
			if transaction.Contact != nil {
				contactName = transaction.Contact.Name
			}
			key := contactID + "\x00" + contactName
			contact := contacts[key]
			if contact == nil {
				contact = &dashboardContactAccumulator{id: contactID, name: valueOrDefault(contactName, "Contact")}
				contacts[key] = contact
			}
			contact.count++
			contact.currency = transaction.Currency
			if occurredAt.After(contact.latestDate) {
				contact.latestDate = occurredAt
			}
			switch transaction.Type {
			case "income", "refund", "reimbursement":
				contact.income, err = checkedAddMoney(contact.income, transaction.AmountMinor)
			case "expense":
				contact.paid, err = checkedAddMoney(contact.paid, transaction.AmountMinor)
			}
			if err != nil {
				return result, err
			}
		}

		if len(activities) < 10 {
			activities = append(activities, dashboardActivityForTransaction(transaction, label, occurredAt, currency))
		}
	}

	categoryNames := make([]string, 0, len(categories))
	for category := range categories {
		categoryNames = append(categoryNames, category)
	}
	sort.Strings(categoryNames)
	for _, category := range categoryNames {
		accumulator := categories[category]
		result.ByCategory = append(result.ByCategory, DashboardCategoryInsight{
			Name:        category,
			Category:    category,
			Type:        "expense",
			AmountMinor: accumulator.amount,
			Count:       accumulator.count,
			Currency:    currency,
		})
	}
	result.TopCategories = append(result.TopCategories, result.ByCategory...)
	sort.SliceStable(result.TopCategories, func(left, right int) bool {
		if result.TopCategories[left].AmountMinor != result.TopCategories[right].AmountMinor {
			return result.TopCategories[left].AmountMinor > result.TopCategories[right].AmountMinor
		}
		return result.TopCategories[left].Name < result.TopCategories[right].Name
	})
	if len(result.TopCategories) > 5 {
		result.TopCategories = result.TopCategories[:5]
	}
	for source, accumulator := range sources {
		result.BySource = append(result.BySource, DashboardCategoryInsight{Name: source, Merchant: source, Type: "income", AmountMinor: accumulator.amount, Count: accumulator.count, Currency: currency})
	}
	sort.SliceStable(result.BySource, func(left, right int) bool {
		if result.BySource[left].AmountMinor != result.BySource[right].AmountMinor {
			return result.BySource[left].AmountMinor > result.BySource[right].AmountMinor
		}
		return result.BySource[left].Name < result.BySource[right].Name
	})
	for typeName, accumulator := range types {
		result.ByType = append(result.ByType, DashboardCategoryInsight{Name: friendlyTransactionType(typeName), Type: typeName, AmountMinor: accumulator.total, Count: accumulator.count, Currency: currency})
	}
	sort.SliceStable(result.ByType, func(left, right int) bool { return result.ByType[left].Name < result.ByType[right].Name })
	for _, contact := range contacts {
		result.ByContact = append(result.ByContact, DashboardContactInsight{ID: contact.id, Name: contact.name, IncomeMinor: contact.income, PaidMinor: contact.paid, NetMinor: contact.income - contact.paid, Count: contact.count, LatestDate: contact.latestDate, Currency: contact.currency})
	}
	sort.SliceStable(result.ByContact, func(left, right int) bool {
		leftTotal := result.ByContact[left].IncomeMinor + result.ByContact[left].PaidMinor
		rightTotal := result.ByContact[right].IncomeMinor + result.ByContact[right].PaidMinor
		if leftTotal != rightTotal {
			return leftTotal > rightTotal
		}
		return result.ByContact[left].Name < result.ByContact[right].Name
	})
	mostActiveDay := ""
	var mostActiveCount int64
	for day, count := range activeDays {
		if count > mostActiveCount || (count == mostActiveCount && (mostActiveDay == "" || day < mostActiveDay)) {
			mostActiveDay, mostActiveCount = day, count
		}
	}
	result.MonthDetails.LargestIncome = largestIncome
	result.MonthDetails.LargestExpense = largestExpense
	result.MonthDetails.MostActiveDay = mostActiveDay
	if len(result.TopCategories) > 0 {
		result.MonthDetails.TopSpendingCategory = result.TopCategories[0].Name
	}
	if len(result.ByContact) > 0 {
		result.MonthDetails.HighestValueContact = result.ByContact[0]
	}
	for _, repeat := range repeated {
		if repeat.count < 2 {
			continue
		}
		result.MonthDetails.RepeatedTransactions = append(result.MonthDetails.RepeatedTransactions, DashboardRepeatedTransaction{Label: repeat.label, Category: repeat.category, Type: repeat.typeName, AmountMinor: repeat.amount, Count: repeat.count, Currency: repeat.currency})
	}
	sort.SliceStable(result.MonthDetails.RepeatedTransactions, func(left, right int) bool {
		if result.MonthDetails.RepeatedTransactions[left].Count != result.MonthDetails.RepeatedTransactions[right].Count {
			return result.MonthDetails.RepeatedTransactions[left].Count > result.MonthDetails.RepeatedTransactions[right].Count
		}
		return result.MonthDetails.RepeatedTransactions[left].Label < result.MonthDetails.RepeatedTransactions[right].Label
	})
	if len(result.MonthDetails.RepeatedTransactions) > 10 {
		result.MonthDetails.RepeatedTransactions = result.MonthDetails.RepeatedTransactions[:10]
	}

	result.Cashflow = dashboardCashflowPoints(daily, currency)
	result.MonthlyTrend = dashboardCashflowPoints(monthly, currency)
	result.RecentActivity = activities
	return result, nil
}

func dashboardActivityForTransaction(transaction model.Transaction, label string, occurredAt time.Time, currency string) DashboardActivity {
	return DashboardActivity{
		ID: transaction.ID, TransactionID: transaction.TransactionID, Label: label, Type: transaction.Type, Category: strings.TrimSpace(transaction.Category),
		AccountID: transaction.AccountID, ContactID: transaction.ContactID, Contact: transaction.Contact,
		Creator: transaction.Creator, Description: transaction.Description, AmountMinor: transaction.AmountMinor,
		Currency: valueOrDefault(transaction.Currency, currency), OccurredAt: occurredAt,
	}
}

func dashboardCashflowPoints(
	points map[string]*dashboardCashflowAccumulator,
	currency string,
) []DashboardCashflowPoint {
	periods := make([]string, 0, len(points))
	for period := range points {
		periods = append(periods, period)
	}
	sort.Strings(periods)
	result := make([]DashboardCashflowPoint, 0, len(periods))
	for _, period := range periods {
		point := points[period]
		result = append(result, DashboardCashflowPoint{
			Period:        period,
			IncomeMinor:   point.income,
			SpendingMinor: point.spending,
			NetMinor:      point.income - point.spending,
			Currency:      currency,
		})
	}
	return result
}

func friendlyTransactionType(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "Transaction"
	}
	return strings.ToUpper(value[:1]) + value[1:]
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}

type SearchResult struct {
	Transactions []model.Transaction `json:"transactions"`
	Vaults       []model.Vault       `json:"vaults"`
	Accounts     []model.Account     `json:"accounts"`
}

func (s *FinanceService) Search(ctx context.Context, workspaceID, actorID, query string) (*SearchResult, error) {
	membership, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions)
	if err != nil {
		return nil, err
	}
	canViewAssets := hasPermission(*membership, model.PermViewVault) &&
		hasPermission(*membership, model.PermViewBalances)
	query = strings.TrimSpace(query)
	if len([]rune(query)) < 2 || len([]rune(query)) > 100 {
		return nil, &FieldError{Field: "q", Message: "must contain 2 to 100 characters"}
	}
	vaultIDs, err := s.accessibleVaultIDsUnchecked(ctx, workspaceID, actorID)
	if err != nil {
		return nil, err
	}
	textSearch := repository.Filter{"$search": query}
	result := &SearchResult{Transactions: []model.Transaction{}, Vaults: []model.Vault{}, Accounts: []model.Account{}}
	if len(vaultIDs) == 0 {
		return result, nil
	}
	if canViewAssets {
		if err := s.store.FindMany(ctx, "vaults", repository.Filter{
			"workspace_id": workspaceID, "_id": repository.Filter{"$in": vaultIDs}, "$text": textSearch,
		}, &result.Vaults, 20, 0, nil); err != nil {
			return nil, err
		}
	}
	accountIDs, err := s.accessibleAccountIDs(ctx, workspaceID, actorID, vaultIDs)
	if err != nil {
		return nil, err
	}
	if len(accountIDs) == 0 {
		return result, nil
	}
	transactionScope := repository.Filter{
		"workspace_id": workspaceID, "vault_id": repository.Filter{"$in": vaultIDs},
		"account_id": repository.Filter{"$in": accountIDs},
		"$or":        []repository.Filter{{"privacy": "workspace"}, {"created_by": actorID}},
	}
	if isNumericTransactionIDQuery(query) {
		exactIdentifierQuery := cloneFilter(transactionScope)
		exactIdentifierQuery["transaction_id"] = query
		var exactIdentifierMatches []model.Transaction
		if err := s.store.FindMany(
			ctx, "transactions", exactIdentifierQuery, &exactIdentifierMatches, 20, 0,
			repository.Sort{"occurred_at": -1},
		); err != nil {
			return nil, err
		}
		result.Transactions = appendUniqueSearchTransactions(result.Transactions, exactIdentifierMatches, 20)

		idFilter, _ := transactionIDPrefixFilter(query)
		identifierQuery := cloneFilter(transactionScope)
		identifierQuery["transaction_id"] = idFilter
		var identifierMatches []model.Transaction
		if err := s.store.FindMany(
			ctx, "transactions", identifierQuery, &identifierMatches, 20, 0,
			repository.Sort{"occurred_at": -1},
		); err != nil {
			return nil, err
		}
		result.Transactions = appendUniqueSearchTransactions(result.Transactions, identifierMatches, 20)
	}
	textTransactionQuery := cloneFilter(transactionScope)
	textTransactionQuery["$text"] = textSearch
	var textMatches []model.Transaction
	if err := s.store.FindMany(ctx, "transactions", textTransactionQuery, &textMatches, 20, 0, repository.Sort{"occurred_at": -1}); err != nil {
		return nil, err
	}
	result.Transactions = appendUniqueSearchTransactions(result.Transactions, textMatches, 20)
	if !canViewAssets {
		return result, nil
	}
	if err := s.store.FindMany(ctx, "accounts", repository.Filter{
		"workspace_id": workspaceID, "_id": repository.Filter{"$in": accountIDs}, "$text": textSearch,
	}, &result.Accounts, 20, 0, nil); err != nil {
		return nil, err
	}
	return result, nil
}

func isNumericTransactionIDQuery(query string) bool {
	query = strings.TrimSpace(query)
	if query == "" || len(query) > model.MaximumTransactionSequenceDigits {
		return false
	}
	for _, character := range query {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func cloneFilter(filter repository.Filter) repository.Filter {
	cloned := make(repository.Filter, len(filter)+1)
	for key, value := range filter {
		cloned[key] = value
	}
	return cloned
}

func appendUniqueSearchTransactions(existing, candidates []model.Transaction, limit int) []model.Transaction {
	seen := make(map[string]struct{}, len(existing)+len(candidates))
	for _, transaction := range existing {
		seen[transaction.ID] = struct{}{}
	}
	for _, transaction := range candidates {
		if len(existing) >= limit {
			break
		}
		if _, duplicate := seen[transaction.ID]; duplicate {
			continue
		}
		seen[transaction.ID] = struct{}{}
		existing = append(existing, transaction)
	}
	return existing
}

type Report struct {
	Currency      string           `json:"currency"`
	IncomeMinor   int64            `json:"incomeMinor"`
	SpendingMinor int64            `json:"spendingMinor"`
	NetMinor      int64            `json:"netMinor"`
	ByCategory    map[string]int64 `json:"byCategory"`
	Summary       string           `json:"summary"`
	Disclaimer    string           `json:"disclaimer"`
}

func (s *FinanceService) Report(ctx context.Context, workspaceID, actorID string, from, to time.Time) (*Report, error) {
	if !to.After(from) || to.Sub(from) > 366*24*time.Hour {
		return nil, &FieldError{Field: "period", Message: "must be a valid range of at most 366 days"}
	}
	query, empty, err := s.transactionQuery(ctx, workspaceID, actorID, TransactionFilter{From: &from, To: &to})
	if err != nil {
		return nil, err
	}
	workspace, err := s.requireWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	if !empty {
		query["currency"] = workspace.Currency
	}
	result := &Report{
		Currency: workspace.Currency, ByCategory: map[string]int64{},
		Disclaimer: "Factual summary only; not financial advice.",
	}
	var totals []transactionCategoryTotal
	if !empty {
		if err := s.store.Aggregate(ctx, "transactions", repository.Pipeline{
			{"$match": query},
			{"$group": repository.Filter{
				"_id": repository.Filter{
					"type":     "$type",
					"category": "$category",
				},
				"total": repository.Filter{"$sum": "$amount_minor"},
			}},
		}, &totals); err != nil {
			return nil, err
		}
	}
	for _, total := range totals {
		switch total.Key.Type {
		case "expense":
			result.SpendingMinor, err = checkedAddMoney(result.SpendingMinor, total.Total)
			if err != nil {
				return nil, err
			}
			category := valueOrDefault(total.Key.Category, "Uncategorised")
			result.ByCategory[category], err = checkedAddMoney(result.ByCategory[category], total.Total)
			if err != nil {
				return nil, err
			}
		case "income", "refund", "reimbursement":
			result.IncomeMinor, err = checkedAddMoney(result.IncomeMinor, total.Total)
			if err != nil {
				return nil, err
			}
		}
	}
	result.NetMinor, err = checkedAddMoney(result.IncomeMinor, -result.SpendingMinor)
	if err != nil {
		return nil, err
	}
	result.Summary = fmt.Sprintf(
		"Income was %d %s minor units and spending was %d %s minor units for the selected period.",
		result.IncomeMinor,
		result.Currency,
		result.SpendingMinor,
		result.Currency,
	)
	return result, nil
}

func financialPeriodStart(now time.Time, startDay int) time.Time {
	// Workspaces do not currently persist a timezone, so accounting period
	// boundaries are deliberately evaluated in UTC.
	if startDay < 1 || startDay > 28 {
		startDay = 1
	}
	utc := now.UTC()
	year, month := utc.Year(), utc.Month()
	if utc.Day() < startDay {
		month--
		if month < time.January {
			month = time.December
			year--
		}
	}
	return time.Date(year, month, startDay, 0, 0, 0, 0, time.UTC)
}

func (s *FinanceService) Notifications(ctx context.Context, actorID string, limit, skip int64) ([]model.Notification, error) {
	var notifications []model.Notification
	err := s.store.FindMany(ctx, "notifications", repository.Filter{"user_id": actorID}, &notifications, min(max(limit, 1), 100), max(skip, 0), repository.Sort{"created_at": -1})
	return notifications, err
}

func (s *FinanceService) Audit(ctx context.Context, workspaceID, actorID string, limit, skip int64) ([]model.AuditEvent, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewAudit); err != nil {
		return nil, err
	}
	var events []model.AuditEvent
	err := s.store.FindMany(ctx, "audit_events", repository.Filter{"workspace_id": workspaceID}, &events, min(max(limit, 1), 100), max(skip, 0), repository.Sort{"created_at": -1})
	return events, err
}

func (s *FinanceService) ListCollection(ctx context.Context, workspaceID, actorID, collection, permission string, destination any) error {
	return s.ListCollectionPage(ctx, workspaceID, actorID, collection, permission, destination, 100, 0)
}

// ListCollectionPage lists a bounded page of planning or collaboration records.
// ListCollection remains as a compatibility wrapper for existing service callers.
func (s *FinanceService) ListCollectionPage(ctx context.Context, workspaceID, actorID, collection, permission string, destination any, limit, skip int64) error {
	requiredPermissions := map[string]string{
		"budgets":        model.PermViewTransactions,
		"goals":          model.PermViewTransactions,
		"expense_claims": model.PermSubmitExpenses,
	}
	required, ok := requiredPermissions[collection]
	if !ok || permission != required {
		return &FieldError{Field: "collection", Message: "is not supported"}
	}
	membership, err := s.access.Require(ctx, workspaceID, actorID, required)
	if err != nil {
		return err
	}
	vaultIDs, err := s.accessibleVaultIDsUnchecked(ctx, workspaceID, actorID)
	if err != nil {
		return err
	}
	filter := repository.Filter{"workspace_id": workspaceID}
	switch collection {
	case "expense_claims":
		filter["vault_id"] = repository.Filter{"$in": vaultIDs}
		if !hasPermission(*membership, model.PermApproveExpenses) {
			filter["submitted_by"] = actorID
		}
	case "goals":
		filter["$and"] = []repository.Filter{
			{"$or": []repository.Filter{
				{"vault_id": repository.Filter{"$in": vaultIDs}},
				{"vault_id": ""},
				{"vault_id": repository.Filter{"$exists": false}},
			}},
			goalVisibilityFilter(actorID),
		}
	default:
		filter["$or"] = []repository.Filter{
			{"vault_id": repository.Filter{"$in": vaultIDs}},
			{"vault_id": ""},
			{"vault_id": repository.Filter{"$exists": false}},
		}
	}
	if err := s.store.FindMany(ctx, collection, filter, destination, min(max(limit, 1), 100), max(skip, 0), repository.Sort{"created_at": -1}); err != nil {
		return err
	}
	if collection == "goals" {
		if goals, ok := destination.(*[]model.Goal); ok {
			contactIDs := make([]string, 0, len(*goals))
			for index := range *goals {
				(*goals)[index].ApplyDerived(time.Now().UTC())
				if (*goals)[index].ContactID != "" {
					contactIDs = append(contactIDs, (*goals)[index].ContactID)
				}
			}
			if len(contactIDs) > 0 {
				var contacts []model.Contact
				if err := s.store.FindMany(ctx, "contacts", repository.Filter{
					"workspace_id": workspaceID,
					"_id":          repository.Filter{"$in": contactIDs},
				}, &contacts, int64(len(contactIDs)), 0, nil); err == nil {
					byID := make(map[string]model.Contact, len(contacts))
					for _, contact := range contacts {
						byID[contact.ID] = contact
					}
					for index := range *goals {
						contact, exists := byID[(*goals)[index].ContactID]
						if !exists {
							continue
						}
						(*goals)[index].Contact = &model.ContactSummary{
							ID: contact.ID, Name: contact.Name, Phone: contact.Phone, Email: contact.Email,
						}
					}
				}
			}
		}
	}
	return nil
}
