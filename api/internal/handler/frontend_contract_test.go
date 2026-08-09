package handler

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

type frontendContractStore struct {
	users                 []model.User
	sessions              []model.Session
	workspaces            []model.Workspace
	memberships           []model.Membership
	invitations           []model.Invitation
	workspaceJoinRequests []model.WorkspaceJoinRequest
	auditEvents           []model.AuditEvent
	transactionRuns       int
	invitationLookups     int
	findOneErrors         map[string]error
}

func (s *frontendContractStore) Insert(_ context.Context, collection string, document any) error {
	switch collection {
	case "users":
		s.users = append(s.users, *document.(*model.User))
	case "sessions":
		s.sessions = append(s.sessions, *document.(*model.Session))
	case "workspaces":
		s.workspaces = append(s.workspaces, *document.(*model.Workspace))
	case "memberships":
		s.memberships = append(s.memberships, *document.(*model.Membership))
	case "invitations":
		s.invitations = append(s.invitations, *document.(*model.Invitation))
	case "workspace_join_requests":
		s.workspaceJoinRequests = append(s.workspaceJoinRequests, *document.(*model.WorkspaceJoinRequest))
	case "audit_events":
		s.auditEvents = append(s.auditEvents, *document.(*model.AuditEvent))
	default:
		return errors.New("unexpected insert collection")
	}
	return nil
}

func (s *frontendContractStore) FindOne(
	_ context.Context,
	collection string,
	filter repository.Filter,
	destination any,
) error {
	if err := s.findOneErrors[collection]; err != nil {
		return err
	}
	switch collection {
	case "users":
		for _, user := range s.users {
			if email, ok := filter["email"].(string); ok && email == user.Email {
				*destination.(*model.User) = user
				return nil
			}
			if id, ok := filter["_id"].(string); ok && id == user.ID {
				*destination.(*model.User) = user
				return nil
			}
		}
	case "sessions":
		tokenHash, _ := filter["token_hash"].(string)
		for _, session := range s.sessions {
			if session.TokenHash == tokenHash && session.RevokedAt == nil {
				*destination.(*model.Session) = session
				return nil
			}
		}
	case "memberships":
		workspaceID, _ := filter["workspace_id"].(string)
		userID, _ := filter["user_id"].(string)
		for _, membership := range s.memberships {
			if membership.WorkspaceID == workspaceID && membership.UserID == userID {
				*destination.(*model.Membership) = membership
				return nil
			}
		}
	case "invitations":
		s.invitationLookups++
		tokenHash, _ := filter["token_hash"].(string)
		status, _ := filter["status"].(string)
		expiresAtFilter, _ := filter["expires_at"].(repository.Filter)
		now, _ := expiresAtFilter["$gt"].(time.Time)
		for _, invitation := range s.invitations {
			if invitation.TokenHash != tokenHash || invitation.Status != status || !invitation.ExpiresAt.After(now) {
				continue
			}
			*destination.(*model.Invitation) = invitation
			return nil
		}
	case "workspaces":
		joinCodeHash, _ := filter["join_code_hash"].(string)
		for _, workspace := range s.workspaces {
			if workspace.JoinCodeHash != joinCodeHash || workspace.Visibility != filter["visibility"] {
				continue
			}
			if expiryFilter, ok := filter["join_code_expires_at"].(repository.Filter); ok {
				now, ok := expiryFilter["$gt"].(time.Time)
				if !ok || !workspace.JoinCodeExpiresAt.After(now) {
					continue
				}
			}
			*destination.(*model.Workspace) = workspace
			return nil
		}
	case "workspace_join_requests":
		return repository.ErrNotFound
	}
	return repository.ErrNotFound
}

func (s *frontendContractStore) FindMany(
	_ context.Context,
	collection string,
	filter repository.Filter,
	destination any,
	_, _ int64,
	_ repository.Sort,
) error {
	switch collection {
	case "memberships":
		actorID, _ := filter["user_id"].(string)
		out := destination.(*[]model.Membership)
		for _, membership := range s.memberships {
			if membership.UserID == actorID {
				*out = append(*out, membership)
			}
		}
	case "workspaces":
		out := destination.(*[]model.Workspace)
		*out = append(*out, s.workspaces...)
	case "audit_events":
		workspaceID, _ := filter["workspace_id"].(string)
		out := destination.(*[]model.AuditEvent)
		for _, event := range s.auditEvents {
			if event.WorkspaceID == workspaceID {
				*out = append(*out, event)
			}
		}
	default:
		return errors.New("unexpected find-many collection")
	}
	return nil
}

