package service

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

// SharePayload is intentionally a small, presentation-safe response. It is
// designed for the native share sheet and never exposes record identifiers,
// workspace identifiers, private notes, or attachment URLs.
type SharePayload struct {
	Title string `json:"title"`
	Text  string `json:"text"`
}

// GetAccount returns an account only when the caller can view its balance and
// can access the account's vault. Archived accounts are deliberately excluded
// from the interactive surface while their historical transactions remain.
func (s *FinanceService) GetAccount(ctx context.Context, workspaceID, actorID, accountID string) (*model.Account, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewBalances); err != nil {
		return nil, err
	}
	return s.requireAccount(ctx, workspaceID, actorID, accountID)
}

func (s *FinanceService) UpdateAccount(ctx context.Context, workspaceID, actorID, accountID string, input AccountInput) (*model.Account, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditVault); err != nil {
		return nil, err
	}
	account, err := s.requireAccount(ctx, workspaceID, actorID, accountID)
	if err != nil {
		return nil, err
	}
	vault, err := s.requireVault(ctx, workspaceID, actorID, account.VaultID)
	if err != nil {
		return nil, err
	}
	input, err = normalizeAccountUpdate(input, *account, *vault)
	if err != nil {
		return nil, err
	}
	delta, err := checkedAddMoney(input.OpeningMinor, -account.OpeningMinor)
	if err != nil {
		return nil, &FieldError{Field: "openingMinor", Message: "exceeds the supported range"}
	}
	now := time.Now().UTC()
	result, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if delta != 0 {
			if err := s.reverseBalance(transactionCtx, "accounts", account.ID, workspaceID, account.Currency, delta, now); err != nil {
				return nil, err
			}
			if err := s.reverseBalance(transactionCtx, "vaults", vault.ID, workspaceID, vault.Currency, delta, now); err != nil {
				return nil, err
			}
		}
		var updated model.Account
		if err := s.store.UpdateOne(transactionCtx, "accounts", repository.Filter{
			"_id": account.ID, "workspace_id": workspaceID, "archived": false,
		}, repository.Filter{
			"$set": repository.Filter{
				"name": input.Name, "bank_name": input.BankName, "type": input.Type,
				"masked_identifier": input.MaskedIdentifier, "opening_minor": input.OpeningMinor,
				"color": input.Color, "icon": input.Icon, "notes": input.Notes, "status": input.Status,
				"exclude_from_total": input.ExcludeFromTotal, "privacy": input.Privacy, "updated_at": now,
			},
		}, &updated); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "account.updated", "account", account.ID, nil); err != nil {
			return nil, err
		}
		return &updated, nil
	})
	if err != nil {
		return nil, err
	}
	updated, ok := result.(*model.Account)
	if !ok {
		return nil, errors.New("unexpected account update result")
	}
	return updated, nil
}

func normalizeAccountUpdate(input AccountInput, account model.Account, vault model.Vault) (AccountInput, error) {
	input.VaultID = strings.TrimSpace(input.VaultID)
	if input.VaultID != "" && input.VaultID != account.VaultID {
		return input, &FieldError{Field: "vaultId", Message: "cannot be changed after account creation"}
	}
	input.Currency = strings.TrimSpace(input.Currency)
	if input.Currency != "" && strings.ToUpper(input.Currency) != account.Currency {
		return input, &FieldError{Field: "currency", Message: "cannot be changed after account creation"}
	}
	if err := validateMoney("openingMinor", input.OpeningMinor, true); err != nil {
		return input, err
	}
	name, err := validatedText("name", input.Name, 1, 100)
	if err != nil {
		return input, err
	}
	kind, err := validatedText("type", valueOrDefault(strings.ToLower(strings.TrimSpace(input.Type)), account.Type), 1, 50)
	if err != nil {
		return input, err
	}
	privacy, err := validPrivacy(input.Privacy, account.Privacy)
	if err != nil {
		return input, err
	}
	if vault.Privacy != "workspace" {
		privacy = vault.Privacy
	}
	input, err = normalizeAccountMetadata(input, account.Status)
	if err != nil {
		return input, err
	}
	input.Name = name
	input.Type = kind
	input.Currency = account.Currency
	input.VaultID = account.VaultID
	input.Privacy = privacy
	return input, nil
}

