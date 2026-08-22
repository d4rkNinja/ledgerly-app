package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

const (
	maximumRuleConditions = 10
	maximumRuleActions    = 6
	rulePreviewScanLimit  = 500
)

type AutomationRuleInput struct {
	Name       string                `json:"name"`
	Priority   *int                  `json:"priority"`
	Enabled    *bool                 `json:"enabled"`
	Conditions []model.RuleCondition `json:"conditions"`
	Actions    []model.RuleAction    `json:"actions"`
}

func (s *FinanceService) ListAutomationRules(ctx context.Context, workspaceID, actorID string) ([]model.AutomationRule, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	return s.listAutomationRulesOrdered(ctx, workspaceID, true)
}

// listAutomationRulesOrdered returns rules in deterministic application order:
// priority ascending, then creation time, then id.
func (s *FinanceService) listAutomationRulesOrdered(ctx context.Context, workspaceID string, enabledOnly bool) ([]model.AutomationRule, error) {
	filter := repository.Filter{"workspace_id": workspaceID}
	if enabledOnly {
		filter["enabled"] = true
	}
	rules := make([]model.AutomationRule, 0)
	if err := s.store.FindMany(ctx, "automation_rules", filter, &rules, 1000, 0, nil); err != nil {
		return nil, err
	}
	sort.SliceStable(rules, func(left, right int) bool {
		if rules[left].Priority != rules[right].Priority {
			return rules[left].Priority < rules[right].Priority
		}
		if !rules[left].CreatedAt.Equal(rules[right].CreatedAt) {
			return rules[left].CreatedAt.Before(rules[right].CreatedAt)
		}
		return rules[left].ID < rules[right].ID
	})
	return rules, nil
}

func (s *FinanceService) listEnabledAutomationRulesOrdered(ctx context.Context, workspaceID string) ([]model.AutomationRule, error) {
	return s.listAutomationRulesOrdered(ctx, workspaceID, true)
}

func (s *FinanceService) CreateAutomationRule(ctx context.Context, workspaceID, actorID string, input AutomationRuleInput) (*model.AutomationRule, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditAllTransactions); err != nil {
		return nil, err
	}
	rule, err := s.normalizeAutomationRuleInput(ctx, workspaceID, input, nil)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	rule.ID = newID()
	rule.WorkspaceID = workspaceID
	rule.CreatedBy = actorID
	rule.CreatedAt = now
	rule.UpdatedAt = now
	if err := s.store.Insert(ctx, "automation_rules", rule); err != nil {
		return nil, err
	}
	if auditErr := s.audit(ctx, workspaceID, actorID, "rule.created", "automation_rule", rule.ID, map[string]any{
		"name": rule.Name,
	}); auditErr != nil {
		return nil, auditErr
	}
	return rule, nil
}

func (s *FinanceService) UpdateAutomationRule(ctx context.Context, workspaceID, actorID, ruleID string, input AutomationRuleInput) (*model.AutomationRule, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditAllTransactions); err != nil {
		return nil, err
	}
	var existing model.AutomationRule
	if err := s.store.FindOne(ctx, "automation_rules", repository.Filter{
		"_id":          ruleID,
		"workspace_id": workspaceID,
	}, &existing); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	rule, err := s.normalizeAutomationRuleInput(ctx, workspaceID, input, &existing)
	if err != nil {
		return nil, err
	}
	rule.ID = existing.ID
	rule.WorkspaceID = workspaceID
	rule.CreatedBy = existing.CreatedBy
	rule.CreatedAt = existing.CreatedAt
	rule.UpdatedAt = time.Now().UTC()
	var updated model.AutomationRule
	if err := s.store.UpdateOne(ctx, "automation_rules", repository.Filter{
		"_id":          ruleID,
		"workspace_id": workspaceID,
	}, repository.Filter{"$set": repository.Filter{
		"name":       rule.Name,
		"priority":   rule.Priority,
		"enabled":    rule.Enabled,
		"conditions": rule.Conditions,
		"actions":    rule.Actions,
		"updated_at": rule.UpdatedAt,
	}}, &updated); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if auditErr := s.audit(ctx, workspaceID, actorID, "rule.updated", "automation_rule", rule.ID, map[string]any{
		"name": rule.Name,
	}); auditErr != nil {
		return nil, auditErr
	}
	return &updated, nil
}

