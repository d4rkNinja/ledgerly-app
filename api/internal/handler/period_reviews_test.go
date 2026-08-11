package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

type periodReviewHandlerStore struct {
	*frontendContractStore
	workspace    model.Workspace
	vaults       []model.Vault
	accounts     []model.Account
	transactions []model.Transaction
	review       *model.PeriodReview
	revisions    []model.AuditEvent
}

func (s *periodReviewHandlerStore) Insert(ctx context.Context, collection string, document any) error {
	if collection == "period_reviews" {
		if s.review != nil {
			return repository.ErrConflict
		}
		review := *document.(*model.PeriodReview)
		s.review = &review
		return nil
	}
	return s.frontendContractStore.Insert(ctx, collection, document)
}

func (s *periodReviewHandlerStore) FindOne(ctx context.Context, collection string, filter repository.Filter, destination any) error {
	switch collection {
	case "workspaces":
		if filter["_id"] != s.workspace.ID {
			return repository.ErrNotFound
		}
		*destination.(*model.Workspace) = s.workspace
		return nil
	case "period_reviews":
		if s.review == nil || filter["_id"] != s.review.ID || filter["created_by"] != s.review.CreatedBy || filter["scope_actor_id"] != s.review.ScopeActorID {
			return repository.ErrNotFound
		}
		*destination.(*model.PeriodReview) = *s.review
		return nil
	default:
		return s.frontendContractStore.FindOne(ctx, collection, filter, destination)
	}
}

func (s *periodReviewHandlerStore) FindMany(ctx context.Context, collection string, filter repository.Filter, destination any, limit, skip int64, sort repository.Sort) error {
	switch collection {
	case "vaults":
		*destination.(*[]model.Vault) = append([]model.Vault(nil), s.vaults...)
	case "accounts":
		*destination.(*[]model.Account) = append([]model.Account(nil), s.accounts...)
	case "transactions":
		*destination.(*[]model.Transaction) = append([]model.Transaction(nil), s.transactions...)
	case "period_reviews":
		if s.review != nil {
			*destination.(*[]model.PeriodReview) = []model.PeriodReview{*s.review}
		}
	case "audit_events":
		*destination.(*[]model.AuditEvent) = append([]model.AuditEvent(nil), s.revisions...)
	case "users":
		*destination.(*[]model.User) = append([]model.User(nil), s.users...)
	default:
		return s.frontendContractStore.FindMany(ctx, collection, filter, destination, limit, skip, sort)
	}
	return nil
}

func (s *periodReviewHandlerStore) UpdateOne(ctx context.Context, collection string, filter, update repository.Filter, destination any) error {
	if collection != "workspaces" {
		return s.frontendContractStore.UpdateOne(ctx, collection, filter, update, destination)
	}
	if filter["_id"] != s.workspace.ID {
		return repository.ErrNotFound
	}
	s.workspace.LedgerVersion++
	*destination.(*model.Workspace) = s.workspace
	return nil
}

func newPeriodReviewHandlerAPI() (*API, *periodReviewHandlerStore) {
	occurredAt := time.Date(2026, time.July, 10, 12, 0, 0, 0, time.UTC)
	base := &frontendContractStore{
		users: []model.User{{ID: "user-a", Name: "Asha Rao"}},
		memberships: []model.Membership{{
			WorkspaceID: "workspace-a", UserID: "user-a",
			Permissions: []string{model.PermViewBalances, model.PermViewTransactions},
		}},
	}
	store := &periodReviewHandlerStore{
		frontendContractStore: base,
		workspace:             model.Workspace{ID: "workspace-a", Currency: "INR", LedgerVersion: 3},
		vaults: []model.Vault{{
			ID: "vault-a", WorkspaceID: "workspace-a", OwnerID: "user-a", Currency: "INR", Privacy: "workspace",
		}},
		accounts: []model.Account{{
			ID: "account-a", WorkspaceID: "workspace-a", VaultID: "vault-a", OwnerID: "user-a", Currency: "INR", Privacy: "workspace",
		}},
		transactions: []model.Transaction{{
			ID: "transaction-a", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
			CreatedBy: "user-a", Type: "expense", AmountMinor: 1250, Currency: "INR", Privacy: "workspace",
			OccurredAt: occurredAt, CreatedAt: occurredAt, UpdatedAt: occurredAt,
		}},
	}
	finance := service.NewFinanceService(store, service.NewAccessService(store))
	return NewAPI(nil, finance, nil, 4096), store
}

