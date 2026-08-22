package service

import (
	"context"
	"fmt"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const attentionMaxBudgets = 20

// AttentionItem is one actionable signal for the workspace home screen.
type AttentionItem struct {
	Kind        string `json:"kind"`
	Severity    string `json:"severity"`
	Title       string `json:"title"`
	Detail      string `json:"detail,omitempty"`
	Count       int64  `json:"count,omitempty"`
	AmountMinor int64  `json:"amountMinor,omitempty"`
	Currency    string `json:"currency,omitempty"`
	Href        string `json:"href"`
}

type AttentionResult struct {
	Items       []AttentionItem `json:"items"`
	GeneratedAt time.Time       `json:"generatedAt"`
}

type attentionCountRow struct {
	ID    string `bson:"_id"`
	Count int64  `bson:"count"`
}

// Attention collects everything that may require action: overdue obligations,
// budget pressure, unresolved imports and reconciliations, pending approvals,
// and an upcoming low-balance warning. Each item explains itself and links to
// where the user can act.
func (s *FinanceService) Attention(ctx context.Context, workspaceID, actorID string) (*AttentionResult, error) {
	membership, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewBalances)
	if err != nil {
		return nil, err
	}
	if !hasPermission(*membership, model.PermViewTransactions) {
		return nil, ErrForbidden
	}
	now := time.Now().UTC()
	result := &AttentionResult{Items: []AttentionItem{}, GeneratedAt: now}

	s.collectOverdueBills(ctx, workspaceID, actorID, now, result)
	s.collectGoalAttention(ctx, workspaceID, actorID, now, result)
	s.collectDraftImports(ctx, workspaceID, result)
	s.collectReconciliationDifferences(ctx, workspaceID, actorID, result)
	s.collectPendingClaims(ctx, workspaceID, actorID, result)
	s.collectBudgetPressure(ctx, workspaceID, actorID, now, result)

	return result, nil
}

func (s *FinanceService) collectOverdueBills(ctx context.Context, workspaceID, actorID string, now time.Time, result *AttentionResult) {
	filter := repository.Filter{
		"workspace_id": workspaceID,
		"next_due_at":  repository.Filter{"$lt": now},
		"$and": []repository.Filter{
			{"$or": []repository.Filter{{"active": true}, {"active": repository.Filter{"$exists": false}}}},
			{"$or": []repository.Filter{{"privacy": "workspace"}, {"owner_id": actorID}}},
		},
	}
	bills := make([]model.Bill, 0, 8)
	if err := s.store.FindMany(ctx, "recurring_transactions", filter, &bills, 100, 0, repository.Sort{"next_due_at": 1}); err != nil || len(bills) == 0 {
		_ = err
		return
	}
	total := int64(0)
	var err error
	for _, bill := range bills {
		total, err = checkedAddMoney(total, bill.AmountMinor)
		if err != nil {
			break
		}
	}
	daysOverdue := int64(now.Sub(bills[0].DueDate.UTC()).Hours() / 24)
	result.Items = append(result.Items, AttentionItem{
		Kind:        "overdue_bill",
		Severity:    "critical",
		Title:       fmt.Sprintf("%d overdue bill%s", len(bills), plural(len(bills))),
		Detail:      fmt.Sprintf("Oldest is %d days past due.", daysOverdue),
		Count:       int64(len(bills)),
		AmountMinor: total,
		Href:        "/app/bills",
	})
}

