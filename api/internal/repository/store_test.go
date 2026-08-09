package repository

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

func TestDeterministicSort(t *testing.T) {
	tests := []struct {
		name      string
		requested Sort
		want      bson.D
	}{
		{
			name:      "default sort is stable",
			requested: nil,
			want:      bson.D{{Key: "_id", Value: 1}},
		},
		{
			name:      "descending sort gets matching id tiebreaker",
			requested: Sort{"occurred_at": -1},
			want:      bson.D{{Key: "occurred_at", Value: -1}, {Key: "_id", Value: -1}},
		},
		{
			name:      "map keys have stable ordering",
			requested: Sort{"type": 1, "category": -1},
			want:      bson.D{{Key: "category", Value: -1}, {Key: "type", Value: 1}, {Key: "_id", Value: -1}},
		},
		{
			name:      "explicit id direction is preserved",
			requested: Sort{"_id": -1},
			want:      bson.D{{Key: "_id", Value: -1}},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := deterministicSort(test.requested); !reflect.DeepEqual(got, test.want) {
				t.Fatalf("deterministicSort() = %#v, want %#v", got, test.want)
			}
		})
	}
}

func TestNormalizeMongoErrors(t *testing.T) {
	if got := normalize(mongo.ErrNoDocuments); !errors.Is(got, ErrNotFound) {
		t.Fatalf("normalize(ErrNoDocuments) = %v, want ErrNotFound", got)
	}
	duplicate := mongo.WriteException{WriteErrors: []mongo.WriteError{{Code: 11000}}}
	if got := normalize(duplicate); !errors.Is(got, ErrConflict) {
		t.Fatalf("normalize(duplicate) = %v, want ErrConflict", got)
	}
	sentinel := errors.New("database unavailable")
	if got := normalize(sentinel); !errors.Is(got, sentinel) {
		t.Fatalf("normalize(other) = %v, want original error", got)
	}
}

func TestFinancialPayloadHashCoversPersistedRequest(t *testing.T) {
	base := &model.Transaction{
		ID: "generated-id-a", WorkspaceID: "workspace", VaultID: "vault",
		AccountID: "account", CreatedBy: "user", Type: "expense",
		AmountMinor: 1250, Currency: "INR", Category: "Food",
		Merchant: "Cafe", Notes: "lunch", Tags: []string{"team"},
		Splits:     []model.Split{{UserID: "user", AmountMinor: 1250}},
		Privacy:    "workspace",
		OccurredAt: time.Date(2026, time.July, 26, 10, 30, 0, 0, time.UTC),
		CreatedAt:  time.Date(2026, time.July, 26, 10, 31, 0, 0, time.UTC),
		UpdatedAt:  time.Date(2026, time.July, 26, 10, 31, 0, 0, time.UTC),
	}
	requestOccurredAt := base.OccurredAt
	baseHash, err := financialPayloadHash(base, &requestOccurredAt)
	if err != nil {
		t.Fatalf("financialPayloadHash(base): %v", err)
	}

	retry := *base
	retry.ID = "generated-id-b"
	retry.CreatedAt = retry.CreatedAt.Add(time.Minute)
	retry.UpdatedAt = retry.UpdatedAt.Add(time.Minute)
	retryHash, err := financialPayloadHash(&retry, &requestOccurredAt)
	if err != nil {
		t.Fatalf("financialPayloadHash(retry): %v", err)
	}
	if baseHash != retryHash {
		t.Fatal("generated identifiers and persistence timestamps must not change the idempotency hash")
	}

	changedNotes := retry
	changedNotes.Notes = "dinner"
	changedHash, err := financialPayloadHash(&changedNotes, &requestOccurredAt)
	if err != nil {
		t.Fatalf("financialPayloadHash(changed notes): %v", err)
	}
	if baseHash == changedHash {
		t.Fatal("notes are part of the financial request and must change the idempotency hash")
	}

	delimiterA := retry
	delimiterA.Merchant = "a|b"
	delimiterA.Notes = "c"
	delimiterB := retry
	delimiterB.Merchant = "a"
	delimiterB.Notes = "b|c"
	hashA, err := financialPayloadHash(&delimiterA, &requestOccurredAt)
	if err != nil {
		t.Fatalf("financialPayloadHash(delimiter A): %v", err)
	}
	hashB, err := financialPayloadHash(&delimiterB, &requestOccurredAt)
	if err != nil {
		t.Fatalf("financialPayloadHash(delimiter B): %v", err)
	}
	if hashA == hashB {
		t.Fatal("structured encoding must distinguish delimiter-like field contents")
	}
}

