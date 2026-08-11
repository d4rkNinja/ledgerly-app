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

const (
	runtimeWorkspaceID    = "runtime-workspace"
	runtimeActorID        = "runtime-user"
	runtimeVaultID        = "runtime-vault"
	runtimeAccountID      = "runtime-account"
	runtimeOtherActorID   = "runtime-other-user"
	runtimeOtherVaultID   = "runtime-other-vault"
	runtimeOtherAccountID = "runtime-other-account"
)

var errRuntimeReviewAuditRejected = errors.New("reject period-review audit for rollback test")

func TestPeriodReviewMongoIntegrationSnapshotRevisionsAndDST(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
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
	database := client.Database(fmt.Sprintf("ledgerly_period_review_runtime_%d", time.Now().UnixNano()))
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		if err := database.Drop(cleanupCtx); err != nil {
			t.Errorf("drop runtime database: %v", err)
		}
		if err := client.Disconnect(cleanupCtx); err != nil {
			t.Errorf("disconnect runtime client: %v", err)
		}
	})

	store := repository.NewMongoStore(client, database)
	finance := NewFinanceService(store, NewAccessService(store))
	seedRuntimePeriodReview(t, ctx, store)
	first := createRuntimeTransaction(t, ctx, finance, "runtime-expense-first", runtimeAccountID, "expense", 100, runtimeCivil(2026, time.July, 1))
	last := createRuntimeTransaction(t, ctx, finance, "runtime-income-last", runtimeAccountID, "income", 300, runtimeCivil(2026, time.July, 31))
	createRuntimeTransaction(t, ctx, finance, "runtime-expense-outside", runtimeAccountID, "expense", 900, runtimeCivil(2026, time.August, 1))
	splitTransaction, err := finance.CreateTransaction(ctx, runtimeWorkspaceID, runtimeActorID, "runtime-split-allocation", TransactionInput{
		VaultID: runtimeVaultID, AccountID: runtimeAccountID, Type: "split", AmountMinor: 80,
		Currency: "INR", Privacy: "workspace", OccurredAt: runtimeCivil(2026, time.July, 9),
		Splits: []model.Split{{UserID: runtimeActorID, AmountMinor: 40}, {UserID: runtimeOtherActorID, AmountMinor: 40}},
	})
	if err != nil {
		t.Fatalf("create split transaction: %v", err)
	}
	if _, err := finance.CreateTransaction(ctx, runtimeWorkspaceID, runtimeOtherActorID, "runtime-other-private-before-review", TransactionInput{
		VaultID: runtimeOtherVaultID, AccountID: runtimeOtherAccountID, Type: "expense", AmountMinor: 900,
		Currency: "INR", Privacy: "private", OccurredAt: runtimeCivil(2026, time.July, 10),
	}); err != nil {
		t.Fatalf("create another member's initial private transaction: %v", err)
	}

	review, err := finance.CreatePeriodReview(ctx, runtimeWorkspaceID, runtimeActorID, PeriodReviewInput{
		From: "2026-07-01", To: "2026-07-31", Timezone: "America/Los_Angeles", Status: "closed",
		Scope: model.PeriodReviewScopeWorkspaceView,
	})
	if err != nil {
		t.Fatal(err)
	}
	assertRuntimeTotals(t, "July workspace snapshot", review.Snapshot, model.PeriodTotals{IncomeMinor: 300, SpendingMinor: 180, NetMinor: 120, TransactionCount: 3})
	assertRuntimeTime(t, "July fromUtc", review.FromUTC, time.Date(2026, time.July, 1, 7, 0, 0, 0, time.UTC))
	assertRuntimeTime(t, "July toUtcExclusive", review.ToUTCExclusive, time.Date(2026, time.August, 1, 7, 0, 0, 0, time.UTC))
	memberReview, err := finance.CreatePeriodReview(ctx, runtimeWorkspaceID, runtimeOtherActorID, PeriodReviewInput{
		From: "2026-07-01", To: "2026-07-31", Timezone: "America/Los_Angeles", Status: "reviewed",
		Scope: model.PeriodReviewScopeMemberView,
	})
	if err != nil {
		t.Fatalf("create member-view review: %v", err)
	}
	assertRuntimeTotals(t, "July member snapshot", memberReview.Snapshot, model.PeriodTotals{IncomeMinor: 300, SpendingMinor: 1080, NetMinor: -780, TransactionCount: 4})
	travelViews, err := finance.ListPeriodReviews(ctx, runtimeWorkspaceID, runtimeOtherActorID, PeriodReviewInput{
		From: "2026-07-01", To: "2026-07-31", Timezone: "Asia/Kolkata",
	})
	if err != nil {
		t.Fatalf("list reviews after timezone travel: %v", err)
	}
	if len(travelViews) != 2 || travelViews[0].Timezone != "America/Los_Angeles" || travelViews[1].Timezone != "America/Los_Angeles" {
		t.Fatalf("timezone-travel review history = %#v, want shared and own checkpoints with retained timezone", travelViews)
	}
	if _, err := finance.ListPeriodReviewChanges(ctx, runtimeWorkspaceID, runtimeActorID, memberReview.ID, 10, 0); !errors.Is(err, ErrForbidden) {
		t.Fatalf("other member reading private member review error = %v, want forbidden", err)
	}

	_, err = finance.UpdateTransaction(ctx, runtimeWorkspaceID, runtimeActorID, first.ID, TransactionInput{
		VaultID: runtimeVaultID, AccountID: runtimeAccountID, Type: "expense", AmountMinor: 150, Currency: "INR", Privacy: "workspace", OccurredAt: runtimeCivil(2026, time.July, 1),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := finance.DeleteTransaction(ctx, runtimeWorkspaceID, runtimeActorID, last.ID); err != nil {
		t.Fatal(err)
	}
	createRuntimeTransaction(t, ctx, finance, "runtime-expense-backdated", runtimeAccountID, "expense", 25, runtimeCivil(2026, time.July, 15))

	now := time.Now().UTC()
	newAccount := model.Account{
		ID: "runtime-account-new", WorkspaceID: runtimeWorkspaceID, VaultID: runtimeVaultID, OwnerID: runtimeActorID,
		Name: "New visible account", Type: "cash", Currency: "INR", BalanceMinor: 100000,
		Status: "active", Privacy: "workspace", CreatedAt: now, UpdatedAt: now,
	}
	if err := store.Insert(ctx, "accounts", &newAccount); err != nil {
		t.Fatal(err)
	}
	createRuntimeTransaction(t, ctx, finance, "runtime-income-new-account", newAccount.ID, "income", 70, runtimeCivil(2026, time.July, 20))
	if _, err := finance.CreateTransaction(ctx, runtimeWorkspaceID, runtimeOtherActorID, "runtime-other-private", TransactionInput{
		VaultID: runtimeOtherVaultID, AccountID: runtimeOtherAccountID, Type: "expense", AmountMinor: 900,
		Currency: "INR", Privacy: "private", OccurredAt: runtimeCivil(2026, time.July, 12),
	}); err != nil {
		t.Fatalf("create another member's private transaction: %v", err)
	}
	sharedByOther, err := finance.CreateTransaction(ctx, runtimeWorkspaceID, runtimeOtherActorID, "runtime-other-shared", TransactionInput{
		VaultID: runtimeVaultID, AccountID: runtimeAccountID, Type: "expense", AmountMinor: 10,
		Currency: "INR", Privacy: "workspace", OccurredAt: runtimeCivil(2026, time.July, 18), Notes: "shared before privacy change",
	})
	if err != nil {
		t.Fatalf("create another member's shared transaction: %v", err)
	}
	if _, err := finance.UpdateTransaction(ctx, runtimeWorkspaceID, runtimeOtherActorID, sharedByOther.ID, TransactionInput{
		VaultID: runtimeVaultID, AccountID: runtimeAccountID, Type: "expense", AmountMinor: 10,
		Currency: "INR", Privacy: "private", OccurredAt: runtimeCivil(2026, time.July, 18), Notes: "private after privacy change",
	}); err != nil {
		t.Fatalf("make another member's shared transaction private: %v", err)
	}
	if _, err := finance.UpdateTransaction(ctx, runtimeWorkspaceID, runtimeActorID, splitTransaction.ID, TransactionInput{
		VaultID: runtimeVaultID, AccountID: runtimeAccountID, Type: "expense", AmountMinor: 80,
		Category: splitTransaction.Category, Currency: "INR", Privacy: "workspace",
		OccurredAt: runtimeCivil(2026, time.July, 9),
		Splits:     []model.Split{{UserID: runtimeActorID, AmountMinor: 50}, {UserID: runtimeOtherActorID, AmountMinor: 30}},
	}); err != nil {
		t.Fatalf("edit split allocation: %v", err)
	}

	views, err := finance.ListPeriodReviews(ctx, runtimeWorkspaceID, runtimeActorID, PeriodReviewInput{
		From: "2026-07-01", To: "2026-07-31", Timezone: "America/Los_Angeles",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(views) != 1 {
		t.Fatalf("July review count = %d, want 1", len(views))
	}
	view := views[0]
	if view.ChangeCount != 7 || !view.ChangedAfterClose {
		t.Fatalf("July marker = {changeCount:%d changedAfterClose:%t}, want {7 true}", view.ChangeCount, view.ChangedAfterClose)
	}
	assertRuntimeTotals(t, "July cumulative delta", view.Delta, model.PeriodTotals{IncomeMinor: -230, SpendingMinor: 75, NetMinor: -305, TransactionCount: 1})
	changes, err := finance.ListPeriodReviewChanges(ctx, runtimeWorkspaceID, runtimeActorID, review.ID, 100, 0)
	if err != nil {
		t.Fatal(err)
	}
	wantActions := []string{"edited", "deleted", "added", "added", "added", "edited", "edited"}
	if len(changes) != len(wantActions) {
		t.Fatalf("July drilldown count = %d, want %d", len(changes), len(wantActions))
	}
	for index, change := range changes {
		if change.Action != wantActions[index] {
			t.Fatalf("July drilldown action[%d] = %q, want %q", index, change.Action, wantActions[index])
		}
		wantEditor := "Runtime QA"
		if index == 4 || index == 5 {
			wantEditor = "Runtime Other"
		}
		if change.Editor == nil || change.Editor.Name != wantEditor {
			t.Fatalf("July drilldown[%d] lacks editor evidence: %#v", index, change)
		}
		if change.ApprovalState != model.ApprovalNotApplicable || change.RevisionState != model.RevisionCommitted {
			t.Fatalf("July drilldown[%d] states = %q/%q", index, change.ApprovalState, change.RevisionState)
		}
	}
	privacyChange := changes[5]
	if privacyChange.Before == nil || privacyChange.Before.Notes != "shared before privacy change" || privacyChange.After != nil || !privacyChange.AfterRedacted {
		t.Fatalf("workspace-to-private revision was not safely redacted: %#v", privacyChange)
	}
	if !changes[6].SplitAllocationChanged || len(changes[6].ChangedFields) != 0 {
		t.Fatalf("allocation-only revision did not preserve the privacy-safe split signal: %#v", changes[6])
	}
	pageOne, err := finance.ListPeriodReviewChanges(ctx, runtimeWorkspaceID, runtimeActorID, review.ID, 2, 0)
	if err != nil {
		t.Fatal(err)
	}
	pageTwo, err := finance.ListPeriodReviewChanges(ctx, runtimeWorkspaceID, runtimeActorID, review.ID, 2, 2)
	if err != nil {
		t.Fatal(err)
	}
	pageLast, err := finance.ListPeriodReviewChanges(ctx, runtimeWorkspaceID, runtimeActorID, review.ID, 2, 6)
	if err != nil {
		t.Fatal(err)
	}
	if len(pageOne) != 2 || len(pageTwo) != 2 || len(pageLast) != 1 || periodReviewRuntimeChangeID(pageOne[0]) != first.ID || periodReviewRuntimeChangeID(pageLast[0]) != splitTransaction.ID {
		t.Fatalf("stable revision pagination = first:%#v second:%#v last:%#v", pageOne, pageTwo, pageLast)
	}

	var immutableFirst model.PeriodReview
	if err := store.FindOne(ctx, periodReviewsCollection, repository.Filter{"_id": review.ID}, &immutableFirst); err != nil {
		t.Fatalf("load first checkpoint before re-review: %v", err)
	}
	rereviewInput := PeriodReviewInput{
		From: "2026-07-01", To: "2026-07-31", Timezone: "America/Los_Angeles", Status: "closed",
		Scope: model.PeriodReviewScopeWorkspaceView,
	}
	rereview, err := finance.CreatePeriodReview(ctx, runtimeWorkspaceID, runtimeActorID, rereviewInput)
	if err != nil {
		t.Fatalf("re-review changed July period: %v", err)
	}
	if rereview.ID == review.ID || rereview.CutoffLedgerVersion <= review.CutoffLedgerVersion {
		t.Fatalf("re-review checkpoint did not advance: first=%#v second=%#v", review, rereview)
	}
	assertRuntimeTotals(t, "July re-review snapshot", rereview.Snapshot, model.PeriodTotals{
		IncomeMinor: 70, SpendingMinor: 255, NetMinor: -185, TransactionCount: 4,
	})
	var persistedFirst model.PeriodReview
	if err := store.FindOne(ctx, periodReviewsCollection, repository.Filter{"_id": review.ID}, &persistedFirst); err != nil {
		t.Fatalf("reload first checkpoint after re-review: %v", err)
	}
	if !reflect.DeepEqual(persistedFirst, immutableFirst) {
		t.Fatalf("first immutable checkpoint changed\nbefore: %#v\nafter:  %#v", immutableFirst, persistedFirst)
	}
	views, err = finance.ListPeriodReviews(ctx, runtimeWorkspaceID, runtimeActorID, PeriodReviewInput{
		From: "2026-07-01", To: "2026-07-31", Timezone: "Asia/Kolkata",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(views) != 1 {
		t.Fatalf("latest July checkpoint count = %d, want 1", len(views))
	}
	if views[0].ID != rereview.ID || views[0].ChangeCount != 0 || views[0].ReviewState != model.PeriodReviewStateCurrent {
		t.Fatalf("latest July checkpoint = %#v, want current re-review", views[0])
	}
	oldChanges, err := finance.ListPeriodReviewChanges(ctx, runtimeWorkspaceID, runtimeActorID, review.ID, 20, 0)
	if err != nil {
		t.Fatalf("read immutable prior checkpoint by ID: %v", err)
	}
	if len(oldChanges) != 7 {
		t.Fatalf("prior checkpoint changes after re-review = %d, want 7", len(oldChanges))
	}
	reviewCountBeforeConflict, err := store.Count(ctx, periodReviewsCollection, repository.Filter{})
	if err != nil {
		t.Fatal(err)
	}
	auditCountBeforeConflict, err := store.Count(ctx, "audit_events", repository.Filter{"entity_type": "period_review"})
	if err != nil {
		t.Fatal(err)
	}
	ledgerBeforeConflict := runtimeWorkspaceLedgerVersion(t, ctx, store)
	if _, err := finance.CreatePeriodReview(ctx, runtimeWorkspaceID, runtimeActorID, rereviewInput); !errors.Is(err, ErrConflict) {
		t.Fatalf("unchanged re-review error = %v, want conflict", err)
	}
	if count, err := store.Count(ctx, periodReviewsCollection, repository.Filter{}); err != nil || count != reviewCountBeforeConflict {
		t.Fatalf("review count after unchanged conflict = %d, error = %v, want %d", count, err, reviewCountBeforeConflict)
	}
	if count, err := store.Count(ctx, "audit_events", repository.Filter{"entity_type": "period_review"}); err != nil || count != auditCountBeforeConflict {
		t.Fatalf("review audit count after unchanged conflict = %d, error = %v, want %d", count, err, auditCountBeforeConflict)
	}
	if got := runtimeWorkspaceLedgerVersion(t, ctx, store); got != ledgerBeforeConflict {
		t.Fatalf("ledger version after unchanged conflict = %d, want %d", got, ledgerBeforeConflict)
	}

	createRuntimeTransaction(t, ctx, finance, "runtime-dst-civil", runtimeAccountID, "expense", 40, runtimeCivil(2026, time.March, 8))
	dst, err := finance.CreatePeriodReview(ctx, runtimeWorkspaceID, runtimeActorID, PeriodReviewInput{
		From: "2026-03-08", To: "2026-03-08", Timezone: "America/New_York", Status: "reviewed",
		Scope: model.PeriodReviewScopeMemberView,
	})
	if err != nil {
		t.Fatal(err)
	}
	assertRuntimeTotals(t, "DST civil-date snapshot", dst.Snapshot, model.PeriodTotals{SpendingMinor: 40, NetMinor: -40, TransactionCount: 1})
	assertRuntimeTime(t, "DST fromUtc", dst.FromUTC, time.Date(2026, time.March, 8, 5, 0, 0, 0, time.UTC))
	assertRuntimeTime(t, "DST toUtcExclusive", dst.ToUTCExclusive, time.Date(2026, time.March, 9, 4, 0, 0, 0, time.UTC))

	ledgerBeforeFailure := runtimeWorkspaceLedgerVersion(t, ctx, store)
	auditCountBeforeFailure, err := store.Count(ctx, "audit_events", repository.Filter{})
	if err != nil {
		t.Fatal(err)
	}
	rejectingStore := &runtimeRejectReviewAuditStore{MongoStore: store}
	rejectingFinance := NewFinanceService(rejectingStore, NewAccessService(rejectingStore))
	if _, err := rejectingFinance.CreatePeriodReview(ctx, runtimeWorkspaceID, runtimeActorID, PeriodReviewInput{
		From: "2026-09-01", To: "2026-09-30", Timezone: "Asia/Kolkata", Status: "closed",
		Scope: model.PeriodReviewScopeWorkspaceView,
	}); !errors.Is(err, errRuntimeReviewAuditRejected) {
		t.Fatalf("period review audit failure = %v, want %v", err, errRuntimeReviewAuditRejected)
	}
	if got := runtimeWorkspaceLedgerVersion(t, ctx, store); got != ledgerBeforeFailure {
		t.Fatalf("failed checkpoint advanced ledger version from %d to %d", ledgerBeforeFailure, got)
	}
	failedReviewCount, err := store.Count(ctx, periodReviewsCollection, repository.Filter{
		"workspace_id": runtimeWorkspaceID, "from": "2026-09-01", "to": "2026-09-30",
	})
	if err != nil {
		t.Fatal(err)
	}
	if failedReviewCount != 0 {
		t.Fatalf("failed checkpoint left %d period review records, want 0", failedReviewCount)
	}
	if count, err := store.Count(ctx, "audit_events", repository.Filter{}); err != nil || count != auditCountBeforeFailure {
		t.Fatalf("audit count after rollback = %d, error = %v, want %d", count, err, auditCountBeforeFailure)
	}
	t.Logf("PASS July snapshot=%+v marker=%d delta=%+v actions=%v rereview=%+v DST snapshot=%+v bounds=%s..%s",
		review.Snapshot, view.ChangeCount, view.Delta, wantActions, rereview.Snapshot, dst.Snapshot, dst.FromUTC.Format(time.RFC3339), dst.ToUTCExclusive.Format(time.RFC3339))
}

type runtimeRejectReviewAuditStore struct {
	*repository.MongoStore
}

func (s *runtimeRejectReviewAuditStore) Insert(ctx context.Context, collection string, document any) error {
	if event, ok := document.(*model.AuditEvent); collection == "audit_events" && ok && event.EntityType == "period_review" {
		return errRuntimeReviewAuditRejected
	}
	return s.MongoStore.Insert(ctx, collection, document)
}

func seedRuntimePeriodReview(t *testing.T, ctx context.Context, store repository.Store) {
	t.Helper()
	now := time.Now().UTC()
	items := []struct {
		collection string
		value      any
	}{
		{"users", &model.User{ID: runtimeActorID, Email: "runtime@example.test", Name: "Runtime QA", Locale: "en-IN", PreferredCurrency: "INR", CreatedAt: now, UpdatedAt: now}},
		{"users", &model.User{ID: runtimeOtherActorID, Email: "runtime-other@example.test", Name: "Runtime Other", Locale: "en-IN", PreferredCurrency: "INR", CreatedAt: now, UpdatedAt: now}},
		{"workspaces", &model.Workspace{ID: runtimeWorkspaceID, Name: "Runtime", Type: "family", Currency: "INR", OwnerID: runtimeActorID, Visibility: "private", CreatedAt: now, UpdatedAt: now}},
		{"memberships", &model.Membership{ID: "runtime-membership", WorkspaceID: runtimeWorkspaceID, UserID: runtimeActorID, Role: "owner", CreatedAt: now}},
		{"memberships", &model.Membership{ID: "runtime-other-membership", WorkspaceID: runtimeWorkspaceID, UserID: runtimeOtherActorID, Role: "member", CreatedAt: now}},
		{"vaults", &model.Vault{ID: runtimeVaultID, WorkspaceID: runtimeWorkspaceID, OwnerID: runtimeActorID, Name: "Runtime", Type: "cash", Currency: "INR", BalanceMinor: 100000, Privacy: "workspace", CreatedAt: now, UpdatedAt: now}},
		{"vaults", &model.Vault{ID: runtimeOtherVaultID, WorkspaceID: runtimeWorkspaceID, OwnerID: runtimeOtherActorID, Name: "Other private", Type: "cash", Currency: "INR", BalanceMinor: 100000, Privacy: "private", CreatedAt: now, UpdatedAt: now}},
		{"accounts", &model.Account{ID: runtimeAccountID, WorkspaceID: runtimeWorkspaceID, VaultID: runtimeVaultID, OwnerID: runtimeActorID, Name: "Runtime", Type: "cash", Currency: "INR", BalanceMinor: 100000, Status: "active", Privacy: "workspace", CreatedAt: now, UpdatedAt: now}},
		{"accounts", &model.Account{ID: runtimeOtherAccountID, WorkspaceID: runtimeWorkspaceID, VaultID: runtimeOtherVaultID, OwnerID: runtimeOtherActorID, Name: "Other private", Type: "cash", Currency: "INR", BalanceMinor: 100000, Status: "active", Privacy: "private", CreatedAt: now, UpdatedAt: now}},
	}
	for _, item := range items {
		if err := store.Insert(ctx, item.collection, item.value); err != nil {
			t.Fatalf("seed %s: %v", item.collection, err)
		}
	}
}

func createRuntimeTransaction(t *testing.T, ctx context.Context, finance *FinanceService, key, account, kind string, amount int64, occurredAt time.Time) *model.Transaction {
	t.Helper()
	transaction, err := finance.CreateTransaction(ctx, runtimeWorkspaceID, runtimeActorID, key, TransactionInput{
		VaultID: runtimeVaultID, AccountID: account, Type: kind, AmountMinor: amount, Currency: "INR", Privacy: "workspace", OccurredAt: occurredAt,
	})
	if err != nil {
		t.Fatalf("create %s: %v", key, err)
	}
	return transaction
}

func runtimeCivil(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func periodReviewRuntimeChangeID(change model.TransactionRevisionChange) string {
	if change.Before != nil {
		return change.Before.ID
	}
	if change.After != nil {
		return change.After.ID
	}
	return ""
}

func runtimeWorkspaceLedgerVersion(t *testing.T, ctx context.Context, store repository.Store) int64 {
	t.Helper()
	var workspace model.Workspace
	if err := store.FindOne(ctx, "workspaces", repository.Filter{"_id": runtimeWorkspaceID}, &workspace); err != nil {
		t.Fatalf("load workspace ledger version: %v", err)
	}
	return workspace.LedgerVersion
}

func assertRuntimeTotals(t *testing.T, label string, got, want model.PeriodTotals) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%s = %+v, want %+v", label, got, want)
	}
}

func assertRuntimeTime(t *testing.T, label string, got, want time.Time) {
	t.Helper()
	if !got.Equal(want) {
		t.Fatalf("%s = %s, want %s", label, got.Format(time.RFC3339), want.Format(time.RFC3339))
	}
}
