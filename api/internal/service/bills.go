package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const upcomingBillsWindowDays = 30

// BillFrequencies is the supported recurrence vocabulary. It matches the
// cadence steps the forecast uses, so accepted suggestions and manual bills
// project identically.
var billFrequencies = map[string]struct{}{
	"daily": {}, "weekly": {}, "fortnightly": {},
	"monthly": {}, "quarterly": {}, "yearly": {},
}

type BillInput struct {
	Name        string    `json:"name"`
	AmountMinor int64     `json:"amountMinor"`
	Currency    string    `json:"currency"`
	Frequency   string    `json:"frequency"`
	DueDate     time.Time `json:"dueDate"`
	Autopay     bool      `json:"autopay"`
}

func (s *FinanceService) normalizeBillInput(ctx context.Context, workspaceID string, input BillInput) (*model.Bill, error) {
	name, err := validatedText("name", input.Name, 1, 100)
	if err != nil {
		return nil, err
	}
	if err := validateMoney("amountMinor", input.AmountMinor, false); err != nil {
		return nil, err
	}
	frequency := strings.ToLower(strings.TrimSpace(input.Frequency))
	if _, known := billFrequencies[frequency]; !known {
		return nil, &FieldError{Field: "frequency", Message: "must be one of daily, weekly, fortnightly, monthly, quarterly, or yearly"}
	}
	if input.DueDate.IsZero() {
		return nil, &FieldError{Field: "dueDate", Message: "is required"}
	}
	workspace, err := s.requireWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	currency, err := validCurrency(input.Currency)
	if err != nil {
		return nil, err
	}
	if currency != workspace.Currency {
		return nil, &FieldError{Field: "currency", Message: "must match the workspace currency"}
	}
	return &model.Bill{
		Name:        name,
		AmountMinor: input.AmountMinor,
		Currency:    currency,
		Frequency:   frequency,
		DueDate:     input.DueDate.UTC(),
		Autopay:     input.Autopay,
	}, nil
}

func (s *FinanceService) CreateBill(ctx context.Context, workspaceID, actorID string, input BillInput) (*model.Bill, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageBills); err != nil {
		return nil, err
	}
	bill, err := s.normalizeBillInput(ctx, workspaceID, input)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	bill.ID = newID()
	bill.WorkspaceID = workspaceID
	bill.OwnerID = actorID
	bill.Privacy = "workspace"
	active := true
	bill.Active = &active
	bill.CreatedAt = now
	if err := s.store.Insert(ctx, "recurring_transactions", bill); err != nil {
		return nil, err
	}
	if auditErr := s.audit(ctx, workspaceID, actorID, "bill.created", "bill", bill.ID, map[string]any{
		"name": bill.Name, "amountMinor": bill.AmountMinor, "frequency": bill.Frequency,
	}); auditErr != nil {
		return nil, auditErr
	}
	return bill, nil
}

func (s *FinanceService) UpdateBill(ctx context.Context, workspaceID, actorID, billID string, input BillInput) (*model.Bill, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageBills); err != nil {
		return nil, err
	}
	var existing model.Bill
	if err := s.store.FindOne(ctx, "recurring_transactions", repository.Filter{
		"_id":          billID,
		"workspace_id": workspaceID,
	}, &existing); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	normalized, err := s.normalizeBillInput(ctx, workspaceID, input)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	var updated model.Bill
	if err := s.store.UpdateOne(ctx, "recurring_transactions", repository.Filter{
		"_id":          billID,
		"workspace_id": workspaceID,
	}, repository.Filter{"$set": repository.Filter{
		"title":       normalized.Name,
		"amount_minor": normalized.AmountMinor,
		"currency":    normalized.Currency,
		"frequency":   normalized.Frequency,
		"next_due_at": normalized.DueDate,
		"autopay":     normalized.Autopay,
		"updated_at":  now,
	}}, &updated); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if auditErr := s.audit(ctx, workspaceID, actorID, "bill.updated", "bill", billID, map[string]any{
		"name": normalized.Name,
	}); auditErr != nil {
		return nil, auditErr
	}
	return &updated, nil
}

// DeleteBill deactivates a recurring bill. Historical projections and any past
// detection evidence remain untouched; the bill simply stops appearing in
// upcoming lists, overdue attention items, and forecasts.
func (s *FinanceService) DeleteBill(ctx context.Context, workspaceID, actorID, billID string) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageBills); err != nil {
		return err
	}
	var existing model.Bill
	if err := s.store.FindOne(ctx, "recurring_transactions", repository.Filter{
		"_id":          billID,
		"workspace_id": workspaceID,
	}, &existing); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	var updated model.Bill
	if err := s.store.UpdateOne(ctx, "recurring_transactions", repository.Filter{
		"_id":          billID,
		"workspace_id": workspaceID,
	}, repository.Filter{"$set": repository.Filter{
		"active":     false,
		"updated_at": time.Now().UTC(),
	}}, &updated); err != nil && !errors.Is(err, repository.ErrNotFound) {
		return err
	}
	return s.audit(ctx, workspaceID, actorID, "bill.deleted", "bill", billID, map[string]any{
		"name": existing.Name,
	})
}

// ListBills returns active recurring payments due today through the next
// thirty UTC calendar days. The workspace model does not currently expose a
// timezone, so UTC is the explicit and deterministic calendar boundary.
//
// Missing active is accepted for compatibility with legacy scheduling records.
// Privacy fails closed: records must be explicitly workspace-visible or owned
// by the requesting actor.
func (s *FinanceService) ListBills(
	ctx context.Context,
	workspaceID string,
	actorID string,
	limit int64,
	skip int64,
) ([]model.Bill, error) {
	return s.listBillsAt(ctx, workspaceID, actorID, limit, skip, time.Now().UTC())
}

func (s *FinanceService) listBillsAt(
	ctx context.Context,
	workspaceID string,
	actorID string,
	limit int64,
	skip int64,
	now time.Time,
) ([]model.Bill, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}

	if limit <= 0 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	if skip < 0 {
		skip = 0
	}

	from, through := upcomingBillsUTCWindow(now)
	filter := repository.Filter{
		"workspace_id": workspaceID,
		"next_due_at": repository.Filter{
			"$gte": from,
			"$lt":  through,
		},
		"$and": []repository.Filter{
			{
				"$or": []repository.Filter{
					{"active": true},
					{"active": repository.Filter{"$exists": false}},
				},
			},
			{
				"$or": []repository.Filter{
					{"privacy": "workspace"},
					{"owner_id": actorID},
				},
			},
		},
	}

	bills := make([]model.Bill, 0)
	if err := s.store.FindMany(
		ctx,
		"recurring_transactions",
		filter,
		&bills,
		limit,
		skip,
		repository.Sort{"next_due_at": 1},
	); err != nil {
		return nil, err
	}
	if bills == nil {
		bills = make([]model.Bill, 0)
	}
	return bills, nil
}

func upcomingBillsUTCWindow(now time.Time) (time.Time, time.Time) {
	utc := now.UTC()
	start := time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC)
	return start, start.AddDate(0, 0, upcomingBillsWindowDays+1)
}
