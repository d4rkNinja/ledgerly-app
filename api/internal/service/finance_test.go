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

type financeStore struct {
	workspace         model.Workspace
	membership        model.Membership
	members           map[string]model.Membership
	users             map[string]model.User
	vaults            map[string]model.Vault
	accounts          map[string]model.Account
	transactions      []model.Transaction
	created           *model.Transaction
	createdAudit      *model.AuditEvent
	createdInvitation *model.Invitation
	createdWorkspace  *model.Workspace
	requestTime       *time.Time
	filters           map[string]repository.Filter
	counts            map[string]repository.Filter
	pipelines         map[string]repository.Pipeline
	updateFilter      repository.Filter
	updateValue       repository.Filter
	typeTotals        []transactionTypeTotal
	catTotals         []transactionCategoryTotal
	txRuns            int
}

func (s *financeStore) Insert(_ context.Context, collection string, document any) error {
	switch collection {
	case "invitations":
		s.createdInvitation = document.(*model.Invitation)
	case "workspaces":
		s.createdWorkspace = document.(*model.Workspace)
	}
	return nil
}
func (s *financeStore) Count(_ context.Context, collection string, filter repository.Filter) (int64, error) {
	s.counts[collection] = filter
	return 0, nil
}
func (s *financeStore) DeleteOne(context.Context, string, repository.Filter) error {
	return nil
}
func (s *financeStore) UpdateOne(context.Context, string, repository.Filter, repository.Filter, any) error {
	return repository.ErrNotFound
}
func (s *financeStore) FindMany(_ context.Context, collection string, filter repository.Filter, destination any, _, _ int64, _ repository.Sort) error {
	s.filters[collection] = filter
	if collection == "vaults" {
		out := destination.(*[]model.Vault)
		for _, vault := range s.vaults {
			*out = append(*out, vault)
		}
		return nil
	}
	if collection == "accounts" {
		out := destination.(*[]model.Account)
		for _, account := range s.accounts {
			*out = append(*out, account)
		}
		return nil
	}
	if collection == "memberships" {
		out := destination.(*[]model.Membership)
		for _, membership := range s.members {
			*out = append(*out, membership)
		}
		return nil
	}
	if collection == "transactions" {
		out := destination.(*[]model.Transaction)
		*out = append(*out, s.transactions...)
		return nil
	}
	if collection == "users" {
		out := destination.(*[]model.User)
		ids := stringSetFromFilter(filter["_id"])
		for id, user := range s.users {
			if len(ids) == 0 || ids[id] {
				*out = append(*out, user)
			}
		}
		return nil
	}
	return nil
}
func (s *financeStore) Aggregate(_ context.Context, collection string, pipeline repository.Pipeline, destination any) error {
	s.pipelines[collection] = pipeline
	switch output := destination.(type) {
	case *[]transactionTypeTotal:
		*output = append(*output, s.typeTotals...)
	case *[]transactionCategoryTotal:
		*output = append(*output, s.catTotals...)
	}
	return nil
}
func (s *financeStore) FindOne(_ context.Context, collection string, filter repository.Filter, destination any) error {
	switch collection {
	case "workspaces":
		if filter["_id"] != s.workspace.ID {
			return repository.ErrNotFound
		}
		*destination.(*model.Workspace) = s.workspace
		return nil
	case "memberships":
		if filter["workspace_id"] != s.membership.WorkspaceID || filter["user_id"] != s.membership.UserID {
			return repository.ErrNotFound
		}
		*destination.(*model.Membership) = s.membership
		return nil
	case "vaults":
		vault, ok := s.vaults[filter["_id"].(string)]
		if !ok || vault.WorkspaceID != filter["workspace_id"] {
			return repository.ErrNotFound
		}
		*destination.(*model.Vault) = vault
		return nil
	case "accounts":
		account, ok := s.accounts[filter["_id"].(string)]
		if !ok || account.WorkspaceID != filter["workspace_id"] {
			return repository.ErrNotFound
		}
		*destination.(*model.Account) = account
		return nil
	default:
		return repository.ErrNotFound
	}
}
func (s *financeStore) UpdateMany(_ context.Context, collection string, filter, update repository.Filter) (int64, error) {
	if collection == "invitations" {
		s.updateFilter = filter
		s.updateValue = update
	}
	return 0, nil
}
func (s *financeStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	s.txRuns++
	return fn(ctx)
}
func (s *financeStore) CreateFinancialTransaction(_ context.Context, tx *model.Transaction, key string, requestOccurredAt *time.Time, audit *model.AuditEvent) (*model.Transaction, error) {
	if key == "" {
		return nil, errors.New("missing key")
	}
	s.created = tx
	s.createdAudit = audit
	s.requestTime = requestOccurredAt
	return tx, nil
}