func (s *FinanceService) DeleteAutomationRule(ctx context.Context, workspaceID, actorID, ruleID string) error {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditAllTransactions); err != nil {
		return err
	}
	var existing model.AutomationRule
	if err := s.store.FindOne(ctx, "automation_rules", repository.Filter{
		"_id":          ruleID,
		"workspace_id": workspaceID,
	}, &existing); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	if err := s.store.DeleteOne(ctx, "automation_rules", repository.Filter{
		"_id":          ruleID,
		"workspace_id": workspaceID,
	}); err != nil {
		return err
	}
	return s.audit(ctx, workspaceID, actorID, "rule.deleted", "automation_rule", ruleID, map[string]any{
		"name": existing.Name,
	})
}

func (s *FinanceService) normalizeAutomationRuleInput(
	ctx context.Context,
	workspaceID string,
	input AutomationRuleInput,
	existing *model.AutomationRule,
) (*model.AutomationRule, error) {
	name, err := validatedText("name", input.Name, 1, 120)
	if err != nil {
		return nil, err
	}
	priority := 100
	if input.Priority != nil {
		priority = *input.Priority
	} else if existing != nil {
		priority = existing.Priority
	}
	if priority < 0 || priority > 100000 {
		return nil, &FieldError{Field: "priority", Message: "must be between 0 and 100000"}
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	} else if existing != nil {
		enabled = existing.Enabled
	}
	if len(input.Conditions) == 0 && existing == nil {
		return nil, &FieldError{Field: "conditions", Message: "must contain at least one condition"}
	}
	conditions := input.Conditions
	if len(conditions) == 0 {
		conditions = existing.Conditions
	}
	if len(conditions) > maximumRuleConditions {
		return nil, &FieldError{Field: "conditions", Message: fmt.Sprintf("must contain at most %d conditions", maximumRuleConditions)}
	}
	for index := range conditions {
		if err := validateRuleCondition(conditions[index]); err != nil {
			return nil, err
		}
	}
	actions := input.Actions
	if len(actions) == 0 && existing != nil {
		actions = existing.Actions
	}
	if len(actions) == 0 {
		return nil, &FieldError{Field: "actions", Message: "must contain at least one action"}
	}
	if len(actions) > maximumRuleActions {
		return nil, &FieldError{Field: "actions", Message: fmt.Sprintf("must contain at most %d actions", maximumRuleActions)}
	}
	for index := range actions {
		if err := s.validateRuleAction(ctx, workspaceID, actions[index]); err != nil {
			return nil, err
		}
	}
	return &model.AutomationRule{
		Name: name, Priority: priority, Enabled: enabled,
		Conditions: conditions, Actions: actions,
	}, nil
}

func validateRuleCondition(condition model.RuleCondition) error {
	field := strings.TrimSpace(condition.Field)
	operator := strings.TrimSpace(condition.Operator)
	if !model.IsValidRuleConditionField(field) {
		return &FieldError{Field: "conditions", Message: fmt.Sprintf("field %q is not supported", field)}
	}
	if !model.IsValidRuleConditionOperator(field, operator) {
		return &FieldError{Field: "conditions", Message: fmt.Sprintf("operator %q is not supported for %s", operator, field)}
	}
	switch field {
	case model.RuleConditionAmount:
		switch operator {
		case model.RuleOperatorEquals:
			if condition.MinMinor == nil || *condition.MinMinor < 0 {
				return &FieldError{Field: "conditions", Message: "amount equals requires minMinor"}
			}
		case model.RuleOperatorGreaterThan, model.RuleOperatorLessThan:
			if condition.MinMinor == nil || *condition.MinMinor < 0 {
				return &FieldError{Field: "conditions", Message: "requires a non-negative minMinor"}
			}
		case model.RuleOperatorBetween:
			if condition.MinMinor == nil || condition.MaxMinor == nil ||
				*condition.MinMinor < 0 || *condition.MaxMinor < *condition.MinMinor {
				return &FieldError{Field: "conditions", Message: "between requires minMinor and maxMinor with min <= max"}
			}
		}
	default:
		hasValue := strings.TrimSpace(condition.Value) != "" || len(condition.Values) > 0
		if operator != model.RuleOperatorTrue && operator != model.RuleOperatorFalse && !hasValue {
			return &FieldError{Field: "conditions", Message: fmt.Sprintf("%s requires a value", field)}
		}
	}
	return nil
}

