package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const transactionExportDateFormat = "2006-01-02"

var transactionExportHeaders = []string{
	"Transaction ID",
	"Transaction Type",
	"Name",
	"Contact",
	"Description",
	"Notes",
	"Amount",
	"Currency",
	"Category",
	"Account",
	"Destination Account",
	"Transaction Date",
	"Created At",
	"Updated At",
}

// ExportFilter deliberately shares the transaction-list filter contract. The
// export route parses the same query once, so downloaded rows cannot drift
// from the active transaction filters in the client.
type ExportFilter TransactionFilter

// ExportWorkspaceCSV returns only permission-scoped transactions. Columns are
// explicitly allowlisted and use display values; storage identifiers are never
// substituted for the user-facing transaction number, account, or contact.
func (s *FinanceService) ExportWorkspaceCSV(
	ctx context.Context,
	workspaceID, actorID string,
	filters ...ExportFilter,
) ([]byte, string, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermExportData); err != nil {
		return nil, "", err
	}
	filter := TransactionFilter{}
	if len(filters) > 0 {
		filter = TransactionFilter(filters[0])
	}
	// Pagination controls are never accepted by an export. Every accessible row
	// matching the semantic filters is written exactly once.
	filter.Limit = 0
	filter.Skip = 0

	transactions, err := s.exportTransactions(ctx, workspaceID, actorID, filter)
	if err != nil {
		return nil, "", err
	}
	accountNames, err := s.exportAccountNames(ctx, workspaceID, transactions)
	if err != nil {
		return nil, "", err
	}

	var output bytes.Buffer
	// A UTF-8 BOM keeps non-ASCII names and currency-adjacent text readable in
	// spreadsheet programs that otherwise guess a legacy Windows encoding.
	output.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(&output)
	if err := writer.Write(transactionExportHeaders); err != nil {
		return nil, "", err
	}
	for _, transaction := range transactions {
		contactName := ""
		if transaction.Contact != nil {
			contactName = strings.TrimSpace(transaction.Contact.Name)
		}
		destinationName := accountNames[transaction.DestinationAccountID]
		name := strings.TrimSpace(transaction.Merchant)
		if name == "" && transaction.Type == "transfer" && destinationName != "" {
			name = "Transfer to " + destinationName
		}
		if name == "" {
			name = friendlyTransactionType(transaction.Type)
		}
		transactionType := strings.TrimSpace(transaction.Type)
		if len(transaction.Splits) > 0 {
			transactionType = model.TransactionSequenceSplit
		}
		row := []string{
			transaction.TransactionID,
			transactionType,
			name,
			contactName,
			strings.TrimSpace(transaction.Description),
			strings.TrimSpace(transaction.Notes),
			formatMajorAmount(transaction.AmountMinor),
			transaction.Currency,
			strings.TrimSpace(transaction.Category),
			accountNames[transaction.AccountID],
			destinationName,
			formatExportDate(effectiveTransactionDate(transaction)),
			formatExportTimestamp(transaction.CreatedAt),
			formatExportTimestamp(transaction.UpdatedAt),
		}
		if err := writer.Write(row); err != nil {
			return nil, "", err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, "", err
	}

	return output.Bytes(), transactionExportFilename(filter, time.Now().UTC()), nil
}

func (s *FinanceService) exportTransactions(
	ctx context.Context,
	workspaceID, actorID string,
	filter TransactionFilter,
) ([]model.Transaction, error) {
	query, empty, err := s.transactionQuery(ctx, workspaceID, actorID, filter)
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
		query,
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

func (s *FinanceService) exportAccountNames(
	ctx context.Context,
	workspaceID string,
	transactions []model.Transaction,
) (map[string]string, error) {
	ids := make([]string, 0, len(transactions)*2)
	seen := make(map[string]struct{}, len(transactions)*2)
	for _, transaction := range transactions {
		for _, id := range []string{transaction.AccountID, transaction.DestinationAccountID} {
			if id == "" {
				continue
			}
			if _, exists := seen[id]; exists {
				continue
			}
			seen[id] = struct{}{}
			ids = append(ids, id)
		}
	}
	result := make(map[string]string, len(ids))
	if len(ids) == 0 {
		return result, nil
	}
	var accounts []model.Account
	if err := s.store.FindMany(
		ctx,
		"accounts",
		repository.Filter{"workspace_id": workspaceID, "_id": repository.Filter{"$in": ids}},
		&accounts,
		int64(len(ids)),
		0,
		nil,
	); err != nil {
		return nil, err
	}
	for _, account := range accounts {
		result[account.ID] = strings.TrimSpace(account.Name)
	}
	return result, nil
}

func formatMajorAmount(amountMinor int64) string {
	sign := ""
	if amountMinor < 0 {
		sign = "-"
		amountMinor = -amountMinor
	}
	return fmt.Sprintf("%s%d.%02d", sign, amountMinor/100, amountMinor%100)
}

func formatExportDate(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(transactionExportDateFormat)
}

func formatExportTimestamp(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func transactionExportFilename(filter TransactionFilter, now time.Time) string {
	period := now.UTC().Format("2006-01")
	if filter.From != nil && filter.To != nil {
		from := filter.From.UTC()
		to := filter.To.UTC()
		monthStart := time.Date(from.Year(), from.Month(), 1, 0, 0, 0, 0, time.UTC)
		if from.Equal(monthStart) && to.Equal(monthStart.AddDate(0, 1, 0)) {
			period = from.Format("2006-01")
		}
	}
	return "ledgerly-transactions-" + period + ".csv"
}
