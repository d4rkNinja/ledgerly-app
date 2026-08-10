package service

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type TransactionInput struct {
	VaultID                   string        `json:"vaultId"`
	AccountID                 string        `json:"accountId"`
	DestinationAccountID      string        `json:"destinationAccountId"`
	TransactionID             string        `json:"transactionId"`
	AutoGenerateTransactionID *bool         `json:"autoGenerateTransactionId"`
	Type                      string        `json:"type"`
	AmountMinor               int64         `json:"amountMinor"`
	Currency                  string        `json:"currency"`
	Category                  string        `json:"category"`
	Merchant                  string        `json:"merchant"`
	Notes                     string        `json:"notes"`
	Description               string        `json:"description"`
	ContactID                 string        `json:"contactId"`
	GoalID                    string        `json:"goalId"`
	Tags                      []string      `json:"tags"`
	Splits                    []model.Split `json:"splits"`
	Privacy                   string        `json:"privacy"`
	OccurredAt                time.Time     `json:"occurredAt"`
}

func (s *FinanceService) CreateTransaction(ctx context.Context, workspaceID, actorID, idempotencyKey string, input TransactionInput) (*model.Transaction, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermCreateTransactions); err != nil {
		return nil, err
	}
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	if len(idempotencyKey) < 8 || len(idempotencyKey) > 128 {
		return nil, &FieldError{Field: "Idempotency-Key", Message: "header must contain 8 to 128 characters"}
	}
	requestedKind := strings.ToLower(strings.TrimSpace(input.Type))
	switch requestedKind {
	case "expense", "income", "transfer", "split", "refund", "reimbursement", "adjustment":
	default:
		return nil, &FieldError{Field: "type", Message: "is not supported"}
	}
	if requestedKind == model.TransactionSequenceSplit && len(input.Splits) == 0 {
		return nil, &FieldError{Field: "splits", Message: "must contain at least one workspace member for a split transaction"}
	}
	kind := requestedKind
	if kind == model.TransactionSequenceSplit {
		kind = model.TransactionSequenceExpense
	}
	transactionID, autoGenerateTransactionID, err := transactionIdentifierForCreate(input)
	if err != nil {
		return nil, err
	}
	if err := validateMoney("amountMinor", input.AmountMinor, false); err != nil {
		return nil, err
	}
	account, err := s.requireAccount(ctx, workspaceID, actorID, input.AccountID)
	if err != nil {
		return nil, err
	}
	if accountIsInactive(account) {
		return nil, &FieldError{Field: "accountId", Message: "must reference an active account"}
	}
	input.VaultID = strings.TrimSpace(input.VaultID)
	if input.VaultID == "" {
		input.VaultID = account.VaultID
	}
	currency, err := validCurrency(input.Currency)
	if err != nil {
		return nil, err
	}
	if account.Currency != currency || account.VaultID != input.VaultID {
		return nil, &FieldError{Field: "accountId", Message: "does not belong to the selected vault and currency"}
	}
	var destination *model.Account
	if kind == "transfer" {
		if input.DestinationAccountID == "" || input.DestinationAccountID == input.AccountID {
			return nil, &FieldError{Field: "destinationAccountId", Message: "must identify a different account"}
		}
		destination, err = s.requireAccount(ctx, workspaceID, actorID, input.DestinationAccountID)
		if err != nil {
			return nil, err
		}
		if accountIsInactive(destination) {
			return nil, &FieldError{Field: "destinationAccountId", Message: "must reference an active account"}
		}
		if destination.Currency != currency {
			return nil, &FieldError{Field: "destinationAccountId", Message: "must use the same currency"}
		}
	}
	if err := s.validateSplits(ctx, workspaceID, input.Splits, input.AmountMinor); err != nil {
		return nil, err
	}
	var requestOccurredAt *time.Time
	occurredAt := input.OccurredAt.UTC()
	if input.OccurredAt.IsZero() {
		occurredAt = time.Now().UTC()
	} else {
		requestOccurredAt = &occurredAt
	}
	now := time.Now().UTC()
	privacy, err := validPrivacy(input.Privacy, "workspace")
	if err != nil {
		return nil, err
	}
	if account.Privacy != "workspace" || (destination != nil && destination.Privacy != "workspace") {
		privacy = "private"
	}
	category, err := validatedText("category", input.Category, 0, 100)
	if err != nil {
		return nil, err
	}
	category, err = s.validateTransactionCategory(ctx, workspaceID, kind, category, input.Splits, nil)
	if err != nil {
		return nil, err
	}
	merchant, err := validatedText("merchant", input.Merchant, 0, 200)
	if err != nil {
		return nil, err
	}
	notes, err := validatedText("notes", input.Notes, 0, 2000)
	if err != nil {
		return nil, err
	}
	description, err := validatedText("description", input.Description, 0, 2000)
	if err != nil {
		return nil, err
	}
	contactID, err := s.validContactID(ctx, workspaceID, input.ContactID)
	if err != nil {
		return nil, err
	}
	goalID := strings.TrimSpace(input.GoalID)
	if goalID != "" {
		var goal model.Goal
		if err := s.store.FindOne(ctx, "goals", repository.Filter{"_id": goalID, "workspace_id": workspaceID}, &goal); err != nil {
			return nil, &FieldError{Field: "goalId", Message: "must reference a goal in this workspace"}
		}
		if goal.VaultID != "" && goal.VaultID != input.VaultID {
			return nil, &FieldError{Field: "goalId", Message: "must reference a goal in the selected vault"}
		}
	}
	tx := &model.Transaction{
		ID: newID(), WorkspaceID: workspaceID, TransactionID: transactionID,
		SequenceScope:             model.TransactionSequenceScope(kind, len(input.Splits) > 0),
		AutoGenerateTransactionID: autoGenerateTransactionID, VaultID: input.VaultID,
		AccountID: input.AccountID, DestinationAccountID: input.DestinationAccountID,
		CreatedBy: actorID, Type: kind, AmountMinor: input.AmountMinor, Currency: currency,
		Category: category, Merchant: merchant,
		Notes: notes, Description: description, ContactID: contactID, GoalID: goalID, Tags: normalizedTags(input.Tags), Splits: input.Splits,
		Privacy:    privacy,
		OccurredAt: occurredAt, CreatedAt: now, UpdatedAt: now,
	}
	audit := newAuditEvent(
		workspaceID,
		actorID,
		"transaction.created",
		"transaction",
		tx.ID,
		map[string]any{"type": tx.Type},
	)
	created, err := s.store.CreateFinancialTransaction(ctx, tx, idempotencyKey, requestOccurredAt, audit)
	if err != nil {
		return nil, transactionIdentifierError(err, "transactionId")
	}
	return created, nil
}