func (s *frontendContractStore) Aggregate(
	_ context.Context,
	collection string,
	_ repository.Pipeline,
	destination any,
) error {
	if collection != "memberships" {
		return errors.New("unexpected aggregate collection")
	}

	counts := make(map[string]int64)
	for _, membership := range s.memberships {
		counts[membership.WorkspaceID]++
	}
	slice := reflect.ValueOf(destination)
	if slice.Kind() != reflect.Pointer || slice.Elem().Kind() != reflect.Slice {
		return errors.New("member-count destination must be a slice pointer")
	}
	for workspaceID, count := range counts {
		item := reflect.New(slice.Elem().Type().Elem()).Elem()
		item.FieldByName("WorkspaceID").SetString(workspaceID)
		item.FieldByName("Count").SetInt(count)
		slice.Elem().Set(reflect.Append(slice.Elem(), item))
	}
	return nil
}

func (s *frontendContractStore) UpdateOne(
	_ context.Context,
	collection string,
	filter repository.Filter,
	update repository.Filter,
	destination any,
) error {
	if collection == "invitations" {
		invitationID, _ := filter["_id"].(string)
		status, _ := filter["status"].(string)
		expiresAtFilter, _ := filter["expires_at"].(repository.Filter)
		now, _ := expiresAtFilter["$gt"].(time.Time)
		set, _ := update["$set"].(repository.Filter)
		for i := range s.invitations {
			invitation := &s.invitations[i]
			if invitation.ID != invitationID || invitation.Status != status || !invitation.ExpiresAt.After(now) {
				continue
			}
			if value, ok := set["status"].(string); ok {
				invitation.Status = value
			}
			if acceptedAt, ok := set["accepted_at"].(time.Time); ok {
				invitation.AcceptedAt = &acceptedAt
			}
			*destination.(*model.Invitation) = *invitation
			return nil
		}
		return repository.ErrNotFound
	}
	if collection != "users" {
		return repository.ErrNotFound
	}
	userID, _ := filter["_id"].(string)
	set, _ := update["$set"].(repository.Filter)
	for i := range s.users {
		if s.users[i].ID != userID {
			continue
		}
		if currency, ok := set["preferred_currency"].(string); ok {
			s.users[i].PreferredCurrency = currency
		}
		if updatedAt, ok := set["updated_at"].(time.Time); ok {
			s.users[i].UpdatedAt = updatedAt
		}
		if emailVerified, ok := set["email_verified"].(bool); ok {
			s.users[i].EmailVerified = emailVerified
		}
		*destination.(*model.User) = s.users[i]
		return nil
	}
	return repository.ErrNotFound
}

func (s *frontendContractStore) UpdateMany(
	context.Context,
	string,
	repository.Filter,
	repository.Filter,
) (int64, error) {
	return 0, nil
}

func (s *frontendContractStore) DeleteOne(
	context.Context,
	string,
	repository.Filter,
) error {
	return repository.ErrNotFound
}

func (s *frontendContractStore) Count(
	context.Context,
	string,
	repository.Filter,
) (int64, error) {
	return 0, nil
}

func (s *frontendContractStore) WithTransaction(
	ctx context.Context,
	fn repository.TransactionFunc,
) (any, error) {
	s.transactionRuns++
	return fn(ctx)
}

func (s *frontendContractStore) CreateFinancialTransaction(
	context.Context,
	*model.Transaction,
	string,
	*time.Time,
	*model.AuditEvent,
) (*model.Transaction, error) {
	return nil, errors.New("unexpected financial transaction")
}

const frontendContractAccessCode = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

