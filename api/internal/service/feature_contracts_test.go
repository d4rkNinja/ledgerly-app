package service

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

func TestTransactionJSONIncludesCreatorSummaryWithoutUserID(t *testing.T) {
	transaction := model.Transaction{
		ID:        "entry-a",
		CreatedBy: "internal-user-a",
		Creator:   &model.CreatorSummary{Name: "Asha Rao", Initials: "AR", Status: "active"},
	}
	payload, err := json.Marshal(transaction)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(payload), "internal-user-a") {
		t.Fatal("creator user id leaked")
	}
	if !strings.Contains(string(payload), "Asha Rao") {
		t.Fatal("creator name missing")
	}
}

func TestUserJSONIncludesSafeProfileFields(t *testing.T) {
	user := model.User{
		ID:              "user-a",
		Name:            "Asha Rao",
		ProfileImageURL: "https://cdn.example.test/asha.png",
		PhoneNumber:     "+919999999999",
	}
	payload, err := json.Marshal(user)
	if err != nil {
		t.Fatal(err)
	}
	text := string(payload)
	if !strings.Contains(text, `"profileImageUrl":"https://cdn.example.test/asha.png"`) {
		t.Fatalf("profile image URL missing from user JSON: %s", text)
	}
	if !strings.Contains(text, `"phoneNumber":"+919999999999"`) {
		t.Fatalf("phone number missing from user JSON: %s", text)
	}
}

func TestDashboardJSONIncludesEmptyAnalyticsArrays(t *testing.T) {
	dashboard := Dashboard{DashboardAnalytics: emptyDashboardAnalytics()}
	payload, err := json.Marshal(dashboard)
	if err != nil {
		t.Fatal(err)
	}
	text := string(payload)
	for _, field := range []string{"byCategory", "cashflow", "monthlyTrend", "recentActivity", "topCategories"} {
		if !strings.Contains(text, `"`+field+`":[]`) {
			t.Fatalf("dashboard JSON missing empty analytics array %q: %s", field, text)
		}
	}
}

type notificationContractStore struct {
	updateOneFilter  repository.Filter
	updateOneValue   repository.Filter
	updateOneErr     error
	updateManyFilter repository.Filter
	updateManyValue  repository.Filter
	updateManyCount  int64
	updateManyErr    error
	countFilter      repository.Filter
	countValue       int64
	countErr         error
}

type featureWriteStore struct {
	*financeStore
	inTransaction bool
	inserted      []string
}

func (s *featureWriteStore) Insert(_ context.Context, collection string, _ any) error {
	if !s.inTransaction {
		return errors.New("write executed outside transaction")
	}
	s.inserted = append(s.inserted, collection)
	return nil
}

func (s *featureWriteStore) WithTransaction(
	ctx context.Context,
	fn repository.TransactionFunc,
) (any, error) {
	s.txRuns++
	s.inTransaction = true
	defer func() {
		s.inTransaction = false
	}()
	return fn(ctx)
}

func (s *notificationContractStore) Insert(context.Context, string, any) error { return nil }
func (s *notificationContractStore) FindOne(context.Context, string, repository.Filter, any) error {
	return repository.ErrNotFound
}
func (s *notificationContractStore) FindMany(
	context.Context,
	string,
	repository.Filter,
	any,
	int64,
	int64,
	repository.Sort,
) error {
	return nil
}
func (s *notificationContractStore) Aggregate(
	context.Context,
	string,
	repository.Pipeline,
	any,
) error {
	return nil
}
func (s *notificationContractStore) UpdateOne(
	_ context.Context,
	collection string,
	filter repository.Filter,
	update repository.Filter,
	destination any,
) error {
	if collection != "notifications" {
		return errors.New("unexpected collection")
	}
	s.updateOneFilter = filter
	s.updateOneValue = update
	if s.updateOneErr != nil {
		return s.updateOneErr
	}
	set, _ := update["$set"].(repository.Filter)
	readAt, _ := set["read_at"].(time.Time)
	*destination.(*model.Notification) = model.Notification{
		ID:     filter["_id"].(string),
		UserID: filter["user_id"].(string),
		ReadAt: &readAt,
	}
	return nil
}
func (s *notificationContractStore) UpdateMany(
	_ context.Context,
	collection string,
	filter repository.Filter,
	update repository.Filter,
) (int64, error) {
	if collection != "notifications" {
		return 0, errors.New("unexpected collection")
	}
	s.updateManyFilter = filter
	s.updateManyValue = update
	return s.updateManyCount, s.updateManyErr
}
func (s *notificationContractStore) DeleteOne(context.Context, string, repository.Filter) error {
	return nil
}
func (s *notificationContractStore) Count(
	_ context.Context,
	collection string,
	filter repository.Filter,
) (int64, error) {
	if collection != "notifications" {
		return 0, errors.New("unexpected collection")
	}
	s.countFilter = filter
	return s.countValue, s.countErr
}
func (s *notificationContractStore) WithTransaction(
	ctx context.Context,
	fn repository.TransactionFunc,
) (any, error) {
	return fn(ctx)
}
func (s *notificationContractStore) CreateFinancialTransaction(
	context.Context,
	*model.Transaction,
	string,
	*time.Time,
	*model.AuditEvent,
) (*model.Transaction, error) {
	return nil, errors.New("not implemented")
}

