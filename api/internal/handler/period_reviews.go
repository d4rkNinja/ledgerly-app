package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

func (a *API) CreatePeriodReview(w http.ResponseWriter, r *http.Request) {
	var input service.PeriodReviewInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreatePeriodReview(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}

func (a *API) PeriodReviews(w http.ResponseWriter, r *http.Request) {
	input := service.PeriodReviewInput{
		From: r.URL.Query().Get("from"), To: r.URL.Query().Get("to"), Timezone: r.URL.Query().Get("timezone"),
	}
	items, err := a.finance.ListPeriodReviews(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeItems(w, items, err)
}

func (a *API) PeriodReviewChanges(w http.ResponseWriter, r *http.Request) {
	limit, skip, ok := a.pagination(w, r)
	if !ok {
		return
	}
	items, err := a.finance.ListPeriodReviewChanges(
		r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "reviewID"), limit, skip,
	)
	a.writeItems(w, items, err)
}
