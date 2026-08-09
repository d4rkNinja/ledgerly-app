package service

import "errors"

var (
	ErrValidation   = errors.New("validation failed")
	ErrUnauthorized = errors.New("authentication required")
	ErrForbidden    = errors.New("permission denied")
	ErrConflict     = errors.New("conflict")
	ErrNotFound     = errors.New("not found")
)

type FieldError struct {
	Field   string
	Message string
}

func (e *FieldError) Error() string {
	return e.Field + ": " + e.Message
}

func (e *FieldError) Unwrap() error { return ErrValidation }
