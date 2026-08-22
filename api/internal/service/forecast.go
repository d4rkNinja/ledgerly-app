package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const (
	maximumForecastDays          = 365
	forecastBaselineWindowDays   = 90
	maximumForecastOneOffs       = 50
	maximumForecastEventsPerBill = 400
)

type ForecastOneOff struct {
	Date        string `json:"date"`
	Direction   string `json:"direction"`
	Label       string `json:"label"`
	AmountMinor int64  `json:"amountMinor"`
}

type ForecastInput struct {
	Days           int              `json:"days"`
	IncludeBills   *bool            `json:"includeBills"`
	IncludeIncome  *bool            `json:"includeIncome"`
	IncludeBaseline *bool           `json:"includeBaseline"`
	OneOff         []ForecastOneOff `json:"oneOff"`
}

type ForecastEvent struct {
	Label       string `json:"label"`
	Kind        string `json:"kind"`
	Direction   string `json:"direction"`
	AmountMinor int64  `json:"amountMinor"`
	Frequency   string `json:"frequency,omitempty"`
}

type ForecastPoint struct {
	Date                string          `json:"date"`
	Events              []ForecastEvent `json:"events"`
	BillExpenseMinor    int64           `json:"billExpenseMinor"`
	BaselineExpenseMinor int64          `json:"baselineExpenseMinor"`
	BaselineIncomeMinor int64           `json:"baselineIncomeMinor"`
	OneOffExpenseMinor  int64           `json:"oneOffExpenseMinor"`
	OneOffIncomeMinor   int64           `json:"oneOffIncomeMinor"`
	IncomeMinor         int64           `json:"incomeMinor"`
	ExpenseMinor        int64           `json:"expenseMinor"`
	ClosingBalanceMinor int64           `json:"closingBalanceMinor"`
}

type ForecastTotals struct {
	ExpectedIncomeMinor  int64 `json:"expectedIncomeMinor"`
	ExpectedExpenseMinor int64 `json:"expectedExpenseMinor"`
	NetMinor             int64 `json:"netMinor"`
}

type ForecastResult struct {
	Currency                        string          `json:"currency"`
	GeneratedAt                     time.Time       `json:"generatedAt"`
	StartDate                       string          `json:"startDate"`
	Days                            int             `json:"days"`
	StartingBalanceMinor            int64           `json:"startingBalanceMinor"`
	Points                          []ForecastPoint `json:"points"`
	Totals                          ForecastTotals  `json:"totals"`
	LowestProjectedBalanceMinor     int64           `json:"lowestProjectedBalanceMinor"`
	LowestProjectedDate             string          `json:"lowestProjectedDate,omitempty"`
	AvailableAfterCommittedMinor    int64           `json:"availableAfterCommittedMinor"`
	FirstNegativeDate               string          `json:"firstNegativeDate,omitempty"`
	NegativeDays                    int64           `json:"negativeDays"`
	BaselineDailyExpenseMinor      int64           `json:"baselineDailyExpenseMinor"`
	BaselineDailyIncomeMinor       int64           `json:"baselineDailyIncomeMinor"`
	Assumptions                     []string        `json:"assumptions"`
}

