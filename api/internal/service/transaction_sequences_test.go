package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type sequenceTestStore struct {
	*financeStore
	mu           sync.Mutex
	sequences    map[string]model.TransactionSequence
	transactions map[string]model.Transaction
	idempotent   map[string]model.Transaction
}

type sequenceSearchStore struct {
	*financeStore
	transactionFilters []repository.Filter
}

func (s *sequenceSearchStore) FindMany(
	ctx context.Context,
	collection string,
	filter repository.Filter,
	destination any,
	limit, skip int64,
	sorting repository.Sort,
) error {
	if collection == "transactions" {
		s.transactionFilters = append(s.transactionFilters, filter)
		if transactionID, ok := filter["transaction_id"].(string); ok {
			out := destination.(*[]model.Transaction)
			for _, transaction := range s.transactions {
				if transaction.TransactionID == transactionID {
					*out = append(*out, transaction)
				}
			}
			return nil
		}
		if transactionID, ok := filter["transaction_id"].(repository.Filter); ok {
			prefix, _ := transactionID["$regex"].(string)
			prefix = strings.TrimPrefix(prefix, "^")
			out := destination.(*[]model.Transaction)
			for _, transaction := range s.transactions {
				if strings.HasPrefix(transaction.TransactionID, prefix) {
					*out = append(*out, transaction)
					if limit > 0 && int64(len(*out)) >= limit {
						break
					}
				}
			}
			return nil
		}
	}
	return s.financeStore.FindMany(ctx, collection, filter, destination, limit, skip, sorting)
}

func newSequenceTestFinance() (*FinanceService, *sequenceTestStore) {
	_, base := testFinance()
	base.membership.Role = "owner"
	base.membership.Permissions = nil
	store := &sequenceTestStore{
		financeStore: base,
		sequences:    make(map[string]model.TransactionSequence),
		transactions: make(map[string]model.Transaction),
		idempotent:   make(map[string]model.Transaction),
	}
	return NewFinanceService(store, NewAccessService(store)), store
}

func sequenceTestKey(workspaceID, transactionType string) string {
	return workspaceID + "\x00" + transactionType
}

func sequenceTransactionKey(transaction model.Transaction) string {
	return sequenceTestKey(transaction.WorkspaceID, transaction.SequenceScope) + "\x00" + transaction.TransactionID
}

func (s *sequenceTestStore) sequenceLocked(workspaceID, transactionType string) model.TransactionSequence {
	key := sequenceTestKey(workspaceID, transactionType)
	sequence, ok := s.sequences[key]
	if !ok {
		sequence = model.DefaultTransactionSequence(workspaceID, transactionType)
		s.sequences[key] = sequence
	}
	return sequence
}

func (s *sequenceTestStore) ListTransactionSequences(_ context.Context, workspaceID string) ([]model.TransactionSequence, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sequences := make([]model.TransactionSequence, 0, len(model.TransactionSequenceTypes))
	for _, transactionType := range model.TransactionSequenceTypes {
		sequences = append(sequences, model.PresentTransactionSequence(s.sequenceLocked(workspaceID, transactionType)))
	}
	return sequences, nil
}

func (s *sequenceTestStore) PatchTransactionSequence(_ context.Context, requested model.TransactionSequence) (*model.TransactionSequence, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current := s.sequenceLocked(requested.WorkspaceID, requested.TransactionType)
	if requested.NextNumber < current.NextNumber {
		return nil, &repository.TransactionSequenceMinimumError{
			Minimum: current.NextNumber, MinimumDigits: requested.MinimumDigits,
		}
	}
	s.sequences[sequenceTestKey(requested.WorkspaceID, requested.TransactionType)] = requested
	updated := model.PresentTransactionSequence(requested)
	return &updated, nil
}

func (s *sequenceTestStore) ReserveManualTransactionID(
	_ context.Context,
	workspaceID, transactionType, transactionID string,
) (*model.TransactionSequence, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.reserveManualLocked(workspaceID, transactionType, transactionID)
}

func (s *sequenceTestStore) reserveManualLocked(
	workspaceID, transactionType, transactionID string,
) (*model.TransactionSequence, error) {
	probe := model.Transaction{WorkspaceID: workspaceID, SequenceScope: transactionType, TransactionID: transactionID}
	if _, duplicate := s.transactions[sequenceTransactionKey(probe)]; duplicate {
		return nil, repository.ErrTransactionIDDuplicate
	}
	number, err := model.ParseTransactionSequenceNumber(transactionID)
	if err != nil {
		return nil, err
	}
	sequence := s.sequenceLocked(workspaceID, transactionType)
	if number >= sequence.NextNumber {
		sequence.NextNumber = number + 1
		s.sequences[sequenceTestKey(workspaceID, transactionType)] = sequence
	}
	sequence = model.PresentTransactionSequence(sequence)
	return &sequence, nil
}

