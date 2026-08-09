package repository

import (
	"context"
	"errors"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readconcern"
	"go.mongodb.org/mongo-driver/mongo/readpref"
	"go.mongodb.org/mongo-driver/mongo/writeconcern"
)

var errTransactionFunctionRequired = errors.New("transaction function is required")

func mongoTransactionOptions() *options.TransactionOptions {
	return options.Transaction().
		SetReadConcern(readconcern.Snapshot()).
		SetReadPreference(readpref.Primary()).
		SetWriteConcern(writeconcern.Majority())
}

// WithTransaction executes fn with a session-backed context. Store operations
// called with that context participate in the same MongoDB transaction.
func (s *MongoStore) WithTransaction(ctx context.Context, fn TransactionFunc) (any, error) {
	if fn == nil {
		return nil, errTransactionFunctionRequired
	}
	// MongoDB exposes the active session through mongo.SessionContext. Joining
	// it is essential for service operations that compose financial writes and
	// goal progress in one outer transaction; starting a nested transaction is
	// unsupported by MongoDB and would leave a partial completion window.
	if sessionContext, ok := ctx.(mongo.SessionContext); ok {
		return fn(sessionContext)
	}
	session, err := s.client.StartSession()
	if err != nil {
		return nil, normalize(err)
	}
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), cleanupTimeout)
		defer cancel()
		session.EndSession(cleanupCtx)
	}()

	result, err := session.WithTransaction(ctx, func(sc mongo.SessionContext) (any, error) {
		return fn(sc)
	}, mongoTransactionOptions())
	if err != nil {
		return nil, normalize(err)
	}
	return result, nil
}
