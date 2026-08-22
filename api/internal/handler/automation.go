package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

func (a *API) CreateImportSession(w http.ResponseWriter, r *http.Request) {
	var input service.ImportSessionInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateImportSession(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}

func (a *API) ImportSessions(w http.ResponseWriter, r *http.Request) {
	limit, skip, ok := a.pagination(w, r)
	if !ok {
		return
	}
	items, err := a.finance.ListImportSessions(r.Context(), workspaceID(r), currentUser(r).ID, r.URL.Query().Get("status"), limit, skip)
	a.writeItems(w, items, err)
}

func (a *API) ImportSession(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.GetImportSession(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "importSessionID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) UpdateImportSession(w http.ResponseWriter, r *http.Request) {
	var input service.ImportSessionInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.UpdateImportSession(
		r.Context(),
		workspaceID(r),
		currentUser(r).ID,
		chi.URLParam(r, "importSessionID"),
		input,
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) ResolveImportRows(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Resolutions []service.ImportRowResolution `json:"resolutions"`
	}
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.ResolveImportRows(
		r.Context(),
		workspaceID(r),
		currentUser(r).ID,
		chi.URLParam(r, "importSessionID"),
		input.Resolutions,
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) CommitImportSession(w http.ResponseWriter, r *http.Request) {
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(idempotencyKey) < 8 || len(idempotencyKey) > 128 {
		a.serviceError(w, &service.FieldError{Field: "Idempotency-Key", Message: "header must contain 8 to 128 characters"})
		return
	}
	item, err := a.finance.CommitImportSession(
		r.Context(),
		workspaceID(r),
		currentUser(r).ID,
		chi.URLParam(r, "importSessionID"),
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) CancelImportSession(w http.ResponseWriter, r *http.Request) {
	err := a.finance.CancelImportSession(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "importSessionID"))
	if err != nil {
		if errors.Is(err, service.ErrConflict) {
			writeError(w, http.StatusConflict, "conflict", "only draft imports can be cancelled", nil)
			return
		}
		a.serviceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) ListAutomationRules(w http.ResponseWriter, r *http.Request) {
	items, err := a.finance.ListAutomationRules(r.Context(), workspaceID(r), currentUser(r).ID)
	a.writeItems(w, items, err)
}

func (a *API) CreateAutomationRule(w http.ResponseWriter, r *http.Request) {
	var input service.AutomationRuleInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateAutomationRule(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}

func (a *API) UpdateAutomationRule(w http.ResponseWriter, r *http.Request) {
	var input service.AutomationRuleInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.UpdateAutomationRule(
		r.Context(),
		workspaceID(r),
		currentUser(r).ID,
		chi.URLParam(r, "ruleID"),
		input,
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) DeleteAutomationRule(w http.ResponseWriter, r *http.Request) {
	err := a.finance.DeleteAutomationRule(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "ruleID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) PreviewAutomationRule(w http.ResponseWriter, r *http.Request) {
	var input struct {
		service.AutomationRuleInput
		From string `json:"from"`
		To   string `json:"to"`
	}
	if !a.decode(w, r, &input) {
		return
	}
	fromTime, toTime, parseErr := parseOptionalDateRangeBody(input.From, input.To)
	if parseErr != nil {
		a.serviceError(w, parseErr)
		return
	}
	result, err := a.finance.PreviewAutomationRule(r.Context(), workspaceID(r), currentUser(r).ID, input.AutomationRuleInput, fromTime, toTime)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (a *API) RunAutomationRules(w http.ResponseWriter, r *http.Request) {
	var input struct {
		TransactionIDs []string `json:"transactionIds"`
	}
	if !a.decode(w, r, &input) {
		return
	}
	result, err := a.finance.RunAutomationRules(r.Context(), workspaceID(r), currentUser(r).ID, input.TransactionIDs)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (a *API) ReconciliationPreviewHandler(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	input := service.ReconciliationPreviewInput{StatementDate: query.Get("statementDate")}
	if raw := query.Get("statementBalanceMinor"); raw != "" {
		value, err := optionalAmountMinorQuery(r, "statementBalanceMinor")
		if err != nil {
			a.serviceError(w, err)
			return
		}
		if value == nil {
			writeError(w, http.StatusUnprocessableEntity, "validation_failed", "request validation failed", map[string]string{
				"statementBalanceMinor": "must be a whole number of minor currency units",
			})
			return
		}
		input.StatementBalanceMinor = value
	}
	item, err := a.finance.ReconciliationPreview(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "accountID"), input)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) CompleteReconciliation(w http.ResponseWriter, r *http.Request) {
	var input service.ReconciliationCompleteInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CompleteReconciliation(
		r.Context(),
		workspaceID(r),
		currentUser(r).ID,
		chi.URLParam(r, "accountID"),
		input,
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *API) Reconciliations(w http.ResponseWriter, r *http.Request) {
	limit, skip, ok := a.pagination(w, r)
	if !ok {
		return
	}
	items, err := a.finance.ListReconciliations(
		r.Context(),
		workspaceID(r),
		currentUser(r).ID,
		r.URL.Query().Get("accountId"),
		limit,
		skip,
	)
	a.writeItems(w, items, err)
}

func (a *API) Forecast(w http.ResponseWriter, r *http.Request) {
	var input service.ForecastInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.Forecast(r.Context(), workspaceID(r), currentUser(r).ID, input)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) Attention(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.Attention(r.Context(), workspaceID(r), currentUser(r).ID)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func parseOptionalDateRangeBody(from, to string) (*time.Time, *time.Time, error) {
	parseOne := func(field, raw string) (*time.Time, error) {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			return nil, nil
		}
		parsed, err := time.Parse("2006-01-02", raw)
		if err != nil || parsed.Format("2006-01-02") != raw {
			return nil, &service.FieldError{Field: field, Message: "must be a YYYY-MM-DD calendar date"}
		}
		value := parsed.UTC()
		return &value, nil
	}
	fromTime, err := parseOne("from", from)
	if err != nil {
		return nil, nil, err
	}
	toTime, err := parseOne("to", to)
	if err != nil {
		return nil, nil, err
	}
	return fromTime, toTime, nil
}
