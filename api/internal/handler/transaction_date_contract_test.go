package handler

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCreateTransactionRequiresExplicitValidOccurredAt(t *testing.T) {
	api := NewAPI(nil, nil, log.New(io.Discard, "", 0), 2048)
	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
		wantField  string
	}{
		{
			name:       "invalid date",
			body:       `{"occurredAt":"not-a-date"}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "invalid_json",
		},
		{
			name:       "missing date",
			body:       `{}`,
			wantStatus: http.StatusUnprocessableEntity,
			wantCode:   "validation_failed",
			wantField:  "occurredAt",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/transactions", strings.NewReader(test.body))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()

			api.CreateTransaction(recorder, request)

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
			if test.wantField != "" {
				if _, ok := response.Error.Fields[test.wantField]; !ok {
					t.Fatalf("fields = %#v, want %q validation error", response.Error.Fields, test.wantField)
				}
			}
		})
	}
}
