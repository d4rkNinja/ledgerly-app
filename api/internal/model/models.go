package model

import (
	"encoding/json"
	"time"
)

// MaxMoneyMinor is the largest supported absolute monetary value persisted by
// the application. Persistence-layer balance mutations must enforce this bound
// atomically so concurrent increments cannot overflow the domain range.
const MaxMoneyMinor int64 = 9_000_000_000_000_000

type User struct {
	ID                string    `bson:"_id" json:"id"`
	Email             string    `bson:"email" json:"email"`
	PasswordHash      string    `bson:"password_hash" json:"-"`
	Name              string    `bson:"name" json:"name"`
	ProfileImageURL   string    `bson:"profile_image_url,omitempty" json:"profileImageUrl,omitempty"`
	PhoneNumber       string    `bson:"phone_number,omitempty" json:"phoneNumber,omitempty"`
	Locale            string    `bson:"locale" json:"locale"`
	PreferredCurrency string    `bson:"preferred_currency" json:"preferredCurrency"`
	EmailVerified     bool      `bson:"email_verified" json:"emailVerified"`
	CreatedAt         time.Time `bson:"created_at" json:"createdAt"`
	UpdatedAt         time.Time `bson:"updated_at" json:"updatedAt"`
}

type UserProfile struct {
	Email             string    `json:"email"`
	Name              string    `json:"name"`
	ProfileImageURL   string    `json:"profileImageUrl,omitempty"`
	PhoneNumber       string    `json:"phoneNumber,omitempty"`
	Locale            string    `json:"locale"`
	PreferredCurrency string    `json:"preferredCurrency"`
	EmailVerified     bool      `json:"emailVerified"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

func NewUserProfile(user *User) UserProfile {
	if user == nil {
		return UserProfile{}
	}
	return UserProfile{
		Email:             user.Email,
		Name:              user.Name,
		ProfileImageURL:   user.ProfileImageURL,
		PhoneNumber:       user.PhoneNumber,
		Locale:            user.Locale,
		PreferredCurrency: user.PreferredCurrency,
		EmailVerified:     user.EmailVerified,
		CreatedAt:         user.CreatedAt,
		UpdatedAt:         user.UpdatedAt,
	}
}

type Session struct {
	ID        string     `bson:"_id" json:"id"`
	UserID    string     `bson:"user_id" json:"userId"`
	TokenHash string     `bson:"token_hash" json:"-"`
	UserAgent string     `bson:"user_agent" json:"userAgent"`
	IPAddress string     `bson:"ip_address" json:"ipAddress"`
	CreatedAt time.Time  `bson:"created_at" json:"createdAt"`
	ExpiresAt time.Time  `bson:"expires_at" json:"expiresAt"`
	RevokedAt *time.Time `bson:"revoked_at,omitempty" json:"revokedAt,omitempty"`
}

type Workspace struct {
	ID                string    `bson:"_id" json:"id"`
	Name              string    `bson:"name" json:"name"`
	Type              string    `bson:"type" json:"type"`
	Currency          string    `bson:"currency" json:"currency"`
	FinancialMonth    int       `bson:"financial_month" json:"financialMonthStart"`
	OwnerID           string    `bson:"owner_id" json:"ownerId"`
	Visibility        string    `bson:"visibility" json:"visibility"`
	JoinCodeHash      string    `bson:"join_code_hash,omitempty" json:"-"`
	JoinCodeExpiresAt time.Time `bson:"join_code_expires_at,omitempty" json:"-"`
	CreatedAt         time.Time `bson:"created_at" json:"createdAt"`
	UpdatedAt         time.Time `bson:"updated_at" json:"updatedAt"`
}

type WorkspaceJoinRequest struct {
	ID             string     `bson:"_id" json:"id"`
	WorkspaceID    string     `bson:"workspace_id" json:"workspaceId"`
	WorkspaceName  string     `bson:"workspace_name" json:"workspaceName"`
	RequesterID    string     `bson:"requester_id" json:"requesterId"`
	RequesterName  string     `bson:"requester_name" json:"requesterName"`
	RequesterEmail string     `bson:"requester_email" json:"requesterEmail"`
	Status         string     `bson:"status" json:"status"`
	CreatedAt      time.Time  `bson:"created_at" json:"createdAt"`
	ReviewedAt     *time.Time `bson:"reviewed_at,omitempty" json:"reviewedAt,omitempty"`
	ReviewedBy     string     `bson:"reviewed_by,omitempty" json:"reviewedBy,omitempty"`
}

type Membership struct {
	ID           string    `bson:"_id" json:"id"`
	WorkspaceID  string    `bson:"workspace_id" json:"workspaceId"`
	UserID       string    `bson:"user_id" json:"userId"`
	Role         string    `bson:"role" json:"role"`
	Permissions  []string  `bson:"permissions" json:"permissions"`
	Relationship string    `bson:"relationship,omitempty" json:"relationship,omitempty"`
	CreatedAt    time.Time `bson:"created_at" json:"createdAt"`
}

type Invitation struct {
	ID          string     `bson:"_id" json:"id"`
	WorkspaceID string     `bson:"workspace_id" json:"workspaceId"`
	InviterID   string     `bson:"inviter_id" json:"inviterId"`
	Email       string     `bson:"email" json:"email"`
	Role        string     `bson:"role" json:"role"`
	Permissions []string   `bson:"permissions" json:"permissions"`
	TokenHash   string     `bson:"token_hash" json:"-"`
	Status      string     `bson:"status" json:"status"`
	ExpiresAt   time.Time  `bson:"expires_at" json:"expiresAt"`
	CreatedAt   time.Time  `bson:"created_at" json:"createdAt"`
	AcceptedAt  *time.Time `bson:"accepted_at,omitempty" json:"acceptedAt,omitempty"`
}

// WorkspaceMemberRemoval is an internal audit snapshot retained after a
// removable membership is deleted. It is never serialized to the client.
type WorkspaceMemberRemoval struct {
	ID              string    `bson:"_id" json:"-"`
	WorkspaceID     string    `bson:"workspace_id" json:"-"`
	UserID          string    `bson:"user_id" json:"-"`
	Name            string    `bson:"name" json:"-"`
	Email           string    `bson:"email" json:"-"`
	Role            string    `bson:"role" json:"-"`
	Permissions     []string  `bson:"permissions" json:"-"`
	ProfileImageURL string    `bson:"profile_image_url,omitempty" json:"-"`
	JoinedAt        time.Time `bson:"joined_at" json:"-"`
	RemovedAt       time.Time `bson:"removed_at" json:"-"`
	RemovedBy       string    `bson:"removed_by" json:"-"`
}

type Vault struct {
	ID           string    `bson:"_id" json:"id"`
	WorkspaceID  string    `bson:"workspace_id" json:"workspaceId"`
	OwnerID      string    `bson:"owner_id" json:"ownerId"`
	Name         string    `bson:"name" json:"name"`
	Type         string    `bson:"type" json:"type"`
	Currency     string    `bson:"currency" json:"currency"`
	Description  string    `bson:"description,omitempty" json:"description,omitempty"`
	OpeningMinor int64     `bson:"opening_minor" json:"openingMinor"`
	BalanceMinor int64     `bson:"balance_minor" json:"balanceMinor"`
	Privacy      string    `bson:"privacy" json:"privacy"`
	Archived     bool      `bson:"archived" json:"archived"`
	CreatedAt    time.Time `bson:"created_at" json:"createdAt"`
	UpdatedAt    time.Time `bson:"updated_at" json:"updatedAt"`
}

type Account struct {
	ID               string    `bson:"_id" json:"id"`
	WorkspaceID      string    `bson:"workspace_id" json:"-"`
	VaultID          string    `bson:"vault_id" json:"-"`
	OwnerID          string    `bson:"owner_id" json:"-"`
	Name             string    `bson:"name" json:"name"`
	BankName         string    `bson:"bank_name,omitempty" json:"bankName,omitempty"`
	Type             string    `bson:"type" json:"type"`
	MaskedIdentifier string    `bson:"masked_identifier,omitempty" json:"maskedIdentifier,omitempty"`
	Currency         string    `bson:"currency" json:"currency"`
	OpeningMinor     int64     `bson:"opening_minor" json:"openingMinor"`
	BalanceMinor     int64     `bson:"balance_minor" json:"balanceMinor"`
	Color            string    `bson:"color,omitempty" json:"color,omitempty"`
	Icon             string    `bson:"icon,omitempty" json:"icon,omitempty"`
	Notes            string    `bson:"notes,omitempty" json:"notes,omitempty"`
	Status           string    `bson:"status,omitempty" json:"status"`
	ExcludeFromTotal bool      `bson:"exclude_from_total" json:"excludeFromTotal"`
	Privacy          string    `bson:"privacy" json:"privacy"`
	Archived         bool      `bson:"archived" json:"archived"`
	CreatedAt        time.Time `bson:"created_at" json:"createdAt"`
	UpdatedAt        time.Time `bson:"updated_at" json:"updatedAt"`
}

type Split struct {
	UserID      string `bson:"user_id" json:"userId,omitempty"`
	MemberEmail string `bson:"-" json:"memberEmail,omitempty"`
	AmountMinor int64  `bson:"amount_minor" json:"amountMinor"`
}

type CreatorSummary struct {
	Name            string `json:"name"`
	Initials        string `json:"initials"`
	ProfileImageURL string `json:"profileImageUrl,omitempty"`
	Status          string `json:"status"`
	IsCurrentUser   bool   `json:"isCurrentUser"`
}

type Contact struct {
	ID             string    `bson:"_id" json:"id"`
	WorkspaceID    string    `bson:"workspace_id" json:"-"`
	CreatedBy      string    `bson:"created_by" json:"createdBy"`
	Name           string    `bson:"name" json:"name"`
	NormalizedName string    `bson:"normalized_name,omitempty" json:"-"`
	Phone          string    `bson:"phone,omitempty" json:"phone,omitempty"`
	Email          string    `bson:"email,omitempty" json:"email,omitempty"`
	Notes          string    `bson:"notes,omitempty" json:"notes,omitempty"`
	CreatedAt      time.Time `bson:"created_at" json:"createdAt"`
	UpdatedAt      time.Time `bson:"updated_at" json:"updatedAt"`
}

type ContactSummary struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Phone string `json:"phone,omitempty"`
	Email string `json:"email,omitempty"`
}

type SavedTransactionName struct {
	ID             string    `bson:"_id" json:"id"`
	WorkspaceID    string    `bson:"workspace_id" json:"-"`
	CreatedBy      string    `bson:"created_by" json:"createdBy"`
	Name           string    `bson:"name" json:"name"`
	NormalizedName string    `bson:"normalized_name" json:"-"`
	CreatedAt      time.Time `bson:"created_at" json:"createdAt"`
	UpdatedAt      time.Time `bson:"updated_at" json:"updatedAt"`
}

type Transaction struct {
	ID            string `bson:"_id" json:"id"`
	WorkspaceID   string `bson:"workspace_id" json:"-"`
	TransactionID string `bson:"transaction_id,omitempty" json:"transactionId"`
	SequenceScope string `bson:"sequence_scope,omitempty" json:"-"`
	// AutoGenerateTransactionID is a create-command flag consumed by the
	// repository. It is never persisted or exposed in transaction responses.
	AutoGenerateTransactionID bool            `bson:"-" json:"-"`
	VaultID                   string          `bson:"vault_id" json:"-"`
	AccountID                 string          `bson:"account_id" json:"accountId"`
	DestinationAccountID      string          `bson:"destination_account_id,omitempty" json:"destinationAccountId,omitempty"`
	CreatedBy                 string          `bson:"created_by" json:"-"`
	Creator                   *CreatorSummary `bson:"-" json:"creator,omitempty"`
	Type                      string          `bson:"type" json:"type"`
	AmountMinor               int64           `bson:"amount_minor" json:"amountMinor"`
	Currency                  string          `bson:"currency" json:"currency"`
	Category                  string          `bson:"category,omitempty" json:"category,omitempty"`
	Merchant                  string          `bson:"merchant,omitempty" json:"merchant,omitempty"`
	Notes                     string          `bson:"notes,omitempty" json:"notes,omitempty"`
	Description               string          `bson:"description,omitempty" json:"description,omitempty"`
	ContactID                 string          `bson:"contact_id,omitempty" json:"contactId,omitempty"`
	GoalID                    string          `bson:"goal_id,omitempty" json:"goalId,omitempty"`
	Contact                   *ContactSummary `bson:"-" json:"contact,omitempty"`
	// Tags and splits are accepted through TransactionInput, but they are not
	// returned in transaction views. Tags can encode internal workflow state
	// and split rows contain member identifiers. MarshalJSON exposes only a
	// boolean capability signal for the client.
	Tags       []string  `bson:"tags,omitempty" json:"-"`
	Splits     []Split   `bson:"splits,omitempty" json:"-"`
	Privacy    string    `bson:"privacy" json:"privacy"`
	OccurredAt time.Time `bson:"occurred_at" json:"occurredAt"`
	CreatedAt  time.Time `bson:"created_at" json:"createdAt"`
	UpdatedAt  time.Time `bson:"updated_at" json:"updatedAt"`
}

// MarshalJSON is the public transaction contract. It prevents collaborator
// identifiers and internal tags from being sent to browser or mobile clients,
// while retaining a minimal signal for a UI to prevent unsafe amount edits.
func (transaction Transaction) MarshalJSON() ([]byte, error) {
	type publicTransaction Transaction
	return json.Marshal(struct {
		publicTransaction
		HasSplits bool `json:"hasSplits,omitempty"`
	}{
		publicTransaction: publicTransaction(transaction),
		HasSplits:         len(transaction.Splits) > 0,
	})
}

type Budget struct {
	ID          string    `bson:"_id" json:"id"`
	WorkspaceID string    `bson:"workspace_id" json:"-"`
	VaultID     string    `bson:"vault_id,omitempty" json:"-"`
	Name        string    `bson:"name" json:"name"`
	AmountMinor int64     `bson:"amount_minor" json:"amountMinor"`
	Currency    string    `bson:"currency" json:"currency"`
	Period      string    `bson:"period" json:"period"`
	Categories  []string  `bson:"categories,omitempty" json:"categories,omitempty"`
	Rollover    bool      `bson:"rollover" json:"rollover"`
	StartAt     time.Time `bson:"start_at" json:"startAt"`
	EndAt       time.Time `bson:"end_at" json:"endAt"`
	CreatedBy   string    `bson:"created_by" json:"-"`
	CreatedAt   time.Time `bson:"created_at" json:"createdAt"`
	UpdatedAt   time.Time `bson:"updated_at" json:"updatedAt"`
}

// Bill is a recurring payment projected into the upcoming-bills API. Its BSON
// field names intentionally match the legacy recurring_transactions seed
// schema, while the JSON names match the user-facing bills vocabulary.
type Bill struct {
	ID          string `bson:"_id" json:"id"`
	WorkspaceID string `bson:"workspace_id" json:"workspaceId"`
	// VaultID, OwnerID, and Privacy are storage-only authorization fields. They
	// are intentionally omitted from JSON to preserve the existing bills
	// response contract while allowing newly-created records to be scoped like
	// the rest of the finance domain.
	VaultID     string    `bson:"vault_id,omitempty" json:"-"`
	OwnerID     string    `bson:"owner_id,omitempty" json:"-"`
	Privacy     string    `bson:"privacy,omitempty" json:"-"`
	Name        string    `bson:"title" json:"name"`
	AmountMinor int64     `bson:"amount_minor" json:"amountMinor"`
	Currency    string    `bson:"currency" json:"currency"`
	Frequency   string    `bson:"frequency" json:"frequency"`
	DueDate     time.Time `bson:"next_due_at" json:"dueDate"`
	Autopay     bool      `bson:"autopay,omitempty" json:"autopay"`
	// Active is intentionally storage-only. Records created before this field
	// existed are treated as active by the bills query.
	Active    *bool     `bson:"active,omitempty" json:"-"`
	CreatedAt time.Time `bson:"created_at" json:"createdAt"`
}

type Goal struct {
	ID                   string             `bson:"_id" json:"id"`
	WorkspaceID          string             `bson:"workspace_id" json:"-"`
	VaultID              string             `bson:"vault_id,omitempty" json:"-"`
	Name                 string             `bson:"name" json:"name"`
	Description          string             `bson:"description,omitempty" json:"description,omitempty"`
	Type                 string             `bson:"type,omitempty" json:"type,omitempty"`
	CustomType           string             `bson:"custom_type,omitempty" json:"customType,omitempty"`
	Direction            string             `bson:"direction,omitempty" json:"direction,omitempty"`
	TargetMinor          int64              `bson:"target_minor" json:"targetMinor"`
	CurrentMinor         int64              `bson:"current_minor" json:"currentMinor"`
	RemainingMinor       int64              `bson:"-" json:"remainingMinor"`
	Currency             string             `bson:"currency" json:"currency"`
	StartDate            *time.Time         `bson:"start_date,omitempty" json:"startDate,omitempty"`
	TargetDate           *time.Time         `bson:"target_date,omitempty" json:"targetDate,omitempty"`
	DueDate              *time.Time         `bson:"due_date,omitempty" json:"dueDate,omitempty"`
	Status               string             `bson:"-" json:"status"`
	Visibility           string             `bson:"visibility" json:"visibility"`
	ContactID            string             `bson:"contact_id,omitempty" json:"contactId,omitempty"`
	ContactName          string             `bson:"contact_name,omitempty" json:"contactName,omitempty"`
	Contact              *ContactSummary    `bson:"-" json:"contact,omitempty"`
	AccountID            string             `bson:"account_id,omitempty" json:"accountId,omitempty"`
	Category             string             `bson:"category,omitempty" json:"category,omitempty"`
	Reminder             string             `bson:"reminder,omitempty" json:"reminder,omitempty"`
	Notes                string             `bson:"notes,omitempty" json:"notes,omitempty"`
	CancelledAt          *time.Time         `bson:"cancelled_at,omitempty" json:"cancelledAt,omitempty"`
	CancelledBy          string             `bson:"cancelled_by,omitempty" json:"cancelledBy,omitempty"`
	CompletionDate       *time.Time         `bson:"completion_date,omitempty" json:"completionDate,omitempty"`
	LinkedTransactionIDs []string           `bson:"linked_transaction_ids,omitempty" json:"linkedTransactionIds,omitempty"`
	History              []GoalHistoryEntry `bson:"history,omitempty" json:"history,omitempty"`
	CreatedBy            string             `bson:"created_by" json:"-"`
	CreatedBySummary     *CreatorSummary    `bson:"-" json:"createdBySummary,omitempty"`
	CreatedAt            time.Time          `bson:"created_at" json:"createdAt"`
	UpdatedAt            time.Time          `bson:"updated_at" json:"updatedAt"`
}

type GoalHistoryEntry struct {
	Action      string         `bson:"action" json:"action"`
	ActorID     string         `bson:"actor_id" json:"actorId"`
	AmountMinor int64          `bson:"amount_minor,omitempty" json:"amountMinor,omitempty"`
	Date        *time.Time     `bson:"date,omitempty" json:"date,omitempty"`
	Metadata    map[string]any `bson:"metadata,omitempty" json:"metadata,omitempty"`
	CreatedAt   time.Time      `bson:"created_at" json:"createdAt"`
}

type ExpenseClaim struct {
	ID                  string     `bson:"_id" json:"id"`
	WorkspaceID         string     `bson:"workspace_id" json:"workspaceId"`
	VaultID             string     `bson:"vault_id" json:"vaultId"`
	SubmittedBy         string     `bson:"submitted_by" json:"submittedBy"`
	AmountMinor         int64      `bson:"amount_minor" json:"amountMinor"`
	Currency            string     `bson:"currency" json:"currency"`
	Description         string     `bson:"description" json:"description"`
	Status              string     `bson:"status" json:"status"`
	ApprovalComment     string     `bson:"approval_comment,omitempty" json:"approvalComment,omitempty"`
	ApprovedBy          string     `bson:"approved_by,omitempty" json:"approvedBy,omitempty"`
	ReimbursementStatus string     `bson:"reimbursement_status" json:"reimbursementStatus"`
	CreatedAt           time.Time  `bson:"created_at" json:"createdAt"`
	UpdatedAt           time.Time  `bson:"updated_at" json:"updatedAt"`
	ReimbursedAt        *time.Time `bson:"reimbursed_at,omitempty" json:"reimbursedAt,omitempty"`
}

type Notification struct {
	ID          string     `bson:"_id" json:"id"`
	UserID      string     `bson:"user_id" json:"userId"`
	WorkspaceID string     `bson:"workspace_id,omitempty" json:"workspaceId,omitempty"`
	Type        string     `bson:"type" json:"type"`
	Title       string     `bson:"title" json:"title"`
	Message     string     `bson:"message" json:"message"`
	ReadAt      *time.Time `bson:"read_at,omitempty" json:"readAt,omitempty"`
	CreatedAt   time.Time  `bson:"created_at" json:"createdAt"`
}

type AuditEvent struct {
	ID          string         `bson:"_id" json:"id"`
	WorkspaceID string         `bson:"workspace_id" json:"workspaceId"`
	ActorID     string         `bson:"actor_id" json:"actorId"`
	Action      string         `bson:"action" json:"action"`
	EntityType  string         `bson:"entity_type" json:"entityType"`
	EntityID    string         `bson:"entity_id" json:"entityId"`
	Metadata    map[string]any `bson:"metadata,omitempty" json:"metadata,omitempty"`
	CreatedAt   time.Time      `bson:"created_at" json:"createdAt"`
}
