package repository

import (
	"context"
	"errors"
	"testing"

	"go.mongodb.org/mongo-driver/mongo"
)

type joinedSessionContext struct {
	context.Context
	mongo.Session
}

func TestWithTransactionRejectsNilFunctionBeforeStartingSession(t *testing.T) {
	store := &MongoStore{}
	if _, err := store.WithTransaction(context.Background(), nil); !errors.Is(err, errTransactionFunctionRequired) {
		t.Fatalf("WithTransaction(nil) error = %v, want %v", err, errTransactionFunctionRequired)
	}
}

func TestMongoTransactionOptionsUseRequiredConcerns(t *testing.T) {
	options := mongoTransactionOptions()
	if options.ReadConcern == nil || options.ReadConcern.GetLevel() != "snapshot" {
		t.Fatalf("read concern = %#v, want snapshot", options.ReadConcern)
	}
	if options.ReadPreference == nil || options.ReadPreference.String() != "primary" {
		t.Fatalf("read preference = %#v, want primary", options.ReadPreference)
	}
	if options.WriteConcern == nil || options.WriteConcern.W != "majority" {
		t.Fatalf("write concern = %#v, want majority", options.WriteConcern)
	}
}

func TestWithTransactionJoinsAnExistingSessionContext(t *testing.T) {
	store := &MongoStore{}
	ctx := joinedSessionContext{Context: context.Background()}
	called := false
	result, err := store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		called = true
		if _, ok := transactionCtx.(mongo.SessionContext); !ok {
			t.Fatalf("joined transaction context type = %T, want mongo.SessionContext", transactionCtx)
		}
		return "joined", nil
	})
	if err != nil || result != "joined" || !called {
		t.Fatalf("joined transaction result = %#v, err=%v, called=%t", result, err, called)
	}
}