func (s *sequenceTestStore) CreateFinancialTransaction(
	_ context.Context,
	transaction *model.Transaction,
	idempotencyKey string,
	_ *time.Time,
	_ *model.AuditEvent,
) (*model.Transaction, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.idempotent[idempotencyKey]; ok {
		copy := existing
		return &copy, nil
	}
	if transaction.AutoGenerateTransactionID {
		sequence := s.sequenceLocked(transaction.WorkspaceID, transaction.SequenceScope)
		if !sequence.AutoGenerate {
			return nil, repository.ErrTransactionAutoDisabled
		}
		transaction.TransactionID = model.FormatTransactionSequenceNumber(sequence.NextNumber, sequence.MinimumDigits)
		sequence.NextNumber++
		s.sequences[sequenceTestKey(transaction.WorkspaceID, transaction.SequenceScope)] = sequence
	} else if _, err := s.reserveManualLocked(
		transaction.WorkspaceID,
		transaction.SequenceScope,
		transaction.TransactionID,
	); err != nil {
		return nil, err
	}
	key := sequenceTransactionKey(*transaction)
	if _, duplicate := s.transactions[key]; duplicate {
		return nil, repository.ErrTransactionIDDuplicate
	}
	copy := *transaction
	s.transactions[key] = copy
	s.idempotent[idempotencyKey] = copy
	return &copy, nil
}

func createSequenceTestTransaction(
	t *testing.T,
	finance *FinanceService,
	mode string,
	ordinal int,
	modify func(*TransactionInput),
) *model.Transaction {
	t.Helper()
	input := TransactionInput{
		VaultID: "vault-a", AccountID: "account-a", Type: mode,
		AmountMinor: 100, Currency: "INR", OccurredAt: time.Now().UTC(),
	}
	switch mode {
	case model.TransactionSequenceTransfer:
		input.DestinationAccountID = "account-b"
	case model.TransactionSequenceSplit:
		input.Type = "expense"
		input.Splits = []model.Split{{UserID: "user-a", AmountMinor: 100}}
	}
	if modify != nil {
		modify(&input)
	}
	transaction, err := finance.CreateTransaction(
		context.Background(), "workspace-a", "user-a",
		fmt.Sprintf("sequence-%s-%03d", mode, ordinal), input,
	)
	if err != nil {
		t.Fatalf("CreateTransaction(%s, %d): %v", mode, ordinal, err)
	}
	return transaction
}

func TestTransactionSequencesStartAtOneAndRemainIndependent(t *testing.T) {
	finance, _ := newSequenceTestFinance()
	for _, mode := range model.TransactionSequenceTypes {
		for ordinal, want := range []string{"0001", "0002", "0003"} {
			transaction := createSequenceTestTransaction(t, finance, mode, ordinal+1, nil)
			if transaction.TransactionID != want {
				t.Fatalf("%s transaction %d ID = %q, want %q", mode, ordinal+1, transaction.TransactionID, want)
			}
			if transaction.SequenceScope != mode {
				t.Fatalf("%s transaction scope = %q", mode, transaction.SequenceScope)
			}
		}
	}
}

func TestListTransactionSequencesReturnsAllFourDefaults(t *testing.T) {
	finance, _ := newSequenceTestFinance()
	sequences, err := finance.ListTransactionSequences(context.Background(), "workspace-a", "user-a")
	if err != nil {
		t.Fatalf("ListTransactionSequences: %v", err)
	}
	if len(sequences) != len(model.TransactionSequenceTypes) {
		t.Fatalf("sequence count = %d, want %d", len(sequences), len(model.TransactionSequenceTypes))
	}
	for index, sequence := range sequences {
		if sequence.TransactionType != model.TransactionSequenceTypes[index] ||
			!sequence.AutoGenerate || sequence.NextNumber != 1 || sequence.MinimumDigits != 4 ||
			sequence.Preview != "0001" || sequence.MinimumAvailableNextNumber != 1 {
			t.Fatalf("sequence[%d] = %#v", index, sequence)
		}
	}
}

