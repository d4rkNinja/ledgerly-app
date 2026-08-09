package handler

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeJSONRequestPolicy(t *testing.T) {
	t.Run("accepts JSON media type parameters", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"ledger"}`))
		request.Header.Set("Content-Type", "application/json; charset=utf-8")
		var destination struct {
			Name string `json:"name"`
		}

		if err := decodeJSON(httptest.NewRecorder(), request, &destination, 1024); err != nil {
			t.Fatalf("decodeJSON() error = %v", err)
		}
		if destination.Name != "ledger" {
			t.Fatalf("decoded name = %q, want ledger", destination.Name)
		}
	})

	t.Run("rejects non JSON content", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"ledger"}`))
		request.Header.Set("Content-Type", "text/plain")

		err := decodeJSON(httptest.NewRecorder(), request, &struct{}{}, 1024)
		if !errors.Is(err, errUnsupportedMediaType) {
			t.Fatalf("decodeJSON() error = %v, want errUnsupportedMediaType", err)
		}
	})

	t.Run("reports oversized content", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"ledger"}`))
		request.Header.Set("Content-Type", "application/json")

		err := decodeJSON(httptest.NewRecorder(), request, &struct{}{}, 4)
		var maxBytesError *http.MaxBytesError
		if !errors.As(err, &maxBytesError) {
			t.Fatalf("decodeJSON() error = %v, want *http.MaxBytesError", err)
		}
	})

	t.Run("rejects multiple JSON values", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{} {}`))
		request.Header.Set("Content-Type", "application/json")

		if err := decodeJSON(httptest.NewRecorder(), request, &struct{}{}, 1024); err == nil {
			t.Fatal("decodeJSON() error = nil, want multiple-value error")
		}
	})
}

func TestWriteJSONNoContentHasNoRepresentationHeaders(t *testing.T) {
	recorder := httptest.NewRecorder()

	writeJSON(recorder, http.StatusNoContent, nil)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "" {
		t.Fatalf("Content-Type = %q, want empty", contentType)
	}
	if recorder.Body.Len() != 0 {
		t.Fatalf("body = %q, want empty", recorder.Body.String())
	}
}
