package service

import (
	"testing"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

func TestTransactionQueryMapsFourUserFacingTypes(t *testing.T) {
	tests := []struct {
		name            string
		kind            string
		wantType        any
		wantTypePresent bool
		wantSplits      bool
	}{
		{name: "expense", kind: "expense", wantType: repository.Filter{"$in": []string{"expense", "adjustment"}}, wantTypePresent: true, wantSplits: false},
		{name: "income", kind: "income", wantType: repository.Filter{"$in": []string{"income", "refund", "reimbursement"}}, wantTypePresent: true, wantSplits: false},
		{name: "transfer", kind: "transfer", wantType: "transfer", wantTypePresent: true, wantSplits: false},
		{name: "split", kind: "split", wantTypePresent: false, wantSplits: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			query, empty, err := transactionQueryForScope(
				"workspace-a",
				"user-a",
				TransactionFilter{Type: test.kind},
				[]string{"vault-a"},
				[]string{"account-a"},
			)
			if err != nil || empty {
				t.Fatalf("transactionQueryForScope() = (%#v, %t, %v)", query, empty, err)
			}
			gotType, hasType := query["type"]
			if hasType != test.wantTypePresent || (hasType && !filtersEqual(gotType, test.wantType)) {
				t.Fatalf("type = %#v, want %#v", query["type"], test.wantType)
			}
			splits, ok := query["splits.0"].(repository.Filter)
			if !ok || splits["$exists"] != test.wantSplits {
				t.Fatalf("splits filter = %#v, want exists %t", query["splits.0"], test.wantSplits)
			}
		})
	}
}

func TestTransactionQueryValidatesAndAppliesAmountRange(t *testing.T) {
	minimum, maximum := int64(1250), int64(5000)
	query, empty, err := transactionQueryForScope(
		"workspace-a",
		"user-a",
		TransactionFilter{MinAmountMinor: &minimum, MaxAmountMinor: &maximum},
		[]string{"vault-a"},
		[]string{"account-a"},
	)
	if err != nil || empty {
		t.Fatalf("transactionQueryForScope() = (%#v, %t, %v)", query, empty, err)
	}
	amount, ok := query["amount_minor"].(repository.Filter)
	if !ok || amount["$gte"] != minimum || amount["$lte"] != maximum {
		t.Fatalf("amount filter = %#v", query["amount_minor"])
	}

	invalidMinimum, invalidMaximum := int64(5001), int64(5000)
	if _, _, err := transactionQueryForScope(
		"workspace-a",
		"user-a",
		TransactionFilter{MinAmountMinor: &invalidMinimum, MaxAmountMinor: &invalidMaximum},
		[]string{"vault-a"},
		[]string{"account-a"},
	); err == nil {
		t.Fatal("reversed amount bounds should fail")
	}
}

func TestTransactionQueryUsesExactIDFilterAndSafePartialGeneralSearch(t *testing.T) {
	query, empty, err := transactionQueryForScope(
		"workspace-a",
		"user-a",
		TransactionFilter{TransactionID: "0025", Search: "Cafe (north)"},
		[]string{"vault-a"},
		[]string{"account-a"},
	)
	if err != nil || empty {
		t.Fatalf("transactionQueryForScope() = (%#v, %t, %v)", query, empty, err)
	}
	if query["transaction_id"] != "0025" {
		t.Fatalf("transaction ID filter = %#v, want exact 0025", query["transaction_id"])
	}
	clauses, ok := query["$and"].([]repository.Filter)
	if !ok || len(clauses) != 2 {
		t.Fatalf("search clauses = %#v", query["$and"])
	}
	searchClauses, ok := clauses[1]["$or"].([]repository.Filter)
	if !ok || len(searchClauses) == 0 {
		t.Fatalf("search OR = %#v", clauses[1]["$or"])
	}
	idPattern := searchClauses[0]["transaction_id"].(repository.Filter)["$regex"]
	if idPattern != `^Cafe \(north\)` {
		t.Fatalf("escaped ID search pattern = %#v", idPattern)
	}

	if _, _, err := transactionQueryForScope(
		"workspace-a",
		"user-a",
		TransactionFilter{TransactionID: "25x"},
		[]string{"vault-a"},
		[]string{"account-a"},
	); err == nil {
		t.Fatal("non-numeric transaction ID filter should fail")
	}
}

func filtersEqual(left, right any) bool {
	leftFilter, leftOK := left.(repository.Filter)
	rightFilter, rightOK := right.(repository.Filter)
	if leftOK != rightOK {
		return false
	}
	if !leftOK {
		return left == right
	}
	leftValues, leftValuesOK := leftFilter["$in"].([]string)
	rightValues, rightValuesOK := rightFilter["$in"].([]string)
	if leftValuesOK != rightValuesOK || len(leftValues) != len(rightValues) {
		return false
	}
	for index := range leftValues {
		if leftValues[index] != rightValues[index] {
			return false
		}
	}
	return true
}
