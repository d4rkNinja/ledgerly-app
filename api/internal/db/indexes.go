package db

import (
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type collectionIndexes struct {
	collection string
	models     []mongo.IndexModel
}

const (
	usersCollection                 = "users"
	workspacesCollection            = "workspaces"
	sessionsCollection              = "sessions"
	membershipsCollection           = "memberships"
	invitationsCollection           = "invitations"
	workspaceJoinRequestsCollection = "workspace_join_requests"
	idempotencyCollection           = "idempotency"
	transactionsCollection          = "transactions"
	vaultsCollection                = "vaults"
	accountsCollection              = "accounts"
	budgetsCollection               = "budgets"
	recurringBillsCollection        = "recurring_transactions"
	goalsCollection                 = "goals"
	goalActionsCollection           = "goal_action_idempotency"
	expenseClaimsCollection         = "expense_claims"
	notificationsCollection         = "notifications"
	periodReviewsCollection         = "period_reviews"
	auditEventsCollection           = "audit_events"
	contactsCollection              = "contacts"
	savedTransactionNamesCollection = "saved_transaction_names"
	transactionCategoriesCollection = "transaction_categories"
	transactionSequencesCollection  = "transaction_sequences"
)

// mongoIndexSpecifications is ordered so startup index creation and failures
// are deterministic. Existing index names and definitions remain intact for
// compatibility; new indexes use new names so deployments can upgrade safely.
func mongoIndexSpecifications() []collectionIndexes {
	return []collectionIndexes{
		{
			collection: usersCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "email", Value: 1}}, Options: options.Index().SetUnique(true).SetName("email_unique")},
			},
		},
		{
			collection: sessionsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "token_hash", Value: 1}}, Options: options.Index().SetUnique(true).SetName("token_hash_unique")},
				{Keys: bson.D{{Key: "expires_at", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0).SetName("session_ttl")},
				{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "revoked_at", Value: 1}}, Options: options.Index().SetName("user_active_sessions")},
				{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("user_session_history")},
			},
		},
		{
			collection: membershipsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "user_id", Value: 1}}, Options: options.Index().SetUnique(true).SetName("workspace_user_unique")},
				{Keys: bson.D{{Key: "user_id", Value: 1}}, Options: options.Index().SetName("user_workspaces")},
				{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName("user_membership_scan")},
			},
		},
		{
			collection: invitationsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "token_hash", Value: 1}}, Options: options.Index().SetUnique(true).SetName("invitation_token_unique")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "email", Value: 1}, {Key: "status", Value: 1}}, Options: options.Index().SetName("workspace_email_status")},
				{
					Keys: bson.D{{Key: "expires_at", Value: 1}},
					Options: options.Index().
						SetExpireAfterSeconds(0).
						SetPartialFilterExpression(bson.D{{Key: "status", Value: "pending"}}).
						SetName("invitation_ttl"),
				},
				{
					Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "email", Value: 1}},
					Options: options.Index().
						SetUnique(true).
						SetPartialFilterExpression(pendingInvitationEmailIndexFilter()).
						SetName("pending_workspace_email_unique"),
				},
			},
		},
		{
			collection: "workspace_member_removals",
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "removed_at", Value: -1}}, Options: options.Index().SetName("workspace_member_removal_history")},
			},
		},
		{
			collection: workspacesCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "join_code_hash", Value: 1}}, Options: options.Index().SetUnique(true).SetSparse(true).SetName("workspace_join_code_unique")},
				{Keys: bson.D{{Key: "join_code_hash", Value: 1}, {Key: "visibility", Value: 1}, {Key: "join_code_expires_at", Value: 1}}, Options: options.Index().SetName("workspace_join_code_lookup")},
			},
		},
		{
			collection: workspaceJoinRequestsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("workspace_pending_requests")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "requester_id", Value: 1}}, Options: options.Index().SetUnique(true).SetPartialFilterExpression(bson.D{{Key: "status", Value: "pending"}}).SetName("pending_workspace_requester_unique")},
			},
		},
		{
			collection: idempotencyCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "key", Value: 1}}, Options: options.Index().SetUnique(true).SetName("user_key_unique")},
				{Keys: bson.D{{Key: "expires_at", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0).SetName("idempotency_ttl")},
			},
		},
		{
			collection: transactionsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "occurred_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_created_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "account_id", Value: 1}, {Key: "occurred_at", Value: -1}}, Options: options.Index().SetName("account_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "category", Value: 1}, {Key: "occurred_at", Value: -1}}, Options: options.Index().SetName("category_reports")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "merchant", Value: "text"}, {Key: "notes", Value: "text"}, {Key: "category", Value: "text"}}, Options: options.Index().SetName("transaction_search")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "sequence_scope", Value: 1}, {Key: "transaction_id", Value: 1}}, Options: options.Index().SetUnique(true).SetPartialFilterExpression(transactionIDIndexFilter()).SetName("workspace_sequence_transaction_id_unique")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "transaction_id", Value: 1}}, Options: options.Index().SetName("workspace_transaction_id_lookup")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "occurred_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_vault_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "account_id", Value: 1}, {Key: "occurred_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_vault_account_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "type", Value: 1}, {Key: "occurred_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_vault_type_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "category", Value: 1}, {Key: "occurred_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_vault_category_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "contact_id", Value: 1}, {Key: "occurred_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_vault_contact_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "goal_id", Value: 1}, {Key: "occurred_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_goal_history")},
			},
		},
		{
			collection: transactionSequencesCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "transaction_type", Value: 1}}, Options: options.Index().SetUnique(true).SetName("workspace_transaction_sequence_unique")},
			},
		},
		{
			collection: vaultsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "archived", Value: 1}}, Options: options.Index().SetName("workspace_vaults")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "archived", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_vault_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "name", Value: "text"}}, Options: options.Index().SetName("vault_search")},
			},
		},
		{
			collection: accountsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "archived", Value: 1}}, Options: options.Index().SetName("workspace_accounts")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "archived", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_account_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "name", Value: "text"}}, Options: options.Index().SetName("account_search")},
			},
		},
		{
			collection: budgetsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "start_at", Value: -1}}, Options: options.Index().SetName("workspace_budgets")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_budget_history")},
			},
		},
		{
			collection: recurringBillsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "next_due_at", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName("workspace_upcoming_bills")},
			},
		},
		{
			collection: goalsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("workspace_goals")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_goal_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "due_date", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_goal_due_dates")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "type", Value: 1}, {Key: "due_date", Value: 1}}, Options: options.Index().SetName("workspace_goal_type_due")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "contact_id", Value: 1}, {Key: "account_id", Value: 1}}, Options: options.Index().SetName("workspace_goal_relationships")},
			},
		},
		{
			collection: goalActionsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "goal_id", Value: 1}, {Key: "idempotency_key", Value: 1}}, Options: options.Index().SetUnique(true).SetName("workspace_goal_action_unique")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "idempotency_key", Value: 1}}, Options: options.Index().SetName("workspace_goal_action_key_lookup")},
				{Keys: bson.D{{Key: "created_at", Value: -1}}, Options: options.Index().SetName("goal_action_history")},
			},
		},
		{
			collection: expenseClaimsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("approval_queue")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "status", Value: 1}, {Key: "vault_id", Value: 1}}, Options: options.Index().SetName("approval_count")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "status", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "submitted_by", Value: 1}}, Options: options.Index().SetName("actionable_approval_count")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_claim_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_claim_vault_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "submitted_by", Value: 1}, {Key: "vault_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("claim_submitter_history")},
			},
		},
		{
			collection: notificationsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "read_at", Value: 1}}, Options: options.Index().SetName("user_read_status")},
				{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("user_notifications")},
				{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("user_notification_history")},
			},
		},
		{
			collection: contactsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "name", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName("workspace_contact_names")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "normalized_name", Value: 1}}, Options: options.Index().SetUnique(true).SetPartialFilterExpression(contactNormalizedNameIndexFilter()).SetName("workspace_contact_normalized_unique")},
			},
		},
		{
			collection: savedTransactionNamesCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "normalized_name", Value: 1}}, Options: options.Index().SetUnique(true).SetName("workspace_saved_name_unique")},
			},
		},
		{
			collection: transactionCategoriesCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "transaction_type", Value: 1}, {Key: "normalized_name", Value: 1}}, Options: options.Index().SetUnique(true).SetName("workspace_type_category_name_unique")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "transaction_type", Value: 1}, {Key: "sort_order", Value: 1}, {Key: "name", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName("workspace_type_category_order")},
			},
		},
		{
			collection: periodReviewsCollection,
			models: []mongo.IndexModel{
				// Checkpoints are immutable generations, so this index must not be
				// unique. Re-reviewing the same civil period deliberately inserts a
				// new row with a later cutoff instead of rewriting history. Timezone
				// is stored as evidence but is not part of period identity.
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "scope", Value: 1}, {Key: "scope_actor_id", Value: 1}, {Key: "from", Value: 1}, {Key: "to", Value: 1}, {Key: "cutoff_ledger_version", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("period_review_generation_history")},
				// Listing a civil period can return the caller's member checkpoint
				// and an authorized workspace checkpoint. Keep that access pattern
				// independent of the timezone currently reported by the client.
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "from", Value: 1}, {Key: "to", Value: 1}, {Key: "cutoff_ledger_version", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("period_review_period_history")},
			},
		},
		{
			collection: auditEventsCollection,
			models: []mongo.IndexModel{
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("workspace_audit")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}, Options: options.Index().SetName("workspace_audit_history")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "entity_type", Value: 1}, {Key: "ledger_version", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName("workspace_transaction_revision_ledger")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "entity_type", Value: 1}, {Key: "before.currency", Value: 1}, {Key: "before.reporting_date", Value: 1}, {Key: "ledger_version", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName("period_revision_before_summary")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "entity_type", Value: 1}, {Key: "after.currency", Value: 1}, {Key: "after.reporting_date", Value: 1}, {Key: "ledger_version", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName("period_revision_after_summary")},
				{Keys: bson.D{{Key: "workspace_id", Value: 1}, {Key: "entity_type", Value: 1}, {Key: "entity_id", Value: 1}, {Key: "ledger_version", Value: 1}}, Options: options.Index().SetName("transaction_revision_history")},
			},
		},
	}
}

func contactNormalizedNameIndexFilter() bson.D {
	return bson.D{{Key: "normalized_name", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$gt", Value: ""}}}}
}

func transactionIDIndexFilter() bson.D {
	return bson.D{
		{Key: "sequence_scope", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$gt", Value: ""}}},
		{Key: "transaction_id", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$gt", Value: ""}}},
	}
}

// pendingInvitationEmailIndexFilter deliberately excludes manual token invites
// whose email is empty. Those invitations are valid and can be issued more
// than once; their token_hash remains the uniqueness guarantee.
func pendingInvitationEmailIndexFilter() bson.D {
	return bson.D{
		{Key: "status", Value: "pending"},
		{Key: "workspace_id", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$gt", Value: ""}}},
		{Key: "email", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$gt", Value: ""}}},
	}
}
