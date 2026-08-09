package router

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/handler"
)

type errorResponse struct {
	Error struct {
		Code string `json:"code"`
	} `json:"error"`
}

func TestBillsRouteIsRegisteredReadOnly(t *testing.T) {
	api := handler.NewAPI(nil, nil, nil, 1024)
	routes, ok := NewWithOptions(
		api,
		handler.NewHealthHandler(nil, nil),
		Options{},
	).(chi.Routes)
	if !ok {
		t.Fatal("router does not expose route matching")
	}

	got := allowedMethods(routes, "/api/v1/workspaces/workspace-a/bills")
	if len(got) != 1 || got[0] != http.MethodGet {
		t.Fatalf("allowed methods = %#v, want [GET]", got)
	}
}

func TestRouterReturnsJSONForNotFoundAndMethodNotAllowed(t *testing.T) {
	var logs bytes.Buffer
	router := NewWithOptions(nil, nil, Options{Logger: log.New(&logs, "", 0)})
	tests := []struct {
		name       string
		method     string
		target     string
		wantStatus int
		wantCode   string
	}{
		{
			name:       "not found",
			method:     http.MethodGet,
			target:     "/missing",
			wantStatus: http.StatusNotFound,
			wantCode:   "not_found",
		},
		{
			name:       "method not allowed",
			method:     http.MethodPost,
			target:     "/health",
			wantStatus: http.StatusMethodNotAllowed,
			wantCode:   "method_not_allowed",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			logs.Reset()
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(test.method, test.target, nil))

			if recorder.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body = %s", recorder.Code, test.wantStatus, recorder.Body.String())
			}
			var response errorResponse
			if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if response.Error.Code != test.wantCode {
				t.Fatalf("error code = %q, want %q", response.Error.Code, test.wantCode)
			}
			if test.wantStatus == http.StatusMethodNotAllowed && recorder.Header().Get("Allow") != http.MethodGet {
				t.Fatalf("Allow = %q, want GET", recorder.Header().Get("Allow"))
			}
			if !strings.Contains(logs.String(), "status="+strconv.Itoa(test.wantStatus)) {
				t.Fatalf("access log = %q, want status %d", logs.String(), test.wantStatus)
			}
			if recorder.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("sensitive response is missing no-store cache policy")
			}
		})
	}
}

func TestPanicRecoveryReturnsJSONAndIsAccessLogged(t *testing.T) {
	var logs bytes.Buffer
	logger := log.New(&logs, "", 0)
	var transport http.Handler = http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	})
	transport = securityHeaders(transport)
	transport = panicRecovery(logger)(transport)
	transport = requestLogger(logger)(transport)
	transport = middleware.RequestID(transport)

	recorder := httptest.NewRecorder()
	transport.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/panic", nil))

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}
	if contentType := recorder.Header().Get("Content-Type"); !strings.HasPrefix(contentType, "application/json") {
		t.Fatalf("Content-Type = %q, want JSON", contentType)
	}
	if recorder.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("panic response lost security headers")
	}
	var response errorResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Error.Code != "internal_error" {
		t.Fatalf("error code = %q, want internal_error", response.Error.Code)
	}
	if !strings.Contains(logs.String(), "request panic") || !strings.Contains(logs.String(), "status=500") {
		t.Fatalf("logs = %q, want panic and access entries", logs.String())
	}
}
