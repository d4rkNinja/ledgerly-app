package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type workspaceAccessTestStore struct {
	membership       model.Membership
	workspace        model.Workspace
	workspaceFilter  repository.Filter
	workspaceUpdate  repository.Filter
	joinRequests     []model.WorkspaceJoinRequest
	notifications    []model.Notification
	auditEvents      []model.AuditEvent
	transactionDelay time.Duration
	auditInsertDelay time.Duration
}

func (s *workspaceAccessTestStore) Insert(_ context.Context, collection string, document any) error {
	switch collection {
	case "workspace_join_requests":
		s.joinRequests = append(s.joinRequests, *document.(*model.WorkspaceJoinRequest))
	case "notifications":
		s.notifications = append(s.notifications, *document.(*model.Notification))
	case "audit_events":
		if s.auditInsertDelay > 0 {
			time.Sleep(s.auditInsertDelay)
		}
		s.auditEvents = append(s.auditEvents, *document.(*model.AuditEvent))
	default:
		return errors.New("unexpected insert collection")
	}
	return nil
}

func (s *workspaceAccessTestStore) FindOne(_ context.Context, collection string, filter repository.Filter, destination any) error {
	switch collection {
	case "memberships":
		if s.membership.WorkspaceID == filter["workspace_id"] && s.membership.UserID == filter["user_id"] {
			*destination.(*model.Membership) = s.membership
			return nil
		}
	case "workspaces":
		s.workspaceFilter = filter
		if s.workspace.JoinCodeHash != filter["join_code_hash"] || s.workspace.Visibility != filter["visibility"] {
			return repository.ErrNotFound
		}
		if expiryFilter, ok := filter["join_code_expires_at"].(repository.Filter); ok {
			now, ok := expiryFilter["$gt"].(time.Time)
			if !ok || !s.workspace.JoinCodeExpiresAt.After(now) {
				return repository.ErrNotFound
			}
		}
		*destination.(*model.Workspace) = s.workspace
		return nil
	case "workspace_join_requests":
		return repository.ErrNotFound
	}
	return repository.ErrNotFound
}

func (s *workspaceAccessTestStore) FindMany(_ context.Context, collection string, filter repository.Filter, destination any, _, _ int64, _ repository.Sort) error {
	if collection != "memberships" {
		return errors.New("unexpected find-many collection")
	}
	workspaceID, _ := filter["workspace_id"].(string)
	if s.membership.WorkspaceID == workspaceID {
		*destination.(*[]model.Membership) = append(*destination.(*[]model.Membership), s.membership)
	}
	return nil
}

func (s *workspaceAccessTestStore) Aggregate(context.Context, string, repository.Pipeline, any) error {
	return errors.New("unexpected aggregate")
}

func (s *workspaceAccessTestStore) UpdateOne(_ context.Context, collection string, filter, update repository.Filter, destination any) error {
	if collection != "workspaces" || filter["_id"] != s.workspace.ID {
		return repository.ErrNotFound
	}
	set, ok := update["$set"].(repository.Filter)
	if !ok {
		return errors.New("workspace update is missing $set")
	}
	s.workspaceUpdate = set
	if value, ok := set["join_code_hash"].(string); ok {
		s.workspace.JoinCodeHash = value
	}
	if value, ok := set["join_code_expires_at"].(time.Time); ok {
		s.workspace.JoinCodeExpiresAt = value
	}
	if value, ok := set["visibility"].(string); ok {
		s.workspace.Visibility = value
	}
	if value, ok := set["updated_at"].(time.Time); ok {
		s.workspace.UpdatedAt = value
	}
	*destination.(*model.Workspace) = s.workspace
	return nil
}

func (s *workspaceAccessTestStore) UpdateMany(context.Context, string, repository.Filter, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *workspaceAccessTestStore) DeleteOne(context.Context, string, repository.Filter) error {
	return repository.ErrNotFound
}

func (s *workspaceAccessTestStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *workspaceAccessTestStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	if s.transactionDelay > 0 {
		time.Sleep(s.transactionDelay)
	}
	return fn(ctx)
}

func (s *workspaceAccessTestStore) CreateFinancialTransaction(context.Context, *model.Transaction, string, *time.Time, *model.AuditEvent) (*model.Transaction, error) {
	return nil, errors.New("unexpected financial transaction")
}

func newWorkspaceAccessTestService(store *workspaceAccessTestStore) *FinanceService {
	return NewFinanceService(store, NewAccessService(store))
}

func workspaceAccessTestStoreForCode(hash string, expiresAt time.Time) *workspaceAccessTestStore {
	return &workspaceAccessTestStore{
		membership: model.Membership{
			WorkspaceID: "workspace-a",
			UserID:      "owner-a",
			Role:        "owner",
		},
		workspace: model.Workspace{
			ID:                "workspace-a",
			Name:              "Finance",
			Visibility:        "private",
			JoinCodeHash:      hash,
			JoinCodeExpiresAt: expiresAt,
		},
	}
}

