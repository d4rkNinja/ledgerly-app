package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (a *API) UnreadNotificationCount(w http.ResponseWriter, r *http.Request) {
	result, err := a.finance.UnreadNotificationCount(r.Context(), currentUser(r).ID)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (a *API) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.MarkNotificationRead(
		r.Context(),
		currentUser(r).ID,
		chi.URLParam(r, "notificationID"),
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) MarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	result, err := a.finance.MarkAllNotificationsRead(r.Context(), currentUser(r).ID)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
