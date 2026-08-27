package model

import (
	"strings"
	"time"
)

// Automation rule condition fields and operators. Conditions are evaluated
// with AND semantics in the order provided.
const (
	RuleConditionType        = "type"
	RuleConditionAccount     = "account"
	RuleConditionDescription = "description"
	RuleConditionContact     = "contact"
	RuleConditionAmount      = "amount"
	RuleConditionCategory    = "category"
	RuleConditionImported    = "imported"

	RuleOperatorEquals      = "equals"
	RuleOperatorNotEquals   = "not_equals"
	RuleOperatorContains    = "contains"
	RuleOperatorIn          = "in"
	RuleOperatorGreaterThan = "greater_than"
	RuleOperatorLessThan    = "less_than"
	RuleOperatorBetween     = "between"
	RuleOperatorTrue        = "is_true"
	RuleOperatorFalse       = "is_false"
)

// Automation rule action types.
const (
	RuleActionSetCategory = "set_category"
	RuleActionSetContact  = "set_contact"
	RuleActionRename      = "rename"
	RuleActionSetAccount  = "set_account"
	RuleActionAddTag      = "add_tag"
	RuleActionSetPrivacy  = "set_privacy"
)

var ruleConditionFields = map[string]map[string]struct{}{
	RuleConditionType:        {RuleOperatorEquals: {}, RuleOperatorIn: {}},
	RuleConditionAccount:     {RuleOperatorEquals: {}, RuleOperatorIn: {}},
	RuleConditionDescription: {RuleOperatorContains: {}, RuleOperatorEquals: {}},
	RuleConditionContact:     {RuleOperatorContains: {}, RuleOperatorEquals: {}},
	RuleConditionCategory:    {RuleOperatorEquals: {}, RuleOperatorNotEquals: {}},
	RuleConditionAmount: {
		RuleOperatorGreaterThan: {}, RuleOperatorLessThan: {},
		RuleOperatorBetween: {}, RuleOperatorEquals: {},
	},
	RuleConditionImported: {RuleOperatorTrue: {}, RuleOperatorFalse: {}},
}

var ruleActionTypes = map[string]struct{}{
	RuleActionSetCategory: {}, RuleActionSetContact: {}, RuleActionRename: {},
	RuleActionSetAccount: {}, RuleActionAddTag: {}, RuleActionSetPrivacy: {},
}

type RuleCondition struct {
	Field    string   `bson:"field" json:"field"`
	Operator string   `bson:"operator" json:"operator"`
	Value    string   `bson:"value,omitempty" json:"value,omitempty"`
	Values   []string `bson:"values,omitempty" json:"values,omitempty"`
	MinMinor *int64   `bson:"min_minor,omitempty" json:"minMinor,omitempty"`
	MaxMinor *int64   `bson:"max_minor,omitempty" json:"maxMinor,omitempty"`
}

type RuleAction struct {
	Type  string `bson:"type" json:"type"`
	Value string `bson:"value" json:"value"`
}

// AppliedRuleChange describes one field mutation an automation rule made to a
// transaction. It is stored on the transaction as explainable provenance.
type AppliedRuleChange struct {
	Field string `bson:"field" json:"field"`
	From  string `bson:"from,omitempty" json:"from,omitempty"`
	To    string `bson:"to,omitempty" json:"to,omitempty"`
}

type AppliedRuleRecord struct {
	RuleID   string              `bson:"rule_id" json:"-"`
	RuleName string              `bson:"rule_name" json:"ruleName"`
	Changes  []AppliedRuleChange `bson:"changes" json:"changes"`
}

type AutomationRule struct {
	ID          string          `bson:"_id" json:"id"`
	WorkspaceID string          `bson:"workspace_id" json:"-"`
	CreatedBy   string          `bson:"created_by" json:"-"`
	Name        string          `bson:"name" json:"name"`
	Priority    int             `bson:"priority" json:"priority"`
	Enabled     bool            `bson:"enabled" json:"enabled"`
	Conditions  []RuleCondition `bson:"conditions" json:"conditions"`
	Actions     []RuleAction    `bson:"actions" json:"actions"`
	MatchCount  int64           `bson:"-" json:"matchCount,omitempty"`
	CreatedAt   time.Time       `bson:"created_at" json:"createdAt"`
	UpdatedAt   time.Time       `bson:"updated_at" json:"updatedAt"`
}

func IsValidRuleConditionField(value string) bool {
	_, ok := ruleConditionFields[value]
	return ok
}

func IsValidRuleConditionOperator(field, operator string) bool {
	operators, ok := ruleConditionFields[field]
	if !ok {
		return false
	}
	_, ok = operators[operator]
	return ok
}

func IsValidRuleActionType(value string) bool {
	_, ok := ruleActionTypes[value]
	return ok
}

func IsValidRulePrivacyValue(value string) bool {
	return value == "workspace" || value == "private"
}

// NormalizeRuleText lowercases and collapses whitespace so condition matching
// is deterministic across statement descriptions.
func NormalizeRuleText(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}
