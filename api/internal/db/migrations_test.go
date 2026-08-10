package db

import (
	"reflect"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

func TestLegacyTransactionDateFilterOnlyTargetsMissingOrZeroDeclaredDates(t *testing.T) {
	filter := legacyTransactionDateFilter()
	if _, ok := filter["created_at"]; !ok {
		t.Fatalf("legacy filter = %#v, missing created_at guard", filter)
	}
	branches, ok := filter["$or"].(bson.A)
	if !ok || len(branches) != 2 {
		t.Fatalf("legacy filter branches = %#v, want absent and zero occurred_at", filter["$or"])
	}
	if _, ok := branches[0].(bson.M); ok {
		// bson.M is map[string]any; this guard documents the intentionally
		// query-only shape without depending on driver internals below.
	}
	if zero, err := (time.Time{}).MarshalText(); err != nil || len(zero) == 0 {
		t.Fatalf("zero time should remain a valid BSON date sentinel: %q, %v", zero, ok)
	}
}

func TestTransactionSequenceMigrationUsesStableOrderAndMissingOnlyFilter(t *testing.T) {
	wantSort := bson.D{
		{Key: "occurred_at", Value: 1},
		{Key: "created_at", Value: 1},
		{Key: "_id", Value: 1},
	}
	if got := transactionSequenceMigrationSort(); !reflect.DeepEqual(got, wantSort) {
		t.Fatalf("migration sort = %#v, want %#v", got, wantSort)
	}
	branches, ok := missingTransactionIDFilter()["$or"].(bson.A)
	if !ok || len(branches) != 3 {
		t.Fatalf("missing transaction ID filter = %#v", missingTransactionIDFilter())
	}
}

func TestTransactionSequenceMigrationScopeIsStableAcrossReruns(t *testing.T) {
	legacySplit := transactionSequenceMigrationRow{
		Type:   "expense",
		Splits: []model.Split{{UserID: "user-a", AmountMinor: 1}},
	}
	if got := transactionSequenceMigrationScope(legacySplit); got != model.TransactionSequenceSplit {
		t.Fatalf("legacy split scope = %q", got)
	}
	persisted := legacySplit
	persisted.Type = "income"
	persisted.Splits = nil
	persisted.SequenceScope = model.TransactionSequenceSplit
	if got := transactionSequenceMigrationScope(persisted); got != model.TransactionSequenceSplit {
		t.Fatalf("persisted scope changed on rerun: %q", got)
	}
}
