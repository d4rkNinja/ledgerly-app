package service

import (
	"context"
	"fmt"
	"strconv"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

// periodAggregateResult uses strings at the Mongo boundary so Decimal128
// accumulators never pass through float64 before being checked against int64.
type periodAggregateResult struct {
	IncomeMinor      string `bson:"income_minor"`
	SpendingMinor    string `bson:"spending_minor"`
	NetMinor         string `bson:"net_minor"`
	TransactionCount string `bson:"transaction_count"`
	ChangeCount      string `bson:"change_count"`
}

func (result periodAggregateResult) periodTotals() (model.PeriodTotals, int64, error) {
	values := []struct {
		name  string
		value string
	}{
		{name: "income_minor", value: result.IncomeMinor},
		{name: "spending_minor", value: result.SpendingMinor},
		{name: "net_minor", value: result.NetMinor},
		{name: "transaction_count", value: result.TransactionCount},
		{name: "change_count", value: result.ChangeCount},
	}
	parsed := make([]int64, len(values))
	for index, field := range values {
		if field.value == "" {
			continue
		}
		value, err := strconv.ParseInt(field.value, 10, 64)
		if err != nil {
			return model.PeriodTotals{}, 0, fmt.Errorf("%w: %s=%q", ErrPeriodTotalsOverflow, field.name, field.value)
		}
		parsed[index] = value
	}
	return model.PeriodTotals{
		IncomeMinor: parsed[0], SpendingMinor: parsed[1], NetMinor: parsed[2], TransactionCount: parsed[3],
	}, parsed[4], nil
}

func decimalExpression(value any) repository.Filter {
	return repository.Filter{"$toDecimal": value}
}

func aggregateIncomeExpression(typePath, amountPath string) repository.Filter {
	return repository.Filter{"$cond": []any{
		repository.Filter{"$in": []any{typePath, []string{"income", "refund", "reimbursement"}}},
		decimalExpression(amountPath), decimalExpression("0"),
	}}
}

func aggregateSpendingExpression(typePath, amountPath string) repository.Filter {
	return repository.Filter{"$cond": []any{
		repository.Filter{"$eq": []any{typePath, "expense"}},
		decimalExpression(amountPath), decimalExpression("0"),
	}}
}

func periodTotalsProjection(includeChangeCount bool) repository.Filter {
	projection := repository.Filter{
		"_id":               0,
		"income_minor":      repository.Filter{"$toString": "$income_minor"},
		"spending_minor":    repository.Filter{"$toString": "$spending_minor"},
		"net_minor":         repository.Filter{"$toString": repository.Filter{"$subtract": []any{"$income_minor", "$spending_minor"}}},
		"transaction_count": repository.Filter{"$toString": "$transaction_count"},
	}
	if includeChangeCount {
		projection["change_count"] = repository.Filter{"$toString": "$change_count"}
	}
	return projection
}

func (s *FinanceService) aggregateTransactionTotals(ctx context.Context, filter repository.Filter) (model.PeriodTotals, error) {
	pipeline := repository.Pipeline{
		{"$match": filter},
		{"$group": repository.Filter{
			"_id":               nil,
			"income_minor":      repository.Filter{"$sum": aggregateIncomeExpression("$type", "$amount_minor")},
			"spending_minor":    repository.Filter{"$sum": aggregateSpendingExpression("$type", "$amount_minor")},
			"transaction_count": repository.Filter{"$sum": decimalExpression("1")},
		}},
		{"$project": periodTotalsProjection(false)},
	}
	var results []periodAggregateResult
	if err := s.store.Aggregate(ctx, "transactions", pipeline, &results); err != nil {
		return model.PeriodTotals{}, err
	}
	if len(results) == 0 {
		return model.PeriodTotals{}, nil
	}
	totals, _, err := results[0].periodTotals()
	return totals, err
}

func periodAuditBaseFilter(review model.PeriodReview) repository.Filter {
	return repository.Filter{
		"workspace_id":   review.WorkspaceID,
		"entity_type":    "transaction",
		"ledger_version": repository.Filter{"$gt": review.CutoffLedgerVersion},
	}
}

func periodRevisionPrivacyExpression(review model.PeriodReview, side string) repository.Filter {
	privacy := "$" + side + ".privacy"
	createdBy := "$" + side + ".created_by"
	switch review.Scope {
	case model.PeriodReviewScopeMemberView:
		return repository.Filter{"$or": []any{
			repository.Filter{"$eq": []any{privacy, "workspace"}},
			repository.Filter{"$eq": []any{createdBy, review.ScopeActorID}},
		}}
	case model.PeriodReviewScopeWorkspaceView:
		return repository.Filter{"$eq": []any{privacy, "workspace"}}
	default:
		return repository.Filter{"$eq": []any{1, 0}}
	}
}

func periodRevisionRelevantExpression(review model.PeriodReview, side string, vaultIDs, accountIDs []string) repository.Filter {
	root := "$" + side
	reportingDate := root + ".reporting_date"
	destinationAccountID := root + ".destination_account_id"
	return repository.Filter{"$and": []any{
		repository.Filter{"$eq": []any{repository.Filter{"$type": root}, "object"}},
		repository.Filter{"$eq": []any{root + ".workspace_id", review.WorkspaceID}},
		repository.Filter{"$eq": []any{root + ".currency", review.Currency}},
		repository.Filter{"$in": []any{root + ".vault_id", vaultIDs}},
		repository.Filter{"$in": []any{root + ".account_id", accountIDs}},
		repository.Filter{"$or": []any{
			repository.Filter{"$eq": []any{repository.Filter{"$ifNull": []any{destinationAccountID, ""}}, ""}},
			repository.Filter{"$in": []any{destinationAccountID, accountIDs}},
		}},
		periodRevisionPrivacyExpression(review, side),
		repository.Filter{"$gte": []any{reportingDate, review.From}},
		repository.Filter{"$lte": []any{reportingDate, review.To}},
	}}
}

func periodRevisionOrdinaryPrivacyClause(review model.PeriodReview, side string) repository.Filter {
	privacy := side + ".privacy"
	createdBy := side + ".created_by"
	switch review.Scope {
	case model.PeriodReviewScopeMemberView:
		return repository.Filter{"$or": []repository.Filter{
			{privacy: "workspace"},
			{createdBy: review.ScopeActorID},
		}}
	case model.PeriodReviewScopeWorkspaceView:
		return repository.Filter{privacy: "workspace"}
	default:
		return repository.Filter{"_id": repository.Filter{"$exists": false}}
	}
}

func periodRevisionOrdinaryBranch(review model.PeriodReview, side string, vaultIDs, accountIDs []string) repository.Filter {
	destinationAccountID := side + ".destination_account_id"
	return repository.Filter{"$and": []repository.Filter{
		{side + ".workspace_id": review.WorkspaceID},
		{side + ".currency": review.Currency},
		{side + ".reporting_date": repository.Filter{"$gte": review.From, "$lte": review.To}},
		{side + ".vault_id": repository.Filter{"$in": vaultIDs}},
		{side + ".account_id": repository.Filter{"$in": accountIDs}},
		{"$or": []repository.Filter{
			{destinationAccountID: repository.Filter{"$exists": false}},
			{destinationAccountID: ""},
			{destinationAccountID: repository.Filter{"$in": accountIDs}},
		}},
		periodRevisionOrdinaryPrivacyClause(review, side),
	}}
}

// periodEventFilter is shared by production drill-down pagination and the
// summary pipeline. Asset IDs are intentionally absent: they control current
// response redaction, while period relevance remains stable financial history.
func periodEventFilter(review model.PeriodReview, vaultIDs, accountIDs []string) repository.Filter {
	filter := periodAuditBaseFilter(review)
	// These ordinary branches are intentionally redundant with the exact
	// expression below. Mongo can derive index bounds from the ordinary nested
	// paths, while the expression remains the single exact civil-date guard.
	filter["$or"] = []repository.Filter{
		periodRevisionOrdinaryBranch(review, "before", vaultIDs, accountIDs),
		periodRevisionOrdinaryBranch(review, "after", vaultIDs, accountIDs),
	}
	filter["$expr"] = repository.Filter{"$or": []any{
		periodRevisionRelevantExpression(review, "before", vaultIDs, accountIDs),
		periodRevisionRelevantExpression(review, "after", vaultIDs, accountIDs),
	}}
	return filter
}

func periodRevisionValueExpression(side, metric string) repository.Filter {
	relevant := "$_period_" + side + "_relevant"
	typePath := "$" + side + ".type"
	amountPath := "$" + side + ".amount_minor"
	var contribution any
	switch metric {
	case "income":
		contribution = aggregateIncomeExpression(typePath, amountPath)
	case "spending":
		contribution = aggregateSpendingExpression(typePath, amountPath)
	default:
		contribution = decimalExpression("1")
	}
	return repository.Filter{"$cond": []any{relevant, contribution, decimalExpression("0")}}
}

func periodRevisionDeltaExpression(metric string) repository.Filter {
	return repository.Filter{"$subtract": []any{
		periodRevisionValueExpression("after", metric),
		periodRevisionValueExpression("before", metric),
	}}
}

func periodRevisionSummaryPipeline(review model.PeriodReview, vaultIDs, accountIDs []string) repository.Pipeline {
	return repository.Pipeline{
		{"$match": periodEventFilter(review, vaultIDs, accountIDs)},
		{"$set": repository.Filter{
			"_period_before_relevant": periodRevisionRelevantExpression(review, "before", vaultIDs, accountIDs),
			"_period_after_relevant":  periodRevisionRelevantExpression(review, "after", vaultIDs, accountIDs),
		}},
		{"$match": repository.Filter{"$expr": repository.Filter{"$or": []any{
			"$_period_before_relevant", "$_period_after_relevant",
		}}}},
		{"$group": repository.Filter{
			"_id":               nil,
			"income_minor":      repository.Filter{"$sum": periodRevisionDeltaExpression("income")},
			"spending_minor":    repository.Filter{"$sum": periodRevisionDeltaExpression("spending")},
			"transaction_count": repository.Filter{"$sum": periodRevisionDeltaExpression("count")},
			"change_count":      repository.Filter{"$sum": decimalExpression("1")},
		}},
		{"$project": periodTotalsProjection(true)},
	}
}

func (s *FinanceService) periodRevisionSummary(ctx context.Context, review model.PeriodReview, vaultIDs, accountIDs []string) (model.PeriodTotals, int64, error) {
	if len(vaultIDs) == 0 || len(accountIDs) == 0 {
		return model.PeriodTotals{}, 0, nil
	}
	if capability, ok := s.store.(interface{ SupportsExactServerAggregation() bool }); ok && capability.SupportsExactServerAggregation() {
		var results []periodAggregateResult
		if err := s.store.Aggregate(ctx, "audit_events", periodRevisionSummaryPipeline(review, vaultIDs, accountIDs), &results); err != nil {
			return model.PeriodTotals{}, 0, err
		}
		if len(results) == 0 {
			return model.PeriodTotals{}, 0, nil
		}
		return results[0].periodTotals()
	}

	// Focused service fakes do not execute Mongo expressions. Their bounded
	// fixtures are filtered and accumulated here with the same relevance rules.
	var events []model.AuditEvent
	if err := s.store.FindMany(ctx, "audit_events", periodAuditBaseFilter(review), &events, 0, 0, repository.Sort{"ledger_version": 1}); err != nil {
		return model.PeriodTotals{}, 0, err
	}
	totals := model.PeriodTotals{}
	var changeCount int64
	for _, event := range events {
		beforeRelevant := periodRevisionInCurrentScope(review, event.Before, vaultIDs, accountIDs)
		afterRelevant := periodRevisionInCurrentScope(review, event.After, vaultIDs, accountIDs)
		if !beforeRelevant && !afterRelevant {
			continue
		}
		before, after := model.PeriodTotals{}, model.PeriodTotals{}
		if beforeRelevant {
			before = totalsForRevision(event.Before)
		}
		if afterRelevant {
			after = totalsForRevision(event.After)
		}
		delta, err := subtractPeriodTotals(after, before)
		if err != nil {
			return model.PeriodTotals{}, 0, err
		}
		if err := addPeriodTotals(&totals, delta); err != nil {
			return model.PeriodTotals{}, 0, err
		}
		changeCount, err = checkedPeriodAdd(changeCount, 1)
		if err != nil {
			return model.PeriodTotals{}, 0, err
		}
	}
	return totals, changeCount, nil
}

func periodRevisionInCurrentScope(review model.PeriodReview, revision *model.TransactionRevisionSnapshot, vaultIDs, accountIDs []string) bool {
	if !revisionInReview(review, revision) || !contains(vaultIDs, revision.VaultID) || !contains(accountIDs, revision.AccountID) {
		return false
	}
	return revision.DestinationAccountID == "" || contains(accountIDs, revision.DestinationAccountID)
}
