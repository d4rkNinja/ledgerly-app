package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"io"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

func TestExportWorkspaceCSVUsesTransactionDisplayColumnsAndEscapesValues(t *testing.T) {
	finance, store := testFinance()
	store.membership.Role = "administrator"
	store.accounts["account-secret"] = model.Account{
		ID: "account-secret", WorkspaceID: "workspace-a", VaultID: "vault-a",
		Name: "Everyday, Account", Currency: "INR", Privacy: "workspace",
	}
	store.transactions = []model.Transaction{
		{
			ID: "transaction-secret", TransactionID: "0025", SequenceScope: "expense",
			WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-secret",
			CreatedBy: "user-b", Type: "expense", AmountMinor: 1200, Currency: "INR",
			Category: "Food, \"Home", Merchant: "Cafe, \"One\"", Notes: "line one\nline \"two\"",
			Description: "Team lunch", Contact: &model.ContactSummary{Name: "Mira Rao"},
			Privacy:    "workspace",
			OccurredAt: time.Date(2026, time.July, 24, 8, 15, 0, 0, time.FixedZone("IST", 19800)),
			CreatedAt:  time.Date(2026, time.July, 24, 9, 0, 0, 0, time.FixedZone("IST", 19800)),
			UpdatedAt:  time.Date(2026, time.July, 24, 9, 30, 0, 0, time.FixedZone("IST", 19800)),
		},
		{
			ID: "former-transaction", TransactionID: "0024", SequenceScope: "expense",
			WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
			CreatedBy: "former-user", Type: "expense", AmountMinor: 300, Currency: "INR",
			Category: "Travel", Merchant: "Old entry", Privacy: "workspace",
			OccurredAt: time.Date(2026, time.July, 23, 8, 15, 0, 0, time.UTC),
		},
	}

	content, filename, err := finance.ExportWorkspaceCSV(context.Background(), "workspace-a", "user-a")
	if err != nil {
		t.Fatalf("ExportWorkspaceCSV: %v", err)
	}
	if !strings.HasPrefix(filename, "ledgerly-transactions-") || !strings.HasSuffix(filename, ".csv") {
		t.Fatalf("filename = %q, want ledgerly transaction export filename", filename)
	}
	if !bytes.HasPrefix(content, []byte{0xEF, 0xBB, 0xBF}) {
		t.Fatal("CSV is missing a UTF-8 BOM")
	}

	reader := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(content, []byte{0xEF, 0xBB, 0xBF})))
	rows, err := readAllCSV(reader)
	if err != nil {
		t.Fatalf("read CSV: %v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("CSV rows = %d, want header plus two transactions", len(rows))
	}
	if !reflect.DeepEqual(rows[0], transactionExportHeaders) {
		t.Fatalf("headers = %#v, want %#v", rows[0], transactionExportHeaders)
	}
	if rows[1][0] != "0025" || rows[1][1] != "expense" || rows[1][6] != "12.00" || rows[1][11] != "2026-07-24" {
		t.Fatalf("first transaction row = %#v", rows[1])
	}
	if rows[1][3] != "Mira Rao" || rows[1][9] != "Everyday, Account" {
		t.Fatalf("display names missing from row = %#v", rows[1])
	}

	joined := string(content)
	for _, sensitive := range []string{"transaction-secret", "account-secret", "vault-a", "createdBy", "password_hash"} {
		if strings.Contains(joined, sensitive) {
			t.Fatalf("CSV leaked storage value %q:\n%s", sensitive, joined)
		}
	}
	for _, expected := range []string{
		"\"Cafe, \"\"One\"\"\"",
		"\"line one\nline \"\"two\"\"\"",
		"Food, \"\"Home",
	} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("CSV missing escaped value %q:\n%s", expected, joined)
		}
	}
}

