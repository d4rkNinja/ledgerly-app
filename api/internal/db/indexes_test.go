package db

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func TestMongoIndexSpecificationsAreDeterministicAndUnique(t *testing.T) {
	specifications := mongoIndexSpecifications()
	seenCollections := make(map[string]bool, len(specifications))
	for _, specification := range specifications {
		if seenCollections[specification.collection] {
			t.Fatalf("collection %q is declared more than once", specification.collection)
		}
		seenCollections[specification.collection] = true

		seenNames := make(map[string]bool, len(specification.models))
		for _, index := range specification.models {
			if index.Options == nil || index.Options.Name == nil || *index.Options.Name == "" {
				t.Fatalf("collection %q contains an unnamed index", specification.collection)
			}
			if seenNames[*index.Options.Name] {
				t.Fatalf("collection %q contains duplicate index name %q", specification.collection, *index.Options.Name)
			}
			seenNames[*index.Options.Name] = true
		}
	}

	required := []string{
		"users", "workspaces", "sessions", "memberships", "invitations", "workspace_join_requests", "idempotency",
		"transactions", "vaults", "accounts", "budgets", "goals", "goal_action_idempotency",
		"recurring_transactions", "expense_claims", "notifications", "transaction_categories", "transaction_sequences", "audit_events",
	}
	for _, collection := range required {
		if !seenCollections[collection] {
			t.Errorf("missing index specification for collection %q", collection)
		}
	}
}

func TestTenantHistoryIndexesMatchRepositorySort(t *testing.T) {
	tests := []struct {
		collection string
		name       string
		keys       bson.D
	}{
		{
			collection: "transactions",
			name:       "workspace_vault_history",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "occurred_at", Value: -1}, {Key: "_id", Value: -1}},
		},
		{
			collection: "accounts",
			name:       "workspace_account_history",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "archived", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}},
		},
		{
			collection: "notifications",
			name:       "user_notification_history",
			keys:       bson.D{{Key: "user_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}},
		},
		{
			collection: "vaults",
			name:       "vault_search",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "name", Value: "text"}},
		},
		{
			collection: "accounts",
			name:       "account_search",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "name", Value: "text"}},
		},
		{
			collection: "recurring_transactions",
			name:       "workspace_upcoming_bills",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "next_due_at", Value: 1}, {Key: "_id", Value: 1}},
		},
	}

	for _, test := range tests {
		t.Run(test.collection+"/"+test.name, func(t *testing.T) {
			got, ok := findIndexKeys(test.collection, test.name)
			if !ok {
				t.Fatalf("index %q not found on %q", test.name, test.collection)
			}
			if !reflect.DeepEqual(got, test.keys) {
				t.Fatalf("keys = %#v, want %#v", got, test.keys)
			}
		})
	}
}

