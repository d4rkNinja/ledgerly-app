package service

import (
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

func pipelineFacetForTest(t *testing.T, pipeline repository.Pipeline) repository.Filter {
	t.Helper()
	for _, stage := range pipeline {
		if facet, ok := stage["$facet"].(repository.Filter); ok {
			return facet
		}
	}
	t.Fatalf("pipeline has no $facet stage: %#v", pipeline)
	return nil
}

func pipelineHasOperator(pipeline repository.Pipeline, operator string) bool {
	for _, stage := range pipeline {
		if _, ok := stage[operator]; ok {
			return true
		}
	}
	return false
}

func TestDashboardAggregationMetricsUseExactFacetPipelines(t *testing.T) {
	pipeline := dashboardTransactionPipeline(repository.Filter{"workspace_id": "workspace-a"})
	facet := pipelineFacetForTest(t, pipeline)
	for _, name := range []string{"summary", "categories", "sources", "types", "contacts", "accounts", "daily", "monthly"} {
		metric, ok := facet[name].(repository.Pipeline)
		if !ok {
			t.Fatalf("facet %q type = %T, want repository.Pipeline", name, facet[name])
		}
		if pipelineHasOperator(metric, "$limit") {
			t.Fatalf("exact metric facet %q contains a truncating $limit: %#v", name, metric)
		}
	}
	repeated := facet["repeated"].(repository.Pipeline)
	groupIndex := -1
	limitIndex := -1
	for index, stage := range repeated {
		if _, ok := stage["$group"]; ok {
			groupIndex = index
		}
		if _, ok := stage["$limit"]; ok {
			limitIndex = index
		}
	}
	if groupIndex < 0 || limitIndex < groupIndex {
		t.Fatalf("repeated detection must group the full authorized period before limiting display rows: %#v", repeated)
	}
	if pipelineHasOperator(pipeline[:2], "$limit") {
		t.Fatalf("transaction source pipeline is capped before aggregation: %#v", pipeline)
	}
}

func TestDashboardGoalAggregationKeepsExactAllAndPeriodGroups(t *testing.T) {
	from := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)
	to := from.AddDate(0, 1, 0)
	facet := pipelineFacetForTest(t, dashboardGoalPipeline(repository.Filter{"workspace_id": "workspace-a"}, DateRange{From: &from, To: &to}, time.Date(2026, time.August, 7, 0, 0, 0, 0, time.UTC)))
	for _, name := range []string{"all", "period"} {
		group, ok := facet[name].(repository.Pipeline)
		if !ok || len(group) == 0 || !pipelineHasOperator(group, "$group") {
			t.Fatalf("goal facet %q does not contain an exact group pipeline: %#v", name, facet[name])
		}
		if pipelineHasOperator(group, "$limit") {
			t.Fatalf("goal facet %q is capped before summary aggregation: %#v", name, group)
		}
	}
	nearest := facet["nearest"].(repository.Pipeline)
	if !pipelineHasOperator(nearest, "$limit") {
		t.Fatal("nearest goal display facet should remain bounded independently of exact totals")
	}
}

func TestDashboardAllTimeSourcePipelineHasNoArtificialDateBounds(t *testing.T) {
	pipeline := dashboardTransactionPipeline(repository.Filter{"workspace_id": "workspace-a"})
	match, ok := pipeline[0]["$match"].(repository.Filter)
	if !ok {
		t.Fatalf("dashboard match stage = %#v", pipeline[0])
	}
	if _, found := match["occurred_at"]; found {
		t.Fatalf("all-time query unexpectedly contains an occurred_at bound: %#v", match)
	}
}
