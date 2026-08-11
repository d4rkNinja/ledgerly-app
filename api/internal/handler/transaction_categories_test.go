package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

func TestTransactionCategoryConflictResponsesAreActionable(t *testing.T) {
	tests := []struct {
		name        string
		err         error
		wantCode    string
		wantMessage string
	}{
		{
			name:        "duplicate name",
			err:         &service.TransactionCategoryDuplicateError{Name: "Food", TransactionType: "expense"},
			wantCode:    "category_name_conflict",
			wantMessage: "already exists",
		},
		{
			name:        "used category",
			err:         &service.TransactionCategoryInUseError{Name: "Food", UsageCount: 3, UsageCountExact: true},
			wantCode:    "category_in_use",
			wantMessage: "used by 3 transactions",
		},
		{
			name:        "used category hidden count",
			err:         &service.TransactionCategoryInUseError{Name: "Food", UsageCount: 1},
			wantCode:    "category_in_use",
			wantMessage: "is in use",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			api := NewAPI(nil, nil, nil, 1024)
			api.transactionCategoryError(response, test.err)
			if response.Code != http.StatusConflict {
				t.Fatalf("status = %d, want %d", response.Code, http.StatusConflict)
			}
			var body errorEnvelope
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if body.Error.Code != test.wantCode || !strings.Contains(body.Error.Message, test.wantMessage) {
				t.Fatalf("error = %#v", body.Error)
			}
		})
	}
}
