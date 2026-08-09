package service

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type WorkspaceMemberUpdateInput struct {
	Role        *string   `json:"role,omitempty"`
	Permissions *[]string `json:"permissions,omitempty"`
}

func (s *FinanceService) ListWorkspaceMembers(ctx context.Context, workspaceID, actorID string) ([]WorkspaceMember, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewWorkspace); err != nil {
		return nil, err
	}

	var memberships []model.Membership
	if err := s.store.FindMany(ctx, "memberships", repository.Filter{
		"workspace_id": workspaceID,
	}, &memberships, 0, 0, repository.Sort{"created_at": 1}); err != nil {
		return nil, err
	}

	userIDs := make([]string, 0, len(memberships))
	seen := make(map[string]struct{}, len(memberships))
	for _, membership := range memberships {
		if membership.UserID == "" {
			continue
		}
		if _, ok := seen[membership.UserID]; ok {
			continue
		}
		seen[membership.UserID] = struct{}{}
		userIDs = append(userIDs, membership.UserID)
	}

	usersByID, err := s.workspaceUsers(ctx, userIDs)
	if err != nil {
		return nil, err
	}

	items := make([]WorkspaceMember, 0, len(memberships))
	activeEmails := make(map[string]struct{}, len(memberships))
	for _, membership := range memberships {
		user := usersByID[membership.UserID]
		item := workspaceMemberView(membership, user, "active", "")
		items = append(items, item)
		if email := strings.ToLower(strings.TrimSpace(item.Email)); email != "" {
			activeEmails[email] = struct{}{}
		}
	}

	var invitations []model.Invitation
	if err := s.store.FindMany(ctx, "invitations", repository.Filter{
		"workspace_id": workspaceID,
		"status":       repository.Filter{"$in": []string{"pending", "expired"}},
	}, &invitations, 0, 0, repository.Sort{"created_at": 1}); err != nil {
		return nil, err
	}
	for _, invitation := range invitations {
		email := strings.ToLower(strings.TrimSpace(invitation.Email))
		if email != "" {
			if _, active := activeEmails[email]; active {
				continue
			}
		}
		status := strings.ToLower(strings.TrimSpace(invitation.Status))
		if status != "expired" && !invitation.ExpiresAt.IsZero() && !invitation.ExpiresAt.After(time.Now().UTC()) {
			status = "expired"
		}
		if status != "expired" {
			status = "pending"
		}
		permissions := append([]string(nil), invitation.Permissions...)
		if len(permissions) == 0 {
			permissions, _ = model.PermissionsForRole(invitation.Role)
		}
		if permissions == nil {
			permissions = []string{}
		}
		items = append(items, WorkspaceMember{
			Name:             valueOrDefault(strings.TrimSpace(email), "Invited member"),
			Email:            email,
			Role:             invitation.Role,
			Permissions:      permissions,
			Status:           status,
			JoinedAt:         invitation.CreatedAt,
			InvitationID:     invitation.ID,
			InvitationStatus: status,
		})
	}

	var removals []model.WorkspaceMemberRemoval
	if err := s.store.FindMany(ctx, "workspace_member_removals", repository.Filter{
		"workspace_id": workspaceID,
	}, &removals, 0, 0, repository.Sort{"removed_at": -1}); err != nil {
		return nil, err
	}
	for _, removal := range removals {
		permissions := append([]string{}, removal.Permissions...)
		items = append(items, WorkspaceMember{
			Name:            valueOrDefault(strings.TrimSpace(removal.Name), "Former member"),
			Email:           strings.TrimSpace(removal.Email),
			Role:            removal.Role,
			Permissions:     permissions,
			Status:          "removed",
			JoinedAt:        removal.JoinedAt,
			ProfileImageURL: strings.TrimSpace(removal.ProfileImageURL),
		})
	}
	return items, nil
}