func TestFinancialPayloadHashKeepsOmittedOccurredAtStableAcrossRetries(t *testing.T) {
	first := &model.Transaction{
		WorkspaceID: "workspace", VaultID: "vault", AccountID: "account",
		CreatedBy: "user", Type: "expense", AmountMinor: 1250, Currency: "INR",
		OccurredAt: time.Date(2026, time.July, 29, 10, 30, 0, 0, time.UTC),
	}
	retry := *first
	retry.OccurredAt = first.OccurredAt.Add(5 * time.Second)

	firstHash, err := financialPayloadHash(first, nil)
	if err != nil {
		t.Fatalf("financialPayloadHash(first omitted timestamp): %v", err)
	}
	retryHash, err := financialPayloadHash(&retry, nil)
	if err != nil {
		t.Fatalf("financialPayloadHash(retry omitted timestamp): %v", err)
	}
	if firstHash != retryHash {
		t.Fatal("server-generated occurredAt changed the idempotency fingerprint")
	}

	explicitFirst := first.OccurredAt
	explicitRetry := retry.OccurredAt
	explicitFirstHash, err := financialPayloadHash(first, &explicitFirst)
	if err != nil {
		t.Fatalf("financialPayloadHash(first explicit timestamp): %v", err)
	}
	explicitRetryHash, err := financialPayloadHash(&retry, &explicitRetry)
	if err != nil {
		t.Fatalf("financialPayloadHash(retry explicit timestamp): %v", err)
	}
	if explicitFirstHash == explicitRetryHash {
		t.Fatal("different client-supplied occurredAt values shared an idempotency fingerprint")
	}
}

func TestIdempotencyFiltersDoNotRelyOnTTLSweep(t *testing.T) {
	now := time.Date(2026, time.July, 29, 12, 0, 0, 0, time.UTC)
	wantActive := bson.M{
		"user_id":    "user-a",
		"key":        "request-a",
		"expires_at": bson.M{"$gt": now},
	}
	wantExpired := bson.M{
		"user_id":    "user-a",
		"key":        "request-a",
		"expires_at": bson.M{"$lte": now},
	}
	if got := activeIdempotencyFilter("user-a", "request-a", now); !reflect.DeepEqual(got, wantActive) {
		t.Fatalf("active idempotency filter = %#v, want %#v", got, wantActive)
	}
	if got := expiredIdempotencyFilter("user-a", "request-a", now); !reflect.DeepEqual(got, wantExpired) {
		t.Fatalf("expired idempotency filter = %#v, want %#v", got, wantExpired)
	}
}

