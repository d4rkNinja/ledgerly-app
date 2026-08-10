package repository

import (
	"context"
	"errors"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

const transactionSequencesCollection = "transaction_sequences"

// TransactionSequenceStore is an optional Store capability. Keeping it
// separate preserves the small Store contract used by service test doubles.
type TransactionSequenceStore interface {
	ListTransactionSequences(ctx context.Context, workspaceID string) ([]model.TransactionSequence, error)
	PatchTransactionSequence(ctx context.Context, sequence model.TransactionSequence) (*model.TransactionSequence, error)
	ReserveManualTransactionID(ctx context.Context, workspaceID, transactionType, transactionID string) (*model.TransactionSequence, error)
}

func transactionSequenceDocumentID(workspaceID, transactionType string) string {
	return workspaceID + ":" + transactionType
}

func transactionSequenceAllocationFilter(documentID string) bson.M {
	return bson.M{
		"_id":           documentID,
		"auto_generate": true,
		"next_number": bson.M{
			"$gte": int64(1),
			"$lte": model.MaximumTransactionSequenceNumber,
		},
	}
}

func transactionSequenceAllocationUpdate() bson.M {
	return bson.M{"$inc": bson.M{"next_number": int64(1)}}
}

func (s *MongoStore) ensureTransactionSequence(ctx context.Context, workspaceID, transactionType string) (*model.TransactionSequence, error) {
	defaults := model.DefaultTransactionSequence(workspaceID, transactionType)
	var sequence model.TransactionSequence
	err := s.database.Collection(transactionSequencesCollection).FindOneAndUpdate(
		ctx,
		bson.M{"_id": defaults.ID},
		bson.M{"$setOnInsert": bson.M{
			"workspace_id": workspaceID, "transaction_type": transactionType,
			"auto_generate": true, "next_number": int64(1),
			"minimum_digits": model.DefaultTransactionSequenceMinimumDigits,
		}},
		options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After),
	).Decode(&sequence)
	if mongo.IsDuplicateKeyError(err) {
		err = s.database.Collection(transactionSequencesCollection).FindOne(
			ctx,
			bson.M{"_id": defaults.ID},
		).Decode(&sequence)
	}
	if err != nil {
		return nil, normalize(err)
	}
	sequence = model.PresentTransactionSequence(sequence)
	return &sequence, nil
}

func (s *MongoStore) ListTransactionSequences(ctx context.Context, workspaceID string) ([]model.TransactionSequence, error) {
	var persisted []model.TransactionSequence
	cursor, err := s.database.Collection(transactionSequencesCollection).Find(
		ctx,
		bson.M{"workspace_id": workspaceID},
		options.Find().SetSort(bson.D{{Key: "transaction_type", Value: 1}}),
	)
	if err != nil {
		return nil, normalize(err)
	}
	defer cursor.Close(ctx)
	if err := cursor.All(ctx, &persisted); err != nil {
		return nil, normalize(err)
	}

	byType := make(map[string]model.TransactionSequence, len(persisted))
	for _, sequence := range persisted {
		if model.IsTransactionSequenceType(sequence.TransactionType) {
			byType[sequence.TransactionType] = sequence
		}
	}
	sequences := make([]model.TransactionSequence, 0, len(model.TransactionSequenceTypes))
	for _, transactionType := range model.TransactionSequenceTypes {
		sequence, ok := byType[transactionType]
		if !ok {
			sequence = model.DefaultTransactionSequence(workspaceID, transactionType)
		}
		sequences = append(sequences, model.PresentTransactionSequence(sequence))
	}
	return sequences, nil
}

