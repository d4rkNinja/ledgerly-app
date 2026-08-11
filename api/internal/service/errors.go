package service

import "errors"

var (
	ErrValidation   = errors.New("validation failed")
	ErrUnauthorized = errors.New("authentication required")
	ErrForbidden    = errors.New("permission denied")
	ErrConflict     = errors.New("conflict")
	ErrNotFound     = errors.New("not found")
	// ErrPeriodTotalsOverflow prevents an immutable review snapshot or delta
	// from silently wrapping when otherwise-valid records exceed int64 totals.
	ErrPeriodTotalsOverflow = errors.New("period review totals overflow")
)

type FieldError struct {
	Field   string
	Message string
}

func (e *FieldError) Error() string {
	return e.Field + ": " + e.Message
}

func (e *FieldError) Unwrap() error { return ErrValidation }