func normalizeAccountMetadata(input AccountInput, fallbackStatus string) (AccountInput, error) {
	bankName, err := validatedText("bankName", input.BankName, 0, 100)
	if err != nil {
		return input, err
	}
	maskedIdentifier, err := validatedText("maskedIdentifier", input.MaskedIdentifier, 0, 100)
	if err != nil {
		return input, err
	}
	color, err := validAccountColor(input.Color)
	if err != nil {
		return input, err
	}
	icon, err := validatedText("icon", input.Icon, 0, 100)
	if err != nil {
		return input, err
	}
	notes, err := validatedText("notes", input.Notes, 0, 2000)
	if err != nil {
		return input, err
	}
	status, err := validAccountStatus(input.Status, fallbackStatus)
	if err != nil {
		return input, err
	}
	input.BankName = bankName
	input.MaskedIdentifier = maskedIdentifier
	input.Color = color
	input.Icon = icon
	input.Notes = notes
	input.Status = status
	return input, nil
}

// ArchiveAccount is the recoverable account deletion action. Transactions are
// intentionally never touched so reports and audit history remain correct.
func (s *FinanceService) ArchiveAccount(ctx context.Context, workspaceID, actorID, accountID string) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermArchiveVault); err != nil {
		return err
	}
	account, err := s.requireAccount(ctx, workspaceID, actorID, accountID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	_, err = s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		var archived model.Account
		if err := s.store.UpdateOne(transactionCtx, "accounts", repository.Filter{
			"_id": account.ID, "workspace_id": workspaceID, "archived": false,
		}, repository.Filter{"$set": repository.Filter{"archived": true, "updated_at": now}}, &archived); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		return nil, s.audit(transactionCtx, workspaceID, actorID, "account.archived", "account", account.ID, nil)
	})
	return err
}

func (s *FinanceService) ShareAccount(ctx context.Context, workspaceID, actorID, accountID string) (*SharePayload, error) {
	account, err := s.GetAccount(ctx, workspaceID, actorID, accountID)
	if err != nil {
		return nil, err
	}
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermExportData); err != nil {
		return nil, err
	}
	payload := &SharePayload{
		Title: "Account summary",
		Text:  fmt.Sprintf("%s account balance: %s", safeRecordLabel(account.Name, "Account"), shareMoney(account.Currency, account.BalanceMinor)),
	}
	if err := s.audit(ctx, workspaceID, actorID, "account.shared", "account", account.ID, nil); err != nil {
		return nil, err
	}
	return payload, nil
}

func (s *FinanceService) GetTransaction(ctx context.Context, workspaceID, actorID, transactionID string) (*model.Transaction, error) {
	filter, empty, err := s.transactionQuery(ctx, workspaceID, actorID, TransactionFilter{})
	if err != nil {
		return nil, err
	}
	if empty {
		return nil, ErrNotFound
	}
	filter["_id"] = transactionID
	var transaction model.Transaction
	if err := s.store.FindOne(ctx, "transactions", filter, &transaction); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	// hydrateTransactionCreators receives values for list performance. Hydrate
	// a one-item slice and carry the rendered creator back to the record.
	items := []model.Transaction{transaction}
	if err := s.hydrateTransactionCreators(ctx, actorID, items); err != nil {
		return nil, err
	}
	if err := s.hydrateTransactionContacts(ctx, items); err != nil {
		return nil, err
	}
	return &items[0], nil
}

