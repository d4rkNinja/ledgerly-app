package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

// SeedDevelopment creates deterministic, realistic demonstration records.
// The caller must prevent this function from running in production.
func SeedDevelopment(ctx context.Context, store repository.Store) error {
	passwordHash, err := hashPassword("MoneyTracking!2026")
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	users := []model.User{
		{ID: "dev-user-ananya", Email: "ananya@example.test", Name: "Ananya Sharma", Locale: "en-IN", PreferredCurrency: "INR"},
		{ID: "dev-user-rohan", Email: "rohan@example.test", Name: "Rohan Sharma", Locale: "en-IN", PreferredCurrency: "INR"},
		{ID: "dev-user-meera", Email: "meera@example.test", Name: "Meera Sharma", Locale: "hi-IN", PreferredCurrency: "INR"},
		{ID: "dev-user-arjun", Email: "arjun@example.test", Name: "Arjun Mehta", Locale: "en-IN", PreferredCurrency: "INR"},
		{ID: "dev-user-sana", Email: "sana@example.test", Name: "Sana Khan", Locale: "en-IN", PreferredCurrency: "INR"},
	}
	for i := range users {
		users[i].PasswordHash = passwordHash
		users[i].EmailVerified = true
		users[i].CreatedAt, users[i].UpdatedAt = now, now
		if err := insertSeed(ctx, store, "users", &users[i]); err != nil {
			return err
		}
	}
	workspaces := []model.Workspace{
		{ID: "dev-ws-personal", Name: "Ananya Personal", Type: "personal", Currency: "INR", FinancialMonth: 1, OwnerID: users[0].ID, CreatedAt: now, UpdatedAt: now},
		{ID: "dev-ws-family", Name: "Sharma Family", Type: "family", Currency: "INR", FinancialMonth: 1, OwnerID: users[0].ID, CreatedAt: now, UpdatedAt: now},
		{ID: "dev-ws-office", Name: "Northstar Studio", Type: "office", Currency: "INR", FinancialMonth: 1, OwnerID: users[3].ID, CreatedAt: now, UpdatedAt: now},
	}
	for i := range workspaces {
		if err := insertSeed(ctx, store, "workspaces", &workspaces[i]); err != nil {
			return err
		}
	}
	memberships := []model.Membership{
		{ID: "dev-member-personal", WorkspaceID: workspaces[0].ID, UserID: users[0].ID, Role: "owner"},
		{ID: "dev-member-family-owner", WorkspaceID: workspaces[1].ID, UserID: users[0].ID, Role: "owner"},
		{ID: "dev-member-family-member", WorkspaceID: workspaces[1].ID, UserID: users[1].ID, Role: "member", Relationship: "partner"},
		{ID: "dev-member-family-viewer", WorkspaceID: workspaces[1].ID, UserID: users[2].ID, Role: "viewer", Relationship: "parent"},
		{ID: "dev-member-office-owner", WorkspaceID: workspaces[2].ID, UserID: users[3].ID, Role: "owner"},
		{ID: "dev-member-office-finance", WorkspaceID: workspaces[2].ID, UserID: users[4].ID, Role: "finance_manager"},
	}
	for i := range memberships {
		memberships[i].CreatedAt = now
		if err := insertSeed(ctx, store, "memberships", &memberships[i]); err != nil {
			return err
		}
		var updated map[string]any
		if err := store.UpdateOne(
			ctx,
			"memberships",
			repository.Filter{"_id": memberships[i].ID},
			repository.Filter{"$unset": repository.Filter{"permissions": ""}},
			&updated,
		); err != nil {
			return fmt.Errorf("backfill seed membership permissions: %w", err)
		}
	}
	vaults := []model.Vault{
		{ID: "dev-vault-private", WorkspaceID: workspaces[0].ID, OwnerID: users[0].ID, Name: "Private Reserve", Type: "personal", Currency: "INR", OpeningMinor: 3824500, BalanceMinor: 3824500, Privacy: "private"},
		{ID: "dev-vault-household", WorkspaceID: workspaces[1].ID, OwnerID: users[0].ID, Name: "Household", Type: "household", Currency: "INR", OpeningMinor: 1009600, BalanceMinor: 945300, Privacy: "workspace"},
		{ID: "dev-vault-emergency", WorkspaceID: workspaces[1].ID, OwnerID: users[0].ID, Name: "Emergency Fund", Type: "emergency_fund", Currency: "INR", OpeningMinor: 5720000, BalanceMinor: 5720000, Privacy: "workspace"},
		{ID: "dev-vault-travel", WorkspaceID: workspaces[1].ID, OwnerID: users[1].ID, Name: "Japan Trip", Type: "travel", Currency: "INR", OpeningMinor: 1780000, BalanceMinor: 1780000, Privacy: "workspace"},
		{ID: "dev-vault-petty", WorkspaceID: workspaces[2].ID, OwnerID: users[3].ID, Name: "Studio Petty Cash", Type: "office_petty_cash", Currency: "INR", OpeningMinor: 415900, BalanceMinor: 186400, Privacy: "workspace"},
		{ID: "dev-vault-project", WorkspaceID: workspaces[2].ID, OwnerID: users[3].ID, Name: "Aurora Project", Type: "project_expense", Currency: "INR", OpeningMinor: 1396225, BalanceMinor: 1460000, Privacy: "workspace"},
	}
	for i := range vaults {
		vaults[i].CreatedAt, vaults[i].UpdatedAt = now, now
		if err := insertSeed(ctx, store, "vaults", &vaults[i]); err != nil {
			return err
		}
		if err := backfillSeedOpeningBalance(ctx, store, "vaults", vaults[i].ID, vaults[i].OpeningMinor); err != nil {
			return err
		}
	}
	accounts := []model.Account{
		{ID: "dev-account-bank", WorkspaceID: workspaces[0].ID, VaultID: vaults[0].ID, OwnerID: users[0].ID, Name: "Everyday Savings", Type: "savings", Currency: "INR", OpeningMinor: 3824500, BalanceMinor: 3824500, Privacy: "private"},
		{ID: "dev-account-family", WorkspaceID: workspaces[1].ID, VaultID: vaults[1].ID, OwnerID: users[0].ID, Name: "Joint Current", Type: "current", Currency: "INR", OpeningMinor: 1009600, BalanceMinor: 945300, Privacy: "workspace"},
		{ID: "dev-account-emergency", WorkspaceID: workspaces[1].ID, VaultID: vaults[2].ID, OwnerID: users[0].ID, Name: "Emergency Savings", Type: "savings", Currency: "INR", OpeningMinor: 5720000, BalanceMinor: 5720000, Privacy: "workspace"},
		{ID: "dev-account-travel", WorkspaceID: workspaces[1].ID, VaultID: vaults[3].ID, OwnerID: users[1].ID, Name: "Travel Wallet", Type: "digital_wallet", Currency: "INR", OpeningMinor: 1780000, BalanceMinor: 1780000, Privacy: "workspace"},
		{ID: "dev-account-cash", WorkspaceID: workspaces[2].ID, VaultID: vaults[4].ID, OwnerID: users[3].ID, Name: "Office Cash Box", Type: "cash", Currency: "INR", OpeningMinor: 415900, BalanceMinor: 186400, Privacy: "workspace"},
		{ID: "dev-account-project", WorkspaceID: workspaces[2].ID, VaultID: vaults[5].ID, OwnerID: users[3].ID, Name: "Project Card", Type: "credit_card", Currency: "INR", OpeningMinor: 1396225, BalanceMinor: 1460000, Privacy: "workspace"},
	}
	for i := range accounts {
		accounts[i].CreatedAt, accounts[i].UpdatedAt = now, now
		if err := insertSeed(ctx, store, "accounts", &accounts[i]); err != nil {
			return err
		}
		if err := backfillSeedOpeningBalance(ctx, store, "accounts", accounts[i].ID, accounts[i].OpeningMinor); err != nil {
			return err
		}
	}
	merchants := []string{"Green Basket", "Metro Energy", "City Pharmacy", "Railway Kitchen", "Paper & Ink", "Cloud Workspace"}
	categories := []string{"Groceries", "Utilities", "Health", "Dining", "Office supplies", "Software"}
	for i := 0; i < 30; i++ {
		workspaceIndex := 1
		account := accounts[1]
		vault := vaults[1]
		actor := users[i%3].ID
		if i >= 20 {
			workspaceIndex, account, vault, actor = 2, accounts[4+i%2], vaults[4+i%2], users[3+i%2].ID
		}
		tx := &model.Transaction{
			ID: fmt.Sprintf("dev-tx-%02d", i+1), WorkspaceID: workspaces[workspaceIndex].ID,
			VaultID: vault.ID, AccountID: account.ID, CreatedBy: actor, Type: "expense",
			AmountMinor: int64(12900 + i*1375), Currency: "INR", Category: categories[i%len(categories)],
			Merchant: merchants[i%len(merchants)], Notes: "Development demonstration transaction",
			Privacy: "workspace", OccurredAt: now.AddDate(0, 0, -i), CreatedAt: now, UpdatedAt: now,
		}
		if i%9 == 0 {
			tx.Type = "income"
			tx.AmountMinor *= 5
		}
		if err := insertSeed(ctx, store, "transactions", tx); err != nil {
			return err
		}
	}
	for i, name := range []string{"Household Essentials", "Dining Out", "Studio Operations", "Aurora Delivery"} {
		workspaceID := workspaces[1+i/2].ID
		budget := &model.Budget{ID: fmt.Sprintf("dev-budget-%d", i+1), WorkspaceID: workspaceID, Name: name, AmountMinor: int64(800000 + i*250000), Currency: "INR", Period: "monthly", StartAt: now.AddDate(0, 0, -20), EndAt: now.AddDate(0, 1, 10), CreatedBy: workspaces[1+i/2].OwnerID, CreatedAt: now, UpdatedAt: now}
		if err := insertSeed(ctx, store, "budgets", budget); err != nil {
			return err
		}
	}
	for i, name := range []string{"Emergency Cushion", "Japan Rail Pass", "New Studio Cameras", "Team Retreat"} {
		workspaceID := workspaces[1+i/2].ID
		goal := &model.Goal{ID: fmt.Sprintf("dev-goal-%d", i+1), WorkspaceID: workspaceID, Name: name, TargetMinor: int64(3000000 + i*1000000), CurrentMinor: int64(1200000 + i*250000), Currency: "INR", Visibility: "workspace", CreatedBy: workspaces[1+i/2].OwnerID, CreatedAt: now, UpdatedAt: now}
		if err := insertSeed(ctx, store, "goals", goal); err != nil {
			return err
		}
	}
	invitation := &model.Invitation{ID: "dev-invite-pending", WorkspaceID: workspaces[2].ID, InviterID: users[3].ID, Email: "vikram@example.test", Role: "member", TokenHash: "development-token-not-usable", Status: "pending", ExpiresAt: now.Add(72 * time.Hour), CreatedAt: now}
	if err := insertSeed(ctx, store, "invitations", invitation); err != nil {
		return err
	}
	claims := []model.ExpenseClaim{
		{ID: "dev-claim-pending", WorkspaceID: workspaces[2].ID, VaultID: vaults[5].ID, SubmittedBy: users[4].ID, AmountMinor: 186500, Currency: "INR", Description: "Client workshop materials", Status: "pending", ReimbursementStatus: "not_reimbursed", CreatedAt: now, UpdatedAt: now},
		{ID: "dev-claim-reimbursed", WorkspaceID: workspaces[2].ID, VaultID: vaults[5].ID, SubmittedBy: users[4].ID, AmountMinor: 94000, Currency: "INR", Description: "Airport transfer for client visit", Status: "approved", ReimbursementStatus: "reimbursed", ApprovedBy: users[3].ID, CreatedAt: now.Add(-48 * time.Hour), UpdatedAt: now},
	}
	for i := range claims {
		if err := insertSeed(ctx, store, "expense_claims", &claims[i]); err != nil {
			return err
		}
	}
	for i := 0; i < 6; i++ {
		notification := &model.Notification{ID: fmt.Sprintf("dev-notification-%d", i+1), UserID: users[i%len(users)].ID, WorkspaceID: workspaces[1+i%2].ID, Type: "budget_threshold", Title: "Budget update", Message: "A shared budget has new activity.", CreatedAt: now.Add(time.Duration(-i) * time.Hour)}
		if err := insertSeed(ctx, store, "notifications", notification); err != nil {
			return err
		}
		audit := &model.AuditEvent{ID: fmt.Sprintf("dev-audit-%d", i+1), WorkspaceID: workspaces[1+i%2].ID, ActorID: users[i%len(users)].ID, Action: "development.seeded", EntityType: "workspace", EntityID: workspaces[1+i%2].ID, CreatedAt: now.Add(time.Duration(-i) * time.Hour)}
		if err := insertSeed(ctx, store, "audit_events", audit); err != nil {
			return err
		}
	}
	for i, title := range []string{"Apartment rent", "Electricity bill", "Design software", "Family contribution"} {
		workspace := workspaces[1+i/2]
		vaultID := vaults[1].ID
		if i >= 2 {
			vaultID = vaults[4].ID
		}
		recordID := fmt.Sprintf("dev-recurring-%d", i+1)
		record := map[string]any{
			"_id": recordID, "workspace_id": workspace.ID, "vault_id": vaultID,
			"owner_id": workspace.OwnerID, "privacy": "workspace", "active": true,
			"title": title, "amount_minor": int64(250000 + i*75000), "currency": "INR",
			"frequency": "monthly", "next_due_at": now.AddDate(0, 0, 5+i), "created_at": now,
		}
		if err := insertSeed(ctx, store, "recurring_transactions", record); err != nil {
			return err
		}
		// Older development databases contain these deterministic rows without
		// authorization metadata. Backfill only that metadata so the fail-closed
		// bills query remains useful after upgrading an existing local database.
		var updated map[string]any
		if err := store.UpdateOne(
			ctx,
			"recurring_transactions",
			repository.Filter{"_id": recordID},
			repository.Filter{"$set": repository.Filter{
				"workspace_id": workspace.ID,
				"vault_id":     vaultID,
				"owner_id":     workspace.OwnerID,
				"privacy":      "workspace",
				"active":       true,
			}},
			&updated,
		); err != nil {
			return fmt.Errorf("backfill recurring transaction authorization: %w", err)
		}
	}
	return nil
}

func insertSeed(ctx context.Context, store repository.Store, collection string, document any) error {
	if err := store.Insert(ctx, collection, document); err != nil && !errors.Is(err, repository.ErrConflict) {
		return fmt.Errorf("seed %s: %w", collection, err)
	}
	return nil
}

func backfillSeedOpeningBalance(
	ctx context.Context,
	store repository.Store,
	collection,
	id string,
	openingMinor int64,
) error {
	var updated map[string]any
	if err := store.UpdateOne(
		ctx,
		collection,
		repository.Filter{"_id": id},
		repository.Filter{"$set": repository.Filter{"opening_minor": openingMinor}},
		&updated,
	); err != nil {
		return fmt.Errorf("backfill %s opening balance: %w", collection, err)
	}
	return nil
}