func testFinance() (*FinanceService, *financeStore) {
	store := &financeStore{
		workspace: model.Workspace{
			ID:             "workspace-a",
			Currency:       "INR",
			FinancialMonth: 1,
		},
		membership: model.Membership{
			WorkspaceID: "workspace-a", UserID: "user-a", Role: "member",
			Permissions: []string{model.PermEditVault},
		},
		members: map[string]model.Membership{
			"user-a": {WorkspaceID: "workspace-a", UserID: "user-a", Role: "member"},
			"user-b": {WorkspaceID: "workspace-a", UserID: "user-b", Role: "member"},
		},
		users: map[string]model.User{
			"user-a": {ID: "user-a", Name: "Asha Rao", Email: "asha@example.test"},
			"user-b": {ID: "user-b", Name: "Ben Ortiz", Email: "ben@example.test", ProfileImageURL: "https://cdn.example.test/ben.png"},
		},
		vaults: map[string]model.Vault{
			"vault-a":        {ID: "vault-a", WorkspaceID: "workspace-a", OwnerID: "user-a", Currency: "INR", Privacy: "workspace"},
			"private-other":  {ID: "private-other", WorkspaceID: "workspace-a", OwnerID: "user-b", Currency: "INR", Privacy: "private"},
			"selected-other": {ID: "selected-other", WorkspaceID: "workspace-a", OwnerID: "user-b", Currency: "INR", Privacy: "selected"},
		},
		accounts: map[string]model.Account{
			"account-a":     {ID: "account-a", WorkspaceID: "workspace-a", VaultID: "vault-a", OwnerID: "user-a", Currency: "INR", Privacy: "workspace"},
			"account-b":     {ID: "account-b", WorkspaceID: "workspace-a", VaultID: "vault-a", OwnerID: "user-a", Currency: "INR", Privacy: "workspace"},
			"private-other": {ID: "private-other", WorkspaceID: "workspace-a", VaultID: "vault-a", OwnerID: "user-b", Currency: "INR", Privacy: "private"},
		},
		filters:   map[string]repository.Filter{},
		counts:    map[string]repository.Filter{},
		pipelines: map[string]repository.Pipeline{},
	}
	access := NewAccessService(store)
	return NewFinanceService(store, access), store
}

func stringSetFromFilter(value any) map[string]bool {
	filter, ok := value.(repository.Filter)
	if !ok {
		return nil
	}
	rawIDs, ok := filter["$in"].([]string)
	if !ok {
		return nil
	}
	ids := make(map[string]bool, len(rawIDs))
	for _, id := range rawIDs {
		ids[id] = true
	}
	return ids
}

func TestCreateTransactionUsesSessionActorAndMinorUnits(t *testing.T) {
	finance, store := testFinance()
	tx, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "request-1234", TransactionInput{
		VaultID: "vault-a", AccountID: "account-a", Type: "expense",
		AmountMinor: 1299, Currency: "inr", OccurredAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("CreateTransaction: %v", err)
	}
	if tx.CreatedBy != "user-a" || tx.AmountMinor != 1299 || tx.Currency != "INR" {
		t.Fatalf("unexpected transaction: %#v", tx)
	}
	if store.created == nil {
		t.Fatal("financial repository was not called")
	}
	if store.createdAudit == nil || store.createdAudit.EntityID != tx.ID {
		t.Fatalf("financial audit was not attached atomically: %#v", store.createdAudit)
	}
	if store.requestTime == nil || !store.requestTime.Equal(tx.OccurredAt) {
		t.Fatalf("client occurredAt was not preserved for idempotency: %#v", store.requestTime)
	}
}

func TestCreateTransactionOmitsServerDefaultTimeFromIdempotencyFingerprint(t *testing.T) {
	finance, store := testFinance()
	tx, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "request-1234", TransactionInput{
		VaultID: "vault-a", AccountID: "account-a", Type: "expense",
		AmountMinor: 1299, Currency: "INR",
	})
	if err != nil {
		t.Fatalf("CreateTransaction: %v", err)
	}
	if tx.OccurredAt.IsZero() {
		t.Fatal("server did not assign occurredAt")
	}
	if store.requestTime != nil {
		t.Fatalf("server-generated occurredAt leaked into request fingerprint: %v", *store.requestTime)
	}
}