func TestTransactionSequenceCustomStartAndWidth(t *testing.T) {
	finance, _ := newSequenceTestFinance()
	next := int64(100)
	digits := 4
	if _, err := finance.UpdateTransactionSequence(
		context.Background(), "workspace-a", "user-a", "expense",
		TransactionSequenceInput{NextNumber: &next, MinimumDigits: &digits},
	); err != nil {
		t.Fatalf("UpdateTransactionSequence(custom start): %v", err)
	}
	if got := createSequenceTestTransaction(t, finance, "expense", 1, nil).TransactionID; got != "0100" {
		t.Fatalf("custom start ID = %q, want 0100", got)
	}

	next = 1
	digits = 6
	if _, err := finance.UpdateTransactionSequence(
		context.Background(), "workspace-a", "user-a", "income",
		TransactionSequenceInput{NextNumber: &next, MinimumDigits: &digits},
	); err != nil {
		t.Fatalf("UpdateTransactionSequence(width): %v", err)
	}
	if got := createSequenceTestTransaction(t, finance, "income", 1, nil).TransactionID; got != "000001" {
		t.Fatalf("six-digit ID = %q, want 000001", got)
	}
}

func TestManualTransactionIDDuplicateIsFriendlyAndUniqueLowerNumbersAreAllowed(t *testing.T) {
	finance, _ := newSequenceTestFinance()
	manual := func(transactionID string) func(*TransactionInput) {
		return func(input *TransactionInput) {
			auto := false
			input.AutoGenerateTransactionID = &auto
			input.TransactionID = transactionID
		}
	}
	createSequenceTestTransaction(t, finance, "expense", 1, manual("0100"))
	if _, err := finance.CreateTransaction(
		context.Background(), "workspace-a", "user-a", "manual-duplicate-002",
		TransactionInput{
			VaultID: "vault-a", AccountID: "account-a", Type: "expense",
			AmountMinor: 100, Currency: "INR", OccurredAt: time.Now().UTC(),
			TransactionID: "0100", AutoGenerateTransactionID: pointerTo(false),
		},
	); err == nil {
		t.Fatal("duplicate manual transaction ID succeeded")
	} else {
		var fieldError *FieldError
		if !errors.As(err, &fieldError) || fieldError.Field != "transactionId" {
			t.Fatalf("duplicate error = %T %v, want transactionId FieldError", err, err)
		}
	}
	createSequenceTestTransaction(t, finance, "expense", 3, manual("0042"))
	if got := createSequenceTestTransaction(t, finance, "expense", 4, nil).TransactionID; got != "0101" {
		t.Fatalf("manual lower number changed high-water mark: got %q, want 0101", got)
	}
}

func TestDisabledAutomaticSequenceRequiresManualTransactionID(t *testing.T) {
	finance, _ := newSequenceTestFinance()
	autoGenerate := false
	if _, err := finance.UpdateTransactionSequence(
		context.Background(), "workspace-a", "user-a", "expense",
		TransactionSequenceInput{AutoGenerate: &autoGenerate},
	); err != nil {
		t.Fatalf("disable automatic IDs: %v", err)
	}
	_, err := finance.CreateTransaction(
		context.Background(), "workspace-a", "user-a", "disabled-auto-001",
		TransactionInput{
			VaultID: "vault-a", AccountID: "account-a", Type: "expense",
			AmountMinor: 100, Currency: "INR", OccurredAt: time.Now().UTC(),
		},
	)
	var fieldError *FieldError
	if !errors.As(err, &fieldError) || fieldError.Field != "transactionId" {
		t.Fatalf("disabled automatic ID error = %#v", err)
	}
	manual := createSequenceTestTransaction(t, finance, "expense", 2, func(input *TransactionInput) {
		input.TransactionID = "0042"
		input.AutoGenerateTransactionID = pointerTo(false)
	})
	if manual.TransactionID != "0042" {
		t.Fatalf("manual ID with automatic generation disabled = %q", manual.TransactionID)
	}
}

func pointerTo[T any](value T) *T { return &value }

func TestDeletedTransactionIDIsNotReusedByAutomaticGeneration(t *testing.T) {
	finance, store := newSequenceTestFinance()
	first := createSequenceTestTransaction(t, finance, "expense", 1, nil)
	store.mu.Lock()
	delete(store.transactions, sequenceTransactionKey(*first))
	store.mu.Unlock()
	if got := createSequenceTestTransaction(t, finance, "expense", 2, nil).TransactionID; got != "0002" {
		t.Fatalf("ID after delete = %q, want 0002", got)
	}
}