func TestSearchStillFindsVaultsWhenWorkspaceHasNoAccessibleAccounts(t *testing.T) {
	finance, store := testFinance()
	store.accounts = map[string]model.Account{}

	result, err := finance.Search(context.Background(), "workspace-a", "user-a", "cash")
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if len(result.Vaults) == 0 {
		t.Fatal("Search() suppressed accessible vault results when no accounts existed")
	}
	vaultFilter := store.filters["vaults"]
	if _, ok := vaultFilter["$text"]; !ok {
		t.Fatalf("vault query = %#v, want indexed text search", vaultFilter)
	}
	if result.Transactions == nil || result.Accounts == nil {
		t.Fatalf("empty search collections must remain JSON arrays: %#v", result)
	}
}

func TestSearchRequiresBothAssetPermissionsBeforeReturningVaultsAndAccounts(t *testing.T) {
	tests := []struct {
		name        string
		permissions []string
	}{
		{
			name: "missing view balances",
			permissions: []string{
				model.PermViewTransactions,
				model.PermViewVault,
			},
		},
		{
			name: "missing view vault",
			permissions: []string{
				model.PermViewTransactions,
				model.PermViewBalances,
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			finance, store := testFinance()
			store.membership.Role = "granular"
			store.membership.Permissions = test.permissions

			result, err := finance.Search(context.Background(), "workspace-a", "user-a", "cash")
			if err != nil {
				t.Fatalf("Search() error = %v", err)
			}
			if result.Vaults == nil || result.Accounts == nil {
				t.Fatalf("asset results must remain JSON arrays: %#v", result)
			}
			if len(result.Vaults) != 0 || len(result.Accounts) != 0 {
				t.Fatalf("balance-bearing asset models leaked without both permissions: %#v", result)
			}
			if _, searched := store.filters["vaults"]["$text"]; searched {
				t.Fatalf("vault text search ran without both asset permissions: %#v", store.filters["vaults"])
			}
			if _, searched := store.filters["accounts"]["$text"]; searched {
				t.Fatalf("account text search ran without both asset permissions: %#v", store.filters["accounts"])
			}
			if _, searched := store.filters["transactions"]["$text"]; !searched {
				t.Fatalf("authorized transaction search was suppressed: %#v", store.filters["transactions"])
			}
		})
	}
}

func TestSearchReturnsAssetMatchesWithBothAssetPermissions(t *testing.T) {
	finance, store := testFinance()

	result, err := finance.Search(context.Background(), "workspace-a", "user-a", "cash")
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if len(result.Vaults) == 0 || len(result.Accounts) == 0 {
		t.Fatalf("authorized asset search results were suppressed: %#v", result)
	}
	if _, searched := store.filters["vaults"]["$text"]; !searched {
		t.Fatalf("vault text search did not run: %#v", store.filters["vaults"])
	}
	if _, searched := store.filters["accounts"]["$text"]; !searched {
		t.Fatalf("account text search did not run: %#v", store.filters["accounts"])
	}
}