type TransactionFilter struct {
	VaultID        string
	AccountID      string
	ContactID      string
	TransactionID  string
	Type           string
	Category       string
	Merchant       string
	Search         string
	MinAmountMinor *int64
	MaxAmountMinor *int64
	From           *time.Time
	To             *time.Time
	Limit          int64
	Skip           int64
}

func (s *FinanceService) ListTransactions(ctx context.Context, workspaceID, actorID string, input TransactionFilter) ([]model.Transaction, error) {
	filter, empty, err := s.transactionQuery(ctx, workspaceID, actorID, input)
	if err != nil {
		return nil, err
	}
	if empty {
		return []model.Transaction{}, nil
	}
	limit := input.Limit
	if limit <= 0 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	var transactions []model.Transaction
	if err := s.store.FindMany(ctx, "transactions", filter, &transactions, limit, max(input.Skip, 0), repository.Sort{"occurred_at": -1}); err != nil {
		return nil, err
	}
	if err := s.hydrateTransactionCreators(ctx, actorID, transactions); err != nil {
		return nil, err
	}
	if err := s.hydrateTransactionContacts(ctx, transactions); err != nil {
		return nil, err
	}
	return transactions, nil
}

func (s *FinanceService) hydrateTransactionCreators(ctx context.Context, actorID string, transactions []model.Transaction) error {
	ids := make([]string, 0, len(transactions))
	seen := make(map[string]struct{}, len(transactions))
	for _, transaction := range transactions {
		if transaction.CreatedBy == "" {
			continue
		}
		if _, exists := seen[transaction.CreatedBy]; exists {
			continue
		}
		seen[transaction.CreatedBy] = struct{}{}
		ids = append(ids, transaction.CreatedBy)
	}
	if len(ids) == 0 {
		return nil
	}

	var users []model.User
	if err := s.store.FindMany(
		ctx,
		"users",
		repository.Filter{"_id": repository.Filter{"$in": ids}},
		&users,
		int64(len(ids)),
		0,
		nil,
	); err != nil {
		return err
	}
	usersByID := make(map[string]model.User, len(users))
	for _, user := range users {
		usersByID[user.ID] = user
	}
	for i := range transactions {
		creatorID := transactions[i].CreatedBy
		if creatorID == "" {
			continue
		}
		if user, ok := usersByID[creatorID]; ok {
			transactions[i].Creator = &model.CreatorSummary{
				Name:            valueOrDefault(strings.TrimSpace(user.Name), "Workspace member"),
				Initials:        initialsForName(user.Name),
				ProfileImageURL: user.ProfileImageURL,
				Status:          "active",
				IsCurrentUser:   creatorID == actorID,
			}
			continue
		}
		transactions[i].Creator = &model.CreatorSummary{
			Name:          "Former member",
			Initials:      "FM",
			Status:        "former",
			IsCurrentUser: false,
		}
	}
	return nil
}

