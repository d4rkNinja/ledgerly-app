package service

import (
	"context"
	"errors"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type AuthService struct {
	store      repository.Store
	sessionTTL time.Duration
}

type RegisterInput struct {
	Email             string `json:"email"`
	Password          string `json:"password"`
	Name              string `json:"name"`
	Locale            string `json:"locale"`
	PreferredCurrency string `json:"preferredCurrency"`
	TermsAccepted     bool   `json:"termsAccepted"`
}

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type UpdatePreferencesInput struct {
	PreferredCurrency string `json:"preferredCurrency"`
}

// UpdateProfileInput is pointer-based so PATCH distinguishes omitted fields
// from an explicit request to clear an optional value.
type UpdateProfileInput struct {
	Name              *string `json:"name,omitempty"`
	Email             *string `json:"email,omitempty"`
	PhoneNumber       *string `json:"phoneNumber,omitempty"`
	ProfileImageURL   *string `json:"profileImageUrl,omitempty"`
	PreferredCurrency *string `json:"preferredCurrency,omitempty"`
}

type AuthResult struct {
	User      *model.User `json:"user"`
	Token     string      `json:"token"`
	SessionID string      `json:"sessionId"`
	ExpiresAt time.Time   `json:"expiresAt"`
}

func NewAuthService(store repository.Store, sessionTTL time.Duration) *AuthService {
	return &AuthService{store: store, sessionTTL: sessionTTL}
}

func (s *AuthService) Register(ctx context.Context, input RegisterInput, userAgent, ip string) (*AuthResult, error) {
	email, err := validEmail(input.Email)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(input.Name)
	if len([]rune(name)) < 2 || len([]rune(name)) > 80 {
		return nil, &FieldError{Field: "name", Message: "must contain 2 to 80 characters"}
	}
	if len(input.Password) < 12 || len(input.Password) > maxPasswordBytes {
		return nil, &FieldError{Field: "password", Message: "must contain 12 to 128 characters"}
	}
	if !input.TermsAccepted {
		return nil, &FieldError{Field: "termsAccepted", Message: "must be accepted"}
	}
	currency, err := validCurrency(input.PreferredCurrency)
	if err != nil {
		return nil, err
	}
	locale, err := validatedText("locale", valueOrDefault(strings.TrimSpace(input.Locale), "en-IN"), 2, 32)
	if err != nil {
		return nil, err
	}
	hash, err := hashPassword(input.Password)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	user := &model.User{
		ID: newID(), Email: email, PasswordHash: hash, Name: name,
		Locale:            locale,
		PreferredCurrency: currency, CreatedAt: now, UpdatedAt: now,
	}
	workspace := &model.Workspace{
		ID: newID(), Name: name + "'s workspace", Type: "personal", Currency: currency,
		FinancialMonth: 1, OwnerID: user.ID, Visibility: "private", CreatedAt: now, UpdatedAt: now,
	}
	membership := &model.Membership{
		ID: newID(), WorkspaceID: workspace.ID, UserID: user.ID, Role: "owner",
		CreatedAt: now,
	}
	session, result, err := s.newSession(user, userAgent, ip)
	if err != nil {
		return nil, err
	}
	if _, err := s.store.WithTransaction(ctx, func(transactionCtx context.Context) (any, error) {
		if err := s.store.Insert(transactionCtx, "users", user); err != nil {
			return nil, err
		}
		if err := s.store.Insert(transactionCtx, "workspaces", workspace); err != nil {
			return nil, err
		}
		if err := s.store.Insert(transactionCtx, "memberships", membership); err != nil {
			return nil, err
		}
		if err := s.store.Insert(transactionCtx, "sessions", session); err != nil {
			return nil, err
		}
		return nil, nil
	}); err != nil {
		if errors.Is(err, repository.ErrConflict) {
			return nil, ErrConflict
		}
		return nil, err
	}
	return result, nil
}

func (s *AuthService) Login(ctx context.Context, input LoginInput, userAgent, ip string) (*AuthResult, error) {
	// Bound the work before password hashing. HMAC setup cost scales with very
	// long keys, so allowing a request-body-sized password would turn the
	// deliberately expensive verifier into an unauthenticated CPU amplifier.
	if len(input.Password) > maxPasswordBytes {
		return nil, ErrUnauthorized
	}
	email, err := validEmail(input.Email)
	if err != nil {
		// Keep invalid and unknown identities on the same expensive password
		// verification path as a real account to avoid a timing oracle.
		_ = verifyPassword(dummyPasswordHash, input.Password)
		return nil, ErrUnauthorized
	}
	var user model.User
	if err := s.store.FindOne(ctx, "users", repository.Filter{"email": email}, &user); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			_ = verifyPassword(dummyPasswordHash, input.Password)
			return nil, ErrUnauthorized
		}
		return nil, err
	}
	if !verifyPassword(user.PasswordHash, input.Password) {
		return nil, ErrUnauthorized
	}
	return s.createSession(ctx, &user, userAgent, ip)
}

