package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type InvitationInput struct {
	Email       string   `json:"email"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}

type InvitationResult struct {
	Invitation *model.Invitation `json:"invitation"`
	Token      string            `json:"token"`
}

// InvitationAcceptance is the safe client-facing result of consuming a
// direct invitation. The membership storage identifiers stay server-side.
type InvitationAcceptance struct {
	WorkspaceID string   `json:"workspaceId"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}

type WorkspaceMember struct {
	Name             string    `json:"name"`
	Email            string    `json:"email"`
	Role             string    `json:"role"`
	Permissions      []string  `json:"permissions"`
	Status           string    `json:"status"`
	JoinedAt         time.Time `json:"joinedAt"`
	InvitationID     string    `json:"invitationId,omitempty"`
	InvitationStatus string    `json:"invitationStatus,omitempty"`
	ProfileImageURL  string    `json:"profileImageUrl,omitempty"`
}

func (s *FinanceService) CreateInvitation(ctx context.Context, workspaceID, actorID string, input InvitationInput) (*InvitationResult, error) {
	membership, err := s.access.Require(ctx, workspaceID, actorID, model.PermInviteMembers)
	if err != nil {
		return nil, err
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if email != "" {
		var err error
		email, err = validEmail(email)
		if err != nil {
			return nil, err
		}
	}
	now := time.Now().UTC()
	if _, err := s.store.UpdateMany(
		ctx,
		"invitations",
		repository.Filter{
			"workspace_id": workspaceID,
			"email":        email,
			"status":       "pending",
			"expires_at":   repository.Filter{"$lte": now},
		},
		repository.Filter{"$set": repository.Filter{"status": "expired", "expired_at": now}},
	); err != nil {
		return nil, err
	}
	role := strings.ToLower(strings.TrimSpace(input.Role))
	permissions, err := invitationPermissions(*membership, role, input.Permissions)
	if err != nil {
		return nil, err
	}
	if email != "" {
		var existing model.Invitation
		err = s.store.FindOne(ctx, "invitations", repository.Filter{
			"workspace_id": workspaceID, "email": email, "status": "pending", "expires_at": repository.Filter{"$gt": time.Now().UTC()},
		}, &existing)
		if err == nil {
			return nil, ErrConflict
		}
		if !errors.Is(err, repository.ErrNotFound) {
			return nil, err
		}
	}
	token, hash, err := randomToken(tokenBytes)
	if err != nil {
		return nil, err
	}
	invitation := &model.Invitation{
		ID: newID(), WorkspaceID: workspaceID, InviterID: actorID, Email: email,
		Role: role, Permissions: permissions, TokenHash: hash, Status: "pending",
		ExpiresAt: now.Add(7 * 24 * time.Hour), CreatedAt: now,
	}
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if err := s.store.Insert(transactionCtx, "invitations", invitation); err != nil {
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "invitation.created", "invitation", invitation.ID, map[string]any{"email": email}); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		return nil, err
	}
	return &InvitationResult{Invitation: invitation, Token: token}, nil
}

// CancelInvitation revokes a still-pending direct invitation without deleting
// its audit history. Its token can no longer be accepted once the status moves
// out of pending.
func (s *FinanceService) CancelInvitation(ctx context.Context, workspaceID, actorID, invitationID string) error {
	invitationID = strings.TrimSpace(invitationID)
	if invitationID == "" {
		return ErrNotFound
	}
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermInviteMembers); err != nil {
		return err
	}

	now := time.Now().UTC()
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if _, err := s.access.Require(transactionCtx, workspaceID, actorID, model.PermInviteMembers); err != nil {
			return nil, err
		}
		var cancelled model.Invitation
		if err := s.store.UpdateOne(transactionCtx, "invitations", repository.Filter{
			"_id": invitationID, "workspace_id": workspaceID, "status": "pending",
		}, repository.Filter{"$set": repository.Filter{
			"status": "cancelled", "cancelled_at": now,
		}}, &cancelled); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "invitation.cancelled", "invitation", invitationID, nil); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		return err
	}
	return nil
}