func frontendContractAccessCodeHash(t *testing.T, code string) string {
	t.Helper()
	decoded, err := base64.RawURLEncoding.DecodeString(code)
	if err != nil || len(decoded) != 32 {
		t.Fatalf("invalid access-code fixture %q: %v", code, err)
	}
	sum := sha256.Sum256([]byte(code))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func TestFrontendAuthWorkspaceAndAuditContracts(t *testing.T) {
	store := &frontendContractStore{}
	auth := service.NewAuthService(store, time.Hour)
	finance := service.NewFinanceService(store, service.NewAccessService(store))
	api := NewAPI(auth, finance, nil, 2048)

	registerRecorder := httptest.NewRecorder()
	registerRequest := jsonRequest(
		http.MethodPost,
		"/api/v1/auth/register",
		`{
			"name":"Ananya Sharma",
			"email":"ananya@example.test",
			"password":"MoneyTracking!2026",
			"locale":"en-IN",
			"preferredCurrency":"INR",
			"termsAccepted":true
		}`,
	)
	api.Register(registerRecorder, registerRequest)

	if registerRecorder.Code != http.StatusCreated {
		t.Fatalf(
			"register status = %d, want %d; body = %s",
			registerRecorder.Code,
			http.StatusCreated,
			registerRecorder.Body.String(),
		)
	}
	assertJSONContentType(t, registerRecorder)
	var registered service.AuthResult
	if err := json.Unmarshal(registerRecorder.Body.Bytes(), &registered); err != nil {
		t.Fatalf("decode register response: %v", err)
	}
	if registered.User == nil ||
		registered.User.ID == "" ||
		registered.User.Name != "Ananya Sharma" ||
		registered.Token == "" ||
		registered.SessionID == "" ||
		registered.ExpiresAt.IsZero() {
		t.Fatalf("register response = %#v", registered)
	}
	assertSensitiveAuthFieldsOmitted(t, registerRecorder.Body.Bytes())
	if store.transactionRuns != 1 {
		t.Fatalf("registration transaction runs = %d, want 1", store.transactionRuns)
	}

	loginRecorder := httptest.NewRecorder()
	loginRequest := jsonRequest(
		http.MethodPost,
		"/api/v1/auth/login",
		`{"email":" ANANYA@EXAMPLE.TEST ","password":"MoneyTracking!2026"}`,
	)
	api.Login(loginRecorder, loginRequest)

	if loginRecorder.Code != http.StatusOK {
		t.Fatalf(
			"login status = %d, want %d; body = %s",
			loginRecorder.Code,
			http.StatusOK,
			loginRecorder.Body.String(),
		)
	}
	assertJSONContentType(t, loginRecorder)
	var loggedIn service.AuthResult
	if err := json.Unmarshal(loginRecorder.Body.Bytes(), &loggedIn); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if loggedIn.User == nil ||
		loggedIn.User.ID != registered.User.ID ||
		loggedIn.User.Name != registered.User.Name ||
		loggedIn.Token == "" ||
		loggedIn.Token == registered.Token {
		t.Fatalf("login response = %#v", loggedIn)
	}
	assertSensitiveAuthFieldsOmitted(t, loginRecorder.Body.Bytes())

	meRecorder := serveAuthenticated(
		api,
		loggedIn.Token,
		httptest.NewRequest(http.MethodGet, "/api/v1/me", nil),
		api.Me,
	)
	if meRecorder.Code != http.StatusOK {
		t.Fatalf("me status = %d, want %d; body = %s", meRecorder.Code, http.StatusOK, meRecorder.Body.String())
	}
	var me struct {
		Email             string `json:"email"`
		Name              string `json:"name"`
		PreferredCurrency string `json:"preferredCurrency"`
	}
	if err := json.Unmarshal(meRecorder.Body.Bytes(), &me); err != nil {
		t.Fatalf("decode me response: %v", err)
	}
	if me.Email != "ananya@example.test" ||
		me.Name != "Ananya Sharma" ||
		me.PreferredCurrency != "INR" {
		t.Fatalf("me response = %#v", me)
	}
	assertSensitiveAuthFieldsOmitted(t, meRecorder.Body.Bytes())
	assertProfileInternalFieldsOmitted(t, meRecorder.Body.Bytes())

	preferencesRecorder := serveAuthenticated(
		api,
		loggedIn.Token,
		jsonRequest(
			http.MethodPatch,
			"/api/v1/me",
			`{"preferredCurrency":"usd"}`,
		),
		api.UpdateMe,
	)
	if preferencesRecorder.Code != http.StatusOK {
		t.Fatalf(
			"update preferences status = %d, want %d; body = %s",
			preferencesRecorder.Code,
			http.StatusOK,
			preferencesRecorder.Body.String(),
		)
	}
	var updatedUser struct {
		Email             string `json:"email"`
		Name              string `json:"name"`
		PreferredCurrency string `json:"preferredCurrency"`
	}
	if err := json.Unmarshal(preferencesRecorder.Body.Bytes(), &updatedUser); err != nil {
		t.Fatalf("decode updated user response: %v", err)
	}
	if updatedUser.Email != "ananya@example.test" || updatedUser.PreferredCurrency != "USD" {
		t.Fatalf("updated user response = %#v", updatedUser)
	}
	assertSensitiveAuthFieldsOmitted(t, preferencesRecorder.Body.Bytes())
	assertProfileInternalFieldsOmitted(t, preferencesRecorder.Body.Bytes())

	workspacesRecorder := serveAuthenticated(
		api,
		loggedIn.Token,
		httptest.NewRequest(http.MethodGet, "/api/v1/workspaces", nil),
		api.Workspaces,
	)
	if workspacesRecorder.Code != http.StatusOK {
		t.Fatalf(
			"workspaces status = %d, want %d; body = %s",
			workspacesRecorder.Code,
			http.StatusOK,
			workspacesRecorder.Body.String(),
		)
	}
	var workspaces struct {
		Items []service.WorkspaceSummary `json:"items"`
	}
	if err := json.Unmarshal(workspacesRecorder.Body.Bytes(), &workspaces); err != nil {
		t.Fatalf("decode workspaces response: %v", err)
	}
	if len(workspaces.Items) != 1 {
		t.Fatalf("workspace items = %#v, want one item", workspaces.Items)
	}
	workspace := workspaces.Items[0]
	if workspace.ID == "" ||
		workspace.Role != "owner" ||
		workspace.MemberCount != 1 ||
		!hasString(workspace.Permissions, model.PermViewWorkspace) ||
		!hasString(workspace.Permissions, model.PermCreateTransactions) ||
		!hasString(workspace.Permissions, model.PermViewAudit) {
		t.Fatalf("workspace summary = %#v", workspace)
	}

	store.auditEvents = []model.AuditEvent{{
		ID:          "audit-a",
		WorkspaceID: workspace.ID,
		ActorID:     registered.User.ID,
		Action:      "workspace.created",
		EntityType:  "workspace",
		EntityID:    workspace.ID,
		CreatedAt:   time.Now().UTC(),
	}}
	auditRequest := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/workspaces/"+workspace.ID+"/audit",
		nil,
	)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("workspaceID", workspace.ID)
	auditRequest = auditRequest.WithContext(
		context.WithValue(auditRequest.Context(), chi.RouteCtxKey, routeContext),
	)
	auditRecorder := serveAuthenticated(
		api,
		loggedIn.Token,
		auditRequest,
		api.Audit,
	)
	if auditRecorder.Code != http.StatusOK {
		t.Fatalf("audit status = %d, want %d; body = %s", auditRecorder.Code, http.StatusOK, auditRecorder.Body.String())
	}
	var audit struct {
		Items []model.AuditEvent `json:"items"`
	}
	if err := json.Unmarshal(auditRecorder.Body.Bytes(), &audit); err != nil {
		t.Fatalf("decode audit response: %v", err)
	}
	if len(audit.Items) != 1 ||
		audit.Items[0].ID != "audit-a" ||
		audit.Items[0].WorkspaceID != workspace.ID {
		t.Fatalf("audit items = %#v", audit.Items)
	}
}

