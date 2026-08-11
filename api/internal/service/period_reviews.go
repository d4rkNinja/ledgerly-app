package service

import (
	"context"
	"errors"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const periodReviewsCollection = "period_reviews"
const maxPeriodReviewScopeIDs = 10_000

type PeriodReviewInput struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Timezone string `json:"timezone"`
	Status   string `json:"status"`
	Scope    string `json:"scope"`
}

type periodBounds struct {
	from, to                         string
	timezone                         string
	fromUTC, toUTC                   time.Time
	reportingFromUTC, reportingToUTC time.Time
}

func normalizePeriodReviewInput(input PeriodReviewInput, requireStatus bool) (PeriodReviewInput, periodBounds, error) {
	input.From = strings.TrimSpace(input.From)
	input.To = strings.TrimSpace(input.To)
	input.Timezone = strings.TrimSpace(input.Timezone)
	input.Status = strings.ToLower(strings.TrimSpace(input.Status))
	input.Scope = strings.ToLower(strings.TrimSpace(input.Scope))
	if input.Scope == "" {
		input.Scope = model.PeriodReviewScopeMemberView
	}
	if input.Timezone == "Local" {
		return input, periodBounds{}, &FieldError{Field: "timezone", Message: "must be a valid IANA timezone"}
	}
	location, err := time.LoadLocation(input.Timezone)
	if err != nil || input.Timezone == "" {
		return input, periodBounds{}, &FieldError{Field: "timezone", Message: "must be a valid IANA timezone"}
	}
	from, err := time.ParseInLocation("2006-01-02", input.From, location)
	if err != nil || from.Format("2006-01-02") != input.From {
		return input, periodBounds{}, &FieldError{Field: "from", Message: "must be a valid YYYY-MM-DD date"}
	}
	to, err := time.ParseInLocation("2006-01-02", input.To, location)
	if err != nil || to.Format("2006-01-02") != input.To {
		return input, periodBounds{}, &FieldError{Field: "to", Message: "must be a valid YYYY-MM-DD date"}
	}
	if to.Before(from) {
		return input, periodBounds{}, &FieldError{Field: "period", Message: "to must not be before from"}
	}
	if !to.Before(from.AddDate(0, 0, 366)) {
		return input, periodBounds{}, &FieldError{Field: "period", Message: "must not exceed 366 days"}
	}
	if requireStatus && input.Status != "reviewed" && input.Status != "closed" {
		return input, periodBounds{}, &FieldError{Field: "status", Message: "must be reviewed or closed"}
	}
	if input.Scope != model.PeriodReviewScopeMemberView && input.Scope != model.PeriodReviewScopeWorkspaceView {
		return input, periodBounds{}, &FieldError{Field: "scope", Message: "must be member_view or workspace_view"}
	}
	reportingFromUTC, _ := time.Parse("2006-01-02", input.From)
	reportingToUTC, _ := time.Parse("2006-01-02", input.To)
	return input, periodBounds{
		from: input.From, to: input.To, timezone: input.Timezone,
		fromUTC: from.UTC(), toUTC: to.AddDate(0, 0, 1).UTC(),
		reportingFromUTC: reportingFromUTC.UTC(), reportingToUTC: reportingToUTC.AddDate(0, 0, 1).UTC(),
	}, nil
}

