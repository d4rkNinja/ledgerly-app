package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const (
	recurringWindowDays        = 180
	recurringMinimumOccurrence = 3
	recurringScanLimit         = 2000
)

// RecurringSuggestion is a detected candidate recurring payment. Suggestions
// are computed from history on demand — nothing is written until the user
// explicitly accepts (creating a real bill) or dismisses (hiding forever).
type RecurringSuggestion struct {
	Signature       string    `json:"signature"`
	Label           string    `json:"label"`
	Category        string    `json:"category,omitempty"`
	Direction       string    `json:"direction"`
	AmountMinor     int64     `json:"amountMinor"`
	Currency        string    `json:"currency"`
	Frequency       string    `json:"frequency"`
	IntervalDays    int64     `json:"-"`
	Occurrences     int64     `json:"occurrences"`
	LastOccurredAt  time.Time `json:"lastOccurredAt"`
	NextDueEstimate time.Time `json:"nextDueEstimate"`
}

type recurringGroupKey struct {
	direction string
	merchant  string
}

type recurringCandidate struct {
	dates      []time.Time
	amounts    map[int64]int64
	categories map[string]int64
	lastAt     time.Time
	count      int64
}

// DetectRecurringSuggestions analyzes the trailing window of visible history
// and returns groups that look like recurring payments: at least three
// occurrences of a similar label at a consistent interval with a dominant
// amount. Already-active bills and dismissed signatures are excluded.
func (s *FinanceService) DetectRecurringSuggestions(ctx context.Context, workspaceID, actorID string) ([]RecurringSuggestion, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	to := time.Now().UTC()
	from := to.AddDate(0, 0, -recurringWindowDays)
	queryFilter, empty, err := s.transactionQuery(ctx, workspaceID, actorID, TransactionFilter{From: &from, To: &to})
	if err != nil || empty {
		return nil, err
	}
	transactions := make([]model.Transaction, 0, 64)
	if err := s.store.FindMany(ctx, "transactions", queryFilter, &transactions, recurringScanLimit, 0, repository.Sort{"occurred_at": -1}); err != nil {
		return nil, err
	}
	workspace, err := s.requireWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	groups := map[recurringGroupKey]*recurringCandidate{}
	for _, tx := range transactions {
		label := normalizedBillLabel(tx.Merchant)
		if label == "" || tx.AmountMinor <= 0 {
			continue
		}
		key := recurringGroupKey{direction: directionOf(tx.Type), merchant: label}
		group, ok := groups[key]
		if !ok {
			group = &recurringCandidate{
				amounts:    map[int64]int64{},
				categories: map[string]int64{},
			}
			groups[key] = group
		}
		group.count++
		group.dates = append(group.dates, tx.OccurredAt.UTC())
		group.amounts[tx.AmountMinor]++
		if tx.Category != "" {
			group.categories[tx.Category]++
		}
		if tx.OccurredAt.After(group.lastAt) {
			group.lastAt = tx.OccurredAt.UTC()
		}
	}

	activeBills, err := s.activeBillsForExclusion(ctx, workspaceID, actorID)
	if err != nil {
		return nil, err
	}
	dismissed, err := s.dismissedRecurringSignatures(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	suggestions := make([]RecurringSuggestion, 0, 8)
	for key, group := range groups {
		if group.count < recurringMinimumOccurrence {
			continue
		}
		intervalDays, frequency, ok := cadenceForDates(group.dates)
		if !ok {
			continue
		}
		amountMinor, dominant := dominantAmount(group.amounts)
		if !dominant || amountMinor <= 0 {
			continue
		}
		signature := recurringSignature(workspaceID, key.direction, key.merchant, amountMinor, intervalDays)
		if billLabelConflicts(activeBills, key.merchant, signature) {
			continue
		}
		if _, hidden := dismissed[signature]; hidden {
			continue
		}
		nextDue := group.lastAt.AddDate(0, 0, int(intervalDays))
		for nextDue.Before(to) {
			nextDue = nextDue.AddDate(0, 0, int(intervalDays))
		}
		suggestions = append(suggestions, RecurringSuggestion{
			Signature:       signature,
			Label:           displayLabel(key.merchant),
			Category:        topCategory(group.categories),
			Direction:       key.direction,
			AmountMinor:     amountMinor,
			Currency:        workspace.Currency,
			Frequency:       frequency,
			IntervalDays:    intervalDays,
			Occurrences:     group.count,
			LastOccurredAt:  group.lastAt,
			NextDueEstimate: nextDue,
		})
	}
	sort.SliceStable(suggestions, func(left, right int) bool {
		return suggestions[left].NextDueEstimate.Before(suggestions[right].NextDueEstimate)
	})
	return suggestions, nil
}

// AcceptRecurringSuggestion turns one detected suggestion into a real
// recurring bill. This is the approval step: detection itself never writes.
func (s *FinanceService) AcceptRecurringSuggestion(
	ctx context.Context,
	workspaceID, actorID, signature string,
) (*model.Bill, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageBills); err != nil {
		return nil, err
	}
	suggestions, err := s.DetectRecurringSuggestions(ctx, workspaceID, actorID)
	if err != nil {
		return nil, err
	}
	var matched *RecurringSuggestion
	for index := range suggestions {
		if suggestions[index].Signature == signature {
			matched = &suggestions[index]
			break
		}
	}
	if matched == nil {
		return nil, ErrNotFound
	}
	bill, err := s.CreateBill(ctx, workspaceID, actorID, BillInput{
		Name:        matched.Label,
		AmountMinor: matched.AmountMinor,
		Currency:    matched.Currency,
		Frequency:   matched.Frequency,
		DueDate:     matched.NextDueEstimate,
	})
	if err != nil {
		return nil, err
	}
	// Remember which suggestion this bill came from so renaming the bill does
	// not resurrect its detection pattern.
	var stamped model.Bill
	if stampErr := s.store.UpdateOne(ctx, "recurring_transactions", repository.Filter{
		"_id":          bill.ID,
		"workspace_id": workspaceID,
	}, repository.Filter{"$set": repository.Filter{
		"detection_signature": signature,
	}}, &stamped); stampErr != nil && !errors.Is(stampErr, repository.ErrNotFound) {
		return nil, stampErr
	}
	if auditErr := s.audit(ctx, workspaceID, actorID, "bill.from_detection", "bill", bill.ID, map[string]any{
		"signature":   signature,
		"occurrences": matched.Occurrences,
	}); auditErr != nil {
		return nil, auditErr
	}
	return &stamped, nil
}

