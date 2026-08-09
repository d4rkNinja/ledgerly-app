package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type memberTestStore struct {
	memberships map[string]model.Membership
	users       map[string]model.User
	invitations []model.Invitation
	removals    []model.WorkspaceMemberRemoval
	audits      []model.AuditEvent
	updates     int
	deletes     int
	txRuns      int
}

func (s *memberTestStore) Insert(_ context.Context, collection string, document any) error {
	switch collection {
	case "workspace_member_removals":
		s.removals = append(s.removals, *document.(*model.WorkspaceMemberRemoval))
	case "audit_events":
		s.audits = append(s.audits, *document.(*model.AuditEvent))
	default:
		return nil
	}
	return nil
}

func (s *memberTestStore) FindOne(_ context.Context, collection string, filter repository.Filter, destination any) error {
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
			if email, _ := filter["email"].(string); email != "" && strings.ToLower(user.Email) != strings.ToLower(email) {
				continue
			}
			*destination.(*model.User) = user
			return nil
		}
	}
	return repository.ErrNotFound
}

func (s *memberTestStore) FindMany(_ context.Context, collection string, filter repository.Filter, destination any, _, _ int64, _ repository.Sort) error {
	switch collection {
	case "memberships":
		out := destination.(*[]model.Membership)
		for _, membership := range s.memberships {
			if membership.WorkspaceID == filter["workspace_id"] {
				*out = append(*out, membership)
			}
		}
	case "users":
		out := destination.(*[]model.User)
		ids := map[string]struct{}{}
		if idFilter, ok := filter["_id"].(repository.Filter); ok {
			if raw, ok := idFilter["$in"].([]string); ok {
				for _, id := range raw {
					ids[id] = struct{}{}
				}
			}
		}
		for id, user := range s.users {
			if len(ids) == 0 {
				continue
			}
			if _, ok := ids[id]; ok {
				*out = append(*out, user)
			}
		}
	case "invitations":
		out := destination.(*[]model.Invitation)
		for _, invitation := range s.invitations {
			if invitation.WorkspaceID != filter["workspace_id"] {
				continue
			}
			*out = append(*out, invitation)
		}
	case "workspace_member_removals":
		out := destination.(*[]model.WorkspaceMemberRemoval)
		for _, removal := range s.removals {
			if removal.WorkspaceID == filter["workspace_id"] {
				*out = append(*out, removal)
			}
		}
	default:
		return nil
	}
	return nil
}

func (s *memberTestStore) Aggregate(context.Context, string, repository.Pipeline, any) error {
	return nil
}