// normalizePeriodReviewListInput deliberately does not bind lookup to the
// caller's current timezone. A checkpoint retains its creation timezone as
// evidence, while from/to remain stable when a user travels.
func normalizePeriodReviewListInput(input PeriodReviewInput) (PeriodReviewInput, error) {
	input.From = strings.TrimSpace(input.From)
	input.To = strings.TrimSpace(input.To)
	from, err := time.Parse("2006-01-02", input.From)
	if err != nil || from.Format("2006-01-02") != input.From {
		return input, &FieldError{Field: "from", Message: "must be a valid YYYY-MM-DD date"}
	}
	to, err := time.Parse("2006-01-02", input.To)
	if err != nil || to.Format("2006-01-02") != input.To {
		return input, &FieldError{Field: "to", Message: "must be a valid YYYY-MM-DD date"}
	}
	if to.Before(from) {
		return input, &FieldError{Field: "period", Message: "to must not be before from"}
	}
	if !to.Before(from.AddDate(0, 0, 366)) {
		return input, &FieldError{Field: "period", Message: "must not exceed 366 days"}
	}
	if zone := strings.TrimSpace(input.Timezone); zone != "" {
		if zone == "Local" {
			return input, &FieldError{Field: "timezone", Message: "must be a valid IANA timezone"}
		}
		if _, err := time.LoadLocation(zone); err != nil {
			return input, &FieldError{Field: "timezone", Message: "must be a valid IANA timezone"}
		}
	}
	input.Scope = strings.ToLower(strings.TrimSpace(input.Scope))
	if input.Scope != "" && input.Scope != model.PeriodReviewScopeMemberView && input.Scope != model.PeriodReviewScopeWorkspaceView {
		return input, &FieldError{Field: "scope", Message: "must be member_view or workspace_view"}
	}
	return input, nil
}

func (s *FinanceService) requirePeriodReviewAccess(ctx context.Context, workspaceID, actorID string) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewBalances); err != nil {
		return err
	}
	_, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions)
	return err
}

func (s *FinanceService) CreatePeriodReview(ctx context.Context, workspaceID, actorID string, input PeriodReviewInput) (*model.PeriodReviewView, error) {
	if err := s.requirePeriodReviewAccess(ctx, workspaceID, actorID); err != nil {
		return nil, err
	}
	input, bounds, err := normalizePeriodReviewInput(input, true)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	result, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if err := s.requirePeriodReviewAccess(transactionCtx, workspaceID, actorID); err != nil {
			return nil, err
		}
		var workspace model.Workspace
		if err := s.store.FindOne(transactionCtx, "workspaces", repository.Filter{"_id": workspaceID}, &workspace); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		if input.Scope == model.PeriodReviewScopeWorkspaceView {
			if workspace.Type == "personal" {
				return nil, &FieldError{Field: "scope", Message: "workspace_view is not available for personal workspaces"}
			}
			if input.Status != "closed" {
				return nil, &FieldError{Field: "status", Message: "workspace_view checkpoints must be closed"}
			}
			if _, err := s.access.Require(transactionCtx, workspaceID, actorID, model.PermApproveExpenses); err != nil {
				return nil, err
			}
		}
		scopeActorID := actorID
		if input.Scope == model.PeriodReviewScopeWorkspaceView {
			scopeActorID = ""
		}
		vaultIDs, accountIDs, err := s.periodScopeIDs(transactionCtx, workspaceID, actorID, input.Scope)
		if err != nil {
			return nil, err
		}
		if len(vaultIDs) > maxPeriodReviewScopeIDs || len(accountIDs) > maxPeriodReviewScopeIDs {
			return nil, &FieldError{Field: "scope", Message: "contains too many vaults or accounts to checkpoint"}
		}
		var prior []model.PeriodReview
		if err := s.store.FindMany(transactionCtx, periodReviewsCollection, repository.Filter{
			"workspace_id": workspaceID, "scope": input.Scope, "scope_actor_id": scopeActorID,
			"from": bounds.from, "to": bounds.to,
		}, &prior, 1, 0, repository.Sort{"cutoff_ledger_version": -1}); err != nil {
			return nil, err
		}
		if len(prior) > 0 {
			if prior[0].Status == "closed" && input.Status == "reviewed" {
				return nil, ErrConflict
			}
			if prior[0].Status == input.Status {
				_, changeCount, err := s.periodRevisionSummary(transactionCtx, prior[0], vaultIDs, accountIDs)
				if err != nil {
					return nil, err
				}
				if changeCount == 0 {
					return nil, ErrConflict
				}
			}
		}
		snapshot, err := s.periodSnapshotTotals(transactionCtx, workspaceID, actorID, workspace.Currency, input.Scope, vaultIDs, accountIDs, bounds)
		if err != nil {
			return nil, err
		}
		// Advance the shared ledger last. A concurrent transaction mutation writes
		// the same document, forcing Mongo to retry the snapshot rather than leave
		// a gap between its contents and cutoff.
		if err := s.store.UpdateOne(transactionCtx, "workspaces", repository.Filter{"_id": workspaceID}, repository.Filter{
			"$inc": repository.Filter{"ledger_version": int64(1)},
		}, &workspace); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		review := &model.PeriodReview{
			ID: newID(), WorkspaceID: workspaceID, Status: input.Status,
			Scope: input.Scope, ScopeActorID: scopeActorID,
			VaultIDs: append([]string(nil), vaultIDs...), AccountIDs: append([]string(nil), accountIDs...),
			From: bounds.from, To: bounds.to, Timezone: bounds.timezone,
			FromUTC: bounds.fromUTC, ToUTCExclusive: bounds.toUTC,
			Currency: workspace.Currency, Snapshot: snapshot,
			CutoffLedgerVersion: workspace.LedgerVersion, CreatedBy: actorID, CreatedAt: now,
		}
		if err := s.store.Insert(transactionCtx, periodReviewsCollection, review); err != nil {
			if errors.Is(err, repository.ErrConflict) {
				return nil, ErrConflict
			}
			return nil, err
		}
		audit := newAuditEvent(workspaceID, actorID, "period_review.created", "period_review", review.ID, map[string]any{
			"scope": review.Scope, "status": review.Status, "from": review.From, "to": review.To,
		})
		audit.LedgerVersion = workspace.LedgerVersion
		if err := s.store.Insert(transactionCtx, "audit_events", audit); err != nil {
			return nil, err
		}
		return review, nil
	})
	if err != nil {
		return nil, err
	}
	review, ok := result.(*model.PeriodReview)
	if !ok {
		return nil, errors.New("unexpected period review result")
	}
	view := newPeriodReviewView(*review)
	view.ReviewedBy = formerPeriodReviewMember()
	items := []model.PeriodReviewView{view}
	if err := s.hydratePeriodReviewers(ctx, actorID, items); err == nil {
		view = items[0]
	}
	return &view, nil
}

