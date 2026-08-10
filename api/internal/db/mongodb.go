package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/config"
)

type MongoClient struct {
	Client   *mongo.Client
	Database *mongo.Database
}

type helloResponse struct {
	SetName                      string `bson:"setName"`
	Message                      string `bson:"msg"`
	MaxWireVersion               int32  `bson:"maxWireVersion"`
	LogicalSessionTimeoutMinutes *int32 `bson:"logicalSessionTimeoutMinutes"`
}

const (
	disconnectTimeout                = 5 * time.Second
	replicaSetTransactionWireVersion = 7 // MongoDB 4.0
	shardedTransactionWireVersion    = 8 // MongoDB 4.2
)

func NewClient(ctx context.Context, cfg config.Config) (*MongoClient, error) {
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		return nil, fmt.Errorf("connect mongo: %w", err)
	}
	mc := &MongoClient{Client: client, Database: client.Database(cfg.MongoDatabase)}
	if err := mc.Ping(ctx); err != nil {
		disconnectAfterFailure(client)
		return nil, fmt.Errorf("validate mongo readiness: %w", err)
	}

	now := time.Now().UTC()
	if err := mc.preparePendingInvitationIndex(ctx, now); err != nil {
		disconnectAfterFailure(client)
		return nil, fmt.Errorf("prepare invitation indexes: %w", err)
	}
	if err := mc.invalidateLegacyWorkspaceJoinCodes(ctx, now); err != nil {
		disconnectAfterFailure(client)
		return nil, fmt.Errorf("prepare workspace join-code expiry: %w", err)
	}
	if err := mc.backfillLegacyTransactionDates(ctx); err != nil {
		disconnectAfterFailure(client)
		return nil, fmt.Errorf("prepare transaction date compatibility: %w", err)
	}
	if err := mc.backfillTransactionSequences(ctx); err != nil {
		disconnectAfterFailure(client)
		return nil, fmt.Errorf("prepare transaction sequence compatibility: %w", err)
	}
	if err := mc.createIndexes(ctx); err != nil {
		disconnectAfterFailure(client)
		return nil, fmt.Errorf("create indexes: %w", err)
	}
	return mc, nil
}

func disconnectAfterFailure(client *mongo.Client) {
	cleanupCtx, cancel := context.WithTimeout(context.Background(), disconnectTimeout)
	defer cancel()
	_ = client.Disconnect(cleanupCtx)
}

func (mc *MongoClient) createIndexes(ctx context.Context) error {
	for _, specification := range mongoIndexSpecifications() {
		if _, err := mc.Database.Collection(specification.collection).Indexes().CreateMany(ctx, specification.models); err != nil {
			return fmt.Errorf("%s: %w", specification.collection, err)
		}
	}
	return nil
}

func (mc *MongoClient) Disconnect(ctx context.Context) error {
	return mc.Client.Disconnect(ctx)
}

func (mc *MongoClient) Ping(ctx context.Context) error {
	if err := mc.Client.Ping(ctx, readpref.Primary()); err != nil {
		return err
	}
	var hello helloResponse
	if err := mc.Database.RunCommand(ctx, bson.D{{Key: "hello", Value: 1}}).Decode(&hello); err != nil {
		return fmt.Errorf("inspect deployment topology: %w", err)
	}
	if err := validateTransactionTopology(hello); err != nil {
		return err
	}
	return nil
}

func validateTransactionTopology(hello helloResponse) error {
	if hello.LogicalSessionTimeoutMinutes == nil {
		return errors.New("MongoDB deployment does not support logical sessions required for transactions")
	}
	switch {
	case hello.Message == "isdbgrid":
		if hello.MaxWireVersion < shardedTransactionWireVersion {
			return fmt.Errorf(
				"MongoDB sharded cluster wire version %d does not support transactions; require %d or newer",
				hello.MaxWireVersion,
				shardedTransactionWireVersion,
			)
		}
	case hello.SetName != "":
		if hello.MaxWireVersion < replicaSetTransactionWireVersion {
			return fmt.Errorf(
				"MongoDB replica set wire version %d does not support transactions; require %d or newer",
				hello.MaxWireVersion,
				replicaSetTransactionWireVersion,
			)
		}
	default:
		return errors.New("MongoDB must run as a replica set or sharded cluster because core writes use transactions")
	}
	return nil
}