func periodReviewHandlerRequest(method, target, body, reviewID string) *http.Request {
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("workspaceID", "workspace-a")
	if reviewID != "" {
		routeContext.URLParams.Add("reviewID", reviewID)
	}
	ctx := context.WithValue(request.Context(), chi.RouteCtxKey, routeContext)
	ctx = context.WithValue(ctx, userContextKey, &model.User{ID: "user-a"})
	return request.WithContext(ctx)
}

func decodeHandlerJSON(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var response map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response %q: %v", recorder.Body.String(), err)
	}
	return response
}

func assertHandlerError(t *testing.T, recorder *httptest.ResponseRecorder, status int, code, field string) {
	t.Helper()
	if recorder.Code != status {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, status, recorder.Body.String())
	}
	response := decodeHandlerJSON(t, recorder)
	detail, ok := response["error"].(map[string]any)
	if !ok || detail["code"] != code {
		t.Fatalf("error = %#v, want code %q", response, code)
	}
	if field != "" {
		fields, ok := detail["fields"].(map[string]any)
		if !ok || fields[field] == nil {
			t.Fatalf("error fields = %#v, want safe field %q", detail["fields"], field)
		}
	}
	if strings.Contains(recorder.Body.String(), "sensitive") {
		t.Fatalf("error leaked internal detail: %s", recorder.Body.String())
	}
}

func TestCreatePeriodReviewHandlerDecodesValidJSONAndReturnsSnapshotShape(t *testing.T) {
	api, store := newPeriodReviewHandlerAPI()
	recorder := httptest.NewRecorder()
	request := periodReviewHandlerRequest(http.MethodPost, "/api/v1/workspaces/workspace-a/period-reviews", `{
		"from":"2026-07-01","to":"2026-07-31","timezone":"UTC","status":"closed"
	}`, "")
	api.CreatePeriodReview(recorder, request)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", recorder.Code, recorder.Body.String())
	}
	response := decodeHandlerJSON(t, recorder)
	snapshot, ok := response["snapshot"].(map[string]any)
	if !ok || snapshot["spendingMinor"] != float64(1250) || snapshot["transactionCount"] != float64(1) {
		t.Fatalf("snapshot response = %#v", response)
	}
	if response["status"] != "closed" || response["delta"] == nil || response["changeCount"] != float64(0) || response["changedAfterClose"] != false {
		t.Fatalf("review response shape = %#v", response)
	}
	if store.review == nil || store.review.CutoffLedgerVersion != 4 {
		t.Fatalf("persisted review = %#v", store.review)
	}
}

func TestCreatePeriodReviewHandlerReturnsSafeDecodeAndValidationEnvelopes(t *testing.T) {
	tests := []struct {
		name, body, contentType, code, field string
		status                               int
	}{
		{name: "unknown JSON field", body: `{"from":"2026-07-01","to":"2026-07-31","timezone":"UTC","status":"closed","sensitive":true}`, contentType: "application/json", status: http.StatusBadRequest, code: "invalid_json"},
		{name: "unsupported media", body: `{}`, contentType: "text/plain", status: http.StatusUnsupportedMediaType, code: "unsupported_media_type"},
		{name: "unsupported status", body: `{"from":"2026-07-01","to":"2026-07-31","timezone":"UTC","status":"draft"}`, contentType: "application/json", status: http.StatusUnprocessableEntity, code: "validation_failed", field: "status"},
		{name: "server local timezone", body: `{"from":"2026-07-01","to":"2026-07-31","timezone":"Local","status":"closed"}`, contentType: "application/json", status: http.StatusUnprocessableEntity, code: "validation_failed", field: "timezone"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			api, _ := newPeriodReviewHandlerAPI()
			recorder := httptest.NewRecorder()
			request := periodReviewHandlerRequest(http.MethodPost, "/api/v1/workspaces/workspace-a/period-reviews", test.body, "")
			request.Header.Set("Content-Type", test.contentType)
			api.CreatePeriodReview(recorder, request)
			assertHandlerError(t, recorder, test.status, test.code, test.field)
		})
	}
}

