package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type ReconciliationPreviewInput struct {
	StatementDate         string `json:"statementDate"`
	StatementBalanceMinor *int64 `json:"statementBalanceMinor"`
}

type ReconciliationPreview struct {
	Currency              string    `json:"currency"`
	AccountID             string    `json:"accountId"`
	StatementDate         time.Time `json:"statementDate"`
	LedgerBalanceMinor    int64     `json:"ledgerBalanceMinor"`
	StatementBalanceMinor int64     `json:"statementBalanceMinor,omitempty"`
	DifferenceMinor       int64     `json:"differenceMinor,omitempty"`
	HasStatementBalance   bool      `json:"hasStatementBalance"`
	ClearedCount          int64     `json:"clearedCount"`
	UnclearedCount        int64     `json:"unclearedCount"`
}

type ReconciliationCompleteInput struct {
	StatementDate         string `json:"statementDate"`
	StatementBalanceMinor int64  `json:"statementBalanceMinor"`
	AcknowledgeDifference bool   `json:"acknowledgeDifference"`
	Note                  string `json:"note"`
}

// ReconciliationPreview reports how the account's Ledgerly balance compares
// with a bank statement as of a statement date. It is read-only evidence
// gathering; nothing is persisted.
func (s *FinanceService) ReconciliationPreview(
	ctx context.Context,
	workspaceID, actorID, accountID string,
	input ReconciliationPreviewInput,
) (*ReconciliationPreview, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewBalances); err != nil {
		return nil, err
	}
	account, statementDate, err := s.reconciliationAccount(ctx, workspaceID, actorID, accountID, input.StatementDate)
	if err != nil {
		return nil, err
	}
	preview := &ReconciliationPreview{
		Currency:           account.Currency,
		AccountID:          account.ID,
		StatementDate:      statementDate,
		LedgerBalanceMinor: account.BalanceMinor,
	}
	if input.StatementBalanceMinor != nil {
		if *input.StatementBalanceMinor < -model.MaxMoneyMinor || *input.StatementBalanceMinor > model.MaxMoneyMinor {
			return nil, &FieldError{Field: "statementBalanceMinor", Message: "exceeds the supported range"}
		}
		preview.HasStatementBalance = true
		preview.StatementBalanceMinor = *input.StatementBalanceMinor
		preview.DifferenceMinor = preview.LedgerBalanceMinor - preview.StatementBalanceMinor
	}
	cleared, uncleared, err := s.countClearedState(ctx, workspaceID, actorID, account)
	if err != nil {
		return nil, err
	}
	preview.ClearedCount = cleared
	preview.UnclearedCount = uncleared
	return preview, nil
}

// CompleteReconciliation records immutable evidence that an account matched a
// statement at a date. A non-zero difference must be explicitly acknowledged;
// completed records are never rewritten by later edits.
func (s *FinanceService) CompleteReconciliation(
	ctx context.Context,
	workspaceID, actorID, accountID string,
	input ReconciliationCompleteInput,
) (*model.AccountReconciliation, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditAllTransactions); err != nil {
		return nil, err
	}
	account, statementDate, err := s.reconciliationAccount(ctx, workspaceID, actorID, accountID, input.StatementDate)
	if err != nil {
		return nil, err
	}
	if input.StatementBalanceMinor < -model.MaxMoneyMinor || input.StatementBalanceMinor > model.MaxMoneyMinor {
		return nil, &FieldError{Field: "statementBalanceMinor", Message: "exceeds the supported range"}
	}
	note, err := validatedText("note", input.Note, 0, 500)
	if err != nil {
		return nil, err
	}
	difference := account.BalanceMinor - input.StatementBalanceMinor
	if difference != 0 && !input.AcknowledgeDifference {
		return nil, &FieldError{
			Field:   "acknowledgeDifference",
			Message: fmt.Sprintf("ledger balance differs from the statement by %d minor units; resolve the difference or acknowledge it explicitly", difference),
		}
	}
	now := time.Now().UTC()
	reconciliation := &model.AccountReconciliation{
		ID:                     newID(),
		WorkspaceID:            workspaceID,
		VaultID:                account.VaultID,
		AccountID:              account.ID,
		CreatedBy:              actorID,
		StatementDate:          statementDate,
		Currency:               account.Currency,
		LedgerBalanceMinor:     account.BalanceMinor,
		StatementBalanceMinor:  input.StatementBalanceMinor,
		DifferenceMinor:        difference,
		DifferenceAcknowledged: input.AcknowledgeDifference && difference != 0,
		Note:                   note,
		CreatedAt:              now,
	}
	cleared, uncleared, err := s.countClearedState(ctx, workspaceID, actorID, account)
	if err != nil {
		return nil, err
	}
	reconciliation.ClearedCount = cleared
	reconciliation.UnclearedCount = uncleared
	if err := s.store.Insert(ctx, "account_reconciliations", reconciliation); err != nil {
		return nil, err
	}
	if err := s.audit(ctx, workspaceID, actorID, "reconciliation.completed", "account_reconciliation", reconciliation.ID, map[string]any{
		"accountId":             account.ID,
		"statementDate":         statementDate.Format("2006-01-02"),
		"ledgerBalanceMinor":    reconciliation.LedgerBalanceMinor,
		"statementBalanceMinor": reconciliation.StatementBalanceMinor,
		"differenceMinor":       reconciliation.DifferenceMinor,
	}); err != nil {
		return nil, err
	}
	return reconciliation, nil
}

