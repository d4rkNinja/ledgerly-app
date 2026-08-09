package service

import (
	"context"
	"errors"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

var workspaceOwnedCollections = []string{
	"memberships",
	"vaults",
	"accounts",
	"transactions",
	"budgets",
	"recurring_transactions",
	"goals",
	"expense_claims",
	"invitations",
	"workspace_join_requests",
	"notifications",
	"audit_events",
	"idempotency",
	"workspaces",
}

// DeleteWorkspace permanently removes the workspace and every record scoped to
// it. Only the workspace owner may perform this operation.
func (s *FinanceService) DeleteWorkspace(ctx context.Context, workspaceID, actorID string) error {
	workspace, err := s.requireWorkspace(ctx, workspaceID)
	if err != nil {
		return err
	}
	if workspace.OwnerID != actorID {
		return ErrForbidden
	}
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditWorkspace); err != nil {
		return err
	}

	_, err = s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		var current model.Workspace
		if err := s.store.FindOne(transactionCtx, "workspaces", repository.Filter{"_id": workspaceID}, &current); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		if current.OwnerID != actorID {
			return nil, ErrForbidden
		}
		if _, err := s.access.Require(transactionCtx, workspaceID, actorID, model.PermEditWorkspace); err != nil {
			return nil, err
		}
		for _, collection := range workspaceOwnedCollections {
			filter := workspaceDeletionFilter(collection, workspaceID)
			if err := deleteAllMatching(transactionCtx, s.store, collection, filter); err != nil {
				return nil, err
			}
		}
		return nil, nil
	})
	return err
}

func workspaceDeletionFilter(collection, workspaceID string) repository.Filter {
	switch collection {
	case "workspaces":
		return repository.Filter{"_id": workspaceID}
	case "idempotency":
		// Transaction idempotency records retain the original transaction in
		// response.workspace_id rather than a top-level workspace_id field.
		return repository.Filter{"$or": []repository.Filter{
			{"workspace_id": workspaceID},
			{"response.workspace_id": workspaceID},
		}}
	default:
		return repository.Filter{"workspace_id": workspaceID}
	}
}

func deleteAllMatching(ctx context.Context, store repository.Store, collection string, filter repository.Filter) error {
	for {
		err := store.DeleteOne(ctx, collection, filter)
		if errors.Is(err, repository.ErrNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
	}
}

// DeleteTransaction removes one transaction and reverses the balance changes
// that were applied when it was created. The operation is atomic on MongoDB.
func (s *FinanceService) DeleteTransaction(ctx context.Context, workspaceID, actorID, transactionID string) error {
	var transaction model.Transaction
	if err := s.store.FindOne(ctx, "transactions", repository.Filter{
		"_id": transactionID, "workspace_id": workspaceID,
	}, &transaction); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	if err := s.requireTransactionDeletePermission(ctx, workspaceID, actorID, transaction); err != nil {
		return err
	}

	var sourceAccount model.Account
	if err := s.store.FindOne(ctx, "accounts", repository.Filter{
		"_id": transaction.AccountID, "workspace_id": workspaceID,
	}, &sourceAccount); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrConflict
		}
		return err
	}
	if sourceAccount.Currency != transaction.Currency {
		return ErrConflict
	}
	var destinationAccount model.Account
	if transaction.Type == "transfer" {
		if transaction.DestinationAccountID == "" || transaction.DestinationAccountID == transaction.AccountID {
			return ErrConflict
		}
		if err := s.store.FindOne(ctx, "accounts", repository.Filter{
			"_id": transaction.DestinationAccountID, "workspace_id": workspaceID,
		}, &destinationAccount); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return ErrConflict
			}
			return err
		}
		if destinationAccount.Currency != transaction.Currency {
			return ErrConflict
		}
	}

	sourceDelta, err := deletionSourceDelta(transaction)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	_, err = s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		var current model.Transaction
		if err := s.store.FindOne(transactionCtx, "transactions", repository.Filter{
			"_id": transaction.ID, "workspace_id": workspaceID,
		}, &current); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}

		if err := s.reverseBalance(
			transactionCtx, "accounts", sourceAccount.ID, workspaceID, sourceAccount.Currency,
			sourceDelta, now,
		); err != nil {
			return nil, err
		}
		if transaction.Type == "transfer" {
			if err := s.reverseBalance(
				transactionCtx, "accounts", destinationAccount.ID, workspaceID, destinationAccount.Currency,
				-transaction.AmountMinor, now,
			); err != nil {
				return nil, err
			}
		}

		sourceVaultID := sourceAccount.VaultID
		if sourceVaultID == "" {
			sourceVaultID = transaction.VaultID
		}
		if err := s.reverseBalance(
			transactionCtx, "vaults", sourceVaultID, workspaceID, transaction.Currency,
			sourceDelta, now,
		); err != nil {
			return nil, err
		}
		if transaction.Type == "transfer" && destinationAccount.VaultID != sourceVaultID {
			if err := s.reverseBalance(
				transactionCtx, "vaults", destinationAccount.VaultID, workspaceID, transaction.Currency,
				-transaction.AmountMinor, now,
			); err != nil {
				return nil, err
			}
		}

		if err := s.store.DeleteOne(transactionCtx, "transactions", repository.Filter{
			"_id": transaction.ID, "workspace_id": workspaceID,
		}); err != nil {
			return nil, err
		}
		if err := s.store.DeleteOne(transactionCtx, "idempotency", repository.Filter{"_id": transaction.ID}); err != nil && !errors.Is(err, repository.ErrNotFound) {
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "transaction.deleted", "transaction", transaction.ID, map[string]any{
			"type": transaction.Type,
		}); err != nil {
			return nil, err
		}
		return nil, nil
	})
	return err
}

func (s *FinanceService) requireTransactionDeletePermission(ctx context.Context, workspaceID, actorID string, transaction model.Transaction) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermDeleteAllTransactions); err == nil {
		return nil
	} else if !errors.Is(err, ErrForbidden) {
		return err
	}
	if transaction.CreatedBy != actorID {
		return ErrForbidden
	}
	_, err := s.access.Require(ctx, workspaceID, actorID, model.PermDeleteOwnTransactions)
	return err
}

func deletionSourceDelta(transaction model.Transaction) (int64, error) {
	if transaction.AmountMinor <= 0 || transaction.AmountMinor > model.MaxMoneyMinor {
		return 0, ErrConflict
	}
	switch transaction.Type {
	case "expense", "transfer":
		return transaction.AmountMinor, nil
	case "income", "refund", "reimbursement":
		return -transaction.AmountMinor, nil
	case "adjustment":
		return 0, nil
	default:
		return 0, ErrConflict
	}
}

func (s *FinanceService) reverseBalance(ctx context.Context, collection, id, workspaceID, currency string, delta int64, updatedAt time.Time) error {
	if id == "" || currency == "" {
		return ErrConflict
	}
	minimum := -model.MaxMoneyMinor
	maximum := model.MaxMoneyMinor
	if delta < 0 {
		minimum -= delta
	} else if delta > 0 {
		maximum -= delta
	}
	var destination any
	if collection == "accounts" {
		destination = &model.Account{}
	} else {
		destination = &model.Vault{}
	}
	err := s.store.UpdateOne(
		ctx,
		collection,
		repository.Filter{
			"_id": id, "workspace_id": workspaceID, "currency": currency,
			"balance_minor": repository.Filter{"$gte": minimum, "$lte": maximum},
		},
		repository.Filter{
			"$inc": repository.Filter{"balance_minor": delta},
			"$set": repository.Filter{"updated_at": updatedAt},
		},
		destination,
	)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrConflict
	}
	return err
}
