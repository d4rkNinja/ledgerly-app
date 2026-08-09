package handler

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

type contextKey string

const (
	userContextKey    contextKey = "user"
	sessionContextKey contextKey = "session"
	maximumLegacySkip            = int64(100_000)
)

type API struct {
	auth         *service.AuthService
	finance      *service.FinanceService
	logger       *log.Logger
	maxBodyBytes int64
	rateLimiter  *rateLimiter
}

func NewAPI(auth *service.AuthService, finance *service.FinanceService, logger *log.Logger, maxBodyBytes int64) *API {
	return &API{
		auth:         auth,
		finance:      finance,
		logger:       logger,
		maxBodyBytes: maxBodyBytes,
		rateLimiter:  newRateLimiter(10, time.Minute),
	}
}

func (a *API) decode(w http.ResponseWriter, r *http.Request, destination any) bool {
	if err := decodeJSON(w, r, destination, a.maxBodyBytes); err != nil {
		var maxBytesError *http.MaxBytesError
		switch {
		case errors.Is(err, errUnsupportedMediaType):
			writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "content type must be application/json", nil)
		case errors.As(err, &maxBytesError):
			writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "request body is too large", nil)
		default:
			writeError(w, http.StatusBadRequest, "invalid_json", "request body is invalid", nil)
		}
		return false
	}
	return true
}

func (a *API) writeCreated(w http.ResponseWriter, item any, err error) {
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *API) writeItems(w http.ResponseWriter, items any, err error) {
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, itemsResponse(items))
}

func (a *API) serviceError(w http.ResponseWriter, err error) {
	var fieldErr *service.FieldError
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		writeError(w, http.StatusGatewayTimeout, "request_timeout", "the request timed out", nil)
	case errors.Is(err, context.Canceled):
		writeError(w, http.StatusRequestTimeout, "request_canceled", "the request was canceled", nil)
	case errors.As(err, &fieldErr):
		writeError(w, http.StatusUnprocessableEntity, "validation_failed", "request validation failed", map[string]string{fieldErr.Field: fieldErr.Message})
	case errors.Is(err, service.ErrUnauthorized):
		writeError(w, http.StatusUnauthorized, "unauthorized", "email or password is incorrect", nil)
	case errors.Is(err, service.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "you do not have permission to perform this action", nil)
	case errors.Is(err, service.ErrNotFound), errors.Is(err, repository.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "requested record was not found", nil)
	case errors.Is(err, service.ErrConflict), errors.Is(err, repository.ErrConflict):
		writeError(w, http.StatusConflict, "conflict", "the request conflicts with an existing record", nil)
	default:
		if a.logger != nil {
			a.logger.Printf("request failed: %v", err)
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "an unexpected error occurred", nil)
	}
}

func currentUser(r *http.Request) *model.User {
	user, _ := r.Context().Value(userContextKey).(*model.User)
	return user
}

func currentSession(r *http.Request) *model.Session {
	session, _ := r.Context().Value(sessionContextKey).(*model.Session)
	return session
}

func workspaceID(r *http.Request) string {
	return chi.URLParam(r, "workspaceID")
}

func itemsResponse(items any) map[string]any {
	return map[string]any{"items": items}
}

func intQuery(r *http.Request, name string, fallback, minimum, maximum int64) (int64, error) {
	query := r.URL.Query()
	if !query.Has(name) {
		return fallback, nil
	}
	raw := strings.TrimSpace(query.Get(name))
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < minimum || value > maximum {
		return 0, &service.FieldError{
			Field:   name,
			Message: "must be an integer between " + strconv.FormatInt(minimum, 10) + " and " + strconv.FormatInt(maximum, 10),
		}
	}
	return value, nil
}

func timeQuery(r *http.Request, name string) (time.Time, bool, error) {
	query := r.URL.Query()
	if !query.Has(name) {
		return time.Time{}, false, nil
	}
	value, err := time.Parse(time.RFC3339, strings.TrimSpace(query.Get(name)))
	if err != nil {
		return time.Time{}, true, &service.FieldError{Field: name, Message: "must be a valid RFC3339 timestamp"}
	}
	return value.UTC(), true, nil
}

func dateOnlyQuery(r *http.Request, name string) (time.Time, bool, error) {
	query := r.URL.Query()
	if !query.Has(name) {
		return time.Time{}, false, nil
	}
	raw := strings.TrimSpace(query.Get(name))
	value, err := time.Parse("2006-01-02", raw)
	if err != nil || value.Format("2006-01-02") != raw {
		return time.Time{}, true, &service.FieldError{Field: name, Message: "must be a valid YYYY-MM-DD date"}
	}
	return value.UTC(), true, nil
}

func dateRangeQuery(r *http.Request) (service.DateRange, bool, error) {
	from, hasFrom, err := dateOnlyQuery(r, "from")
	if err != nil {
		return service.DateRange{}, false, err
	}
	to, hasTo, err := dateOnlyQuery(r, "to")
	if err != nil {
		return service.DateRange{}, false, err
	}
	if !hasFrom && !hasTo {
		return service.DateRange{}, false, nil
	}
	dateRange := service.DateRange{}
	if hasFrom {
		dateRange.From = &from
	}
	if hasTo {
		endExclusive := to.AddDate(0, 0, 1)
		dateRange.To = &endExclusive
	}
	if _, err := normalizeDateRangeForRequest(dateRange); err != nil {
		return service.DateRange{}, true, err
	}
	return dateRange, true, nil
}

func normalizeDateRangeForRequest(dateRange service.DateRange) (service.DateRange, error) {
	if dateRange.From != nil && dateRange.To != nil && !dateRange.To.After(*dateRange.From) {
		return service.DateRange{}, &service.FieldError{Field: "period", Message: "to must not be before from"}
	}
	return dateRange, nil
}

func (a *API) pagination(w http.ResponseWriter, r *http.Request) (int64, int64, bool) {
	limit, err := intQuery(r, "limit", 30, 1, 100)
	if err != nil {
		a.serviceError(w, err)
		return 0, 0, false
	}
	skip, err := intQuery(r, "skip", 0, 0, maximumLegacySkip)
	if err != nil {
		a.serviceError(w, err)
		return 0, 0, false
	}
	return limit, skip, true
}