func (s *FinanceService) UpdateTransaction(ctx context.Context, workspaceID, actorID, transactionID string, input TransactionInput) (*model.Transaction, error) {
	result, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		current, err := s.getTransactionForMutation(transactionCtx, workspaceID, actorID, transactionID)
		if err != nil {
			return nil, err
		}
		if err := s.requireTransactionEditPermission(transactionCtx, workspaceID, actorID, *current); err != nil {
			return nil, err
		}
		preservedInput := preserveOmittedTransactionFields(input, *current)
		next, _, _, err := s.transactionFromInput(transactionCtx, workspaceID, actorID, preservedInput, current)
		if err != nil {
			return nil, err
		}
		now := time.Now().UTC()
		next.ID = current.ID
		next.WorkspaceID = current.WorkspaceID
		next.CreatedBy = current.CreatedBy
		next.CreatedAt = current.CreatedAt
		next.UpdatedAt = now
		if next.TransactionID != current.TransactionID {
			sequenceStore, ok := s.store.(repository.TransactionSequenceStore)
			if ok {
				if _, err := sequenceStore.ReserveManualTransactionID(
					transactionCtx,
					workspaceID,
					next.SequenceScope,
					next.TransactionID,
				); err != nil {
					return nil, err
				}
			}
		}
		oldSource, oldDestination, err := s.transactionAccountsForBalance(transactionCtx, workspaceID, *current)
		if err != nil {
			return nil, err
		}
		currentNextSource, currentNextDestination, err := s.transactionAccountsForBalance(transactionCtx, workspaceID, next)
		if err != nil {
			return nil, err
		}
		if err := s.applyTransactionBalanceChange(transactionCtx, *current, oldSource, oldDestination, true, now); err != nil {
			return nil, err
		}
		if err := s.applyTransactionBalanceChange(transactionCtx, next, currentNextSource, currentNextDestination, false, now); err != nil {
			return nil, err
		}
		var updated model.Transaction
		if err := s.store.UpdateOne(transactionCtx, "transactions", repository.Filter{
			"_id": current.ID, "workspace_id": workspaceID,
		}, repository.Filter{"$set": transactionUpdateFields(next)}, &updated); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		ledgerVersion, err := s.advanceLedgerVersion(transactionCtx, workspaceID)
		if err != nil {
			return nil, err
		}
		audit := transactionRevisionAudit(
			workspaceID, actorID, "transaction.updated", current.ID,
			model.NewTransactionRevisionSnapshot(current), model.NewTransactionRevisionSnapshot(&updated), ledgerVersion,
		)
		audit.SplitAllocationChanged = model.TransactionSplitAllocationChanged(current, &updated)
		if !slices.Equal(current.Tags, updated.Tags) {
			audit.ChangedFields = append(audit.ChangedFields, "tags")
		}
		if err := s.store.Insert(transactionCtx, "audit_events", audit); err != nil {
			return nil, err
		}
		return &updated, nil
	})
	if err != nil {
		return nil, transactionIdentifierError(err, "transactionId")
	}
	updated, ok := result.(*model.Transaction)
	if !ok {
		return nil, errors.New("unexpected transaction update result")
	}
	items := []model.Transaction{*updated}
	if err := s.hydrateTransactionCreators(ctx, actorID, items); err == nil {
		updated.Creator = items[0].Creator
	}
	return updated, nil
}

// Transaction updates use a full accounting input, but the app deliberately
// keeps collaborator identifiers in splits and internal tags out of its list
// view. A missing field therefore means "retain the existing protected
// value"; an explicitly provided empty slice still clears that field.
func preserveOmittedTransactionFields(input TransactionInput, existing model.Transaction) TransactionInput {
	if strings.TrimSpace(input.TransactionID) == "" {
		input.TransactionID = existing.TransactionID
	}
	if input.Tags == nil {
		input.Tags = append([]string(nil), existing.Tags...)
	}
	if input.Splits == nil {
		input.Splits = append([]model.Split(nil), existing.Splits...)
	}
	if strings.TrimSpace(input.Privacy) == "" {
		input.Privacy = existing.Privacy
	}
	if strings.TrimSpace(input.GoalID) == "" {
		input.GoalID = existing.GoalID
	}
	return input
}

func (s *FinanceService) getTransactionForMutation(ctx context.Context, workspaceID, actorID, transactionID string) (*model.Transaction, error) {
	// The mutation path deliberately uses the same visibility scope as GET so
	// edit-all permissions never reveal or mutate a private, inaccessible vault.
	filter, empty, err := s.transactionQuery(ctx, workspaceID, actorID, TransactionFilter{})
	if err != nil {
		return nil, err
	}
	if empty {
		return nil, ErrNotFound
	}
	filter["_id"] = transactionID
	var transaction model.Transaction
	if err := s.store.FindOne(ctx, "transactions", filter, &transaction); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &transaction, nil
}

func (s *FinanceService) requireTransactionEditPermission(ctx context.Context, workspaceID, actorID string, transaction model.Transaction) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditAllTransactions); err == nil {
		return nil
	} else if !errors.Is(err, ErrForbidden) {
		return err
	}
	if transaction.CreatedBy != actorID {
		return ErrForbidden
	}
	_, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditOwnTransactions)
	return err
}