func initialsForName(name string) string {
	parts := strings.Fields(name)
	initials := make([]rune, 0, 2)
	for _, part := range parts {
		for _, char := range part {
			initials = append(initials, []rune(strings.ToUpper(string(char)))...)
			break
		}
		if len(initials) == 2 {
			break
		}
	}
	if len(initials) == 0 {
		return "WM"
	}
	return string(initials)
}

func (s *FinanceService) transactionQuery(ctx context.Context, workspaceID, actorID string, input TransactionFilter) (repository.Filter, bool, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, false, err
	}
	vaultIDs, err := s.accessibleVaultIDsUnchecked(ctx, workspaceID, actorID)
	if err != nil {
		return nil, false, err
	}
	if len(vaultIDs) == 0 {
		return nil, true, nil
	}
	if input.VaultID != "" && !contains(vaultIDs, input.VaultID) {
		return nil, false, ErrForbidden
	}
	accountIDs, err := s.accessibleAccountIDs(ctx, workspaceID, actorID, vaultIDs)
	if err != nil {
		return nil, false, err
	}
	return transactionQueryForScope(workspaceID, actorID, input, vaultIDs, accountIDs)
}

func transactionQueryForScope(
	workspaceID, actorID string,
	input TransactionFilter,
	vaultIDs, accountIDs []string,
) (repository.Filter, bool, error) {
	dateRange, err := normalizeDateRange(DateRange{From: input.From, To: input.To})
	if err != nil {
		return nil, false, err
	}
	if len(vaultIDs) == 0 {
		return nil, true, nil
	}
	if input.VaultID != "" && !contains(vaultIDs, input.VaultID) {
		return nil, false, ErrForbidden
	}
	if len(accountIDs) == 0 {
		return nil, true, nil
	}
	filter := repository.Filter{
		"workspace_id": workspaceID,
		"vault_id":     repository.Filter{"$in": vaultIDs},
		"account_id":   repository.Filter{"$in": accountIDs},
		"$or":          []repository.Filter{{"privacy": "workspace"}, {"created_by": actorID}},
	}
	if input.VaultID != "" {
		filter["vault_id"] = input.VaultID
	}
	if input.AccountID != "" {
		if !contains(accountIDs, input.AccountID) {
			return nil, false, ErrForbidden
		}
		filter["account_id"] = input.AccountID
	}
	if input.ContactID != "" {
		filter["contact_id"] = strings.TrimSpace(input.ContactID)
	}
	if input.TransactionID != "" {
		transactionID := strings.TrimSpace(input.TransactionID)
		if _, err := model.ParseTransactionSequenceNumber(transactionID); err != nil {
			return nil, false, &FieldError{Field: "transactionId", Message: err.Error()}
		}
		filter["transaction_id"] = transactionID
	}
	if input.Type != "" {
		switch strings.ToLower(strings.TrimSpace(input.Type)) {
		case model.TransactionSequenceSplit:
			filter["splits.0"] = repository.Filter{"$exists": true}
		case model.TransactionSequenceExpense:
			filter["type"] = repository.Filter{"$in": []string{"expense", "adjustment"}}
			filter["splits.0"] = repository.Filter{"$exists": false}
		case model.TransactionSequenceIncome:
			filter["type"] = repository.Filter{"$in": []string{"income", "refund", "reimbursement"}}
			filter["splits.0"] = repository.Filter{"$exists": false}
		case model.TransactionSequenceTransfer:
			filter["type"] = "transfer"
			filter["splits.0"] = repository.Filter{"$exists": false}
		default:
			filter["type"] = strings.ToLower(strings.TrimSpace(input.Type))
		}
	}
	if input.Category != "" {
		filter["category"] = strings.TrimSpace(input.Category)
	}
	if input.Merchant != "" {
		filter["merchant"] = strings.TrimSpace(input.Merchant)
	}
	if search := strings.TrimSpace(input.Search); search != "" {
		if len([]rune(search)) > 100 {
			return nil, false, &FieldError{Field: "search", Message: "must contain at most 100 characters"}
		}
		pattern := regexp.QuoteMeta(search)
		visibility := filter["$or"]
		delete(filter, "$or")
		filter["$and"] = []repository.Filter{
			{"$or": visibility},
			{"$or": []repository.Filter{
				{"transaction_id": repository.Filter{"$regex": "^" + pattern}},
				{"merchant": repository.Filter{"$regex": pattern, "$options": "i"}},
				{"category": repository.Filter{"$regex": pattern, "$options": "i"}},
				{"description": repository.Filter{"$regex": pattern, "$options": "i"}},
				{"notes": repository.Filter{"$regex": pattern, "$options": "i"}},
			}},
		}
	}
	if input.MinAmountMinor != nil || input.MaxAmountMinor != nil {
		amount := repository.Filter{}
		if input.MinAmountMinor != nil {
			if *input.MinAmountMinor < 0 || *input.MinAmountMinor > maxMoneyMinor {
				return nil, false, &FieldError{Field: "minAmountMinor", Message: "must be between 0 and the supported maximum"}
			}
			amount["$gte"] = *input.MinAmountMinor
		}
		if input.MaxAmountMinor != nil {
			if *input.MaxAmountMinor < 0 || *input.MaxAmountMinor > maxMoneyMinor {
				return nil, false, &FieldError{Field: "maxAmountMinor", Message: "must be between 0 and the supported maximum"}
			}
			amount["$lte"] = *input.MaxAmountMinor
		}
		if input.MinAmountMinor != nil && input.MaxAmountMinor != nil && *input.MinAmountMinor > *input.MaxAmountMinor {
			return nil, false, &FieldError{Field: "amount", Message: "minimum amount must not exceed maximum amount"}
		}
		filter["amount_minor"] = amount
	}
	addTransactionDateClause(filter, dateRange)
	return filter, false, nil
}