func (s *MongoStore) PatchTransactionSequence(ctx context.Context, requested model.TransactionSequence) (*model.TransactionSequence, error) {
	current, err := s.ensureTransactionSequence(ctx, requested.WorkspaceID, requested.TransactionType)
	if err != nil {
		return nil, err
	}
	if requested.NextNumber < current.NextNumber {
		return nil, &TransactionSequenceMinimumError{Minimum: current.NextNumber, MinimumDigits: requested.MinimumDigits}
	}

	var updated model.TransactionSequence
	err = s.database.Collection(transactionSequencesCollection).FindOneAndUpdate(
		ctx,
		bson.M{
			"_id":         current.ID,
			"next_number": bson.M{"$lte": requested.NextNumber},
		},
		bson.M{"$set": bson.M{
			"auto_generate":  requested.AutoGenerate,
			"next_number":    requested.NextNumber,
			"minimum_digits": requested.MinimumDigits,
		}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updated)
	if errors.Is(err, mongo.ErrNoDocuments) {
		latest, findErr := s.ensureTransactionSequence(ctx, requested.WorkspaceID, requested.TransactionType)
		if findErr != nil {
			return nil, findErr
		}
		return nil, &TransactionSequenceMinimumError{Minimum: latest.NextNumber, MinimumDigits: requested.MinimumDigits}
	}
	if err != nil {
		return nil, normalize(err)
	}
	updated = model.PresentTransactionSequence(updated)
	return &updated, nil
}

func (s *MongoStore) ReserveManualTransactionID(ctx context.Context, workspaceID, transactionType, transactionID string) (*model.TransactionSequence, error) {
	number, err := model.ParseTransactionSequenceNumber(transactionID)
	if err != nil {
		return nil, err
	}
	var duplicate struct {
		ID string `bson:"_id"`
	}
	err = s.database.Collection(transactionsCollection).FindOne(
		ctx,
		bson.M{
			"workspace_id":   workspaceID,
			"sequence_scope": transactionType,
			"transaction_id": transactionID,
		},
		options.FindOne().SetProjection(bson.M{"_id": 1}),
	).Decode(&duplicate)
	if err == nil {
		return nil, ErrTransactionIDDuplicate
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, normalize(err)
	}
	current, err := s.ensureTransactionSequence(ctx, workspaceID, transactionType)
	if err != nil {
		return nil, err
	}

	var updated model.TransactionSequence
	err = s.database.Collection(transactionSequencesCollection).FindOneAndUpdate(
		ctx,
		bson.M{"_id": current.ID},
		bson.M{"$max": bson.M{"next_number": number + 1}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updated)
	if err != nil {
		return nil, normalize(err)
	}
	updated = model.PresentTransactionSequence(updated)
	return &updated, nil
}

func (s *MongoStore) allocateTransactionID(ctx context.Context, workspaceID, transactionType string) (string, error) {
	current, err := s.ensureTransactionSequence(ctx, workspaceID, transactionType)
	if err != nil {
		return "", err
	}
	if !current.AutoGenerate {
		return "", ErrTransactionAutoDisabled
	}

	var allocated model.TransactionSequence
	err = s.database.Collection(transactionSequencesCollection).FindOneAndUpdate(
		ctx,
		transactionSequenceAllocationFilter(current.ID),
		transactionSequenceAllocationUpdate(),
		options.FindOneAndUpdate().SetReturnDocument(options.Before),
	).Decode(&allocated)
	if errors.Is(err, mongo.ErrNoDocuments) {
		latest, findErr := s.ensureTransactionSequence(ctx, workspaceID, transactionType)
		if findErr != nil {
			return "", findErr
		}
		if !latest.AutoGenerate {
			return "", ErrTransactionAutoDisabled
		}
		return "", ErrTransactionSequenceExhausted
	}
	if err != nil {
		return "", normalize(err)
	}
	return model.FormatTransactionSequenceNumber(allocated.NextNumber, allocated.MinimumDigits), nil
}

func (s *MongoStore) prepareTransactionIdentifier(ctx context.Context, transaction *model.Transaction) error {
	if !model.IsTransactionSequenceType(transaction.SequenceScope) {
		return fmt.Errorf("invalid transaction sequence scope %q", transaction.SequenceScope)
	}
	if transaction.AutoGenerateTransactionID {
		transactionID, err := s.allocateTransactionID(ctx, transaction.WorkspaceID, transaction.SequenceScope)
		if err != nil {
			return err
		}
		transaction.TransactionID = transactionID
		return nil
	}
	_, err := s.ReserveManualTransactionID(ctx, transaction.WorkspaceID, transaction.SequenceScope, transaction.TransactionID)
	return err
}