func (s *FinanceService) validateRuleAction(ctx context.Context, workspaceID string, action model.RuleAction) error {
	actionType := strings.TrimSpace(action.Type)
	value := strings.TrimSpace(action.Value)
	if !model.IsValidRuleActionType(actionType) {
		return &FieldError{Field: "actions", Message: fmt.Sprintf("type %q is not supported", actionType)}
	}
	switch actionType {
	case model.RuleActionSetAccount:
		account, err := s.requireAccount(ctx, workspaceID, "", value)
		if err != nil {
			return &FieldError{Field: "actions", Message: "accountId must reference an account in this workspace"}
		}
		if accountIsInactive(account) {
			return &FieldError{Field: "actions", Message: "accountId must reference an active account"}
		}
	case model.RuleActionSetContact:
		if _, err := s.validContactID(ctx, workspaceID, value); err != nil {
			return &FieldError{Field: "actions", Message: "contactId must reference a contact in this workspace"}
		}
	case model.RuleActionRename:
		if value == "" || len([]rune(value)) > importDescriptionLimit {
			return &FieldError{Field: "actions", Message: "rename requires a name of at most 200 characters"}
		}
	case model.RuleActionSetCategory:
		if value == "" || len([]rune(value)) > 100 {
			return &FieldError{Field: "actions", Message: "set_category requires a category name"}
		}
	case model.RuleActionAddTag:
		if value == "" || strings.ContainsAny(value, ",\n") || len([]rune(value)) > 60 {
			return &FieldError{Field: "actions", Message: "add_tag requires a single tag of at most 60 characters"}
		}
	case model.RuleActionSetPrivacy:
		if !model.IsValidRulePrivacyValue(value) {
			return &FieldError{Field: "actions", Message: "privacy must be workspace or private"}
		}
	}
	return nil
}

// evaluateRuleConditions applies AND semantics over the rule's conditions
// against the transaction's current state.
func evaluateRuleConditions(rule model.AutomationRule, tx *model.Transaction) bool {
	for _, condition := range rule.Conditions {
		if !evaluateRuleCondition(condition, tx) {
			return false
		}
	}
	return len(rule.Conditions) > 0
}

func evaluateRuleCondition(condition model.RuleCondition, tx *model.Transaction) bool {
	field := strings.TrimSpace(condition.Field)
	operator := strings.TrimSpace(condition.Operator)
	matchesAny := func(target string, values ...string) bool {
		candidates := condition.Values
		if len(candidates) == 0 && strings.TrimSpace(condition.Value) != "" {
			candidates = []string{strings.TrimSpace(condition.Value)}
		}
		if len(values) > 0 {
			candidates = values
		}
		normalizedTarget := model.NormalizeRuleText(target)
		for _, candidate := range candidates {
			normalizedCandidate := model.NormalizeRuleText(candidate)
			switch operator {
			case model.RuleOperatorEquals, model.RuleOperatorIn:
				if normalizedTarget == normalizedCandidate {
					return true
				}
			case model.RuleOperatorNotEquals:
				if normalizedTarget != normalizedCandidate {
					return true
				}
			case model.RuleOperatorContains:
				if normalizedCandidate != "" && strings.Contains(normalizedTarget, normalizedCandidate) {
					return true
				}
			}
		}
		return false
	}
	switch field {
	case model.RuleConditionType:
		return matchesAny(tx.Type)
	case model.RuleConditionAccount:
		return matchesAny(tx.AccountID)
	case model.RuleConditionDescription:
		return matchesAny(strings.TrimSpace(tx.Merchant + " " + tx.Description))
	case model.RuleConditionContact:
		return matchesAny(tx.ContactID)
	case model.RuleConditionCategory:
		return matchesAny(tx.Category)
	case model.RuleConditionAmount:
		switch operator {
		case model.RuleOperatorEquals:
			return condition.MinMinor != nil && tx.AmountMinor == *condition.MinMinor
		case model.RuleOperatorGreaterThan:
			return condition.MinMinor != nil && tx.AmountMinor > *condition.MinMinor
		case model.RuleOperatorLessThan:
			return condition.MinMinor != nil && tx.AmountMinor < *condition.MinMinor
		case model.RuleOperatorBetween:
			return condition.MinMinor != nil && condition.MaxMinor != nil &&
				tx.AmountMinor >= *condition.MinMinor && tx.AmountMinor <= *condition.MaxMinor
		}
	case model.RuleConditionImported:
		isImported := tx.Source == model.TransactionSourceImport
		if operator == model.RuleOperatorTrue {
			return isImported
		}
		return !isImported
	}
	return false
}