func (s *FinanceService) transactionFromInput(ctx context.Context, workspaceID, actorID string, input TransactionInput, existing *model.Transaction) (model.Transaction, *model.Account, *model.Account, error) {
	kind := strings.ToLower(strings.TrimSpace(input.Type))
	switch kind {
	case "expense", "income", "transfer", "refund", "reimbursement", "adjustment":
	default:
		return model.Transaction{}, nil, nil, &FieldError{Field: "type", Message: "is not supported"}
	}
	transactionID := strings.TrimSpace(input.TransactionID)
	if transactionID != "" {
		if _, err := model.ParseTransactionSequenceNumber(transactionID); err != nil {
			return model.Transaction{}, nil, nil, &FieldError{Field: "transactionId", Message: err.Error()}
		}
	}
	sequenceScope := model.TransactionSequenceScope(kind, len(input.Splits) > 0)
	if existing != nil {
		sequenceScope = existing.SequenceScope
		if !model.IsTransactionSequenceType(sequenceScope) {
			sequenceScope = model.TransactionSequenceScope(existing.Type, len(existing.Splits) > 0)
		}
	}
	if err := validateMoney("amountMinor", input.AmountMinor, false); err != nil {
		return model.Transaction{}, nil, nil, err
	}
	account, err := s.requireAccount(ctx, workspaceID, actorID, input.AccountID)
	if err != nil {
		return model.Transaction{}, nil, nil, err
	}
	input.VaultID = strings.TrimSpace(input.VaultID)
	if input.VaultID == "" {
		input.VaultID = account.VaultID
	}
	currency, err := validCurrency(input.Currency)
	if err != nil {
		return model.Transaction{}, nil, nil, err
	}
	if account.Currency != currency || account.VaultID != input.VaultID {
		return model.Transaction{}, nil, nil, &FieldError{Field: "accountId", Message: "does not belong to the selected vault and currency"}
	}
	var destination *model.Account
	if kind == "transfer" {
		if input.DestinationAccountID == "" || input.DestinationAccountID == input.AccountID {
			return model.Transaction{}, nil, nil, &FieldError{Field: "destinationAccountId", Message: "must identify a different account"}
		}
		destination, err = s.requireAccount(ctx, workspaceID, actorID, input.DestinationAccountID)
		if err != nil {
			return model.Transaction{}, nil, nil, err
		}
		if destination.Currency != currency {
			return model.Transaction{}, nil, nil, &FieldError{Field: "destinationAccountId", Message: "must use the same currency"}
		}
	} else {
		input.DestinationAccountID = ""
	}
	if err := s.validateSplits(ctx, workspaceID, input.Splits, input.AmountMinor); err != nil {
		return model.Transaction{}, nil, nil, err
	}
	occurredAt := input.OccurredAt.UTC()
	if input.OccurredAt.IsZero() {
		if existing != nil {
			// Keep a legacy zero occurred_at zero so its documented created_at
			// compatibility date remains stable after unrelated edits.
			occurredAt = existing.OccurredAt.UTC()
		} else {
			occurredAt = time.Now().UTC()
		}
	}
	privacy, err := validPrivacy(input.Privacy, "workspace")
	if err != nil {
		return model.Transaction{}, nil, nil, err
	}
	if account.Privacy != "workspace" || (destination != nil && destination.Privacy != "workspace") {
		privacy = "private"
	}
	category, err := validatedText("category", input.Category, 0, 100)
	if err != nil {
		return model.Transaction{}, nil, nil, err
	}
	category, err = s.validateTransactionCategory(ctx, workspaceID, kind, category, input.Splits, existing)
	if err != nil {
		return model.Transaction{}, nil, nil, err
	}
	merchant, err := validatedText("merchant", input.Merchant, 0, 200)
	if err != nil {
		return model.Transaction{}, nil, nil, err
	}
	notes, err := validatedText("notes", input.Notes, 0, 2000)
	if err != nil {
		return model.Transaction{}, nil, nil, err
	}
	description, err := validatedText("description", input.Description, 0, 2000)
	if err != nil {
		return model.Transaction{}, nil, nil, err
	}
	contactID, err := s.validContactID(ctx, workspaceID, input.ContactID)
	if err != nil {
		return model.Transaction{}, nil, nil, err
	}
	goalID := strings.TrimSpace(input.GoalID)
	if goalID != "" {
		var goal model.Goal
		if err := s.store.FindOne(ctx, "goals", repository.Filter{"_id": goalID, "workspace_id": workspaceID}, &goal); err != nil {
			return model.Transaction{}, nil, nil, &FieldError{Field: "goalId", Message: "must reference a goal in this workspace"}
		}
		if goal.VaultID != "" && goal.VaultID != input.VaultID {
			return model.Transaction{}, nil, nil, &FieldError{Field: "goalId", Message: "must reference a goal in the selected vault"}
		}
	}
	return model.Transaction{
		TransactionID: transactionID, SequenceScope: sequenceScope,
		VaultID: input.VaultID, AccountID: input.AccountID, DestinationAccountID: input.DestinationAccountID,
		Type: kind, AmountMinor: input.AmountMinor, Currency: currency, Category: category, Merchant: merchant,
		Notes: notes, Description: description, ContactID: contactID, GoalID: goalID, Tags: normalizedTags(input.Tags), Splits: input.Splits, Privacy: privacy, OccurredAt: occurredAt,
	}, account, destination, nil
}

