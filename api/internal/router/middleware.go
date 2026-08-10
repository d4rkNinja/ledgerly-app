package router

import (
	"context"
	"errors"
	"log"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/handler"
)

type Options struct {
	AllowedOrigins []string
	TrustedProxies []string
	RequestTimeout time.Duration
	Logger         *log.Logger
}

func requestLogger(logger *log.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			startedAt := time.Now()
			wrapped := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			defer func() {
				status := wrapped.Status()
				if status == 0 {
					status = http.StatusOK
				}
				logger.Printf(
					"request id=%q method=%s path=%q status=%d bytes=%d remote_ip=%q duration=%s",
					middleware.GetReqID(r.Context()),
					r.Method,
					r.URL.Path,
					status,
					wrapped.BytesWritten(),
					clientAddress(r.RemoteAddr),
					time.Since(startedAt).Round(time.Microsecond),
				)
			}()
			next.ServeHTTP(wrapped, r)
		})
	}
}

func panicRecovery(logger *log.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				recovered := recover()
				if recovered == nil {
					return
				}
				if recovered == http.ErrAbortHandler {
					panic(recovered)
				}
				if logger != nil {
					logger.Printf(
						"request panic id=%q method=%s path=%q error=%v stack=%q",
						middleware.GetReqID(r.Context()),
						r.Method,
						r.URL.Path,
						recovered,
						debug.Stack(),
					)
				}
				handler.WriteErrorResponse(w, http.StatusInternalServerError, "internal_error", "an unexpected error occurred")
			}()
			next.ServeHTTP(w, r)
		})
	}
}

func requestTimeout(timeout time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), timeout)
			defer cancel()

			wrapped := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(wrapped, r.WithContext(ctx))
			if errors.Is(ctx.Err(), context.DeadlineExceeded) && wrapped.Status() == 0 {
				handler.WriteErrorResponse(wrapped, http.StatusGatewayTimeout, "request_timeout", "the request timed out")
			}
		})
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
		next.ServeHTTP(w, r)
	})
}

func cors(allowed []string) func(http.Handler) http.Handler {
	set := make(map[string]struct{}, len(allowed))
	allowAll := false
	for _, origin := range allowed {
		if origin = strings.TrimSpace(origin); origin == "*" {
			allowAll = true
		} else if origin != "" {
			set[origin] = struct{}{}
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			_, originAllowed := set[origin]
			if allowAll {
				originAllowed = true
			}
			w.Header().Add("Vary", "Origin")
			if origin != "" && originAllowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition, X-Request-ID")
			} else if origin == "" && allowAll {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			}
			if r.Method == http.MethodOptions {
				handlePreflight(w, r, originAllowed)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func handlePreflight(w http.ResponseWriter, r *http.Request, originAllowed bool) {
	w.Header().Add("Vary", "Access-Control-Request-Method")
	w.Header().Add("Vary", "Access-Control-Request-Headers")
	if r.Header.Get("Origin") == "" || !originAllowed {
		handler.WriteErrorResponse(w, http.StatusForbidden, "origin_not_allowed", "origin is not allowed")
		return
	}
	if !validPreflightMethod(r.Header.Get("Access-Control-Request-Method")) ||
		!validPreflightHeaders(r.Header.Values("Access-Control-Request-Headers")) {
		handler.WriteErrorResponse(w, http.StatusForbidden, "preflight_not_allowed", "preflight request is not allowed")
		return
	}
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Max-Age", "600")
	w.WriteHeader(http.StatusNoContent)
}

func validPreflightMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions:
		return true
	default:
		return false
	}
}

func validPreflightHeaders(headerValues []string) bool {
	for _, headerValue := range headerValues {
		for _, header := range strings.Split(headerValue, ",") {
			switch http.CanonicalHeaderKey(strings.TrimSpace(header)) {
			case "", "Authorization", "Content-Type", "Idempotency-Key":
			default:
				return false
			}
		}
	}
	return true
}
