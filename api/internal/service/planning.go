package service

import (
	"context"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type BudgetInput struct {
	VaultID     string    `json:"vaultId"`
	Name        string    `json:"name"`
	AmountMinor int64     `json:"amountMinor"`
	Currency    string    `json:"currency"`
	Period      string    `json:"period"`
	Categories  []string  `json:"categories"`
	Rollover    bool      `json:"rollover"`
	StartAt     time.Time `json:"startAt"`
	EndAt       time.Time `json:"endAt"`
}

func (s *FinanceService) CreateBudget(ctx context.Context, workspaceID, actorID string, input BudgetInput) (*model.Budget, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageBudgets); err != nil {
		return nil, err
	}
	input.VaultID = strings.TrimSpace(input.VaultID)
	if err := validateMoney("amountMinor", input.AmountMinor, false); err != nil {
		return nil, err
	}
	if !input.EndAt.After(input.StartAt) {
		return nil, &FieldError{Field: "endAt", Message: "must be after startAt"}
	}
	currency, err := validCurrency(input.Currency)
	if err != nil {
		return nil, err
	}
	if input.VaultID != "" {
		vault, err := s.requireVault(ctx, workspaceID, actorID, input.VaultID)
		if err != nil {
			return nil, err
		}
		if currency != vault.Currency {
			return nil, &FieldError{Field: "currency", Message: "must match the vault currency"}
		}
	}
	now := time.Now().UTC()
	name, err := validatedText("name", input.Name, 1, 100)
	if err != nil {
		return nil, err
	}
	period, err := validatedText("period", valueOrDefault(strings.ToLower(strings.TrimSpace(input.Period)), "custom"), 1, 50)
	if err != nil {
		return nil, err
	}
	budget := &model.Budget{
		ID: newID(), WorkspaceID: workspaceID, VaultID: input.VaultID,
		Name: name, AmountMinor: input.AmountMinor, Currency: currency,
		Period:     period,
		Categories: normalizedTags(input.Categories), Rollover: input.Rollover,
		StartAt: input.StartAt.UTC(), EndAt: input.EndAt.UTC(), CreatedBy: actorID,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := s.insertWithAudit(
		ctx,
		"budgets",
		budget,
		newAuditEvent(workspaceID, actorID, "budget.created", "budget", budget.ID, nil),
	); err != nil {
		return nil, err
	}
	return budget, nil
}

type GoalInput struct {
	VaultID      string     `json:"vaultId"`
	Name         string     `json:"name"`
	Description  string     `json:"description"`
	Type         string     `json:"type"`
	CustomType   string     `json:"customType"`
	Direction    string     `json:"direction"`
	TargetMinor  int64      `json:"targetMinor"`
	CurrentMinor int64      `json:"currentMinor"`
	Currency     string     `json:"currency"`
	StartDate    *time.Time `json:"startDate"`
	TargetDate   *time.Time `json:"targetDate"`
	DueDate      *time.Time `json:"dueDate"`
	Visibility   string     `json:"visibility"`
	ContactID    string     `json:"contactId"`
	ContactName  string     `json:"contactName"`
	AccountID    string     `json:"accountId"`
	Category     string     `json:"category"`
	Reminder     string     `json:"reminder"`
	Notes        string     `json:"notes"`
}

func (s *FinanceService) CreateGoal(ctx context.Context, workspaceID, actorID string, input GoalInput) (*model.Goal, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermManageGoals); err != nil {
		return nil, err
	}
	input.VaultID = strings.TrimSpace(input.VaultID)
	if err := validateMoney("targetMinor", input.TargetMinor, false); err != nil {
		return nil, err
	}
	if input.CurrentMinor < 0 || input.CurrentMinor > input.TargetMinor {
		return nil, &FieldError{Field: "currentMinor", Message: "must be between zero and targetMinor"}
	}
	currency, err := validCurrency(input.Currency)
	if err != nil {
		return nil, err
	}
	if input.VaultID != "" {
		vault, err := s.requireVault(ctx, workspaceID, actorID, input.VaultID)
		if err != nil {
			return nil, err
		}
		if currency != vault.Currency {
			return nil, &FieldError{Field: "currency", Message: "must match the vault currency"}
		}
	}
	visibility := valueOrDefault(strings.ToLower(strings.TrimSpace(input.Visibility)), "workspace")
	if visibility != "workspace" && visibility != "private" {
		return nil, &FieldError{Field: "visibility", Message: "must be workspace or private"}
	}
	name, err := validatedText("name", input.Name, 1, 100)
	if err != nil {
		return nil, err
	}
	input, err = s.normalizeGoalFields(ctx, workspaceID, actorID, input, model.Goal{})
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	goal := &model.Goal{
		ID: newID(), WorkspaceID: workspaceID, VaultID: input.VaultID,
		Name: name, Description: input.Description, Type: input.Type, CustomType: input.CustomType,
		Direction: input.Direction, TargetMinor: input.TargetMinor, CurrentMinor: input.CurrentMinor,
		Currency: currency, StartDate: input.StartDate, TargetDate: input.TargetDate, DueDate: input.DueDate,
		Visibility: visibility, ContactID: input.ContactID, ContactName: input.ContactName,
		AccountID: input.AccountID, Category: input.Category, Reminder: input.Reminder, Notes: input.Notes,
		CreatedBy: actorID, CreatedAt: now, UpdatedAt: now,
	}
	goal.ApplyDerived(now)
	if err := s.insertWithAudit(
		ctx,
		"goals",
		goal,
		newAuditEvent(workspaceID, actorID, "goal.created", "goal", goal.ID, nil),
	); err != nil {
		return nil, err
	}
	return goal, nil
}