func (s *FinanceService) UpdateWorkspaceMember(ctx context.Context, workspaceID, actorID, targetRef string, input WorkspaceMemberUpdateInput) (*WorkspaceMember, error) {
	if input.Role == nil && input.Permissions == nil {
		return nil, &FieldError{Field: "member", Message: "role or permissions is required"}
	}
	actor, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageRoles)
	if err != nil {
		return nil, err
	}
	targetID, target, err := s.resolveWorkspaceMember(ctx, workspaceID, targetRef)
	if err != nil {
		return nil, err
	}
	if err := validateMemberTarget(*actor, *target); err != nil {
		return nil, err
	}

	role := target.Role
	if input.Role != nil {
		role = strings.ToLower(strings.TrimSpace(*input.Role))
		if role == "owner" {
			return nil, ErrForbidden
		}
		if _, ok := model.PermissionsForRole(role); !ok {
			return nil, &FieldError{Field: "role", Message: "is not supported"}
		}
	}
	permissions := append([]string(nil), target.Permissions...)
	if input.Permissions != nil {
		permissions, err = validateMemberPermissions(*actor, *input.Permissions)
		if err != nil {
			return nil, err
		}
	} else if input.Role != nil {
		permissions, _ = model.PermissionsForRole(role)
	}

	var updated model.Membership
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		currentActor, err := s.access.Require(transactionCtx, workspaceID, actorID, model.PermManageRoles)
		if err != nil {
			return nil, err
		}
		currentTarget, err := s.findMembership(transactionCtx, workspaceID, targetID)
		if err != nil {
			return nil, err
		}
		if err := validateMemberTarget(*currentActor, *currentTarget); err != nil {
			return nil, err
		}
		if err := s.store.UpdateOne(transactionCtx, "memberships", repository.Filter{
			"_id": currentTarget.ID, "workspace_id": workspaceID, "user_id": targetID,
		}, repository.Filter{"$set": repository.Filter{
			"role": role, "permissions": permissions,
		}}, &updated); err != nil {
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "workspace.member_updated", "membership", targetID, map[string]any{
			"role": role,
		}); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	user, _ := s.findUser(ctx, targetID)
	view := workspaceMemberView(updated, user, "active", "")
	return &view, nil
}

func (s *FinanceService) RemoveWorkspaceMember(ctx context.Context, workspaceID, actorID, targetRef string) error {
	actor, err := s.access.Require(ctx, workspaceID, actorID, model.PermRemoveMembers)
	if err != nil {
		return err
	}
	targetID, target, err := s.resolveWorkspaceMember(ctx, workspaceID, targetRef)
	if err != nil {
		return err
	}
	if err := validateMemberTarget(*actor, *target); err != nil {
		return err
	}
	user, _ := s.findUser(ctx, targetID)
	removal := model.WorkspaceMemberRemoval{
		ID:              newID(),
		WorkspaceID:     workspaceID,
		UserID:          targetID,
		Name:            strings.TrimSpace(user.Name),
		Email:           strings.TrimSpace(user.Email),
		Role:            target.Role,
		Permissions:     append([]string(nil), target.Permissions...),
		ProfileImageURL: strings.TrimSpace(user.ProfileImageURL),
		JoinedAt:        target.CreatedAt,
		RemovedAt:       time.Now().UTC(),
		RemovedBy:       actorID,
	}

	return s.removeWorkspaceMemberTransaction(ctx, workspaceID, actorID, targetID, removal)
}

