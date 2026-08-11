package service

import (
	"context"
	"errors"
	"math"
	"reflect"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type periodAggregationStore struct {
	*periodReviewStore
	results  []periodAggregateResult
	pipeline repository.Pipeline
}

func (s *periodAggregationStore) SupportsExactServerAggregation() bool { return true }

func (s *periodAggregationStore) Aggregate(_ context.Context, _ string, pipeline repository.Pipeline, destination any) error {
	s.pipeline = pipeline
	*destination.(*[]periodAggregateResult) = append([]periodAggregateResult(nil), s.results...)
	return nil
}

func TestPeriodAggregateResultCheckedInt64Conversion(t *testing.T) {
	result := periodAggregateResult{
		IncomeMinor: "25", SpendingMinor: "7", NetMinor: "18",
		TransactionCount: "3", ChangeCount: "2",
	}
	totals, count, err := result.periodTotals()
	if err != nil {
		t.Fatal(err)
	}
	if totals != (model.PeriodTotals{IncomeMinor: 25, SpendingMinor: 7, NetMinor: 18, TransactionCount: 3}) || count != 2 {
		t.Fatalf("decoded aggregate = %#v, %d", totals, count)
	}

	result.IncomeMinor = "9223372036854775808"
	if _, _, err := result.periodTotals(); !errors.Is(err, ErrPeriodTotalsOverflow) {
		t.Fatalf("overflow error = %v, want ErrPeriodTotalsOverflow", err)
	}
	result.IncomeMinor = "1.5"
	if _, _, err := result.periodTotals(); !errors.Is(err, ErrPeriodTotalsOverflow) {
		t.Fatalf("fractional error = %v, want ErrPeriodTotalsOverflow", err)
	}
}

func TestAggregateTransactionTotalsUsesDecimal128Accumulators(t *testing.T) {
	_, base := periodReviewFinance()
	store := &periodAggregationStore{
		periodReviewStore: base,
		results: []periodAggregateResult{{
			IncomeMinor: "9007199254740993", SpendingMinor: "1", NetMinor: "9007199254740992", TransactionCount: "2",
		}},
	}
	finance := NewFinanceService(store, NewAccessService(store))

	got, err := finance.aggregateTransactionTotals(context.Background(), repository.Filter{"workspace_id": "workspace-a"})
	if err != nil {
		t.Fatal(err)
	}
	if got.IncomeMinor != 9_007_199_254_740_993 || got.NetMinor != 9_007_199_254_740_992 || got.TransactionCount != 2 {
		t.Fatalf("totals = %#v", got)
	}
	pipelineJSON := marshalPeriodPipeline(t, store.pipeline)
	for _, required := range []string{"$toDecimal", "$toString", "income_minor", "spending_minor", "transaction_count"} {
		if !strings.Contains(pipelineJSON, required) {
			t.Fatalf("pipeline missing %q: %s", required, pipelineJSON)
		}
	}
}

func TestPeriodEventFilterUsesCurrentAssetScopeAndInclusiveCivilDates(t *testing.T) {
	review := model.PeriodReview{
		WorkspaceID: "workspace-a", Scope: model.PeriodReviewScopeMemberView, ScopeActorID: "member-a",
		VaultIDs: []string{"vault-a", "revoked-vault"}, AccountIDs: []string{"account-a", "revoked-account"},
		Currency: "INR", From: "2026-07-01", To: "2026-07-31", CutoffLedgerVersion: 19,
	}
	currentVaultIDs := []string{"vault-a", "new-vault"}
	currentAccountIDs := []string{"account-a", "new-account", "destination-a"}
	filter := periodEventFilter(review, currentVaultIDs, currentAccountIDs)
	encoded, err := bson.MarshalExtJSON(bson.M{"filter": filter}, false, false)
	if err != nil {
		t.Fatal(err)
	}
	text := string(encoded)
	for _, required := range []string{
		"workspace-a", "transaction", "member-a", "INR", "vault-a", "new-vault",
		"account-a", "new-account", "destination-a", "destination_account_id",
		"2026-07-01", "2026-07-31", "reporting_date", "$gte", "$lte", "ledger_version",
	} {
		if !strings.Contains(text, required) {
			t.Fatalf("filter missing %q: %s", required, text)
		}
	}
	if strings.Contains(text, "$dateToString") || strings.Contains(text, "occurred_at") || strings.Contains(text, "created_at") {
		t.Fatalf("filter retained a non-sargable date fallback: %s", text)
	}
	branches, ok := filter["$or"].([]repository.Filter)
	if !ok || len(branches) != 2 {
		t.Fatalf("ordinary before/after branches = %#v", filter["$or"])
	}
	for index, side := range []string{"before", "after"} {
		clauses, ok := branches[index]["$and"].([]repository.Filter)
		if !ok {
			t.Fatalf("%s branch = %#v", side, branches[index])
		}
		dateValue, found := periodFilterClauseValue(clauses, side+".reporting_date")
		bounds, boundsOK := dateValue.(repository.Filter)
		if !found || !boundsOK || bounds["$gte"] != review.From || bounds["$lte"] != review.To {
			t.Fatalf("%s reporting-date bounds = %#v", side, dateValue)
		}
		vaultValue, vaultFound := periodFilterClauseValue(clauses, side+".vault_id")
		accountValue, accountFound := periodFilterClauseValue(clauses, side+".account_id")
		if !vaultFound || !accountFound || !reflect.DeepEqual(vaultValue, repository.Filter{"$in": currentVaultIDs}) || !reflect.DeepEqual(accountValue, repository.Filter{"$in": currentAccountIDs}) {
			t.Fatalf("%s current asset scope = vault:%#v account:%#v", side, vaultValue, accountValue)
		}
	}
	if _, exact := filter["$expr"]; !exact {
		t.Fatalf("filter omitted exact residual: %#v", filter)
	}
	for _, assetID := range []string{"revoked-vault", "revoked-account"} {
		if strings.Contains(text, assetID) {
			t.Fatalf("financial relevance retained inaccessible asset ID %q: %s", assetID, text)
		}
	}
}

func TestPeriodRevisionSummaryUsesCurrentAssetScopeAndDecimalDelta(t *testing.T) {
	_, base := periodReviewFinance()
	base.vaults["new-vault"] = model.Vault{ID: "new-vault", WorkspaceID: "workspace-a", Privacy: "workspace"}
	base.accounts["new-account"] = model.Account{ID: "new-account", WorkspaceID: "workspace-a", VaultID: "new-vault", Privacy: "workspace"}
	store := &periodAggregationStore{
		periodReviewStore: base,
		results: []periodAggregateResult{{
			IncomeMinor: "5", SpendingMinor: "2", NetMinor: "3", TransactionCount: "0", ChangeCount: "4",
		}},
	}
	finance := NewFinanceService(store, NewAccessService(store))
	review := model.PeriodReview{
		WorkspaceID: "workspace-a", Scope: model.PeriodReviewScopeMemberView, ScopeActorID: "user-a",
		VaultIDs: []string{"vault-a", "revoked-vault"}, AccountIDs: []string{"account-a", "revoked-account"},
		Currency: "INR", From: "2026-07-01", To: "2026-07-31", CutoffLedgerVersion: 7,
	}

	currentVaultIDs := []string{"vault-a", "new-vault"}
	currentAccountIDs := []string{"account-a", "new-account"}
	totals, count, err := finance.periodRevisionSummary(context.Background(), review, currentVaultIDs, currentAccountIDs)
	if err != nil {
		t.Fatal(err)
	}
	if totals != (model.PeriodTotals{IncomeMinor: 5, SpendingMinor: 2, NetMinor: 3}) || count != 4 {
		t.Fatalf("summary = %#v, %d", totals, count)
	}
	text := marshalPeriodPipeline(t, store.pipeline)
	for _, assetID := range []string{"vault-a", "account-a", "new-vault", "new-account"} {
		if !strings.Contains(text, assetID) {
			t.Fatalf("financial summary omitted current asset ID %q: %s", assetID, text)
		}
	}
	for _, assetID := range []string{"revoked-vault", "revoked-account"} {
		if strings.Contains(text, assetID) {
			t.Fatalf("financial summary retained inaccessible asset ID %q: %s", assetID, text)
		}
	}
	if !strings.Contains(text, "$toDecimal") || !strings.Contains(text, "$toString") {
		t.Fatalf("summary pipeline is not decimal-safe: %s", text)
	}
	match, ok := store.pipeline[0]["$match"].(repository.Filter)
	if !ok || !reflect.DeepEqual(match, periodEventFilter(review, currentVaultIDs, currentAccountIDs)) {
		t.Fatalf("summary does not start with the sargable page filter: %#v", store.pipeline)
	}
	if strings.Contains(text, "$dateToString") || !strings.Contains(text, "reporting_date") {
		t.Fatalf("summary date predicate is not directly sargable: %s", text)
	}
}

func TestPeriodRevisionSummaryFallbackExcludesInaccessibleSourceAndDestination(t *testing.T) {
	finance, store := periodReviewFinance()
	review := model.PeriodReview{
		WorkspaceID: "workspace-a", Scope: model.PeriodReviewScopeMemberView, ScopeActorID: "user-a",
		Currency: "INR", From: "2026-07-01", To: "2026-07-31",
	}
	snapshot := func(id, vaultID, accountID, destinationID, kind string, amount int64) *model.TransactionRevisionSnapshot {
		return &model.TransactionRevisionSnapshot{
			ID: id, WorkspaceID: "workspace-a", VaultID: vaultID, AccountID: accountID,
			DestinationAccountID: destinationID, CreatedBy: "user-a", Privacy: "workspace",
			Currency: "INR", ReportingDate: "2026-07-12", Type: kind, AmountMinor: amount,
		}
	}
	store.events = []model.AuditEvent{
		{After: snapshot("current-income", "vault-a", "account-a", "", "income", 10)},
		{After: snapshot("new-visible-expense", "new-vault", "new-account", "", "expense", 3)},
		{After: snapshot("revoked-income", "revoked-vault", "revoked-account", "", "income", 100)},
		{After: snapshot("hidden-destination", "vault-a", "account-a", "revoked-account", "transfer", 20)},
	}

	totals, count, err := finance.periodRevisionSummary(
		context.Background(), review,
		[]string{"vault-a", "new-vault"},
		[]string{"account-a", "new-account"},
	)
	if err != nil {
		t.Fatal(err)
	}
	want := model.PeriodTotals{IncomeMinor: 10, SpendingMinor: 3, NetMinor: 7, TransactionCount: 2}
	if totals != want || count != 2 {
		t.Fatalf("fallback summary = %#v, %d; want %#v, 2", totals, count, want)
	}
}

func TestPeriodAggregateResultRejectsChangeCountOverflow(t *testing.T) {
	result := periodAggregateResult{ChangeCount: "9223372036854775808"}
	_, _, err := result.periodTotals()
	if !errors.Is(err, ErrPeriodTotalsOverflow) {
		t.Fatalf("error = %v, want ErrPeriodTotalsOverflow", err)
	}
	result.ChangeCount = ""
	result.TransactionCount = "-9223372036854775808"
	result.NetMinor = "-9223372036854775808"
	result.IncomeMinor = "0"
	result.SpendingMinor = "0"
	if totals, _, err := result.periodTotals(); err != nil || totals.TransactionCount != math.MinInt64 || totals.NetMinor != math.MinInt64 {
		t.Fatalf("minimum int64 decode = %#v, %v", totals, err)
	}
}

func marshalPeriodPipeline(t *testing.T, pipeline repository.Pipeline) string {
	t.Helper()
	encoded, err := bson.MarshalExtJSON(bson.M{"pipeline": pipeline}, false, false)
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded)
}

func periodFilterClauseValue(clauses []repository.Filter, key string) (any, bool) {
	for _, clause := range clauses {
		value, found := clause[key]
		if found {
			return value, true
		}
	}
	return nil, false
}
