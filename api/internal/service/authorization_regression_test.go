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

type authorizationRegressionStore struct {
	membership   model.Membership
	memberships  map[string]model.Membership
	invitation   model.Invitation
	claim        model.ExpenseClaim
	vault        model.Vault
	findErrors   map[string]error
	updateCalls  int
	updates      []string
	txRuns       int
	insertedGoal *model.Goal
}

func (s *authorizationRegressionStore) Insert(_ context.Context, collection string, document any) error {
	if collection == "goals" {
		goal := *document.(*model.Goal)
		s.insertedGoal = &goal
	}
	return nil
}

func (s *authorizationRegressionStore) FindOne(_ context.Context, collection string, filter repository.Filter, destination any) error {
	if err := s.findErrors[collection]; err != nil {
		return err
	}
	switch collection {
	case "memberships":
		if s.memberships != nil {
			membership, ok := s.memberships[filter["user_id"].(string)]
			if !ok {
				return repository.ErrNotFound
			}
			*destination.(*model.Membership) = membership
			return nil
		}
		*destination.(*model.Membership) = s.membership
	case "invitations":
		*destination.(*model.Invitation) = s.invitation
	case "expense_claims":
		*destination.(*model.ExpenseClaim) = s.claim
	case "vaults":
		*destination.(*model.Vault) = s.vault
	default:
		return repository.ErrNotFound
	}
	return nil
}

func (s *authorizationRegressionStore) FindMany(context.Context, string, repository.Filter, any, int64, int64, repository.Sort) error {
	return nil
}

func (s *authorizationRegressionStore) Aggregate(context.Context, string, repository.Pipeline, any) error {
	return nil
}

func (s *authorizationRegressionStore) UpdateOne(
	_ context.Context,
	collection string,
	_ repository.Filter,
	_ repository.Filter,
	_ any,
) error {
	s.updateCalls++
	s.updates = append(s.updates, collection)
	return nil
}

func (s *authorizationRegressionStore) UpdateMany(context.Context, string, repository.Filter, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *authorizationRegressionStore) DeleteOne(context.Context, string, repository.Filter) error {
	return nil
}

func (s *authorizationRegressionStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *authorizationRegressionStore) CreateFinancialTransaction(context.Context, *model.Transaction, string, *time.Time, *model.AuditEvent) (*model.Transaction, error) {
	return nil, errors.New("not implemented")
}

func (s *authorizationRegressionStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	s.txRuns++
	return fn(ctx)
}

func newAuthorizationRegressionService(store *authorizationRegressionStore) *FinanceService {
	return NewFinanceService(store, NewAccessService(store))
}

func TestWorkspaceMemberJSONOmitsInternalUserID(t *testing.T) {
	member := WorkspaceMember{
		Name:            "Asha Rao",
		Email:           "asha@example.test",
		Role:            "member",
		Permissions:     []string{model.PermViewTransactions},
		Status:          "active",
		JoinedAt:        time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC),
		ProfileImageURL: "https://cdn.example.test/asha.png",
	}
	payload, err := json.Marshal(member)
	if err != nil {
		t.Fatal(err)
	}
	text := string(payload)
	if strings.Contains(text, "userId") || strings.Contains(text, "internal-user-a") {
		t.Fatalf("workspace member JSON leaked an internal user ID: %s", text)
	}
	if !strings.Contains(text, `"status":"active"`) || !strings.Contains(text, `"profileImageUrl":"https://cdn.example.test/asha.png"`) {
		t.Fatalf("workspace member display JSON missing safe fields: %s", text)
	}
}

func TestAcceptInvitationPropagatesInvitationLookupFailure(t *testing.T) {
	dependencyErr := errors.New("database unavailable")
	store := &authorizationRegressionStore{
		findErrors: map[string]error{"invitations": dependencyErr},
	}

	_, err := newAuthorizationRegressionService(store).AcceptInvitation(
		context.Background(),
		&model.User{ID: "user-a", Email: "user@example.test", EmailVerified: true},
		strings.Repeat("A", 43),
	)
	if !errors.Is(err, dependencyErr) {
		t.Fatalf("AcceptInvitation() error = %v, want dependency error", err)
	}
}

func TestAcceptInvitationRejectsBlankTokenBeforeLookup(t *testing.T) {
	store := &authorizationRegressionStore{}

	_, err := newAuthorizationRegressionService(store).AcceptInvitation(
		context.Background(),
		&model.User{ID: "user-a", Email: "user@example.test"},
		"   ",
	)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("AcceptInvitation() error = %v, want not found", err)
	}
	if store.updateCalls != 0 {
		t.Fatalf("blank invitation token triggered %d updates", store.updateCalls)
	}
}