// Forecast builds a deterministic cash-flow projection from current balances,
// recurring bills, an optional historical spending baseline, and explicit
// user-provided one-off items. It never mutates the ledger and every number is
// explainable through its events and assumptions.
func (s *FinanceService) Forecast(ctx context.Context, workspaceID, actorID string, input ForecastInput) (*ForecastResult, error) {
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
	days := input.Days
	if days <= 0 {
		days = 30
	}
	if days > maximumForecastDays {
		return nil, &FieldError{Field: "days", Message: fmt.Sprintf("must be between 1 and %d", maximumForecastDays)}
	}
	includeBills := input.IncludeBills == nil || *input.IncludeBills
	includeBaseline := input.IncludeBaseline == nil || *input.IncludeBaseline
	includeIncome := input.IncludeIncome == nil || *input.IncludeIncome

	vaultIDs, err := s.accessibleVaultIDsUnchecked(ctx, workspaceID, actorID)
	if err != nil {
		return nil, err
	}
	accounts, err := s.visibleAccounts(ctx, workspaceID, actorID, vaultIDs)
	if err != nil {
		return nil, err
	}
	accounts = accountsInCurrency(accounts, workspace.Currency)

	now := time.Now().UTC()
	startDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	horizonEnd := startDay.AddDate(0, 0, days)

	result := &ForecastResult{
		Currency:     workspace.Currency,
		GeneratedAt:  now,
		StartDate:    startDay.Format("2006-01-02"),
		Days:         days,
		Points:       make([]ForecastPoint, 0, days),
		Assumptions:  []string{},
	}
	for _, account := range accounts {
		if !account.ExcludeFromTotal {
			result.StartingBalanceMinor, err = checkedAddMoney(result.StartingBalanceMinor, account.BalanceMinor)
			if err != nil {
				return nil, err
			}
		}
	}
	if len(accounts) != len(vaultIDs) {
		result.Assumptions = append(result.Assumptions, "Balances include only accounts you can see in this currency.")
	}

	pointsByDate := make(map[string]*ForecastPoint, days)
	pointOrder := make([]string, 0, days)
	for offset := 0; offset < days; offset++ {
		day := startDay.AddDate(0, 0, offset)
		key := day.Format("2006-01-02")
		pointOrder = append(pointOrder, key)
		pointsByDate[key] = &ForecastPoint{Date: key, Events: []ForecastEvent{}}
	}

	baselineExpense, baselineIncome := int64(0), int64(0)
	if includeBaseline {
		baselineExpense, baselineIncome, err = s.forecastBaseline(ctx, workspaceID, actorID, now)
		if err != nil {
			return nil, err
		}
		result.BaselineDailyExpenseMinor = baselineExpense
		result.BaselineDailyIncomeMinor = baselineIncome
		if baselineExpense > 0 {
			result.Assumptions = append(result.Assumptions,
				fmt.Sprintf("Typical daily spending of %d minor units comes from your last %d days.", baselineExpense, forecastBaselineWindowDays))
		} else {
			result.Assumptions = append(result.Assumptions, "No recent spending history was found, so no baseline spending is assumed.")
		}
		if !includeIncome {
			result.Assumptions = append(result.Assumptions, "Expected income is excluded by scenario settings.")
		}
	} else {
		result.Assumptions = append(result.Assumptions, "The historical spending baseline is excluded by scenario settings.")
	}

	if includeBills {
		added, skipped, assumptionErr := s.addForecastBills(ctx, workspaceID, actorID, startDay, horizonEnd, pointsByDate)
		if assumptionErr != nil {
			return nil, assumptionErr
		}
		result.Assumptions = append(result.Assumptions, added...)
		_ = skipped
	} else {
		result.Assumptions = append(result.Assumptions, "Recurring bills are excluded by scenario settings.")
	}

	if len(input.OneOff) > 0 {
		if len(input.OneOff) > maximumForecastOneOffs {
			return nil, &FieldError{Field: "oneOff", Message: fmt.Sprintf("must contain at most %d items", maximumForecastOneOffs)}
		}
		for index, oneOff := range input.OneOff {
			date, direction, label, amount, itemErr := validateForecastOneOff(oneOff, index)
			if itemErr != nil {
				return nil, itemErr
			}
			key := date.Format("2006-01-02")
			point, ok := pointsByDate[key]
			if !ok {
				result.Assumptions = append(result.Assumptions,
					fmt.Sprintf("Planned %q on %s falls outside the forecast window and is ignored.", label, key))
				continue
			}
			event := ForecastEvent{Label: valueOrDefault(label, "Planned item"), Kind: "one_off", Direction: direction, AmountMinor: amount}
			point.Events = append(point.Events, event)
			if direction == "expense" {
				point.OneOffExpenseMinor, err = checkedAddMoney(point.OneOffExpenseMinor, amount)
			} else {
				point.OneOffIncomeMinor, err = checkedAddMoney(point.OneOffIncomeMinor, amount)
			}
			if err != nil {
				return nil, err
			}
		}
	}

	running := result.StartingBalanceMinor
	lowest := result.StartingBalanceMinor
	lowestDate := ""
	negativeDays := int64(0)
	firstNegative := ""
	for _, key := range pointOrder {
		point := pointsByDate[key]
		var income, expense int64
		expense = point.BillExpenseMinor
		if includeBaseline {
			expense, err = checkedAddMoney(expense, baselineExpense)
			if err != nil {
				return nil, err
			}
			point.BaselineExpenseMinor = baselineExpense
			if includeIncome && baselineIncome > 0 {
				point.BaselineIncomeMinor = baselineIncome
				income, err = checkedAddMoney(income, baselineIncome)
				if err != nil {
					return nil, err
				}
			}
		}
		income, err = checkedAddMoney(income, point.OneOffIncomeMinor)
		if err != nil {
			return nil, err
		}
		expense, err = checkedAddMoney(expense, point.OneOffExpenseMinor)
		if err != nil {
			return nil, err
		}
		point.IncomeMinor = income
		point.ExpenseMinor = expense
		running, err = applySigned(running, income-expense)
		if err != nil {
			return nil, err
		}
		point.ClosingBalanceMinor = running
		result.Totals.ExpectedIncomeMinor, err = checkedAddMoney(result.Totals.ExpectedIncomeMinor, income)
		if err != nil {
			return nil, err
		}
		result.Totals.ExpectedExpenseMinor, err = checkedAddMoney(result.Totals.ExpectedExpenseMinor, expense)
		if err != nil {
			return nil, err
		}
		if running < lowest {
			lowest = running
			lowestDate = point.Date
		}
		if running < 0 {
			negativeDays++
			if firstNegative == "" {
				firstNegative = point.Date
			}
		}
		result.Points = append(result.Points, *point)
	}
	result.Totals.NetMinor = result.Totals.ExpectedIncomeMinor - result.Totals.ExpectedExpenseMinor
	result.LowestProjectedBalanceMinor = lowest
	result.LowestProjectedDate = lowestDate
	result.AvailableAfterCommittedMinor = lowest
	result.FirstNegativeDate = firstNegative
	result.NegativeDays = negativeDays
	if firstNegative != "" {
		result.Assumptions = append(result.Assumptions, "A negative projection means planned obligations exceed available money on that date; it is not an overdraft fee estimate.")
	}
	return result, nil
}

