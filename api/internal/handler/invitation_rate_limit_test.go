package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

func TestAcceptInvitationRateLimitUsesUserAndClientIP(t *testing.T) {
	api := NewAPI(nil, nil, nil, 1024)
	api.rateLimiter = newRateLimiter(1, time.Minute)

	request := func(userID, remoteAddress string) *http.Request {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/invitations/accept", strings.NewReader("{"))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = remoteAddress
		ctx := context.WithValue(req.Context(), userContextKey, &model.User{ID: userID})
		return req.WithContext(ctx)
	}

	assertStatus := func(t *testing.T, recorder *httptest.ResponseRecorder, want int) {
		t.Helper()
		if recorder.Code != want {
			t.Fatalf("status = %d, want %d; body = %s", recorder.Code, want, recorder.Body.String())
		}
	}

	first := httptest.NewRecorder()
	api.AcceptInvitation(first, request("user-a", "198.51.100.10:41000"))
	assertStatus(t, first, http.StatusBadRequest)

	blocked := httptest.NewRecorder()
	api.AcceptInvitation(blocked, request("user-a", "198.51.100.10:41001"))
	assertStatus(t, blocked, http.StatusTooManyRequests)
	if blocked.Header().Get("Retry-After") == "" {
		t.Fatal("rate-limited response is missing Retry-After")
	}
	var response errorEnvelope
	if err := json.NewDecoder(blocked.Body).Decode(&response); err != nil {
		t.Fatalf("decode rate-limit response: %v", err)
	}
	if response.Error.Code != "rate_limited" {
		t.Fatalf("error code = %q, want rate_limited", response.Error.Code)
	}

	differentIP := httptest.NewRecorder()
	api.AcceptInvitation(differentIP, request("user-a", "203.0.113.20:41000"))
	assertStatus(t, differentIP, http.StatusBadRequest)

	differentUser := httptest.NewRecorder()
	api.AcceptInvitation(differentUser, request("user-b", "198.51.100.10:41000"))
	assertStatus(t, differentUser, http.StatusBadRequest)
}