func TestFeatureCreationWritesUseAtomicAuditBoundary(t *testing.T) {
	_, baseStore := testFinance()
	store := &featureWriteStore{financeStore: baseStore}
	finance := NewFinanceService(store, NewAccessService(store))
	store.membership.Role = "finance_manager"
	store.membership.Permissions = nil

	startAt := time.Now().UTC().Add(-time.Hour)
	endAt := startAt.Add(30 * 24 * time.Hour)
	operations := []struct {
		name       string
		collection string
		run        func() error
	}{
		{
			name:       "vault",
			collection: "vaults",
			run: func() error {
				_, err := finance.CreateVault(context.Background(), "workspace-a", "user-a", VaultInput{
					Name: "Household", Currency: "INR",
				})
				return err
			},
		},
		{
			name:       "account",
			collection: "accounts",
			run: func() error {
				_, err := finance.CreateAccount(context.Background(), "workspace-a", "user-a", AccountInput{
					VaultID: "vault-a", Name: "Cash", Currency: "INR",
				})
				return err
			},
		},
		{
			name:       "budget",
			collection: "budgets",
			run: func() error {
				_, err := finance.CreateBudget(context.Background(), "workspace-a", "user-a", BudgetInput{
					VaultID: "vault-a", Name: "Groceries", AmountMinor: 25_000,
					Currency: "INR", StartAt: startAt, EndAt: endAt,
				})
				return err
			},
		},
		{
			name:       "goal",
			collection: "goals",
			run: func() error {
				_, err := finance.CreateGoal(context.Background(), "workspace-a", "user-a", GoalInput{
					VaultID: "vault-a", Name: "Emergency fund", TargetMinor: 100_000,
					Currency: "INR",
				})
				return err
			},
		},
		{
			name:       "claim",
			collection: "expense_claims",
			run: func() error {
				_, err := finance.SubmitClaim(context.Background(), "workspace-a", "user-a", ClaimInput{
					VaultID: "vault-a", AmountMinor: 1_500, Currency: "INR",
					Description: "Team lunch",
				})
				return err
			},
		},
	}

	for index, operation := range operations {
		t.Run(operation.name, func(t *testing.T) {
			if err := operation.run(); err != nil {
				t.Fatalf("%s creation error = %v", operation.name, err)
			}
			if want := index + 1; store.txRuns != want {
				t.Fatalf("transaction runs = %d, want %d", store.txRuns, want)
			}
			offset := index * 2
			wantInserts := []string{operation.collection, "audit_events"}
			if got := store.inserted[offset:]; !reflect.DeepEqual(got, wantInserts) {
				t.Fatalf("transaction inserts = %#v, want %#v", got, wantInserts)
			}
		})
	}
}

func TestCreateGoalReportsInvalidProgressOnCurrentMinor(t *testing.T) {
	tests := []struct {
		name         string
		currentMinor int64
	}{
		{name: "negative", currentMinor: -1},
		{name: "above target", currentMinor: 100_001},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			finance, store := testFinance()
			store.membership.Role = "finance_manager"
			store.membership.Permissions = nil

			_, err := finance.CreateGoal(context.Background(), "workspace-a", "user-a", GoalInput{
				Name: "Emergency fund", TargetMinor: 100_000,
				CurrentMinor: test.currentMinor, Currency: "INR",
			})
			var fieldErr *FieldError
			if !errors.As(err, &fieldErr) || fieldErr.Field != "currentMinor" {
				t.Fatalf("CreateGoal() error = %v, want currentMinor validation", err)
			}
			if store.txRuns != 0 {
				t.Fatalf("invalid goal started %d transaction(s)", store.txRuns)
			}
		})
	}
}

func TestExplicitUnknownVaultRelationshipsStillFailValidation(t *testing.T) {
	finance, store := testFinance()

	_, accountErr := finance.CreateAccount(
		context.Background(),
		"workspace-a",
		"user-a",
		AccountInput{Name: "Cash", Currency: "INR", VaultID: "missing-vault"},
	)
	if !errors.Is(accountErr, ErrNotFound) {
		t.Fatalf("CreateAccount() error = %v, want missing vault failure", accountErr)
	}

	_, claimErr := finance.SubmitClaim(
		context.Background(),
		"workspace-a",
		"user-a",
		ClaimInput{VaultID: "missing-vault", AmountMinor: 1_500, Currency: "INR", Description: "Team lunch"},
	)
	if !errors.Is(claimErr, ErrNotFound) {
		t.Fatalf("SubmitClaim() error = %v, want missing vault failure", claimErr)
	}
	if store.txRuns != 0 {
		t.Fatalf("invalid relationship inputs started %d transaction(s)", store.txRuns)
	}
}

