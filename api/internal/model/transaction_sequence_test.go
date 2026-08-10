package model

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestTransactionSequenceScopesCoverAllUserFacingModes(t *testing.T) {
	tests := []struct {
		name      string
		rawType   string
		hasSplits bool
		want      string
	}{
		{name: "expense", rawType: "expense", want: TransactionSequenceExpense},
		{name: "income", rawType: "income", want: TransactionSequenceIncome},
		{name: "refund", rawType: "refund", want: TransactionSequenceIncome},
		{name: "reimbursement", rawType: "reimbursement", want: TransactionSequenceIncome},
		{name: "transfer", rawType: "transfer", want: TransactionSequenceTransfer},
		{name: "adjustment", rawType: "adjustment", want: TransactionSequenceExpense},
		{name: "split overrides raw type", rawType: "expense", hasSplits: true, want: TransactionSequenceSplit},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := TransactionSequenceScope(test.rawType, test.hasSplits); got != test.want {
				t.Fatalf("TransactionSequenceScope() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestFormatTransactionSequenceNumberPadsWithoutTruncating(t *testing.T) {
	tests := []struct {
		number int64
		width  int
		want   string
	}{
		{number: 1, width: 4, want: "0001"},
		{number: 100, width: 4, want: "0100"},
		{number: 42, width: 6, want: "000042"},
		{number: 12345, width: 4, want: "12345"},
	}
	for _, test := range tests {
		if got := FormatTransactionSequenceNumber(test.number, test.width); got != test.want {
			t.Errorf("FormatTransactionSequenceNumber(%d, %d) = %q, want %q", test.number, test.width, got, test.want)
		}
	}
}

func TestParseTransactionSequenceNumberRejectsNonNumericAndZero(t *testing.T) {
	for _, value := range []string{"", "0", "0000", "1A", "EXP-1", "-1"} {
		if _, err := ParseTransactionSequenceNumber(value); err == nil {
			t.Errorf("ParseTransactionSequenceNumber(%q) succeeded", value)
		}
	}
	if number, err := ParseTransactionSequenceNumber("0007"); err != nil || number != 7 {
		t.Fatalf("ParseTransactionSequenceNumber(0007) = %d, %v", number, err)
	}
}

func TestTransactionJSONExposesUserFacingIDWithoutReplacingInternalID(t *testing.T) {
	payload, err := json.Marshal(Transaction{
		ID: "mongo-id", TransactionID: "0001", SequenceScope: TransactionSequenceExpense,
	})
	if err != nil {
		t.Fatalf("Marshal(Transaction): %v", err)
	}
	rendered := string(payload)
	if !strings.Contains(rendered, `"id":"mongo-id"`) || !strings.Contains(rendered, `"transactionId":"0001"`) {
		t.Fatalf("transaction JSON = %s", rendered)
	}
	if strings.Contains(rendered, "sequenceScope") || strings.Contains(rendered, "autoGenerateTransactionId") {
		t.Fatalf("internal sequence fields leaked: %s", rendered)
	}
}
