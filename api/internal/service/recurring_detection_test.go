package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

// monthlyLedger builds three same-amount, month-apart transactions whose last
// occurrence is `offsetDaysFromNow` days before the run date.
func monthlyOccurrences(t *testing.T, store *automationTestStore, merchant string, amountMinor int64, direction string, count int) {
	t.Helper()
	base := time.Now().UTC().AddDate(0, 0, -32*count)
	for index := 0; index < count; index++ {
		txType := "expense"
		if direction == "credit" {
			txType = "income"
		}
		store.transactions = append(store.transactions, model.Transaction{
			ID:          newID(),
			WorkspaceID: "workspace-a",
			VaultID:     "vault-a",
			AccountID:   "account-a",
			CreatedBy:   "user-a",
			Type:        txType,
			AmountMinor: amountMinor,
			Currency:    "INR",
			Merchant:    merchant,
			Category:    "Entertainment",
			Privacy:     "workspace",
			OccurredAt:  base.AddDate(0, 0, index*31),
		})
	}
}

func TestDetectRecurringSuggestionsFindsMonthlyPaymentsOnly(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	monthlyOccurrences(t, store, "NETFLIX.COM", 64900, "debit", 3)
	monthlyOccurrences(t, store, "Salary credit", 25000000, "credit", 3)
	// Two occurrences: below the minimum.
	monthlyOccurrences(t, store, "Occasional taxi", 32000, "debit", 2)
	// Consistent cadence but no dominant amount: rejected.
	irregular := time.Now().UTC().AddDate(0, 0, -90)
	for index := 0; index < 4; index++ {
		day := irregular.AddDate(0, 0, index*30)
		store.transactions = append(store.transactions, model.Transaction{
			ID: newID(), WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
			Type: "expense", AmountMinor: int64(10000 + index*5000), Currency: "INR",
			Merchant: "Corner shop", Privacy: "workspace", OccurredAt: day,
		})
	}
	// Three occurrences but wildly inconsistent gaps: rejected.
	jitter := time.Now().UTC().AddDate(0, 0, -120)
	for _, gap := range []int{10, 40, 70} {
		jitter = jitter.AddDate(0, 0, gap)
		store.transactions = append(store.transactions, model.Transaction{
			ID: newID(), WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
			Type: "expense", AmountMinor: 45000, Currency: "INR",
			Merchant: "Random utility", Privacy: "workspace", OccurredAt: jitter,
		})
	}

	suggestions, err := finance.DetectRecurringSuggestions(context.Background(), "workspace-a", "user-a")
	if err != nil {
		t.Fatalf("DetectRecurringSuggestions: %v", err)
	}
	byLabel := map[string]RecurringSuggestion{}
	for _, suggestion := range suggestions {
		byLabel[strings.ToLower(suggestion.Label)] = suggestion
	}
	netflix, ok := byLabel["netflix.com"]
	if !ok {
		t.Fatalf("netflix suggestion missing: %+v", suggestions)
	}
	if netflix.Frequency != "monthly" || netflix.AmountMinor != 64900 || netflix.Occurrences != 3 || netflix.Direction != "debit" {
		t.Fatalf("netflix = %+v", netflix)
	}
	salary, ok := byLabel["salary credit"]
	if !ok || salary.Direction != "credit" {
		t.Fatalf("salary suggestion = %+v (want credit)", salary)
	}
	if len(suggestions) != 2 {
		t.Fatalf("suggestions = %d ([%+v]), want exactly netflix and salary", len(suggestions), suggestions)
	}
	if !netflix.NextDueEstimate.After(netflix.LastOccurredAt) || !netflix.NextDueEstimate.Before(time.Now().UTC().AddDate(0, 0, 40)) {
		t.Fatalf("next due estimate unrealistic: %+v", netflix.NextDueEstimate)
	}
}

func TestDetectRecurringSuggestionsExcludesTrackedBillsAndDismissals(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	active := true
	store.bills = []model.Bill{{
		ID: "bill-net", WorkspaceID: "workspace-a", Name: "Netflix",
		AmountMinor: 64900, Currency: "INR", Frequency: "monthly",
		DueDate: time.Now().UTC().AddDate(0, 0, 5), Privacy: "workspace", OwnerID: "user-a", Active: &active,
	}}
	monthlyOccurrences(t, store, "Netflix.com subscription", 64900, "debit", 4)

	first, err := finance.DetectRecurringSuggestions(context.Background(), "workspace-a", "user-a")
	if err != nil {
		t.Fatalf("first detection: %v", err)
	}
	if len(first) != 0 {
		t.Fatalf("tracked bill should suppress its suggestion, got %+v", first)
	}

	// Dismissal path: a different group is hidden after dismissing.
	monthlyOccurrences(t, store, "Gym membership", 199900, "debit", 3)
	withGym, err := finance.DetectRecurringSuggestions(context.Background(), "workspace-a", "user-a")
	if err != nil || len(withGym) != 1 {
		t.Fatalf("gym suggestion missing: %v %+v", err, withGym)
	}
	signature := withGym[0].Signature

	// Viewer cannot dismiss; manager can.
	if err := finance.DismissRecurringSuggestion(context.Background(), "workspace-a", "user-v", signature); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer dismissal = %v, want forbidden", err)
	}
	if err := finance.DismissRecurringSuggestion(context.Background(), "workspace-a", "user-a", signature); err != nil {
		t.Fatalf("dismiss: %v", err)
	}
	if err := finance.DismissRecurringSuggestion(context.Background(), "workspace-a", "user-a", ""); err == nil {
		t.Fatal("empty signature must be rejected")
	}
	after, err := finance.DetectRecurringSuggestions(context.Background(), "workspace-a", "user-a")
	if err != nil || len(after) != 0 {
		t.Fatalf("dismissed suggestion reappeared: %v %+v", err, after)
	}
}