func newPeriodReviewView(review model.PeriodReview) model.PeriodReviewView {
	note := "Visible records captured for this member; later revisions remain informational."
	if review.Scope == model.PeriodReviewScopeWorkspaceView {
		note = "Workspace-visible records captured for this shared checkpoint; private records are excluded."
	}
	return model.PeriodReviewView{
		PeriodReview: review, VaultCount: len(review.VaultIDs), AccountCount: len(review.AccountIDs),
		ScopeNote: note, ReviewState: model.PeriodReviewStateCurrent,
	}
}

func (s *FinanceService) periodScopeIDs(ctx context.Context, workspaceID, actorID, scope string) ([]string, []string, error) {
	if scope == model.PeriodReviewScopeMemberView {
		vaultIDs, err := s.accessibleVaultIDsUnchecked(ctx, workspaceID, actorID)
		if err != nil {
			return nil, nil, err
		}
		accountIDs, err := s.accessibleAccountIDs(ctx, workspaceID, actorID, vaultIDs)
		return vaultIDs, accountIDs, err
	}
	if scope != model.PeriodReviewScopeWorkspaceView {
		return nil, nil, ErrForbidden
	}
	var vaults []model.Vault
	if err := s.store.FindMany(ctx, "vaults", repository.Filter{"workspace_id": workspaceID, "archived": false, "privacy": "workspace"}, &vaults, 0, 0, nil); err != nil {
		return nil, nil, err
	}
	vaultIDs := make([]string, 0, len(vaults))
	for _, vault := range vaults {
		vaultIDs = append(vaultIDs, vault.ID)
	}
	if len(vaultIDs) == 0 {
		return []string{}, []string{}, nil
	}
	var accounts []model.Account
	// Match transaction reporting semantics: archiving removes an account from
	// active pickers and balances, but must not erase its workspace-visible
	// financial history from a period checkpoint or later revision summary.
	if err := s.store.FindMany(ctx, "accounts", repository.Filter{"workspace_id": workspaceID, "vault_id": repository.Filter{"$in": vaultIDs}, "privacy": "workspace"}, &accounts, 0, 0, nil); err != nil {
		return nil, nil, err
	}
	ids := make([]string, 0, len(accounts))
	for _, account := range accounts {
		ids = append(ids, account.ID)
	}
	return vaultIDs, ids, nil
}

