package db

import (
	"reflect"
	"testing"
)

func TestMongoIndexCreationOrderIsStable(t *testing.T) {
	want := []struct {
		collection string
		indexes    []string
	}{
		{collection: "users", indexes: []string{"email_unique"}},
		{
			collection: "sessions",
			indexes: []string{
				"token_hash_unique",
				"session_ttl",
				"user_active_sessions",
				"user_session_history",
			},
		},
		{
			collection: "memberships",
			indexes: []string{
				"workspace_user_unique",
				"user_workspaces",
				"user_membership_scan",
			},
		},
		{
			collection: "invitations",
			indexes: []string{
				"invitation_token_unique",
				"workspace_email_status",
				"invitation_ttl",
				"pending_workspace_email_unique",
			},
		},
		{
			collection: "workspace_member_removals",
			indexes:    []string{"workspace_member_removal_history"},
		},
		{
			collection: "workspaces",
			indexes:    []string{"workspace_join_code_unique", "workspace_join_code_lookup"},
		},
		{
			collection: "workspace_join_requests",
			indexes:    []string{"workspace_pending_requests", "pending_workspace_requester_unique"},
		},
		{
			collection: "idempotency",
			indexes:    []string{"user_key_unique", "idempotency_ttl"},
		},
		{
			collection: "transactions",
			indexes: []string{
				"workspace_history",
				"workspace_created_history",
				"account_history",
				"category_reports",
				"transaction_search",
				"workspace_sequence_transaction_id_unique",
				"workspace_transaction_id_lookup",
				"workspace_vault_history",
				"workspace_vault_account_history",
				"workspace_vault_type_history",
				"workspace_vault_category_history",
				"workspace_vault_contact_history",
				"workspace_goal_history",
			},
		},
		{
			collection: "transaction_sequences",
			indexes:    []string{"workspace_transaction_sequence_unique"},
		},
		{
			collection: "vaults",
			indexes: []string{
				"workspace_vaults",
				"workspace_vault_history",
				"vault_search",
			},
		},
		{
			collection: "accounts",
			indexes: []string{
				"workspace_accounts",
				"workspace_account_history",
				"account_search",
			},
		},
		{
			collection: "budgets",
			indexes:    []string{"workspace_budgets", "workspace_budget_history"},
		},
		{
			collection: "recurring_transactions",
			indexes:    []string{"workspace_upcoming_bills"},
		},
		{
			collection: "goals",
			indexes:    []string{"workspace_goals", "workspace_goal_history", "workspace_goal_due_dates", "workspace_goal_type_due", "workspace_goal_relationships"},
		},
		{
			collection: "goal_action_idempotency",
			indexes:    []string{"workspace_goal_action_unique", "workspace_goal_action_key_lookup", "goal_action_history"},
		},
		{
			collection: "expense_claims",
			indexes: []string{
				"approval_queue",
				"approval_count",
				"actionable_approval_count",
				"workspace_claim_history",
				"workspace_claim_vault_history",
				"claim_submitter_history",
			},
		},
		{
			collection: "notifications",
			indexes: []string{
				"user_read_status",
				"user_notifications",
				"user_notification_history",
			},
		},
		{collection: "contacts", indexes: []string{"workspace_contact_names", "workspace_contact_normalized_unique"}},
		{collection: "saved_transaction_names", indexes: []string{"workspace_saved_name_unique"}},
		{
			collection: "transaction_categories",
			indexes:    []string{"workspace_type_category_name_unique", "workspace_type_category_order"},
		},
		{
			collection: "audit_events",
			indexes:    []string{"workspace_audit", "workspace_audit_history"},
		},
	}

	specifications := mongoIndexSpecifications()
	if len(specifications) != len(want) {
		t.Fatalf("index collection count = %d, want %d", len(specifications), len(want))
	}
	for index, specification := range specifications {
		expected := want[index]
		if specification.collection != expected.collection {
			t.Fatalf(
				"collection order[%d] = %q, want %q",
				index,
				specification.collection,
				expected.collection,
			)
		}
		names := make([]string, 0, len(specification.models))
		for _, model := range specification.models {
			if model.Options == nil || model.Options.Name == nil {
				t.Fatalf("collection %q contains an unnamed index", specification.collection)
			}
			names = append(names, *model.Options.Name)
		}
		if !reflect.DeepEqual(names, expected.indexes) {
			t.Fatalf(
				"index order for %q = %#v, want %#v",
				specification.collection,
				names,
				expected.indexes,
			)
		}
	}
}
