package model

import (
	"encoding/json"
	"time"
)

// Import session lifecycle states. A session is created in draft, may be
// re-parsed and re-resolved any number of times, and ends exactly once as
// completed or cancelled. Completed sessions are retained as provenance
// evidence for the transactions they produced.
const (
	ImportSessionDraft     = "draft"
	ImportSessionCompleted = "completed"
	ImportSessionCancelled = "cancelled"
)

// Per-row review states assigned during duplicate and match detection.
const (
	ImportRowInvalid       = "invalid"
	ImportRowNew           = "new"
	ImportRowDuplicate     = "duplicate"
	ImportRowPossibleMatch = "possible_match"
)

// User resolutions for a row. Every reviewed row carries one.
const (
	ImportRowActionCreate   = "create"
	ImportRowActionIgnore   = "ignore"
	ImportRowActionLink     = "link"
	ImportRowActionUndecided = ""
)

const (
	maximumImportRows    = 500
	maximumImportColumns = 64
)

type ImportColumnMapping struct {
	HasHeader        bool   `json:"hasHeader"`
	DateColumn       int    `json:"dateColumn"`
	DescriptionColumn int   `json:"descriptionColumn"`
	AmountColumn     int    `json:"amountColumn"`
	DebitColumn      int    `json:"debitColumn"`
	CreditColumn     int    `json:"creditColumn"`
	NotesColumn      int    `json:"notesColumn"`
	ReferenceColumn  int    `json:"referenceColumn"`
	DateFormat       string `json:"dateFormat"`
	// AmountMode selects single-column signed amounts ("signed", negative
	// means debit) or expense-positive single-column amounts
	// ("expense_positive") or the debit/credit pair ("two_column").
	AmountMode string `json:"amountMode"`
}

type ImportMatchInfo struct {
	TransactionID string `json:"-"`
	Label         string `json:"label,omitempty"`
	OccurredAt    string `json:"occurredAt,omitempty"`
	AmountMinor   int64  `json:"amountMinor,omitempty"`
	Score         float64 `json:"score,omitempty"`
}

type ImportRow struct {
	Index       int             `bson:"index" json:"index"`
	RawDate     string          `bson:"raw_date" json:"rawDate"`
	OccurredAt  time.Time       `bson:"occurred_at" json:"occurredAt"`
	Description string          `bson:"description" json:"description"`
	Notes       string          `bson:"notes,omitempty" json:"notes,omitempty"`
	Reference   string          `bson:"reference,omitempty" json:"reference,omitempty"`
	AmountMinor int64           `bson:"amount_minor" json:"amountMinor"`
	Direction   string          `bson:"direction" json:"direction"`
	State       string          `bson:"state" json:"state"`
	Error       string          `bson:"error,omitempty" json:"error,omitempty"`
	Action      string          `bson:"action" json:"action"`
	Match       *ImportMatchInfo `bson:"match,omitempty" json:"match,omitempty"`
}

type ImportSummary struct {
	TotalRows     int64 `json:"totalRows"`
	ValidRows     int64 `json:"validRows"`
	ErrorRows     int64 `json:"errorRows"`
	DuplicateRows int64 `json:"duplicateRows"`
	PossibleMatches int64 `json:"possibleMatches"`
	NewRows       int64 `json:"newRows"`
	IgnoredRows   int64 `json:"ignoredRows"`
	CreateCount   int64 `json:"createCount"`
	LinkCount     int64 `json:"linkCount"`
}

// ImportSession is one statement upload under review. Rows are embedded so a
// session is read, resolved, and committed as a single document.
type ImportSession struct {
	ID          string              `bson:"_id" json:"id"`
	WorkspaceID string              `bson:"workspace_id" json:"-"`
	VaultID     string              `bson:"vault_id" json:"-"`
	AccountID   string              `bson:"account_id" json:"accountId"`
	CreatedBy   string              `bson:"created_by" json:"-"`
	Status      string              `bson:"status" json:"status"`
	SourceName  string              `bson:"source_name" json:"sourceName"`
	Currency    string              `bson:"currency" json:"currency"`
	Mapping     ImportColumnMapping `bson:"mapping" json:"mapping"`
	Rows        []ImportRow         `bson:"rows" json:"rows"`
	Summary     ImportSummary       `bson:"summary" json:"summary"`
	Result      *ImportResult       `bson:"result,omitempty" json:"result,omitempty"`
	CreatedAt   time.Time           `bson:"created_at" json:"createdAt"`
	UpdatedAt   time.Time           `bson:"updated_at" json:"updatedAt"`
	CompletedAt *time.Time          `bson:"completed_at,omitempty" json:"completedAt,omitempty"`
}

type ImportResult struct {
	CreatedCount int64     `json:"createdCount"`
	LinkedCount  int64     `json:"linkedCount"`
	IgnoredCount int64     `json:"ignoredCount"`
	CommittedAt  time.Time `json:"committedAt"`
}

func (s *ImportSession) RecalculateSummary() {
	s.Summary = ImportSummary{TotalRows: int64(len(s.Rows))}
	for _, row := range s.Rows {
		switch row.State {
		case ImportRowInvalid:
			s.Summary.ErrorRows++
		case ImportRowDuplicate:
			s.Summary.DuplicateRows++
			s.Summary.ValidRows++
		case ImportRowPossibleMatch:
			s.Summary.PossibleMatches++
			s.Summary.ValidRows++
		default:
			s.Summary.ValidRows++
			s.Summary.NewRows++
		}
		switch row.Action {
		case ImportRowActionCreate:
			s.Summary.CreateCount++
		case ImportRowActionIgnore:
			s.Summary.IgnoredRows++
		case ImportRowActionLink:
			s.Summary.LinkCount++
		}
	}
}

func (s *ImportSession) MarshalJSON() ([]byte, error) {
	type publicImportSession ImportSession
	return json.Marshal(struct {
		publicImportSession
		HasErrors bool `json:"hasBlockingErrors"`
	}{
		publicImportSession: publicImportSession(*s),
		HasErrors:           s.Summary.ErrorRows > 0 && s.hasUnresolvedError(),
	})
}

func (s *ImportSession) hasUnresolvedError() bool {
	for _, row := range s.Rows {
		if row.State == ImportRowInvalid && row.Action != ImportRowActionIgnore {
			return true
		}
	}
	return false
}

func MaximumImportRows() int    { return maximumImportRows }
func MaximumImportColumns() int { return maximumImportColumns }