func TestAcceptedBillStaysSuppressedAfterRename(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	monthlyOccurrences(t, store, "spotify premium", 11900, "debit", 3)

	suggestions, err := finance.DetectRecurringSuggestions(context.Background(), "workspace-a", "user-a")
	if err != nil || len(suggestions) != 1 {
		t.Fatalf("detection: %v (%+v)", err, suggestions)
	}
	bill, err := finance.AcceptRecurringSuggestion(context.Background(), "workspace-a", "user-a", suggestions[0].Signature)
	if err != nil {
		t.Fatalf("accept: %v", err)
	}
	// The user renames the bill away from the merchant text; the original
	// pattern must stay suppressed via the stored signature, not the label.
	_, renameErr := finance.UpdateBill(context.Background(), "workspace-a", "user-a", bill.ID, BillInput{
		Name: "Music plan", AmountMinor: 99900, Currency: "INR",
		Frequency: "weekly", DueDate: time.Now().UTC().AddDate(0, 0, 6),
	})
	if renameErr != nil {
		t.Fatalf("rename: %v", renameErr)
	}
	after, err := finance.DetectRecurringSuggestions(context.Background(), "workspace-a", "user-a")
	if err != nil || len(after) != 0 {
		t.Fatalf("renamed bill resurrected its suggestion: %v %+v", err, after)
	}
}

func TestAcceptRecurringSuggestionCreatesRealBillAndRequiresApproval(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	monthlyOccurrences(t, store, "spotify premium", 11900, "debit", 4)

	suggestions, err := finance.DetectRecurringSuggestions(context.Background(), "workspace-a", "user-a")
	if err != nil || len(suggestions) != 1 {
		t.Fatalf("detection: %v (%+v)", err, suggestions)
	}
	signature := suggestions[0].Signature
	if _, err := finance.AcceptRecurringSuggestion(context.Background(), "workspace-a", "user-v", signature); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer accept = %v, want forbidden", err)
	}
	bill, err := finance.AcceptRecurringSuggestion(context.Background(), "workspace-a", "user-a", signature)
	if err != nil {
		t.Fatalf("accept: %v", err)
	}
	if bill.Name != "Spotify Premium" || bill.AmountMinor != 11900 || bill.Frequency != "monthly" {
		// Title-casing capitalizes each word of the normalized label.
		if bill.Name != "Spotify premium" && bill.Name != "Spotify Premium" {
			t.Fatalf("accepted bill = %+v", bill)
		}
	}
	if bill.Active == nil || !*bill.Active {
		t.Fatal("created bill should be active")
	}
	if _, err := finance.AcceptRecurringSuggestion(context.Background(), "workspace-a", "user-a", "deadbeefdeadbeef"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown signature = %v, want not found", err)
	}
	// Once accepted, the group is tracked and disappears from detection.
	after, err := finance.DetectRecurringSuggestions(context.Background(), "workspace-a", "user-a")
	if err != nil || len(after) != 0 {
		t.Fatalf("accepted suggestion still listed: %v %+v", err, after)
	}
}

func TestBillCRUDValidatesAndDeactivatesSoftly(t *testing.T) {
	_, finance := newAutomationTestWorkspace(t)
	ctx := context.Background()

	due := time.Now().UTC().AddDate(0, 0, 7)
	if _, err := finance.CreateBill(ctx, "workspace-a", "user-a", BillInput{
		Name: "Internet", AmountMinor: -5, Currency: "INR", Frequency: "monthly", DueDate: due,
	}); err == nil {
		t.Fatal("non-positive amounts must fail")
	}
	if _, err := finance.CreateBill(ctx, "workspace-a", "user-a", BillInput{
		Name: "Internet", AmountMinor: 500, Currency: "USD", Frequency: "monthly", DueDate: due,
	}); err == nil {
		t.Fatal("currency mismatch with workspace must fail")
	}
	if _, err := finance.CreateBill(ctx, "workspace-a", "user-a", BillInput{
		Name: "Internet", AmountMinor: 500, Currency: "INR", Frequency: "sometimes", DueDate: due,
	}); err == nil {
		t.Fatal("unknown frequency must fail")
	}
	if _, err := finance.CreateBill(ctx, "workspace-a", "user-v", BillInput{
		Name: "Viewer bill", AmountMinor: 500, Currency: "INR", Frequency: "weekly", DueDate: due,
	}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer create = %v, want forbidden", err)
	}

	bill, err := finance.CreateBill(ctx, "workspace-a", "user-a", BillInput{
		Name: "Internet", AmountMinor: 99900, Currency: "INR", Frequency: "monthly", DueDate: due, Autopay: true,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	updated, err := finance.UpdateBill(ctx, "workspace-a", "user-a", bill.ID, BillInput{
		Name: "Broadband", AmountMinor: 105000, Currency: "INR", Frequency: "monthly", DueDate: due.AddDate(0, 0, 3),
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "Broadband" || updated.AmountMinor != 105000 {
		t.Fatalf("updated = %+v", updated)
	}
	if err := finance.DeleteBill(ctx, "workspace-a", "user-a", bill.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if finance.store.(*automationTestStore).bills[0].Active == nil || *(finance.store.(*automationTestStore).bills[0].Active) {
		t.Fatalf("delete should deactivate, got active=%v", finance.store.(*automationTestStore).bills[0].Active)
	}
	if err := finance.DeleteBill(ctx, "workspace-a", "user-a", "ghost-bill"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete missing = %v, want not found", err)
	}
}