type RecurringDismissInput struct {
	Signature string `json:"signature"`
}

// DismissRecurringSuggestion permanently hides one suggestion signature so it
// stops appearing in future detections. Dismissals are per-workspace and are
// removed automatically when the workspace is deleted.
func (s *FinanceService) DismissRecurringSuggestion(ctx context.Context, workspaceID, actorID, signature string) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageBills); err != nil {
		return err
	}
	signature = strings.TrimSpace(signature)
	if len(signature) < 8 || len(signature) > 128 {
		return &FieldError{Field: "signature", Message: "is required"}
	}
	record := map[string]any{
		"_id":         workspaceID + "|" + signature,
		"workspace_id": workspaceID,
		"signature":   signature,
		"created_by":  actorID,
		"created_at":  time.Now().UTC(),
	}
	if err := s.store.Insert(ctx, "recurring_dismissals", record); err != nil {
		return err
	}
	return s.audit(ctx, workspaceID, actorID, "recurring_suggestion.dismissed", "recurring_dismissal", workspaceID+"|"+signature, map[string]any{
		"signature": signature,
	})
}

func (s *FinanceService) activeBillsForExclusion(ctx context.Context, workspaceID, actorID string) ([]model.Bill, error) {
	filter := repository.Filter{
		"workspace_id": workspaceID,
		"$and": []repository.Filter{
			{"$or": []repository.Filter{{"active": true}, {"active": repository.Filter{"$exists": false}}}},
			{"$or": []repository.Filter{{"privacy": "workspace"}, {"owner_id": actorID}}},
		},
	}
	bills := make([]model.Bill, 0, 8)
	err := s.store.FindMany(ctx, "recurring_transactions", filter, &bills, 500, 0, repository.Sort{"next_due_at": 1})
	return bills, err
}

// recurringDismissalRow is one hidden suggestion signature.
type recurringDismissalRow struct {
	ID          string `bson:"_id"`
	WorkspaceID string `bson:"workspace_id"`
	Signature   string `bson:"signature"`
}

func (s *FinanceService) dismissedRecurringSignatures(ctx context.Context, workspaceID string) (map[string]struct{}, error) {
	rows := make([]recurringDismissalRow, 0, 4)
	err := s.store.FindMany(ctx, "recurring_dismissals", repository.Filter{
		"workspace_id": workspaceID,
	}, &rows, 500, 0, nil)
	if err != nil {
		return nil, err
	}
	set := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		set[row.Signature] = struct{}{}
	}
	return set, nil
}

