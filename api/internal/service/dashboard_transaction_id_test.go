package service

import (
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

func TestDashboardActivityCarriesUserFacingTransactionID(t *testing.T) {
	occurredAt := time.Date(2026, time.August, 8, 0, 0, 0, 0, time.UTC)
	activity := dashboardActivityForTransaction(model.Transaction{
		ID: "internal-id", TransactionID: "0008", Type: "expense",
		AmountMinor: 245000, Currency: "INR", OccurredAt: occurredAt,
	}, "Office Supplies", occurredAt, "INR")
	if activity.TransactionID != "0008" {
		t.Fatalf("transactionId = %q, want 0008", activity.TransactionID)
	}
}