func (s *FinanceService) validateSplits(ctx context.Context, workspaceID string, splits []model.Split, amountMinor int64) error {
	if len(splits) == 0 {
		return nil
	}
	if len(splits) > 100 {
		return &FieldError{Field: "splits", Message: "must contain at most 100 members"}
	}
	emails := make([]string, 0, len(splits))
	for index := range splits {
		splits[index].UserID = strings.TrimSpace(splits[index].UserID)
		if splits[index].UserID != "" {
			continue
		}
		email := strings.ToLower(strings.TrimSpace(splits[index].MemberEmail))
		if email == "" {
			return &FieldError{Field: "splits", Message: "must contain members with positive amounts"}
		}
		emails = append(emails, email)
		splits[index].MemberEmail = email
	}
	if len(emails) > 0 {
		var users []model.User
		if err := s.store.FindMany(ctx, "users", repository.Filter{
			"email": repository.Filter{"$in": emails},
		}, &users, int64(len(emails)), 0, nil); err != nil {
			return err
		}
		usersByEmail := make(map[string]string, len(users))
		for _, user := range users {
			if email := strings.ToLower(strings.TrimSpace(user.Email)); email != "" {
				usersByEmail[email] = user.ID
			}
		}
		for index := range splits {
			if splits[index].UserID != "" {
				continue
			}
			userID := usersByEmail[splits[index].MemberEmail]
			if userID == "" {
				return &FieldError{Field: "splits", Message: "must reference active workspace members"}
			}
			splits[index].UserID = userID
			splits[index].MemberEmail = ""
		}
	}

	total := int64(0)
	userIDs := make([]string, 0, len(splits))
	seen := make(map[string]struct{}, len(splits))
	for _, split := range splits {
		if split.UserID == "" || split.AmountMinor <= 0 {
			return &FieldError{Field: "splits", Message: "must contain members with positive amounts"}
		}
		if _, exists := seen[split.UserID]; exists {
			return &FieldError{Field: "splits", Message: "must contain unique members with positive amounts"}
		}
		seen[split.UserID] = struct{}{}
		userIDs = append(userIDs, split.UserID)
		var err error
		total, err = checkedAddMoney(total, split.AmountMinor)
		if err != nil || total > maxMoneyMinor {
			return &FieldError{Field: "splits", Message: "total exceeds the supported maximum"}
		}
	}
	if total != amountMinor {
		return &FieldError{Field: "splits", Message: "amounts must sum to amountMinor"}
	}
	var memberships []model.Membership
	if err := s.store.FindMany(ctx, "memberships", repository.Filter{
		"workspace_id": workspaceID,
		"user_id":      repository.Filter{"$in": userIDs},
	}, &memberships, int64(len(userIDs)), 0, nil); err != nil {
		return err
	}
	found := make(map[string]struct{}, len(memberships))
	for _, membership := range memberships {
		found[membership.UserID] = struct{}{}
	}
	for _, userID := range userIDs {
		if _, ok := found[userID]; !ok {
			return &FieldError{Field: "splits", Message: "must reference workspace members"}
		}
	}
	return nil
}
