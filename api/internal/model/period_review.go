package model

import (
	"sort"
	"time"
)

const (
	PeriodReviewScopeMemberView    = "member_view"
	PeriodReviewScopeWorkspaceView = "workspace_view"
	ApprovalNotApplicable          = "not_applicable"
	RevisionCommitted              = "committed"
	PeriodReviewStateCurrent       = "current"
	PeriodReviewStatePending       = "pending_re_review"
)

// PeriodTotals are signed changes for deltas and absolute totals for snapshots.
type PeriodTotals struct {
	IncomeMinor      int64 `bson:"income_minor" json:"incomeMinor,string"`
	SpendingMinor    int64 `bson:"spending_minor" json:"spendingMinor,string"`
	NetMinor         int64 `bson:"net_minor" json:"netMinor,string"`
	TransactionCount int64 `bson:"transaction_count" json:"transactionCount,string"`
}

// PeriodReview is an immutable accounting snapshot for one actor's visible scope.
type PeriodReview struct {
	ID                  string       `bson:"_id" json:"id"`
	WorkspaceID         string       `bson:"workspace_id" json:"workspaceId"`
	Status              string       `bson:"status" json:"status"`
	Scope               string       `bson:"scope" json:"scope"`
	ScopeActorID        string       `bson:"scope_actor_id" json:"-"`
	VaultIDs            []string     `bson:"vault_ids" json:"-"`
	AccountIDs          []string     `bson:"account_ids" json:"-"`
	From                string       `bson:"from" json:"from"`
	To                  string       `bson:"to" json:"to"`
	Timezone            string       `bson:"timezone" json:"timezone"`
	FromUTC             time.Time    `bson:"from_utc" json:"fromUtc"`
	ToUTCExclusive      time.Time    `bson:"to_utc_exclusive" json:"toUtcExclusive"`
	Currency            string       `bson:"currency" json:"currency"`
	Snapshot            PeriodTotals `bson:"snapshot" json:"snapshot"`
	CutoffLedgerVersion int64        `bson:"cutoff_ledger_version" json:"-"`
	CreatedBy           string       `bson:"created_by" json:"-"`
	CreatedAt           time.Time    `bson:"created_at" json:"createdAt"`
}

// TransactionRevisionSnapshot deliberately excludes tags and raw split identities.
// AuditEvent hides these snapshots from generic JSON; period-review DTOs expose them.
type TransactionRevisionSnapshot struct {
	ID                   string    `bson:"id" json:"id"`
	WorkspaceID          string    `bson:"workspace_id" json:"-"`
	TransactionID        string    `bson:"transaction_id,omitempty" json:"transactionId,omitempty"`
	VaultID              string    `bson:"vault_id" json:"-"`
	AccountID            string    `bson:"account_id" json:"accountId"`
	DestinationAccountID string    `bson:"destination_account_id,omitempty" json:"destinationAccountId,omitempty"`
	CreatedBy            string    `bson:"created_by" json:"-"`
	Type                 string    `bson:"type" json:"type"`
	AmountMinor          int64     `bson:"amount_minor" json:"amountMinor,string"`
	Currency             string    `bson:"currency" json:"currency"`
	Category             string    `bson:"category,omitempty" json:"category,omitempty"`
	Merchant             string    `bson:"merchant,omitempty" json:"merchant,omitempty"`
	Description          string    `bson:"description,omitempty" json:"description,omitempty"`
	Notes                string    `bson:"notes,omitempty" json:"notes,omitempty"`
	ContactID            string    `bson:"contact_id,omitempty" json:"contactId,omitempty"`
	GoalID               string    `bson:"goal_id,omitempty" json:"goalId,omitempty"`
	Privacy              string    `bson:"privacy" json:"privacy"`
	ReportingDate        string    `bson:"reporting_date" json:"-"`
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
	reportingTime := transaction.OccurredAt
	if reportingTime.IsZero() {
		reportingTime = transaction.CreatedAt
	}
	return &TransactionRevisionSnapshot{
		ID: transaction.ID, WorkspaceID: transaction.WorkspaceID, TransactionID: transaction.TransactionID,
		VaultID: transaction.VaultID, AccountID: transaction.AccountID,
		DestinationAccountID: transaction.DestinationAccountID, CreatedBy: transaction.CreatedBy,
		Type: transaction.Type, AmountMinor: transaction.AmountMinor, Currency: transaction.Currency,
		Category: transaction.Category, Merchant: transaction.Merchant, Description: transaction.Description,
		Notes: transaction.Notes, ContactID: transaction.ContactID, GoalID: transaction.GoalID,
		Privacy: transaction.Privacy, ReportingDate: reportingTime.UTC().Format("2006-01-02"), OccurredAt: transaction.OccurredAt,
		EnteredAt: transaction.CreatedAt, CreatedAt: transaction.CreatedAt,
		EditedAt: transaction.UpdatedAt, UpdatedAt: transaction.UpdatedAt,
		ApprovalState: ApprovalNotApplicable, RevisionState: RevisionCommitted,
		HasSplits: len(transaction.Splits) > 0,
	}
}

func TransactionSplitAllocationChanged(before, after *Transaction) bool {
	canonical := func(transaction *Transaction) []Split {
		if transaction == nil || len(transaction.Splits) == 0 {
			return nil
		}
		result := append([]Split(nil), transaction.Splits...)
		sort.Slice(result, func(left, right int) bool {
			if result[left].UserID == result[right].UserID {
				return result[left].AmountMinor < result[right].AmountMinor
			}
			return result[left].UserID < result[right].UserID
		})
		return result
	}
	left, right := canonical(before), canonical(after)
	if len(left) != len(right) {
		return true
	}
	for index := range left {
		if left[index].UserID != right[index].UserID || left[index].AmountMinor != right[index].AmountMinor {
			return true
		}
	}
	return false
}

type PeriodReviewView struct {
	PeriodReview
	ReviewedBy        *CreatorSummary `json:"reviewedBy,omitempty"`
	VaultCount        int             `json:"vaultCount"`
	AccountCount      int             `json:"accountCount"`
	ScopeNote         string          `json:"scopeNote"`
	Delta             PeriodTotals    `json:"delta"`
	ChangeCount       int64           `json:"changeCount,string"`
	ChangedAfterClose bool            `json:"changedAfterClose"`
	ReviewState       string          `json:"reviewState"`
}

type TransactionRevisionChange struct {
	Action                 string                       `json:"action"`
	Editor                 *CreatorSummary              `json:"editor,omitempty"`
	Before                 *TransactionRevisionSnapshot `json:"before,omitempty"`
	After                  *TransactionRevisionSnapshot `json:"after,omitempty"`
	BeforeRedacted         bool                         `json:"beforeRedacted"`
	AfterRedacted          bool                         `json:"afterRedacted"`
	ChangedFields          []string                     `json:"changedFields"`
	ChangedAt              time.Time                    `json:"changedAt"`
	Delta                  PeriodTotals                 `json:"delta"`
	SplitAllocationChanged bool                         `json:"splitAllocationChanged"`
	ApprovalState          string                       `json:"approvalState"`
	RevisionState          string                       `json:"revisionState"`
}
