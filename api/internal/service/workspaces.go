package service

import (
	"context"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type WorkspaceInput struct {
	Name           string `json:"name"`
	Type           string `json:"type"`
	Currency       string `json:"currency"`
	FinancialMonth int    `json:"financialMonthStart"`
}

type WorkspaceSummary struct {
	model.Workspace
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
	MemberCount int64    `json:"memberCount"`
}

type workspaceMemberCount struct {
	WorkspaceID string `bson:"_id"`
	Count       int64  `bson:"member_count"`
}

func (s *FinanceService) CreateWorkspace(ctx context.Context, actorID string, input WorkspaceInput) (*model.Workspace, error) {
	name := strings.TrimSpace(input.Name)
	if len([]rune(name)) < 2 || len([]rune(name)) > 100 {
		return nil, &FieldError{Field: "name", Message: "must contain 2 to 100 characters"}
	}
	kind := strings.ToLower(strings.TrimSpace(input.Type))
	if kind != "personal" && kind != "family" && kind != "office" {
		return nil, &FieldError{Field: "type", Message: "must be personal, family, or office"}
	}
	currency, err := validCurrency(input.Currency)
	if err != nil {
		return nil, err
	}
	if input.FinancialMonth == 0 {
		input.FinancialMonth = 1
	}
	if input.FinancialMonth < 1 || input.FinancialMonth > 28 {
		return nil, &FieldError{Field: "financialMonthStart", Message: "must be between 1 and 28"}
	}
	now := time.Now().UTC()
	workspace := &model.Workspace{
		ID: newID(), Name: name, Type: kind, Currency: currency,
		FinancialMonth: input.FinancialMonth, OwnerID: actorID, Visibility: "private", CreatedAt: now, UpdatedAt: now,
	}
	membership := &model.Membership{
		ID: newID(), WorkspaceID: workspace.ID, UserID: actorID, Role: "owner",
		CreatedAt: now,
	}
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if err := s.store.Insert(transactionCtx, "workspaces", workspace); err != nil {
			return nil, err
		}
		if err := s.store.Insert(transactionCtx, "memberships", membership); err != nil {
			return nil, err
		}
		if err := s.audit(transactionCtx, workspace.ID, actorID, "workspace.created", "workspace", workspace.ID, nil); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		return nil, err
	}
	return workspace, nil
}

func (s *FinanceService) ListWorkspaces(ctx context.Context, actorID string) ([]WorkspaceSummary, error) {
	var memberships []model.Membership
	// This endpoint returns the actor's complete workspace set and has no
	// pagination contract. A hard query limit would silently hide valid tenant
	// memberships. The query remains bounded to the authenticated user, uses a
	// dedicated actor-scoped index, and inherits the server request deadline.
	if err := s.store.FindMany(ctx, "memberships", repository.Filter{"user_id": actorID}, &memberships, 0, 0, nil); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(memberships))
	membershipByWorkspace := make(map[string]model.Membership, len(memberships))
	for _, membership := range memberships {
		if membership.WorkspaceID == "" {
			continue
		}
		if _, exists := membershipByWorkspace[membership.WorkspaceID]; exists {
			continue
		}
		membershipByWorkspace[membership.WorkspaceID] = membership
		ids = append(ids, membership.WorkspaceID)
	}
	if len(ids) == 0 {
		return []WorkspaceSummary{}, nil
	}
	var workspaces []model.Workspace
	if err := s.store.FindMany(ctx, "workspaces", repository.Filter{"_id": repository.Filter{"$in": ids}}, &workspaces, 0, 0, repository.Sort{"created_at": -1}); err != nil {
		return nil, err
	}

	var counts []workspaceMemberCount
	if err := s.store.Aggregate(ctx, "memberships", repository.Pipeline{
		{"$match": repository.Filter{"workspace_id": repository.Filter{"$in": ids}}},
		{"$group": repository.Filter{
			"_id":          "$workspace_id",
			"member_count": repository.Filter{"$sum": 1},
		}},
	}, &counts); err != nil {
		return nil, err
	}
	countByWorkspace := make(map[string]int64, len(counts))
	for _, count := range counts {
		countByWorkspace[count.WorkspaceID] = count.Count
	}

	summaries := make([]WorkspaceSummary, 0, len(workspaces))
	for _, workspace := range workspaces {
		membership, accessible := membershipByWorkspace[workspace.ID]
		if !accessible {
			continue
		}
		summaries = append(summaries, WorkspaceSummary{
			Workspace:   workspace,
			Role:        membership.Role,
			Permissions: effectivePermissions(membership),
			MemberCount: countByWorkspace[workspace.ID],
		})
	}
	return summaries, nil
}

func effectivePermissions(membership model.Membership) []string {
	rolePermissions, _ := model.PermissionsForRole(membership.Role)
	permissions := make([]string, 0, len(rolePermissions)+len(membership.Permissions))
	seen := make(map[string]struct{}, cap(permissions))
	for _, permission := range append(rolePermissions, membership.Permissions...) {
		if permission == "" {
			continue
		}
		if _, exists := seen[permission]; exists {
			continue
		}
		seen[permission] = struct{}{}
		permissions = append(permissions, permission)
	}
	return permissions
}