func (s *memberTestStore) UpdateOne(_ context.Context, collection string, filter, update repository.Filter, destination any) error {
	switch collection {
	case "memberships":
		for id, membership := range s.memberships {
			if idFilter, ok := filter["_id"].(string); ok && id != idFilter {
				continue
			}
			if workspaceID, _ := filter["workspace_id"].(string); workspaceID != "" && membership.WorkspaceID != workspaceID {
				continue
			}
			if userID, _ := filter["user_id"].(string); userID != "" && membership.UserID != userID {
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
			s.updates++
			return nil
		}
	case "invitations":
		for index, invitation := range s.invitations {
			if id, _ := filter["_id"].(string); id != "" && invitation.ID != id {
				continue
			}
			if workspaceID, _ := filter["workspace_id"].(string); workspaceID != "" && invitation.WorkspaceID != workspaceID {
				continue
			}
			if status, _ := filter["status"].(string); status != "" && invitation.Status != status {
				continue
			}
			set := update["$set"].(repository.Filter)
			if status, ok := set["status"].(string); ok {
				invitation.Status = status
			}
			s.invitations[index] = invitation
			*destination.(*model.Invitation) = invitation
			s.updates++
			return nil
		}
	}
	return repository.ErrNotFound
}

func (s *memberTestStore) UpdateMany(context.Context, string, repository.Filter, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *memberTestStore) DeleteOne(_ context.Context, collection string, filter repository.Filter) error {
	if collection != "memberships" {
		return repository.ErrNotFound
	}
	for id, membership := range s.memberships {
		if filter["_id"] == id && membership.WorkspaceID == filter["workspace_id"] && membership.UserID == filter["user_id"] {
			delete(s.memberships, id)
			s.deletes++
			return nil
		}
	}
	return repository.ErrNotFound
}

func (s *memberTestStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *memberTestStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	s.txRuns++
	return fn(ctx)
}

func (s *memberTestStore) CreateFinancialTransaction(context.Context, *model.Transaction, string, *time.Time, *model.AuditEvent) (*model.Transaction, error) {
	return nil, errors.New("not implemented")
}

func newMemberTestService(store *memberTestStore) *FinanceService {
	return NewFinanceService(store, NewAccessService(store))
}

func TestListWorkspaceMembersMergesSafeActivePendingExpiredAndRemovedViews(t *testing.T) {
	store := &memberTestStore{
		memberships: map[string]model.Membership{
			"membership-admin":  {ID: "membership-admin", WorkspaceID: "workspace-a", UserID: "admin-a", Role: "administrator", CreatedAt: time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)},
			"membership-member": {ID: "membership-member", WorkspaceID: "workspace-a", UserID: "member-a", Role: "member", CreatedAt: time.Date(2026, 7, 2, 0, 0, 0, 0, time.UTC)},
		},
		users: map[string]model.User{
			"admin-a":  {ID: "admin-a", Name: "Asha Rao", Email: "asha@example.test"},
			"member-a": {ID: "member-a", Name: "Bina Rao", Email: "bina@example.test", ProfileImageURL: "https://cdn.example.test/bina.png"},
		},
		invitations: []model.Invitation{
			{WorkspaceID: "workspace-a", Email: "pending@example.test", Role: "viewer", Status: "pending", ExpiresAt: time.Now().UTC().Add(time.Hour), CreatedAt: time.Date(2026, 7, 3, 0, 0, 0, 0, time.UTC)},
			{WorkspaceID: "workspace-a", Email: "expired@example.test", Role: "member", Status: "pending", ExpiresAt: time.Now().UTC().Add(-time.Hour), CreatedAt: time.Date(2026, 7, 4, 0, 0, 0, 0, time.UTC)},
		},
		removals: []model.WorkspaceMemberRemoval{{WorkspaceID: "workspace-a", Email: "former@example.test", Name: "Former member", Role: "member", JoinedAt: time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)}},
	}
	service := newMemberTestService(store)

	items, err := service.ListWorkspaceMembers(context.Background(), "workspace-a", "admin-a")
	if err != nil {
		t.Fatalf("ListWorkspaceMembers() error = %v", err)
	}
	if len(items) != 5 {
		t.Fatalf("member view count = %d, want 5: %#v", len(items), items)
	}
	statuses := map[string]string{}
	for _, item := range items {
		statuses[item.Email] = item.Status
	}
	for email, want := range map[string]string{
		"asha@example.test":    "active",
		"bina@example.test":    "active",
		"pending@example.test": "pending",
		"expired@example.test": "expired",
		"former@example.test":  "removed",
	} {
		if statuses[email] != want {
			t.Fatalf("status for %s = %q, want %q", email, statuses[email], want)
		}
	}
	payload, err := json.Marshal(items)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(payload), "userId") || strings.Contains(string(payload), "admin-a") {
		t.Fatalf("member view leaked internal identity: %s", payload)
	}
	var views []struct {
		Email       string          `json:"email"`
		Permissions json.RawMessage `json:"permissions"`
	}
	if err := json.Unmarshal(payload, &views); err != nil {
		t.Fatal(err)
	}
	for _, view := range views {
		if view.Email != "former@example.test" {
			continue
		}
		if got := string(view.Permissions); got != "[]" {
			t.Fatalf("legacy removed-member permissions = %s, want []", got)
		}
		return
	}
	t.Fatal("legacy removed member was not serialized")
}

