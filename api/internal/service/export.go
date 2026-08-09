package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const workspaceExportCSVDateFormat = "2006-01-02"

var workspaceExportHeaders = []string{
	"section",
	"record_type",
	"name",
	"email",
	"role",
	"permissions",
	"status",
	"joined_at",
	"workspace_type",
	"financial_month_start",
	"created_at",
	"updated_at",
	"occurred_at",
	"merchant",
	"category",
	"transaction_type",
	"amount_minor",
	"currency",
	"notes",
	"creator_name",
	"creator_status",
	"record_count",
	"description",
	"contact_name",
	"contact_phone",
	"contact_email",
}

// ExportFilter narrows transaction and category rows to a UTC half-open date
// range. Workspace and member rows remain present because they describe the
// workspace that owns the export rather than transactions in the date range.
type ExportFilter = DateRange

// ExportWorkspaceCSV returns a display-only export for the records the actor
// can access in the workspace. It deliberately writes from allowlisted
// columns instead of marshaling storage models, keeping identifiers and
// authentication material out of the file even when a model grows new fields.
func (s *FinanceService) ExportWorkspaceCSV(ctx context.Context, workspaceID, actorID string, filters ...ExportFilter) ([]byte, string, error) {
	membership, err := s.access.Require(ctx, workspaceID, actorID, model.PermExportData)
	if err != nil {
		return nil, "", err
	}
	dateRange := DateRange{}
	if len(filters) > 0 {
		dateRange = filters[0]
	}
	dateRange, err = normalizeDateRange(dateRange)
	if err != nil {
		return nil, "", err
	}
	workspace, err := s.requireWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, "", err
	}

	rows := make([][]string, 0)
	rows = append(rows, exportRow(
		"workspace", "workspace", workspace.Name, "", "", "", "", "",
		workspace.Type, fmt.Sprintf("%d", workspace.FinancialMonth),
		formatExportTime(workspace.CreatedAt), formatExportTime(workspace.UpdatedAt),
		"", "", "", "", "", workspace.Currency, "", "", "", "",
	))

	if hasPermission(*membership, model.PermViewWorkspace) {
		members, err := s.ListWorkspaceMembers(ctx, workspaceID, actorID)
		if err != nil {
			return nil, "", err
		}
		for _, member := range members {
			rows = append(rows, exportRow(
				"members", "member", member.Name, member.Email, member.Role,
				strings.Join(member.Permissions, " "), member.Status,
				formatExportTime(member.JoinedAt), "", "", "", "", "", "", "", "", "", "", "", "", "", "",
			))
		}
	}

	if hasPermission(*membership, model.PermViewTransactions) {
		transactions, err := s.exportTransactions(ctx, workspaceID, actorID, dateRange)
		if err != nil {
			return nil, "", err
		}
		categoryTotals := make(map[string]int64)
		categoryCounts := make(map[string]int64)
		for _, transaction := range transactions {
			creatorName, creatorStatus := "", ""
			if transaction.Creator != nil {
				creatorName = transaction.Creator.Name
				creatorStatus = transaction.Creator.Status
			}
			contactName, contactPhone, contactEmail := "", "", ""
			if transaction.Contact != nil {
				contactName, contactPhone, contactEmail = transaction.Contact.Name, transaction.Contact.Phone, transaction.Contact.Email
			}
			rows = append(rows, exportRow(
				"transactions", "transaction", "", "", "", "", "", "", "", "",
				formatExportTime(transaction.CreatedAt), formatExportTime(transaction.UpdatedAt),
				formatExportTime(effectiveTransactionDate(transaction)), transaction.Merchant,
				transaction.Category, transaction.Type, fmt.Sprintf("%d", transaction.AmountMinor),
				transaction.Currency, transaction.Notes, creatorName, creatorStatus, "", transaction.Description, contactName, contactPhone, contactEmail,
			))
			if transaction.Type == "expense" {
				category := valueOrDefault(strings.TrimSpace(transaction.Category), "Uncategorised")
				categoryTotals[category], err = checkedAddMoney(categoryTotals[category], transaction.AmountMinor)
				if err != nil {
					return nil, "", err
				}
				categoryCounts[category]++
			}
		}

		categories := make([]string, 0, len(categoryTotals))
		for category := range categoryTotals {
			categories = append(categories, category)
		}
		sort.Strings(categories)
		for _, category := range categories {
			rows = append(rows, exportRow(
				"categories", "category", category, "", "", "", "", "", "", "", "", "", "", "",
				category, "expense", fmt.Sprintf("%d", categoryTotals[category]), workspace.Currency,
				"", "", "", fmt.Sprintf("%d", categoryCounts[category]),
			))
		}
	}

	var output bytes.Buffer
	writer := csv.NewWriter(&output)
	if err := writer.Write(workspaceExportHeaders); err != nil {
		return nil, "", err
	}
	for _, row := range rows {
		if err := writer.Write(row); err != nil {
			return nil, "", err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, "", err
	}

	filename := safeWorkspaceExportFilename(workspace.Name, time.Now().UTC())
	return output.Bytes(), filename, nil
}

func (s *FinanceService) exportTransactions(ctx context.Context, workspaceID, actorID string, dateRange DateRange) ([]model.Transaction, error) {
	filter, empty, err := s.transactionQuery(ctx, workspaceID, actorID, TransactionFilter{From: dateRange.From, To: dateRange.To})
	if err != nil {
		return nil, err
	}
	if empty {
		return []model.Transaction{}, nil
	}
	transactions := make([]model.Transaction, 0)
	if err := s.store.FindMany(
		ctx,
		"transactions",
		filter,
		&transactions,
		0,
		0,
		repository.Sort{"occurred_at": -1},
	); err != nil {
		return nil, err
	}
	if err := s.hydrateTransactionCreators(ctx, actorID, transactions); err != nil {
		return nil, err
	}
	if err := s.hydrateTransactionContacts(ctx, transactions); err != nil {
		return nil, err
	}
	return transactions, nil
}

func exportRow(values ...string) []string {
	row := make([]string, len(workspaceExportHeaders))
	copy(row, values)
	return row
}

func formatExportTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func safeWorkspaceExportFilename(name string, now time.Time) string {
	name = strings.ToLower(strings.TrimSpace(name))
	var builder strings.Builder
	separator := false
	for _, char := range name {
		if unicode.IsLetter(char) || unicode.IsDigit(char) {
			if separator && builder.Len() > 0 {
				builder.WriteByte('-')
			}
			builder.WriteRune(char)
			separator = false
			continue
		}
		separator = builder.Len() > 0
	}
	base := strings.Trim(builder.String(), "-")
	if base == "" {
		base = "workspace"
	}
	return fmt.Sprintf("%s-export-%s.csv", base, now.UTC().Format(workspaceExportCSVDateFormat))
}
