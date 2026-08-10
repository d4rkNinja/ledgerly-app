package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

var errTransactionSequencesUnsupported = errors.New("transaction sequences are not supported by this store")

type TransactionSequenceInput struct {
	AutoGenerate  *bool  `json:"autoGenerate"`
	NextNumber    *int64 `json:"nextNumber"`
	MinimumDigits *int   `json:"minimumDigits"`
}

func transactionIdentifierForCreate(input TransactionInput) (string, bool, error) {
	transactionID := strings.TrimSpace(input.TransactionID)
	if transactionID != "" {
		if input.AutoGenerateTransactionID != nil && *input.AutoGenerateTransactionID {
			return "", false, &FieldError{Field: "autoGenerateTransactionId", Message: "must be false when transactionId is provided"}
		}
		if _, err := model.ParseTransactionSequenceNumber(transactionID); err != nil {
			return "", false, &FieldError{Field: "transactionId", Message: err.Error()}
		}
		return transactionID, false, nil
	}
	if input.AutoGenerateTransactionID != nil && !*input.AutoGenerateTransactionID {
		return "", false, &FieldError{Field: "transactionId", Message: "is required when autoGenerateTransactionId is false"}
	}
	return "", true, nil
}

func transactionIdentifierError(err error, field string) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, repository.ErrTransactionIDDuplicate):
		return &FieldError{Field: "transactionId", Message: "is already in use for this transaction type"}
	case errors.Is(err, repository.ErrTransactionAutoDisabled):
		return &FieldError{Field: "transactionId", Message: "is required because automatic IDs are disabled for this transaction type"}
	case errors.Is(err, repository.ErrTransactionSequenceExhausted):
		return &FieldError{Field: "transactionId", Message: "cannot be generated because this transaction sequence is exhausted"}
	}
	var minimumError *repository.TransactionSequenceMinimumError
	if errors.As(err, &minimumError) {
		formatted := model.FormatTransactionSequenceNumber(minimumError.Minimum, minimumError.MinimumDigits)
		return &FieldError{
			Field:   field,
			Message: fmt.Sprintf("must be at least %s, the minimum available next number", formatted),
		}
	}
	return err
}

func (s *FinanceService) ListTransactionSequences(ctx context.Context, workspaceID, actorID string) ([]model.TransactionSequence, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	return s.listTransactionSequenceSettings(ctx, workspaceID)
}

func (s *FinanceService) listTransactionSequenceSettings(ctx context.Context, workspaceID string) ([]model.TransactionSequence, error) {
	sequenceStore, ok := s.store.(repository.TransactionSequenceStore)
	if ok {
		return sequenceStore.ListTransactionSequences(ctx, workspaceID)
	}
	var persisted []model.TransactionSequence
	if err := s.store.FindMany(
		ctx,
		"transaction_sequences",
		repository.Filter{"workspace_id": workspaceID},
		&persisted,
		int64(len(model.TransactionSequenceTypes)),
		0,
		repository.Sort{"transaction_type": 1},
	); err != nil {
		return nil, err
	}
	byType := make(map[string]model.TransactionSequence, len(persisted))
	for _, sequence := range persisted {
		if model.IsTransactionSequenceType(sequence.TransactionType) {
			byType[sequence.TransactionType] = sequence
		}
	}
	sequences := make([]model.TransactionSequence, 0, len(model.TransactionSequenceTypes))
	for _, transactionType := range model.TransactionSequenceTypes {
		sequence, exists := byType[transactionType]
		if !exists {
			sequence = model.DefaultTransactionSequence(workspaceID, transactionType)
		}
		sequences = append(sequences, model.PresentTransactionSequence(sequence))
	}
	return sequences, nil
}

func (s *FinanceService) UpdateTransactionSequence(
	ctx context.Context,
	workspaceID, actorID, transactionType string,
	input TransactionSequenceInput,
) (*model.TransactionSequence, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditWorkspace); err != nil {
		return nil, err
	}
	transactionType = strings.ToLower(strings.TrimSpace(transactionType))
	if !model.IsTransactionSequenceType(transactionType) {
		return nil, &FieldError{Field: "transactionType", Message: "must be expense, income, transfer, or split"}
	}
	sequenceStore, ok := s.store.(repository.TransactionSequenceStore)
	if !ok {
		return nil, errTransactionSequencesUnsupported
	}
	sequences, err := s.listTransactionSequenceSettings(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	current := model.DefaultTransactionSequence(workspaceID, transactionType)
	for _, sequence := range sequences {
		if sequence.TransactionType == transactionType {
			current = sequence
			break
		}
	}
	if input.AutoGenerate != nil {
		current.AutoGenerate = *input.AutoGenerate
	}
	if input.NextNumber != nil {
		if *input.NextNumber < 1 || *input.NextNumber > model.MaximumTransactionSequenceNumber {
			return nil, &FieldError{
				Field:   "nextNumber",
				Message: fmt.Sprintf("must be between 1 and %d", model.MaximumTransactionSequenceNumber),
			}
		}
		current.NextNumber = *input.NextNumber
	}
	if input.MinimumDigits != nil {
		if *input.MinimumDigits < model.MinimumTransactionSequenceDigits || *input.MinimumDigits > model.MaximumTransactionSequenceDigits {
			return nil, &FieldError{
				Field: "minimumDigits",
				Message: fmt.Sprintf(
					"must be between %d and %d",
					model.MinimumTransactionSequenceDigits,
					model.MaximumTransactionSequenceDigits,
				),
			}
		}
		current.MinimumDigits = *input.MinimumDigits
	}
	updated, err := sequenceStore.PatchTransactionSequence(ctx, current)
	if err != nil {
		return nil, transactionIdentifierError(err, "nextNumber")
	}
	return updated, nil
}

func transactionIDPrefixFilter(value string) (repository.Filter, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	if len(value) > model.MaximumTransactionSequenceDigits {
		return nil, &FieldError{Field: "transactionId", Message: fmt.Sprintf("must contain at most %d digits", model.MaximumTransactionSequenceDigits)}
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return nil, &FieldError{Field: "transactionId", Message: "must contain digits only"}
		}
	}
	return repository.Filter{"$regex": "^" + regexp.QuoteMeta(value)}, nil
}