func (s *FinanceService) transactionAccountsForBalance(ctx context.Context, workspaceID string, transaction model.Transaction) (*model.Account, *model.Account, error) {
	var source model.Account
	if err := s.store.FindOne(ctx, "accounts", repository.Filter{"_id": transaction.AccountID, "workspace_id": workspaceID}, &source); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil, ErrConflict
		}
		return nil, nil, err
	}
	if source.Currency != transaction.Currency {
		return nil, nil, ErrConflict
	}
	if transaction.Type != "transfer" {
		return &source, nil, nil
	}
	if transaction.DestinationAccountID == "" || transaction.DestinationAccountID == transaction.AccountID {
		return nil, nil, ErrConflict
	}
	var destination model.Account
	if err := s.store.FindOne(ctx, "accounts", repository.Filter{"_id": transaction.DestinationAccountID, "workspace_id": workspaceID}, &destination); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil, ErrConflict
		}
		return nil, nil, err
	}
	if destination.Currency != transaction.Currency {
		return nil, nil, ErrConflict
	}
	return &source, &destination, nil
}

func (s *FinanceService) applyTransactionBalanceChange(ctx context.Context, transaction model.Transaction, source, destination *model.Account, reverse bool, now time.Time) error {
	if source == nil {
		return ErrConflict
	}
	delta, err := transactionSourceBalanceDelta(transaction)
	if err != nil {
		return err
	}
	if reverse {
		delta = -delta
	}
	if err := s.reverseBalance(ctx, "accounts", source.ID, transaction.WorkspaceID, source.Currency, delta, now); err != nil {
		return err
	}
	if transaction.Type == "transfer" {
		if destination == nil {
			return ErrConflict
		}
		destinationDelta := transaction.AmountMinor
		if reverse {
			destinationDelta = -destinationDelta
		}
		if err := s.reverseBalance(ctx, "accounts", destination.ID, transaction.WorkspaceID, destination.Currency, destinationDelta, now); err != nil {
			return err
		}
	}
	sourceVaultID := source.VaultID
	if sourceVaultID == "" {
		sourceVaultID = transaction.VaultID
	}
	if transaction.Type != "transfer" || destination == nil || destination.VaultID != sourceVaultID {
		if err := s.reverseBalance(ctx, "vaults", sourceVaultID, transaction.WorkspaceID, transaction.Currency, delta, now); err != nil {
			return err
		}
	}
	if transaction.Type == "transfer" && destination != nil && destination.VaultID != sourceVaultID {
		destinationDelta := transaction.AmountMinor
		if reverse {
			destinationDelta = -destinationDelta
		}
		if err := s.reverseBalance(ctx, "vaults", destination.VaultID, transaction.WorkspaceID, transaction.Currency, destinationDelta, now); err != nil {
			return err
		}
	}
	return nil
}

func transactionSourceBalanceDelta(transaction model.Transaction) (int64, error) {
	if transaction.AmountMinor <= 0 || transaction.AmountMinor > model.MaxMoneyMinor {
		return 0, ErrConflict
	}
	switch transaction.Type {
	case "expense", "transfer":
		return -transaction.AmountMinor, nil
	case "income", "refund", "reimbursement":
		return transaction.AmountMinor, nil
	case "adjustment":
		return 0, nil
	default:
		return 0, ErrConflict
	}
}

func transactionUpdateFields(transaction model.Transaction) repository.Filter {
	return repository.Filter{
		"transaction_id": transaction.TransactionID, "sequence_scope": transaction.SequenceScope,
		"vault_id": transaction.VaultID, "account_id": transaction.AccountID, "destination_account_id": transaction.DestinationAccountID,
		"type": transaction.Type, "amount_minor": transaction.AmountMinor, "currency": transaction.Currency,
		"category": transaction.Category, "merchant": transaction.Merchant, "notes": transaction.Notes,
		"description": transaction.Description, "contact_id": transaction.ContactID, "goal_id": transaction.GoalID,
		"tags": transaction.Tags, "splits": transaction.Splits, "privacy": transaction.Privacy,
		"occurred_at": transaction.OccurredAt, "updated_at": transaction.UpdatedAt,
	}
}

