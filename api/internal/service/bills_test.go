package service

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type billsStore struct {
	membership  model.Membership
	bills       []model.Bill
	findOneErr  error
	findManyErr error

	collection string
	filter     repository.Filter
	limit      int64
	skip       int64
	sort       repository.Sort
}

func (s *billsStore) Insert(context.Context, string, any) error { return nil }

func (s *billsStore) FindOne(
	_ context.Context,
	collection string,
	filter repository.Filter,
	destination any,
) error {
	if s.findOneErr != nil {
		return s.findOneErr
	}
	if collection != "memberships" ||
		filter["workspace_id"] != s.membership.WorkspaceID ||
		filter["user_id"] != s.membership.UserID {
		return repository.ErrNotFound
	}
	*destination.(*model.Membership) = s.membership
	return nil
}

func (s *billsStore) FindMany(
	_ context.Context,
	collection string,
	filter repository.Filter,
	destination any,
	limit int64,
	skip int64,
	sort repository.Sort,
) error {
	s.collection = collection
	s.filter = filter
	s.limit = limit
	s.skip = skip
	s.sort = sort
	if s.findManyErr != nil {
		return s.findManyErr
	}
	*destination.(*[]model.Bill) = append([]model.Bill(nil), s.bills...)
	return nil
}

func (s *billsStore) Aggregate(context.Context, string, repository.Pipeline, any) error {
	return nil
}

func (s *billsStore) UpdateOne(context.Context, string, repository.Filter, repository.Filter, any) error {
	return nil
}

func (s *billsStore) UpdateMany(context.Context, string, repository.Filter, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *billsStore) DeleteOne(context.Context, string, repository.Filter) error {
	return nil
}

func (s *billsStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *billsStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	return fn(ctx)
}

func (s *billsStore) CreateFinancialTransaction(
	context.Context,
	*model.Transaction,
	string,
	*time.Time,
	*model.AuditEvent,
) (*model.Transaction, error) {
	return nil, nil
}

func TestListBillsQueriesActiveUpcomingWorkspaceRecords(t *testing.T) {
	now := time.Date(2026, time.July, 29, 10, 30, 0, 0, time.UTC)
	store := &billsStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a",
			UserID:      "user-a",
			Role:        "viewer",
		},
		bills: []model.Bill{
			{
				ID:          "bill-a",
				WorkspaceID: "workspace-a",
				Name:        "Apartment rent",
				AmountMinor: 250000,
				Currency:    "INR",
				Frequency:   "monthly",
				DueDate:     now.Add(5 * 24 * time.Hour),
			},
		},
	}
	finance := NewFinanceService(store, NewAccessService(store))

	got, err := finance.listBillsAt(
		context.Background(),
		"workspace-a",
		"user-a",
		125,
		-7,
		now,
	)
	if err != nil {
		t.Fatalf("listBillsAt() error = %v", err)
	}
	if !reflect.DeepEqual(got, store.bills) {
		t.Fatalf("bills = %#v, want %#v", got, store.bills)
	}
	if store.collection != "recurring_transactions" {
		t.Fatalf("collection = %q, want recurring_transactions", store.collection)
	}
	wantFilter := repository.Filter{
		"workspace_id": "workspace-a",
		"next_due_at": repository.Filter{
			"$gte": time.Date(2026, time.July, 29, 0, 0, 0, 0, time.UTC),
			"$lt":  time.Date(2026, time.August, 29, 0, 0, 0, 0, time.UTC),
		},
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
					{"owner_id": "user-a"},
				},
			},
		},
	}
	if !reflect.DeepEqual(store.filter, wantFilter) {
		t.Fatalf("filter = %#v, want %#v", store.filter, wantFilter)
	}
	if store.limit != 100 || store.skip != 0 {
		t.Fatalf("pagination = (%d, %d), want (100, 0)", store.limit, store.skip)
	}
	if !reflect.DeepEqual(store.sort, repository.Sort{"next_due_at": 1}) {
		t.Fatalf("sort = %#v, want next_due_at ascending", store.sort)
	}
}

func TestBillJSONContractUsesUserFacingFields(t *testing.T) {
	active := true
	due := time.Date(2026, time.August, 3, 9, 0, 0, 0, time.UTC)
	encoded, err := json.Marshal(model.Bill{
		ID:          "bill-a",
		WorkspaceID: "workspace-a",
		VaultID:     "vault-private",
		OwnerID:     "user-a",
		Privacy:     "private",
		Name:        "Apartment rent",
		AmountMinor: 250000,
		Currency:    "INR",
		Frequency:   "monthly",
		DueDate:     due,
		Autopay:     true,
		Active:      &active,
		CreatedAt:   due.AddDate(0, -1, 0),
	})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	want := map[string]any{
		"id":          "bill-a",
		"workspaceId": "workspace-a",
		"name":        "Apartment rent",
		"amountMinor": float64(250000),
		"currency":    "INR",
		"frequency":   "monthly",
		"dueDate":     due.Format(time.RFC3339),
		"autopay":     true,
		"createdAt":   due.AddDate(0, -1, 0).Format(time.RFC3339),
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("JSON contract = %#v, want %#v", got, want)
	}
}

