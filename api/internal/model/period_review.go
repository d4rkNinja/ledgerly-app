package model

import "time"

const (
	PeriodReviewScopeMemberView = "member_view"
	ApprovalNotApplicable       = "not_applicable"
	RevisionCommitted           = "committed"
)

// PeriodTotals are signed changes for deltas and absolute totals for snapshots.
type PeriodTotals struct {
	IncomeMinor      int64 `bson:"income_minor" json:"incomeMinor"`
	SpendingMinor    int64 `bson:"spending_minor" json:"spendingMinor"`
	NetMinor         int64 `bson:"net_minor" json:"netMinor"`
	TransactionCount int64 `bson:"transaction_count" json:"transactionCount"`
}

// PeriodReview is an immutable accounting snapshot for one actor's visible scope.
type PeriodReview struct {
	ID                  string       `bson:"_id" json:"id"`
	WorkspaceID         string       `bson:"workspace_id" json:"workspaceId"`
	Status              string       `bson:"status" json:"status"`
	Scope               string       `bson:"scope" json:"scope"`
	ScopeActorID        string       `bson:"scope_actor_id" json:"-"`
	VaultIDs            []string     `bson:"vault_ids" json:"vaultIds"`
	AccountIDs          []string     `bson:"account_ids" json:"accountIds"`
	From                string       `bson:"from" json:"from"`
	To                  string       `bson:"to" json:"to"`
	Timezone            string       `bson:"timezone" json:"timezone"`
	FromUTC             time.Time    `bson:"from_utc" json:"fromUtc"`
	ToUTCExclusive      time.Time    `bson:"to_utc_exclusive" json:"toUtcExclusive"`
	Currency            string       `bson:"currency" json:"currency"`
	Snapshot            PeriodTotals `bson:"snapshot" json:"snapshot"`
	CutoffLedgerVersion int64        `bson:"cutoff_ledger_version" json:"cutoffLedgerVersion"`
	CreatedBy           string       `bson:"created_by" json:"createdBy"`
	CreatedAt           time.Time    `bson:"created_at" json:"createdAt"`
}

// TransactionRevisionSnapshot deliberately excludes tags and split identities.
// AuditEvent hides these snapshots from generic JSON; period-review DTOs expose them.
type TransactionRevisionSnapshot struct {
	ID                   string    `bson:"id" json:"id"`
	WorkspaceID          string    `bson:"workspace_id" json:"workspaceId"`
	TransactionID        string    `bson:"transaction_id,omitempty" json:"transactionId,omitempty"`
	VaultID              string    `bson:"vault_id" json:"vaultId"`
	AccountID            string    `bson:"account_id" json:"accountId"`
	DestinationAccountID string    `bson:"destination_account_id,omitempty" json:"destinationAccountId,omitempty"`
	CreatedBy            string    `bson:"created_by" json:"createdBy"`
	Type                 string    `bson:"type" json:"type"`
	AmountMinor          int64     `bson:"amount_minor" json:"amountMinor"`
	Currency             string    `bson:"currency" json:"currency"`
	Category             string    `bson:"category,omitempty" json:"category,omitempty"`
	Merchant             string    `bson:"merchant,omitempty" json:"merchant,omitempty"`
	Description          string    `bson:"description,omitempty" json:"description,omitempty"`
	Notes                string    `bson:"notes,omitempty" json:"notes,omitempty"`
	Privacy              string    `bson:"privacy" json:"privacy"`
	OccurredAt           time.Time `bson:"occurred_at,omitempty" json:"occurredAt,omitempty"`
	EnteredAt            time.Time `bson:"entered_at" json:"enteredAt"`
	CreatedAt            time.Time `bson:"created_at" json:"createdAt"`
	EditedAt             time.Time `bson:"edited_at" json:"editedAt"`
	UpdatedAt            time.Time `bson:"updated_at" json:"updatedAt"`
	ApprovalState        string    `bson:"approval_state" json:"approvalState"`
	RevisionState        string    `bson:"revision_state" json:"revisionState"`
	HasSplits            bool      `bson:"has_splits" json:"hasSplits"`
}

func NewTransactionRevisionSnapshot(transaction *Transaction) *TransactionRevisionSnapshot {
	if transaction == nil {
		return nil
	}
	return &TransactionRevisionSnapshot{
		ID: transaction.ID, WorkspaceID: transaction.WorkspaceID, TransactionID: transaction.TransactionID,
		VaultID: transaction.VaultID, AccountID: transaction.AccountID,
		DestinationAccountID: transaction.DestinationAccountID, CreatedBy: transaction.CreatedBy,
		Type: transaction.Type, AmountMinor: transaction.AmountMinor, Currency: transaction.Currency,
		Category: transaction.Category, Merchant: transaction.Merchant, Description: transaction.Description,
		Notes: transaction.Notes, Privacy: transaction.Privacy, OccurredAt: transaction.OccurredAt,
		EnteredAt: transaction.CreatedAt, CreatedAt: transaction.CreatedAt,
		EditedAt: transaction.UpdatedAt, UpdatedAt: transaction.UpdatedAt,
		ApprovalState: ApprovalNotApplicable, RevisionState: RevisionCommitted,
		HasSplits: len(transaction.Splits) > 0,
	}
}

type PeriodReviewView struct {
	PeriodReview
	Delta             PeriodTotals `json:"delta"`
	ChangeCount       int64        `json:"changeCount"`
	ChangedAfterClose bool         `json:"changedAfterClose"`
}

type TransactionRevisionChange struct {
	Action        string                       `json:"action"`
	Editor        *CreatorSummary              `json:"editor,omitempty"`
	Before        *TransactionRevisionSnapshot `json:"before,omitempty"`
	After         *TransactionRevisionSnapshot `json:"after,omitempty"`
	ChangedAt     time.Time                    `json:"changedAt"`
	LedgerVersion int64                        `json:"ledgerVersion"`
	Delta         PeriodTotals                 `json:"delta"`
	ApprovalState string                       `json:"approvalState"`
	RevisionState string                       `json:"revisionState"`
}