func (s *FinanceService) ShareTransaction(ctx context.Context, workspaceID, actorID, transactionID string) (*SharePayload, error) {
	transaction, err := s.GetTransaction(ctx, workspaceID, actorID, transactionID)
	if err != nil {
		return nil, err
	}
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermExportData); err != nil {
		return nil, err
	}
	label := safeRecordLabel(transaction.Category, friendlyTransactionType(transaction.Type))
	lines := make([]string, 0, 6)
	if transaction.TransactionID != "" {
		lines = append(lines, "Transaction ID: "+transaction.TransactionID)
	}
	lines = append(lines, fmt.Sprintf("%s: %s %s on %s", label, friendlyTransactionType(transaction.Type),
		shareMoney(transaction.Currency, transaction.AmountMinor), shareDate(effectiveTransactionDate(*transaction))))
	if transaction.Merchant != "" && !strings.Contains(strings.ToLower(transaction.Merchant), "http://") && !strings.Contains(strings.ToLower(transaction.Merchant), "https://") {
		lines = append(lines, "Name: "+transaction.Merchant)
	}
	if transaction.Category != "" {
		lines = append(lines, "Category: "+transaction.Category)
	}
	if transaction.Contact != nil {
		lines = append(lines, "Contact: "+transaction.Contact.Name)
	}
	if transaction.Description != "" && !strings.Contains(strings.ToLower(transaction.Description), "http://") && !strings.Contains(strings.ToLower(transaction.Description), "https://") {
		lines = append(lines, "Description: "+transaction.Description)
	}
	payload := &SharePayload{
		Title: "Transaction summary",
		Text:  strings.Join(lines, "\n"),
	}
	if err := s.audit(ctx, workspaceID, actorID, "transaction.shared", "transaction", transaction.ID, nil); err != nil {
		return nil, err
	}
	return payload, nil
}

func (s *FinanceService) GetBudget(ctx context.Context, workspaceID, actorID, budgetID string) (*model.Budget, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	var budget model.Budget
	if err := s.store.FindOne(ctx, "budgets", repository.Filter{"_id": budgetID, "workspace_id": workspaceID}, &budget); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if budget.VaultID != "" {
		if _, err := s.requireVault(ctx, workspaceID, actorID, budget.VaultID); err != nil {
			return nil, err
		}
	}
	return &budget, nil
}

func (s *FinanceService) UpdateBudget(ctx context.Context, workspaceID, actorID, budgetID string, input BudgetInput) (*model.Budget, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageBudgets); err != nil {
		return nil, err
	}
	budget, err := s.GetBudget(ctx, workspaceID, actorID, budgetID)
	if err != nil {
		return nil, err
	}
	input, err = s.normalizeBudgetUpdate(ctx, workspaceID, actorID, input, *budget)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	result, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		var updated model.Budget
		if err := s.store.UpdateOne(transactionCtx, "budgets", repository.Filter{"_id": budget.ID, "workspace_id": workspaceID}, repository.Filter{"$set": repository.Filter{
			"vault_id": input.VaultID, "name": input.Name, "amount_minor": input.AmountMinor, "currency": input.Currency,
			"period": input.Period, "categories": input.Categories, "rollover": input.Rollover,
			"start_at": input.StartAt, "end_at": input.EndAt, "updated_at": now,
		}}, &updated); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "budget.updated", "budget", budget.ID, nil); err != nil {
			return nil, err
		}
		return &updated, nil
	})
	if err != nil {
		return nil, err
	}
	updated, ok := result.(*model.Budget)
	if !ok {
		return nil, errors.New("unexpected budget update result")
	}
	return updated, nil
}