func TestAccountAndClaimCreationResolveTheWorkspaceVaultInternally(t *testing.T) {
	finance, _ := testFinance()

	account, err := finance.CreateAccount(
		context.Background(),
		"workspace-a",
		"user-a",
		AccountInput{Name: "Cash", Currency: "INR", Type: "cash"},
	)
	if err != nil {
		t.Fatalf("CreateAccount() without vaultId: %v", err)
	}
	if account.VaultID != "vault-a" {
		t.Fatalf("CreateAccount() vaultId = %q, want internal workspace vault", account.VaultID)
	}

	claim, err := finance.SubmitClaim(
		context.Background(),
		"workspace-a",
		"user-a",
		ClaimInput{AmountMinor: 1_500, Currency: "INR", Description: "Team lunch"},
	)
	if err != nil {
		t.Fatalf("SubmitClaim() without vaultId: %v", err)
	}
	if claim.VaultID != "vault-a" {
		t.Fatalf("SubmitClaim() vaultId = %q, want internal workspace vault", claim.VaultID)
	}
}

func TestTransactionCreationDerivesVaultFromTheSelectedAccount(t *testing.T) {
	finance, store := testFinance()

	transaction, err := finance.CreateTransaction(
		context.Background(),
		"workspace-a",
		"user-a",
		"request-1234",
		TransactionInput{
			AccountID:   "account-a",
			Type:        "expense",
			AmountMinor: 1_299,
			Currency:    "INR",
		},
	)
	if err != nil {
		t.Fatalf("CreateTransaction() without vaultId: %v", err)
	}
	if transaction.VaultID != "vault-a" || store.created.VaultID != "vault-a" {
		t.Fatalf("CreateTransaction() vaultId = %q, want account vault", transaction.VaultID)
	}
}

func TestFeatureListQueriesRemainTenantAndVisibilityScoped(t *testing.T) {
	finance, store := testFinance()

	if _, err := finance.ListVaults(context.Background(), "workspace-a", "user-a"); err != nil {
		t.Fatalf("ListVaults() error = %v", err)
	}
	vaultFilter := store.filters["vaults"]
	if vaultFilter["workspace_id"] != "workspace-a" || vaultFilter["archived"] != false {
		t.Fatalf("vault filter = %#v, want active tenant scope", vaultFilter)
	}
	if _, ok := vaultFilter["$or"]; !ok {
		t.Fatalf("vault filter = %#v, want privacy scope", vaultFilter)
	}

	if _, err := finance.ListAccounts(context.Background(), "workspace-a", "user-a"); err != nil {
		t.Fatalf("ListAccounts() error = %v", err)
	}
	accountFilter := store.filters["accounts"]
	if accountFilter["workspace_id"] != "workspace-a" || accountFilter["archived"] != false {
		t.Fatalf("account filter = %#v, want active tenant scope", accountFilter)
	}
	if _, ok := accountFilter["vault_id"]; !ok {
		t.Fatalf("account filter = %#v, want accessible vault scope", accountFilter)
	}
	if _, ok := accountFilter["$or"]; !ok {
		t.Fatalf("account filter = %#v, want account privacy scope", accountFilter)
	}

	var budgets []model.Budget
	if err := finance.ListCollectionPage(
		context.Background(),
		"workspace-a",
		"user-a",
		"budgets",
		model.PermViewTransactions,
		&budgets,
		30,
		0,
	); err != nil {
		t.Fatalf("ListCollectionPage(budgets) error = %v", err)
	}
	budgetFilter := store.filters["budgets"]
	if budgetFilter["workspace_id"] != "workspace-a" {
		t.Fatalf("budget filter = %#v, want tenant scope", budgetFilter)
	}
	if _, ok := budgetFilter["$or"]; !ok {
		t.Fatalf("budget filter = %#v, want accessible or vaultless scope", budgetFilter)
	}
}