func TestAcceptInvitationReturnsSafeMembershipView(t *testing.T) {
	store := &frontendContractStore{}
	auth := service.NewAuthService(store, time.Hour)
	finance := service.NewFinanceService(store, service.NewAccessService(store))
	api := NewAPI(auth, finance, nil, 2048)

	owner, err := auth.Register(context.Background(), service.RegisterInput{
		Name:              "Ananya Sharma",
		Email:             "ananya@example.test",
		Password:          "MoneyTracking!2026",
		Locale:            "en-IN",
		PreferredCurrency: "INR",
		TermsAccepted:     true,
	}, "test", "127.0.0.1")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	invitee, err := auth.Register(context.Background(), service.RegisterInput{
		Name:              "Bina Rao",
		Email:             "bina@example.test",
		Password:          "MoneyTracking!2026",
		Locale:            "en-IN",
		PreferredCurrency: "INR",
		TermsAccepted:     true,
	}, "test", "127.0.0.1")
	if err != nil {
		t.Fatalf("invitee register: %v", err)
	}
	store.invitations = append(store.invitations, model.Invitation{
		ID:          "invitation-a",
		WorkspaceID: store.workspaces[0].ID,
		InviterID:   owner.User.ID,
		Email:       invitee.User.Email,
		Role:        "member",
		Permissions: []string{model.PermViewTransactions},
		TokenHash:   frontendContractAccessCodeHash(t, frontendContractAccessCode),
		Status:      "pending",
		ExpiresAt:   time.Now().UTC().Add(time.Hour),
	})
	recorder := serveAuthenticated(
		api,
		invitee.Token,
		jsonRequest(http.MethodPost, "/api/v1/invitations/accept", `{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}`),
		api.AcceptInvitation,
	)
	if recorder.Code != http.StatusOK {
		t.Fatalf("accept status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode acceptance response: %v", err)
	}
	if response["workspaceId"] != store.workspaces[0].ID || response["role"] != "member" {
		t.Fatalf("acceptance response = %#v", response)
	}
	if _, exists := response["userId"]; exists {
		t.Fatalf("acceptance leaked userId: %s", recorder.Body.String())
	}
	if _, exists := response["id"]; exists {
		t.Fatalf("acceptance leaked membership id: %s", recorder.Body.String())
	}
}

