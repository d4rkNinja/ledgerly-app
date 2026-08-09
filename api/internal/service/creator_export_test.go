package service

import (
	"context"
	"encoding/csv"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

func TestExportWorkspaceCSVUsesDisplayColumnsAndEscapesValues(t *testing.T) {
	finance, store := testFinance()
	store.workspace.Name = "Family, " + "\"" + "Money"
	store.workspace.OwnerID = "owner-secret"
	store.membership.Role = "administrator"
	store.transactions = []model.Transaction{
		{
			ID: "transaction-secret", WorkspaceID: "workspace-a", VaultID: "vault-secret",
			AccountID: "account-secret", CreatedBy: "user-b", Type: "expense",
			AmountMinor: 1200, Currency: "INR", Category: "Food, " + "\"" + "Home",
			Merchant: "Cafe, " + "\"" + "One" + "\"", Notes: "line one\nline \"two\"",
			Privacy: "workspace", OccurredAt: time.Date(2026, time.July, 24, 8, 15, 0, 0, time.FixedZone("IST", 19800)),
			CreatedAt: time.Date(2026, time.July, 24, 9, 0, 0, 0, time.FixedZone("IST", 19800)),
			UpdatedAt: time.Date(2026, time.July, 24, 9, 30, 0, 0, time.FixedZone("IST", 19800)),
		},
		{
			ID: "former-transaction", WorkspaceID: "workspace-a", VaultID: "vault-a",
			AccountID: "account-a", CreatedBy: "former-user", Type: "expense",
			AmountMinor: 300, Currency: "INR", Category: "Travel", Merchant: "Old entry",
			Privacy: "workspace", OccurredAt: time.Date(2026, time.July, 23, 8, 15, 0, 0, time.UTC),
		},
	}

	content, filename, err := finance.ExportWorkspaceCSV(context.Background(), "workspace-a", "user-a")
	if err != nil {
		t.Fatalf("ExportWorkspaceCSV: %v", err)
	}
	if !strings.HasPrefix(filename, "family-money-export-") || !strings.HasSuffix(filename, ".csv") {
		t.Fatalf("filename = %q, want sanitized workspace export filename", filename)
	}

	reader := csv.NewReader(strings.NewReader(string(content)))
	rows, err := readAllCSV(reader)
	if err != nil {
		t.Fatalf("read CSV: %v", err)
	}
	if len(rows) < 5 {
		t.Fatalf("CSV rows = %d, want header plus workspace/member/transaction/category rows", len(rows))
	}
	if got := rows[0][0]; got != "section" {
		t.Fatalf("header first field = %q, want section", got)
	}

	joined := string(content)
	for _, sensitive := range []string{"transaction-secret", "vault-secret", "account-secret", "owner-secret", "password_hash", "createdBy"} {
		if strings.Contains(joined, sensitive) {
			t.Fatalf("CSV leaked sensitive value %q:\n%s", sensitive, joined)
		}
	}
	for _, expected := range []string{
		"workspace",
		"members",
		"transactions",
		"categories",
		"Ben Ortiz",
		"Former member",
		"2026-07-24T02:45:00Z",
		"\"Cafe, \"\"One\"\"\"",
		"\"line one\nline \"\"two\"\"\"",
	} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("CSV missing %q:\n%s", expected, joined)
		}
	}
}

func TestExportWorkspaceCSVRequiresExportPermission(t *testing.T) {
	finance, store := testFinance()
	store.membership.Role = "member"

	if _, _, err := finance.ExportWorkspaceCSV(context.Background(), "workspace-a", "user-a"); err != ErrForbidden {
		t.Fatalf("ExportWorkspaceCSV error = %v, want forbidden", err)
	}
}

func readAllCSV(reader *csv.Reader) ([][]string, error) {
	rows := make([][]string, 0)
	for {
		row, err := reader.Read()
		if err == io.EOF {
			return rows, nil
		}
		if err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
}