func (s *FinanceService) collectGoalAttention(ctx context.Context, workspaceID, actorID string, now time.Time, result *AttentionResult) {
	vaultIDs, err := s.accessibleVaultIDsUnchecked(ctx, workspaceID, actorID)
	if err != nil || len(vaultIDs) == 0 {
		return
	}
	filter := repository.Filter{
		"workspace_id": workspaceID,
		"due_date":     repository.Filter{"$ne": nil, "$lt": now},
		"$and": []repository.Filter{
			{"$or": []repository.Filter{
				{"vault_id": repository.Filter{"$in": vaultIDs}},
				{"vault_id": ""},
				{"vault_id": repository.Filter{"$exists": false}},
			}},
			goalVisibilityFilter(actorID),
			{"cancelled_at": repository.Filter{"$exists": false}},
			{"completion_date": repository.Filter{"$exists": false}},
		},
	}
	goals := make([]model.Goal, 0, 8)
	if err := s.store.FindMany(ctx, "goals", filter, &goals, 100, 0, repository.Sort{"due_date": 1}); err != nil || len(goals) == 0 {
		_ = err
		return
	}
	for index := range goals {
		goals[index].ApplyDerived(now)
	}
	daysLate := int64(now.Sub(*goals[0].TargetDate).Hours() / 24)
	if goals[0].TargetDate.IsZero() && goals[0].DueDate != nil {
		daysLate = int64(now.Sub(goals[0].DueDate.UTC()).Hours() / 24)
	}
	result.Items = append(result.Items, AttentionItem{
		Kind:     "goal_overdue",
		Severity: "warning",
		Title:    fmt.Sprintf("%d goal%s past due", len(goals), plural(len(goals))),
		Detail:   fmt.Sprintf("%s is %d days late.", valueOrDefault(goals[0].Name, "A goal"), daysLate),
		Count:    int64(len(goals)),
		Href:     "/app/goals",
	})
}

func (s *FinanceService) collectDraftImports(ctx context.Context, workspaceID string, result *AttentionResult) {
	count, err := s.store.Count(ctx, "import_sessions", repository.Filter{
		"workspace_id": workspaceID,
		"status":       model.ImportSessionDraft,
	})
	if err != nil || count == 0 {
		_ = err
		return
	}
	result.Items = append(result.Items, AttentionItem{
		Kind:     "draft_import",
		Severity: "info",
		Title:    fmt.Sprintf("%d statement import%s waiting for review", count, plural(int(count))),
		Detail:   "Review the rows and commit them to your ledger.",
		Count:    count,
		Href:     "/app/import",
	})
}

func (s *FinanceService) collectReconciliationDifferences(ctx context.Context, workspaceID, actorID string, result *AttentionResult) {
	reconciliations := make([]model.AccountReconciliation, 0, 8)
	if err := s.store.FindMany(
		ctx,
		"account_reconciliations",
		repository.Filter{
			"workspace_id":   workspaceID,
			"difference_minor": repository.Filter{"$ne": int64(0)},
		},
		&reconciliations,
		5,
		0,
		repository.Sort{"created_at": -1},
	); err != nil || len(reconciliations) == 0 {
		_ = err
		return
	}
	latest := reconciliations[0]
	result.Items = append(result.Items, AttentionItem{
		Kind:        "reconciliation_difference",
		Severity:    "warning",
		Title:       "Unresolved reconciliation difference",
		Detail: fmt.Sprintf("An account reconciliation recorded a %d minor-unit difference; investigate recent activity.", latest.DifferenceMinor),
		AmountMinor: latest.DifferenceMinor,
		Currency:    latest.Currency,
		Count:       int64(len(reconciliations)),
		Href:        "/app/accounts?account=" + latest.AccountID,
	})
}

func (s *FinanceService) collectPendingClaims(ctx context.Context, workspaceID, actorID string, result *AttentionResult) {
	_, approveErr := s.access.Require(ctx, workspaceID, actorID, model.PermApproveExpenses)
	canApprove := approveErr == nil
	if !canApprove {
		filter := repository.Filter{
			"workspace_id": workspaceID,
			"status":       "pending",
			"submitted_by": actorID,
		}
		count, countErr := s.store.Count(ctx, "expense_claims", filter)
		if countErr != nil || count == 0 {
			return
		}
		result.Items = append(result.Items, AttentionItem{
			Kind:     "pending_claim",
			Severity: "info",
			Title:    fmt.Sprintf("%d expense claim%s awaiting review", count, plural(int(count))),
			Count:    count,
			Href:     "/app/office",
		})
		return
	}
	rows := make([]attentionCountRow, 0, 2)
	if err := s.store.Aggregate(ctx, "expense_claims", repository.Pipeline{
		{"$match": repository.Filter{"workspace_id": workspaceID, "status": "pending"}},
		{"$group": repository.Filter{"_id": "$workspace_id", "count": repository.Filter{"$sum": 1}}},
	}, &rows); err != nil || len(rows) == 0 {
		return
	}
	result.Items = append(result.Items, AttentionItem{
		Kind:     "pending_claim",
		Severity: "warning",
		Title:    fmt.Sprintf("%d expense claim%s need approval", rows[0].Count, plural(int(rows[0].Count))),
		Count:    rows[0].Count,
		Href:     "/app/office",
	})
}