func (s *FinanceService) periodSnapshotTotals(ctx context.Context, workspaceID, actorID, currency, scope string, vaultIDs, accountIDs []string, bounds periodBounds) (model.PeriodTotals, error) {
	if len(vaultIDs) == 0 || len(accountIDs) == 0 {
		return model.PeriodTotals{}, nil
	}
	// Transaction occurrence values are canonical civil dates serialized at
	// UTC midnight. The supplied timezone remains immutable review evidence,
	// but it must not shift which reporting date belongs to the period.
	from, to := bounds.reportingFromUTC, bounds.reportingToUTC
	filter, empty, err := transactionQueryForScope(workspaceID, actorID, TransactionFilter{From: &from, To: &to}, vaultIDs, accountIDs)
	if err != nil || empty {
		return model.PeriodTotals{}, err
	}
	if scope == model.PeriodReviewScopeWorkspaceView {
		filter["$or"] = []repository.Filter{{"privacy": "workspace"}}
	}
	filter["currency"] = currency
	if capability, production := s.store.(interface{ SupportsExactServerAggregation() bool }); production && capability.SupportsExactServerAggregation() {
		return s.aggregateTransactionTotals(ctx, filter)
	}
	var transactions []model.Transaction
	if err := s.store.FindMany(ctx, "transactions", filter, &transactions, 0, 0, repository.Sort{"occurred_at": 1}); err != nil {
		return model.PeriodTotals{}, err
	}
	return totalsForTransactions(transactions)
}

func totalsForTransactions(transactions []model.Transaction) (model.PeriodTotals, error) {
	totals := model.PeriodTotals{}
	for i := range transactions {
		if err := addPeriodTotals(&totals, totalsForRevision(model.NewTransactionRevisionSnapshot(&transactions[i]))); err != nil {
			return model.PeriodTotals{}, err
		}
	}
	return totals, nil
}

func totalsForRevision(snapshot *model.TransactionRevisionSnapshot) model.PeriodTotals {
	if snapshot == nil {
		return model.PeriodTotals{}
	}
	totals := model.PeriodTotals{TransactionCount: 1}
	switch snapshot.Type {
	case "income", "refund", "reimbursement":
		totals.IncomeMinor = snapshot.AmountMinor
	case "expense":
		totals.SpendingMinor = snapshot.AmountMinor
	}
	totals.NetMinor = totals.IncomeMinor - totals.SpendingMinor
	return totals
}

func checkedPeriodAdd(left, right int64) (int64, error) {
	if (right > 0 && left > math.MaxInt64-right) || (right < 0 && left < math.MinInt64-right) {
		return 0, ErrPeriodTotalsOverflow
	}
	return left + right, nil
}

func addPeriodTotals(destination *model.PeriodTotals, delta model.PeriodTotals) error {
	var err error
	if destination.IncomeMinor, err = checkedPeriodAdd(destination.IncomeMinor, delta.IncomeMinor); err != nil {
		return err
	}
	if destination.SpendingMinor, err = checkedPeriodAdd(destination.SpendingMinor, delta.SpendingMinor); err != nil {
		return err
	}
	if destination.NetMinor, err = checkedPeriodAdd(destination.NetMinor, delta.NetMinor); err != nil {
		return err
	}
	if destination.TransactionCount, err = checkedPeriodAdd(destination.TransactionCount, delta.TransactionCount); err != nil {
		return err
	}
	return nil
}