func directionOf(txType string) string {
	switch txType {
	case "income", "refund", "reimbursement":
		return "credit"
	default:
		return "debit"
	}
}

// normalizedBillLabel collapses whitespace and case so "NETFLIX.COM",
// "Netflix.com", and "netflix com" group together.
func normalizedBillLabel(value string) string {
	fields := strings.Fields(strings.ToLower(strings.TrimSpace(value)))
	cleaned := make([]string, 0, len(fields))
	for _, field := range fields {
		field = strings.Trim(field, ",.;:!?()[]{}'\"*")
		if field == "" {
			continue
		}
		cleaned = append(cleaned, field)
	}
	if len(cleaned) == 0 {
		return ""
	}
	return strings.Join(cleaned, " ")
}

// displayLabel title-cases a normalized merchant label for presentation.
func displayLabel(normalized string) string {
	if normalized == "" {
		return "Recurring payment"
	}
	parts := strings.Split(normalized, " ")
	for index, part := range parts {
		runes := []rune(part)
		if len(runes) > 1 {
			parts[index] = strings.ToUpper(string(runes[0])) + string(runes[1:])
		}
	}
	return strings.Join(parts, " ")
}

// cadenceForDates sorts dates ascending and derives the median gap. A group
// qualifies when every gap stays within half of the median (tight rhythm) and
// the median maps onto a known frequency.
func cadenceForDates(dates []time.Time) (int64, string, bool) {
	if len(dates) < recurringMinimumOccurrence {
		return 0, "", false
	}
	sorted := append([]time.Time(nil), dates...)
	sort.Slice(sorted, func(left, right int) bool { return sorted[left].Before(sorted[right]) })
	gaps := make([]int64, 0, len(sorted)-1)
	for index := 1; index < len(sorted); index++ {
		gaps = append(gaps, int64(sorted[index].Sub(sorted[index-1]).Hours()/24))
	}
	sort.Slice(gaps, func(left, right int) bool { return gaps[left] < gaps[right] })
	median := gaps[len(gaps)/2]
	if median < 5 || median > 400 {
		return 0, "", false
	}
	for _, gap := range gaps {
		tolerance := median / 2
		if tolerance < 3 {
			tolerance = 3
		}
		if abs64(gap-median) > tolerance {
			return 0, "", false
		}
	}
	switch {
	case median >= 6 && median <= 9:
		return median, "weekly", true
	case median >= 12 && median <= 17:
		return median, "fortnightly", true
	case median >= 26 && median <= 34:
		return median, "monthly", true
	case median >= 85 && median <= 98:
		return median, "quarterly", true
	case median >= 350 && median <= 380:
		return median, "yearly", true
	default:
		return 0, "", false
	}
}

func abs64(value int64) int64 {
	if value < 0 {
		return -value
	}
	return value
}

// dominantAmount requires a strict majority so mixed-amount groups (e.g., a
// merchant with unrelated purchases) never become suggestions.
func dominantAmount(amounts map[int64]int64) (int64, bool) {
	bestAmount, bestCount := int64(0), int64(0)
	total := int64(0)
	for amount, count := range amounts {
		total += count
		if count > bestCount || (count == bestCount && amount < bestAmount) {
			bestAmount, bestCount = amount, count
		}
	}
	if bestCount*2 > total && bestAmount > 0 {
		return bestAmount, true
	}
	return 0, false
}

func topCategory(categories map[string]int64) string {
	bestName, bestCount := "", int64(0)
	for name, count := range categories {
		if count > bestCount {
			bestName, bestCount = name, count
		}
	}
	return bestName
}

// billLabelConflicts reports whether a suggestion overlaps an existing active
// bill: either the normalized labels overlap (either contains the other), or
// the bill was approved from this exact suggestion signature — so renamed
// bills still suppress their original pattern.
func billLabelConflicts(bills []model.Bill, normalizedLabel, signature string) bool {
	for _, bill := range bills {
		if bill.DetectionSignature != "" && bill.DetectionSignature == signature {
			return true
		}
		existing := normalizedBillLabel(bill.Name)
		if existing == "" {
			continue
		}
		if strings.Contains(existing, normalizedLabel) || strings.Contains(normalizedLabel, existing) {
			return true
		}
	}
	return false
}

func recurringSignature(workspaceID, direction, label string, amountMinor, intervalDays int64) string {
	sum := sha256.Sum256([]byte(strings.Join([]string{
		workspaceID, direction, label,
		strconv.FormatInt(amountMinor, 10),
		strconv.FormatInt(intervalDays, 10),
	}, "|")))
	return hex.EncodeToString(sum[:8])
}

var _ = errors.New
