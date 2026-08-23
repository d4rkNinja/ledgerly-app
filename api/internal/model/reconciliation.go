package model

import "time"

// AccountReconciliation is immutable historical evidence that an account's
// ledger matched a bank statement at a point in time. Completed records are
// never rewritten by later transaction edits; they record what was true when
// the reconciliation was completed.
type AccountReconciliation struct {
	ID                     string    `bson:"_id" json:"id"`
	WorkspaceID            string    `bson:"workspace_id" json:"-"`
	VaultID                string    `bson:"vault_id" json:"-"`
	AccountID              string    `bson:"account_id" json:"accountId"`
	CreatedBy              string    `bson:"created_by" json:"-"`
	StatementDate          time.Time `bson:"statement_date" json:"statementDate"`
	Currency               string    `bson:"currency" json:"currency"`
	LedgerBalanceMinor     int64     `bson:"ledger_balance_minor" json:"ledgerBalanceMinor"`
	StatementBalanceMinor  int64     `bson:"statement_balance_minor" json:"statementBalanceMinor"`
	DifferenceMinor        int64     `bson:"difference_minor" json:"differenceMinor"`
	DifferenceAcknowledged bool      `bson:"difference_acknowledged" json:"differenceAcknowledged"`
	ClearedCount           int64     `bson:"cleared_count" json:"clearedCount"`
	UnclearedCount         int64     `bson:"uncleared_count" json:"unclearedCount"`
	Note                   string    `bson:"note,omitempty" json:"note,omitempty"`
	CreatedAt              time.Time `bson:"created_at" json:"createdAt"`
}
