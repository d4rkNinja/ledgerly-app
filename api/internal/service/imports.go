package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const (
	importMatchWindowDays  = 7
	importMatchDayDrift    = 3
	importCandidateLimit   = 4000
	importDescriptionLimit = 200
)

type ImportSessionInput struct {
	AccountID  string                    `json:"accountId"`
	SourceName string                    `json:"sourceName"`
	Csv        string                    `json:"csv"`
	Mapping    model.ImportColumnMapping `json:"mapping"`
}

// CreateImportSession uploads and parses a statement into a review session.
// No ledger mutation happens here; transactions are only created on commit.
func (s *FinanceService) CreateImportSession(ctx context.Context, workspaceID, actorID string, input ImportSessionInput) (*model.ImportSession, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermCreateTransactions); err != nil {
		return nil, err
	}
	session, err := s.buildImportSession(ctx, workspaceID, actorID, input)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	session.ID = newID()
	session.CreatedAt = now
	session.UpdatedAt = now
	if err := s.store.Insert(ctx, "import_sessions", session); err != nil {
		return nil, err
	}
	return session, nil
}

func (s *FinanceService) buildImportSession(ctx context.Context, workspaceID, actorID string, input ImportSessionInput) (*model.ImportSession, error) {
	account, err := s.requireAccount(ctx, workspaceID, actorID, strings.TrimSpace(input.AccountID))
	if err != nil {
		return nil, err
	}
	if accountIsInactive(account) {
		return nil, &FieldError{Field: "accountId", Message: "must reference an active account"}
	}
	sourceName, err := validatedText("sourceName", input.SourceName, 0, importDescriptionLimit)
	if err != nil {
		return nil, err
	}
	parsed := parseStatementCSV(input.Csv, input.Mapping)
	if parsed.parseError != nil {
		return nil, parsed.parseError
	}
	if err := s.detectImportConflicts(ctx, workspaceID, actorID, account, parsed.rows); err != nil {
		return nil, err
	}
	session := &model.ImportSession{
		WorkspaceID: workspaceID,
		VaultID:     account.VaultID,
		AccountID:   account.ID,
		Status:      model.ImportSessionDraft,
		SourceName:  valueOrDefault(sourceName, "Statement"),
		Currency:    account.Currency,
		Mapping:     input.Mapping,
		Rows:        parsed.rows,
	}
	session.RecalculateSummary()
	return session, nil
}

// UpdateImportSession re-parses a draft with a changed column mapping (and
// optionally replaced CSV text). Resolutions that still correspond to the same
// statement line are preserved so users do not lose review work.
func (s *FinanceService) UpdateImportSession(ctx context.Context, workspaceID, actorID, sessionID string, input ImportSessionInput) (*model.ImportSession, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermCreateTransactions); err != nil {
		return nil, err
	}
	existing, err := s.draftImportSession(ctx, workspaceID, sessionID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(input.AccountID) == "" {
		input.AccountID = existing.AccountID
	}
	replacement, err := s.buildImportSession(ctx, workspaceID, actorID, input)
	if err != nil {
		return nil, err
	}
	preserveResolutions(existing.Rows, replacement.Rows)
	replacement.ID = existing.ID
	replacement.CreatedBy = existing.CreatedBy
	replacement.CreatedAt = existing.CreatedAt
	now := time.Now().UTC()
	replacement.UpdatedAt = now
	var updated model.ImportSession
	if err := s.store.UpdateOne(ctx, "import_sessions", repository.Filter{
		"_id":          existing.ID,
		"workspace_id": workspaceID,
		"status":       model.ImportSessionDraft,
	}, repository.Filter{"$set": bsonUpdateDocument(replacement)}, &updated); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrConflict
		}
		return nil, err
	}
	return &updated, nil
}

