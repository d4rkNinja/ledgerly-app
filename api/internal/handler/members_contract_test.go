package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

type memberHandlerStore struct {
	memberships map[string]model.Membership
	users       map[string]model.User
	removals    []model.WorkspaceMemberRemoval
	audits      []model.AuditEvent
}

func (s *memberHandlerStore) Insert(_ context.Context, collection string, document any) error {
	switch collection {
	case "workspace_member_removals":
		s.removals = append(s.removals, *document.(*model.WorkspaceMemberRemoval))
	case "audit_events":
		s.audits = append(s.audits, *document.(*model.AuditEvent))
	default:
		return errors.New("unexpected insert collection")
	}
	return nil
}

func (s *memberHandlerStore) FindOne(_ context.Context, collection string, filter repository.Filter, destination any) error {
	switch collection {
	case "memberships":
		for _, membership := range s.memberships {
			if workspaceID, _ := filter["workspace_id"].(string); workspaceID != "" && membership.WorkspaceID != workspaceID {
				continue
			}
			if userID, _ := filter["user_id"].(string); userID != "" && membership.UserID != userID {
				continue
			}
			if id, _ := filter["_id"].(string); id != "" && membership.ID != id {
				continue
			}
			*destination.(*model.Membership) = membership
			return nil
		}
	case "users":
		for _, user := range s.users {
			if id, _ := filter["_id"].(string); id != "" && user.ID != id {
				continue
			}
			if email, _ := filter["email"].(string); email != "" && !strings.EqualFold(user.Email, email) {
				continue
			}
			*destination.(*model.User) = user
			return nil
		}
	}
	return repository.ErrNotFound
}

func (s *memberHandlerStore) FindMany(_ context.Context, collection string, filter repository.Filter, destination any, _, _ int64, sorting repository.Sort) error {
	workspaceID, _ := filter["workspace_id"].(string)
	switch collection {
	case "memberships":
		out := destination.(*[]model.Membership)
		for _, membership := range s.memberships {
			if workspaceID == "" || membership.WorkspaceID == workspaceID {
				*out = append(*out, membership)
			}
		}
		if direction, ok := sorting["created_at"]; ok {
			sort.Slice(*out, func(left, right int) bool {
				if (*out)[left].CreatedAt.Equal((*out)[right].CreatedAt) {
					return (*out)[left].ID < (*out)[right].ID
				}
				if direction < 0 {
					return (*out)[left].CreatedAt.After((*out)[right].CreatedAt)
				}
				return (*out)[left].CreatedAt.Before((*out)[right].CreatedAt)
			})
		}
	case "users":
		out := destination.(*[]model.User)
		ids := map[string]struct{}{}
		idFilter, _ := filter["_id"].(repository.Filter)
		for _, rawID := range idFilter["$in"].([]string) {
			ids[rawID] = struct{}{}
		}
		for id, user := range s.users {
			if _, ok := ids[id]; ok {
				*out = append(*out, user)
			}
		}
	case "invitations":
		// This contract fixture has no invitations; the empty result still
		// exercises the handler's merge path.
		_ = destination.(*[]model.Invitation)
	case "workspace_member_removals":
		out := destination.(*[]model.WorkspaceMemberRemoval)
		for _, removal := range s.removals {
			if removal.WorkspaceID == workspaceID {
				*out = append(*out, removal)
			}
		}
	default:
		return errors.New("unexpected find-many collection")
	}
	return nil
}

func (s *memberHandlerStore) Aggregate(context.Context, string, repository.Pipeline, any) error {
	return errors.New("unexpected aggregate")
}

func (s *memberHandlerStore) UpdateOne(_ context.Context, collection string, filter, update repository.Filter, destination any) error {
	if collection != "memberships" {
		return repository.ErrNotFound
	}
	for id, membership := range s.memberships {
		if filter["_id"] != id || filter["workspace_id"] != membership.WorkspaceID || filter["user_id"] != membership.UserID {
			continue
		}
		set := update["$set"].(repository.Filter)
		if role, ok := set["role"].(string); ok {
			membership.Role = role
		}
		if permissions, ok := set["permissions"].([]string); ok {
			membership.Permissions = append([]string(nil), permissions...)
		}
		s.memberships[id] = membership
		*destination.(*model.Membership) = membership
		return nil
	}
	return repository.ErrNotFound
}

func (s *memberHandlerStore) UpdateMany(context.Context, string, repository.Filter, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *memberHandlerStore) DeleteOne(_ context.Context, collection string, filter repository.Filter) error {
	if collection != "memberships" {
		return repository.ErrNotFound
	}
	for id, membership := range s.memberships {
		if filter["_id"] == id && filter["workspace_id"] == membership.WorkspaceID && filter["user_id"] == membership.UserID {
			delete(s.memberships, id)
			return nil
		}
	}
	return repository.ErrNotFound
}

