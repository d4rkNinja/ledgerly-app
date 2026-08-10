package model

import "time"

const (
	TransactionCategoryExpense  = "expense"
	TransactionCategoryIncome   = "income"
	TransactionCategoryTransfer = "transfer"
	TransactionCategorySplit    = "split"
)

// TransactionCategory is a workspace-owned category definition. Transactions
// continue to store Category as a string snapshot so disabling, renaming, or
// deleting a definition cannot make historical records unreadable.
type TransactionCategory struct {
	ID              string    `bson:"_id" json:"id"`
	WorkspaceID     string    `bson:"workspace_id" json:"workspaceId"`
	TransactionType string    `bson:"transaction_type" json:"transactionType"`
	Name            string    `bson:"name" json:"name"`
	NormalizedName  string    `bson:"normalized_name" json:"-"`
	Description     string    `bson:"description,omitempty" json:"description,omitempty"`
	Icon            string    `bson:"icon,omitempty" json:"icon,omitempty"`
	Color           string    `bson:"color,omitempty" json:"color,omitempty"`
	SortOrder       int       `bson:"sort_order" json:"sortOrder"`
	IsActive        bool      `bson:"is_active" json:"isActive"`
	CreatedAt       time.Time `bson:"created_at" json:"createdAt"`
	UpdatedAt       time.Time `bson:"updated_at" json:"updatedAt"`
	UsageCount      int64     `bson:"-" json:"usageCount"`
}