// preserveResolutions carries prior row actions forward when the underlying
// statement line at an index did not change.
func preserveResolutions(previous, next []model.ImportRow) {
	byIndex := make(map[int]model.ImportRow, len(previous))
	for _, row := range previous {
		byIndex[row.Index] = row
	}
	for index := range next {
		prior, ok := byIndex[next[index].Index]
		if !ok {
			continue
		}
		sameLine := prior.RawDate == next[index].RawDate &&
			prior.AmountMinor == next[index].AmountMinor &&
			prior.Direction == next[index].Direction &&
			model.NormalizeRuleText(prior.Description) == model.NormalizeRuleText(next[index].Description)
		if !sameLine {
			continue
		}
		switch prior.Action {
		case model.ImportRowActionIgnore:
			next[index].Action = model.ImportRowActionIgnore
		case model.ImportRowActionLink:
			// Keep a manual link only when current detection still proposes an
			// uncleared candidate for this line; otherwise fall back to what
			// the fresh scan decided (create), so a stale pointer can never be
			// committed against an already-reconciled entry.
			if next[index].State == model.ImportRowPossibleMatch && next[index].Match != nil {
				next[index].Action = model.ImportRowActionLink
			}
		case model.ImportRowActionCreate:
			next[index].Action = model.ImportRowActionCreate
		}
	}
}

func bsonUpdateDocument(session *model.ImportSession) repository.Filter {
	return repository.Filter{
		"account_id":  session.AccountID,
		"vault_id":    session.VaultID,
		"source_name": session.SourceName,
		"currency":    session.Currency,
		"mapping":     session.Mapping,
		"rows":        session.Rows,
		"summary":     session.Summary,
		"updated_at":  session.UpdatedAt,
	}
}

func (s *FinanceService) draftImportSession(ctx context.Context, workspaceID, sessionID string) (*model.ImportSession, error) {
	var session model.ImportSession
	if err := s.store.FindOne(ctx, "import_sessions", repository.Filter{
		"_id":          sessionID,
		"workspace_id": workspaceID,
	}, &session); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if session.Status != model.ImportSessionDraft {
		return nil, ErrConflict
	}
	return &session, nil
}

type ImportRowResolution struct {
	Index         int    `json:"index"`
	Action        string `json:"action"`
	TransactionID string `json:"transactionId"`
}

// ResolveImportRows applies bulk user decisions to a draft session.
func (s *FinanceService) ResolveImportRows(ctx context.Context, workspaceID, actorID, sessionID string, resolutions []ImportRowResolution) (*model.ImportSession, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermCreateTransactions); err != nil {
		return nil, err
	}
	session, err := s.draftImportSession(ctx, workspaceID, sessionID)
	if err != nil {
		return nil, err
	}
	if len(resolutions) == 0 {
		return nil, &FieldError{Field: "resolutions", Message: "must contain at least one decision"}
	}
	if len(resolutions) > importMaxRows {
		return nil, &FieldError{Field: "resolutions", Message: fmt.Sprintf("must contain at most %d decisions", importMaxRows)}
	}
	rowByIndex := make(map[int]*model.ImportRow, len(session.Rows))
	for index := range session.Rows {
		rowByIndex[session.Rows[index].Index] = &session.Rows[index]
	}
	for _, resolution := range resolutions {
		row, ok := rowByIndex[resolution.Index]
		if !ok {
			return nil, &FieldError{Field: "resolutions", Message: fmt.Sprintf("row %d is not part of this import", resolution.Index)}
		}
		switch resolution.Action {
		case model.ImportRowActionIgnore:
			row.Action = model.ImportRowActionIgnore
			row.Match = nil
		case model.ImportRowActionCreate:
			if row.State == model.ImportRowInvalid {
				return nil, &FieldError{Field: "resolutions", Message: fmt.Sprintf("row %d must be fixed or ignored", resolution.Index)}
			}
			row.Action = model.ImportRowActionCreate
		case model.ImportRowActionLink:
			targetID := strings.TrimSpace(resolution.TransactionID)
			if targetID == "" {
				return nil, &FieldError{Field: "resolutions", Message: fmt.Sprintf("row %d must reference a transaction to link", resolution.Index)}
			}
			target, targetErr := s.getTransactionForMutation(ctx, workspaceID, actorID, targetID)
			if targetErr != nil {
				return nil, &FieldError{Field: "resolutions", Message: fmt.Sprintf("row %d must reference a transaction you can edit", resolution.Index)}
			}
			if target.ClearedAt != nil {
				return nil, &FieldError{Field: "resolutions", Message: fmt.Sprintf("row %d references an already reconciled transaction", resolution.Index)}
			}
			row.State = model.ImportRowPossibleMatch
			row.Action = model.ImportRowActionLink
			row.Match = &model.ImportMatchInfo{
				TransactionID: targetID,
				Label:         valueOrDefault(target.Merchant, "Ledgerly transaction"),
				OccurredAt:    target.OccurredAt.Format(time.RFC3339),
				AmountMinor:   target.AmountMinor,
			}
		default:
			return nil, &FieldError{Field: "resolutions", Message: "action must be one of create, ignore, or link"}
		}
	}
	session.RecalculateSummary()
	session.UpdatedAt = time.Now().UTC()
	var updated model.ImportSession
	if err := s.store.UpdateOne(ctx, "import_sessions", repository.Filter{
		"_id":          session.ID,
		"workspace_id": workspaceID,
	}, repository.Filter{"$set": bsonUpdateDocument(session)}, &updated); err != nil {
		return nil, err
	}
	return &updated, nil
}

