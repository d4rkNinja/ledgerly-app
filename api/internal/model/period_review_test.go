package model

import (
	"encoding/json"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

func TestAuditRevisionFieldsAreBSONOnly(t *testing.T) {
	event := AuditEvent{
		ID: "audit-a", WorkspaceID: "workspace-a", ActorID: "user-a",
		Action: "transaction.updated", EntityType: "transaction", EntityID: "transaction-a",
		LedgerVersion: 7,
		Before:        &TransactionRevisionSnapshot{ID: "transaction-a", Notes: "sensitive before"},
		After:         &TransactionRevisionSnapshot{ID: "transaction-a", Notes: "sensitive after"},
	}
	encoded, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	var public map[string]any
	if err := json.Unmarshal(encoded, &public); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"ledgerVersion", "before", "after"} {
		if _, exposed := public[key]; exposed {
			t.Fatalf("generic audit JSON exposed %q: %s", key, encoded)
		}
	}
	stored, err := bson.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	var internal bson.M
	if err := bson.Unmarshal(stored, &internal); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"ledger_version", "before", "after"} {
		if _, persisted := internal[key]; !persisted {
			t.Fatalf("BSON omitted %q: %#v", key, internal)
		}
	}
}
