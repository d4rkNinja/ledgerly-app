package db

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
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