// applyAutomationRulesToTransaction runs every enabled rule once against the
// transaction in deterministic order. Each rule fires at most once and later
// rules observe earlier modifications; no rule can loop. Every change is
// recorded on the transaction as explainable provenance.
func (s *FinanceService) applyAutomationRulesToTransaction(ctx context.Context, workspaceID string, rules []model.AutomationRule, tx *model.Transaction) error {
	for _, rule := range rules {
		if !rule.Enabled || !evaluateRuleConditions(rule, tx) {
			continue
		}
		record := model.AppliedRuleRecord{RuleID: rule.ID, RuleName: rule.Name}
		for _, action := range rule.Actions {
			changes, applied, err := s.applyRuleAction(ctx, workspaceID, action, tx)
			if err != nil {
				return err
			}
			if applied {
				record.Changes = append(record.Changes, changes...)
			}
		}
		if len(record.Changes) > 0 {
			tx.Automation = append(tx.Automation, record)
		}
	}
	return nil
}

func (s *FinanceService) applyRuleAction(ctx context.Context, workspaceID string, action model.RuleAction, tx *model.Transaction) ([]model.AppliedRuleChange, bool, error) {
	value := strings.TrimSpace(action.Value)
	track := func(field, from, to string) model.AppliedRuleChange {
		return model.AppliedRuleChange{Field: field, From: from, To: to}
	}
	switch strings.TrimSpace(action.Type) {
	case model.RuleActionSetCategory:
		if tx.Category == value {
			return nil, false, nil
		}
		previous := tx.Category
		tx.Category = value
		return []model.AppliedRuleChange{track("category", previous, value)}, true, nil
	case model.RuleActionSetContact:
		if tx.ContactID == value {
			return nil, false, nil
		}
		var contact model.Contact
		if err := s.store.FindOne(ctx, "contacts", repository.Filter{
			"_id": value, "workspace_id": workspaceID,
		}, &contact); err != nil {
			return nil, false, nil
		}
		previous := tx.ContactID
		tx.ContactID = contact.ID
		return []model.AppliedRuleChange{track("contactId", previous, contact.ID)}, true, nil
	case model.RuleActionRename:
		if tx.Merchant == value {
			return nil, false, nil
		}
		previous := tx.Merchant
		tx.Merchant = value
		return []model.AppliedRuleChange{track("merchant", previous, value)}, true, nil
	case model.RuleActionSetAccount:
		if tx.AccountID == value {
			return nil, false, nil
		}
		var account model.Account
		err := s.store.FindOne(ctx, "accounts", repository.Filter{
			"_id":          value,
			"workspace_id": workspaceID,
			"archived":     false,
		}, &account)
		if err != nil || accountIsInactive(&account) || account.Currency != tx.Currency || account.VaultID != tx.VaultID {
			return nil, false, nil
		}
		changes := []model.AppliedRuleChange{track("accountId", tx.AccountID, account.ID)}
		tx.AccountID = account.ID
		if account.Privacy != "workspace" && tx.Privacy != "private" {
			changes = append(changes, track("privacy", tx.Privacy, "private"))
			tx.Privacy = "private"
		}
		return changes, true, nil
	case model.RuleActionAddTag:
		for _, tag := range tx.Tags {
			if strings.EqualFold(tag, value) {
				return nil, false, nil
			}
		}
		tx.Tags = append(tx.Tags, value)
		return []model.AppliedRuleChange{track("tags", "", value)}, true, nil
	case model.RuleActionSetPrivacy:
		if tx.Privacy == value || !model.IsValidRulePrivacyValue(value) {
			return nil, false, nil
		}
		previous := tx.Privacy
		tx.Privacy = value
		return []model.AppliedRuleChange{track("privacy", previous, value)}, true, nil
	}
	return nil, false, nil
}

