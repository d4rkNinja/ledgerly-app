package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCORSPassesBodylessPost(t *testing.T) {
	called := false
	handler := cors([]string{"https://app.example.test"})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodPost, "/logout", nil)
	request.Header.Set("Origin", "https://app.example.test")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if !called {
		t.Fatal("bodyless POST did not reach its handler")
	}
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
	if exposed := recorder.Header().Get("Access-Control-Expose-Headers"); !strings.Contains(exposed, "Content-Disposition") || !strings.Contains(exposed, "X-Request-ID") {
		t.Fatalf("Access-Control-Expose-Headers = %q", exposed)
	}
}

func TestCORSPreflightPolicy(t *testing.T) {
	handler := cors([]string{"https://app.example.test"})(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("preflight reached application handler")
	}))

	t.Run("allows declared method and headers", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodOptions, "/api/v1/workspaces", nil)
		request.Header.Set("Origin", "https://app.example.test")
		request.Header.Set("Access-Control-Request-Method", http.MethodPost)
		request.Header.Set("Access-Control-Request-Headers", "authorization, content-type")
		recorder := httptest.NewRecorder()

		handler.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNoContent)
		}
		if recorder.Header().Get("Access-Control-Allow-Origin") != "https://app.example.test" {
			t.Fatal("allowed origin was not reflected")
		}
		if !strings.Contains(strings.Join(recorder.Header().Values("Vary"), ","), "Access-Control-Request-Headers") {
			t.Fatalf("Vary = %#v, want request headers", recorder.Header().Values("Vary"))
		}
	})

	t.Run("rejects undeclared headers", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodOptions, "/api/v1/workspaces", nil)
		request.Header.Set("Origin", "https://app.example.test")
		request.Header.Set("Access-Control-Request-Method", http.MethodPost)
		request.Header.Set("Access-Control-Request-Headers", "X-Unsafe-Header")
		recorder := httptest.NewRecorder()

		handler.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
		}
	})

	t.Run("rejects missing requested method", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodOptions, "/api/v1/workspaces", nil)
		request.Header.Set("Origin", "https://app.example.test")
		recorder := httptest.NewRecorder()

		handler.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
		}
	})
}

func TestRequestTimeoutReturnsSingleJSONError(t *testing.T) {
	handler := requestTimeout(time.Millisecond)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

	if recorder.Code != http.StatusGatewayTimeout {
		t.Fatalf("status = %d, want %d; body = %s", recorder.Code, http.StatusGatewayTimeout, recorder.Body.String())
	}
	var response struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode timeout response: %v", err)
	}
	if response.Error.Code != "request_timeout" {
		t.Fatalf("error code = %q, want request_timeout", response.Error.Code)
	}
}
