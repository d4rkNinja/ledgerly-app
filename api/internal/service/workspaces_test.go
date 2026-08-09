package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type workspaceListStore struct {
	actorMemberships []model.Membership
	workspaces       []model.Workspace
	memberCounts     []workspaceMemberCount
	findManyCalls    []string
	aggregateCalls   int
	workspaceFilter  repository.Filter
	workspaceSort    repository.Sort
	countPipeline    repository.Pipeline
	membershipLimit  int64
	workspaceLimit   int64
}

func (s *workspaceListStore) Insert(context.Context, string, any) error { return nil }
func (s *workspaceListStore) FindOne(context.Context, string, repository.Filter, any) error {
	return repository.ErrNotFound
}
func (s *workspaceListStore) FindMany(_ context.Context, collection string, filter repository.Filter, destination any, limit, _ int64, sort repository.Sort) error {
	s.findManyCalls = append(s.findManyCalls, collection)
	switch collection {
	case "memberships":
		s.membershipLimit = limit
		*destination.(*[]model.Membership) = append([]model.Membership(nil), s.actorMemberships...)
	case "workspaces":
		s.workspaceLimit = limit
		s.workspaceFilter = filter
		s.workspaceSort = sort
		*destination.(*[]model.Workspace) = append([]model.Workspace(nil), s.workspaces...)
	default:
		return errors.New("unexpected collection")
	}
	return nil
}
func (s *workspaceListStore) Aggregate(_ context.Context, collection string, pipeline repository.Pipeline, destination any) error {
	if collection != "memberships" {
		return errors.New("unexpected aggregation collection")
	}
	s.aggregateCalls++
	s.countPipeline = pipeline
	*destination.(*[]workspaceMemberCount) = append([]workspaceMemberCount(nil), s.memberCounts...)
	return nil
}
func (s *workspaceListStore) UpdateOne(context.Context, string, repository.Filter, repository.Filter, any) error {
	return repository.ErrNotFound
}
func (s *workspaceListStore) UpdateMany(context.Context, string, repository.Filter, repository.Filter) (int64, error) {
	return 0, nil
}
func (s *workspaceListStore) DeleteOne(context.Context, string, repository.Filter) error {
	return repository.ErrNotFound
}
func (s *workspaceListStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return 0, errors.New("ListWorkspaces must not count members per workspace")
}
func (s *workspaceListStore) WithTransaction(context.Context, repository.TransactionFunc) (any, error) {
	return nil, errors.New("unexpected transaction")
}
func (s *workspaceListStore) CreateFinancialTransaction(context.Context, *model.Transaction, string, *time.Time, *model.AuditEvent) (*model.Transaction, error) {
	return nil, errors.New("unexpected financial transaction")
}

