package handler

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

func (a *API) TransactionCategories(w http.ResponseWriter, r *http.Request) {
	items, err := a.finance.ListTransactionCategories(
		r.Context(), workspaceID(r), currentUser(r).ID, r.URL.Query().Get("transactionType"),
	)
	if err != nil {
		a.transactionCategoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, itemsResponse(items))
}

func (a *API) CreateTransactionCategory(w http.ResponseWriter, r *http.Request) {
	var input service.TransactionCategoryCreateInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateTransactionCategory(r.Context(), workspaceID(r), currentUser(r).ID, input)
	if err != nil {
		a.transactionCategoryError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *API) UpdateTransactionCategory(w http.ResponseWriter, r *http.Request) {
	var input service.TransactionCategoryUpdateInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.UpdateTransactionCategory(
		r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "categoryID"), input,
	)
	if err != nil {
		a.transactionCategoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) DeleteTransactionCategory(w http.ResponseWriter, r *http.Request) {
	err := a.finance.DeleteTransactionCategory(
		r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "categoryID"),
		r.URL.Query().Get("replacementCategoryId"),
	)
	if err != nil {
		a.transactionCategoryError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) ReorderTransactionCategories(w http.ResponseWriter, r *http.Request) {
	var input service.TransactionCategoryReorderInput
	if !a.decode(w, r, &input) {
		return
	}
	items, err := a.finance.ReorderTransactionCategories(r.Context(), workspaceID(r), currentUser(r).ID, input)
	if err != nil {
		a.transactionCategoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, itemsResponse(items))
}

func (a *API) transactionCategoryError(w http.ResponseWriter, err error) {
	var duplicate *service.TransactionCategoryDuplicateError
	var inUse *service.TransactionCategoryInUseError
	switch {
	case errors.As(err, &duplicate):
		writeError(w, http.StatusConflict, "category_name_conflict", duplicate.Error(), nil)
	case errors.As(err, &inUse):
		if !inUse.UsageCountExact {
			writeError(
				w,
				http.StatusConflict,
				"category_in_use",
				fmt.Sprintf("Category %q is in use. Choose a replacement category, or disable it instead.", inUse.Name),
				nil,
			)
			return
		}
		noun := "transactions"
		if inUse.UsageCount == 1 {
			noun = "transaction"
		}
		writeError(
			w,
			http.StatusConflict,
			"category_in_use",
			fmt.Sprintf(
				"Category %q is used by %d %s. Choose a replacement category, or disable it instead.",
				inUse.Name,
				inUse.UsageCount,
				noun,
			),
			nil,
		)
	default:
		a.serviceError(w, err)
	}
}
