package service

import (
	"context"
	"errors"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type AccessService struct {
	store repository.Store
}

func NewAccessService(store repository.Store) *AccessService {
	return &AccessService{store: store}
}

func (s *AccessService) Require(ctx context.Context, workspaceID, userID, permission string) (*model.Membership, error) {
	if workspaceID == "" {
		return nil, &FieldError{Field: "workspaceId", Message: "is required"}
	}
	if userID == "" || !model.IsKnownPermission(permission) {
		return nil, ErrForbidden
	}
	var membership model.Membership
	if err := s.store.FindOne(ctx, "memberships", repository.Filter{
		"workspace_id": workspaceID, "user_id": userID,
	}, &membership); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrForbidden
		}
		return nil, err
	}
	if hasPermission(membership, permission) {
		return &membership, nil
	}
	return nil, ErrForbidden
}

func hasPermission(membership model.Membership, permission string) bool {
	for _, granted := range membership.Permissions {
		if granted == permission {
			return true
		}
	}
	for _, granted := range model.RolePermissions[membership.Role] {
		if granted == permission {
			return true
		}
	}
	return false
}