func TestWorkspaceJoinRequestAcceptsDirectInvitationToken(t *testing.T) {
	codeHash := frontendContractAccessCodeHash(t, frontendContractAccessCode)
	store := &frontendContractStore{
		memberships: []model.Membership{{
			ID: "owner-membership", WorkspaceID: "workspace-a", UserID: "owner-a", Role: "owner",
		}},
		invitations: []model.Invitation{{
			ID: "invitation-a", WorkspaceID: "workspace-a", InviterID: "owner-a",
			Email: "member@example.test", Role: "member",
			Permissions: []string{model.PermViewTransactions}, TokenHash: codeHash, Status: "pending",
			ExpiresAt: time.Now().UTC().Add(time.Hour),
		}},
	}
	finance := service.NewFinanceService(store, service.NewAccessService(store))
	api := NewAPI(nil, finance, nil, 2048)
	request := jsonRequest(
		http.MethodPost,
		"/api/v1/workspace-join-requests",
		`{"code":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}`,
	)
	request = request.WithContext(context.WithValue(
		request.Context(), userContextKey,
		&model.User{ID: "member-a", Name: "Member", Email: "member@example.test", EmailVerified: true},
	))
	recorder := httptest.NewRecorder()
	api.RequestWorkspaceJoin(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("unified invitation status = %d, want %d; body = %s", recorder.Code, http.StatusCreated, recorder.Body.String())
	}
	var response struct {
		WorkspaceID string   `json:"workspaceId"`
		Status      string   `json:"status"`
		Role        string   `json:"role"`
		Permissions []string `json:"permissions"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode unified invitation response: %v", err)
	}
	if response.WorkspaceID != "workspace-a" || response.Status != "joined" || response.Role != "member" {
		t.Fatalf("unified invitation response = %#v", response)
	}
	if len(response.Permissions) != 1 || response.Permissions[0] != model.PermViewTransactions {
		t.Fatalf("unified invitation permissions = %#v", response.Permissions)
	}
}

func TestWorkspaceJoinRequestKeepsTemporaryCodePending(t *testing.T) {
	codeHash := frontendContractAccessCodeHash(t, frontendContractAccessCode)
	store := &frontendContractStore{
		workspaces: []model.Workspace{{
			ID: "workspace-a", Name: "Finance", Visibility: "private",
			JoinCodeHash: codeHash, JoinCodeExpiresAt: time.Now().UTC().Add(time.Minute),
		}},
	}
	finance := service.NewFinanceService(store, service.NewAccessService(store))
	api := NewAPI(nil, finance, nil, 2048)
	request := jsonRequest(
		http.MethodPost,
		"/api/v1/workspace-join-requests",
		`{"code":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}`,
	)
	request = request.WithContext(context.WithValue(
		request.Context(), userContextKey,
		&model.User{ID: "member-a", Name: "Member", Email: "member@example.test"},
	))
	recorder := httptest.NewRecorder()
	api.RequestWorkspaceJoin(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("temporary code status = %d, want %d; body = %s", recorder.Code, http.StatusCreated, recorder.Body.String())
	}
	var response struct {
		WorkspaceName string `json:"workspaceName"`
		Status        string `json:"status"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode temporary code response: %v", err)
	}
	if response.WorkspaceName != "Finance" || response.Status != "pending" {
		t.Fatalf("temporary code response = %#v", response)
	}
	if len(store.workspaceJoinRequests) != 1 || store.invitationLookups != 0 {
		t.Fatalf("temporary code persistence/fallback = requests:%d invitations:%d", len(store.workspaceJoinRequests), store.invitationLookups)
	}
}

