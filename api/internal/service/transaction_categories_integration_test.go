package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

var errCategoryMigrationAuditRejected = errors.New("reject category migration audit")

type categoryMigrationAuditRejectingStore struct {
	repository.Store
	transactionAudits int
}

func (store *categoryMigrationAuditRejectingStore) Insert(ctx context.Context, collection string, document any) error {
	if collection == "audit_events" {
		if event, ok := document.(*model.AuditEvent); ok && event.EntityType == "transaction" && event.Action == "transaction.updated" {
			store.transactionAudits++
			if store.transactionAudits == 2 {
				return errCategoryMigrationAuditRejected
			}
		}
	}
	return store.Store.Insert(ctx, collection, document)
}

func TestTransactionCategoryMigrationMongoIntegrationHistoryAndRollback(t *testing.T) {
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
	database := client.Database(fmt.Sprintf("ledgerly_category_migration_%d", time.Now().UnixNano()))
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		if err := database.Drop(cleanupCtx); err != nil {
			t.Errorf("drop category integration database: %v", err)
		}
		if err := client.Disconnect(cleanupCtx); err != nil {
			t.Errorf("disconnect category integration client: %v", err)
		}
	})

	store := repository.NewMongoStore(client, database)
	finance := NewFinanceService(store, NewAccessService(store))
	seedRuntimePeriodReview(t, ctx, store)
	source, err := finance.CreateTransactionCategory(ctx, runtimeWorkspaceID, runtimeActorID, TransactionCategoryCreateInput{
		TransactionType: model.TransactionCategoryExpense, Name: "QA Source", Color: "#2563eb",
	})
	if err != nil {
		t.Fatalf("create source category: %v", err)
	}
	replacement, err := finance.CreateTransactionCategory(ctx, runtimeWorkspaceID, runtimeActorID, TransactionCategoryCreateInput{
		TransactionType: model.TransactionCategoryExpense, Name: "QA Replacement", Color: "#16a34a",
	})
	if err != nil {
		t.Fatalf("create replacement category: %v", err)
	}

	amounts := []int64{100, 200, 300}
	for index, amount := range amounts {
		if _, err := finance.CreateTransaction(ctx, runtimeWorkspaceID, runtimeActorID, fmt.Sprintf("category-migration-%d", index), TransactionInput{
			VaultID: runtimeVaultID, AccountID: runtimeAccountID, Type: "expense", AmountMinor: amount,
			Currency: "INR", Category: source.Name, Privacy: "workspace", OccurredAt: runtimeCivil(2026, time.July, 10+index),
		}); err != nil {
			t.Fatalf("create source transaction %d: %v", index, err)
		}
	}
	review, err := finance.CreatePeriodReview(ctx, runtimeWorkspaceID, runtimeActorID, PeriodReviewInput{
		From: "2026-07-01", To: "2026-07-31", Timezone: "Asia/Kolkata", Status: "closed", Scope: model.PeriodReviewScopeWorkspaceView,
	})
	if err != nil {
		t.Fatalf("close category period: %v", err)
	}
	assertRuntimeTotals(t, "category snapshot", review.Snapshot, model.PeriodTotals{
		SpendingMinor: 600, NetMinor: -600, TransactionCount: 3,
	})

	renamed := "QA Renamed"
	if _, err := finance.UpdateTransactionCategory(ctx, runtimeWorkspaceID, runtimeActorID, source.ID, TransactionCategoryUpdateInput{Name: &renamed}); err != nil {
		t.Fatalf("rename category: %v", err)
	}
	assertCategoryMigrationTransactions(t, ctx, store, renamed, len(amounts))
	renameEvents := categoryMigrationEvents(t, ctx, store, review.CutoffLedgerVersion)
	assertCategoryMigrationEvents(t, renameEvents, review.CutoffLedgerVersion+1, source.Name, renamed)

	var beforeRollback model.Workspace
	if err := store.FindOne(ctx, "workspaces", repository.Filter{"_id": runtimeWorkspaceID}, &beforeRollback); err != nil {
		t.Fatal(err)
	}
	rejecting := &categoryMigrationAuditRejectingStore{Store: store}
	rejectingFinance := NewFinanceService(rejecting, NewAccessService(rejecting))
	if err := rejectingFinance.DeleteTransactionCategory(ctx, runtimeWorkspaceID, runtimeActorID, source.ID, replacement.ID); !errors.Is(err, errCategoryMigrationAuditRejected) {
		t.Fatalf("forced replacement audit failure = %v, want %v", err, errCategoryMigrationAuditRejected)
	}
	var afterRollback model.Workspace
	if err := store.FindOne(ctx, "workspaces", repository.Filter{"_id": runtimeWorkspaceID}, &afterRollback); err != nil {
		t.Fatal(err)
	}
	if afterRollback.LedgerVersion != beforeRollback.LedgerVersion {
		t.Fatalf("failed replacement advanced ledger from %d to %d", beforeRollback.LedgerVersion, afterRollback.LedgerVersion)
	}
	var retained model.TransactionCategory
	if err := store.FindOne(ctx, transactionCategoriesCollection, repository.Filter{"_id": source.ID, "workspace_id": runtimeWorkspaceID}, &retained); err != nil {
		t.Fatalf("failed replacement deleted source category: %v", err)
	}
	if retained.Name != renamed {
		t.Fatalf("source category after rollback = %q, want %q", retained.Name, renamed)
	}
	assertCategoryMigrationTransactions(t, ctx, store, renamed, len(amounts))
	if got := len(categoryMigrationEvents(t, ctx, store, review.CutoffLedgerVersion)); got != len(amounts) {
		t.Fatalf("failed replacement left %d transaction audits, want %d prior rename audits", got, len(amounts))
	}

	if err := finance.DeleteTransactionCategory(ctx, runtimeWorkspaceID, runtimeActorID, source.ID, replacement.ID); err != nil {
		t.Fatalf("delete category with replacement: %v", err)
	}
	assertCategoryMigrationTransactions(t, ctx, store, replacement.Name, len(amounts))
	allEvents := categoryMigrationEvents(t, ctx, store, review.CutoffLedgerVersion)
	if len(allEvents) != len(amounts)*2 {
		t.Fatalf("category migration audit count = %d, want %d", len(allEvents), len(amounts)*2)
	}
	assertCategoryMigrationEvents(t, allEvents[:len(amounts)], review.CutoffLedgerVersion+1, source.Name, renamed)
	assertCategoryMigrationEvents(t, allEvents[len(amounts):], review.CutoffLedgerVersion+1+int64(len(amounts)), renamed, replacement.Name)

	views, err := finance.ListPeriodReviews(ctx, runtimeWorkspaceID, runtimeActorID, PeriodReviewInput{
		From: "2026-07-01", To: "2026-07-31", Timezone: "UTC",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(views) != 1 || views[0].ID != review.ID || views[0].ChangeCount != int64(len(amounts)*2) || !views[0].ChangedAfterClose {
		t.Fatalf("category period marker = %#v", views)
	}
	assertRuntimeTotals(t, "category migration cumulative delta", views[0].Delta, model.PeriodTotals{})
	changes, err := finance.ListPeriodReviewChanges(ctx, runtimeWorkspaceID, runtimeActorID, review.ID, 100, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(changes) != len(amounts)*2 {
		t.Fatalf("category drilldown count = %d, want %d", len(changes), len(amounts)*2)
	}
	for index, change := range changes {
		if change.Action != "edited" || !reflect.DeepEqual(change.ChangedFields, []string{"category"}) || change.Delta != (model.PeriodTotals{}) {
			t.Fatalf("category drilldown[%d] = %#v", index, change)
		}
	}
}

func assertCategoryMigrationTransactions(t *testing.T, ctx context.Context, store repository.Store, category string, want int) {
	t.Helper()
	var transactions []model.Transaction
	if err := store.FindMany(ctx, "transactions", repository.Filter{"workspace_id": runtimeWorkspaceID, "category": category}, &transactions, 0, 0, nil); err != nil {
		t.Fatal(err)
	}
	if len(transactions) != want {
		t.Fatalf("transactions in category %q = %d, want %d", category, len(transactions), want)
	}
}

func categoryMigrationEvents(t *testing.T, ctx context.Context, store repository.Store, cutoff int64) []model.AuditEvent {
	t.Helper()
	var events []model.AuditEvent
	if err := store.FindMany(ctx, "audit_events", repository.Filter{
		"workspace_id": runtimeWorkspaceID, "entity_type": "transaction", "ledger_version": repository.Filter{"$gt": cutoff},
	}, &events, 0, 0, repository.Sort{"ledger_version": 1}); err != nil {
		t.Fatal(err)
	}
	return events
}

func assertCategoryMigrationEvents(t *testing.T, events []model.AuditEvent, firstVersion int64, beforeCategory, afterCategory string) {
	t.Helper()
	for index, event := range events {
		wantVersion := firstVersion + int64(index)
		if event.LedgerVersion != wantVersion || event.Action != "transaction.updated" || event.Before == nil || event.After == nil {
			t.Fatalf("category audit[%d] = %#v, want version %d with before/after", index, event, wantVersion)
		}
		if event.Before.Category != beforeCategory || event.After.Category != afterCategory || !reflect.DeepEqual(event.ChangedFields, []string{"category"}) {
			t.Fatalf("category audit[%d] categories/fields = %q -> %q / %#v", index, event.Before.Category, event.After.Category, event.ChangedFields)
		}
	}
}
