package service

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type ContactInput struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Email string `json:"email"`
	Notes string `json:"notes"`
}
type SavedTransactionNameInput struct {
	Name string `json:"name"`
}

func searchFilter(workspaceID, query string, fields ...string) repository.Filter {
	f := repository.Filter{"workspace_id": workspaceID}
	if q := strings.TrimSpace(query); q != "" {
		escaped := regexp.QuoteMeta(q)
		choices := make([]repository.Filter, 0, len(fields))
		for _, field := range fields {
			choices = append(choices, repository.Filter{field: repository.Filter{"$regex": escaped, "$options": "i"}})
		}
		f["$or"] = choices
	}
	return f
}

func (s *FinanceService) ListContacts(ctx context.Context, workspaceID, actorID, query string) ([]model.Contact, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	var items []model.Contact
	err := s.store.FindMany(ctx, "contacts", searchFilter(workspaceID, query, "name", "phone", "email"), &items, 100, 0, repository.Sort{"name": 1})
	return items, err
}
func (s *FinanceService) GetContact(ctx context.Context, workspaceID, actorID, id string) (*model.Contact, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	var item model.Contact
	if err := s.store.FindOne(ctx, "contacts", repository.Filter{"_id": id, "workspace_id": workspaceID}, &item); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &item, nil
}
func normalizeContact(input ContactInput) (ContactInput, error) {
	var err error
	if input.Name, err = validatedText("name", input.Name, 1, 120); err != nil {
		return input, err
	}
	if input.Phone, err = validatedText("phone", input.Phone, 0, 40); err != nil {
		return input, err
	}
	if input.Email, err = validatedText("email", strings.ToLower(input.Email), 0, 254); err != nil {
		return input, err
	}
	if input.Email != "" && (!strings.Contains(input.Email, "@") || strings.ContainsAny(input.Email, " \t\n")) {
		return input, &FieldError{Field: "email", Message: "must be a valid email address"}
	}
	if input.Notes, err = validatedText("notes", input.Notes, 0, 2000); err != nil {
		return input, err
	}
	return input, nil
}
func (s *FinanceService) CreateContact(ctx context.Context, workspaceID, actorID string, input ContactInput) (*model.Contact, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermCreateTransactions); err != nil {
		return nil, err
	}
	input, err := normalizeContact(input)
	if err != nil {
		return nil, err
	}
	wanted := normalizedContactName(input.Name)
	words := strings.Fields(input.Name)
	legacyPattern := "^" + strings.Join(func() []string {
		patterns := make([]string, 0, len(words))
		for _, word := range words {
			patterns = append(patterns, regexp.QuoteMeta(word))
		}
		return patterns
	}(), `\s+`) + "$"
	var existing model.Contact
	if err := s.store.FindOne(ctx, "contacts", repository.Filter{
		"workspace_id": workspaceID,
		"$or": []repository.Filter{
			{"normalized_name": wanted},
			{"name": repository.Filter{"$regex": legacyPattern, "$options": "i"}},
		},
	}, &existing); err == nil {
		return &existing, nil
	} else if !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}
	now := time.Now().UTC()
	item := &model.Contact{ID: newID(), WorkspaceID: workspaceID, CreatedBy: actorID, Name: input.Name, NormalizedName: wanted, Phone: input.Phone, Email: input.Email, Notes: input.Notes, CreatedAt: now, UpdatedAt: now}
	if err = s.store.Insert(ctx, "contacts", item); err != nil {
		// A concurrent create can win the unique normalized-name index. Return
		// that canonical contact so inline goal creation remains duplicate-safe.
		if lookupErr := s.store.FindOne(ctx, "contacts", repository.Filter{
			"workspace_id": workspaceID, "normalized_name": wanted,
		}, &existing); lookupErr == nil {
			return &existing, nil
		}
		return nil, err
	}
	return item, nil
}

// findOrCreateContact supports inline goal creation without producing a new
// contact for a name that already exists in the workspace. The comparison is
// intentionally case-insensitive and whitespace-normalized while preserving
// the user's first stored spelling and contact details.
func (s *FinanceService) findOrCreateContact(ctx context.Context, workspaceID, actorID string, input ContactInput) (*model.Contact, error) {
	input, err := normalizeContact(input)
	if err != nil {
		return nil, err
	}
	wanted := normalizedContactName(input.Name)
	words := strings.Fields(input.Name)
	legacyPattern := "^" + strings.Join(func() []string {
		patterns := make([]string, 0, len(words))
		for _, word := range words {
			patterns = append(patterns, regexp.QuoteMeta(word))
		}
		return patterns
	}(), `\s+`) + "$"
	var matched model.Contact
	if err := s.store.FindOne(ctx, "contacts", repository.Filter{
		"workspace_id": workspaceID,
		"$or": []repository.Filter{
			{"normalized_name": wanted},
			{"name": repository.Filter{"$regex": legacyPattern, "$options": "i"}},
		},
	}, &matched); err == nil {
		return &matched, nil
	} else if !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}
	created, createErr := s.CreateContact(ctx, workspaceID, actorID, input)
	if createErr == nil {
		return created, nil
	}
	// A unique normalized-name index can win a concurrent inline-create race.
	// Re-read the winner so the caller still receives one canonical contact.
	var existing model.Contact
	if err := s.store.FindOne(ctx, "contacts", repository.Filter{
		"workspace_id": workspaceID, "normalized_name": wanted,
	}, &existing); err == nil {
		return &existing, nil
	}
	return nil, createErr
}

