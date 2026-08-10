package model

import (
	"fmt"
	"strconv"
	"strings"
)

const (
	TransactionSequenceExpense  = "expense"
	TransactionSequenceIncome   = "income"
	TransactionSequenceTransfer = "transfer"
	TransactionSequenceSplit    = "split"

	DefaultTransactionSequenceMinimumDigits       = 4
	MinimumTransactionSequenceDigits              = 1
	MaximumTransactionSequenceDigits              = 18
	MaximumTransactionSequenceNumber        int64 = 999_999_999_999_999
)

var TransactionSequenceTypes = []string{
	TransactionSequenceExpense,
	TransactionSequenceIncome,
	TransactionSequenceTransfer,
	TransactionSequenceSplit,
}

// TransactionSequence is the persisted counter and formatting preference for
// one user-facing transaction mode in one workspace.
type TransactionSequence struct {
	ID                         string `bson:"_id" json:"-"`
	WorkspaceID                string `bson:"workspace_id" json:"-"`
	TransactionType            string `bson:"transaction_type" json:"transactionType"`
	AutoGenerate               bool   `bson:"auto_generate" json:"autoGenerate"`
	NextNumber                 int64  `bson:"next_number" json:"nextNumber"`
	MinimumDigits              int    `bson:"minimum_digits" json:"minimumDigits"`
	Preview                    string `bson:"-" json:"preview"`
	MinimumAvailableNextNumber int64  `bson:"-" json:"minimumAvailableNextNumber"`
}

func IsTransactionSequenceType(value string) bool {
	for _, transactionType := range TransactionSequenceTypes {
		if value == transactionType {
			return true
		}
	}
	return false
}

// TransactionSequenceScope maps internal accounting types to the four
// user-facing numbering scopes. Adjustments are neutral internally, so legacy
// adjustments use the expense scope unless the record is a split.
func TransactionSequenceScope(rawType string, hasSplits bool) string {
	if hasSplits {
		return TransactionSequenceSplit
	}
	switch strings.ToLower(strings.TrimSpace(rawType)) {
	case TransactionSequenceTransfer:
		return TransactionSequenceTransfer
	case TransactionSequenceIncome, "refund", "reimbursement":
		return TransactionSequenceIncome
	default:
		return TransactionSequenceExpense
	}
}

func FormatTransactionSequenceNumber(number int64, minimumDigits int) string {
	return fmt.Sprintf("%0*d", minimumDigits, number)
}

func ParseTransactionSequenceNumber(value string) (int64, error) {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > MaximumTransactionSequenceDigits {
		return 0, fmt.Errorf("transaction ID must contain 1 to %d digits", MaximumTransactionSequenceDigits)
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return 0, fmt.Errorf("transaction ID must contain digits only")
		}
	}
	number, err := strconv.ParseInt(value, 10, 64)
	if err != nil || number < 1 || number > MaximumTransactionSequenceNumber {
		return 0, fmt.Errorf("transaction ID must be between 1 and %d", MaximumTransactionSequenceNumber)
	}
	return number, nil
}

func DefaultTransactionSequence(workspaceID, transactionType string) TransactionSequence {
	sequence := TransactionSequence{
		ID:              workspaceID + ":" + transactionType,
		WorkspaceID:     workspaceID,
		TransactionType: transactionType,
		AutoGenerate:    true,
		NextNumber:      1,
		MinimumDigits:   DefaultTransactionSequenceMinimumDigits,
	}
	sequence.MinimumAvailableNextNumber = sequence.NextNumber
	sequence.Preview = FormatTransactionSequenceNumber(sequence.NextNumber, sequence.MinimumDigits)
	return sequence
}

func PresentTransactionSequence(sequence TransactionSequence) TransactionSequence {
	if sequence.NextNumber < 1 {
		sequence.NextNumber = 1
	}
	if sequence.MinimumDigits < MinimumTransactionSequenceDigits || sequence.MinimumDigits > MaximumTransactionSequenceDigits {
		sequence.MinimumDigits = DefaultTransactionSequenceMinimumDigits
	}
	sequence.MinimumAvailableNextNumber = sequence.NextNumber
	sequence.Preview = FormatTransactionSequenceNumber(sequence.NextNumber, sequence.MinimumDigits)
	return sequence
}
