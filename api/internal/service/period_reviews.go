package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const periodReviewsCollection = "period_reviews"

type PeriodReviewInput struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Timezone string `json:"timezone"`
	Status   string `json:"status"`
}

type periodBounds struct {
	from, to       string
	timezone       string
	fromUTC, toUTC time.Time
}

func normalizePeriodReviewInput(input PeriodReviewInput, requireStatus bool) (PeriodReviewInput, periodBounds, error) {
	input.From = strings.TrimSpace(input.From)
	input.To = strings.TrimSpace(input.To)
	input.Timezone = strings.TrimSpace(input.Timezone)
	input.Status = strings.ToLower(strings.TrimSpace(input.Status))
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
	return input, periodBounds{
		from: input.From, to: input.To, timezone: input.Timezone,
		fromUTC: from.UTC(), toUTC: to.AddDate(0, 0, 1).UTC(),
	}, nil
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
		// Advance the same document every ledger mutation increments. Mongo's
		// transaction conflict handling therefore orders this snapshot against
		// every transaction revision without inventing another lock collection.
		var workspace model.Workspace
		if err := s.store.UpdateOne(transactionCtx, "workspaces", repository.Filter{"_id": workspaceID}, repository.Filter{
			"$inc": repository.Filter{"ledger_version": int64(1)},
		}, &workspace); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		vaultIDs, err := s.accessibleVaultIDsUnchecked(transactionCtx, workspaceID, actorID)
		if err != nil {
			return nil, err
		}
		accountIDs, err := s.accessibleAccountIDs(transactionCtx, workspaceID, actorID, vaultIDs)
		if err != nil {
			return nil, err
		}
		transactions, err := s.periodTransactions(transactionCtx, workspaceID, actorID, workspace.Currency, vaultIDs, accountIDs, bounds)
		if err != nil {
			return nil, err
		}
		review := &model.PeriodReview{
			ID: newID(), WorkspaceID: workspaceID, Status: input.Status,
			Scope: model.PeriodReviewScopeMemberView, ScopeActorID: actorID,
			VaultIDs: append([]string(nil), vaultIDs...), AccountIDs: append([]string(nil), accountIDs...),
			From: bounds.from, To: bounds.to, Timezone: bounds.timezone,
			FromUTC: bounds.fromUTC, ToUTCExclusive: bounds.toUTC,
			Currency: workspace.Currency, Snapshot: totalsForTransactions(transactions),
			CutoffLedgerVersion: workspace.LedgerVersion, CreatedBy: actorID, CreatedAt: now,
		}
		if err := s.store.Insert(transactionCtx, periodReviewsCollection, review); err != nil {
			if errors.Is(err, repository.ErrConflict) {
				return nil, ErrConflict
			}
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
	return &model.PeriodReviewView{PeriodReview: *review}, nil
}

func (s *FinanceService) periodTransactions(ctx context.Context, workspaceID, actorID, currency string, vaultIDs, accountIDs []string, bounds periodBounds) ([]model.Transaction, error) {
	if len(vaultIDs) == 0 || len(accountIDs) == 0 {
		return []model.Transaction{}, nil
	}
	from, to := bounds.fromUTC, bounds.toUTC
	filter, empty, err := transactionQueryForScope(workspaceID, actorID, TransactionFilter{From: &from, To: &to}, vaultIDs, accountIDs)
	if err != nil || empty {
		return []model.Transaction{}, err
	}
	filter["currency"] = currency
	var transactions []model.Transaction
	if err := s.store.FindMany(ctx, "transactions", filter, &transactions, 0, 0, repository.Sort{"occurred_at": 1}); err != nil {
		return nil, err
	}
	return transactions, nil
}

func totalsForTransactions(transactions []model.Transaction) model.PeriodTotals {
	totals := model.PeriodTotals{}
	for i := range transactions {
		addPeriodTotals(&totals, totalsForRevision(model.NewTransactionRevisionSnapshot(&transactions[i])))
	}
	return totals
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

func addPeriodTotals(destination *model.PeriodTotals, delta model.PeriodTotals) {
	destination.IncomeMinor += delta.IncomeMinor
	destination.SpendingMinor += delta.SpendingMinor
	destination.NetMinor += delta.NetMinor
	destination.TransactionCount += delta.TransactionCount
}

func subtractPeriodTotals(after, before model.PeriodTotals) model.PeriodTotals {
	return model.PeriodTotals{
		IncomeMinor:      after.IncomeMinor - before.IncomeMinor,
		SpendingMinor:    after.SpendingMinor - before.SpendingMinor,
		NetMinor:         after.NetMinor - before.NetMinor,
		TransactionCount: after.TransactionCount - before.TransactionCount,
	}
}

func (s *FinanceService) ListPeriodReviews(ctx context.Context, workspaceID, actorID string, input PeriodReviewInput) ([]model.PeriodReviewView, error) {
	if err := s.requirePeriodReviewAccess(ctx, workspaceID, actorID); err != nil {
		return nil, err
	}
	_, bounds, err := normalizePeriodReviewInput(input, false)
	if err != nil {
		return nil, err
	}
	var reviews []model.PeriodReview
	if err := s.store.FindMany(ctx, periodReviewsCollection, repository.Filter{
		"workspace_id": workspaceID, "created_by": actorID, "scope_actor_id": actorID,
		"scope": model.PeriodReviewScopeMemberView, "from": bounds.from, "to": bounds.to, "timezone": bounds.timezone,
	}, &reviews, 1, 0, repository.Sort{"created_at": -1}); err != nil {
		return nil, err
	}
	views := make([]model.PeriodReviewView, 0, len(reviews))
	for i := range reviews {
		events, err := s.periodRevisionEvents(ctx, reviews[i])
		if err != nil {
			return nil, err
		}
		delta := model.PeriodTotals{}
		for _, event := range events {
			addPeriodTotals(&delta, periodEventDelta(reviews[i], event))
		}
		views = append(views, model.PeriodReviewView{
			PeriodReview: reviews[i], Delta: delta, ChangeCount: int64(len(events)),
			ChangedAfterClose: reviews[i].Status == "closed" && len(events) > 0,
		})
	}
	return views, nil
}

func (s *FinanceService) ListPeriodReviewChanges(ctx context.Context, workspaceID, actorID, reviewID string, limit, skip int64) ([]model.TransactionRevisionChange, error) {
	if err := s.requirePeriodReviewAccess(ctx, workspaceID, actorID); err != nil {
		return nil, err
	}
	var review model.PeriodReview
	if err := s.store.FindOne(ctx, periodReviewsCollection, repository.Filter{
		"_id": reviewID, "workspace_id": workspaceID, "created_by": actorID, "scope_actor_id": actorID,
	}, &review); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	events, err := s.periodRevisionEvents(ctx, review)
	if err != nil {
		return nil, err
	}
	start := int(skip)
	if start > len(events) {
		start = len(events)
	}
	end := start + int(limit)
	if end > len(events) {
		end = len(events)
	}
	events = events[start:end]
	users := make(map[string]model.User)
	actorIDs := make([]string, 0, len(events))
	for _, event := range events {
		if event.ActorID != "" {
			actorIDs = append(actorIDs, event.ActorID)
		}
	}
	if len(actorIDs) > 0 {
		var found []model.User
		if err := s.store.FindMany(ctx, "users", repository.Filter{"_id": repository.Filter{"$in": actorIDs}}, &found, int64(len(actorIDs)), 0, nil); err != nil {
			return nil, err
		}
		for _, user := range found {
			users[user.ID] = user
		}
	}
	changes := make([]model.TransactionRevisionChange, 0, len(events))
	for _, event := range events {
		action := "edited"
		if event.Before == nil {
			action = "added"
		} else if event.After == nil {
			action = "deleted"
		}
		editor := &model.CreatorSummary{Name: "Former member", Initials: "FM", Status: "former"}
		if user, ok := users[event.ActorID]; ok {
			editor = &model.CreatorSummary{Name: valueOrDefault(strings.TrimSpace(user.Name), "Workspace member"), Initials: initialsForName(user.Name), ProfileImageURL: user.ProfileImageURL, Status: "active", IsCurrentUser: event.ActorID == actorID}
		}
		changes = append(changes, model.TransactionRevisionChange{
			Action: action, Editor: editor, Before: event.Before, After: event.After,
			ChangedAt: event.CreatedAt, LedgerVersion: event.LedgerVersion,
			Delta: periodEventDelta(review, event), ApprovalState: model.ApprovalNotApplicable, RevisionState: model.RevisionCommitted,
		})
	}
	return changes, nil
}

func (s *FinanceService) periodRevisionEvents(ctx context.Context, review model.PeriodReview) ([]model.AuditEvent, error) {
	var events []model.AuditEvent
	if err := s.store.FindMany(ctx, "audit_events", repository.Filter{
		"workspace_id": review.WorkspaceID, "entity_type": "transaction",
		"ledger_version": repository.Filter{"$gt": review.CutoffLedgerVersion},
	}, &events, 0, 0, repository.Sort{"ledger_version": 1}); err != nil {
		return nil, err
	}
	relevant := events[:0]
	for _, event := range events {
		if revisionInReview(review, event.Before) || revisionInReview(review, event.After) {
			relevant = append(relevant, event)
		}
	}
	return relevant, nil
}

func revisionInReview(review model.PeriodReview, snapshot *model.TransactionRevisionSnapshot) bool {
	if snapshot == nil || snapshot.Currency != review.Currency || !contains(review.VaultIDs, snapshot.VaultID) || !contains(review.AccountIDs, snapshot.AccountID) {
		return false
	}
	if snapshot.Privacy != "workspace" && snapshot.CreatedBy != review.ScopeActorID {
		return false
	}
	date := snapshot.OccurredAt
	if date.IsZero() {
		date = snapshot.CreatedAt
	}
	date = date.UTC()
	return !date.Before(review.FromUTC) && date.Before(review.ToUTCExclusive)
}

func periodEventDelta(review model.PeriodReview, event model.AuditEvent) model.PeriodTotals {
	before, after := model.PeriodTotals{}, model.PeriodTotals{}
	if revisionInReview(review, event.Before) {
		before = totalsForRevision(event.Before)
	}
	if revisionInReview(review, event.After) {
		after = totalsForRevision(event.After)
	}
	return subtractPeriodTotals(after, before)
}
