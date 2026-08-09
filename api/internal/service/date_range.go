package service

import (
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

// DateRange represents a UTC half-open time range. From is inclusive and To
// is exclusive. HTTP handlers convert a user-facing inclusive YYYY-MM-DD end
// date to the following UTC midnight before constructing this value.
type DateRange struct {
	From *time.Time
	To   *time.Time
}

// effectiveTransactionDate is the single reporting-date policy used by the
// finance service. A non-zero OccurredAt is always authoritative. CreatedAt
// is used only for legacy records that predate occurred_at (or contain its
// zero BSON timestamp); it is never copied back into the transaction.
func effectiveTransactionDate(transaction model.Transaction) time.Time {
	if !transaction.OccurredAt.IsZero() {
		return transaction.OccurredAt.UTC()
	}
	return transaction.CreatedAt.UTC()
}

func transactionDateBounds(dateRange DateRange) repository.Filter {
	bounds := repository.Filter{}
	if dateRange.From != nil {
		bounds["$gte"] = dateRange.From.UTC()
	}
	if dateRange.To != nil {
		bounds["$lt"] = dateRange.To.UTC()
	}
	return bounds
}

// effectiveTransactionDateClause includes both modern records and legacy
// records whose occurred_at is absent/zero. Keeping the two branches explicit
// lets Mongo use the workspace/date indexes for current data while retaining a
// safe compatibility path for old records.
func effectiveTransactionDateClause(dateRange DateRange) repository.Filter {
	if dateRange.From == nil && dateRange.To == nil {
		return nil
	}
	bounds := transactionDateBounds(dateRange)
	return repository.Filter{"$or": []repository.Filter{
		{"occurred_at": bounds},
		{"$and": []repository.Filter{
			{"$or": []repository.Filter{
				{"occurred_at": repository.Filter{"$exists": false}},
				{"occurred_at": time.Time{}},
			}},
			{"created_at": bounds},
		}},
	}}
}

func addTransactionDateClause(query repository.Filter, dateRange DateRange) {
	clause := effectiveTransactionDateClause(dateRange)
	if clause == nil {
		return
	}
	// A query already has a privacy $or. Move all top-level predicates into an
	// $and so the date compatibility $or cannot accidentally replace it.
	clauses := []repository.Filter{}
	for key, value := range query {
		clauses = append(clauses, repository.Filter{key: value})
	}
	clauses = append(clauses, clause)
	for key := range query {
		delete(query, key)
	}
	query["$and"] = clauses
}

func normalizeDateRange(input DateRange) (DateRange, error) {
	if input.From != nil {
		from := input.From.UTC()
		input.From = &from
	}
	if input.To != nil {
		to := input.To.UTC()
		input.To = &to
	}
	if input.From != nil && input.To != nil && !input.To.After(*input.From) {
		return DateRange{}, &FieldError{Field: "period", Message: "to must be after from"}
	}
	return input, nil
}

func applyDateRangeToTransactionQuery(query repository.Filter, dateRange DateRange) {
	addTransactionDateClause(query, dateRange)
}
