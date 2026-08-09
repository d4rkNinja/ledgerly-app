package service

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type authStore struct {
	findOneErr      error
	findOneCalls    int
	sessions        []model.Session
	users           []model.User
	inserted        []string
	transactionRuns int
}

func (s *authStore) Insert(_ context.Context, collection string, _ any) error {
	s.inserted = append(s.inserted, collection)
	return nil
}
func (s *authStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return 0, nil
}
func (s *authStore) Aggregate(context.Context, string, repository.Pipeline, any) error {
	return nil
}
func (s *authStore) DeleteOne(context.Context, string, repository.Filter) error { return nil }
func (s *authStore) CreateFinancialTransaction(context.Context, *model.Transaction, string, *time.Time, *model.AuditEvent) (*model.Transaction, error) {
	return nil, errors.New("not implemented")
}
func (s *authStore) FindOne(context.Context, string, repository.Filter, any) error {
	s.findOneCalls++
	return s.findOneErr
}
func (s *authStore) FindMany(_ context.Context, collection string, _ repository.Filter, destination any, limit, _ int64, _ repository.Sort) error {
	if collection != "sessions" {
		return nil
	}
	out := destination.(*[]model.Session)
	for _, session := range s.sessions {
		if session.RevokedAt == nil && int64(len(*out)) < limit {
			*out = append(*out, session)
		}
	}
	return nil
}
func (s *authStore) UpdateOne(_ context.Context, collection string, filter, update repository.Filter, destination any) error {
	if collection == "users" {
		userID, _ := filter["_id"].(string)
		set, _ := update["$set"].(repository.Filter)
		preferredCurrency, _ := set["preferred_currency"].(string)
		updatedAt, _ := set["updated_at"].(time.Time)
		for i := range s.users {
			if s.users[i].ID != userID {
				continue
			}
			s.users[i].PreferredCurrency = preferredCurrency
			s.users[i].UpdatedAt = updatedAt
			*destination.(*model.User) = s.users[i]
			return nil
		}
		return repository.ErrNotFound
	}
	if collection != "sessions" {
		return repository.ErrNotFound
	}
	for i := range s.sessions {
		if s.sessions[i].ID == filter["_id"] && s.sessions[i].UserID == filter["user_id"] {
			now := time.Now().UTC()
			s.sessions[i].RevokedAt = &now
			*destination.(*model.Session) = s.sessions[i]
			return nil
		}
	}
	return repository.ErrNotFound
}
func (s *authStore) UpdateMany(_ context.Context, collection string, filter, _ repository.Filter) (int64, error) {
	if collection != "sessions" || filter["user_id"] == "" {
		return 0, nil
	}
	var modified int64
	for i := range s.sessions {
		if s.sessions[i].UserID == filter["user_id"] && s.sessions[i].RevokedAt == nil {
			now := time.Now().UTC()
			s.sessions[i].RevokedAt = &now
			modified++
		}
	}
	return modified, nil
}
func (s *authStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	s.transactionRuns++
	return fn(ctx)
}

func TestLoginPropagatesStoreFailures(t *testing.T) {
	dependencyErr := errors.New("database unavailable")
	auth := NewAuthService(&authStore{findOneErr: dependencyErr}, time.Hour)
	_, err := auth.Login(context.Background(), LoginInput{Email: "user@example.com", Password: "irrelevant"}, "", "")
	if !errors.Is(err, dependencyErr) {
		t.Fatalf("expected dependency error, got %v", err)
	}
}

func TestLogoutAllRevokesMoreThanOneBatch(t *testing.T) {
	store := &authStore{}
	for i := 0; i < 205; i++ {
		store.sessions = append(store.sessions, model.Session{ID: newID(), UserID: "user-a"})
	}
	auth := NewAuthService(store, time.Hour)
	if err := auth.LogoutAll(context.Background(), "user-a"); err != nil {
		t.Fatalf("LogoutAll: %v", err)
	}
	for _, session := range store.sessions {
		if session.RevokedAt == nil {
			t.Fatal("active session remained after logout-all")
		}
	}
}

func TestCreateSessionRejectsNonPositiveTTL(t *testing.T) {
	auth := NewAuthService(&authStore{}, 0)
	if _, err := auth.createSession(context.Background(), &model.User{ID: "user-a"}, "", ""); err == nil {
		t.Fatal("non-positive session TTL was accepted")
	}
}

func TestRegisterProvisionsUserWorkspaceMembershipAndSessionAtomically(t *testing.T) {
	store := &authStore{}
	auth := NewAuthService(store, time.Hour)

	result, err := auth.Register(context.Background(), RegisterInput{
		Email:             "new-user@example.test",
		Password:          "a-secure-password",
		Name:              "New User",
		PreferredCurrency: "INR",
		TermsAccepted:     true,
	}, "test-agent", "127.0.0.1")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if result.Token == "" || result.SessionID == "" {
		t.Fatalf("registration did not return a session: %#v", result)
	}
	if store.transactionRuns != 1 {
		t.Fatalf("transaction runs = %d, want 1", store.transactionRuns)
	}
	want := []string{"users", "workspaces", "memberships", "sessions"}
	if !reflect.DeepEqual(store.inserted, want) {
		t.Fatalf("inserted collections = %#v, want %#v", store.inserted, want)
	}
}

func TestUpdatePreferencesPersistsCurrencyAndReturnsUpdatedUser(t *testing.T) {
	store := &authStore{users: []model.User{{
		ID:                "user-a",
		PreferredCurrency: "INR",
	}}}
	auth := NewAuthService(store, time.Hour)

	user, err := auth.UpdatePreferences(
		context.Background(),
		"user-a",
		UpdatePreferencesInput{PreferredCurrency: " usd "},
	)
	if err != nil {
		t.Fatalf("UpdatePreferences: %v", err)
	}
	if user.PreferredCurrency != "USD" || store.users[0].PreferredCurrency != "USD" {
		t.Fatalf("updated user = %#v, stored users = %#v", user, store.users)
	}
}
