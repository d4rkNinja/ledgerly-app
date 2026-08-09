package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const workspaceJoinCodeLifetime = 3 * time.Minute

// A short response allowance ensures a code remains usable for the promised
// three minutes even when the final database write, audit entry, and response
// serialization take measurable time.
const workspaceJoinCodeResponseGrace = 5 * time.Second

type WorkspaceJoinCodeResult struct {
	Code      string    `json:"code"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type WorkspaceJoinRequestInput struct {
	Code string `json:"code"`
}

type WorkspaceJoinReviewInput struct {
	Status string `json:"status"`
}

func (s *FinanceService) RotateWorkspaceJoinCode(ctx context.Context, workspaceID, actorID string) (*WorkspaceJoinCodeResult, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermInviteMembers); err != nil {
		return nil, err
	}
	code, hash, err := randomToken(tokenBytes)
	if err != nil {
		return nil, err
	}
	var expiresAt time.Time
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if _, err := s.access.Require(transactionCtx, workspaceID, actorID, model.PermInviteMembers); err != nil {
			return nil, err
		}
		// Start the validity window only after the transaction has rechecked the
		// caller's authority. The response grace absorbs the small amount of work
		// still required to persist the code and return the successful response.
		now := time.Now().UTC()
		expiresAt = now.Add(workspaceJoinCodeLifetime + workspaceJoinCodeResponseGrace)
		var workspace model.Workspace
		if err := s.store.UpdateOne(transactionCtx, "workspaces",
			repository.Filter{"_id": workspaceID},
			repository.Filter{"$set": repository.Filter{
				"join_code_hash":       hash,
				"join_code_expires_at": expiresAt,
				"visibility":           "private",
				"updated_at":           now,
			}},
			&workspace,
		); err != nil {
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "workspace.join_code_rotated", "workspace", workspaceID, nil); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		return nil, err
	}
	return &WorkspaceJoinCodeResult{Code: code, ExpiresAt: expiresAt}, nil
}

func (s *FinanceService) RequestWorkspaceJoin(ctx context.Context, actor *model.User, input WorkspaceJoinRequestInput) (*model.WorkspaceJoinRequest, error) {
	if actor == nil || strings.TrimSpace(actor.ID) == "" {
		return nil, ErrUnauthorized
	}
	input.Code = strings.TrimSpace(input.Code)
	if input.Code == "" {
		return nil, ErrNotFound
	}
	hash, err := tokenHash(input.Code)
	if err != nil {
		return nil, ErrNotFound
	}
	lookupNow := time.Now().UTC()
	var workspace model.Workspace
	if err := s.store.FindOne(ctx, "workspaces", repository.Filter{
		"join_code_hash":       hash,
		"visibility":           "private",
		"join_code_expires_at": repository.Filter{"$gt": lookupNow},
	}, &workspace); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if !workspace.JoinCodeExpiresAt.After(lookupNow) {
		return nil, ErrNotFound
	}
	var existingMembership model.Membership
	err = s.store.FindOne(ctx, "memberships", repository.Filter{
		"workspace_id": workspace.ID, "user_id": actor.ID,
	}, &existingMembership)
	if err == nil {
		return nil, ErrConflict
	}
	if !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}
	var existing model.WorkspaceJoinRequest
	err = s.store.FindOne(ctx, "workspace_join_requests", repository.Filter{
		"workspace_id": workspace.ID, "requester_id": actor.ID, "status": "pending",
	}, &existing)
	if err == nil {
		return &existing, nil
	}
	if !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}
	now := time.Now().UTC()
	request := &model.WorkspaceJoinRequest{
		ID: newID(), WorkspaceID: workspace.ID, WorkspaceName: workspace.Name,
		RequesterID: actor.ID, RequesterName: actor.Name, RequesterEmail: actor.Email,
		Status: "pending", CreatedAt: now,
	}
	var approvers []model.Membership
	if err := s.store.FindMany(ctx, "memberships", repository.Filter{
		"workspace_id": workspace.ID,
		"role":         repository.Filter{"$in": []string{"owner", "administrator"}},
	}, &approvers, 0, 0, nil); err != nil {
		return nil, err
	}
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if err := s.store.Insert(transactionCtx, "workspace_join_requests", request); err != nil {
			return nil, err
		}
		for _, approver := range approvers {
			if approver.UserID == "" || approver.UserID == actor.ID {
				continue
			}
			notification := &model.Notification{
				ID: newID(), UserID: approver.UserID, WorkspaceID: workspace.ID,
				Type: "workspace_join_requested", Title: "Workspace join request",
				Message: actor.Name + " requested access to " + workspace.Name + ".", CreatedAt: now,
			}
			if err := s.store.Insert(transactionCtx, "notifications", notification); err != nil {
				return nil, err
			}
		}
		if err := s.audit(transactionCtx, workspace.ID, actor.ID, "workspace.join_requested", "workspace_join_request", request.ID, nil); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		return nil, err
	}
	return request, nil
}

func (s *FinanceService) ListWorkspaceJoinRequests(ctx context.Context, workspaceID, actorID string) ([]model.WorkspaceJoinRequest, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermInviteMembers); err != nil {
		return nil, err
	}
	var requests []model.WorkspaceJoinRequest
	if err := s.store.FindMany(ctx, "workspace_join_requests", repository.Filter{
		"workspace_id": workspaceID, "status": "pending",
	}, &requests, 0, 0, repository.Sort{"created_at": -1}); err != nil {
		return nil, err
	}
	return requests, nil
}

func (s *FinanceService) ReviewWorkspaceJoinRequest(ctx context.Context, workspaceID, actorID, requestID string, input WorkspaceJoinReviewInput) (*model.WorkspaceJoinRequest, error) {
	status := strings.ToLower(strings.TrimSpace(input.Status))
	if status != "approved" && status != "rejected" {
		return nil, &FieldError{Field: "status", Message: "must be approved or rejected"}
	}
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermInviteMembers); err != nil {
		return nil, err
	}
	var pending model.WorkspaceJoinRequest
	if err := s.store.FindOne(ctx, "workspace_join_requests", repository.Filter{
		"_id": requestID, "workspace_id": workspaceID, "status": "pending",
	}, &pending); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	now := time.Now().UTC()
	var reviewed model.WorkspaceJoinRequest
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if _, err := s.access.Require(transactionCtx, workspaceID, actorID, model.PermInviteMembers); err != nil {
			return nil, err
		}
		if status == "approved" {
			var membership model.Membership
			err := s.store.FindOne(transactionCtx, "memberships", repository.Filter{
				"workspace_id": workspaceID, "user_id": pending.RequesterID,
			}, &membership)
			if errors.Is(err, repository.ErrNotFound) {
				membership = model.Membership{ID: newID(), WorkspaceID: workspaceID, UserID: pending.RequesterID, Role: "member", CreatedAt: now}
				if err := s.store.Insert(transactionCtx, "memberships", &membership); err != nil {
					return nil, err
				}
			} else if err != nil {
				return nil, err
			}
		}
		if err := s.store.UpdateOne(transactionCtx, "workspace_join_requests", repository.Filter{
			"_id": requestID, "workspace_id": workspaceID, "status": "pending",
		}, repository.Filter{"$set": repository.Filter{
			"status": status, "reviewed_at": now, "reviewed_by": actorID,
		}}, &reviewed); err != nil {
			return nil, err
		}
		notification := &model.Notification{
			ID: newID(), UserID: pending.RequesterID, WorkspaceID: workspaceID,
			Type: "workspace_join_" + status, Title: "Workspace request " + status,
			Message: "Your request to join " + pending.WorkspaceName + " was " + status + ".", CreatedAt: now,
		}
		if err := s.store.Insert(transactionCtx, "notifications", notification); err != nil {
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "workspace.join_"+status, "workspace_join_request", requestID, nil); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &reviewed, nil
}