func subtractPeriodTotals(after, before model.PeriodTotals) (model.PeriodTotals, error) {
	neg := model.PeriodTotals{}
	if before.IncomeMinor == math.MinInt64 || before.SpendingMinor == math.MinInt64 || before.NetMinor == math.MinInt64 || before.TransactionCount == math.MinInt64 {
		return neg, ErrPeriodTotalsOverflow
	}
	neg = model.PeriodTotals{
		IncomeMinor: -before.IncomeMinor, SpendingMinor: -before.SpendingMinor,
		NetMinor: -before.NetMinor, TransactionCount: -before.TransactionCount,
	}
	if err := addPeriodTotals(&after, neg); err != nil {
		return model.PeriodTotals{}, err
	}
	return after, nil
}

func (s *FinanceService) ListPeriodReviews(ctx context.Context, workspaceID, actorID string, input PeriodReviewInput) ([]model.PeriodReviewView, error) {
	if err := s.requirePeriodReviewAccess(ctx, workspaceID, actorID); err != nil {
		return nil, err
	}
	input, err := normalizePeriodReviewListInput(input)
	if err != nil {
		return nil, err
	}
	reviews := make([]model.PeriodReview, 0, 2)
	loadLatest := func(scope string) error {
		filter := repository.Filter{"workspace_id": workspaceID, "from": input.From, "to": input.To, "scope": scope}
		if scope == model.PeriodReviewScopeMemberView {
			filter["scope_actor_id"] = actorID
		}
		var latest []model.PeriodReview
		if err := s.store.FindMany(ctx, periodReviewsCollection, filter, &latest, 1, 0, repository.Sort{"cutoff_ledger_version": -1}); err != nil {
			return err
		}
		if len(latest) > 0 {
			reviews = append(reviews, latest[0])
		}
		return nil
	}
	if input.Scope == "" || input.Scope == model.PeriodReviewScopeMemberView {
		if err := loadLatest(model.PeriodReviewScopeMemberView); err != nil {
			return nil, err
		}
	}
	if input.Scope == "" || input.Scope == model.PeriodReviewScopeWorkspaceView {
		if err := loadLatest(model.PeriodReviewScopeWorkspaceView); err != nil {
			return nil, err
		}
	}
	sort.Slice(reviews, func(i, j int) bool { return reviews[i].CutoffLedgerVersion > reviews[j].CutoffLedgerVersion })
	views := make([]model.PeriodReviewView, 0, len(reviews))
	for i := range reviews {
		if err := s.authorizePeriodReviewRead(ctx, reviews[i], actorID); err != nil {
			continue
		}
		vaultIDs, accountIDs, err := s.periodReviewScopeIDs(ctx, reviews[i])
		if err != nil {
			return nil, err
		}
		delta, count, err := s.periodRevisionSummary(ctx, reviews[i], vaultIDs, accountIDs)
		if err != nil {
			return nil, err
		}
		state := model.PeriodReviewStateCurrent
		if count > 0 {
			state = model.PeriodReviewStatePending
		}
		view := newPeriodReviewView(reviews[i])
		view.Delta, view.ChangeCount = delta, count
		view.ChangedAfterClose, view.ReviewState = reviews[i].Status == "closed" && count > 0, state
		views = append(views, view)
	}
	if err := s.hydratePeriodReviewers(ctx, actorID, views); err != nil {
		return nil, err
	}
	return views, nil
}