func normalizedContactName(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}
func (s *FinanceService) UpdateContact(ctx context.Context, workspaceID, actorID, id string, input ContactInput) (*model.Contact, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditAllTransactions); err != nil {
		return nil, err
	}
	input, err := normalizeContact(input)
	if err != nil {
		return nil, err
	}
	var item model.Contact
	err = s.store.UpdateOne(ctx, "contacts", repository.Filter{"_id": id, "workspace_id": workspaceID}, repository.Filter{"$set": repository.Filter{"name": input.Name, "normalized_name": normalizedContactName(input.Name), "phone": input.Phone, "email": input.Email, "notes": input.Notes, "updated_at": time.Now().UTC()}}, &item)
	return &item, err
}
func (s *FinanceService) DeleteContact(ctx context.Context, workspaceID, actorID, id string) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditAllTransactions); err != nil {
		return err
	}
	return s.store.DeleteOne(ctx, "contacts", repository.Filter{"_id": id, "workspace_id": workspaceID})
}
func (s *FinanceService) validContactID(ctx context.Context, workspaceID, id string) (string, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", nil
	}
	var c model.Contact
	if err := s.store.FindOne(ctx, "contacts", repository.Filter{"_id": id, "workspace_id": workspaceID}, &c); err != nil {
		return "", &FieldError{Field: "contactId", Message: "must reference a contact in this workspace"}
	}
	return id, nil
}
func (s *FinanceService) hydrateTransactionContacts(ctx context.Context, items []model.Transaction) error {
	ids := []string{}
	seen := map[string]bool{}
	for _, t := range items {
		if t.ContactID != "" && !seen[t.ContactID] {
			seen[t.ContactID] = true
			ids = append(ids, t.ContactID)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	var contacts []model.Contact
	if err := s.store.FindMany(ctx, "contacts", repository.Filter{"_id": repository.Filter{"$in": ids}}, &contacts, int64(len(ids)), 0, nil); err != nil {
		return err
	}
	by := map[string]model.Contact{}
	for _, c := range contacts {
		by[c.ID] = c
	}
	for i := range items {
		if c, ok := by[items[i].ContactID]; ok {
			items[i].Contact = &model.ContactSummary{ID: c.ID, Name: c.Name, Phone: c.Phone, Email: c.Email}
		}
	}
	return nil
}

func (s *FinanceService) ListSavedTransactionNames(ctx context.Context, workspaceID, actorID, query string) ([]model.SavedTransactionName, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	var items []model.SavedTransactionName
	err := s.store.FindMany(ctx, "saved_transaction_names", searchFilter(workspaceID, query, "name"), &items, 100, 0, repository.Sort{"name": 1})
	return items, err
}
func (s *FinanceService) CreateSavedTransactionName(ctx context.Context, workspaceID, actorID string, input SavedTransactionNameInput) (*model.SavedTransactionName, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermCreateTransactions); err != nil {
		return nil, err
	}
	name, err := validatedText("name", input.Name, 1, 200)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	item := &model.SavedTransactionName{ID: newID(), WorkspaceID: workspaceID, CreatedBy: actorID, Name: name, NormalizedName: strings.ToLower(name), CreatedAt: now, UpdatedAt: now}
	if err = s.store.Insert(ctx, "saved_transaction_names", item); err != nil {
		return nil, err
	}
	return item, nil
}
func (s *FinanceService) UpdateSavedTransactionName(ctx context.Context, workspaceID, actorID, id string, input SavedTransactionNameInput) (*model.SavedTransactionName, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditAllTransactions); err != nil {
		return nil, err
	}
	name, err := validatedText("name", input.Name, 1, 200)
	if err != nil {
		return nil, err
	}
	var item model.SavedTransactionName
	err = s.store.UpdateOne(ctx, "saved_transaction_names", repository.Filter{"_id": id, "workspace_id": workspaceID}, repository.Filter{"$set": repository.Filter{"name": name, "normalized_name": strings.ToLower(name), "updated_at": time.Now().UTC()}}, &item)
	return &item, err
}
func (s *FinanceService) DeleteSavedTransactionName(ctx context.Context, workspaceID, actorID, id string) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditAllTransactions); err != nil {
		return err
	}
	return s.store.DeleteOne(ctx, "saved_transaction_names", repository.Filter{"_id": id, "workspace_id": workspaceID})
}