type VaultInput struct {
	Name         string `json:"name"`
	Type         string `json:"type"`
	Currency     string `json:"currency"`
	Description  string `json:"description"`
	OpeningMinor int64  `json:"openingMinor"`
	Privacy      string `json:"privacy"`
}

func (s *FinanceService) CreateVault(ctx context.Context, workspaceID, actorID string, input VaultInput) (*model.Vault, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermCreateVault); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 100 {
		return nil, &FieldError{Field: "name", Message: "must contain 1 to 100 characters"}
	}
	currency, err := validCurrency(input.Currency)
	if err != nil {
		return nil, err
	}
	if err := validateMoney("openingMinor", input.OpeningMinor, true); err != nil {
		return nil, err
	}
	privacy, err := validPrivacy(input.Privacy, "workspace")
	if err != nil {
		return nil, err
	}
	description, err := validatedText("description", input.Description, 0, 500)
	if err != nil {
		return nil, err
	}
	vaultType, err := validatedText("type", valueOrDefault(strings.ToLower(strings.TrimSpace(input.Type)), "custom"), 1, 50)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	vault := &model.Vault{
		ID: newID(), WorkspaceID: workspaceID, OwnerID: actorID, Name: name,
		Type:     vaultType,
		Currency: currency, Description: description,
		OpeningMinor: input.OpeningMinor, BalanceMinor: input.OpeningMinor, Privacy: privacy,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := s.insertWithAudit(
		ctx,
		"vaults",
		vault,
		newAuditEvent(workspaceID, actorID, "vault.created", "vault", vault.ID, map[string]any{"privacy": privacy}),
	); err != nil {
		return nil, err
	}
	return vault, nil
}

func (s *FinanceService) ListVaults(ctx context.Context, workspaceID, actorID string) ([]model.Vault, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewVault); err != nil {
		return nil, err
	}
	return s.visibleVaults(ctx, workspaceID, actorID)
}

func (s *FinanceService) visibleVaults(ctx context.Context, workspaceID, actorID string) ([]model.Vault, error) {
	var vaults []model.Vault
	filter := repository.Filter{
		"workspace_id": workspaceID, "archived": false,
		"$or": []repository.Filter{
			{"privacy": "workspace"},
			{"owner_id": actorID},
		},
	}
	if err := s.store.FindMany(ctx, "vaults", filter, &vaults, 0, 0, repository.Sort{"created_at": -1}); err != nil {
		return nil, err
	}
	return vaults, nil
}

type AccountInput struct {
	VaultID          string `json:"vaultId"`
	Name             string `json:"name"`
	BankName         string `json:"bankName"`
	Type             string `json:"type"`
	MaskedIdentifier string `json:"maskedIdentifier"`
	Currency         string `json:"currency"`
	OpeningMinor     int64  `json:"openingMinor"`
	Color            string `json:"color"`
	Icon             string `json:"icon"`
	Notes            string `json:"notes"`
	Status           string `json:"status"`
	ExcludeFromTotal bool   `json:"excludeFromTotal"`
	Privacy          string `json:"privacy"`
}

func (s *FinanceService) CreateAccount(ctx context.Context, workspaceID, actorID string, input AccountInput) (*model.Account, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditVault); err != nil {
		return nil, err
	}
	input.VaultID = strings.TrimSpace(input.VaultID)
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
	if currency != vault.Currency {
		return nil, &FieldError{Field: "currency", Message: "must match the vault currency"}
	}
	if err := validateMoney("openingMinor", input.OpeningMinor, true); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 100 {
		return nil, &FieldError{Field: "name", Message: "must contain 1 to 100 characters"}
	}
	privacy, err := validPrivacy(input.Privacy, vault.Privacy)
	if err != nil {
		return nil, err
	}
	if vault.Privacy != "workspace" {
		privacy = vault.Privacy
	}
	accountType, err := validatedText("type", valueOrDefault(strings.ToLower(strings.TrimSpace(input.Type)), "custom"), 1, 50)
	if err != nil {
		return nil, err
	}
	input, err = normalizeAccountMetadata(input, "active")
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	account := &model.Account{
		ID: newID(), WorkspaceID: workspaceID, VaultID: vault.ID, OwnerID: actorID,
		Name: name, BankName: input.BankName, Type: accountType, MaskedIdentifier: input.MaskedIdentifier,
		Currency: currency, OpeningMinor: input.OpeningMinor, BalanceMinor: input.OpeningMinor,
		Color: input.Color, Icon: input.Icon, Notes: input.Notes, Status: input.Status,
		ExcludeFromTotal: input.ExcludeFromTotal, Privacy: privacy, CreatedAt: now, UpdatedAt: now,
	}
	if err := s.insertWithAudit(
		ctx,
		"accounts",
		account,
		newAuditEvent(workspaceID, actorID, "account.created", "account", account.ID, nil),
	); err != nil {
		return nil, err
	}
	return account, nil
}

func (s *FinanceService) ListAccounts(ctx context.Context, workspaceID, actorID string) ([]model.Account, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewBalances); err != nil {
		return nil, err
	}
	vaultIDs, err := s.accessibleVaultIDsUnchecked(ctx, workspaceID, actorID)
	if err != nil {
		return nil, err
	}
	if len(vaultIDs) == 0 {
		return []model.Account{}, nil
	}
	return s.visibleAccounts(ctx, workspaceID, actorID, vaultIDs)
}