func (s *FinanceService) removeWorkspaceMemberTransaction(ctx context.Context, workspaceID, actorID, targetID string, removal model.WorkspaceMemberRemoval) error {
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		actor, err := s.access.Require(transactionCtx, workspaceID, actorID, model.PermRemoveMembers)
		if err != nil {
			return nil, err
		}
		target, err := s.findMembership(transactionCtx, workspaceID, targetID)
		if err != nil {
			return nil, err
		}
		if err := validateMemberTarget(*actor, *target); err != nil {
			return nil, err
		}
		if err := s.store.DeleteOne(transactionCtx, "memberships", repository.Filter{
			"_id": target.ID, "workspace_id": workspaceID, "user_id": targetID,
		}); err != nil {
			return nil, err
		}
		if err := s.store.Insert(transactionCtx, "workspace_member_removals", &removal); err != nil {
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "workspace.member_removed", "membership", targetID, nil); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (s *FinanceService) workspaceUsers(ctx context.Context, ids []string) (map[string]model.User, error) {
	users := make(map[string]model.User, len(ids))
	if len(ids) == 0 {
		return users, nil
	}
	var values []model.User
	if err := s.store.FindMany(ctx, "users", repository.Filter{
		"_id": repository.Filter{"$in": ids},
	}, &values, int64(len(ids)), 0, nil); err != nil {
		return nil, err
	}
	for _, user := range values {
		users[user.ID] = user
	}
	return users, nil
}

func (s *FinanceService) findUser(ctx context.Context, userID string) (model.User, error) {
	var user model.User
	if err := s.store.FindOne(ctx, "users", repository.Filter{"_id": userID}, &user); err != nil {
		return model.User{}, err
	}
	return user, nil
}

func (s *FinanceService) resolveWorkspaceMember(ctx context.Context, workspaceID, targetRef string) (string, *model.Membership, error) {
	targetRef, _ = url.PathUnescape(strings.TrimSpace(targetRef))
	target, err := s.findMembership(ctx, workspaceID, targetRef)
	if err == nil {
		return targetRef, target, nil
	}
	if !errors.Is(err, repository.ErrNotFound) || !strings.Contains(targetRef, "@") {
		if errors.Is(err, repository.ErrNotFound) {
			return "", nil, ErrNotFound
		}
		return "", nil, err
	}
	var user model.User
	if err := s.store.FindOne(ctx, "users", repository.Filter{"email": strings.ToLower(targetRef)}, &user); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return "", nil, ErrNotFound
		}
		return "", nil, err
	}
	target, err = s.findMembership(ctx, workspaceID, user.ID)
	if errors.Is(err, repository.ErrNotFound) {
		return "", nil, ErrNotFound
	}
	if err != nil {
		return "", nil, err
	}
	return user.ID, target, nil
}

func (s *FinanceService) findMembership(ctx context.Context, workspaceID, userID string) (*model.Membership, error) {
	var membership model.Membership
	if err := s.store.FindOne(ctx, "memberships", repository.Filter{
		"workspace_id": workspaceID,
		"user_id":      userID,
	}, &membership); err != nil {
		return nil, err
	}
	return &membership, nil
}

func validateMemberTarget(actor, target model.Membership) error {
	if target.Role == "owner" {
		return ErrForbidden
	}
	if target.Role == "administrator" && actor.Role != "owner" && actor.Role != "administrator" {
		return ErrForbidden
	}
	return nil
}

func validateMemberPermissions(actor model.Membership, requested []string) ([]string, error) {
	permissions := make([]string, 0, len(requested))
	seen := make(map[string]struct{}, len(requested))
	for _, permission := range requested {
		permission = strings.TrimSpace(permission)
		if !model.IsKnownPermission(permission) {
			return nil, &FieldError{Field: "permissions", Message: "contains an unsupported permission"}
		}
		if !hasPermission(actor, permission) {
			return nil, ErrForbidden
		}
		if _, ok := seen[permission]; ok {
			continue
		}
		seen[permission] = struct{}{}
		permissions = append(permissions, permission)
	}
	return permissions, nil
}

func workspaceMemberView(membership model.Membership, user model.User, status, invitationStatus string) WorkspaceMember {
	name := strings.TrimSpace(user.Name)
	if name == "" {
		name = "Former member"
	}
	permissions := append([]string(nil), membership.Permissions...)
	if len(permissions) == 0 {
		permissions, _ = model.PermissionsForRole(membership.Role)
	}
	if permissions == nil {
		permissions = []string{}
	}
	view := WorkspaceMember{
		Name:            name,
		Email:           strings.TrimSpace(user.Email),
		Role:            membership.Role,
		Permissions:     permissions,
		Status:          status,
		JoinedAt:        membership.CreatedAt,
		ProfileImageURL: strings.TrimSpace(user.ProfileImageURL),
	}
	if invitationStatus != "" {
		view.InvitationStatus = invitationStatus
	}
	return view
}