func TestTransactionSourceDeltaValidation(t *testing.T) {
	tests := []struct {
		name    string
		tx      model.Transaction
		want    int64
		wantErr bool
	}{
		{name: "expense", tx: model.Transaction{Type: "expense", AmountMinor: 10}, want: -10},
		{name: "income", tx: model.Transaction{Type: "income", AmountMinor: 10}, want: 10},
		{name: "transfer", tx: model.Transaction{Type: "transfer", AmountMinor: 10, AccountID: "a", DestinationAccountID: "b"}, want: -10},
		{name: "zero amount", tx: model.Transaction{Type: "expense"}, wantErr: true},
		{name: "amount above domain maximum", tx: model.Transaction{Type: "expense", AmountMinor: model.MaxMoneyMinor + 1}, wantErr: true},
		{name: "same-account transfer", tx: model.Transaction{Type: "transfer", AmountMinor: 10, AccountID: "a", DestinationAccountID: "a"}, wantErr: true},
		{name: "neutral adjustment", tx: model.Transaction{Type: "adjustment", AmountMinor: 10}, want: 0},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := transactionSourceDelta(&test.tx)
			if (err != nil) != test.wantErr {
				t.Fatalf("transactionSourceDelta() error = %v, wantErr %v", err, test.wantErr)
			}
			if got != test.want {
				t.Fatalf("transactionSourceDelta() = %d, want %d", got, test.want)
			}
		})
	}
}

func TestAggregateRejectsMalformedStageBeforeDatabaseAccess(t *testing.T) {
	store := &MongoStore{}
	err := store.Aggregate(
		context.Background(),
		"transactions",
		Pipeline{{"$match": Filter{}, "$group": Filter{}}},
		&[]any{},
	)
	if err == nil {
		t.Fatal("Aggregate accepted a stage with multiple operators")
	}
}

func TestBalanceRangeForDelta(t *testing.T) {
	tests := []struct {
		name    string
		delta   int64
		wantMin int64
		wantMax int64
		wantErr bool
	}{
		{
			name:    "zero",
			wantMin: -model.MaxMoneyMinor,
			wantMax: model.MaxMoneyMinor,
		},
		{
			name:    "positive increment",
			delta:   25,
			wantMin: -model.MaxMoneyMinor,
			wantMax: model.MaxMoneyMinor - 25,
		},
		{
			name:    "negative increment",
			delta:   -25,
			wantMin: -model.MaxMoneyMinor + 25,
			wantMax: model.MaxMoneyMinor,
		},
		{
			name:    "maximum positive increment",
			delta:   model.MaxMoneyMinor,
			wantMin: -model.MaxMoneyMinor,
			wantMax: 0,
		},
		{
			name:    "maximum negative increment",
			delta:   -model.MaxMoneyMinor,
			wantMin: 0,
			wantMax: model.MaxMoneyMinor,
		},
		{
			name:    "above maximum",
			delta:   model.MaxMoneyMinor + 1,
			wantErr: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			minimum, maximum, err := balanceRangeForDelta(test.delta)
			if (err != nil) != test.wantErr {
				t.Fatalf("balanceRangeForDelta() error = %v, wantErr %v", err, test.wantErr)
			}
			if minimum != test.wantMin || maximum != test.wantMax {
				t.Fatalf("balanceRangeForDelta() = (%d, %d), want (%d, %d)", minimum, maximum, test.wantMin, test.wantMax)
			}
		})
	}
}

func TestTransactionVaultAdjustments(t *testing.T) {
	t.Run("expense adjusts source vault", func(t *testing.T) {
		tx := &model.Transaction{Type: "expense", AmountMinor: 100}
		got := transactionVaultAdjustments(tx, "source", "", -100)
		want := []vaultBalanceAdjustment{{vaultID: "source", delta: -100}}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("adjustments = %#v, want %#v", got, want)
		}
	})

	t.Run("same-vault transfer is net zero", func(t *testing.T) {
		tx := &model.Transaction{Type: "transfer", AmountMinor: 100}
		if got := transactionVaultAdjustments(tx, "shared", "shared", -100); len(got) != 0 {
			t.Fatalf("adjustments = %#v, want none", got)
		}
	})

	t.Run("cross-vault transfer adjusts both vaults", func(t *testing.T) {
		tx := &model.Transaction{Type: "transfer", AmountMinor: 100}
		got := transactionVaultAdjustments(tx, "source", "destination", -100)
		want := []vaultBalanceAdjustment{
			{vaultID: "source", delta: -100},
			{vaultID: "destination", delta: 100},
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("adjustments = %#v, want %#v", got, want)
		}
	})
}
