package service

import (
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

func TestEffectiveTransactionDateNeverReinterpretsAValidDeclaredDate(t *testing.T) {
	declared := time.Date(2026, time.July, 15, 9, 30, 0, 0, time.FixedZone("IST", 5*60*60+30*60))
	created := time.Date(2026, time.August, 6, 12, 0, 0, 0, time.UTC)

	got := effectiveTransactionDate(model.Transaction{OccurredAt: declared, CreatedAt: created})
	if !got.Equal(declared.UTC()) {
		t.Fatalf("effective date = %s, want declared date %s", got, declared.UTC())
	}
}

func TestEffectiveTransactionDateFallsBackOnlyForLegacyZeroDate(t *testing.T) {
	created := time.Date(2026, time.August, 6, 12, 0, 0, 0, time.UTC)
	got := effectiveTransactionDate(model.Transaction{CreatedAt: created})
	if !got.Equal(created) {
		t.Fatalf("legacy effective date = %s, want created date %s", got, created)
	}
}

func TestDeclaredJulyDateCreatedInAugustBelongsOnlyToJulyReport(t *testing.T) {
	transaction := model.Transaction{
		OccurredAt: time.Date(2026, time.July, 15, 0, 0, 0, 0, time.UTC),
		CreatedAt:  time.Date(2026, time.August, 6, 12, 0, 0, 0, time.UTC),
	}
	effective := effectiveTransactionDate(transaction)
	julyStart := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)
	augustStart := time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC)
	septemberStart := time.Date(2026, time.September, 1, 0, 0, 0, 0, time.UTC)
	if !effective.Before(augustStart) || !effective.After(julyStart) {
		t.Fatalf("effective date %s was not inside the July half-open month", effective)
	}
	if !effective.Before(augustStart) && effective.Before(septemberStart) {
		t.Fatalf("effective date %s was included in August unexpectedly", effective)
	}
}

func TestEffectiveTransactionDateClauseIsHalfOpenAndIncludesLegacyRecords(t *testing.T) {
	from := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC)
	clause := effectiveTransactionDateClause(DateRange{From: &from, To: &to})

	branches, ok := clause["$or"].([]repository.Filter)
	if !ok || len(branches) != 2 {
		t.Fatalf("date clause = %#v, want modern and legacy branches", clause)
	}
	modern, ok := branches[0]["occurred_at"].(repository.Filter)
	if !ok || !modern["$gte"].(time.Time).Equal(from) || !modern["$lt"].(time.Time).Equal(to) {
		t.Fatalf("modern date bounds = %#v, want [%s,%s)", modern, from, to)
	}
	legacy, ok := branches[1]["$and"].([]repository.Filter)
	if !ok || len(legacy) != 2 {
		t.Fatalf("legacy date branch = %#v, want zero/absent plus created_at bounds", branches[1])
	}
	createdBounds, ok := legacy[1]["created_at"].(repository.Filter)
	if !ok || !createdBounds["$gte"].(time.Time).Equal(from) || !createdBounds["$lt"].(time.Time).Equal(to) {
		t.Fatalf("legacy created_at bounds = %#v, want [%s,%s)", createdBounds, from, to)
	}
}

func TestNormalizeDateRangeRejectsEmptyAndReversedRanges(t *testing.T) {
	from := time.Date(2026, time.July, 10, 0, 0, 0, 0, time.UTC)
	for _, to := range []time.Time{from, from.Add(-time.Hour)} {
		if _, err := normalizeDateRange(DateRange{From: &from, To: &to}); err == nil {
			t.Fatalf("normalizeDateRange(%s) returned nil error", to)
		}
	}
}