func applySigned(balance, delta int64) (int64, error) {
	return checkedAddMoney(balance, delta)
}

// forecastBaseline computes rounded daily averages over the trailing window.
func (s *FinanceService) forecastBaseline(ctx context.Context, workspaceID, actorID string, now time.Time) (int64, int64, error) {
	to := now
	from := now.AddDate(0, 0, -forecastBaselineWindowDays)
	queryFilter, empty, err := s.transactionQuery(ctx, workspaceID, actorID, TransactionFilter{From: &from, To: &to})
	if err != nil || empty {
		return 0, 0, err
	}
	totals := []transactionTypeTotal{}
	pipeline := repository.Pipeline{
		{"$match": queryFilter},
		{"$group": repository.Filter{
			"_id":   "$type",
			"total": repository.Filter{"$sum": "$amount_minor"},
		}},
	}
	if err := s.store.Aggregate(ctx, "transactions", pipeline, &totals); err != nil {
		return 0, 0, err
	}
	var expense, income int64
	for _, total := range totals {
		switch total.Type {
		case "expense":
			expense, err = checkedAddMoney(expense, total.Total)
		case "income", "refund", "reimbursement":
			income, err = checkedAddMoney(income, total.Total)
		}
		if err != nil {
			return 0, 0, err
		}
	}
	return expense / forecastBaselineWindowDays, income / forecastBaselineWindowDays, nil
}