func (s *FinanceService) collectBudgetPressure(ctx context.Context, workspaceID, actorID string, now time.Time, result *AttentionResult) {
	vaultIDs, err := s.accessibleVaultIDsUnchecked(ctx, workspaceID, actorID)
	if err != nil || len(vaultIDs) == 0 {
		return
	}
	budgets := make([]model.Budget, 0, attentionMaxBudgets)
	if err := s.store.FindMany(ctx, "budgets", repository.Filter{"workspace_id": workspaceID}, &budgets, attentionMaxBudgets, 0, repository.Sort{"end_at": -1}); err != nil || len(budgets) == 0 {
		_ = err
		return
	}
	active := make([]model.Budget, 0, len(budgets))
	for _, budget := range budgets {
		if !budget.StartAt.After(now) && budget.EndAt.After(now) {
			active = append(active, budget)
		}
	}
	if len(active) == 0 {
		return
	}
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	queryFilter, empty, err := s.transactionQuery(ctx, workspaceID, actorID, TransactionFilter{
		Type: model.TransactionSequenceExpense,
		From: &monthStart,
		To:   &now,
	})
	if err != nil || empty {
		_ = err
		return
	}
	type categoryTotal struct {
		Category string `bson:"_id"`
		Total    int64  `bson:"total"`
	}
	categoryRows := make([]categoryTotal, 0, 16)
	if err := s.store.Aggregate(ctx, "transactions", repository.Pipeline{
		{"$match": queryFilter},
		{"$group": repository.Filter{
			"_id":   "$category",
			"total": repository.Filter{"$sum": "$amount_minor"},
		}},
	}, &categoryRows); err != nil {
		return
	}
	spentByCategory := make(map[string]int64, len(categoryRows))
	totalSpent := int64(0)
	for _, row := range categoryRows {
		spentByCategory[row.Category] = row.Total
		if row.Category != "" {
			continue
		}
		for _, extra := range categoryRows {
			if extra.Category == "" {
				totalSpent, _ = checkedAddMoney(totalSpent, extra.Total)
			}
		}
		break
	}
	exceeded := 0
	nearLimit := 0
	worstExceededName := ""
	worstPercent := 0.0
	for _, budget := range active {
		spent := totalSpent
		if len(budget.Categories) > 0 {
			spent = 0
			for _, category := range budget.Categories {
				spent += spentByCategory[category]
			}
		}
		if budget.AmountMinor <= 0 {
			continue
		}
		percent := float64(spent) / float64(budget.AmountMinor)
		switch {
		case spent > budget.AmountMinor:
			exceeded++
			if percent > worstPercent {
				worstPercent = percent
				worstExceededName = budget.Name
			}
		case percent >= 0.85:
			nearLimit++
		}
	}
	if exceeded > 0 {
		result.Items = append(result.Items, AttentionItem{
			Kind:     "budget_exceeded",
			Severity: "critical",
			Title:    fmt.Sprintf("%d budget%s exceeded", exceeded, plural(exceeded)),
			Detail:   valueOrDefault(worstExceededName, "A budget") + " has passed its limit.",
			Count:    int64(exceeded),
			Href:     "/app/budgets",
		})
	}
	if nearLimit > 0 {
		result.Items = append(result.Items, AttentionItem{
			Kind:     "budget_near_limit",
			Severity: "warning",
			Title:    fmt.Sprintf("%d budget%s near the limit", nearLimit, plural(nearLimit)),
			Count:    int64(nearLimit),
			Href:     "/app/budgets",
		})
	}
}

func plural(count int) string {
	if count == 1 {
		return ""
	}
	return "s"
}
