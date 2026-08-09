package router

import (
	"net/http"
	"reflect"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/handler"
)

func TestActivatedFeatureRouteContracts(t *testing.T) {
	api := handler.NewAPI(nil, nil, nil, 1024)
	routes, ok := NewWithOptions(
		api,
		handler.NewHealthHandler(nil, nil),
		Options{},
	).(chi.Routes)
	if !ok {
		t.Fatal("router does not expose route matching")
	}

	tests := []struct {
		path        string
		wantMethods []string
	}{
		{path: "/api/v1/me", wantMethods: []string{http.MethodGet, http.MethodPatch}},
		{path: "/api/v1/workspaces/workspace-a/vaults", wantMethods: []string{http.MethodGet, http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/accounts", wantMethods: []string{http.MethodGet, http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/accounts/account-a", wantMethods: []string{http.MethodGet, http.MethodPatch, http.MethodDelete}},
		{path: "/api/v1/workspaces/workspace-a/accounts/account-a/share", wantMethods: []string{http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/transactions/transaction-a", wantMethods: []string{http.MethodGet, http.MethodPatch, http.MethodDelete}},
		{path: "/api/v1/workspaces/workspace-a/transactions/transaction-a/share", wantMethods: []string{http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/budgets", wantMethods: []string{http.MethodGet, http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/budgets/budget-a", wantMethods: []string{http.MethodGet, http.MethodPatch, http.MethodDelete}},
		{path: "/api/v1/workspaces/workspace-a/budgets/budget-a/share", wantMethods: []string{http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/goals", wantMethods: []string{http.MethodGet, http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/goals/goal-a", wantMethods: []string{http.MethodGet, http.MethodPatch, http.MethodDelete}},
		{path: "/api/v1/workspaces/workspace-a/goals/goal-a/share", wantMethods: []string{http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/goals/goal-a/progress", wantMethods: []string{http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/goals/goal-a/transactions", wantMethods: []string{http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/goals/goal-a/link-transaction", wantMethods: []string{http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/goals/goal-a/cancel", wantMethods: []string{http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/goals/goal-a/reopen", wantMethods: []string{http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/goals/goal-a/reschedule", wantMethods: []string{http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/expense-claims", wantMethods: []string{http.MethodGet, http.MethodPost}},
		{path: "/api/v1/workspaces/workspace-a/expense-claims/claim-a/review", wantMethods: []string{http.MethodPatch}},
		{path: "/api/v1/workspaces/workspace-a/search", wantMethods: []string{http.MethodGet}},
		{path: "/api/v1/workspaces/workspace-a/export.csv", wantMethods: []string{http.MethodGet}},
		{path: "/api/v1/workspaces/workspace-a/members", wantMethods: []string{http.MethodGet}},
		{path: "/api/v1/workspaces/workspace-a/members/member-a", wantMethods: []string{http.MethodPatch, http.MethodDelete}},
		{path: "/api/v1/workspaces/workspace-a/invitations/invitation-a", wantMethods: []string{http.MethodDelete}},
		{path: "/api/v1/notifications", wantMethods: []string{http.MethodGet}},
		{path: "/api/v1/notifications/unread-count", wantMethods: []string{http.MethodGet}},
		{path: "/api/v1/notifications/notification-a/read", wantMethods: []string{http.MethodPatch}},
		{path: "/api/v1/notifications/read-all", wantMethods: []string{http.MethodPatch}},
	}

	for _, test := range tests {
		t.Run(test.path, func(t *testing.T) {
			if got := allowedMethods(routes, test.path); !reflect.DeepEqual(got, test.wantMethods) {
				t.Fatalf("allowed methods = %#v, want %#v", got, test.wantMethods)
			}
		})
	}
}

func TestWorkspaceDeleteRouteMatchesExactWorkspacePath(t *testing.T) {
	api := handler.NewAPI(nil, nil, nil, 1024)
	routes, ok := NewWithOptions(
		api,
		handler.NewHealthHandler(nil, nil),
		Options{},
	).(chi.Routes)
	if !ok {
		t.Fatal("router does not expose route matching")
	}
	if !routes.Match(chi.NewRouteContext(), http.MethodDelete, "/api/v1/workspaces/workspace-a") {
		t.Fatal("workspace delete route did not match the workspace path")
	}
}
