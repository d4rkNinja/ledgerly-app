package model

import (
	"encoding/json"
	"testing"
)

func TestTransactionMarshalJSONOmitsProtectedSplitAndTagFields(t *testing.T) {
	transaction := Transaction{
		ID:     "transaction-internal-id",
		Tags:   []string{"internal-workflow"},
		Splits: []Split{{UserID: "member-internal-id", AmountMinor: 1_000}},
	}

	encoded, err := json.Marshal(transaction)
	if err != nil {
		t.Fatalf("Marshal transaction: %v", err)
	}
	var response map[string]any
	if err := json.Unmarshal(encoded, &response); err != nil {
		t.Fatalf("Unmarshal response: %v", err)
	}
	if _, exists := response["tags"]; exists {
		t.Fatalf("tags leaked in public transaction response: %s", encoded)
	}
	if _, exists := response["splits"]; exists {
		t.Fatalf("splits leaked in public transaction response: %s", encoded)
	}
	if response["hasSplits"] != true {
		t.Fatalf("hasSplits = %#v, want true", response["hasSplits"])
	}
}

func TestFinanceRecordMarshalJSONHidesStorageRelationships(t *testing.T) {
	tests := []struct {
		name    string
		record  any
		blocked []string
	}{
		{
			name:    "account",
			record:  Account{ID: "account-a", WorkspaceID: "workspace-internal", VaultID: "vault-internal", OwnerID: "owner-internal"},
			blocked: []string{"workspaceId", "vaultId", "ownerId"},
		},
		{
			name:    "budget",
			record:  Budget{ID: "budget-a", WorkspaceID: "workspace-internal", VaultID: "vault-internal", CreatedBy: "owner-internal"},
			blocked: []string{"workspaceId", "vaultId", "createdBy"},
		},
		{
			name:    "goal",
			record:  Goal{ID: "goal-a", WorkspaceID: "workspace-internal", VaultID: "vault-internal", CreatedBy: "owner-internal"},
			blocked: []string{"workspaceId", "vaultId", "createdBy"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			encoded, err := json.Marshal(test.record)
			if err != nil {
				t.Fatalf("Marshal record: %v", err)
			}
			var response map[string]any
			if err := json.Unmarshal(encoded, &response); err != nil {
				t.Fatalf("Unmarshal response: %v", err)
			}
			for _, field := range test.blocked {
				if _, exists := response[field]; exists {
					t.Fatalf("%s leaked in public response: %s", field, encoded)
				}
			}
		})
	}
}