func (s *FinanceService) normalizeBudgetUpdate(ctx context.Context, workspaceID, actorID string, input BudgetInput, current model.Budget) (BudgetInput, error) {
	input.VaultID = strings.TrimSpace(input.VaultID)
	if input.VaultID == "" {
		input.VaultID = current.VaultID
	}
	if err := validateMoney("amountMinor", input.AmountMinor, false); err != nil {
		return input, err
	}
	if !input.EndAt.After(input.StartAt) {
		return input, &FieldError{Field: "endAt", Message: "must be after startAt"}
	}
	currency, err := validCurrency(input.Currency)
	if err != nil {
		return input, err
	}
	if input.VaultID != "" {
		vault, err := s.requireVault(ctx, workspaceID, actorID, input.VaultID)
		if err != nil {
			return input, err
		}
		if currency != vault.Currency {
			return input, &FieldError{Field: "currency", Message: "must match the vault currency"}
		}
	}
	name, err := validatedText("name", input.Name, 1, 100)
	if err != nil {
		return input, err
	}
	period, err := validatedText("period", valueOrDefault(strings.ToLower(strings.TrimSpace(input.Period)), "custom"), 1, 50)
	if err != nil {
		return input, err
	}
	input.Name, input.Currency, input.Period = name, currency, period
	input.Categories = normalizedTags(input.Categories)
	input.StartAt, input.EndAt = input.StartAt.UTC(), input.EndAt.UTC()
	return input, nil
}

func (s *FinanceService) DeleteBudget(ctx context.Context, workspaceID, actorID, budgetID string) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageBudgets); err != nil {
		return err
	}
	budget, err := s.GetBudget(ctx, workspaceID, actorID, budgetID)
	if err != nil {
		return err
	}
	_, err = s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if err := s.store.DeleteOne(transactionCtx, "budgets", repository.Filter{"_id": budget.ID, "workspace_id": workspaceID}); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		return nil, s.audit(transactionCtx, workspaceID, actorID, "budget.deleted", "budget", budget.ID, nil)
	})
	return err
}

func (s *FinanceService) ShareBudget(ctx context.Context, workspaceID, actorID, budgetID string) (*SharePayload, error) {
	budget, err := s.GetBudget(ctx, workspaceID, actorID, budgetID)
	if err != nil {
		return nil, err
	}
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermExportData); err != nil {
		return nil, err
	}
	payload := &SharePayload{
		Title: "Budget summary",
		Text:  fmt.Sprintf("%s budget: %s for a %s period", safeRecordLabel(budget.Name, "Budget"), shareMoney(budget.Currency, budget.AmountMinor), safeRecordLabel(budget.Period, "custom")),
	}
	if err := s.audit(ctx, workspaceID, actorID, "budget.shared", "budget", budget.ID, nil); err != nil {
		return nil, err
	}
	return payload, nil
}

func (s *FinanceService) GetGoal(ctx context.Context, workspaceID, actorID, goalID string) (*model.Goal, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	var goal model.Goal
	if err := s.store.FindOne(ctx, "goals", repository.Filter{"_id": goalID, "workspace_id": workspaceID}, &goal); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if (goal.Visibility == "private" || goal.Visibility == "selected") && goal.CreatedBy != actorID {
		return nil, ErrNotFound
	}
	if goal.VaultID != "" {
		if _, err := s.requireVault(ctx, workspaceID, actorID, goal.VaultID); err != nil {
			return nil, err
		}
	}
	goal.ApplyDerived(time.Now().UTC())
	if goal.ContactID != "" {
		var contact model.Contact
		if err := s.store.FindOne(ctx, "contacts", repository.Filter{"_id": goal.ContactID, "workspace_id": workspaceID}, &contact); err == nil {
			goal.Contact = &model.ContactSummary{ID: contact.ID, Name: contact.Name, Phone: contact.Phone, Email: contact.Email}
		}
	}
	return &goal, nil
}

func (s *FinanceService) UpdateGoal(ctx context.Context, workspaceID, actorID, goalID string, input GoalInput) (*model.Goal, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageGoals); err != nil {
		return nil, err
	}
	goal, err := s.GetGoal(ctx, workspaceID, actorID, goalID)
	if err != nil {
		return nil, err
	}
	input, err = s.normalizeGoalUpdate(ctx, workspaceID, actorID, input, *goal)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	result, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		var updated model.Goal
		if err := s.store.UpdateOne(transactionCtx, "goals", repository.Filter{"_id": goal.ID, "workspace_id": workspaceID}, repository.Filter{"$set": repository.Filter{
			"vault_id": input.VaultID, "name": input.Name, "target_minor": input.TargetMinor, "current_minor": input.CurrentMinor,
			"description": input.Description, "type": input.Type, "custom_type": input.CustomType, "direction": input.Direction,
			"currency": input.Currency, "start_date": input.StartDate, "target_date": input.TargetDate, "due_date": input.DueDate,
			"visibility": input.Visibility, "contact_id": input.ContactID, "contact_name": input.ContactName,
			"account_id": input.AccountID, "category": input.Category, "reminder": input.Reminder, "notes": input.Notes,
			"updated_at": now,
		}}, &updated); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		if err := s.audit(transactionCtx, workspaceID, actorID, "goal.updated", "goal", goal.ID, nil); err != nil {
			return nil, err
		}
		return &updated, nil
	})
	if err != nil {
		return nil, err
	}
	updated, ok := result.(*model.Goal)
	if !ok {
		return nil, errors.New("unexpected goal update result")
	}
	updated.ApplyDerived(now)
	return updated, nil
}