func TestPeriodReviewsHandlerValidatesQueryAndReturnsItemsShape(t *testing.T) {
	api, store := newPeriodReviewHandlerAPI()
	for _, test := range []struct {
		name, query, field string
	}{
		{name: "server local timezone", query: "?from=2026-07-01&to=2026-07-31&timezone=Local", field: "timezone"},
		{name: "invalid from date", query: "?from=2026-07-32&to=2026-07-31&timezone=UTC", field: "from"},
		{name: "missing to date", query: "?from=2026-07-01&timezone=UTC", field: "to"},
	} {
		t.Run(test.name, func(t *testing.T) {
			invalid := httptest.NewRecorder()
			api.PeriodReviews(invalid, periodReviewHandlerRequest(http.MethodGet, "/api/v1/workspaces/workspace-a/period-reviews"+test.query, "", ""))
			assertHandlerError(t, invalid, http.StatusUnprocessableEntity, "validation_failed", test.field)
		})
	}

	created := httptest.NewRecorder()
	api.CreatePeriodReview(created, periodReviewHandlerRequest(http.MethodPost, "/api/v1/workspaces/workspace-a/period-reviews", `{"from":"2026-07-01","to":"2026-07-31","timezone":"UTC","status":"closed"}`, ""))
	store.revisions = []model.AuditEvent{{
		ID: "revision-a", WorkspaceID: "workspace-a", ActorID: "user-a", EntityType: "transaction", EntityID: "transaction-a", LedgerVersion: 5,
		Before:    &model.TransactionRevisionSnapshot{ID: "transaction-a", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", CreatedBy: "user-a", Type: "expense", AmountMinor: 1250, Currency: "INR", Privacy: "workspace", OccurredAt: time.Date(2026, time.July, 10, 12, 0, 0, 0, time.UTC)},
		After:     &model.TransactionRevisionSnapshot{ID: "transaction-a", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", CreatedBy: "user-a", Type: "expense", AmountMinor: 1500, Currency: "INR", Privacy: "workspace", OccurredAt: time.Date(2026, time.July, 10, 12, 0, 0, 0, time.UTC)},
		CreatedAt: time.Date(2026, time.August, 1, 12, 0, 0, 0, time.UTC),
	}}
	recorder := httptest.NewRecorder()
	api.PeriodReviews(recorder, periodReviewHandlerRequest(http.MethodGet, "/api/v1/workspaces/workspace-a/period-reviews?from=2026-07-01&to=2026-07-31&timezone=UTC", "", ""))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	items, ok := decodeHandlerJSON(t, recorder)["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("items response = %s", recorder.Body.String())
	}
	item := items[0].(map[string]any)
	if item["changeCount"] != float64(1) || item["changedAfterClose"] != true {
		t.Fatalf("period review item = %#v", item)
	}
}

func TestPeriodReviewChangesHandlerValidatesPaginationAndReturnsRevisionShape(t *testing.T) {
	api, store := newPeriodReviewHandlerAPI()
	store.review = &model.PeriodReview{
		ID: "review-a", WorkspaceID: "workspace-a", CreatedBy: "user-a", ScopeActorID: "user-a", Status: "closed",
		Currency: "INR", VaultIDs: []string{"vault-a"}, AccountIDs: []string{"account-a"},
		FromUTC: time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC), ToUTCExclusive: time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC), CutoffLedgerVersion: 4,
	}
	store.revisions = []model.AuditEvent{{
		WorkspaceID: "workspace-a", ActorID: "user-a", LedgerVersion: 5,
		After:     &model.TransactionRevisionSnapshot{ID: "transaction-b", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", CreatedBy: "user-a", Type: "income", AmountMinor: 500, Currency: "INR", Privacy: "workspace", OccurredAt: time.Date(2026, time.July, 20, 0, 0, 0, 0, time.UTC)},
		CreatedAt: time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC),
	}}
	for _, query := range []string{"?limit=0", "?skip=-1", "?limit=not-a-number"} {
		recorder := httptest.NewRecorder()
		api.PeriodReviewChanges(recorder, periodReviewHandlerRequest(http.MethodGet, "/changes"+query, "", "review-a"))
		assertHandlerError(t, recorder, http.StatusUnprocessableEntity, "validation_failed", strings.TrimPrefix(strings.Split(query, "=")[0], "?"))
	}
	recorder := httptest.NewRecorder()
	api.PeriodReviewChanges(recorder, periodReviewHandlerRequest(http.MethodGet, "/changes?limit=10&skip=0", "", "review-a"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	items, ok := decodeHandlerJSON(t, recorder)["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("changes response = %s", recorder.Body.String())
	}
	change := items[0].(map[string]any)
	if change["action"] != "added" || change["ledgerVersion"] != float64(5) || change["approvalState"] != "not_applicable" || change["revisionState"] != "committed" || change["after"] == nil {
		t.Fatalf("change response shape = %#v", change)
	}
}

var _ repository.Store = (*periodReviewHandlerStore)(nil)
