package handler

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

func (a *API) Register(w http.ResponseWriter, r *http.Request) {
	if !a.allowRequest(w, "auth:"+clientIP(r), "too many authentication attempts") {
		return
	}
	var input service.RegisterInput
	if !a.decode(w, r, &input) {
		return
	}
	result, err := a.auth.Register(r.Context(), input, r.UserAgent(), clientIP(r))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (a *API) Login(w http.ResponseWriter, r *http.Request) {
	if !a.allowRequest(w, "auth:"+clientIP(r), "too many authentication attempts") {
		return
	}
	var input service.LoginInput
	if !a.decode(w, r, &input) {
		return
	}
	result, err := a.auth.Login(r.Context(), input, r.UserAgent(), clientIP(r))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (a *API) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Fields(r.Header.Get("Authorization"))
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required", nil)
			return
		}
		user, session, err := a.auth.Authenticate(r.Context(), parts[1])
		if err != nil {
			if errors.Is(err, service.ErrUnauthorized) {
				writeError(w, http.StatusUnauthorized, "unauthorized", "session is invalid or expired", nil)
			} else {
				a.serviceError(w, err)
			}
			return
		}
		ctx := context.WithValue(r.Context(), userContextKey, user)
		ctx = context.WithValue(ctx, sessionContextKey, session)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, model.NewUserProfile(currentUser(r)))
}

func (a *API) UpdateMe(w http.ResponseWriter, r *http.Request) {
	var input service.UpdateProfileInput
	if !a.decode(w, r, &input) {
		return
	}
	user, err := a.auth.UpdateProfile(r.Context(), currentUser(r).ID, input)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, model.NewUserProfile(user))
}

func (a *API) Logout(w http.ResponseWriter, r *http.Request) {
	if err := a.auth.Logout(r.Context(), currentSession(r).ID, currentUser(r).ID); err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

func (a *API) LogoutAll(w http.ResponseWriter, r *http.Request) {
	if err := a.auth.LogoutAll(r.Context(), currentUser(r).ID); err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

func (a *API) Sessions(w http.ResponseWriter, r *http.Request) {
	items, err := a.auth.Sessions(r.Context(), currentUser(r).ID)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, itemsResponse(items))
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	if address := strings.Trim(r.RemoteAddr, "[]"); address != "" {
		return address
	}
	return "unknown"
}