func TestReviewClaimUsesAtomicUpdateBoundary(t *testing.T) {
	store := &authorizationRegressionStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a", UserID: "approver", Role: "approver",
		},
		claim: model.ExpenseClaim{
			ID: "claim-a", WorkspaceID: "workspace-a", VaultID: "vault-a",
			SubmittedBy: "submitter", Status: "pending",
		},
		vault: model.Vault{
			ID: "vault-a", WorkspaceID: "workspace-a", Privacy: "workspace",
		},
		findErrors: map[string]error{},
	}

	if _, err := newAuthorizationRegressionService(store).ReviewClaim(
		context.Background(),
		"workspace-a",
		"approver",
		"claim-a",
		"approved",
		"Reviewed",
	); err != nil {
		t.Fatalf("ReviewClaim() error = %v", err)
	}
	if store.txRuns != 1 || store.updateCalls != 1 {
		t.Fatalf("transaction runs = %d, update calls = %d; want 1 each", store.txRuns, store.updateCalls)
	}
}

func TestUnreadNotificationCountScopesQueryToAuthenticatedOwner(t *testing.T) {
	store := &notificationContractStore{countValue: 5}
	finance := NewFinanceService(store, nil)

	result, err := finance.UnreadNotificationCount(context.Background(), "user-a")
	if err != nil {
		t.Fatalf("UnreadNotificationCount() error = %v", err)
	}
	wantFilter := repository.Filter{"user_id": "user-a", "read_at": nil}
	if !reflect.DeepEqual(store.countFilter, wantFilter) {
		t.Fatalf("notification filter = %#v, want %#v", store.countFilter, wantFilter)
	}
	if result.UnreadCount != 5 {
		t.Fatalf("unread count = %d, want 5", result.UnreadCount)
	}
}

func TestMarkNotificationReadScopesMutationToAuthenticatedOwner(t *testing.T) {
	store := &notificationContractStore{}
	finance := NewFinanceService(store, nil)

	notification, err := finance.MarkNotificationRead(
		context.Background(),
		"user-a",
		" notification-a ",
	)
	if err != nil {
		t.Fatalf("MarkNotificationRead() error = %v", err)
	}
	wantFilter := repository.Filter{"_id": "notification-a", "user_id": "user-a"}
	if !reflect.DeepEqual(store.updateOneFilter, wantFilter) {
		t.Fatalf("notification filter = %#v, want %#v", store.updateOneFilter, wantFilter)
	}
	if notification.ID != "notification-a" || notification.UserID != "user-a" || notification.ReadAt == nil {
		t.Fatalf("updated notification = %#v", notification)
	}
	set, ok := store.updateOneValue["$set"].(repository.Filter)
	if !ok {
		t.Fatalf("notification update = %#v, want $set", store.updateOneValue)
	}
	if readAt, ok := set["read_at"].(time.Time); !ok || readAt.IsZero() {
		t.Fatalf("notification read_at = %#v, want UTC timestamp", set["read_at"])
	}
}

func TestMarkNotificationReadDoesNotRevealAnotherUsersRecord(t *testing.T) {
	store := &notificationContractStore{updateOneErr: repository.ErrNotFound}
	finance := NewFinanceService(store, nil)

	_, err := finance.MarkNotificationRead(context.Background(), "user-a", "notification-b")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("MarkNotificationRead() error = %v, want not found", err)
	}
	if store.updateOneFilter["user_id"] != "user-a" {
		t.Fatalf("notification filter = %#v, want authenticated user scope", store.updateOneFilter)
	}
}

func TestMarkAllNotificationsReadScopesUnreadMutationToAuthenticatedOwner(t *testing.T) {
	store := &notificationContractStore{updateManyCount: 3}
	finance := NewFinanceService(store, nil)

	result, err := finance.MarkAllNotificationsRead(context.Background(), "user-a")
	if err != nil {
		t.Fatalf("MarkAllNotificationsRead() error = %v", err)
	}
	wantFilter := repository.Filter{"user_id": "user-a", "read_at": nil}
	if !reflect.DeepEqual(store.updateManyFilter, wantFilter) {
		t.Fatalf("notification filter = %#v, want %#v", store.updateManyFilter, wantFilter)
	}
	if result.UpdatedCount != 3 || result.ReadAt.IsZero() {
		t.Fatalf("mark-all result = %#v", result)
	}
	set, ok := store.updateManyValue["$set"].(repository.Filter)
	if !ok || set["read_at"] != result.ReadAt {
		t.Fatalf("notification update = %#v, want result readAt %s", store.updateManyValue, result.ReadAt)
	}
}