func TestWorkspaceJoinRequestDoesNotFallbackAfterConflict(t *testing.T) {
	codeHash := frontendContractAccessCodeHash(t, frontendContractAccessCode)
	store := &frontendContractStore{
		workspaces: []model.Workspace{{
			ID: "workspace-a", Name: "Finance", Visibility: "private",
			JoinCodeHash: codeHash, JoinCodeExpiresAt: time.Now().UTC().Add(time.Minute),
		}},
		memberships: []model.Membership{{
			WorkspaceID: "workspace-a", UserID: "owner-a", Role: "owner",
		}},
		invitations: []model.Invitation{{
			ID: "invitation-a", WorkspaceID: "workspace-a", InviterID: "owner-a",
			Email: "owner@example.test", Role: "member", TokenHash: codeHash, Status: "pending",
			ExpiresAt: time.Now().UTC().Add(time.Hour),
		}},
	}
	finance := service.NewFinanceService(store, service.NewAccessService(store))
	api := NewAPI(nil, finance, nil, 2048)
	request := jsonRequest(
		http.MethodPost,
		"/api/v1/workspace-join-requests",
		`{"code":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}`,
	)
	request = request.WithContext(context.WithValue(
		request.Context(), userContextKey,
		&model.User{ID: "owner-a", Name: "Owner", Email: "owner@example.test", EmailVerified: true},
	))
	recorder := httptest.NewRecorder()
	api.RequestWorkspaceJoin(recorder, request)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("conflicting code status = %d, want %d; body = %s", recorder.Code, http.StatusConflict, recorder.Body.String())
	}
	if store.invitationLookups != 0 {
		t.Fatalf("conflict attempted %d invitation fallback lookups", store.invitationLookups)
	}
}

func TestWorkspaceJoinRequestRejectsUnavailableDirectInvitationCodes(t *testing.T) {
	now := time.Now().UTC()
	validHash := frontendContractAccessCodeHash(t, frontendContractAccessCode)
	tests := []struct {
		name      string
		code      string
		email     string
		status    string
		expiresAt time.Time
		want      int
	}{
		{
			name:  "different valid-shaped token",
			code:  strings.Repeat("B", len(frontendContractAccessCode)),
			email: "member@example.test", status: "pending", expiresAt: now.Add(time.Hour), want: http.StatusNotFound,
		},
		{
			name:  "expired invitation",
			code:  frontendContractAccessCode,
			email: "member@example.test", status: "pending", expiresAt: now.Add(-time.Minute), want: http.StatusNotFound,
		},
		{
			name:  "cancelled invitation",
			code:  frontendContractAccessCode,
			email: "member@example.test", status: "cancelled", expiresAt: now.Add(time.Hour), want: http.StatusNotFound,
		},
		{
			name:  "different invited email",
			code:  frontendContractAccessCode,
			email: "other@example.test", status: "pending", expiresAt: now.Add(time.Hour), want: http.StatusForbidden,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := &frontendContractStore{
				invitations: []model.Invitation{{
					ID: "invitation-a", WorkspaceID: "workspace-a", InviterID: "owner-a",
					Email: test.email, Role: "member", TokenHash: validHash, Status: test.status, ExpiresAt: test.expiresAt,
				}},
			}
			finance := service.NewFinanceService(store, service.NewAccessService(store))
			api := NewAPI(nil, finance, nil, 2048)
			request := jsonRequest(
				http.MethodPost,
				"/api/v1/workspace-join-requests",
				`{"code":"`+test.code+`"}`,
			)
			request = request.WithContext(context.WithValue(
				request.Context(), userContextKey,
				&model.User{ID: "member-a", Name: "Member", Email: "member@example.test", EmailVerified: true},
			))
			recorder := httptest.NewRecorder()
			api.RequestWorkspaceJoin(recorder, request)

			if recorder.Code != test.want {
				t.Fatalf("status = %d, want %d; body = %s", recorder.Code, test.want, recorder.Body.String())
			}
		})
	}
}