func (s *FinanceService) ListPeriodReviewChanges(ctx context.Context, workspaceID, actorID, reviewID string, limit, skip int64) ([]model.TransactionRevisionChange, error) {
	if err := s.requirePeriodReviewAccess(ctx, workspaceID, actorID); err != nil {
		return nil, err
	}
	var review model.PeriodReview
	if err := s.store.FindOne(ctx, periodReviewsCollection, repository.Filter{
		"_id": reviewID, "workspace_id": workspaceID,
	}, &review); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if err := s.authorizePeriodReviewRead(ctx, review, actorID); err != nil {
		return nil, err
	}
	scopeVaultIDs, scopeAccountIDs, err := s.periodReviewScopeIDs(ctx, review)
	if err != nil {
		return nil, err
	}
	events, err := s.periodRevisionEvents(ctx, review, scopeVaultIDs, scopeAccountIDs, limit, skip)
	if err != nil {
		return nil, err
	}
	vaultIDs, accountIDs, err := s.periodScopeIDs(ctx, workspaceID, actorID, model.PeriodReviewScopeMemberView)
	if err != nil {
		return nil, err
	}
	if len(vaultIDs) > maxPeriodReviewScopeIDs || len(accountIDs) > maxPeriodReviewScopeIDs {
		return nil, &FieldError{Field: "scope", Message: "contains too many vaults or accounts to evaluate safely"}
	}
	actorIDs := make([]string, 0, len(events))
	for _, event := range events {
		if event.ActorID != "" {
			actorIDs = append(actorIDs, event.ActorID)
		}
	}
	actorSummaries, err := s.periodReviewActorSummaries(ctx, workspaceID, actorIDs, actorID)
	if err != nil {
		return nil, err
	}
	changes := make([]model.TransactionRevisionChange, 0, len(events))
	for _, event := range events {
		action := "edited"
		if event.Before == nil {
			action = "added"
		} else if event.After == nil {
			action = "deleted"
		}
		editor := formerPeriodReviewMember()
		if summary, ok := actorSummaries[event.ActorID]; ok {
			editor = summary
		}
		beforeVisible := revisionVisibleToActor(review, event.Before, actorID, vaultIDs, accountIDs)
		afterVisible := revisionVisibleToActor(review, event.After, actorID, vaultIDs, accountIDs)
		before, after := event.Before, event.After
		if !beforeVisible {
			before = nil
		}
		if !afterVisible {
			after = nil
		}
		delta, err := periodEventDeltaVisible(review, event, beforeVisible, afterVisible)
		if err != nil {
			return nil, err
		}
		fields, splitChanged := []string{}, event.SplitAllocationChanged
		if beforeVisible && afterVisible {
			fields = sanitizedRevisionChangedFields(event.ChangedFields)
			if len(fields) == 0 {
				fields = changedRevisionFields(event.Before, event.After)
			}
		}
		if !beforeVisible || !afterVisible {
			splitChanged = false
		}
		changes = append(changes, model.TransactionRevisionChange{
			Action: action, Editor: editor, Before: before, After: after,
			BeforeRedacted: event.Before != nil && !beforeVisible, AfterRedacted: event.After != nil && !afterVisible,
			ChangedFields: fields, ChangedAt: event.CreatedAt, Delta: delta,
			SplitAllocationChanged: splitChanged, ApprovalState: model.ApprovalNotApplicable, RevisionState: model.RevisionCommitted,
		})
	}
	return changes, nil
}

func sanitizedRevisionChangedFields(fields []string) []string {
	allowed := map[string]struct{}{
		"transactionId": {}, "accountId": {}, "destinationAccountId": {}, "type": {},
		"amountMinor": {}, "currency": {}, "category": {}, "merchant": {}, "description": {},
		"notes": {}, "contactId": {}, "goalId": {}, "privacy": {}, "occurredAt": {},
		"hasSplits": {}, "tags": {},
	}
	result := make([]string, 0, len(fields))
	seen := make(map[string]struct{}, len(fields))
	for _, field := range fields {
		if _, ok := allowed[field]; !ok {
			continue
		}
		if _, duplicate := seen[field]; duplicate {
			continue
		}
		seen[field] = struct{}{}
		result = append(result, field)
	}
	return result
}

func (s *FinanceService) periodReviewScopeIDs(ctx context.Context, review model.PeriodReview) ([]string, []string, error) {
	vaultIDs, accountIDs, err := s.periodScopeIDs(ctx, review.WorkspaceID, review.ScopeActorID, review.Scope)
	if err != nil {
		return nil, nil, err
	}
	if len(vaultIDs) > maxPeriodReviewScopeIDs || len(accountIDs) > maxPeriodReviewScopeIDs {
		return nil, nil, &FieldError{Field: "scope", Message: "contains too many vaults or accounts to evaluate safely"}
	}
	return vaultIDs, accountIDs, nil
}