// CommitImportSession creates, links, or ignores every reviewed row inside one
// MongoDB transaction. Retries are safe: each created row carries a
// deterministic idempotency key derived from the session and row index, and
// the completed-session guard rejects duplicate commits.
func (s *FinanceService) CommitImportSession(ctx context.Context, workspaceID, actorID, sessionID string) (*model.ImportSession, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermCreateTransactions); err != nil {
		return nil, err
	}
	rules, err := s.listEnabledAutomationRulesOrdered(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	result, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		return s.commitImportInContext(transactionCtx, workspaceID, actorID, sessionID, rules)
	})
	if err != nil {
		return nil, err
	}
	session, ok := result.(*model.ImportSession)
	if !ok {
		return nil, errors.New("unexpected import commit result")
	}
	return session, nil
}

func (s *FinanceService) commitImportInContext(
	ctx context.Context,
	workspaceID, actorID, sessionID string,
	rules []model.AutomationRule,
) (*model.ImportSession, error) {
	session, err := s.draftImportSession(ctx, workspaceID, sessionID)
	if err != nil {
		return nil, err
	}
	account, err := s.requireAccount(ctx, workspaceID, actorID, session.AccountID)
	if err != nil {
		return nil, err
	}
	if accountIsInactive(account) {
		return nil, &FieldError{Field: "accountId", Message: "must reference an active account"}
	}

	result := &model.ImportResult{CommittedAt: time.Now().UTC()}
	sortedRows := append([]model.ImportRow(nil), session.Rows...)
	sort.SliceStable(sortedRows, func(left, right int) bool {
		return sortedRows[left].Index < sortedRows[right].Index
	})
	for index := range sortedRows {
		row := sortedRows[index]
		switch row.Action {
		case model.ImportRowActionIgnore:
			result.IgnoredCount++
			continue
		case model.ImportRowActionLink:
			if err := s.clearLinkedTransaction(ctx, workspaceID, actorID, session, &row); err != nil {
				return nil, err
			}
			result.LinkedCount++
		case model.ImportRowActionCreate:
			if row.State == model.ImportRowInvalid {
				return nil, &FieldError{
					Field:   "rows",
					Message: fmt.Sprintf("row %d has invalid values; fix it or ignore it before importing", row.Index),
				}
			}
			if _, err := s.createImportedTransaction(ctx, workspaceID, actorID, session, account, &row, rules); err != nil {
				return nil, err
			}
			result.CreatedCount++
		default:
			return nil, &FieldError{
				Field:   "rows",
				Message: fmt.Sprintf("row %d still needs a decision", row.Index),
			}
		}
	}

	session.Result = result
	session.Status = model.ImportSessionCompleted
	session.UpdatedAt = time.Now().UTC()
	session.CompletedAt = &result.CommittedAt
	var guard model.ImportSession
	if err := s.store.UpdateOne(ctx, "import_sessions", repository.Filter{
		"_id":          session.ID,
		"workspace_id": workspaceID,
		"status":       model.ImportSessionDraft,
	}, repository.Filter{"$set": repository.Filter{
		"status":       model.ImportSessionCompleted,
		"result":       result,
		"updated_at":   session.UpdatedAt,
		"completed_at": result.CommittedAt,
	}}, &guard); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrConflict
		}
		return nil, err
	}
	if err := s.audit(ctx, workspaceID, actorID, "import.completed", "import_session", session.ID, map[string]any{
		"created": result.CreatedCount,
		"linked":  result.LinkedCount,
		"ignored": result.IgnoredCount,
	}); err != nil {
		return nil, err
	}
	session.RecalculateSummary()
	return session, nil
}

