package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type periodReviewStore struct {
	*financeStore
	review    *model.PeriodReview
	duplicate bool
	events    []model.AuditEvent
}

func (s *periodReviewStore) Insert(ctx context.Context, collection string, document any) error {
	if collection != periodReviewsCollection {
		return s.financeStore.Insert(ctx, collection, document)
	}
	if s.duplicate || s.review != nil {
		return repository.ErrConflict
	}
	review := *document.(*model.PeriodReview)
	s.review = &review
	return nil
}

func (s *periodReviewStore) UpdateOne(ctx context.Context, collection string, filter, update repository.Filter, destination any) error {
	if collection != "workspaces" {
		return s.financeStore.UpdateOne(ctx, collection, filter, update, destination)
	}
	s.workspace.LedgerVersion++
	*destination.(*model.Workspace) = s.workspace
	return nil
}

func (s *periodReviewStore) FindMany(ctx context.Context, collection string, filter repository.Filter, destination any, limit, skip int64, sort repository.Sort) error {
	switch collection {
	case periodReviewsCollection:
		if s.review != nil {
			*destination.(*[]model.PeriodReview) = []model.PeriodReview{*s.review}
		}
		return nil
	case "audit_events":
		*destination.(*[]model.AuditEvent) = append([]model.AuditEvent(nil), s.events...)
		return nil
	default:
		return s.financeStore.FindMany(ctx, collection, filter, destination, limit, skip, sort)
	}
}

func (s *periodReviewStore) FindOne(ctx context.Context, collection string, filter repository.Filter, destination any) error {
	if collection != periodReviewsCollection {
		return s.financeStore.FindOne(ctx, collection, filter, destination)
	}
	if s.review == nil || filter["_id"] != s.review.ID || filter["created_by"] != s.review.CreatedBy {
		return repository.ErrNotFound
	}
	*destination.(*model.PeriodReview) = *s.review
	return nil
}

func periodReviewFinance() (*FinanceService, *periodReviewStore) {
	_, base := testFinance()
	base.membership.Permissions = []string{model.PermViewBalances, model.PermViewTransactions}
	base.vaults = map[string]model.Vault{
		"vault-a": {ID: "vault-a", WorkspaceID: "workspace-a", OwnerID: "user-a", Currency: "INR", Privacy: "workspace"},
	}
	base.accounts = map[string]model.Account{
		"account-a": {ID: "account-a", WorkspaceID: "workspace-a", VaultID: "vault-a", OwnerID: "user-a", Currency: "INR", Privacy: "workspace"},
	}
	store := &periodReviewStore{financeStore: base}
	return NewFinanceService(store, NewAccessService(store)), store
}