func TestListWorkspacesReturnsActorSummaryWithoutNPlusOneQueries(t *testing.T) {
	older := time.Date(2026, time.July, 1, 10, 0, 0, 0, time.UTC)
	newer := older.Add(time.Hour)
	store := &workspaceListStore{
		actorMemberships: []model.Membership{
			{
				WorkspaceID: "workspace-new",
				UserID:      "actor-a",
				Role:        "finance_manager",
				Permissions: []string{model.PermEditWorkspace},
			},
			{
				WorkspaceID: "workspace-old",
				UserID:      "actor-a",
				Role:        "viewer",
			},
		},
		workspaces: []model.Workspace{
			{
				ID:             "workspace-new",
				Name:           "Studio books",
				Type:           "office",
				Currency:       "INR",
				FinancialMonth: 4,
				OwnerID:        "owner-a",
				CreatedAt:      newer,
				UpdatedAt:      newer,
			},
			{
				ID:             "workspace-old",
				Name:           "Home",
				Type:           "family",
				Currency:       "USD",
				FinancialMonth: 1,
				OwnerID:        "owner-b",
				CreatedAt:      older,
				UpdatedAt:      older,
			},
		},
		memberCounts: []workspaceMemberCount{
			{WorkspaceID: "workspace-new", Count: 7},
			{WorkspaceID: "workspace-old", Count: 2},
		},
	}
	finance := NewFinanceService(store, NewAccessService(store))

	got, err := finance.ListWorkspaces(context.Background(), "actor-a")
	if err != nil {
		t.Fatalf("ListWorkspaces: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("workspace count = %d, want 2", len(got))
	}
	if got[0].ID != "workspace-new" || got[1].ID != "workspace-old" {
		t.Fatalf("workspace order changed: %#v", got)
	}
	if got[0].Role != "finance_manager" || got[0].MemberCount != 7 {
		t.Fatalf("actor summary = %#v", got[0])
	}
	if !containsPermission(got[0].Permissions, model.PermViewWorkspace) ||
		!containsPermission(got[0].Permissions, model.PermEditWorkspace) {
		t.Fatalf("effective permissions = %#v", got[0].Permissions)
	}
	if got[1].Role != "viewer" || got[1].MemberCount != 2 {
		t.Fatalf("second actor summary = %#v", got[1])
	}
	if !reflect.DeepEqual(store.findManyCalls, []string{"memberships", "workspaces"}) {
		t.Fatalf("FindMany calls = %#v", store.findManyCalls)
	}
	if store.aggregateCalls != 1 {
		t.Fatalf("aggregate calls = %d, want 1", store.aggregateCalls)
	}
	if !reflect.DeepEqual(store.workspaceSort, repository.Sort{"created_at": -1}) {
		t.Fatalf("workspace sort = %#v", store.workspaceSort)
	}
	if store.membershipLimit != 0 || store.workspaceLimit != 0 {
		t.Fatalf(
			"workspace list limits = memberships:%d workspaces:%d, want complete unbounded queries",
			store.membershipLimit,
			store.workspaceLimit,
		)
	}
	assertWorkspaceIDsFilter(t, store.workspaceFilter, "_id")
	if len(store.countPipeline) != 2 {
		t.Fatalf("count pipeline = %#v", store.countPipeline)
	}
	match, ok := store.countPipeline[0]["$match"].(repository.Filter)
	if !ok {
		t.Fatalf("count match = %#v", store.countPipeline[0])
	}
	assertWorkspaceIDsFilter(t, match, "workspace_id")

	encoded, err := json.Marshal(got[0])
	if err != nil {
		t.Fatalf("marshal summary: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatalf("unmarshal summary: %v", err)
	}
	for _, field := range []string{
		"id", "name", "type", "currency", "financialMonthStart", "ownerId",
		"createdAt", "updatedAt", "role", "permissions", "memberCount",
	} {
		if _, exists := payload[field]; !exists {
			t.Errorf("JSON response is missing %q: %s", field, encoded)
		}
	}
}

func TestListWorkspacesDoesNotTruncateOneHundredAndOneMemberships(t *testing.T) {
	const workspaceCount = 101
	createdAt := time.Date(2026, time.July, 29, 10, 0, 0, 0, time.UTC)
	store := &workspaceListStore{
		actorMemberships: make([]model.Membership, 0, workspaceCount),
		workspaces:       make([]model.Workspace, 0, workspaceCount),
		memberCounts:     make([]workspaceMemberCount, 0, workspaceCount),
	}
	for i := 0; i < workspaceCount; i++ {
		id := fmt.Sprintf("workspace-%03d", i)
		store.actorMemberships = append(store.actorMemberships, model.Membership{
			ID:          fmt.Sprintf("membership-%03d", i),
			WorkspaceID: id,
			UserID:      "actor-a",
			Role:        "viewer",
		})
		store.workspaces = append(store.workspaces, model.Workspace{
			ID:        id,
			Name:      fmt.Sprintf("Workspace %03d", i),
			Type:      "personal",
			Currency:  "INR",
			OwnerID:   fmt.Sprintf("owner-%03d", i),
			CreatedAt: createdAt.Add(-time.Duration(i) * time.Minute),
			UpdatedAt: createdAt,
		})
		store.memberCounts = append(store.memberCounts, workspaceMemberCount{
			WorkspaceID: id,
			Count:       1,
		})
	}
	finance := NewFinanceService(store, NewAccessService(store))

	got, err := finance.ListWorkspaces(context.Background(), "actor-a")
	if err != nil {
		t.Fatalf("ListWorkspaces: %v", err)
	}
	if len(got) != workspaceCount {
		t.Fatalf("workspace count = %d, want %d", len(got), workspaceCount)
	}
	if store.membershipLimit != 0 || store.workspaceLimit != 0 {
		t.Fatalf(
			"workspace list limits = memberships:%d workspaces:%d, want zero/unlimited",
			store.membershipLimit,
			store.workspaceLimit,
		)
	}
	if !reflect.DeepEqual(store.findManyCalls, []string{"memberships", "workspaces"}) {
		t.Fatalf("FindMany calls = %#v, want two set-based queries", store.findManyCalls)
	}
	if store.aggregateCalls != 1 {
		t.Fatalf("aggregate calls = %d, want one set-based member count", store.aggregateCalls)
	}
	if got[100].ID != "workspace-100" || got[100].MemberCount != 1 {
		t.Fatalf("last workspace = %#v, want workspace-100", got[100])
	}
}

func TestListWorkspacesReturnsEmptyCollectionWithoutFollowUpQueries(t *testing.T) {
	store := &workspaceListStore{}
	finance := NewFinanceService(store, NewAccessService(store))

	got, err := finance.ListWorkspaces(context.Background(), "actor-without-workspaces")
	if err != nil {
		t.Fatalf("ListWorkspaces: %v", err)
	}
	if got == nil || len(got) != 0 {
		t.Fatalf("workspaces = %#v, want non-nil empty collection", got)
	}
	if !reflect.DeepEqual(store.findManyCalls, []string{"memberships"}) {
		t.Fatalf("FindMany calls = %#v", store.findManyCalls)
	}
	if store.aggregateCalls != 0 {
		t.Fatalf("aggregate calls = %d, want 0", store.aggregateCalls)
	}
}

func assertWorkspaceIDsFilter(t *testing.T, filter repository.Filter, field string) {
	t.Helper()
	inFilter, ok := filter[field].(repository.Filter)
	if !ok {
		t.Fatalf("%s filter = %#v", field, filter)
	}
	ids, ok := inFilter["$in"].([]string)
	if !ok {
		t.Fatalf("%s $in = %#v", field, inFilter)
	}
	if !reflect.DeepEqual(ids, []string{"workspace-new", "workspace-old"}) {
		t.Fatalf("%s IDs = %#v", field, ids)
	}
}

func containsPermission(permissions []string, want string) bool {
	for _, permission := range permissions {
		if permission == want {
			return true
		}
	}
	return false
}