// clearLinkedTransaction marks an existing Ledgerly transaction as matched to
// this statement. Financial values are unchanged, so a plain audit event is
// written without advancing the ledger version.
func (s *FinanceService) clearLinkedTransaction(ctx context.Context, workspaceID, actorID string, session *model.ImportSession, row *model.ImportRow) error {
	match := row.Match
	if match == nil || match.TransactionID == "" {
		return &FieldError{
			Field:   "rows",
			Message: fmt.Sprintf("row %d must reference a transaction to link", row.Index),
		}
	}
	current, err := s.getTransactionForMutation(ctx, workspaceID, actorID, match.TransactionID)
	if err != nil {
		if errors.Is(err, ErrNotFound) || errors.Is(err, ErrForbidden) {
			return &FieldError{
				Field:   "rows",
				Message: fmt.Sprintf("row %d must reference a transaction you can edit", row.Index),
			}
		}
		return err
	}
	if current.ClearedAt != nil {
		return &FieldError{
			Field:   "rows",
			Message: fmt.Sprintf("row %d references an already reconciled transaction", row.Index),
		}
	}
	now := time.Now().UTC()
	var updated model.Transaction
	if err := s.store.UpdateOne(ctx, "transactions", repository.Filter{
		"_id":          current.ID,
		"workspace_id": workspaceID,
		"cleared_at":   repository.Filter{"$exists": false},
	}, repository.Filter{"$set": repository.Filter{
		"cleared_at": now,
		"updated_at": now,
	}}, &updated); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return &FieldError{
				Field:   "rows",
				Message: fmt.Sprintf("row %d references an already reconciled transaction", row.Index),
			}
		}
		return err
	}
	return s.audit(ctx, workspaceID, actorID, "transaction.import_linked", "transaction", current.ID, map[string]any{
		"import_session_id": session.ID,
		"statement_row":     row.Index,
	})
}

// createImportedTransaction mirrors CreateTransaction's invariants for a
// statement row while adding provenance, cleared state, and automation rules.
func (s *FinanceService) createImportedTransaction(
	ctx context.Context,
	workspaceID, actorID string,
	session *model.ImportSession,
	account *model.Account,
	row *model.ImportRow,
	rules []model.AutomationRule,
) (*model.Transaction, error) {
	kind := "expense"
	if row.Direction == "credit" {
		kind = "income"
	}
	merchant, err := validatedText("merchant", row.Description, 0, importDescriptionLimit)
	if err != nil {
		return nil, err
	}
	notes, err := validatedText("notes", row.Notes, 0, 2000)
	if err != nil {
		return nil, err
	}
	description, err := validatedText("description", row.Reference, 0, 2000)
	if err != nil {
		return nil, err
	}
	category := ""
	privacy := "workspace"
	if account.Privacy != "workspace" {
		privacy = "private"
	}
	now := time.Now().UTC()
	occurredAt := row.OccurredAt.UTC()
	txType := kind
	tx := &model.Transaction{
		ID:                        newID(),
		WorkspaceID:               workspaceID,
		VaultID:                   session.VaultID,
		AccountID:                 account.ID,
		CreatedBy:                 actorID,
		Type:                      txType,
		SequenceScope:             model.TransactionSequenceScope(txType, false),
		AutoGenerateTransactionID: true,
		AmountMinor:               row.AmountMinor,
		Currency:                  account.Currency,
		Category:                  category,
		Merchant:                  merchant,
		Notes:                     notes,
		Description:               description,
		Privacy:                   privacy,
		OccurredAt:                occurredAt,
		CreatedAt:                 now,
		UpdatedAt:                 now,
		Source:                    model.TransactionSourceImport,
		ImportSessionID:           session.ID,
		ClearedAt:                 &occurredAt,
	}
	if err := s.applyAutomationRulesToTransaction(ctx, workspaceID, rules, tx); err != nil {
		return nil, err
	}
	if tx.Category != "" {
		if _, categoryErr := s.validateTransactionCategory(ctx, workspaceID, tx.Type, tx.Category, nil, nil); categoryErr != nil {
			return nil, categoryErr
		}
	}
	if err := validateMoney("amountMinor", tx.AmountMinor, false); err != nil {
		return nil, err
	}
	idempotencyKey := fmt.Sprintf("import:%s:%d", session.ID, row.Index)
	requestOccurredAt := tx.OccurredAt
	audit := newAuditEvent(workspaceID, actorID, "transaction.created", "transaction", tx.ID, map[string]any{
		"type":              tx.Type,
		"import_session_id": session.ID,
	})
	created, err := s.store.CreateFinancialTransaction(ctx, tx, idempotencyKey, &requestOccurredAt, audit)
	if err != nil {
		return nil, transactionIdentifierError(err, "transactionId")
	}
	return created, nil
}

