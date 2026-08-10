package repository

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

func TestTransactionSequenceAllocationIsSingleAtomicIncrement(t *testing.T) {
	documentID := transactionSequenceDocumentID("workspace-a", model.TransactionSequenceExpense)
	wantFilter := bson.M{
		"_id":           "workspace-a:expense",
		"auto_generate": true,
		"next_number": bson.M{
			"$gte": int64(1),
			"$lte": model.MaximumTransactionSequenceNumber,
		},
	}
	if got := transactionSequenceAllocationFilter(documentID); !reflect.DeepEqual(got, wantFilter) {
		t.Fatalf("allocation filter = %#v, want %#v", got, wantFilter)
	}
	wantUpdate := bson.M{"$inc": bson.M{"next_number": int64(1)}}
	if got := transactionSequenceAllocationUpdate(); !reflect.DeepEqual(got, wantUpdate) {
		t.Fatalf("allocation update = %#v, want %#v", got, wantUpdate)
	}
}
