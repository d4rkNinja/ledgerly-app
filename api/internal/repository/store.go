package repository

import (
	"context"
	"errors"
	"sort"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

type Filter map[string]any
type Sort map[string]int
type Pipeline []Filter
type TransactionFunc func(context.Context) (any, error)

const cleanupTimeout = 5 * time.Second

type Store interface {
	Insert(ctx context.Context, collection string, document any) error
	FindOne(ctx context.Context, collection string, filter Filter, destination any) error
	FindMany(ctx context.Context, collection string, filter Filter, destination any, limit, skip int64, sort Sort) error
	Aggregate(ctx context.Context, collection string, pipeline Pipeline, destination any) error
	UpdateOne(ctx context.Context, collection string, filter Filter, update Filter, destination any) error
	UpdateMany(ctx context.Context, collection string, filter Filter, update Filter) (int64, error)
	DeleteOne(ctx context.Context, collection string, filter Filter) error
	Count(ctx context.Context, collection string, filter Filter) (int64, error)
	WithTransaction(ctx context.Context, fn TransactionFunc) (any, error)
	CreateFinancialTransaction(
		ctx context.Context,
		transaction *model.Transaction,
		idempotencyKey string,
		requestOccurredAt *time.Time,
		audit *model.AuditEvent,
	) (*model.Transaction, error)
}

type MongoStore struct {
	client   *mongo.Client
	database *mongo.Database
}

func NewMongoStore(client *mongo.Client, database *mongo.Database) *MongoStore {
	return &MongoStore{client: client, database: database}
}

// SupportsExactServerAggregation marks the production Mongo implementation.
// Service test doubles intentionally omit this capability and may use their
// bounded fixture fallback without weakening production correctness.
func (s *MongoStore) SupportsExactServerAggregation() bool { return true }

func (s *MongoStore) Insert(ctx context.Context, collection string, document any) error {
	_, err := s.database.Collection(collection).InsertOne(ctx, document)
	return normalize(err)
}

func (s *MongoStore) FindOne(ctx context.Context, collection string, filter Filter, destination any) error {
	return normalize(s.database.Collection(collection).FindOne(ctx, bson.M(filter)).Decode(destination))
}

func (s *MongoStore) FindMany(ctx context.Context, collection string, filter Filter, destination any, limit, skip int64, sorting Sort) error {
	opts := options.Find().
		SetLimit(limit).
		SetSkip(skip).
		SetSort(deterministicSort(sorting))
	cursor, err := s.database.Collection(collection).Find(ctx, bson.M(filter), opts)
	if err != nil {
		return normalize(err)
	}
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), cleanupTimeout)
		defer cancel()
		_ = cursor.Close(cleanupCtx)
	}()
	return normalize(cursor.All(ctx, destination))
}

func (s *MongoStore) Aggregate(ctx context.Context, collection string, pipeline Pipeline, destination any) error {
	mongoPipeline := make(mongo.Pipeline, 0, len(pipeline))
	for _, stage := range pipeline {
		if len(stage) != 1 {
			return errors.New("aggregation stage must contain exactly one operator")
		}
		document := make(bson.D, 0, len(stage))
		for key, value := range stage {
			document = append(document, bson.E{Key: key, Value: value})
		}
		mongoPipeline = append(mongoPipeline, document)
	}
	cursor, err := s.database.Collection(collection).Aggregate(ctx, mongoPipeline)
	if err != nil {
		return normalize(err)
	}
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), cleanupTimeout)
		defer cancel()
		_ = cursor.Close(cleanupCtx)
	}()
	return normalize(cursor.All(ctx, destination))
}

func (s *MongoStore) UpdateOne(ctx context.Context, collection string, filter Filter, update Filter, destination any) error {
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	err := s.database.Collection(collection).FindOneAndUpdate(ctx, bson.M(filter), bson.M(update), opts).Decode(destination)
	return normalize(err)
}

func (s *MongoStore) UpdateMany(ctx context.Context, collection string, filter Filter, update Filter) (int64, error) {
	result, err := s.database.Collection(collection).UpdateMany(ctx, bson.M(filter), bson.M(update))
	if err != nil {
		return 0, normalize(err)
	}
	return result.ModifiedCount, nil
}

func (s *MongoStore) DeleteOne(ctx context.Context, collection string, filter Filter) error {
	result, err := s.database.Collection(collection).DeleteOne(ctx, bson.M(filter))
	if err != nil {
		return normalize(err)
	}
	if result.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *MongoStore) Count(ctx context.Context, collection string, filter Filter) (int64, error) {
	count, err := s.database.Collection(collection).CountDocuments(ctx, bson.M(filter))
	return count, normalize(err)
}

func deterministicSort(requested Sort) bson.D {
	keys := make([]string, 0, len(requested))
	for key := range requested {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	order := make(bson.D, 0, len(keys)+1)
	tieBreakerDirection := 1
	for _, key := range keys {
		direction := requested[key]
		order = append(order, bson.E{Key: key, Value: direction})
		if len(order) == 1 && direction < 0 {
			tieBreakerDirection = -1
		}
	}
	if _, hasIDSort := requested["_id"]; !hasIDSort {
		order = append(order, bson.E{Key: "_id", Value: tieBreakerDirection})
	}
	return order
}
