package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

type failingAuthStore struct {
	findOneErr error
}

func (s *failingAuthStore) Insert(context.Context, string, any) error { return nil }
func (s *failingAuthStore) FindOne(context.Context, string, repository.Filter, any) error {
	return s.findOneErr
}
func (s *failingAuthStore) FindMany(context.Context, string, repository.Filter, any, int64, int64, repository.Sort) error {
	return nil
}
func (s *failingAuthStore) Aggregate(context.Context, string, repository.Pipeline, any) error {
	return nil
}
func (s *failingAuthStore) UpdateOne(context.Context, string, repository.Filter, repository.Filter, any) error {
	return nil
}
func (s *failingAuthStore) UpdateMany(context.Context, string, repository.Filter, repository.Filter) (int64, error) {
	return 0, nil
}
func (s *failingAuthStore) DeleteOne(context.Context, string, repository.Filter) error {
	return nil
}
func (s *failingAuthStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return 0, nil
}
func (s *failingAuthStore) CreateFinancialTransaction(context.Context, *model.Transaction, string, *time.Time, *model.AuditEvent) (*model.Transaction, error) {
	return nil, nil
}
func (s *failingAuthStore) WithTransaction(_ context.Context, fn repository.TransactionFunc) (any, error) {
	return fn(context.Background())
}

func TestAuthenticatePreservesDependencyErrors(t *testing.T) {
	tests := []struct {
		name       string
		storeError error
		wantStatus int
		wantCode   string
	}{
		{
			name:       "invalid session remains unauthorized",
			storeError: repository.ErrNotFound,
			wantStatus: http.StatusUnauthorized,
			wantCode:   "unauthorized",
		},
		{
			name:       "dependency failure is internal error",
			storeError: errors.New("database unavailable"),
			wantStatus: http.StatusInternalServerError,
			wantCode:   "internal_error",
		},
		{
			name:       "deadline is gateway timeout",
			storeError: context.DeadlineExceeded,
			wantStatus: http.StatusGatewayTimeout,
			wantCode:   "request_timeout",
		},
		{
			name:       "cancellation is request timeout",
			storeError: context.Canceled,
			wantStatus: http.StatusRequestTimeout,
			wantCode:   "request_canceled",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			auth := service.NewAuthService(&failingAuthStore{findOneErr: test.storeError}, time.Hour)
			api := NewAPI(auth, nil, log.New(io.Discard, "", 0), 1024)
			request := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
			request.Header.Set("Authorization", "Bearer "+strings.Repeat("A", 43))
			recorder := httptest.NewRecorder()

			api.Authenticate(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
				t.Fatal("request with failed authentication reached protected handler")
			})).ServeHTTP(recorder, request)

			if recorder.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body = %s", recorder.Code, test.wantStatus, recorder.Body.String())
			}
			var response errorEnvelope
			if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if response.Error.Code != test.wantCode {
				t.Fatalf("error code = %q, want %q", response.Error.Code, test.wantCode)
			}
		})
	}
}