func (s *AuthService) UpdatePreferences(
	ctx context.Context,
	userID string,
	input UpdatePreferencesInput,
) (*model.User, error) {
	currency := input.PreferredCurrency
	return s.UpdateProfile(ctx, userID, UpdateProfileInput{
		PreferredCurrency: &currency,
	})
}

func (s *AuthService) UpdateProfile(
	ctx context.Context,
	userID string,
	input UpdateProfileInput,
) (*model.User, error) {
	if input.Name == nil &&
		input.Email == nil &&
		input.PhoneNumber == nil &&
		input.ProfileImageURL == nil &&
		input.PreferredCurrency == nil {
		return nil, &FieldError{Field: "profile", Message: "at least one field is required"}
	}

	var current model.User
	if err := s.store.FindOne(ctx, "users", repository.Filter{"_id": userID}, &current); err != nil {
		return nil, err
	}

	set := repository.Filter{"updated_at": time.Now().UTC()}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if len([]rune(name)) < 2 || len([]rune(name)) > 80 {
			return nil, &FieldError{Field: "name", Message: "must contain 2 to 80 characters"}
		}
		set["name"] = name
	}
	if input.Email != nil {
		email, err := validEmail(*input.Email)
		if err != nil {
			return nil, err
		}
		if email != current.Email {
			var existing model.User
			err := s.store.FindOne(ctx, "users", repository.Filter{"email": email}, &existing)
			if err == nil && existing.ID != userID {
				return nil, ErrConflict
			}
			if err != nil && !errors.Is(err, repository.ErrNotFound) {
				return nil, err
			}
			set["email"] = email
			set["email_verified"] = false
		}
	}
	if input.PhoneNumber != nil {
		phone, err := validPhoneNumber(*input.PhoneNumber)
		if err != nil {
			return nil, err
		}
		set["phone_number"] = phone
	}
	if input.ProfileImageURL != nil {
		profileImageURL, err := validProfileImageURL(*input.ProfileImageURL)
		if err != nil {
			return nil, err
		}
		set["profile_image_url"] = profileImageURL
	}
	if input.PreferredCurrency != nil {
		currency, err := validCurrency(*input.PreferredCurrency)
		if err != nil {
			return nil, err
		}
		set["preferred_currency"] = currency
	}

	var user model.User
	if err := s.store.UpdateOne(
		ctx,
		"users",
		repository.Filter{"_id": userID},
		repository.Filter{"$set": set},
		&user,
	); err != nil {
		return nil, err
	}
	return &user, nil
}

func validPhoneNumber(raw string) (string, error) {
	phone := strings.TrimSpace(raw)
	if phone == "" {
		return "", nil
	}
	if len([]rune(phone)) < 7 || len([]rune(phone)) > 32 {
		return "", &FieldError{Field: "phoneNumber", Message: "must contain 7 to 32 characters"}
	}
	digits := 0
	for _, char := range phone {
		switch {
		case char >= '0' && char <= '9':
			digits++
		case char == '+' || char == '-' || char == '(' || char == ')' || char == '.' || char == ' ':
		default:
			return "", &FieldError{Field: "phoneNumber", Message: "contains unsupported characters"}
		}
	}
	if digits < 7 {
		return "", &FieldError{Field: "phoneNumber", Message: "must contain at least 7 digits"}
	}
	return phone, nil
}