func TestRotateWorkspaceJoinCodeReturnsExpiryAtLeastThreeMinutesAhead(t *testing.T) {
	store := workspaceAccessTestStoreForCode("old-hash", time.Now().UTC().Add(time.Minute))
	finance := newWorkspaceAccessTestService(store)

	result, err := finance.RotateWorkspaceJoinCode(context.Background(), "workspace-a", "owner-a")
	if err != nil {
		t.Fatalf("RotateWorkspaceJoinCode: %v", err)
	}
	responseAt := time.Now().UTC()
	if result.ExpiresAt.Sub(responseAt) < 3*time.Minute {
		t.Fatalf("expiry too short after successful generation response: %s", result.ExpiresAt.Sub(responseAt))
	}
	updatedAt, ok := store.workspaceUpdate["updated_at"].(time.Time)
	if !ok {
		t.Fatalf("workspace update = %#v, missing updated_at", store.workspaceUpdate)
	}
	if result.ExpiresAt.Sub(updatedAt) < 3*time.Minute {
		t.Fatalf("expiry lifetime = %s, want at least 3m", result.ExpiresAt.Sub(updatedAt))
	}
	persistedExpiry, ok := store.workspaceUpdate["join_code_expires_at"].(time.Time)
	if !ok || !persistedExpiry.Equal(result.ExpiresAt) {
		t.Fatalf("persisted expiry = %#v, result expiry = %s", store.workspaceUpdate["join_code_expires_at"], result.ExpiresAt)
	}
}

func TestRotateWorkspaceJoinCodeKeepsThreeMinutesAfterTransactionDelay(t *testing.T) {
	store := workspaceAccessTestStoreForCode("old-hash", time.Now().UTC().Add(time.Minute))
	store.transactionDelay = 1_250 * time.Millisecond
	finance := newWorkspaceAccessTestService(store)

	result, err := finance.RotateWorkspaceJoinCode(context.Background(), "workspace-a", "owner-a")
	if err != nil {
		t.Fatalf("RotateWorkspaceJoinCode: %v", err)
	}
	responseAt := time.Now().UTC()
	if result.ExpiresAt.Sub(responseAt) < workspaceJoinCodeLifetime {
		t.Fatalf("expiry after delayed successful response = %s, want at least %s", result.ExpiresAt.Sub(responseAt), workspaceJoinCodeLifetime)
	}
}

func TestRotateWorkspaceJoinCodeKeepsThreeMinutesAfterPersistenceDelay(t *testing.T) {
	store := workspaceAccessTestStoreForCode("old-hash", time.Now().UTC().Add(time.Minute))
	store.auditInsertDelay = 1_250 * time.Millisecond
	finance := newWorkspaceAccessTestService(store)

	result, err := finance.RotateWorkspaceJoinCode(context.Background(), "workspace-a", "owner-a")
	if err != nil {
		t.Fatalf("RotateWorkspaceJoinCode: %v", err)
	}
	responseAt := time.Now().UTC()
	if result.ExpiresAt.Sub(responseAt) < workspaceJoinCodeLifetime {
		t.Fatalf("expiry after delayed persistence response = %s, want at least %s", result.ExpiresAt.Sub(responseAt), workspaceJoinCodeLifetime)
	}
}

func TestRequestWorkspaceJoinRejectsExpiredOrLegacyCode(t *testing.T) {
	tests := []struct {
		name      string
		expiresAt time.Time
	}{
		{name: "expired", expiresAt: time.Now().UTC().Add(-time.Second)},
		{name: "legacy hash-only", expiresAt: time.Time{}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			code, hash, err := randomToken(tokenBytes)
			if err != nil {
				t.Fatalf("randomToken: %v", err)
			}
			store := workspaceAccessTestStoreForCode(hash, test.expiresAt)
			finance := newWorkspaceAccessTestService(store)

			_, err = finance.RequestWorkspaceJoin(
				context.Background(),
				&model.User{ID: "member-a", Name: "Member", Email: "member@example.test"},
				WorkspaceJoinRequestInput{Code: code},
			)
			if !errors.Is(err, ErrNotFound) {
				t.Fatalf("RequestWorkspaceJoin() error = %v, want ErrNotFound", err)
			}
		})
	}
}

func TestRequestWorkspaceJoinCreatesPendingApprovalForUnexpiredCode(t *testing.T) {
	code, hash, err := randomToken(tokenBytes)
	if err != nil {
		t.Fatalf("randomToken: %v", err)
	}
	store := workspaceAccessTestStoreForCode(hash, time.Now().UTC().Add(time.Minute))
	finance := newWorkspaceAccessTestService(store)

	request, err := finance.RequestWorkspaceJoin(
		context.Background(),
		&model.User{ID: "member-a", Name: "Member", Email: "member@example.test"},
		WorkspaceJoinRequestInput{Code: code},
	)
	if err != nil {
		t.Fatalf("RequestWorkspaceJoin() error = %v", err)
	}
	if request.Status != "pending" || request.WorkspaceID != "workspace-a" || request.RequesterID != "member-a" {
		t.Fatalf("join request = %#v", request)
	}
	if len(store.joinRequests) != 1 || len(store.notifications) != 1 || len(store.auditEvents) != 1 {
		t.Fatalf("approval workflow writes = requests:%d notifications:%d audits:%d", len(store.joinRequests), len(store.notifications), len(store.auditEvents))
	}
}