func TestCreateTransactionRejectsMissingIdempotencyAndInvalidSplits(t *testing.T) {
	finance, _ := testFinance()
	base := TransactionInput{
		VaultID: "vault-a", AccountID: "account-a", Type: "expense",
		AmountMinor: 1000, Currency: "INR",
	}
	if _, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "", base); err == nil {
		t.Fatal("missing idempotency key was accepted")
	}
	base.Splits = []model.Split{{UserID: "user-a", AmountMinor: 400}, {UserID: "user-b", AmountMinor: 400}}
	if _, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "request-1234", base); err == nil {
		t.Fatal("unbalanced splits were accepted")
	}
}

func TestCreateSplitResolvesMemberEmailsWithoutExposingInternalIDs(t *testing.T) {
	finance, store := testFinance()
	created, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "split-request-1234", TransactionInput{
		VaultID: "vault-a", AccountID: "account-a", Type: "split",
		AmountMinor: 1000, Currency: "INR", Category: "Shared",
		Splits: []model.Split{
			{MemberEmail: " ASHA@example.test ", AmountMinor: 400},
			{MemberEmail: "ben@example.test", AmountMinor: 600},
		},
	})
	if err != nil {
		t.Fatalf("CreateTransaction(split): %v", err)
	}
	if created.Type != "expense" || created.SequenceScope != model.TransactionSequenceSplit {
		t.Fatalf("created split type/scope = %q/%q", created.Type, created.SequenceScope)
	}
	if len(created.Splits) != 2 || created.Splits[0].UserID != "user-a" || created.Splits[1].UserID != "user-b" {
		t.Fatalf("resolved splits = %#v", created.Splits)
	}
	if created.Splits[0].MemberEmail != "" || created.Splits[1].MemberEmail != "" || store.created == nil {
		t.Fatalf("request-only member emails reached persistence: %#v", created.Splits)
	}
}

func TestCreateSplitRequiresShares(t *testing.T) {
	finance, _ := testFinance()
	_, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "split-request-1234", TransactionInput{
		VaultID: "vault-a", AccountID: "account-a", Type: "split",
		AmountMinor: 1000, Currency: "INR",
	})
	var fieldErr *FieldError
	if !errors.As(err, &fieldErr) || fieldErr.Field != "splits" {
		t.Fatalf("missing split shares error = %v, want splits validation", err)
	}
}

func TestCreateTransactionRejectsOversizedTextFields(t *testing.T) {
	finance, _ := testFinance()
	_, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "request-1234", TransactionInput{
		VaultID: "vault-a", AccountID: "account-a", Type: "expense",
		AmountMinor: 1000, Currency: "INR", Merchant: strings.Repeat("x", 201),
	})
	var fieldErr *FieldError
	if !errors.As(err, &fieldErr) || fieldErr.Field != "merchant" {
		t.Fatalf("oversized merchant error = %v, want merchant validation", err)
	}
}