func (s *FinanceService) AcceptInvitation(ctx context.Context, actor *model.User, token string) (*model.Membership, error) {
	if actor == nil || actor.ID == "" {
		return nil, ErrUnauthorized
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, ErrNotFound
	}
	hash, err := tokenHash(token)
	if err != nil {
		return nil, ErrNotFound
	}
	var invitation model.Invitation
	if err := s.store.FindOne(ctx, "invitations", repository.Filter{
		"token_hash": hash, "status": "pending", "expires_at": repository.Filter{"$gt": time.Now().UTC()},
	}, &invitation); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if invitation.Email != "" && !strings.EqualFold(invitation.Email, strings.TrimSpace(actor.Email)) {
		return nil, ErrForbidden
	}
	var membership model.Membership
	err = s.store.FindOne(ctx, "memberships", repository.Filter{
		"workspace_id": invitation.WorkspaceID, "user_id": actor.ID,
	}, &membership)
	membershipExists := err == nil
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}
	now := time.Now().UTC()
	if !membershipExists {
		membership = model.Membership{
			ID: newID(), WorkspaceID: invitation.WorkspaceID, UserID: actor.ID,
			Role: invitation.Role, Permissions: invitation.Permissions, CreatedAt: now,
		}
	}
	verifyEmail := invitation.Email != "" && !actor.EmailVerified
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		inviterMembership, err := s.access.Require(
			transactionCtx,
			invitation.WorkspaceID,
			invitation.InviterID,
			model.PermInviteMembers,
		)
		if err != nil {
			if errors.Is(err, ErrForbidden) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		if _, err := invitationPermissions(*inviterMembership, invitation.Role, invitation.Permissions); err != nil {
			if errors.Is(err, ErrForbidden) || errors.Is(err, ErrValidation) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		if verifyEmail {
			// The random, single-use invitation token is the proof delivered to
			// the invited mailbox. Verify the matching account in the same
			// transaction that consumes that bearer capability.
			var verifiedUser model.User
			if err := s.store.UpdateOne(
				transactionCtx,
				"users",
				repository.Filter{"_id": actor.ID, "email": actor.Email},
				repository.Filter{"$set": repository.Filter{
					"email_verified": true,
					"updated_at":     now,
				}},
				&verifiedUser,
			); err != nil {
				return nil, err
			}
		}
		if !membershipExists {
			if err := s.store.Insert(transactionCtx, "memberships", &membership); err != nil {
				return nil, err
			}
		}
		var updated model.Invitation
		if err := s.store.UpdateOne(transactionCtx, "invitations", repository.Filter{
			"_id": invitation.ID, "status": "pending", "expires_at": repository.Filter{"$gt": now},
		}, repository.Filter{"$set": repository.Filter{"status": "accepted", "accepted_at": now}}, &updated); err != nil {
			return nil, err
		}
		if err := s.audit(transactionCtx, invitation.WorkspaceID, actor.ID, "invitation.accepted", "invitation", invitation.ID, nil); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		return nil, err
	}
	if verifyEmail {
		actor.EmailVerified = true
	}
	return &membership, nil
}

type ClaimInput struct {
	VaultID     string `json:"vaultId"`
	AmountMinor int64  `json:"amountMinor"`
	Currency    string `json:"currency"`
	Description string `json:"description"`
}

func (s *FinanceService) SubmitClaim(ctx context.Context, workspaceID, actorID string, input ClaimInput) (*model.ExpenseClaim, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermSubmitExpenses); err != nil {
		return nil, err
	}
	input.VaultID = strings.TrimSpace(input.VaultID)
	if err := validateMoney("amountMinor", input.AmountMinor, false); err != nil {
		return nil, err
	}
	currency, err := validCurrency(input.Currency)
	if err != nil {
		return nil, err
	}
	var vault *model.Vault
	if input.VaultID == "" {
		vault, err = s.ensureWorkspaceDefaultVault(ctx, workspaceID, actorID, currency)
	} else {
		vault, err = s.requireVault(ctx, workspaceID, actorID, input.VaultID)
	}
	if err != nil {
		return nil, err
	}
	if vault.Privacy != "workspace" {
		return nil, &FieldError{
			Field:   "vaultId",
			Message: "must reference a workspace-visible vault so another approver can review the claim",
		}
	}
	if currency != vault.Currency {
		return nil, &FieldError{Field: "currency", Message: "must match the vault currency"}
	}
	description := strings.TrimSpace(input.Description)
	if description == "" || len([]rune(description)) > 500 {
		return nil, &FieldError{Field: "description", Message: "must contain 1 to 500 characters"}
	}
	now := time.Now().UTC()
	claim := &model.ExpenseClaim{
		ID: newID(), WorkspaceID: workspaceID, VaultID: vault.ID, SubmittedBy: actorID,
		AmountMinor: input.AmountMinor, Currency: currency, Description: description,
		Status: "pending", ReimbursementStatus: "not_reimbursed", CreatedAt: now, UpdatedAt: now,
	}
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if err := s.store.Insert(transactionCtx, "expense_claims", claim); err != nil {
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "expense_claim.submitted", "expense_claim", claim.ID, nil); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		return nil, err
	}
	return claim, nil
}

func (s *FinanceService) ReviewClaim(ctx context.Context, workspaceID, actorID, claimID, status, comment string) (*model.ExpenseClaim, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermApproveExpenses); err != nil {
		return nil, err
	}
	status = strings.ToLower(strings.TrimSpace(status))
	if status != "approved" && status != "rejected" && status != "correction_requested" {
		return nil, &FieldError{Field: "status", Message: "must be approved, rejected, or correction_requested"}
	}
	var existing model.ExpenseClaim
	if err := s.store.FindOne(ctx, "expense_claims", repository.Filter{
		"_id": claimID, "workspace_id": workspaceID, "status": "pending",
	}, &existing); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	var vault model.Vault
	if err := s.store.FindOne(ctx, "vaults", repository.Filter{
		"_id": existing.VaultID, "workspace_id": workspaceID, "archived": false,
	}, &vault); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if vault.Privacy != "workspace" && vault.OwnerID != actorID {
		return nil, ErrForbidden
	}
	if existing.SubmittedBy == actorID {
		return nil, ErrForbidden
	}
	comment = strings.TrimSpace(comment)
	if len([]rune(comment)) > 500 {
		return nil, &FieldError{Field: "comment", Message: "must contain at most 500 characters"}
	}
	now := time.Now().UTC()
	var claim model.ExpenseClaim
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if err := s.store.UpdateOne(transactionCtx, "expense_claims", repository.Filter{
			"_id": claimID, "workspace_id": workspaceID, "status": "pending",
		}, repository.Filter{"$set": repository.Filter{
			"status": status, "approval_comment": comment, "approved_by": actorID, "updated_at": now,
		}}, &claim); err != nil {
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "expense_claim."+status, "expense_claim", claim.ID, nil); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &claim, nil
}
