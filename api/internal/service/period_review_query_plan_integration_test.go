package service

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

func TestPeriodReviewMongoIntegrationSummaryQueryPlanUsesReportingDateIndexes(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	t.Cleanup(cancel)
	uri := os.Getenv("MONGO_TEST_URI")
	if uri == "" {
		t.Skip("MONGO_TEST_URI is not set; skipping replica-set integration test")
	}
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		_ = client.Disconnect(context.Background())
		t.Fatal(err)
	}
	database := client.Database(fmt.Sprintf("ledgerly_period_plan_%d", time.Now().UnixNano()))
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		if err := database.Drop(cleanupCtx); err != nil {
			t.Errorf("drop query-plan database: %v", err)
		}
		if err := client.Disconnect(cleanupCtx); err != nil {
			t.Errorf("disconnect query-plan client: %v", err)
		}
	})

	collection := database.Collection("audit_events")
	const (
		beforeIndex = "period_revision_before_summary"
		afterIndex  = "period_revision_after_summary"
	)
	if _, err := collection.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "entity_type", Value: 1}, {Key: "before.currency", Value: 1}, {Key: "before.reporting_date", Value: 1}, {Key: "ledger_version", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName(beforeIndex)},
		{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "entity_type", Value: 1}, {Key: "after.currency", Value: 1}, {Key: "after.reporting_date", Value: 1}, {Key: "ledger_version", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName(afterIndex)},
	}); err != nil {
		t.Fatalf("create period summary indexes: %v", err)
	}

	revision := func(reportingDate string) bson.M {
		return bson.M{
			"workspace_id": "workspace-plan", "currency": "INR", "reporting_date": reportingDate,
			"vault_id": "vault-plan", "account_id": "account-plan",
			"privacy": "workspace", "created_by": "user-plan",
		}
	}
	documents := make([]any, 0, 3003)
	documents = append(documents,
		bson.M{"_id": "relevant-before", "workspace_id": "workspace-plan", "entity_type": "transaction", "ledger_version": int64(11), "before": revision("2026-07-03")},
		bson.M{"_id": "relevant-after", "workspace_id": "workspace-plan", "entity_type": "transaction", "ledger_version": int64(12), "after": revision("2026-07-18")},
		bson.M{"_id": "relevant-both", "workspace_id": "workspace-plan", "entity_type": "transaction", "ledger_version": int64(13), "before": revision("2026-07-20"), "after": revision("2026-07-21")},
	)
	for index := 0; index < 1500; index++ {
		documents = append(documents,
			bson.M{"_id": fmt.Sprintf("noise-before-%04d", index), "workspace_id": "workspace-plan", "entity_type": "transaction", "ledger_version": int64(100 + index), "before": revision("2025-01-10")},
			bson.M{"_id": fmt.Sprintf("noise-after-%04d", index), "workspace_id": "workspace-plan", "entity_type": "transaction", "ledger_version": int64(2000 + index), "after": revision("2027-01-10")},
		)
	}
	if _, err := collection.InsertMany(ctx, documents, options.InsertMany().SetOrdered(false)); err != nil {
		t.Fatalf("seed query-plan history: %v", err)
	}

	review := model.PeriodReview{
		WorkspaceID: "workspace-plan", Scope: model.PeriodReviewScopeWorkspaceView, Currency: "INR",
		From: "2026-07-01", To: "2026-07-31", CutoffLedgerVersion: 10,
	}
	command := bson.D{
		{Key: "explain", Value: bson.D{
			{Key: "find", Value: "audit_events"},
			{Key: "filter", Value: periodEventFilter(review, []string{"vault-plan"}, []string{"account-plan"})},
		}},
		{Key: "verbosity", Value: "executionStats"},
	}
	var explain bson.M
	if err := database.RunCommand(ctx, command).Decode(&explain); err != nil {
		t.Fatalf("explain period summary match: %v", err)
	}
	plannerJSON, err := bson.MarshalExtJSON(explain["queryPlanner"], false, false)
	if err != nil {
		t.Fatalf("encode winning plan: %v", err)
	}
	planner := string(plannerJSON)
	for _, evidence := range []string{`"stage":"IXSCAN"`, beforeIndex, afterIndex} {
		if !strings.Contains(planner, evidence) {
			t.Fatalf("winning plan missing %q: %s", evidence, planner)
		}
	}
	execution, ok := explain["executionStats"].(bson.M)
	if !ok {
		t.Fatalf("executionStats missing from explain: %#v", explain)
	}
	nReturned := mongoExplainInteger(t, execution["nReturned"], "nReturned")
	documentsExamined := mongoExplainInteger(t, execution["totalDocsExamined"], "totalDocsExamined")
	keysExamined := mongoExplainInteger(t, execution["totalKeysExamined"], "totalKeysExamined")
	if nReturned != 3 {
		t.Fatalf("period plan returned %d documents, want 3", nReturned)
	}
	// The OR plan may fetch a row once per before/after branch before Mongo
	// deduplicates it. Bound examination to two branch hits per returned row,
	// plus one planner boundary key; thousands of out-of-period rows must not be
	// fetched.
	if documentsExamined > nReturned*2+1 || documentsExamined >= int64(len(documents))/100 {
		t.Fatalf("period plan examined %d of %d documents for %d returned rows, want a two-branch period bound", documentsExamined, len(documents), nReturned)
	}
	if keysExamined > 8 {
		t.Fatalf("period plan examined %d keys for three relevant documents", keysExamined)
	}
	t.Logf("PASS query plan indexes=%s,%s nReturned=%d docsExamined=%d keysExamined=%d", beforeIndex, afterIndex, nReturned, documentsExamined, keysExamined)
}
func mongoExplainInteger(t *testing.T, value any, field string) int64 {
	t.Helper()
	switch number := value.(type) {
	case int32:
		return int64(number)
	case int64:
		return number
	case float64:
		return int64(number)
	default:
		t.Fatalf("explain %s has unexpected type %T (%v)", field, value, value)
		return 0
	}
}