func (s *memberHandlerStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *memberHandlerStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	return fn(ctx)
}

func (s *memberHandlerStore) CreateFinancialTransaction(context.Context, *model.Transaction, string, *time.Time, *model.AuditEvent) (*model.Transaction, error) {
	return nil, errors.New("unexpected financial transaction")
}

func memberHandlerRequest(method, target, body, workspaceID, targetRef string) *http.Request {
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("workspaceID", workspaceID)
	routeContext.URLParams.Add("userID", targetRef)
	requestContext := context.WithValue(request.Context(), chi.RouteCtxKey, routeContext)
	requestContext = context.WithValue(requestContext, userContextKey, &model.User{ID: "owner-a"})
	return request.WithContext(requestContext)
}

func TestMemberHandlersReturnSafeViewsAndRejectUnknownMutationFields(t *testing.T) {
	store := &memberHandlerStore{
		memberships: map[string]model.Membership{
			"owner-membership":  {ID: "owner-membership", WorkspaceID: "workspace-a", UserID: "owner-a", Role: "owner"},
			"member-membership": {ID: "member-membership", WorkspaceID: "workspace-a", UserID: "member-a", Role: "member", CreatedAt: time.Date(2026, 7, 2, 0, 0, 0, 0, time.UTC)},
		},
		users: map[string]model.User{
			"owner-a":  {ID: "owner-a", Name: "Asha Rao", Email: "asha@example.test"},
			"member-a": {ID: "member-a", Name: "Bina Rao", Email: "bina@example.test"},
		},
	}
	finance := service.NewFinanceService(store, service.NewAccessService(store))
	api := NewAPI(nil, finance, nil, 2048)

	listRecorder := httptest.NewRecorder()
	api.Members(listRecorder, memberHandlerRequest(http.MethodGet, "/api/v1/workspaces/workspace-a/members", "", "workspace-a", ""))
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("members status = %d, want %d; body = %s", listRecorder.Code, http.StatusOK, listRecorder.Body.String())
	}
	var response struct {
		Items []service.WorkspaceMember `json:"items"`
	}
	if err := json.Unmarshal(listRecorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode members response: %v", err)
	}
	if len(response.Items) != 2 || response.Items[1].Name != "Bina Rao" {
		t.Fatalf("member response = %#v", response.Items)
	}
	if strings.Contains(listRecorder.Body.String(), "userId") || strings.Contains(listRecorder.Body.String(), "member-a") {
		t.Fatalf("members response leaked internal identity: %s", listRecorder.Body.String())
	}

	unknownFieldRecorder := httptest.NewRecorder()
	api.UpdateMember(unknownFieldRecorder, memberHandlerRequest(
		http.MethodPatch,
		"/api/v1/workspaces/workspace-a/members/member-a",
		`{"role":"viewer","userId":"member-a"}`,
		"workspace-a",
		"member-a",
	))
	if unknownFieldRecorder.Code != http.StatusBadRequest {
		t.Fatalf("unknown field status = %d, want %d; body = %s", unknownFieldRecorder.Code, http.StatusBadRequest, unknownFieldRecorder.Body.String())
	}
	if _, ok := store.memberships["member-membership"]; !ok || store.memberships["member-membership"].Role != "member" {
		t.Fatalf("unknown field changed membership: %#v", store.memberships["member-membership"])
	}

	updateRecorder := httptest.NewRecorder()
	api.UpdateMember(updateRecorder, memberHandlerRequest(
		http.MethodPatch,
		"/api/v1/workspaces/workspace-a/members/member-a",
		`{"role":"viewer"}`,
		"workspace-a",
		"member-a",
	))
	if updateRecorder.Code != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body = %s", updateRecorder.Code, http.StatusOK, updateRecorder.Body.String())
	}
	if strings.Contains(updateRecorder.Body.String(), "userId") || strings.Contains(updateRecorder.Body.String(), "member-a") {
		t.Fatalf("updated member response leaked internal identity: %s", updateRecorder.Body.String())
	}

	removeRecorder := httptest.NewRecorder()
	api.RemoveMember(removeRecorder, memberHandlerRequest(
		http.MethodDelete,
		"/api/v1/workspaces/workspace-a/members/member-a",
		"",
		"workspace-a",
		"member-a",
	))
	if removeRecorder.Code != http.StatusNoContent || len(store.removals) != 1 || len(store.audits) != 2 {
		t.Fatalf("remove status = %d, removals = %d, audits = %d", removeRecorder.Code, len(store.removals), len(store.audits))
	}
}
