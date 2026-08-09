package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

func (a *API) CreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var input service.WorkspaceInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateWorkspace(r.Context(), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}

func (a *API) Workspaces(w http.ResponseWriter, r *http.Request) {
	items, err := a.finance.ListWorkspaces(r.Context(), currentUser(r).ID)
	a.writeItems(w, items, err)
}

func (a *API) DeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	if err := a.finance.DeleteWorkspace(r.Context(), workspaceID(r), currentUser(r).ID); err != nil {
		a.serviceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) CreateVault(w http.ResponseWriter, r *http.Request) {
	var input service.VaultInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateVault(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}

func (a *API) Vaults(w http.ResponseWriter, r *http.Request) {
	items, err := a.finance.ListVaults(r.Context(), workspaceID(r), currentUser(r).ID)
	a.writeItems(w, items, err)
}

func (a *API) CreateAccount(w http.ResponseWriter, r *http.Request) {
	var input service.AccountInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateAccount(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}

func (a *API) Accounts(w http.ResponseWriter, r *http.Request) {
	items, err := a.finance.ListAccounts(r.Context(), workspaceID(r), currentUser(r).ID)
	a.writeItems(w, items, err)
}

func (a *API) Account(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.GetAccount(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "accountID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) UpdateAccount(w http.ResponseWriter, r *http.Request) {
	var input service.AccountInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.UpdateAccount(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "accountID"), input)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) ArchiveAccount(w http.ResponseWriter, r *http.Request) {
	if err := a.finance.ArchiveAccount(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "accountID")); err != nil {
		a.serviceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) ShareAccount(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.ShareAccount(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "accountID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) CreateTransaction(w http.ResponseWriter, r *http.Request) {
	var input service.TransactionInput
	if !a.decode(w, r, &input) {
		return
	}
	if input.OccurredAt.IsZero() {
		a.serviceError(w, &service.FieldError{Field: "occurredAt", Message: "is required"})
		return
	}
	item, err := a.finance.CreateTransaction(r.Context(), workspaceID(r), currentUser(r).ID, r.Header.Get("Idempotency-Key"), input)
	a.writeCreated(w, item, err)
}

func (a *API) Transactions(w http.ResponseWriter, r *http.Request) {
	limit, skip, ok := a.pagination(w, r)
	if !ok {
		return
	}
	filter := service.TransactionFilter{
		VaultID:   r.URL.Query().Get("vaultId"),
		AccountID: r.URL.Query().Get("accountId"),
		ContactID: r.URL.Query().Get("contactId"),
		Type:      r.URL.Query().Get("type"),
		Category:  r.URL.Query().Get("category"),
		Merchant:  r.URL.Query().Get("merchant"),
		Limit:     limit,
		Skip:      skip,
	}
	from, present, err := timeQuery(r, "from")
	if err != nil {
		a.serviceError(w, err)
		return
	}
	if present {
		filter.From = &from
	}
	to, present, err := timeQuery(r, "to")
	if err != nil {
		a.serviceError(w, err)
		return
	}
	if present {
		filter.To = &to
	}
	items, err := a.finance.ListTransactions(r.Context(), workspaceID(r), currentUser(r).ID, filter)
	a.writeItems(w, items, err)
}

func (a *API) Transaction(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.GetTransaction(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "transactionID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) UpdateTransaction(w http.ResponseWriter, r *http.Request) {
	var input service.TransactionInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.UpdateTransaction(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "transactionID"), input)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) DeleteTransaction(w http.ResponseWriter, r *http.Request) {
	if err := a.finance.DeleteTransaction(
		r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "transactionID"),
	); err != nil {
		a.serviceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) ShareTransaction(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.ShareTransaction(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "transactionID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) Contacts(w http.ResponseWriter, r *http.Request) {
	items, err := a.finance.ListContacts(r.Context(), workspaceID(r), currentUser(r).ID, r.URL.Query().Get("q"))
	a.writeItems(w, items, err)
}
func (a *API) Contact(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.GetContact(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "contactID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}
func (a *API) CreateContact(w http.ResponseWriter, r *http.Request) {
	var input service.ContactInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateContact(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}
func (a *API) UpdateContact(w http.ResponseWriter, r *http.Request) {
	var input service.ContactInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.UpdateContact(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "contactID"), input)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}
func (a *API) DeleteContact(w http.ResponseWriter, r *http.Request) {
	if err := a.finance.DeleteContact(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "contactID")); err != nil {
		a.serviceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (a *API) SavedTransactionNames(w http.ResponseWriter, r *http.Request) {
	items, err := a.finance.ListSavedTransactionNames(r.Context(), workspaceID(r), currentUser(r).ID, r.URL.Query().Get("q"))
	a.writeItems(w, items, err)
}
func (a *API) CreateSavedTransactionName(w http.ResponseWriter, r *http.Request) {
	var input service.SavedTransactionNameInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateSavedTransactionName(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}
func (a *API) UpdateSavedTransactionName(w http.ResponseWriter, r *http.Request) {
	var input service.SavedTransactionNameInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.UpdateSavedTransactionName(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "nameID"), input)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}
func (a *API) DeleteSavedTransactionName(w http.ResponseWriter, r *http.Request) {
	if err := a.finance.DeleteSavedTransactionName(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "nameID")); err != nil {
		a.serviceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) CreateBudget(w http.ResponseWriter, r *http.Request) {
	var input service.BudgetInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateBudget(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}

func (a *API) Budgets(w http.ResponseWriter, r *http.Request) {
	limit, skip, ok := a.pagination(w, r)
	if !ok {
		return
	}
	var items []model.Budget
	err := a.finance.ListCollectionPage(r.Context(), workspaceID(r), currentUser(r).ID, "budgets", model.PermViewTransactions, &items, limit, skip)
	a.writeItems(w, items, err)
}

func (a *API) Budget(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.GetBudget(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "budgetID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) UpdateBudget(w http.ResponseWriter, r *http.Request) {
	var input service.BudgetInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.UpdateBudget(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "budgetID"), input)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) DeleteBudget(w http.ResponseWriter, r *http.Request) {
	if err := a.finance.DeleteBudget(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "budgetID")); err != nil {
		a.serviceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) ShareBudget(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.ShareBudget(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "budgetID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) Bills(w http.ResponseWriter, r *http.Request) {
	limit, skip, ok := a.pagination(w, r)
	if !ok {
		return
	}
	items, err := a.finance.ListBills(
		r.Context(),
		workspaceID(r),
		currentUser(r).ID,
		limit,
		skip,
	)
	a.writeItems(w, items, err)
}

func (a *API) CreateGoal(w http.ResponseWriter, r *http.Request) {
	var input service.GoalInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateGoal(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}

func (a *API) Goals(w http.ResponseWriter, r *http.Request) {
	limit, skip, ok := a.pagination(w, r)
	if !ok {
		return
	}
	var items []model.Goal
	err := a.finance.ListCollectionPage(r.Context(), workspaceID(r), currentUser(r).ID, "goals", model.PermViewTransactions, &items, limit, skip)
	a.writeItems(w, items, err)
}

func (a *API) Goal(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.GetGoal(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "goalID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) UpdateGoal(w http.ResponseWriter, r *http.Request) {
	var input service.GoalInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.UpdateGoal(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "goalID"), input)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) DeleteGoal(w http.ResponseWriter, r *http.Request) {
	if err := a.finance.DeleteGoal(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "goalID")); err != nil {
		a.serviceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) ShareGoal(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.ShareGoal(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "goalID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) ProgressGoal(w http.ResponseWriter, r *http.Request) {
	var input service.GoalProgressInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.RecordGoalProgress(
		r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "goalID"),
		r.Header.Get("Idempotency-Key"), input,
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) CompleteGoalWithTransaction(w http.ResponseWriter, r *http.Request) {
	var input service.GoalTransactionInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateGoalTransaction(
		r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "goalID"),
		r.Header.Get("Idempotency-Key"), input,
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) LinkGoalTransaction(w http.ResponseWriter, r *http.Request) {
	var input service.GoalLinkInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.LinkGoalTransaction(
		r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "goalID"),
		r.Header.Get("Idempotency-Key"), input,
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) CancelGoal(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.CancelGoal(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "goalID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) ReopenGoal(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.ReopenGoal(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "goalID"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) RescheduleGoal(w http.ResponseWriter, r *http.Request) {
	var input service.GoalRescheduleInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.RescheduleGoal(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "goalID"), input)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) Invite(w http.ResponseWriter, r *http.Request) {
	if !a.allowRequest(w, "invite:"+currentUser(r).ID, "too many invitation attempts") {
		return
	}
	var input service.InvitationInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.CreateInvitation(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}

func (a *API) CancelInvitation(w http.ResponseWriter, r *http.Request) {
	if err := a.finance.CancelInvitation(
		r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "invitationID"),
	); err != nil {
		a.serviceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	if !a.allowRequest(
		w,
		"invite-accept:"+currentUser(r).ID+":"+clientIP(r),
		"too many invitation acceptance attempts",
	) {
		return
	}
	var input struct {
		Token string `json:"token"`
	}
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.AcceptInvitation(r.Context(), currentUser(r), input.Token)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, service.InvitationAcceptance{
		WorkspaceID: item.WorkspaceID,
		Role:        item.Role,
		Permissions: item.Permissions,
	})
}

func (a *API) RotateWorkspaceJoinCode(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.RotateWorkspaceJoinCode(r.Context(), workspaceID(r), currentUser(r).ID)
	a.writeCreated(w, item, err)
}

type workspaceJoinInvitationResponse struct {
	WorkspaceID string   `json:"workspaceId"`
	Status      string   `json:"status"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}

func (a *API) RequestWorkspaceJoin(w http.ResponseWriter, r *http.Request) {
	if !a.allowRequest(w, "workspace-join:"+currentUser(r).ID+":"+clientIP(r), "too many workspace join attempts") {
		return
	}
	var input service.WorkspaceJoinRequestInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.RequestWorkspaceJoin(r.Context(), currentUser(r), input)
	if err == nil {
		a.writeCreated(w, item, nil)
		return
	}
	if !errors.Is(err, service.ErrNotFound) {
		a.serviceError(w, err)
		return
	}
	membership, err := a.finance.AcceptInvitation(r.Context(), currentUser(r), input.Code)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	a.writeCreated(w, workspaceJoinInvitationResponse{
		WorkspaceID: membership.WorkspaceID,
		Status:      "joined",
		Role:        membership.Role,
		Permissions: membership.Permissions,
	}, nil)
}

func (a *API) WorkspaceJoinRequests(w http.ResponseWriter, r *http.Request) {
	items, err := a.finance.ListWorkspaceJoinRequests(r.Context(), workspaceID(r), currentUser(r).ID)
	a.writeItems(w, items, err)
}

func (a *API) ReviewWorkspaceJoinRequest(w http.ResponseWriter, r *http.Request) {
	var input service.WorkspaceJoinReviewInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.ReviewWorkspaceJoinRequest(
		r.Context(), workspaceID(r), currentUser(r).ID,
		chi.URLParam(r, "requestID"), input,
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) Members(w http.ResponseWriter, r *http.Request) {
	items, err := a.finance.ListWorkspaceMembers(r.Context(), workspaceID(r), currentUser(r).ID)
	a.writeItems(w, items, err)
}

func (a *API) UpdateMember(w http.ResponseWriter, r *http.Request) {
	var input service.WorkspaceMemberUpdateInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.UpdateWorkspaceMember(
		r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "userID"), input,
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) RemoveMember(w http.ResponseWriter, r *http.Request) {
	if err := a.finance.RemoveWorkspaceMember(
		r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "userID"),
	); err != nil {
		a.serviceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) SubmitClaim(w http.ResponseWriter, r *http.Request) {
	var input service.ClaimInput
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.SubmitClaim(r.Context(), workspaceID(r), currentUser(r).ID, input)
	a.writeCreated(w, item, err)
}

func (a *API) Claims(w http.ResponseWriter, r *http.Request) {
	limit, skip, ok := a.pagination(w, r)
	if !ok {
		return
	}
	var items []model.ExpenseClaim
	err := a.finance.ListCollectionPage(r.Context(), workspaceID(r), currentUser(r).ID, "expense_claims", model.PermSubmitExpenses, &items, limit, skip)
	a.writeItems(w, items, err)
}

func (a *API) ReviewClaim(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Status  string `json:"status"`
		Comment string `json:"comment"`
	}
	if !a.decode(w, r, &input) {
		return
	}
	item, err := a.finance.ReviewClaim(r.Context(), workspaceID(r), currentUser(r).ID, chi.URLParam(r, "claimID"), input.Status, input.Comment)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) Dashboard(w http.ResponseWriter, r *http.Request) {
	filter, filtered, err := dashboardFilterQuery(r)
	if err != nil {
		var fieldErr *service.FieldError
		if errors.As(err, &fieldErr) {
			writeError(w, http.StatusBadRequest, "validation_failed", "request validation failed", map[string]string{fieldErr.Field: fieldErr.Message})
			return
		}
		a.serviceError(w, err)
		return
	}

	var item *service.Dashboard
	if !filtered {
		item, err = a.finance.Dashboard(r.Context(), workspaceID(r), currentUser(r).ID)
	} else {
		item, err = a.finance.Dashboard(r.Context(), workspaceID(r), currentUser(r).ID, filter)
	}
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func dashboardFilterQuery(r *http.Request) (service.DashboardFilter, bool, error) {
	month, err := dashboardMonthQuery(r)
	if err != nil {
		return service.DashboardFilter{}, false, err
	}
	dateRange, hasDateRange, err := dateRangeQuery(r)
	if err != nil {
		return service.DashboardFilter{}, false, err
	}
	allTime := false
	if r.URL.Query().Has("allTime") {
		raw := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("allTime")))
		if raw != "true" && raw != "1" {
			return service.DashboardFilter{}, false, &service.FieldError{Field: "allTime", Message: "must be true when provided"}
		}
		allTime = true
	}
	if allTime && (month != nil || hasDateRange) {
		return service.DashboardFilter{}, false, &service.FieldError{Field: "period", Message: "allTime cannot be combined with month or from/to"}
	}
	if month != nil && hasDateRange {
		return service.DashboardFilter{}, false, &service.FieldError{Field: "period", Message: "month cannot be combined with from or to"}
	}
	if month == nil && !hasDateRange && !allTime {
		return service.DashboardFilter{}, false, nil
	}
	return service.DashboardFilter{Month: month, From: dateRange.From, To: dateRange.To, AllTime: allTime}, true, nil
}

func dashboardMonthQuery(r *http.Request) (*time.Time, error) {
	if !r.URL.Query().Has("month") {
		return nil, nil
	}
	raw := strings.TrimSpace(r.URL.Query().Get("month"))
	value, err := time.Parse("2006-01", raw)
	if err != nil || value.Format("2006-01") != raw {
		return nil, &service.FieldError{Field: "month", Message: "must be a valid YYYY-MM month"}
	}
	value = value.UTC()
	return &value, nil
}

func (a *API) ExportWorkspaceCSV(w http.ResponseWriter, r *http.Request) {
	dateRange, _, err := dateRangeQuery(r)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	content, filename, err := a.finance.ExportWorkspaceCSV(
		r.Context(), workspaceID(r), currentUser(r).ID, service.ExportFilter(dateRange),
	)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}

func (a *API) Search(w http.ResponseWriter, r *http.Request) {
	item, err := a.finance.Search(r.Context(), workspaceID(r), currentUser(r).ID, r.URL.Query().Get("q"))
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) Report(w http.ResponseWriter, r *http.Request) {
	from, _, err := timeQuery(r, "from")
	if err != nil {
		a.serviceError(w, err)
		return
	}
	to, _, err := timeQuery(r, "to")
	if err != nil {
		a.serviceError(w, err)
		return
	}
	item, err := a.finance.Report(r.Context(), workspaceID(r), currentUser(r).ID, from, to)
	if err != nil {
		a.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) Notifications(w http.ResponseWriter, r *http.Request) {
	limit, skip, ok := a.pagination(w, r)
	if !ok {
		return
	}
	items, err := a.finance.Notifications(r.Context(), currentUser(r).ID, limit, skip)
	a.writeItems(w, items, err)
}

func (a *API) Audit(w http.ResponseWriter, r *http.Request) {
	limit, skip, ok := a.pagination(w, r)
	if !ok {
		return
	}
	items, err := a.finance.Audit(r.Context(), workspaceID(r), currentUser(r).ID, limit, skip)
	a.writeItems(w, items, err)
}