func TestRequestWorkspaceJoinRejectsBlankCodeBeforeLookup(t *testing.T) {
	store := &authorizationRegressionStore{}

	_, err := newAuthorizationRegressionService(store).RequestWorkspaceJoin(
		context.Background(),
		&model.User{ID: "user-a", Email: "user@example.test"},
		WorkspaceJoinRequestInput{Code: "  "},
	)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("RequestWorkspaceJoin() error = %v, want not found", err)
	}
}

func TestInvitationAcceptanceJSONContainsOnlySafeWorkspaceFields(t *testing.T) {
	payload, err := json.Marshal(InvitationAcceptance{
		WorkspaceID: "workspace-a",
		Role:        "member",
		Permissions: []string{model.PermViewTransactions},
	})
	if err != nil {
		t.Fatal(err)
	}
	text := string(payload)
	if strings.Contains(text, "userId") || strings.Contains(text, "membership") || strings.Contains(text, "internal-user") {
		t.Fatalf("invitation acceptance leaked internal membership data: %s", text)
	}
	for _, field := range []string{`"workspaceId":"workspace-a"`, `"role":"member"`, `"permissions":["view_transactions"]`} {
		if !strings.Contains(text, field) {
			t.Fatalf("invitation acceptance missing %s: %s", field, text)
		}
	}
}

func TestReviewClaimPropagatesClaimLookupFailure(t *testing.T) {
	dependencyErr := errors.New("database unavailable")
	store := &authorizationRegressionStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a", UserID: "approver", Role: "approver",
		},
		findErrors: map[string]error{"expense_claims": dependencyErr},
	}

	_, err := newAuthorizationRegressionService(store).ReviewClaim(
		context.Background(), "workspace-a", "approver", "claim-a", "approved", "",
	)
	if !errors.Is(err, dependencyErr) {
		t.Fatalf("ReviewClaim() error = %v, want dependency error", err)
	}
}

func TestReviewClaimPropagatesVaultLookupFailure(t *testing.T) {
	dependencyErr := errors.New("database unavailable")
	store := &authorizationRegressionStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a", UserID: "approver", Role: "approver",
		},
		claim: model.ExpenseClaim{
			ID: "claim-a", WorkspaceID: "workspace-a", VaultID: "vault-a",
			SubmittedBy: "submitter", Status: "pending",
		},
		findErrors: map[string]error{"vaults": dependencyErr},
	}

	_, err := newAuthorizationRegressionService(store).ReviewClaim(
		context.Background(), "workspace-a", "approver", "claim-a", "approved", "",
	)
	if !errors.Is(err, dependencyErr) {
		t.Fatalf("ReviewClaim() error = %v, want dependency error", err)
	}
	if store.updateCalls != 0 {
		t.Fatalf("claim update called %d times after vault lookup failure", store.updateCalls)
	}
}

func TestReviewClaimRejectsClaimInAnotherUsersPrivateVault(t *testing.T) {
	store := &authorizationRegressionStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a", UserID: "approver", Role: "approver",
		},
		claim: model.ExpenseClaim{
			ID: "claim-a", WorkspaceID: "workspace-a", VaultID: "private-vault",
			SubmittedBy: "submitter", Status: "pending",
		},
		vault: model.Vault{
			ID: "private-vault", WorkspaceID: "workspace-a", OwnerID: "submitter",
			Privacy: "private",
		},
		findErrors: map[string]error{},
	}

	_, err := newAuthorizationRegressionService(store).ReviewClaim(
		context.Background(), "workspace-a", "approver", "claim-a", "approved", "",
	)
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("ReviewClaim() error = %v, want forbidden", err)
	}
	if store.updateCalls != 0 {
		t.Fatalf("private claim was updated %d times", store.updateCalls)
	}
}

func TestCreateGoalAcceptsOnlyImplementedVisibilityModes(t *testing.T) {
	store := &authorizationRegressionStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a", UserID: "manager", Role: "finance_manager",
		},
		findErrors: map[string]error{},
	}
	finance := newAuthorizationRegressionService(store)
	input := GoalInput{
		Name: "Emergency reserve", TargetMinor: 100_000, Currency: "INR",
		Visibility: " selected ",
	}

	if _, err := finance.CreateGoal(context.Background(), "workspace-a", "manager", input); !errors.Is(err, ErrValidation) {
		t.Fatalf("CreateGoal() accepted unsupported visibility: %v", err)
	}

	input.Visibility = " PRIVATE "
	goal, err := finance.CreateGoal(context.Background(), "workspace-a", "manager", input)
	if err != nil {
		t.Fatalf("CreateGoal() private visibility: %v", err)
	}
	if goal.Visibility != "private" || store.insertedGoal == nil || store.insertedGoal.Visibility != "private" {
		t.Fatalf("private visibility was not normalized and persisted: %#v", goal)
	}
}

