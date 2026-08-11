package service

import (
	"context"
	"sort"
	"strings"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

// authorizePeriodReviewRead applies the scope-specific rule after the caller
// has established the ordinary period-review permissions. Member checkpoints
// remain private to the member whose view was captured; workspace checkpoints
// are shared with current workspace members who retain both read permissions.
func (s *FinanceService) authorizePeriodReviewRead(ctx context.Context, review model.PeriodReview, actorID string) error {
	switch review.Scope {
	case model.PeriodReviewScopeMemberView:
		if actorID != "" && actorID == review.ScopeActorID {
			return nil
		}
		return ErrForbidden
	case model.PeriodReviewScopeWorkspaceView:
		if _, err := s.access.Require(ctx, review.WorkspaceID, actorID, model.PermViewBalances); err != nil {
			return err
		}
		_, err := s.access.Require(ctx, review.WorkspaceID, actorID, model.PermViewTransactions)
		return err
	default:
		return ErrForbidden
	}
}

// hydratePeriodReviewers exposes a privacy-safe identity rather than the raw
// CreatedBy identifier. A deleted user or removed member is deliberately
// represented by a stable former-member placeholder.
func (s *FinanceService) hydratePeriodReviewers(ctx context.Context, actorID string, views []model.PeriodReviewView) error {
	byWorkspace := make(map[string][]string)
	for i := range views {
		byWorkspace[views[i].WorkspaceID] = append(byWorkspace[views[i].WorkspaceID], views[i].CreatedBy)
	}
	summaries := make(map[string]map[string]*model.CreatorSummary, len(byWorkspace))
	for workspaceID, creatorIDs := range byWorkspace {
		workspaceSummaries, err := s.periodReviewActorSummaries(ctx, workspaceID, creatorIDs, actorID)
		if err != nil {
			return err
		}
		summaries[workspaceID] = workspaceSummaries
	}
	for i := range views {
		views[i].ReviewedBy = summaries[views[i].WorkspaceID][views[i].CreatedBy]
		if views[i].ReviewedBy == nil {
			views[i].ReviewedBy = formerPeriodReviewMember()
		}
	}
	return nil
}

// periodReviewActorSummaries resolves current actors from their live user
// profile and removed actors from the immutable workspace removal snapshot.
// It never falls back to a removed actor's mutable global user profile.
func (s *FinanceService) periodReviewActorSummaries(ctx context.Context, workspaceID string, actorIDs []string, currentActorID string) (map[string]*model.CreatorSummary, error) {
	uniqueIDs := make([]string, 0, len(actorIDs))
	seen := make(map[string]struct{}, len(actorIDs))
	for _, actorID := range actorIDs {
		if actorID == "" {
			continue
		}
		if _, exists := seen[actorID]; exists {
			continue
		}
		seen[actorID] = struct{}{}
		uniqueIDs = append(uniqueIDs, actorID)
	}
	result := make(map[string]*model.CreatorSummary, len(uniqueIDs))
	if len(uniqueIDs) == 0 {
		return result, nil
	}

	var memberships []model.Membership
	if err := s.store.FindMany(ctx, "memberships", repository.Filter{
		"workspace_id": workspaceID,
		"user_id":      repository.Filter{"$in": uniqueIDs},
	}, &memberships, int64(len(uniqueIDs)), 0, nil); err != nil {
		return nil, err
	}
	active := make(map[string]struct{}, len(memberships))
	for _, membership := range memberships {
		if membership.WorkspaceID == workspaceID {
			active[membership.UserID] = struct{}{}
		}
	}

	var users []model.User
	if err := s.store.FindMany(ctx, "users", repository.Filter{
		"_id": repository.Filter{"$in": uniqueIDs},
	}, &users, int64(len(uniqueIDs)), 0, nil); err != nil {
		return nil, err
	}
	usersByID := make(map[string]model.User, len(users))
	for _, user := range users {
		usersByID[user.ID] = user
	}

	var removals []model.WorkspaceMemberRemoval
	if err := s.store.FindMany(ctx, "workspace_member_removals", repository.Filter{
		"workspace_id": workspaceID,
		"user_id":      repository.Filter{"$in": uniqueIDs},
	}, &removals, 0, 0, repository.Sort{"removed_at": -1}); err != nil {
		return nil, err
	}
	sort.SliceStable(removals, func(i, j int) bool { return removals[i].RemovedAt.After(removals[j].RemovedAt) })
	latestRemoval := make(map[string]model.WorkspaceMemberRemoval, len(removals))
	for _, removal := range removals {
		if removal.WorkspaceID != workspaceID {
			continue
		}
		if _, exists := latestRemoval[removal.UserID]; !exists {
			latestRemoval[removal.UserID] = removal
		}
	}

	for _, actorID := range uniqueIDs {
		if _, isActive := active[actorID]; isActive {
			user := usersByID[actorID]
			name := valueOrDefault(strings.TrimSpace(user.Name), "Workspace member")
			result[actorID] = &model.CreatorSummary{
				Name:            name,
				Initials:        initialsForName(name),
				ProfileImageURL: strings.TrimSpace(user.ProfileImageURL),
				Status:          "active",
				IsCurrentUser:   actorID == currentActorID,
			}
			continue
		}
		if removal, found := latestRemoval[actorID]; found {
			name := valueOrDefault(strings.TrimSpace(removal.Name), "Former member")
			result[actorID] = &model.CreatorSummary{
				Name:            name,
				Initials:        initialsForName(name),
				ProfileImageURL: strings.TrimSpace(removal.ProfileImageURL),
				Status:          "former",
			}
			continue
		}
		result[actorID] = formerPeriodReviewMember()
	}
	return result, nil
}

func formerPeriodReviewMember() *model.CreatorSummary {
	return &model.CreatorSummary{Name: "Former member", Initials: "FM", Status: "former"}
}

// isCurrentWorkspaceMember intentionally fails closed. It is used only while
// rendering identities; an unavailable or missing membership must never make
// an old actor appear to be an active collaborator.
func (s *FinanceService) isCurrentWorkspaceMember(ctx context.Context, workspaceID, userID string) bool {
	if workspaceID == "" || userID == "" {
		return false
	}
	var membership model.Membership
	return s.store.FindOne(ctx, "memberships", repository.Filter{
		"workspace_id": workspaceID,
		"user_id":      userID,
	}, &membership) == nil
}

// revisionVisibleToActor checks each historical side against the reader's
// current vault/account scope and the transaction's own privacy. It does not
// require the side to remain inside the reviewed date range: a visible move
// into or out of the range is part of the explanation.
func revisionVisibleToActor(review model.PeriodReview, revision *model.TransactionRevisionSnapshot, actorID string, vaultIDs, accountIDs []string) bool {
	if revision == nil || review.WorkspaceID == "" || revision.WorkspaceID != review.WorkspaceID {
		return false
	}
	if !contains(vaultIDs, revision.VaultID) || !contains(accountIDs, revision.AccountID) {
		return false
	}
	if revision.DestinationAccountID != "" && !contains(accountIDs, revision.DestinationAccountID) {
		return false
	}
	return revision.Privacy == "workspace" || (actorID != "" && revision.CreatedBy == actorID)
}