func (s *FinanceService) periodRevisionEvents(ctx context.Context, review model.PeriodReview, vaultIDs, accountIDs []string, limit, skip int64) ([]model.AuditEvent, error) {
	var events []model.AuditEvent
	filter := periodEventFilter(review, vaultIDs, accountIDs)
	production := false
	if capability, supported := s.store.(interface{ SupportsExactServerAggregation() bool }); supported && capability.SupportsExactServerAggregation() {
		production = true
	}
	if production {
		if err := s.store.FindMany(ctx, "audit_events", filter, &events, limit, skip, repository.Sort{"ledger_version": 1}); err != nil {
			return nil, err
		}
		return events, nil
	}
	if err := s.store.FindMany(ctx, "audit_events", filter, &events, 0, 0, repository.Sort{"ledger_version": 1}); err != nil {
		return nil, err
	}
	relevant := events[:0]
	for _, event := range events {
		if revisionInReviewScope(review, event.Before, vaultIDs, accountIDs) || revisionInReviewScope(review, event.After, vaultIDs, accountIDs) {
			relevant = append(relevant, event)
		}
	}
	sort.Slice(relevant, func(i, j int) bool {
		if relevant[i].LedgerVersion == relevant[j].LedgerVersion {
			return relevant[i].ID < relevant[j].ID
		}
		return relevant[i].LedgerVersion < relevant[j].LedgerVersion
	})
	start := int(skip)
	if start > len(relevant) {
		start = len(relevant)
	}
	end := start + int(limit)
	if end > len(relevant) {
		end = len(relevant)
	}
	return relevant[start:end], nil
}

func revisionInReviewScope(review model.PeriodReview, snapshot *model.TransactionRevisionSnapshot, vaultIDs, accountIDs []string) bool {
	if !revisionInReview(review, snapshot) {
		return false
	}
	if !contains(vaultIDs, snapshot.VaultID) || !contains(accountIDs, snapshot.AccountID) {
		return false
	}
	return snapshot.DestinationAccountID == "" || contains(accountIDs, snapshot.DestinationAccountID)
}

func revisionInReview(review model.PeriodReview, snapshot *model.TransactionRevisionSnapshot) bool {
	if snapshot == nil || snapshot.WorkspaceID != review.WorkspaceID || snapshot.Currency != review.Currency {
		return false
	}
	if review.Scope == model.PeriodReviewScopeWorkspaceView && snapshot.Privacy != "workspace" {
		return false
	}
	if review.Scope == model.PeriodReviewScopeMemberView && snapshot.Privacy != "workspace" && snapshot.CreatedBy != review.ScopeActorID {
		return false
	}
	if review.Scope != model.PeriodReviewScopeMemberView && review.Scope != model.PeriodReviewScopeWorkspaceView {
		return false
	}
	reportingDate := snapshot.ReportingDate
	date := snapshot.OccurredAt
	if date.IsZero() {
		date = snapshot.CreatedAt
	}
	if reportingDate == "" {
		reportingDate = date.UTC().Format("2006-01-02")
	}
	return reportingDate >= review.From && reportingDate <= review.To
}

func periodEventDelta(review model.PeriodReview, event model.AuditEvent) model.PeriodTotals {
	delta, _ := periodEventDeltaChecked(review, event)
	return delta
}

func periodEventDeltaChecked(review model.PeriodReview, event model.AuditEvent) (model.PeriodTotals, error) {
	return periodEventDeltaVisible(review, event, true, true)
}

func periodEventDeltaVisible(review model.PeriodReview, event model.AuditEvent, allowBefore, allowAfter bool) (model.PeriodTotals, error) {
	before, after := model.PeriodTotals{}, model.PeriodTotals{}
	if allowBefore && revisionInReview(review, event.Before) {
		before = totalsForRevision(event.Before)
	}
	if allowAfter && revisionInReview(review, event.After) {
		after = totalsForRevision(event.After)
	}
	return subtractPeriodTotals(after, before)
}