// ListImportSessions returns review sessions newest-first. Completed and
// cancelled sessions are retained as provenance evidence.
func (s *FinanceService) ListImportSessions(ctx context.Context, workspaceID, actorID string, status string, limit, skip int64) ([]model.ImportSession, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	filter := repository.Filter{"workspace_id": workspaceID}
	switch strings.TrimSpace(status) {
	case "":
	case model.ImportSessionDraft, model.ImportSessionCompleted, model.ImportSessionCancelled:
		filter["status"] = strings.TrimSpace(status)
	default:
		return nil, &FieldError{Field: "status", Message: "is not supported"}
	}
	if limit <= 0 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	sessions := make([]model.ImportSession, 0)
	if err := s.store.FindMany(ctx, "import_sessions", filter, &sessions, limit, skip, repository.Sort{"created_at": -1}); err != nil {
		return nil, err
	}
	return sessions, nil
}

func (s *FinanceService) GetImportSession(ctx context.Context, workspaceID, actorID, sessionID string) (*model.ImportSession, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	var session model.ImportSession
	if err := s.store.FindOne(ctx, "import_sessions", repository.Filter{
		"_id":          sessionID,
		"workspace_id": workspaceID,
	}, &session); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &session, nil
}

// CancelImportSession discards a draft. Sessions already committed cannot be
// cancelled because their evidence is immutable history.
func (s *FinanceService) CancelImportSession(ctx context.Context, workspaceID, actorID, sessionID string) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermCreateTransactions); err != nil {
		return err
	}
	result, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		var cancelled model.ImportSession
		err := s.store.UpdateOne(transactionCtx, "import_sessions", repository.Filter{
			"_id":          sessionID,
			"workspace_id": workspaceID,
			"status":       model.ImportSessionDraft,
		}, repository.Filter{"$set": repository.Filter{
			"status":     model.ImportSessionCancelled,
			"updated_at": time.Now().UTC(),
		}}, &cancelled)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrConflict
			}
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "import.cancelled", "import_session", sessionID, nil); err != nil {
			return nil, err
		}
		return nil, nil
	})
	if err != nil {
		return err
	}
	_ = result
	return nil
}

// detectImportConflicts compares parsed rows against the existing ledger for
// the account and against each other, assigning review states.
func (s *FinanceService) detectImportConflicts(ctx context.Context, workspaceID, actorID string, account *model.Account, rows []model.ImportRow) error {
	bounds := importDateBounds(rows)
	if bounds == nil {
		return nil
	}
	candidates, err := s.importCandidates(ctx, workspaceID, actorID, account.ID, bounds.from, bounds.to)
	if err != nil {
		return err
	}
	type candidateScore struct {
		candidate model.Transaction
		score     float64
		reason    string
	}
	seenInSession := make(map[string]int, len(rows))
	for index := range rows {
		row := &rows[index]
		if row.State != model.ImportRowNew {
			continue
		}
		key := importRowIdentity(row)
		if firstIndex, exists := seenInSession[key]; exists {
			row.State = model.ImportRowDuplicate
			row.Action = model.ImportRowActionIgnore
			row.Error = ""
			row.Match = &model.ImportMatchInfo{
				Label:       fmt.Sprintf("Same as row %d of this statement", firstIndex+1),
				OccurredAt:  row.OccurredAt.Format(time.RFC3339),
				AmountMinor: row.AmountMinor,
				Score:       1,
			}
			continue
		}
		seenInSession[key] = row.Index

		best := -1
		bestScore := 0.0
		bestReason := ""
		for candidateIndex, candidate := range candidates {
			score, reason := scoreImportMatch(*row, candidate)
			if score <= bestScore {
				continue
			}
			// Already-reconciled entries may only absorb an exact duplicate
			// (which resolves to ignore). They must never be suggested as link
			// targets, because clearing them twice would corrupt provenance.
			if candidate.ClearedAt != nil && reason != "exact" {
				continue
			}
			best = candidateIndex
			bestScore = score
			bestReason = reason
		}
		if best < 0 {
			continue
		}
		match := candidates[best]
		row.Match = &model.ImportMatchInfo{
			TransactionID: match.ID,
			Label:         valueOrDefault(match.Merchant, "Ledgerly transaction"),
			OccurredAt:    match.OccurredAt.Format(time.RFC3339),
			AmountMinor:   match.AmountMinor,
			Score:         bestScore,
		}
		if bestReason == "exact" {
			row.State = model.ImportRowDuplicate
			row.Action = model.ImportRowActionIgnore
		} else {
			row.State = model.ImportRowPossibleMatch
			row.Action = model.ImportRowActionLink
		}
	}
	return nil
}