func TestExportWorkspaceCSVUsesSharedFiltersAndSelectedMonthFilename(t *testing.T) {
	finance, store := testFinance()
	store.membership.Role = "administrator"
	store.transactions = []model.Transaction{{
		ID: "matching", TransactionID: "0025", SequenceScope: "expense",
		WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
		CreatedBy: "user-a", Type: "expense", AmountMinor: 1250, Currency: "INR",
		Category: "Food", Merchant: "Lunch", Privacy: "workspace",
		OccurredAt: time.Date(2026, time.July, 18, 0, 0, 0, 0, time.UTC),
	}}
	from := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)
	to := from.AddDate(0, 1, 0)
	minimum, maximum := int64(1000), int64(2000)

	_, filename, err := finance.ExportWorkspaceCSV(
		context.Background(),
		"workspace-a",
		"user-a",
		ExportFilter(TransactionFilter{
			TransactionID:  "0025",
			Type:           "expense",
			Category:       "Food",
			MinAmountMinor: &minimum,
			MaxAmountMinor: &maximum,
			From:           &from,
			To:             &to,
		}),
	)
	if err != nil {
		t.Fatalf("ExportWorkspaceCSV: %v", err)
	}
	if filename != "ledgerly-transactions-2026-07.csv" {
		t.Fatalf("filename = %q", filename)
	}

	query := store.filters["transactions"]
	amountFilter := nestedTransactionFilter(query, "amount_minor")
	amount, ok := amountFilter["amount_minor"].(repository.Filter)
	if !ok || amount["$gte"] != minimum || amount["$lte"] != maximum {
		t.Fatalf("amount filter = %#v", amountFilter)
	}
	typeFilter := nestedTransactionFilter(query, "type")
	wantTypes := []string{"expense", "adjustment"}
	projectedTypes, ok := typeFilter["type"].(repository.Filter)
	if !ok {
		t.Fatalf("type filter = %#v", typeFilter)
	}
	typeValues, ok := projectedTypes["$in"].([]string)
	if !ok || !reflect.DeepEqual(typeValues, wantTypes) {
		t.Fatalf("type filter = %#v", typeFilter)
	}
	categoryFilter := nestedTransactionFilter(query, "category")
	if categoryFilter["category"] != "Food" {
		t.Fatalf("category filter = %#v", categoryFilter)
	}
	identifierFilter := nestedTransactionFilter(query, "transaction_id")
	if identifierFilter["transaction_id"] != "0025" {
		t.Fatalf("transaction ID filter = %#v", identifierFilter)
	}
}

func TestExportWorkspaceCSVDerivesSplitTypeFromCurrentSplits(t *testing.T) {
	finance, store := testFinance()
	store.membership.Role = "administrator"
	store.transactions = []model.Transaction{
		{
			ID: "former-split", TransactionID: "0025", SequenceScope: model.TransactionSequenceSplit,
			WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
			CreatedBy: "user-a", Type: "expense", AmountMinor: 1250, Currency: "INR",
			Category: "General", Privacy: "workspace",
		},
		{
			ID: "current-split", TransactionID: "0026", SequenceScope: model.TransactionSequenceIncome,
			WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
			CreatedBy: "user-a", Type: "income", AmountMinor: 1250, Currency: "INR",
			Category: "Shared income", Privacy: "workspace",
			Splits: []model.Split{{UserID: "user-a", AmountMinor: 1250}},
		},
	}

	content, _, err := finance.ExportWorkspaceCSV(context.Background(), "workspace-a", "user-a")
	if err != nil {
		t.Fatalf("ExportWorkspaceCSV: %v", err)
	}
	reader := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(content, []byte{0xEF, 0xBB, 0xBF})))
	rows, err := readAllCSV(reader)
	if err != nil {
		t.Fatalf("read CSV: %v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("CSV rows = %d, want 3", len(rows))
	}
	byID := map[string][]string{rows[1][0]: rows[1], rows[2][0]: rows[2]}
	if got := byID["0025"][1]; got != "expense" {
		t.Fatalf("cleared split type = %q, want expense", got)
	}
	if got := byID["0026"][1]; got != model.TransactionSequenceSplit {
		t.Fatalf("current split type = %q, want split", got)
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
