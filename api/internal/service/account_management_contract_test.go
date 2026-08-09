package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

func TestAccountMetadataDefaultsStatusAndKeepsCurrentBalanceDerived(t *testing.T) {
	finance, _ := testFinance()

	created, err := finance.CreateAccount(context.Background(), "workspace-a", "user-a", AccountInput{
		VaultID:          "vault-a",
		Name:             "Axis savings",
		Type:             "savings",
		Currency:         "INR",
		OpeningMinor:     125_000,
		BankName:         "Axis Bank",
		MaskedIdentifier: "**** 1234",
		Color:            "#1976d2",
		Icon:             "landmark",
		Notes:            "Emergency reserve",
	})
	if err != nil {
		t.Fatalf("CreateAccount() error = %v", err)
	}
	if created.Status != "active" {
		t.Fatalf("status = %q, want active", created.Status)
	}
	if created.BalanceMinor != created.OpeningMinor || created.BalanceMinor != 125_000 {
		t.Fatalf("derived balance = %d for opening %d, want 125000", created.BalanceMinor, created.OpeningMinor)
	}
	if created.BankName != "Axis Bank" || created.MaskedIdentifier != "**** 1234" ||
		created.Color != "#1976d2" || created.Icon != "landmark" || created.Notes != "Emergency reserve" {
		t.Fatalf("account metadata = %#v", created)
	}
}

func TestExistingAccountsWithEmptyStatusReadAsActive(t *testing.T) {
	finance, store := newRecordActionService()
	store.accounts["account-a"] = model.Account{
		ID: "account-a", WorkspaceID: "workspace-a", VaultID: "vault-a", OwnerID: "owner-a",
		Name: "Legacy account", Type: "checking", Currency: "INR", Privacy: "workspace",
	}

	account, err := finance.GetAccount(context.Background(), "workspace-a", "owner-a", "account-a")
	if err != nil {
		t.Fatalf("GetAccount() error = %v", err)
	}
	if account.Status != "active" {
		t.Fatalf("legacy account status = %q, want active", account.Status)
	}
}

func TestUpdateAccountPersistsMetadataAndRebasesDerivedBalance(t *testing.T) {
	finance, store := newRecordActionService()
	store.accounts["account-a"] = model.Account{
		ID: "account-a", WorkspaceID: "workspace-a", VaultID: "vault-a", OwnerID: "owner-a",
		Name: "Old account", Type: "checking", Currency: "INR", OpeningMinor: 1_000,
		BalanceMinor: 5_000, Privacy: "workspace", Status: "active",
	}
	store.vaults["vault-a"] = model.Vault{
		ID: "vault-a", WorkspaceID: "workspace-a", OwnerID: "owner-a", Currency: "INR",
		Privacy: "workspace", BalanceMinor: 5_000,
	}

	updated, err := finance.UpdateAccount(context.Background(), "workspace-a", "owner-a", "account-a", AccountInput{
		Name:             "Household savings",
		Type:             "savings",
		Currency:         "INR",
		OpeningMinor:     1_500,
		BankName:         "State Bank",
		MaskedIdentifier: "**** 9988",
		Color:            "#7c3aed",
		Icon:             "building-2",
		Notes:            "Joint household account",
		Status:           "inactive",
		Privacy:          "workspace",
	})
	if err != nil {
		t.Fatalf("UpdateAccount() error = %v", err)
	}
	if updated.BalanceMinor != 5_500 || updated.OpeningMinor != 1_500 {
		t.Fatalf("updated balances = opening %d current %d, want opening 1500 current 5500", updated.OpeningMinor, updated.BalanceMinor)
	}
	if updated.Status != "inactive" || updated.BankName != "State Bank" || updated.MaskedIdentifier != "**** 9988" ||
		updated.Color != "#7c3aed" || updated.Icon != "building-2" || updated.Notes != "Joint household account" {
		t.Fatalf("updated account metadata = %#v", updated)
	}
	if stored := store.accounts["account-a"]; stored.BalanceMinor != 5_500 || stored.Status != "inactive" {
		t.Fatalf("stored account = %#v", stored)
	}
}

func TestCreateTransactionRejectsInactiveAccount(t *testing.T) {
	finance, store := testFinance()
	inactive := store.accounts["account-a"]
	inactive.Status = "inactive"
	store.accounts["account-a"] = inactive

	_, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "inactive-account-transaction", TransactionInput{
		VaultID: "vault-a", AccountID: "account-a", Type: "expense", AmountMinor: 500,
		Currency: "INR", OccurredAt: time.Date(2030, time.January, 1, 0, 0, 0, 0, time.UTC),
	})
	var fieldErr *FieldError
	if !errors.As(err, &fieldErr) || fieldErr.Field != "accountId" {
		t.Fatalf("CreateTransaction() error = %v, want accountId validation error", err)
	}
}

func TestAccountUpdateAndArchiveRequireTheirPermissions(t *testing.T) {
	finance, store := newRecordActionService()

	_, updateErr := finance.UpdateAccount(context.Background(), "workspace-a", "member-a", "account-a", AccountInput{
		Name: "Not allowed", Type: "cash", Currency: "INR", Privacy: "workspace",
	})
	if !errors.Is(updateErr, ErrForbidden) {
		t.Fatalf("UpdateAccount() error = %v, want forbidden", updateErr)
	}
	archiveErr := finance.ArchiveAccount(context.Background(), "workspace-a", "member-a", "account-a")
	if !errors.Is(archiveErr, ErrForbidden) {
		t.Fatalf("ArchiveAccount() error = %v, want forbidden", archiveErr)
	}
	if store.accounts["account-a"].Archived || len(store.audits) != 0 {
		t.Fatalf("unauthorized account mutation changed store: account=%#v audits=%#v", store.accounts["account-a"], store.audits)
	}
}