func (s *FinanceService) importCandidates(
	ctx context.Context,
	workspaceID, actorID, accountID string,
	from, to time.Time,
) ([]model.Transaction, error) {
	windowFrom := from.AddDate(0, 0, -importMatchWindowDays)
	windowTo := to.AddDate(0, 0, importMatchWindowDays+1)
	filter, empty, err := s.transactionQuery(ctx, workspaceID, actorID, TransactionFilter{
		AccountID: accountID,
		From:      &windowFrom,
		To:        &windowTo,
	})
	if err != nil {
		return nil, err
	}
	if empty {
		return nil, nil
	}
	transactions := make([]model.Transaction, 0, 32)
	if err := s.store.FindMany(ctx, "transactions", filter, &transactions, importCandidateLimit, 0, repository.Sort{"occurred_at": -1}); err != nil {
		return nil, err
	}
	return transactions, nil
}

func importDateBounds(rows []model.ImportRow) *struct{ from, to time.Time } {
	var from, to time.Time
	found := false
	for index := range rows {
		row := &rows[index]
		if row.State == model.ImportRowInvalid || row.OccurredAt.IsZero() {
			continue
		}
		if !found {
			from, to = row.OccurredAt, row.OccurredAt
			found = true
			continue
		}
		if row.OccurredAt.Before(from) {
			from = row.OccurredAt
		}
		if row.OccurredAt.After(to) {
			to = row.OccurredAt
		}
	}
	if !found {
		return nil
	}
	return &struct{ from, to time.Time }{from: from, to: to}
}

func importRowIdentity(row *model.ImportRow) string {
	return strings.Join([]string{
		row.OccurredAt.Format("2006-01-02"),
		fmt.Sprintf("%d", row.AmountMinor),
		model.NormalizeRuleText(row.Description),
	}, "|")
}

// scoreImportMatch returns a deterministic similarity score plus a reason.
// A score of 1 means an exact duplicate (amount, day, description).
func scoreImportMatch(row model.ImportRow, candidate model.Transaction) (float64, string) {
	if candidate.AmountMinor != row.AmountMinor {
		return 0, ""
	}
	dayDifference := candidate.OccurredAt.Sub(row.OccurredAt)
	if dayDifference < 0 {
		dayDifference = -dayDifference
	}
	days := int64(dayDifference.Hours() / 24)
	rowText := model.NormalizeRuleText(row.Description)
	candidateText := model.NormalizeRuleText(valueOrDefault(candidate.Merchant, candidate.Category))
	sameDay := days == 0
	textEqual := rowText != "" && rowText == candidateText
	if sameDay && textEqual {
		return 1, "exact"
	}
	if days > importMatchDayDrift {
		return 0, ""
	}
	similarity := tokenSimilarity(rowText, candidateText)
	switch {
	case sameDay && similarity >= 0.34:
		return 0.9, "likely"
	case textEqual && days <= importMatchDayDrift:
		return 0.85, "likely"
	case sameDay:
		return 0.7, "possible"
	case similarity >= 0.5 && days <= importMatchDayDrift:
		return 0.75, "likely"
	default:
		return 0, ""
	}
}

// tokenSimilarity is a deterministic Jaccard-style overlap over words.
func tokenSimilarity(left, right string) float64 {
	leftTokens := tokenSet(left)
	rightTokens := tokenSet(right)
	if len(leftTokens) == 0 || len(rightTokens) == 0 {
		return 0
	}
	intersection := 0
	for token := range leftTokens {
		if _, present := rightTokens[token]; present {
			intersection++
		}
	}
	union := len(leftTokens) + len(rightTokens) - intersection
	if union == 0 {
		return 0
	}
	return float64(intersection) / float64(union)
}

func tokenSet(text string) map[string]struct{} {
	tokens := make(map[string]struct{})
	for _, field := range strings.Fields(text) {
		field = strings.Trim(field, ",.;:!?()[]{}'\"")
		if len(field) >= 2 {
			tokens[field] = struct{}{}
		}
	}
	return tokens
}
