package router

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/handler"
)

func New(api *handler.API, health *handler.HealthHandler, allowedOrigins []string) http.Handler {
	return NewWithOptions(api, health, Options{
		AllowedOrigins: allowedOrigins,
		RequestTimeout: 30 * time.Second,
	})
}

func NewWithOptions(api *handler.API, health *handler.HealthHandler, options Options) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(trustedProxyIP(options.TrustedProxies, options.Logger))
	if options.Logger != nil {
		r.Use(requestLogger(options.Logger))
	}
	r.Use(panicRecovery(options.Logger))
	if options.RequestTimeout > 0 {
		r.Use(requestTimeout(options.RequestTimeout))
	}
	r.Use(securityHeaders)
	r.Use(cors(options.AllowedOrigins))

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		handler.WriteErrorResponse(w, http.StatusNotFound, "not_found", "requested route was not found")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, request *http.Request) {
		if allowed := allowedMethods(r, request.URL.Path); len(allowed) > 0 {
			w.Header().Set("Allow", strings.Join(allowed, ", "))
		}
		handler.WriteErrorResponse(w, http.StatusMethodNotAllowed, "method_not_allowed", "request method is not allowed")
	})

	r.Get("/health", health.Liveness)
	r.Get("/ready", health.Readiness)
	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/register", api.Register)
		r.Post("/auth/login", api.Login)
		r.Group(func(r chi.Router) {
			r.Use(api.Authenticate)
			r.Get("/me", api.Me)
			r.Patch("/me", api.UpdateMe)
			r.Post("/auth/logout", api.Logout)
			r.Post("/auth/logout-all", api.LogoutAll)
			r.Get("/auth/sessions", api.Sessions)
			r.Post("/invitations/accept", api.AcceptInvitation)
			r.Post("/workspace-join-requests", api.RequestWorkspaceJoin)
			r.Get("/notifications", api.Notifications)
			r.Get("/notifications/unread-count", api.UnreadNotificationCount)
			r.Patch("/notifications/read-all", api.MarkAllNotificationsRead)
			r.Patch("/notifications/{notificationID}/read", api.MarkNotificationRead)
			r.Get("/workspaces", api.Workspaces)
			r.Post("/workspaces", api.CreateWorkspace)

			r.Route("/workspaces/{workspaceID}", func(r chi.Router) {
				r.Get("/dashboard", api.Dashboard)
				r.Get("/export.csv", api.ExportWorkspaceCSV)
				r.Get("/search", api.Search)
				r.Get("/reports/summary", api.Report)
				r.Get("/audit", api.Audit)
				r.Get("/period-reviews", api.PeriodReviews)
				r.Post("/period-reviews", api.CreatePeriodReview)
				r.Get("/period-reviews/{reviewID}/changes", api.PeriodReviewChanges)
				r.Get("/vaults", api.Vaults)
				r.Post("/vaults", api.CreateVault)
				r.Get("/accounts", api.Accounts)
				r.Post("/accounts", api.CreateAccount)
				r.Get("/accounts/{accountID}", api.Account)
				r.Patch("/accounts/{accountID}", api.UpdateAccount)
				r.Delete("/accounts/{accountID}", api.ArchiveAccount)
				r.Post("/accounts/{accountID}/share", api.ShareAccount)
				r.Get("/transactions", api.Transactions)
				r.Post("/transactions", api.CreateTransaction)
				r.Get("/transaction-sequences", api.TransactionSequences)
				r.Patch("/transaction-sequences/{transactionType}", api.UpdateTransactionSequence)
				r.Get("/transactions/{transactionID}", api.Transaction)
				r.Patch("/transactions/{transactionID}", api.UpdateTransaction)
				r.Delete("/transactions/{transactionID}", api.DeleteTransaction)
				r.Post("/transactions/{transactionID}/share", api.ShareTransaction)
				r.Get("/transaction-categories", api.TransactionCategories)
				r.Post("/transaction-categories", api.CreateTransactionCategory)
				r.Post("/transaction-categories/reorder", api.ReorderTransactionCategories)
				r.Patch("/transaction-categories/{categoryID:[0-9a-fA-F-]+}", api.UpdateTransactionCategory)
				r.Delete("/transaction-categories/{categoryID:[0-9a-fA-F-]+}", api.DeleteTransactionCategory)
				r.Get("/contacts", api.Contacts)
				r.Post("/contacts", api.CreateContact)
				r.Get("/contacts/{contactID}", api.Contact)
				r.Patch("/contacts/{contactID}", api.UpdateContact)
				r.Delete("/contacts/{contactID}", api.DeleteContact)
				r.Get("/saved-transaction-names", api.SavedTransactionNames)
				r.Post("/saved-transaction-names", api.CreateSavedTransactionName)
				r.Patch("/saved-transaction-names/{nameID}", api.UpdateSavedTransactionName)
				r.Delete("/saved-transaction-names/{nameID}", api.DeleteSavedTransactionName)
				r.Get("/budgets", api.Budgets)
				r.Post("/budgets", api.CreateBudget)
				r.Get("/budgets/{budgetID}", api.Budget)
				r.Patch("/budgets/{budgetID}", api.UpdateBudget)
				r.Delete("/budgets/{budgetID}", api.DeleteBudget)
				r.Post("/budgets/{budgetID}/share", api.ShareBudget)
				r.Get("/bills", api.Bills)
				r.Get("/goals", api.Goals)
				r.Post("/goals", api.CreateGoal)
				r.Get("/goals/{goalID}", api.Goal)
				r.Patch("/goals/{goalID}", api.UpdateGoal)
				r.Delete("/goals/{goalID}", api.DeleteGoal)
				r.Post("/goals/{goalID}/share", api.ShareGoal)
				r.Post("/goals/{goalID}/progress", api.ProgressGoal)
				r.Post("/goals/{goalID}/transactions", api.CompleteGoalWithTransaction)
				r.Post("/goals/{goalID}/link-transaction", api.LinkGoalTransaction)
				r.Post("/goals/{goalID}/cancel", api.CancelGoal)
				r.Post("/goals/{goalID}/reopen", api.ReopenGoal)
				r.Post("/goals/{goalID}/reschedule", api.RescheduleGoal)
				r.Post("/invitations", api.Invite)
				r.Delete("/invitations/{invitationID}", api.CancelInvitation)
				r.Get("/members", api.Members)
				r.Patch("/members/{userID}", api.UpdateMember)
				r.Delete("/members/{userID}", api.RemoveMember)
				r.Post("/join-code", api.RotateWorkspaceJoinCode)
				r.Get("/join-requests", api.WorkspaceJoinRequests)
				r.Patch("/join-requests/{requestID}", api.ReviewWorkspaceJoinRequest)
				r.Get("/expense-claims", api.Claims)
				r.Post("/expense-claims", api.SubmitClaim)
				r.Patch("/expense-claims/{claimID}/review", api.ReviewClaim)
			})
		})
		// Keep workspace deletion on the API root router. Registering it as a
		// sibling of the parameterized workspace subrouter can be shadowed by
		// chi's mount node on some versions, causing an authenticated 404.
		r.With(api.Authenticate).Delete("/workspaces/{workspaceID}", api.DeleteWorkspace)
	})
	return r
}

func allowedMethods(routes chi.Routes, path string) []string {
	candidates := []string{
		http.MethodGet,
		http.MethodPost,
		http.MethodPut,
		http.MethodPatch,
		http.MethodDelete,
	}
	allowed := make([]string, 0, len(candidates))
	for _, method := range candidates {
		if routes.Match(chi.NewRouteContext(), method, path) {
			allowed = append(allowed, method)
		}
	}
	return allowed
}