func TestTransactionSequenceRejectsLoweringWithFormattedMinimum(t *testing.T) {
	finance, _ := newSequenceTestFinance()
	createSequenceTestTransaction(t, finance, "expense", 1, nil)
	next := int64(1)
	digits := 6
	_, err := finance.UpdateTransactionSequence(
		context.Background(), "workspace-a", "user-a", "expense",
		TransactionSequenceInput{NextNumber: &next, MinimumDigits: &digits},
	)
	var fieldError *FieldError
	if !errors.As(err, &fieldError) || fieldError.Field != "nextNumber" || fieldError.Message != "must be at least 000002, the minimum available next number" {
		t.Fatalf("lowering error = %#v, want formatted nextNumber conflict", err)
	}
}

func TestTransactionSequenceAllocationContractIsConcurrentAndAtomic(t *testing.T) {
	_, store := newSequenceTestFinance()
	const workers = 64
	ids := make(chan string, workers)
	errorsFound := make(chan error, workers)
	var group sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		group.Add(1)
		go func(worker int) {
			defer group.Done()
			transaction, err := store.CreateFinancialTransaction(
				context.Background(),
				&model.Transaction{
					ID: fmt.Sprintf("mongo-%d", worker), WorkspaceID: "workspace-a",
					SequenceScope: model.TransactionSequenceExpense, AutoGenerateTransactionID: true,
				},
				fmt.Sprintf("concurrent-%d", worker), nil, nil,
			)
			if err != nil {
				errorsFound <- err
				return
			}
			ids <- transaction.TransactionID
		}(worker)
	}
	group.Wait()
	close(ids)
	close(errorsFound)
	for err := range errorsFound {
		t.Fatalf("concurrent allocation: %v", err)
	}
	allocated := make([]string, 0, workers)
	for id := range ids {
		allocated = append(allocated, id)
	}
	sort.Strings(allocated)
	for index, id := range allocated {
		want := fmt.Sprintf("%04d", index+1)
		if id != want {
			t.Fatalf("allocated[%d] = %q, want %q", index, id, want)
		}
	}
}

func TestTransactionIDListFilterUsesExactNumericID(t *testing.T) {
	filter, empty, err := transactionQueryForScope(
		"workspace-a", "user-a",
		TransactionFilter{TransactionID: "0012"},
		[]string{"vault-a"}, []string{"account-a"},
	)
	if err != nil || empty {
		t.Fatalf("transactionQueryForScope() = %#v, %v, %v", filter, empty, err)
	}
	if filter["transaction_id"] != "0012" {
		t.Fatalf("transaction ID filter = %#v", filter["transaction_id"])
	}
	if _, _, err := transactionQueryForScope(
		"workspace-a", "user-a",
		TransactionFilter{TransactionID: "00.*"},
		[]string{"vault-a"}, []string{"account-a"},
	); err == nil {
		t.Fatal("regex-like transactionId query was accepted")
	}
}

func TestSearchRanksExactTransactionIDBeforeSafePartialMatches(t *testing.T) {
	_, base := testFinance()
	base.transactions = make([]model.Transaction, 0, 22)
	for index := 0; index < 21; index++ {
		base.transactions = append(base.transactions, model.Transaction{
			ID: fmt.Sprintf("prefix-%02d", index), TransactionID: fmt.Sprintf("0012%02d", index), WorkspaceID: "workspace-a",
		})
	}
	// The exact record is deliberately older than the prefix query's 20-row
	// page. It must still be fetched and ranked first.
	base.transactions = append(base.transactions, model.Transaction{ID: "exact", TransactionID: "0012", WorkspaceID: "workspace-a"})
	store := &sequenceSearchStore{financeStore: base}
	finance := NewFinanceService(store, NewAccessService(store))
	result, err := finance.Search(context.Background(), "workspace-a", "user-a", "0012")
	if err != nil {
		t.Fatalf("Search(numeric ID): %v", err)
	}
	if len(result.Transactions) != 20 || result.Transactions[0].ID != "exact" || result.Transactions[1].ID != "prefix-00" {
		t.Fatalf("ranked transaction results = %#v", result.Transactions)
	}
	if len(store.transactionFilters) != 3 {
		t.Fatalf("transaction search calls = %d, want exact ID, prefix ID, and text searches", len(store.transactionFilters))
	}
	if store.transactionFilters[0]["transaction_id"] != "0012" {
		t.Fatalf("exact ID search filter = %#v", store.transactionFilters[0])
	}
	idFilter, ok := store.transactionFilters[1]["transaction_id"].(repository.Filter)
	if !ok || idFilter["$regex"] != "^0012" {
		t.Fatalf("numeric prefix search filter = %#v", store.transactionFilters[1])
	}
	if _, ok := store.transactionFilters[2]["$text"]; !ok {
		t.Fatalf("text search behavior was not preserved: %#v", store.transactionFilters[2])
	}
}
