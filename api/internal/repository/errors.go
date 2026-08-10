package repository

import (
	"errors"

	"go.mongodb.org/mongo-driver/mongo"
)

var (
	ErrNotFound                     = errors.New("record not found")
	ErrConflict                     = errors.New("record already exists")
	ErrTransactionIDDuplicate       = errors.New("transaction ID already exists")
	ErrTransactionAutoDisabled      = errors.New("automatic transaction IDs are disabled")
	ErrTransactionSequenceExhausted = errors.New("transaction ID sequence is exhausted")
)

type TransactionSequenceMinimumError struct {
	Minimum       int64
	MinimumDigits int
}

func (e *TransactionSequenceMinimumError) Error() string {
	return "transaction number is below the minimum available number"
}

func normalize(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	if mongo.IsDuplicateKeyError(err) {
		return ErrConflict
	}
	return err
}
