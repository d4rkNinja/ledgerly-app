package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

type notificationHandlerStore struct {
	updateOneErr    error
	updateManyCount int64
	unreadCount     int64
}

func (s *notificationHandlerStore) Insert(context.Context, string, any) error { return nil }
func (s *notificationHandlerStore) FindOne(context.Context, string, repository.Filter, any) error {
	return repository.ErrNotFound
}
func (s *notificationHandlerStore) FindMany(
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
func (s *notificationHandlerStore) Aggregate(
	context.Context,
	string,
	repository.Pipeline,
	any,
) error {
	return nil
}
func (s *notificationHandlerStore) UpdateOne(
	_ context.Context,
	_ string,
	filter repository.Filter,
	update repository.Filter,
	destination any,
) error {
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
func (s *notificationHandlerStore) UpdateMany(
	context.Context,
	string,
	repository.Filter,
	repository.Filter,
) (int64, error) {
	return s.updateManyCount, nil
}
func (s *notificationHandlerStore) DeleteOne(context.Context, string, repository.Filter) error {
	return nil
}
func (s *notificationHandlerStore) Count(context.Context, string, repository.Filter) (int64, error) {
	return s.unreadCount, nil
}
func (s *notificationHandlerStore) WithTransaction(
	ctx context.Context,
	fn repository.TransactionFunc,
) (any, error) {
	return fn(ctx)
}
func (s *notificationHandlerStore) CreateFinancialTransaction(
	context.Context,
	*model.Transaction,
	string,
	*time.Time,
	*model.AuditEvent,
) (*model.Transaction, error) {
	return nil, errors.New("not implemented")
}

func notificationRequest(method, target, actorID, notificationID string) *http.Request {
	request := httptest.NewRequest(method, target, nil)
	routeContext := chi.NewRouteContext()
	if notificationID != "" {
		routeContext.URLParams.Add("notificationID", notificationID)
	}
	ctx := context.WithValue(request.Context(), chi.RouteCtxKey, routeContext)
	ctx = context.WithValue(ctx, userContextKey, &model.User{ID: actorID})
	return request.WithContext(ctx)
}

func TestUnreadNotificationCountReturnsDirectUserCount(t *testing.T) {
	store := &notificationHandlerStore{unreadCount: 6}
	finance := service.NewFinanceService(store, nil)
	api := NewAPI(nil, finance, log.New(io.Discard, "", 0), 1024)
	recorder := httptest.NewRecorder()

	api.UnreadNotificationCount(
		recorder,
		notificationRequest(
			http.MethodGet,
			"/api/v1/notifications/unread-count",
			"user-a",
			"",
		),
	)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var result service.NotificationUnreadCountResult
	if err := json.NewDecoder(recorder.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if result.UnreadCount != 6 {
		t.Fatalf("unread count response = %#v", result)
	}
}

func TestMarkNotificationReadReturnsOwnedNotification(t *testing.T) {
	store := &notificationHandlerStore{}
	finance := service.NewFinanceService(store, nil)
	api := NewAPI(nil, finance, log.New(io.Discard, "", 0), 1024)
	recorder := httptest.NewRecorder()

	api.MarkNotificationRead(
		recorder,
		notificationRequest(
			http.MethodPatch,
			"/api/v1/notifications/notification-a/read",
			"user-a",
			"notification-a",
		),
	)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var notification model.Notification
	if err := json.NewDecoder(recorder.Body).Decode(&notification); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if notification.ID != "notification-a" || notification.UserID != "user-a" || notification.ReadAt == nil {
		t.Fatalf("notification response = %#v", notification)
	}
}

func TestMarkNotificationReadUsesStandardNotFoundEnvelope(t *testing.T) {
	store := &notificationHandlerStore{updateOneErr: repository.ErrNotFound}
	finance := service.NewFinanceService(store, nil)
	api := NewAPI(nil, finance, log.New(io.Discard, "", 0), 1024)
	recorder := httptest.NewRecorder()

	api.MarkNotificationRead(
		recorder,
		notificationRequest(
			http.MethodPatch,
			"/api/v1/notifications/another-users-notification/read",
			"user-a",
			"another-users-notification",
		),
	)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body = %s", recorder.Code, http.StatusNotFound, recorder.Body.String())
	}
	var response errorEnvelope
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Error.Code != "not_found" {
		t.Fatalf("error code = %q, want not_found", response.Error.Code)
	}
}

func TestMarkAllNotificationsReadReturnsMutationSummary(t *testing.T) {
	store := &notificationHandlerStore{updateManyCount: 4}
	finance := service.NewFinanceService(store, nil)
	api := NewAPI(nil, finance, log.New(io.Discard, "", 0), 1024)
	recorder := httptest.NewRecorder()

	api.MarkAllNotificationsRead(
		recorder,
		notificationRequest(
			http.MethodPatch,
			"/api/v1/notifications/read-all",
			"user-a",
			"",
		),
	)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var result service.NotificationReadAllResult
	if err := json.NewDecoder(recorder.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if result.UpdatedCount != 4 || result.ReadAt.IsZero() {
		t.Fatalf("mark-all response = %#v", result)
	}
}