func goalVisibilityFilter(actorID string) repository.Filter {
	return repository.Filter{"$or": []repository.Filter{
		{"visibility": "workspace"},
		{"visibility": "private", "created_by": actorID},
		{"visibility": "selected", "created_by": actorID},
		{"visibility": ""},
		{"visibility": repository.Filter{"$exists": false}},
	}}
}

func (s *FinanceService) normalizeGoalFields(ctx context.Context, workspaceID, actorID string, input GoalInput, current model.Goal) (GoalInput, error) {
	if input.Type == "" {
		input.Type = current.Type
	}
	if input.Type == "" {
		input.Type = model.GoalTypeSavingsTarget
	}
	input.Type = strings.ToLower(strings.TrimSpace(input.Type))
	if !model.IsPredefinedGoalType(input.Type) {
		return input, &FieldError{Field: "type", Message: "must be one of the supported goal types"}
	}
	if input.Type == model.GoalTypeCustom {
		customType, err := validatedText("customType", input.CustomType, 1, 80)
		if err != nil {
			return input, err
		}
		input.CustomType = customType
	} else {
		input.CustomType = strings.TrimSpace(input.CustomType)
	}
	if input.Direction == "" {
		input.Direction = current.Direction
	}
	if input.Direction == "" {
		input.Direction = model.DefaultGoalDirection(input.Type)
	}
	input.Direction = strings.ToLower(strings.TrimSpace(input.Direction))
	switch input.Direction {
	case model.GoalDirectionReceive, model.GoalDirectionPay, model.GoalDirectionSave, model.GoalDirectionNeutral:
	default:
		return input, &FieldError{Field: "direction", Message: "must be receive, pay, save, or neutral"}
	}
	var err error
	if input.Description, err = validatedText("description", input.Description, 0, 500); err != nil {
		return input, err
	}
	if input.Category, err = validatedText("category", input.Category, 0, 100); err != nil {
		return input, err
	}
	if input.Reminder, err = validatedText("reminder", input.Reminder, 0, 100); err != nil {
		return input, err
	}
	if input.Notes, err = validatedText("notes", input.Notes, 0, 2000); err != nil {
		return input, err
	}
	if input.StartDate != nil {
		value := input.StartDate.UTC()
		input.StartDate = &value
	}
	if input.TargetDate == nil {
		input.TargetDate = input.DueDate
	}
	if input.DueDate == nil {
		input.DueDate = input.TargetDate
	}
	if input.TargetDate != nil {
		value := input.TargetDate.UTC()
		input.TargetDate = &value
	}
	if input.DueDate != nil {
		value := input.DueDate.UTC()
		input.DueDate = &value
	}
	if input.StartDate != nil && input.DueDate != nil && input.DueDate.Before(*input.StartDate) {
		return input, &FieldError{Field: "dueDate", Message: "must be on or after startDate"}
	}
	if input.ContactID == "" {
		input.ContactID = current.ContactID
	}
	if input.ContactName == "" {
		input.ContactName = current.ContactName
	}
	if input.ContactID != "" {
		input.ContactID, err = s.validContactID(ctx, workspaceID, input.ContactID)
		if err != nil {
			return input, err
		}
	} else if strings.TrimSpace(input.ContactName) != "" {
		contact, err := s.findOrCreateContact(ctx, workspaceID, actorID, ContactInput{Name: input.ContactName})
		if err != nil {
			return input, err
		}
		input.ContactID, input.ContactName = contact.ID, contact.Name
	}
	if input.AccountID == "" {
		input.AccountID = current.AccountID
	}
	if input.AccountID != "" {
		account, err := s.requireAccount(ctx, workspaceID, actorID, input.AccountID)
		if err != nil {
			return input, &FieldError{Field: "accountId", Message: "must reference an account in this workspace"}
		}
		if accountIsInactive(account) {
			return input, &FieldError{Field: "accountId", Message: "must reference an active account"}
		}
		if account.Currency != strings.ToUpper(strings.TrimSpace(input.Currency)) {
			return input, &FieldError{Field: "accountId", Message: "must use the goal currency"}
		}
	}
	return input, nil
}