func TestGoalVisibilityFilterKeepsVaultlessPrivateGoalsCreatorOnly(t *testing.T) {
	want := repository.Filter{"$or": []repository.Filter{
		{"visibility": "workspace"},
		{"visibility": "private", "created_by": "user-a"},
		{"visibility": "selected", "created_by": "user-a"},
		{"visibility": ""},
		{"visibility": repository.Filter{"$exists": false}},
	}}
	if got := goalVisibilityFilter("user-a"); !reflect.DeepEqual(got, want) {
		t.Fatalf("goalVisibilityFilter() = %#v, want %#v", got, want)
	}
}

func TestAcceptInvitationConsumesTokenAndCreatesMembershipAtomically(t *testing.T) {
	store := &authorizationRegressionStore{
		invitation: model.Invitation{
			ID:          "invitation-a",
			WorkspaceID: "workspace-a",
			InviterID:   "inviter-a",
			Email:       "user@example.test",
			Role:        "member",
			Status:      "pending",
		},
		memberships: map[string]model.Membership{
			"inviter-a": {
				WorkspaceID: "workspace-a",
				UserID:      "inviter-a",
				Role:        "owner",
			},
		},
		findErrors: map[string]error{},
	}

	membership, err := newAuthorizationRegressionService(store).AcceptInvitation(
		context.Background(),
		&model.User{ID: "user-a", Email: "user@example.test", EmailVerified: true},
		strings.Repeat("A", 43),
	)
	if err != nil {
		t.Fatalf("AcceptInvitation: %v", err)
	}
	if membership.WorkspaceID != "workspace-a" || membership.UserID != "user-a" {
		t.Fatalf("unexpected membership: %#v", membership)
	}
	if store.txRuns != 1 || store.updateCalls != 1 {
		t.Fatalf("transaction runs = %d, update calls = %d; want 1 each", store.txRuns, store.updateCalls)
	}
}

func TestAcceptInvitationRejectsGrantAfterInviterLosesAuthority(t *testing.T) {
	store := &authorizationRegressionStore{
		invitation: model.Invitation{
			ID:          "invitation-a",
			WorkspaceID: "workspace-a",
			InviterID:   "former-admin",
			Email:       "user@example.test",
			Role:        "member",
			Status:      "pending",
		},
		memberships: map[string]model.Membership{},
		findErrors:  map[string]error{},
	}

	_, err := newAuthorizationRegressionService(store).AcceptInvitation(
		context.Background(),
		&model.User{ID: "user-a", Email: "user@example.test", EmailVerified: true},
		strings.Repeat("A", 43),
	)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("AcceptInvitation() error = %v, want unavailable invitation", err)
	}
	if store.updateCalls != 0 {
		t.Fatalf("revoked inviter's invitation was consumed %d times", store.updateCalls)
	}
}

func TestAcceptInvitationAtomicallyVerifiesMatchingEmailOwner(t *testing.T) {
	store := &authorizationRegressionStore{
		invitation: model.Invitation{
			ID: "invitation-a", WorkspaceID: "workspace-a",
			InviterID: "inviter-a", Email: "user@example.test",
			Role: "member", Status: "pending",
		},
		memberships: map[string]model.Membership{
			"inviter-a": {
				WorkspaceID: "workspace-a", UserID: "inviter-a", Role: "owner",
			},
		},
		findErrors: map[string]error{},
	}

	actor := &model.User{ID: "user-a", Email: "user@example.test"}
	membership, err := newAuthorizationRegressionService(store).AcceptInvitation(
		context.Background(),
		actor,
		strings.Repeat("A", 43),
	)
	if err != nil {
		t.Fatalf("AcceptInvitation() error = %v", err)
	}
	if membership.UserID != actor.ID || !actor.EmailVerified {
		t.Fatalf("unverified actor was not verified and admitted: actor=%#v membership=%#v", actor, membership)
	}
	if store.txRuns != 1 || !reflect.DeepEqual(store.updates, []string{"users", "invitations"}) {
		t.Fatalf("transaction runs = %d, updates = %#v; want atomic user and invitation updates", store.txRuns, store.updates)
	}
}