func TestWorkspaceJoinRequestRejectsInvalidOrExpiredTemporaryCodes(t *testing.T) {
	now := time.Now().UTC()
	validHash := frontendContractAccessCodeHash(t, frontendContractAccessCode)
	tests := []struct {
		name      string
		code      string
		expiresAt time.Time
	}{
		{
			name:      "different valid-shaped token",
			code:      strings.Repeat("B", len(frontendContractAccessCode)),
			expiresAt: now.Add(time.Hour),
		},
		{
			name:      "expired code",
			code:      frontendContractAccessCode,
			expiresAt: now.Add(-time.Minute),
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := &frontendContractStore{
				workspaces: []model.Workspace{{
					ID: "workspace-a", Name: "Finance", Visibility: "private",
					JoinCodeHash: validHash, JoinCodeExpiresAt: test.expiresAt,
				}},
			}
			finance := service.NewFinanceService(store, service.NewAccessService(store))
			api := NewAPI(nil, finance, nil, 2048)
			request := jsonRequest(
				http.MethodPost,
				"/api/v1/workspace-join-requests",
				`{"code":"`+test.code+`"}`,
			)
			request = request.WithContext(context.WithValue(
				request.Context(), userContextKey,
				&model.User{ID: "member-a", Name: "Member", Email: "member@example.test"},
			))
			recorder := httptest.NewRecorder()
			api.RequestWorkspaceJoin(recorder, request)

			if recorder.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want %d; body = %s", recorder.Code, http.StatusNotFound, recorder.Body.String())
			}
			if len(store.workspaceJoinRequests) != 0 {
				t.Fatalf("unavailable temporary code created %d join requests", len(store.workspaceJoinRequests))
			}
		})
	}
}

func TestWorkspaceJoinRequestDoesNotFallbackAfterWorkspaceLookupFailure(t *testing.T) {
	store := &frontendContractStore{
		findOneErrors: map[string]error{"workspaces": errors.New("database unavailable")},
		invitations: []model.Invitation{{
			ID: "invitation-a", WorkspaceID: "workspace-a", InviterID: "owner-a",
			Email: "member@example.test", Role: "member",
			TokenHash: frontendContractAccessCodeHash(t, frontendContractAccessCode), Status: "pending", ExpiresAt: time.Now().UTC().Add(time.Hour),
		}},
	}
	finance := service.NewFinanceService(store, service.NewAccessService(store))
	api := NewAPI(nil, finance, nil, 2048)
	request := jsonRequest(
		http.MethodPost,
		"/api/v1/workspace-join-requests",
		`{"code":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}`,
	)
	request = request.WithContext(context.WithValue(
		request.Context(), userContextKey,
		&model.User{ID: "member-a", Name: "Member", Email: "member@example.test", EmailVerified: true},
	))
	recorder := httptest.NewRecorder()
	api.RequestWorkspaceJoin(recorder, request)

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d; body = %s", recorder.Code, http.StatusInternalServerError, recorder.Body.String())
	}
	if store.invitationLookups != 0 {
		t.Fatalf("workspace lookup failure attempted %d invitation fallback lookups", store.invitationLookups)
	}
}