func validProfileImageURL(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", nil
	}
	if len([]rune(value)) > 2048 {
		return "", &FieldError{Field: "profileImageUrl", Message: "must contain at most 2048 characters"}
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return "", &FieldError{Field: "profileImageUrl", Message: "must be a valid HTTPS URL"}
	}
	return value, nil
}

func (s *AuthService) Authenticate(ctx context.Context, token string) (*model.User, *model.Session, error) {
	hash, err := tokenHash(token)
	if err != nil {
		return nil, nil, ErrUnauthorized
	}
	var session model.Session
	if err := s.store.FindOne(ctx, "sessions", repository.Filter{
		"token_hash": hash, "revoked_at": nil, "expires_at": repository.Filter{"$gt": time.Now().UTC()},
	}, &session); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil, ErrUnauthorized
		}
		return nil, nil, err
	}
	var user model.User
	if err := s.store.FindOne(ctx, "users", repository.Filter{"_id": session.UserID}, &user); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil, ErrUnauthorized
		}
		return nil, nil, err
	}
	return &user, &session, nil
}

func (s *AuthService) Logout(ctx context.Context, sessionID, userID string) error {
	now := time.Now().UTC()
	var session model.Session
	err := s.store.UpdateOne(ctx, "sessions", repository.Filter{"_id": sessionID, "user_id": userID},
		repository.Filter{"$set": repository.Filter{"revoked_at": now}}, &session)
	if errors.Is(err, repository.ErrNotFound) {
		return nil
	}
	return err
}

func (s *AuthService) LogoutAll(ctx context.Context, userID string) error {
	now := time.Now().UTC()
	_, err := s.store.UpdateMany(
		ctx,
		"sessions",
		repository.Filter{"user_id": userID, "revoked_at": nil},
		repository.Filter{"$set": repository.Filter{"revoked_at": now}},
	)
	return err
}

func (s *AuthService) Sessions(ctx context.Context, userID string) ([]model.Session, error) {
	var sessions []model.Session
	err := s.store.FindMany(ctx, "sessions", repository.Filter{"user_id": userID}, &sessions, 100, 0, repository.Sort{"created_at": -1})
	return sessions, err
}

func (s *AuthService) createSession(ctx context.Context, user *model.User, userAgent, ip string) (*AuthResult, error) {
	session, result, err := s.newSession(user, userAgent, ip)
	if err != nil {
		return nil, err
	}
	if err := s.store.Insert(ctx, "sessions", session); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *AuthService) newSession(user *model.User, userAgent, ip string) (*model.Session, *AuthResult, error) {
	if s.sessionTTL <= 0 {
		return nil, nil, errors.New("session TTL must be positive")
	}
	token, hash, err := randomToken(tokenBytes)
	if err != nil {
		return nil, nil, err
	}
	now := time.Now().UTC()
	session := &model.Session{
		ID: newID(), UserID: user.ID, TokenHash: hash,
		UserAgent: truncate(strings.TrimSpace(userAgent), 240), IPAddress: truncate(strings.TrimSpace(ip), 64),
		CreatedAt: now, ExpiresAt: now.Add(s.sessionTTL),
	}
	result := &AuthResult{User: user, Token: token, SessionID: session.ID, ExpiresAt: session.ExpiresAt}
	return session, result, nil
}

func validEmail(raw string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || len(email) > 254 {
		return "", &FieldError{Field: "email", Message: "must be a valid email address"}
	}
	return email, nil
}

func validCurrency(raw string) (string, error) {
	currency := strings.ToUpper(strings.TrimSpace(raw))
	if len(currency) != 3 {
		return "", &FieldError{Field: "currency", Message: "must be an ISO 4217 three-letter code"}
	}
	for _, char := range currency {
		if char < 'A' || char > 'Z' {
			return "", &FieldError{Field: "currency", Message: "must be an ISO 4217 three-letter code"}
		}
	}
	return currency, nil
}

func valueOrDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func truncate(value string, max int) string {
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max])
}