func TestPrivateVaultCannotBeAccessedByAnotherMember(t *testing.T) {
	finance, _ := testFinance()
	_, err := finance.CreateAccount(context.Background(), "workspace-a", "user-a", AccountInput{
		VaultID: "private-other", Name: "Leaked", Currency: "INR",
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestTransferRequiresDifferentDestination(t *testing.T) {
	finance, _ := testFinance()
	_, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "request-1234", TransactionInput{
		VaultID: "vault-a", AccountID: "account-a", DestinationAccountID: "account-a",
		Type: "transfer", AmountMinor: 500, Currency: "INR",
	})
	if err == nil {
		t.Fatal("same-account transfer was accepted")
	}
}

func TestCreateTransactionRejectsSplitsOutsideWorkspace(t *testing.T) {
	finance, _ := testFinance()
	_, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "request-1234", TransactionInput{
		VaultID: "vault-a", AccountID: "account-a", Type: "expense", AmountMinor: 1000, Currency: "INR",
		Splits: []model.Split{{UserID: "user-a", AmountMinor: 500}, {UserID: "outsider", AmountMinor: 500}},
	})
	if !errors.Is(err, ErrValidation) {
		t.Fatalf("expected validation error, got %v", err)
	}
}

func TestSelectedVaultFailsClosedWithoutSelectionACL(t *testing.T) {
	finance, _ := testFinance()
	_, err := finance.CreateAccount(context.Background(), "workspace-a", "user-a", AccountInput{
		VaultID: "selected-other", Name: "Leaked", Currency: "INR",
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestPrivateAccountCannotBeUsedByAnotherMember(t *testing.T) {
	finance, _ := testFinance()
	_, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "request-1234", TransactionInput{
		VaultID: "vault-a", AccountID: "private-other", Type: "expense", AmountMinor: 500, Currency: "INR",
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestSubmitClaimRejectsPrivateVaultThatNoOtherApproverCanReview(t *testing.T) {
	finance, store := testFinance()
	privateVault := store.vaults["vault-a"]
	privateVault.Privacy = "private"
	store.vaults["vault-a"] = privateVault

	_, err := finance.SubmitClaim(context.Background(), "workspace-a", "user-a", ClaimInput{
		VaultID: "vault-a", AmountMinor: 500, Currency: "INR",
		Description: "Private expense",
	})
	var fieldErr *FieldError
	if !errors.As(err, &fieldErr) || fieldErr.Field != "vaultId" {
		t.Fatalf("SubmitClaim() error = %v, want vaultId validation", err)
	}
	if store.txRuns != 0 {
		t.Fatalf("private claim started %d transaction(s)", store.txRuns)
	}
}

func TestListCollectionScopesClaimsToSubmitterWithoutApprovalPermission(t *testing.T) {
	finance, store := testFinance()
	var claims []model.ExpenseClaim
	if err := finance.ListCollection(context.Background(), "workspace-a", "user-a", "expense_claims", model.PermSubmitExpenses, &claims); err != nil {
		t.Fatalf("ListCollection: %v", err)
	}
	filter := store.filters["expense_claims"]
	if filter["submitted_by"] != "user-a" {
		t.Fatalf("claims were not scoped to submitter: %#v", filter)
	}
	if _, ok := filter["vault_id"]; !ok {
		t.Fatalf("claims were not scoped to visible vaults: %#v", filter)
	}
}

func TestInvitationCannotGrantRoleAboveInviterPermissions(t *testing.T) {
	finance, store := testFinance()
	store.membership.Role = "administrator"
	store.membership.Permissions = nil

	_, err := finance.CreateInvitation(context.Background(), "workspace-a", "user-a", InvitationInput{
		Email: "invitee@example.test",
		Role:  "owner",
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("administrator granted owner role: %v", err)
	}
}

func TestCreateInvitationExpiresStalePendingRecordBeforeInsert(t *testing.T) {
	finance, store := testFinance()
	store.membership.Role = "administrator"
	store.membership.Permissions = nil

	result, err := finance.CreateInvitation(context.Background(), "workspace-a", "user-a", InvitationInput{
		Email: "invitee@example.test",
		Role:  "member",
	})
	if err != nil {
		t.Fatalf("CreateInvitation: %v", err)
	}
	if result.Token == "" {
		t.Fatal("CreateInvitation did not return a share token")
	}
	if store.updateFilter["workspace_id"] != "workspace-a" ||
		store.updateFilter["email"] != "invitee@example.test" ||
		store.updateFilter["status"] != "pending" {
		t.Fatalf("stale invitation cleanup filter = %#v", store.updateFilter)
	}
	expiresAt, ok := store.updateFilter["expires_at"].(repository.Filter)
	if !ok || expiresAt["$lte"] == nil {
		t.Fatalf("stale invitation cleanup lacks expiry bound: %#v", store.updateFilter)
	}
	set, ok := store.updateValue["$set"].(repository.Filter)
	if !ok || set["status"] != "expired" {
		t.Fatalf("stale invitation cleanup update = %#v", store.updateValue)
	}
}

func TestCreateInvitationAllowsManualTokenWithoutEmail(t *testing.T) {
	finance, store := testFinance()
	store.membership.Role = "administrator"
	store.membership.Permissions = nil

	result, err := finance.CreateInvitation(context.Background(), "workspace-a", "user-a", InvitationInput{Role: "member"})
	if err != nil {
		t.Fatalf("CreateInvitation without email: %v", err)
	}
	if result.Token == "" || store.createdInvitation == nil {
		t.Fatal("manual invitation token was not created")
	}
	if store.createdInvitation.Email != "" {
		t.Fatalf("manual invitation email = %q, want empty", store.createdInvitation.Email)
	}
}

func TestSearchScopesAccountsToAccessibleAccountIDs(t *testing.T) {
	finance, store := testFinance()

	if _, err := finance.Search(context.Background(), "workspace-a", "user-a", "cash"); err != nil {
		t.Fatalf("Search: %v", err)
	}
	filter := store.filters["accounts"]
	if _, ok := filter["_id"]; !ok {
		t.Fatalf("account search was not scoped to accessible account IDs: %#v", filter)
	}
	if _, ok := filter["$text"]; !ok {
		t.Fatalf("account search does not use the text index: %#v", filter)
	}
}

func TestDashboardDoesNotExposeApprovalCountsToNonApprovers(t *testing.T) {
	finance, store := testFinance()

	if _, err := finance.Dashboard(context.Background(), "workspace-a", "user-a"); err != nil {
		t.Fatalf("Dashboard: %v", err)
	}
	if filter, ok := store.counts["expense_claims"]; ok {
		t.Fatalf("non-approver queried pending approval count with filter %#v", filter)
	}
}

func TestDashboardCountsOnlyActionablePendingApprovals(t *testing.T) {
	finance, store := testFinance()
	store.membership.Role = "approver"
	store.membership.Permissions = nil

	if _, err := finance.Dashboard(context.Background(), "workspace-a", "user-a"); err != nil {
		t.Fatalf("Dashboard: %v", err)
	}
	filter, ok := store.counts["expense_claims"]
	if !ok {
		t.Fatal("approver did not query the pending approval count")
	}
	if got := filter["submitted_by"]; !reflect.DeepEqual(
		got,
		repository.Filter{"$ne": "user-a"},
	) {
		t.Fatalf("pending approval submitter filter = %#v, want actor exclusion", got)
	}
}

func TestDashboardScopesMonetaryTotalsToWorkspaceCurrency(t *testing.T) {
	finance, store := testFinance()
	inrAccount := store.accounts["account-a"]
	inrAccount.BalanceMinor = 10_000
	store.accounts["account-a"] = inrAccount
	store.accounts["usd-account"] = model.Account{
		ID: "usd-account", WorkspaceID: "workspace-a", VaultID: "vault-a",
		OwnerID: "user-a", Currency: "USD", Privacy: "workspace",
		BalanceMinor: 25_000,
	}

	dashboard, err := finance.Dashboard(context.Background(), "workspace-a", "user-a")
	if err != nil {
		t.Fatalf("Dashboard: %v", err)
	}
	if dashboard.Currency != "INR" || dashboard.BalanceMinor != 10_000 {
		t.Fatalf("mixed-currency dashboard = %#v", dashboard)
	}
	match, ok := store.pipelines["transactions"][0]["$match"].(repository.Filter)
	if !ok || match["account_id"] == nil {
		match = nestedTransactionFilter(match, "account_id")
		if match == nil {
			t.Fatalf("dashboard transaction scope = %#v", store.pipelines["transactions"])
		}
	}
	accountScope := match["account_id"].(repository.Filter)["$in"].([]string)
	if contains(accountScope, "usd-account") {
		t.Fatalf("USD account leaked into INR dashboard query: %#v", accountScope)
	}
}

func nestedTransactionFilter(filter repository.Filter, field string) repository.Filter {
	if _, ok := filter[field]; ok {
		return filter
	}
	clauses, ok := filter["$and"].([]repository.Filter)
	if ok {
		for _, clause := range clauses {
			if nested := nestedTransactionFilter(clause, field); nested != nil {
				return nested
			}
		}
	}
	clauses, ok = filter["$or"].([]repository.Filter)
	if ok {
		for _, clause := range clauses {
			if nested := nestedTransactionFilter(clause, field); nested != nil {
				return nested
			}
		}
	}
	return nil
}

func TestListTransactionsHydratesActiveAndFormerCreatorsWithoutIDs(t *testing.T) {
	finance, store := testFinance()
	store.transactions = []model.Transaction{
		{
			ID: "transaction-active", WorkspaceID: "workspace-a", VaultID: "vault-a",
			AccountID: "account-a", CreatedBy: "user-b", Type: "expense",
			AmountMinor: 1_200, Currency: "INR", Privacy: "workspace",
		},
		{
			ID: "transaction-former", WorkspaceID: "workspace-a", VaultID: "vault-a",
			AccountID: "account-a", CreatedBy: "missing-user", Type: "expense",
			AmountMinor: 2_400, Currency: "INR", Privacy: "workspace",
		},
	}

	transactions, err := finance.ListTransactions(context.Background(), "workspace-a", "user-a", TransactionFilter{})
	if err != nil {
		t.Fatalf("ListTransactions() error = %v", err)
	}

	if transactions[0].Creator == nil ||
		transactions[0].Creator.Name != "Ben Ortiz" ||
		transactions[0].Creator.Initials != "BO" ||
		transactions[0].Creator.Status != "active" ||
		transactions[0].Creator.ProfileImageURL != "https://cdn.example.test/ben.png" ||
		transactions[0].Creator.IsCurrentUser {
		t.Fatalf("active creator summary = %#v", transactions[0].Creator)
	}
	if transactions[1].Creator == nil ||
		transactions[1].Creator.Name != "Former member" ||
		transactions[1].Creator.Initials != "FM" ||
		transactions[1].Creator.Status != "former" ||
		transactions[1].Creator.IsCurrentUser {
		t.Fatalf("former creator summary = %#v", transactions[1].Creator)
	}
}

func TestListTransactionsMarksCurrentUserCreatorWithoutExposingCreatedBy(t *testing.T) {
	finance, store := testFinance()
	store.transactions = []model.Transaction{{
		ID: "transaction-own", WorkspaceID: "workspace-a", VaultID: "vault-a",
		AccountID: "account-a", CreatedBy: "user-a", Type: "income",
		AmountMinor: 1_200, Currency: "INR", Privacy: "workspace",
	}}

	transactions, err := finance.ListTransactions(context.Background(), "workspace-a", "user-a", TransactionFilter{})
	if err != nil {
		t.Fatalf("ListTransactions() error = %v", err)
	}

	if transactions[0].Creator == nil ||
		transactions[0].Creator.Name != "Asha Rao" ||
		!transactions[0].Creator.IsCurrentUser {
		t.Fatalf("current user creator summary = %#v", transactions[0].Creator)
	}
	payload, err := json.Marshal(transactions[0])
	if err != nil {
		t.Fatalf("marshal transaction: %v", err)
	}
	if strings.Contains(string(payload), "user-a") ||
		strings.Contains(string(payload), "createdBy") {
		t.Fatalf("transaction JSON leaked internal creator identity: %s", payload)
	}
	if !strings.Contains(string(payload), `"isCurrentUser":true`) {
		t.Fatalf("transaction JSON missing safe ownership flag: %s", payload)
	}
}

func TestDashboardRecentTransactionsHydrateFormerCreator(t *testing.T) {
	finance, store := testFinance()
	store.transactions = []model.Transaction{{
		ID: "transaction-former", WorkspaceID: "workspace-a", VaultID: "vault-a",
		AccountID: "account-a", CreatedBy: "missing-user", Type: "expense",
		AmountMinor: 1_200, Currency: "INR", Privacy: "workspace",
	}}

	dashboard, err := finance.Dashboard(context.Background(), "workspace-a", "user-a")
	if err != nil {
		t.Fatalf("Dashboard() error = %v", err)
	}

	if len(dashboard.Recent) != 1 ||
		dashboard.Recent[0].Creator == nil ||
		dashboard.Recent[0].Creator.Name != "Former member" ||
		dashboard.Recent[0].Creator.Status != "former" {
		t.Fatalf("dashboard recent creator summary = %#v", dashboard.Recent)
	}
}

type dashboardFilterStore struct {
	*financeStore
}

func (s *dashboardFilterStore) FindMany(ctx context.Context, collection string, filter repository.Filter, destination any, limit, skip int64, sorting repository.Sort) error {
	if collection != "transactions" {
		return s.financeStore.FindMany(ctx, collection, filter, destination, limit, skip, sorting)
	}
	if _, alreadyCaptured := s.filters[collection]; !alreadyCaptured {
		s.filters[collection] = filter
	}
	out := destination.(*[]model.Transaction)
	for _, transaction := range s.transactions {
		if dashboardTransactionMatches(transaction, filter) {
			*out = append(*out, transaction)
		}
	}
	return nil
}

func (s *dashboardFilterStore) Aggregate(ctx context.Context, collection string, pipeline repository.Pipeline, destination any) error {
	if collection != "transactions" {
		return s.financeStore.Aggregate(ctx, collection, pipeline, destination)
	}
	s.pipelines[collection] = pipeline
	match := pipeline[0]["$match"].(repository.Filter)
	totals := map[string]int64{}
	for _, transaction := range s.transactions {
		if dashboardTransactionMatches(transaction, match) {
			totals[transaction.Type] += transaction.AmountMinor
		}
	}
	out := destination.(*[]transactionTypeTotal)
	for transactionType, total := range totals {
		*out = append(*out, transactionTypeTotal{Type: transactionType, Total: total})
	}
	return nil
}

func dashboardTransactionMatches(transaction model.Transaction, filter repository.Filter) bool {
	if clauses, ok := filter["$and"].([]repository.Filter); ok {
		for _, clause := range clauses {
			if !dashboardTransactionMatches(transaction, clause) {
				return false
			}
		}
	}
	if clauses, ok := filter["$or"].([]repository.Filter); ok && len(clauses) > 0 {
		matched := false
		for _, clause := range clauses {
			if dashboardTransactionMatches(transaction, clause) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	if rawDate, hasDate := filter["occurred_at"]; hasDate {
		occurredAt := transaction.OccurredAt
		if occurredAt.IsZero() {
			occurredAt = transaction.CreatedAt
		}
		switch date := rawDate.(type) {
		case repository.Filter:
			if exists, ok := date["$exists"].(bool); ok && exists != !transaction.OccurredAt.IsZero() {
				return false
			}
			if lower, ok := date["$gte"].(time.Time); ok && occurredAt.Before(lower.UTC()) {
				return false
			}
			if upper, ok := date["$lt"].(time.Time); ok && !occurredAt.Before(upper.UTC()) {
				return false
			}
			if upper, ok := date["$lte"].(time.Time); ok && occurredAt.After(upper.UTC()) {
				return false
			}
		case time.Time:
			if !transaction.OccurredAt.Equal(date) {
				return false
			}
		}
	}
	return true
}

func TestDashboardMonthFilterScopesAllTransactionDataToSelectedUTCMonth(t *testing.T) {
	baseFinance, baseStore := testFinance()
	store := &dashboardFilterStore{financeStore: baseStore}
	finance := NewFinanceService(store, NewAccessService(store))
	selectedMonth := time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC)
	store.transactions = []model.Transaction{
		{ID: "before", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", CreatedBy: "user-a", Type: "expense", AmountMinor: 9000, Currency: "INR", Category: "Outside", Privacy: "workspace", OccurredAt: time.Date(2026, time.July, 31, 23, 59, 59, 999_000_000, time.UTC)},
		{ID: "selected-income", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", CreatedBy: "user-a", Type: "income", AmountMinor: 12000, Currency: "INR", Category: "Salary", Privacy: "workspace", OccurredAt: time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC)},
		{ID: "selected-expense", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", CreatedBy: "user-a", Type: "expense", AmountMinor: 3500, Currency: "INR", Category: "Utilities", Privacy: "workspace", OccurredAt: time.Date(2026, time.August, 31, 23, 59, 59, 999_000_000, time.UTC)},
		{ID: "after", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", CreatedBy: "user-a", Type: "expense", AmountMinor: 8000, Currency: "INR", Category: "Outside", Privacy: "workspace", OccurredAt: time.Date(2026, time.September, 1, 0, 0, 0, 0, time.UTC)},
	}

	dashboard, err := finance.Dashboard(context.Background(), "workspace-a", "user-a", DashboardFilter{Month: &selectedMonth})
	if err != nil {
		t.Fatalf("Dashboard() error = %v", err)
	}
	if dashboard.IncomeMinor != 12000 || dashboard.SpendingMinor != 3500 {
		t.Fatalf("selected month totals = income %d spending %d", dashboard.IncomeMinor, dashboard.SpendingMinor)
	}
	if len(dashboard.Recent) != 2 || len(dashboard.RecentActivity) != 2 {
		t.Fatalf("selected month recent data = recent %d activity %d, want 2 each", len(dashboard.Recent), len(dashboard.RecentActivity))
	}
	if len(dashboard.ByCategory) != 1 || dashboard.ByCategory[0].Name != "Utilities" || dashboard.ByCategory[0].AmountMinor != 3500 {
		t.Fatalf("selected month categories = %#v", dashboard.ByCategory)
	}
	if len(dashboard.Cashflow) != 2 || dashboard.Cashflow[0].Period != "2026-08-01" || dashboard.Cashflow[1].Period != "2026-08-31" {
		t.Fatalf("selected month cashflow = %#v", dashboard.Cashflow)
	}
	if len(dashboard.MonthlyTrend) != 1 || dashboard.MonthlyTrend[0].Period != "2026-08" {
		t.Fatalf("selected month trend = %#v", dashboard.MonthlyTrend)
	}

	dateFilter := nestedTransactionFilter(store.filters["transactions"], "occurred_at")
	date, ok := dateFilter["occurred_at"].(repository.Filter)
	if !ok || date["$gte"] != selectedMonth || date["$lt"] != time.Date(2026, time.September, 1, 0, 0, 0, 0, time.UTC) {
		t.Fatalf("dashboard UTC month range = %#v", date)
	}
	if _, ok := date["$lte"]; ok {
		t.Fatalf("dashboard month range used inclusive upper bound: %#v", date)
	}

	_ = baseFinance
}

func TestCreateWorkspaceUsesAtomicProvisioning(t *testing.T) {
	finance, store := testFinance()

	if _, err := finance.CreateWorkspace(context.Background(), "user-a", WorkspaceInput{
		Name: "Family", Type: "family", Currency: "INR",
	}); err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	if store.txRuns != 1 {
		t.Fatalf("transaction runs = %d, want 1", store.txRuns)
	}
	if store.createdWorkspace == nil || store.createdWorkspace.Visibility != "private" {
		t.Fatalf("workspace visibility = %#v, want private", store.createdWorkspace)
	}
}

func TestReportUsesServerSideAggregation(t *testing.T) {
	finance, store := testFinance()
	expense := transactionCategoryTotal{Total: 700}
	expense.Key.Type, expense.Key.Category = "expense", "Food"
	income := transactionCategoryTotal{Total: 1_500}
	income.Key.Type = "income"
	store.catTotals = []transactionCategoryTotal{expense, income}

	report, err := finance.Report(
		context.Background(),
		"workspace-a",
		"user-a",
		time.Now().Add(-24*time.Hour),
		time.Now(),
	)
	if err != nil {
		t.Fatalf("Report: %v", err)
	}
	if report.IncomeMinor != 1_500 || report.SpendingMinor != 700 || report.NetMinor != 800 {
		t.Fatalf("unexpected report totals: %#v", report)
	}
	if report.Currency != "INR" {
		t.Fatalf("report currency = %q, want INR", report.Currency)
	}
	if len(store.pipelines["transactions"]) != 2 {
		t.Fatalf("transaction aggregation pipeline = %#v", store.pipelines["transactions"])
	}
	match, ok := store.pipelines["transactions"][0]["$match"].(repository.Filter)
	if !ok || match["currency"] != "INR" {
		t.Fatalf("report aggregation is not currency-scoped: %#v", store.pipelines["transactions"])
	}
}

func TestFinancialPeriodStartUsesConfiguredWorkspaceDay(t *testing.T) {
	tests := []struct {
		name     string
		now      time.Time
		startDay int
		want     time.Time
	}{
		{
			name:     "after configured day uses current month",
			now:      time.Date(2026, time.July, 29, 18, 0, 0, 0, time.FixedZone("IST", 5*60*60+30*60)),
			startDay: 15,
			want:     time.Date(2026, time.July, 15, 0, 0, 0, 0, time.UTC),
		},
		{
			name:     "before configured day uses previous month",
			now:      time.Date(2026, time.July, 10, 10, 0, 0, 0, time.UTC),
			startDay: 15,
			want:     time.Date(2026, time.June, 15, 0, 0, 0, 0, time.UTC),
		},
		{
			name:     "january rolls into previous year",
			now:      time.Date(2026, time.January, 3, 10, 0, 0, 0, time.UTC),
			startDay: 10,
			want:     time.Date(2025, time.December, 10, 0, 0, 0, 0, time.UTC),
		},
		{
			name:     "invalid legacy day falls back to first",
			now:      time.Date(2026, time.July, 3, 10, 0, 0, 0, time.UTC),
			startDay: 0,
			want:     time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC),
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := financialPeriodStart(test.now, test.startDay); !got.Equal(test.want) {
				t.Fatalf("financialPeriodStart() = %s, want %s", got, test.want)
			}
		})
	}
}

func TestListCollectionAppliesGoalVisibilityPredicate(t *testing.T) {
	finance, store := testFinance()
	var goals []model.Goal

	if err := finance.ListCollection(
		context.Background(),
		"workspace-a",
		"user-a",
		"goals",
		model.PermViewTransactions,
		&goals,
	); err != nil {
		t.Fatalf("ListCollection goals: %v", err)
	}
	filter := store.filters["goals"]
	if _, ok := filter["$and"]; !ok {
		t.Fatalf("goal query is missing combined vault and visibility scope: %#v", filter)
	}
}