// ListReconciliations returns completed reconciliations for the workspace,
// newest first. History is retained even after accounts are archived.
func (s *FinanceService) ListReconciliations(
	ctx context.Context,
	workspaceID, actorID, accountID string,
	limit, skip int64,
) ([]model.AccountReconciliation, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewBalances); err != nil {
		return nil, err
	}
	filter := repository.Filter{"workspace_id": workspaceID}
	if strings.TrimSpace(accountID) != "" {
		filter["account_id"] = strings.TrimSpace(accountID)
	}
	if limit <= 0 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	reconciliations := make([]model.AccountReconciliation, 0)
	if err := s.store.FindMany(
		ctx,
		"account_reconciliations",
		filter,
		&reconciliations,
		limit,
		skip,
		repository.Sort{"statement_date": -1},
	); err != nil {
		return nil, err
	}
	return reconciliations, nil
}

func (s *FinanceService) reconciliationAccount(
	ctx context.Context,
	workspaceID, actorID, accountID, statementDate string,
) (*model.Account, time.Time, error) {
	account, err := s.requireAccount(ctx, workspaceID, actorID, strings.TrimSpace(accountID))
	if err != nil {
		return nil, time.Time{}, err
	}
	date := strings.TrimSpace(statementDate)
	if date == "" {
		return nil, time.Time{}, &FieldError{Field: "statementDate", Message: "is required"}
	}
	parsed, parseErr := time.Parse("2006-01-02", date)
	if parseErr != nil || parsed.Format("2006-01-02") != date {
		return nil, time.Time{}, &FieldError{Field: "statementDate", Message: "must be a YYYY-MM-DD calendar date"}
	}
	return account, parsed.UTC(), nil
}

func (s *FinanceService) countClearedState(
	ctx context.Context,
	workspaceID, actorID string,
	account *model.Account,
) (int64, int64, error) {
	vaultIDs, err := s.accessibleVaultIDsUnchecked(ctx, workspaceID, actorID)
	if err != nil {
		return 0, 0, err
	}
	if len(vaultIDs) == 0 {
		return 0, 0, nil
	}
	accounts, err := s.visibleAccounts(ctx, workspaceID, actorID, vaultIDs)
	if err != nil {
		return 0, 0, err
	}
	if !contains(accountIDs(accounts), account.ID) {
		return 0, 0, ErrForbidden
	}
	baseFilter := repository.Filter{
		"workspace_id": workspaceID,
		"account_id":   account.ID,
	}
	countWith := func(extra repository.Filter) (int64, error) {
		filter := shallowCopyFilter(baseFilter)
		for key, value := range extra {
			filter[key] = value
		}
		var result []struct {
			Count int64 `bson:"count"`
		}
		if err := s.store.Aggregate(ctx, "transactions", repository.Pipeline{
			{"$match": filter},
			{"$count": "count"},
		}, &result); err != nil {
			return 0, err
		}
		if len(result) == 0 {
			return 0, nil
		}
		return result[0].Count, nil
	}
	cleared, err := countWith(repository.Filter{
		"cleared_at": repository.Filter{"$exists": true},
	})
	if err != nil {
		return 0, 0, err
	}
	uncleared, err := countWith(repository.Filter{
		"cleared_at": repository.Filter{"$exists": false},
	})
	if err != nil {
		return 0, 0, err
	}
	return cleared, uncleared, nil
}

func shallowCopyFilter(source repository.Filter) repository.Filter {
	result := make(repository.Filter, len(source)+1)
	for key, value := range source {
		result[key] = value
	}
	return result
}