func TestWorkspaceJoinCodeResponseContainsOnlySafeFields(t *testing.T) {
	expiresAt := time.Date(2026, time.August, 2, 12, 3, 0, 0, time.UTC)
	payload, err := json.Marshal(service.WorkspaceJoinCodeResult{
		Code:      "join-code",
		ExpiresAt: expiresAt,
	})
	if err != nil {
		t.Fatalf("marshal join-code response: %v", err)
	}

	var response map[string]any
	if err := json.Unmarshal(payload, &response); err != nil {
		t.Fatalf("decode join-code response: %v", err)
	}
	if response["code"] != "join-code" {
		t.Fatalf("code = %#v, want join-code", response["code"])
	}
	if response["expiresAt"] != expiresAt.Format(time.RFC3339Nano) {
		t.Fatalf("expiresAt = %#v, want %s", response["expiresAt"], expiresAt.Format(time.RFC3339Nano))
	}
	for _, field := range []string{"joinCodeHash", "join_code_hash", "userId", "membershipId"} {
		if _, exists := response[field]; exists {
			t.Fatalf("join-code response leaked %q: %s", field, payload)
		}
	}
}

func TestMutationHandlersReturnStrictJSONErrorEnvelopes(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		body        string
		maxBody     int64
		wantStatus  int
		wantCode    string
	}{
		{
			name:        "unknown field",
			contentType: "application/json",
			body: `{
				"name":"Ananya Sharma",
				"email":"ananya@example.test",
				"password":"MoneyTracking!2026",
				"preferredCurrency":"INR",
				"termsAccepted":true,
				"isAdmin":true
			}`,
			maxBody:    2048,
			wantStatus: http.StatusBadRequest,
			wantCode:   "invalid_json",
		},
		{
			name:        "non JSON content type",
			contentType: "text/plain",
			body:        `{"email":"ananya@example.test","password":"MoneyTracking!2026"}`,
			maxBody:     2048,
			wantStatus:  http.StatusUnsupportedMediaType,
			wantCode:    "unsupported_media_type",
		},
		{
			name:        "oversized body",
			contentType: "application/json",
			body:        `{"email":"ananya@example.test","password":"MoneyTracking!2026"}`,
			maxBody:     16,
			wantStatus:  http.StatusRequestEntityTooLarge,
			wantCode:    "request_too_large",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := &frontendContractStore{}
			api := NewAPI(
				service.NewAuthService(store, time.Hour),
				nil,
				nil,
				test.maxBody,
			)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api/v1/auth/register",
				strings.NewReader(test.body),
			)
			request.Header.Set("Content-Type", test.contentType)
			recorder := httptest.NewRecorder()

			api.Register(recorder, request)

			if recorder.Code != test.wantStatus {
				t.Fatalf(
					"status = %d, want %d; body = %s",
					recorder.Code,
					test.wantStatus,
					recorder.Body.String(),
				)
			}
			assertJSONContentType(t, recorder)
			var response errorEnvelope
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatalf("decode error response: %v", err)
			}
			if response.Error.Code != test.wantCode ||
				response.Error.Message == "" {
				t.Fatalf("error response = %#v", response)
			}
			if store.transactionRuns != 0 ||
				len(store.users) != 0 ||
				len(store.sessions) != 0 {
				t.Fatalf("rejected request reached persistence: %#v", store)
			}
		})
	}
}

func jsonRequest(method, target, body string) *http.Request {
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	return request
}

func serveAuthenticated(
	api *API,
	token string,
	request *http.Request,
	next http.HandlerFunc,
) *httptest.ResponseRecorder {
	request.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	api.Authenticate(next).ServeHTTP(recorder, request)
	return recorder
}

func assertJSONContentType(t *testing.T, recorder *httptest.ResponseRecorder) {
	t.Helper()
	if contentType := recorder.Header().Get("Content-Type"); !strings.HasPrefix(contentType, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", contentType)
	}
}

func assertSensitiveAuthFieldsOmitted(t *testing.T, payload []byte) {
	t.Helper()
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		t.Fatalf("decode auth document: %v", err)
	}
	user, ok := document["user"].(map[string]any)
	if !ok {
		user = document
	}
	for _, field := range []string{"passwordHash", "password_hash", "tokenHash", "token_hash"} {
		if _, exists := user[field]; exists {
			t.Fatalf("sensitive field %q leaked in %s", field, payload)
		}
	}
}

func assertProfileInternalFieldsOmitted(t *testing.T, payload []byte) {
	t.Helper()
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		t.Fatalf("decode profile document: %v", err)
	}
	for _, field := range []string{"id", "_id", "userId", "passwordHash", "password_hash", "token", "tokenHash", "token_hash"} {
		if _, exists := document[field]; exists {
			t.Fatalf("profile field %q leaked in %s", field, payload)
		}
	}
}

func hasString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