func TestOperationalIndexesMatchServiceFilters(t *testing.T) {
	tests := []struct {
		collection string
		name       string
		keys       bson.D
	}{
		{
			collection: "transactions",
			name:       "workspace_transaction_id_lookup",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "transaction_id", Value: 1}},
		},
		{
			collection: "transaction_sequences",
			name:       "workspace_transaction_sequence_unique",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "transaction_type", Value: 1}},
		},
		{
			collection: "workspace_join_requests",
			name:       "workspace_pending_requests",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: -1}},
		},
		{
			collection: "workspace_join_requests",
			name:       "pending_workspace_requester_unique",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "requester_id", Value: 1}},
		},
		{
			collection: "invitations",
			name:       "invitation_ttl",
			keys:       bson.D{{Key: "expires_at", Value: 1}},
		},
		{
			collection: "invitations",
			name:       "pending_workspace_email_unique",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "email", Value: 1}},
		},
		{
			collection: "expense_claims",
			name:       "approval_count",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "status", Value: 1}, {Key: "vault_id", Value: 1}},
		},
		{
			collection: "expense_claims",
			name:       "actionable_approval_count",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "status", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "submitted_by", Value: 1}},
		},
		{
			collection: "notifications",
			name:       "user_read_status",
			keys:       bson.D{{Key: "user_id", Value: 1}, {Key: "read_at", Value: 1}},
		},
		{
			collection: "expense_claims",
			name:       "workspace_claim_vault_history",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}},
		},
		{
			collection: "expense_claims",
			name:       "claim_submitter_history",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "submitted_by", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}},
		},
		{
			collection: "memberships",
			name:       "user_workspaces",
			keys:       bson.D{{Key: "user_id", Value: 1}},
		},
		{
			collection: "memberships",
			name:       "user_membership_scan",
			keys:       bson.D{{Key: "user_id", Value: 1}, {Key: "_id", Value: 1}},
		},
		{
			collection: "transaction_categories",
			name:       "workspace_type_category_name_unique",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "transaction_type", Value: 1}, {Key: "normalized_name", Value: 1}},
		},
		{
			collection: "transaction_categories",
			name:       "workspace_type_category_order",
			keys:       bson.D{{Key: "workspace_id", Value: 1}, {Key: "transaction_type", Value: 1}, {Key: "sort_order", Value: 1}, {Key: "name", Value: 1}, {Key: "_id", Value: 1}},
		},
	}

	transactionID := findIndex(t, "transactions", "workspace_sequence_transaction_id_unique")
	if transactionID.Options.Unique == nil || !*transactionID.Options.Unique {
		t.Fatal("transaction ID index must be unique")
	}
	if !reflect.DeepEqual(transactionID.Options.PartialFilterExpression, transactionIDIndexFilter()) {
		t.Fatalf("transaction ID partial filter = %#v, want %#v", transactionID.Options.PartialFilterExpression, transactionIDIndexFilter())
	}

	for _, test := range tests {
		t.Run(test.collection+"/"+test.name, func(t *testing.T) {
			got, ok := findIndexKeys(test.collection, test.name)
			if !ok {
				t.Fatalf("index %q not found on %q", test.name, test.collection)
			}
			if !reflect.DeepEqual(got, test.keys) {
				t.Fatalf("keys = %#v, want %#v", got, test.keys)
			}
		})
	}

	pending := findIndex(t, "invitations", "pending_workspace_email_unique")
	if pending.Options.Unique == nil || !*pending.Options.Unique {
		t.Fatal("pending invitation index must be unique")
	}
	wantEmailPartial := pendingInvitationEmailIndexFilter()
	if !reflect.DeepEqual(pending.Options.PartialFilterExpression, wantEmailPartial) {
		t.Fatalf("partial filter = %#v, want %#v", pending.Options.PartialFilterExpression, wantEmailPartial)
	}

	ttl := findIndex(t, "invitations", "invitation_ttl")
	if ttl.Options.ExpireAfterSeconds == nil || *ttl.Options.ExpireAfterSeconds != 0 {
		t.Fatalf("invitation TTL = %#v, want 0", ttl.Options.ExpireAfterSeconds)
	}
	wantPendingPartial := bson.D{{Key: "status", Value: "pending"}}
	if !reflect.DeepEqual(ttl.Options.PartialFilterExpression, wantPendingPartial) {
		t.Fatalf("TTL partial filter = %#v, want %#v", ttl.Options.PartialFilterExpression, wantPendingPartial)
	}

	categoryUnique := findIndex(t, "transaction_categories", "workspace_type_category_name_unique")
	if categoryUnique.Options.Unique == nil || !*categoryUnique.Options.Unique {
		t.Fatal("transaction category normalized-name index must be unique")
	}
}

func findIndex(t *testing.T, collection, name string) mongo.IndexModel {
	t.Helper()
	for _, specification := range mongoIndexSpecifications() {
		if specification.collection != collection {
			continue
		}
		for _, index := range specification.models {
			if index.Options != nil && index.Options.Name != nil && *index.Options.Name == name {
				return index
			}
		}
	}
	t.Fatalf("index %q not found on %q", name, collection)
	return mongo.IndexModel{}
}

func findIndexKeys(collection, name string) (bson.D, bool) {
	for _, specification := range mongoIndexSpecifications() {
		if specification.collection != collection {
			continue
		}
		for _, index := range specification.models {
			if index.Options != nil && index.Options.Name != nil && *index.Options.Name == name {
				keys, ok := index.Keys.(bson.D)
				return keys, ok
			}
		}
	}
	return nil, false
}