func TestListBillsUsesUTCCalendarDayBoundaries(t *testing.T) {
	now := time.Date(2026, time.July, 29, 18, 45, 0, 0, time.FixedZone("IST", 5*60*60+30*60))
	start, end := upcomingBillsUTCWindow(now)

	// 18:45 IST is 13:15 UTC. The query must include bills from midnight UTC
	// earlier that same UTC day and exclude the first instant after day 30.
	wantStart := time.Date(2026, time.July, 29, 0, 0, 0, 0, time.UTC)
	wantEnd := time.Date(2026, time.August, 29, 0, 0, 0, 0, time.UTC)
	if !start.Equal(wantStart) || !end.Equal(wantEnd) {
		t.Fatalf("UTC window = [%s, %s), want [%s, %s)", start, end, wantStart, wantEnd)
	}

	store := &billsStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a",
			UserID:      "user-a",
			Role:        "viewer",
		},
	}
	finance := NewFinanceService(store, NewAccessService(store))
	if _, err := finance.listBillsAt(context.Background(), "workspace-a", "user-a", 30, 0, now); err != nil {
		t.Fatalf("listBillsAt() error = %v", err)
	}
	dateFilter, ok := store.filter["next_due_at"].(repository.Filter)
	if !ok {
		t.Fatalf("next_due_at filter = %#v", store.filter["next_due_at"])
	}
	if !reflect.DeepEqual(dateFilter, repository.Filter{"$gte": wantStart, "$lt": wantEnd}) {
		t.Fatalf("next_due_at filter = %#v", dateFilter)
	}
	if _, inclusiveEnd := dateFilter["$lte"]; inclusiveEnd {
		t.Fatalf("next_due_at filter uses an inclusive end: %#v", dateFilter)
	}
}

func TestListBillsDoesNotQueryAnotherMembersPrivateRecords(t *testing.T) {
	store := &billsStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a",
			UserID:      "member-b",
			Role:        "viewer",
		},
	}
	finance := NewFinanceService(store, NewAccessService(store))

	if _, err := finance.listBillsAt(
		context.Background(),
		"workspace-a",
		"member-b",
		30,
		0,
		time.Date(2026, time.July, 29, 12, 0, 0, 0, time.UTC),
	); err != nil {
		t.Fatalf("listBillsAt() error = %v", err)
	}

	conjunction, ok := store.filter["$and"].([]repository.Filter)
	if !ok || len(conjunction) != 2 {
		t.Fatalf("privacy conjunction = %#v", store.filter["$and"])
	}
	visibility, ok := conjunction[1]["$or"].([]repository.Filter)
	if !ok {
		t.Fatalf("privacy predicate = %#v", conjunction[1])
	}
	want := []repository.Filter{
		{"privacy": "workspace"},
		{"owner_id": "member-b"},
	}
	if !reflect.DeepEqual(visibility, want) {
		t.Fatalf("privacy predicate = %#v, want %#v", visibility, want)
	}
	for _, branch := range visibility {
		if branch["owner_id"] == "member-a" {
			t.Fatal("query admitted another member's private bills")
		}
	}
}

func TestListBillsUsesDefaultsAndReturnsAnEmptyArray(t *testing.T) {
	now := time.Date(2026, time.July, 29, 10, 30, 0, 0, time.UTC)
	store := &billsStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a",
			UserID:      "user-a",
			Role:        "viewer",
		},
	}
	finance := NewFinanceService(store, NewAccessService(store))

	got, err := finance.listBillsAt(
		context.Background(),
		"workspace-a",
		"user-a",
		0,
		4,
		now,
	)
	if err != nil {
		t.Fatalf("listBillsAt() error = %v", err)
	}
	if got == nil || len(got) != 0 {
		t.Fatalf("bills = %#v, want non-nil empty slice", got)
	}
	if store.limit != 30 || store.skip != 4 {
		t.Fatalf("pagination = (%d, %d), want (30, 4)", store.limit, store.skip)
	}
}

func TestListBillsRequiresViewPermissionBeforeQueryingBills(t *testing.T) {
	store := &billsStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a",
			UserID:      "user-a",
			Role:        "restricted",
		},
	}
	finance := NewFinanceService(store, NewAccessService(store))

	_, err := finance.listBillsAt(
		context.Background(),
		"workspace-a",
		"user-a",
		30,
		0,
		time.Now(),
	)
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("listBillsAt() error = %v, want ErrForbidden", err)
	}
	if store.collection != "" {
		t.Fatalf("queried collection %q before authorization", store.collection)
	}
}

func TestListBillsPreservesDependencyFailures(t *testing.T) {
	dependencyErr := errors.New("database unavailable")
	store := &billsStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a",
			UserID:      "user-a",
			Role:        "viewer",
		},
		findManyErr: dependencyErr,
	}
	finance := NewFinanceService(store, NewAccessService(store))

	_, err := finance.listBillsAt(
		context.Background(),
		"workspace-a",
		"user-a",
		30,
		0,
		time.Now(),
	)
	if !errors.Is(err, dependencyErr) {
		t.Fatalf("listBillsAt() error = %v, want dependency error", err)
	}
}
