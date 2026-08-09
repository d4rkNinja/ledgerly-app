package handler

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestQueryParsersPreserveAbsentDefaults(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/", nil)

	limit, err := intQuery(request, "limit", 30, 1, 100)
	if err != nil || limit != 30 {
		t.Fatalf("absent limit = (%d, %v), want (30, nil)", limit, err)
	}
	skip, err := intQuery(request, "skip", 0, 0, maximumLegacySkip)
	if err != nil || skip != 0 {
		t.Fatalf("absent skip = (%d, %v), want (0, nil)", skip, err)
	}
	if value, present, err := timeQuery(request, "from"); err != nil || present || !value.IsZero() {
		t.Fatalf("absent from = (%s, %v, %v), want zero, false, nil", value, present, err)
	}
}

func TestDashboardAllTimeQueryIsExplicitAndUnbounded(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/a/dashboard?allTime=true", nil)
	filter, present, err := dashboardFilterQuery(request)
	if err != nil || !present || !filter.AllTime || filter.Month != nil || filter.From != nil || filter.To != nil {
		t.Fatalf("dashboard all-time filter = %#v, present=%t, err=%v", filter, present, err)
	}
	if _, _, err := dashboardFilterQuery(httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/a/dashboard?allTime=true&month=2026-07", nil)); err == nil {
		t.Fatal("allTime combined with month should be rejected")
	}
	if _, _, err := dashboardFilterQuery(httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/a/dashboard?allTime=maybe", nil)); err == nil {
		t.Fatal("invalid allTime value should be rejected")
	}
}

func TestDashboardRejectsInvalidMonthAsBadRequestFieldValidation(t *testing.T) {
	api := &API{logger: log.New(io.Discard, "", 0)}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/a/dashboard?month=2026-13", nil)
	recorder := httptest.NewRecorder()

	api.Dashboard(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body = %s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
	}
	var response errorEnvelope
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if _, ok := response.Error.Fields["month"]; !ok {
		t.Fatalf("fields = %#v, want month validation error", response.Error.Fields)
	}
}

func TestHandlersRejectMalformedQueryValuesBeforeCallingServices(t *testing.T) {
	api := &API{logger: log.New(io.Discard, "", 0)}
	tests := []struct {
		name   string
		target string
		field  string
		invoke func(http.ResponseWriter, *http.Request)
	}{
		{
			name:   "transaction from",
			target: "/api/v1/workspaces/a/transactions?from=not-a-date",
			field:  "from",
			invoke: api.Transactions,
		},
		{
			name:   "report to",
			target: "/api/v1/workspaces/a/reports/summary?to=not-a-date",
			field:  "to",
			invoke: api.Report,
		},
		{
			name:   "notification limit",
			target: "/api/v1/notifications?limit=lots",
			field:  "limit",
			invoke: api.Notifications,
		},
		{
			name:   "audit negative skip",
			target: "/api/v1/workspaces/a/audit?skip=-1",
			field:  "skip",
			invoke: api.Audit,
		},
		{
			name:   "transaction excessive limit",
			target: "/api/v1/workspaces/a/transactions?limit=101",
			field:  "limit",
			invoke: api.Transactions,
		},
		{
			name:   "transaction excessive skip",
			target: "/api/v1/workspaces/a/transactions?skip=100001",
			field:  "skip",
			invoke: api.Transactions,
		},
		{
			name:   "budget malformed pagination",
			target: "/api/v1/workspaces/a/budgets?limit=all",
			field:  "limit",
			invoke: api.Budgets,
		},
		{
			name:   "bill malformed pagination",
			target: "/api/v1/workspaces/a/bills?skip=tomorrow",
			field:  "skip",
			invoke: api.Bills,
		},
		{
			name:   "goal excessive pagination",
			target: "/api/v1/workspaces/a/goals?skip=100001",
			field:  "skip",
			invoke: api.Goals,
		},
		{
			name:   "claim negative pagination",
			target: "/api/v1/workspaces/a/claims?skip=-1",
			field:  "skip",
			invoke: api.Claims,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, test.target, nil)
			recorder := httptest.NewRecorder()

			test.invoke(recorder, request)

			if recorder.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d, want %d; body = %s", recorder.Code, http.StatusUnprocessableEntity, recorder.Body.String())
			}
			var response errorEnvelope
			if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if _, ok := response.Error.Fields[test.field]; !ok {
				t.Fatalf("fields = %#v, want %q validation error", response.Error.Fields, test.field)
			}
		})
	}
}