type RulePreviewResult struct {
	MatchCount int64              `json:"matchCount"`
	Samples    []PreviewSampleRow `json:"samples"`
	Scanned    int64              `json:"scanned"`
	From       time.Time          `json:"from"`
	To         time.Time          `json:"to"`
}

type PreviewSampleRow struct {
	ID          string      `json:"id"`
	Merchant    string      `json:"merchant,omitempty"`
	Type        string      `json:"type"`
	Category    string      `json:"category,omitempty"`
	AmountMinor int64       `json:"amountMinor"`
	Currency    string      `json:"currency"`
	OccurredAt  time.Time   `json:"occurredAt"`
	Changes     []model.AppliedRuleChange `json:"changes"`
}

// PreviewAutomationRule dry-runs a draft or saved rule against recent visible
// history without mutating anything so users can see the effect first.
func (s *FinanceService) PreviewAutomationRule(
	ctx context.Context,
	workspaceID, actorID string,
	input AutomationRuleInput,
	from, to *time.Time,
) (*RulePreviewResult, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermViewTransactions); err != nil {
		return nil, err
	}
	draft, err := s.normalizeAutomationRuleInput(ctx, workspaceID, input, nil)
	if err != nil {
		return nil, err
	}
	windowTo := time.Now().UTC()
	if to != nil {
		windowTo = to.UTC()
	}
	windowFrom := windowTo.AddDate(0, 0, -90)
	if from != nil {
		windowFrom = from.UTC()
	}
	queryFilter, empty, err := s.transactionQuery(ctx, workspaceID, actorID, TransactionFilter{
		From: &windowFrom,
		To:   &windowTo,
	})
	if err != nil {
		return nil, err
	}
	result := &RulePreviewResult{Samples: []PreviewSampleRow{}, From: windowFrom, To: windowTo}
	if empty {
		return result, nil
	}
	var transactions []model.Transaction
	if err := s.store.FindMany(ctx, "transactions", queryFilter, &transactions, rulePreviewScanLimit, 0, repository.Sort{"occurred_at": -1}); err != nil {
		return nil, err
	}
	result.Scanned = int64(len(transactions))
	for index := range transactions {
		candidate := transactions[index]
		if evaluateRuleConditions(*draft, &candidate) {
			result.MatchCount++
			if len(result.Samples) < 10 {
				sample := PreviewSampleRow{
					ID:          candidate.ID,
					Merchant:    candidate.Merchant,
					Type:        candidate.Type,
					Category:    candidate.Category,
					AmountMinor: candidate.AmountMinor,
					Currency:    candidate.Currency,
					OccurredAt:  candidate.OccurredAt,
					Changes:     []model.AppliedRuleChange{},
				}
				for _, action := range draft.Actions {
					preview := candidate
					if changes, applied, applyErr := s.applyRuleAction(ctx, workspaceID, action, &preview); applyErr == nil && applied {
						sample.Changes = append(sample.Changes, changes...)
					}
				}
				result.Samples = append(result.Samples, sample)
			}
		}
	}
	return result, nil
}

type RuleRunSummary struct {
	Examined int64                   `json:"examined"`
	Changed  int64                   `json:"changed"`
	Details  []RuleRunTransactionLog `json:"details,omitempty"`
}