// addForecastBills expands active recurring bills across the horizon and
// returns assumptions documenting anything that could not be projected.
func (s *FinanceService) addForecastBills(
	ctx context.Context,
	workspaceID, actorID string,
	startDay, horizonEnd time.Time,
	pointsByDate map[string]*ForecastPoint,
) ([]string, int, error) {
	filter := repository.Filter{
		"workspace_id": workspaceID,
		"$and": []repository.Filter{
			{
				"$or": []repository.Filter{
					{"active": true},
					{"active": repository.Filter{"$exists": false}},
				},
			},
			{
				"$or": []repository.Filter{
					{"privacy": "workspace"},
					{"owner_id": actorID},
				},
			},
		},
	}
	bills := make([]model.Bill, 0)
	if err := s.store.FindMany(ctx, "recurring_transactions", filter, &bills, 500, 0, repository.Sort{"next_due_at": 1}); err != nil {
		return nil, 0, err
	}
	assumptions := make([]string, 0)
	skipped := 0
	for index := range bills {
		bill := &bills[index]
		step, known := billRecurrenceStep(bill.Frequency)
		label := valueOrDefault(bill.Name, "Upcoming bill")
		if bill.AmountMinor <= 0 || bill.AmountMinor > model.MaxMoneyMinor {
			skipped++
			continue
		}
		if !known {
			assumptions = append(assumptions,
				fmt.Sprintf("%q has an unrecognized schedule (%s); it is projected once on its next due date only.", label, bill.Frequency))
		}
		occurrence := bill.DueDate.UTC()
		count := 0
		for occurrence.Before(horizonEnd) && count < maximumForecastEventsPerBill {
			if !occurrence.Before(startDay) {
				key := occurrence.Format("2006-01-02")
				if point, ok := pointsByDate[key]; ok {
					point.Events = append(point.Events, ForecastEvent{
						Label:       label,
						Kind:        "bill",
						Direction:   "expense",
						AmountMinor: bill.AmountMinor,
						Frequency:   bill.Frequency,
					})
					var err error
					point.BillExpenseMinor, err = checkedAddMoney(point.BillExpenseMinor, bill.AmountMinor)
					if err != nil {
						return nil, skipped, err
					}
				}
			}
			if step <= 0 {
				break
			}
			occurrence = occurrence.Add(step)
			count++
		}
	}
	return assumptions, skipped, nil
}

// billRecurrenceStep maps stored frequency vocabulary onto a deterministic
// step. Unknown frequencies return zero step (single occurrence).
func billRecurrenceStep(frequency string) (time.Duration, bool) {
	switch strings.ToLower(strings.TrimSpace(frequency)) {
	case "", "monthly", "month", "monthly_once":
		return 30 * 24 * time.Hour, true
	case "weekly", "week":
		return 7 * 24 * time.Hour, true
	case "fortnightly", "biweekly", "bi_weekly":
		return 14 * 24 * time.Hour, true
	case "daily", "day":
		return 24 * time.Hour, true
	case "quarterly", "quarter":
		return 91 * 24 * time.Hour, true
	case "yearly", "annual", "annually", "year":
		return 365 * 24 * time.Hour, true
	default:
		return 0, false
	}
}

func validateForecastOneOff(item ForecastOneOff, index int) (time.Time, string, string, int64, error) {
	fieldPrefix := fmt.Sprintf("oneOff.%d.", index)
	rawDate := strings.TrimSpace(item.Date)
	date, err := time.Parse("2006-01-02", rawDate)
	if err != nil || date.Format("2006-01-02") != rawDate {
		return time.Time{}, "", "", 0, &FieldError{Field: fieldPrefix + "date", Message: "must be a YYYY-MM-DD calendar date"}
	}
	direction := strings.ToLower(strings.TrimSpace(item.Direction))
	if direction != "income" && direction != "expense" {
		return time.Time{}, "", "", 0, &FieldError{Field: fieldPrefix + "direction", Message: "must be income or expense"}
	}
	label, err := validatedText(fieldPrefix+"label", item.Label, 0, 120)
	if err != nil {
		return time.Time{}, "", "", 0, err
	}
	if item.AmountMinor <= 0 || item.AmountMinor > model.MaxMoneyMinor {
		return time.Time{}, "", "", 0, &FieldError{Field: fieldPrefix + "amountMinor", Message: "must be greater than zero"}
	}
	return date.UTC(), direction, label, item.AmountMinor, nil
}
