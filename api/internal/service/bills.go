package service

import (
	"context"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const upcomingBillsWindowDays = 30

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