func (s *FinanceService) normalizeGoalUpdate(ctx context.Context, workspaceID, actorID string, input GoalInput, current model.Goal) (GoalInput, error) {
	input.VaultID = strings.TrimSpace(input.VaultID)
	if input.VaultID == "" {
		input.VaultID = current.VaultID
	}
	if err := validateMoney("targetMinor", input.TargetMinor, false); err != nil {
		return input, err
	}
	if input.CurrentMinor < 0 || input.CurrentMinor > input.TargetMinor {
		return input, &FieldError{Field: "currentMinor", Message: "must be between zero and targetMinor"}
	}
	currency, err := validCurrency(input.Currency)
	if err != nil {
		return input, err
	}
	if input.VaultID != "" {
		vault, err := s.requireVault(ctx, workspaceID, actorID, input.VaultID)
		if err != nil {
			return input, err
		}
		if currency != vault.Currency {
			return input, &FieldError{Field: "currency", Message: "must match the vault currency"}
		}
	}
	name, err := validatedText("name", input.Name, 1, 100)
	if err != nil {
		return input, err
	}
	visibility := valueOrDefault(strings.ToLower(strings.TrimSpace(input.Visibility)), "workspace")
	if visibility != "workspace" && visibility != "private" {
		return input, &FieldError{Field: "visibility", Message: "must be workspace or private"}
	}
	input.Name, input.Currency, input.Visibility = name, currency, visibility
	input, err = s.normalizeGoalFields(ctx, workspaceID, actorID, input, current)
	if err != nil {
		return input, err
	}
	return input, nil
}

func (s *FinanceService) DeleteGoal(ctx context.Context, workspaceID, actorID, goalID string) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageGoals); err != nil {
		return err
	}
	goal, err := s.GetGoal(ctx, workspaceID, actorID, goalID)
	if err != nil {
		return err
	}
	_, err = s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if err := s.store.DeleteOne(transactionCtx, "goals", repository.Filter{"_id": goal.ID, "workspace_id": workspaceID}); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		return nil, s.audit(transactionCtx, workspaceID, actorID, "goal.deleted", "goal", goal.ID, nil)
	})
	return err
}

func (s *FinanceService) ShareGoal(ctx context.Context, workspaceID, actorID, goalID string) (*SharePayload, error) {
	goal, err := s.GetGoal(ctx, workspaceID, actorID, goalID)
	if err != nil {
		return nil, err
	}
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermExportData); err != nil {
		return nil, err
	}
	payload := &SharePayload{
		Title: "Goal summary",
		Text:  fmt.Sprintf("%s goal: %s saved of %s", safeRecordLabel(goal.Name, "Goal"), shareMoney(goal.Currency, goal.CurrentMinor), shareMoney(goal.Currency, goal.TargetMinor)),
	}
	if err := s.audit(ctx, workspaceID, actorID, "goal.shared", "goal", goal.ID, nil); err != nil {
		return nil, err
	}
	return payload, nil
}

func safeRecordLabel(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func shareDate(value time.Time) string {
	if value.IsZero() {
		return "today"
	}
	return value.UTC().Format("2 Jan 2006")
}

func shareMoney(currency string, amountMinor int64) string {
	negative := amountMinor < 0
	var magnitude uint64
	if negative {
		magnitude = uint64(-(amountMinor + 1)) + 1
	} else {
		magnitude = uint64(amountMinor)
	}
	major := magnitude / 100
	minor := magnitude % 100
	digits := fmt.Sprintf("%d", major)
	for index := len(digits) - 3; index > 0; index -= 3 {
		digits = digits[:index] + "," + digits[index:]
	}
	if minor != 0 {
		digits += fmt.Sprintf(".%02d", minor)
	}
	prefix := strings.ToUpper(strings.TrimSpace(currency))
	if prefix == "" {
		prefix = "Amount"
	}
	if negative {
		return "-" + prefix + " " + digits
	}
	return prefix + " " + digits
}