func TestCreatePeriodReviewProducesReproducibleSnapshotAndRejectsDuplicate(t *testing.T) {
	finance, store := periodReviewFinance()
	store.financeStore.transactions = []model.Transaction{
		{ID: "income", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", Type: "income", AmountMinor: 10000, Currency: "INR", Privacy: "workspace", OccurredAt: mustTime(t, "2026-07-01T00:00:00Z")},
		{ID: "expense", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", Type: "expense", AmountMinor: 2500, Currency: "INR", Privacy: "workspace", OccurredAt: mustTime(t, "2026-07-31T23:59:59Z")},
		{ID: "transfer", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", Type: "transfer", AmountMinor: 900, Currency: "INR", Privacy: "workspace", OccurredAt: mustTime(t, "2026-07-15T00:00:00Z")},
	}
	input := PeriodReviewInput{From: "2026-07-01", To: "2026-07-31", Timezone: "UTC", Status: "closed"}
	got, err := finance.CreatePeriodReview(context.Background(), "workspace-a", "user-a", input)
	if err != nil {
		t.Fatalf("CreatePeriodReview() error = %v", err)
	}
	want := model.PeriodTotals{IncomeMinor: 10000, SpendingMinor: 2500, NetMinor: 7500, TransactionCount: 3}
	if got.Snapshot != want || store.review.Snapshot != want {
		t.Fatalf("snapshot = %#v, persisted = %#v, want %#v", got.Snapshot, store.review.Snapshot, want)
	}
	if got.CutoffLedgerVersion != 1 || !got.FromUTC.Equal(mustTime(t, "2026-07-01T00:00:00Z")) || !got.ToUTCExclusive.Equal(mustTime(t, "2026-08-01T00:00:00Z")) {
		t.Fatalf("immutable bounds/version = %#v", got.PeriodReview)
	}
	store.duplicate = true
	store.review = nil
	if _, err := finance.CreatePeriodReview(context.Background(), "workspace-a", "user-a", input); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate error = %v, want conflict", err)
	}
}

func TestPeriodReviewCalendarBoundsUseLocationAwareCalendarMath(t *testing.T) {
	tests := []struct {
		name, from, to, zone, wantFrom, wantTo string
	}{
		{"Kolkata half hour", "2026-07-01", "2026-07-31", "Asia/Kolkata", "2026-06-30T18:30:00Z", "2026-07-31T18:30:00Z"},
		{"New York spring DST", "2026-03-08", "2026-03-08", "America/New_York", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"},
		{"New York fall DST", "2026-11-01", "2026-11-01", "America/New_York", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, bounds, err := normalizePeriodReviewInput(PeriodReviewInput{From: test.from, To: test.to, Timezone: test.zone, Status: "closed"}, true)
			if err != nil {
				t.Fatal(err)
			}
			if !bounds.fromUTC.Equal(mustTime(t, test.wantFrom)) || !bounds.toUTC.Equal(mustTime(t, test.wantTo)) {
				t.Fatalf("bounds = %s..%s, want %s..%s", bounds.fromUTC, bounds.toUTC, test.wantFrom, test.wantTo)
			}
		})
	}
}

func TestPeriodReviewValidation(t *testing.T) {
	tests := []PeriodReviewInput{
		{From: "2026-02-30", To: "2026-03-01", Timezone: "UTC", Status: "closed"},
		{From: "2026-03-02", To: "2026-03-01", Timezone: "UTC", Status: "closed"},
		{From: "2025-01-01", To: "2026-01-02", Timezone: "UTC", Status: "closed"},
		{From: "2026-01-01", To: "2026-01-02", Timezone: "Mars/Olympus", Status: "closed"},
		{From: "2026-01-01", To: "2026-01-02", Timezone: "Local", Status: "closed"},
		{From: "2026-01-01", To: "2026-01-02", Timezone: "UTC", Status: "draft"},
	}
	for _, input := range tests {
		if _, _, err := normalizePeriodReviewInput(input, true); err == nil {
			t.Fatalf("input %#v unexpectedly validated", input)
		}
	}
}

func TestPeriodReviewTimezoneAcceptsIANADataAndLinks(t *testing.T) {
	for _, zone := range []string{"Etc/UTC", "US/Eastern", "Asia/Kolkata"} {
		t.Run(zone, func(t *testing.T) {
			if _, _, err := normalizePeriodReviewInput(PeriodReviewInput{
				From: "2026-01-01", To: "2026-01-02", Timezone: zone, Status: "closed",
			}, true); err != nil {
				t.Fatalf("IANA zone %q rejected: %v", zone, err)
			}
		})
	}
}

func TestPeriodRevisionDeltasCoverEditsCreatesDeletesMovesAndZeroNetChanges(t *testing.T) {
	review := model.PeriodReview{
		WorkspaceID: "workspace-a", ScopeActorID: "user-a", Currency: "INR",
		VaultIDs: []string{"vault-a"}, AccountIDs: []string{"account-a"},
		FromUTC: mustTime(t, "2026-07-01T00:00:00Z"), ToUTCExclusive: mustTime(t, "2026-08-01T00:00:00Z"),
	}
	snapshot := func(id, kind string, amount int64, occurred string) *model.TransactionRevisionSnapshot {
		return &model.TransactionRevisionSnapshot{ID: id, VaultID: "vault-a", AccountID: "account-a", CreatedBy: "user-a", Privacy: "private", Currency: "INR", Type: kind, AmountMinor: amount, OccurredAt: mustTime(t, occurred)}
	}
	tests := []struct {
		name  string
		event model.AuditEvent
		want  model.PeriodTotals
	}{
		{"one large edit", model.AuditEvent{Before: snapshot("a", "expense", 100, "2026-07-02T00:00:00Z"), After: snapshot("a", "expense", 900, "2026-07-02T00:00:00Z")}, model.PeriodTotals{SpendingMinor: 800, NetMinor: -800}},
		{"small edit one", model.AuditEvent{Before: snapshot("a", "expense", 100, "2026-07-02T00:00:00Z"), After: snapshot("a", "expense", 120, "2026-07-02T00:00:00Z")}, model.PeriodTotals{SpendingMinor: 20, NetMinor: -20}},
		{"zero net metadata", model.AuditEvent{Before: snapshot("a", "expense", 100, "2026-07-02T00:00:00Z"), After: snapshot("a", "expense", 100, "2026-07-02T00:00:00Z")}, model.PeriodTotals{}},
		{"backdated create", model.AuditEvent{After: snapshot("b", "income", 500, "2026-07-01T00:00:00Z")}, model.PeriodTotals{IncomeMinor: 500, NetMinor: 500, TransactionCount: 1}},
		{"delete tombstone", model.AuditEvent{Before: snapshot("c", "expense", 300, "2026-07-31T23:59:59Z")}, model.PeriodTotals{SpendingMinor: -300, NetMinor: 300, TransactionCount: -1}},
		{"July to August move", model.AuditEvent{Before: snapshot("d", "expense", 70, "2026-07-31T00:00:00Z"), After: snapshot("d", "expense", 70, "2026-08-01T00:00:00Z")}, model.PeriodTotals{SpendingMinor: -70, NetMinor: 70, TransactionCount: -1}},
	}
	accumulated := model.PeriodTotals{}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := periodEventDelta(review, test.event)
			if got != test.want {
				t.Fatalf("delta = %#v, want %#v", got, test.want)
			}
		})
		if test.name == "small edit one" {
			addPeriodTotals(&accumulated, periodEventDelta(review, test.event))
			addPeriodTotals(&accumulated, periodEventDelta(review, test.event))
			addPeriodTotals(&accumulated, periodEventDelta(review, test.event))
		}
	}
	if accumulated.SpendingMinor != 60 || accumulated.NetMinor != -60 {
		t.Fatalf("several small edits = %#v", accumulated)
	}
	privateOther := snapshot("private", "expense", 10, "2026-07-10T00:00:00Z")
	privateOther.CreatedBy = "user-b"
	if revisionInReview(review, privateOther) {
		t.Fatal("another member's private revision entered the captured scope")
	}
}

func TestPeriodReviewChangesAreCreatorOnly(t *testing.T) {
	finance, store := periodReviewFinance()
	store.review = &model.PeriodReview{ID: "review-a", WorkspaceID: "workspace-a", CreatedBy: "user-a", ScopeActorID: "user-a"}
	if _, err := finance.ListPeriodReviewChanges(context.Background(), "workspace-a", "user-b", "review-a", 30, 0); !errors.Is(err, ErrForbidden) {
		t.Fatalf("other member error = %v, want forbidden", err)
	}
}

func mustTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}