func TestCancelInvitationRevokesPendingInvitationAndAudits(t *testing.T) {
	store := &memberTestStore{
		memberships: map[string]model.Membership{
			"membership-owner": {
				ID: "membership-owner", WorkspaceID: "workspace-a", UserID: "owner-a", Role: "owner",
			},
		},
		invitations: []model.Invitation{{
			ID: "invitation-a", WorkspaceID: "workspace-a", Status: "pending",
		}},
	}
	service := newMemberTestService(store)

	if err := service.CancelInvitation(context.Background(), "workspace-a", "owner-a", "invitation-a"); err != nil {
		t.Fatalf("CancelInvitation: %v", err)
	}
	if got := store.invitations[0].Status; got != "cancelled" {
		t.Fatalf("invitation status = %q, want cancelled", got)
	}
	if len(store.audits) != 1 || store.audits[0].Action != "invitation.cancelled" {
		t.Fatalf("cancellation audit = %#v", store.audits)
	}
}

func TestUpdateWorkspaceMemberRejectsRegularMemberChangingAdministrator(t *testing.T) {
	store := &memberTestStore{memberships: map[string]model.Membership{
		"member-membership": {ID: "member-membership", WorkspaceID: "workspace-a", UserID: "member-a", Role: "member", Permissions: []string{model.PermManageRoles}},
		"admin-membership":  {ID: "admin-membership", WorkspaceID: "workspace-a", UserID: "admin-a", Role: "administrator"},
	}}
	service := newMemberTestService(store)
	role := "viewer"
	_, err := service.UpdateWorkspaceMember(context.Background(), "workspace-a", "member-a", "admin-a", WorkspaceMemberUpdateInput{Role: &role})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("UpdateWorkspaceMember() error = %v, want forbidden", err)
	}
	if store.updates != 0 {
		t.Fatalf("protected member was updated %d times", store.updates)
	}
}

func TestUpdateWorkspaceMemberRechecksAndAuditsRoleChange(t *testing.T) {
	store := &memberTestStore{
		memberships: map[string]model.Membership{
			"admin-membership":  {ID: "admin-membership", WorkspaceID: "workspace-a", UserID: "admin-a", Role: "administrator"},
			"member-membership": {ID: "member-membership", WorkspaceID: "workspace-a", UserID: "member-a", Role: "member"},
		},
		users: map[string]model.User{"member-a": {ID: "member-a", Name: "Bina Rao", Email: "bina@example.test"}},
	}
	service := newMemberTestService(store)
	role := "viewer"
	updated, err := service.UpdateWorkspaceMember(context.Background(), "workspace-a", "admin-a", "member-a", WorkspaceMemberUpdateInput{Role: &role})
	if err != nil {
		t.Fatalf("UpdateWorkspaceMember() error = %v", err)
	}
	if updated.Role != "viewer" || store.memberships["member-membership"].Role != "viewer" || store.txRuns != 1 || len(store.audits) != 1 {
		t.Fatalf("role update = %#v, memberships = %#v, txRuns = %d, audits = %d", updated, store.memberships, store.txRuns, len(store.audits))
	}
}

func TestRemoveWorkspaceMemberProtectsOwnerAndRetainsRemovedSnapshot(t *testing.T) {
	store := &memberTestStore{
		memberships: map[string]model.Membership{
			"admin-membership":  {ID: "admin-membership", WorkspaceID: "workspace-a", UserID: "admin-a", Role: "administrator"},
			"owner-membership":  {ID: "owner-membership", WorkspaceID: "workspace-a", UserID: "owner-a", Role: "owner"},
			"member-membership": {ID: "member-membership", WorkspaceID: "workspace-a", UserID: "member-a", Role: "member", CreatedAt: time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)},
		},
		users: map[string]model.User{"member-a": {ID: "member-a", Name: "Bina Rao", Email: "bina@example.test"}},
	}
	service := newMemberTestService(store)
	if err := service.RemoveWorkspaceMember(context.Background(), "workspace-a", "admin-a", "owner-a"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("owner removal error = %v, want forbidden", err)
	}
	if err := service.RemoveWorkspaceMember(context.Background(), "workspace-a", "admin-a", "member-a"); err != nil {
		t.Fatalf("member removal error = %v", err)
	}
	if _, ok := store.memberships["member-membership"]; ok || len(store.removals) != 1 || store.deletes != 1 {
		t.Fatalf("removal did not delete and snapshot membership: %#v, removals=%#v, deletes=%d", store.memberships, store.removals, store.deletes)
	}
}
