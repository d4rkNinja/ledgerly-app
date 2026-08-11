package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type periodReviewAccessStore struct {
	*periodReviewStore
	removals []model.WorkspaceMemberRemoval
}

func (s *periodReviewAccessStore) FindMany(ctx context.Context, collection string, filter repository.Filter, destination any, limit, skip int64, sort repository.Sort) error {
	if collection == "workspace_member_removals" {
		*destination.(*[]model.WorkspaceMemberRemoval) = append([]model.WorkspaceMemberRemoval(nil), s.removals...)
		return nil
	}
	return s.periodReviewStore.FindMany(ctx, collection, filter, destination, limit, skip, sort)
}

func TestAuthorizePeriodReviewReadHonorsMemberAndWorkspaceScopes(t *testing.T) {
	finance, store := periodReviewFinance()
	ctx := context.Background()

	memberReview := model.PeriodReview{
		WorkspaceID:  "workspace-a",
		Scope:        model.PeriodReviewScopeMemberView,
		ScopeActorID: "user-a",
	}
	if err := finance.authorizePeriodReviewRead(ctx, memberReview, "user-a"); err != nil {
		t.Fatalf("member owner read error = %v", err)
	}
	if err := finance.authorizePeriodReviewRead(ctx, memberReview, "user-b"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("other member read error = %v, want forbidden", err)
	}

	workspaceReview := model.PeriodReview{
		WorkspaceID: "workspace-a",
		Scope:       model.PeriodReviewScopeWorkspaceView,
	}
	if err := finance.authorizePeriodReviewRead(ctx, workspaceReview, "user-a"); err != nil {
		t.Fatalf("workspace member read error = %v", err)
	}
	if err := finance.authorizePeriodReviewRead(ctx, workspaceReview, "user-b"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("nonmember workspace read error = %v, want forbidden", err)
	}

	store.membership.Permissions = nil
	store.membership.Role = "member"
	if err := finance.authorizePeriodReviewRead(ctx, workspaceReview, "user-a"); err != nil {
		t.Fatalf("role-derived workspace read error = %v", err)
	}
	workspaceReview.Scope = "unknown"
	if err := finance.authorizePeriodReviewRead(ctx, workspaceReview, "user-a"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("unknown scope error = %v, want forbidden", err)
	}
}

func TestHydratePeriodReviewersUsesActiveAndFormerMemberSummaries(t *testing.T) {
	_, baseStore := periodReviewFinance()
	store := &periodReviewAccessStore{periodReviewStore: baseStore}
	finance := NewFinanceService(store, NewAccessService(store))
	store.users = map[string]model.User{
		"user-a": {ID: "user-a", Name: " Asha Rao ", ProfileImageURL: "https://example.test/asha.png"},
	}
	store.members = map[string]model.Membership{
		"user-a": {WorkspaceID: "workspace-a", UserID: "user-a", Role: "member"},
	}
	views := []model.PeriodReviewView{{
		PeriodReview: model.PeriodReview{WorkspaceID: "workspace-a", CreatedBy: "user-a"},
	}}
	if err := finance.hydratePeriodReviewers(context.Background(), "user-a", views); err != nil {
		t.Fatal(err)
	}
	if views[0].ReviewedBy == nil || views[0].ReviewedBy.Name != "Asha Rao" || views[0].ReviewedBy.Initials != "AR" || views[0].ReviewedBy.Status != "active" || !views[0].ReviewedBy.IsCurrentUser {
		t.Fatalf("active reviewedBy = %#v", views[0].ReviewedBy)
	}

	store.members = map[string]model.Membership{}
	store.users["user-a"] = model.User{ID: "user-a", Name: "Mutable New Name", ProfileImageURL: "https://example.test/new.png"}
	store.removals = []model.WorkspaceMemberRemoval{{
		WorkspaceID: "workspace-a", UserID: "user-a", Name: "Asha At Removal",
		ProfileImageURL: "https://example.test/removal.png", RemovedAt: time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC),
	}}
	if err := finance.hydratePeriodReviewers(context.Background(), "user-a", views); err != nil {
		t.Fatal(err)
	}
	if views[0].ReviewedBy == nil || views[0].ReviewedBy.Name != "Asha At Removal" || views[0].ReviewedBy.Initials != "AA" || views[0].ReviewedBy.ProfileImageURL != "https://example.test/removal.png" || views[0].ReviewedBy.Status != "former" || views[0].ReviewedBy.IsCurrentUser {
		t.Fatalf("former reviewedBy = %#v", views[0].ReviewedBy)
	}
}

func TestIsCurrentWorkspaceMemberFailsClosed(t *testing.T) {
	finance, store := periodReviewFinance()
	ctx := context.Background()
	if !finance.isCurrentWorkspaceMember(ctx, "workspace-a", "user-a") {
		t.Fatal("current member reported absent")
	}
	if finance.isCurrentWorkspaceMember(ctx, "workspace-a", "user-b") {
		t.Fatal("unknown member reported current")
	}
	store.membership.WorkspaceID = "workspace-b"
	if finance.isCurrentWorkspaceMember(ctx, "workspace-a", "user-a") {
		t.Fatal("cross-workspace membership reported current")
	}
}

func TestRevisionVisibleToActorUsesCurrentScopeAndSidePrivacy(t *testing.T) {
	review := model.PeriodReview{WorkspaceID: "workspace-a"}
	base := model.TransactionRevisionSnapshot{
		WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
		CreatedBy: "user-b", Privacy: "workspace",
	}
	vaultIDs := []string{"vault-a", "newly-visible-vault"}
	accountIDs := []string{"account-a", "destination-a", "newly-visible-account"}

	tests := []struct {
		name string
		edit func(*model.TransactionRevisionSnapshot)
		want bool
	}{
		{name: "workspace-visible side", want: true},
		{name: "actor-owned private side", edit: func(item *model.TransactionRevisionSnapshot) { item.Privacy = "private"; item.CreatedBy = "user-a" }, want: true},
		{name: "other private side", edit: func(item *model.TransactionRevisionSnapshot) { item.Privacy = "private" }, want: false},
		{name: "cross-workspace side", edit: func(item *model.TransactionRevisionSnapshot) { item.WorkspaceID = "workspace-b" }, want: false},
		{name: "inaccessible vault", edit: func(item *model.TransactionRevisionSnapshot) { item.VaultID = "vault-private" }, want: false},
		{name: "inaccessible source account", edit: func(item *model.TransactionRevisionSnapshot) { item.AccountID = "account-private" }, want: false},
		{name: "accessible destination", edit: func(item *model.TransactionRevisionSnapshot) { item.DestinationAccountID = "destination-a" }, want: true},
		{name: "inaccessible destination", edit: func(item *model.TransactionRevisionSnapshot) { item.DestinationAccountID = "destination-private" }, want: false},
		{name: "newly visible post-close account", edit: func(item *model.TransactionRevisionSnapshot) {
			item.VaultID = "newly-visible-vault"
			item.AccountID = "newly-visible-account"
		}, want: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			item := base
			if test.edit != nil {
				test.edit(&item)
			}
			if got := revisionVisibleToActor(review, &item, "user-a", vaultIDs, accountIDs); got != test.want {
				t.Fatalf("visible = %t, want %t; revision=%#v", got, test.want, item)
			}
		})
	}
	if revisionVisibleToActor(review, nil, "user-a", vaultIDs, accountIDs) {
		t.Fatal("nil revision reported visible")
	}
}