type RuleRunTransactionLog struct {
	TransactionID string `json:"-"`
	PublicID      string `json:"transactionId"`
	Label         string `json:"label,omitempty"`
	Rules         []string `json:"rulesApplied"`
}

// RunAutomationRules manually executes enabled rules over the requested
// transactions. Balance-affecting actions are intentionally limited to
// creation time; manual runs mutate descriptive fields only and always write
// revision evidence for what changed.
func (s *FinanceService) RunAutomationRules(ctx context.Context, workspaceID, actorID string, transactionIDs []string) (*RuleRunSummary, error) {
	if _, err := s.access.Require(ctx, workspaceID, actorID, model.PermEditAllTransactions); err != nil {
		return nil, err
	}
	if len(transactionIDs) == 0 {
		return nil, &FieldError{Field: "transactionIds", Message: "must contain at least one transaction"}
	}
	if len(transactionIDs) > 200 {
		return nil, &FieldError{Field: "transactionIds", Message: "must contain at most 200 transactions"}
	}
	rules, err := s.listEnabledAutomationRulesOrdered(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	summary := &RuleRunSummary{}
	for _, transactionID := range transactionIDs {
		summary.Examined++
		current, err := s.getTransactionForMutation(ctx, workspaceID, actorID, strings.TrimSpace(transactionID))
		if err != nil {
			if errors.Is(err, ErrNotFound) || errors.Is(err, ErrForbidden) {
				continue
			}
			return nil, err
		}
		next := *current
		appliedRules := make([]string, 0)
		for _, rule := range rules {
			if !evaluateRuleConditions(rule, &next) {
				continue
			}
			record := model.AppliedRuleRecord{RuleID: rule.ID, RuleName: rule.Name}
			for _, action := range rule.Actions {
				switch strings.TrimSpace(action.Type) {
				case model.RuleActionSetAccount:
					// Account moves change balances; they only run at creation
					// time so manual runs can never silently move money.
					continue
				default:
					if changes, applied, applyErr := s.applyRuleAction(ctx, workspaceID, action, &next); applyErr == nil && applied {
						record.Changes = append(record.Changes, changes...)
					}
				}
			}
			if len(record.Changes) > 0 {
				next.Automation = append(next.Automation, record)
				appliedRules = append(appliedRules, record.RuleName)
			}
		}
		if len(appliedRules) == 0 {
			continue
		}
		summary.Changed++
		if err := s.persistRuleRun(ctx, workspaceID, actorID, current, &next, appliedRules); err != nil {
			return nil, err
		}
		summary.Details = append(summary.Details, RuleRunTransactionLog{
			PublicID: current.TransactionID,
			Label:    valueOrDefault(current.Merchant, "Transaction"),
			Rules:    appliedRules,
		})
	}
	return summary, nil
}

func (s *FinanceService) persistRuleRun(
	ctx context.Context,
	workspaceID, actorID string,
	current, next *model.Transaction,
	appliedRules []string,
) error {
	next.UpdatedAt = time.Now().UTC()
	var updated model.Transaction
	if err := s.store.UpdateOne(ctx, "transactions", repository.Filter{
		"_id":          current.ID,
		"workspace_id": workspaceID,
	}, repository.Filter{"$set": repository.Filter{
		"category":   next.Category,
		"merchant":   next.Merchant,
		"notes":      next.Notes,
		"contact_id": next.ContactID,
		"tags":       next.Tags,
		"privacy":    next.Privacy,
		"automation": next.Automation,
		"updated_at": next.UpdatedAt,
	}}, &updated); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrConflict
		}
		return err
	}
	ledgerVersion, err := s.advanceLedgerVersion(ctx, workspaceID)
	if err != nil {
		return err
	}
	audit := transactionRevisionAudit(
		workspaceID, actorID, "transaction.automated", current.ID,
		model.NewTransactionRevisionSnapshot(current), model.NewTransactionRevisionSnapshot(&updated), ledgerVersion,
	)
	audit.ChangedFields = append(audit.ChangedFields, "automation")
	if err := s.store.Insert(ctx, "audit_events", audit); err != nil {
		return err
	}
	_ = appliedRules
	return nil
}
