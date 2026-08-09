package model

import (
	"strings"
	"time"
)

const (
	GoalTypeReceivePayment = "receive_payment"
	GoalTypePaySomeone     = "pay_someone"
	GoalTypeSavingsTarget  = "savings_target"
	GoalTypeDebtRepayment  = "debt_repayment"
	GoalTypeBillPayment    = "bill_payment"
	GoalTypePurchaseTarget = "purchase_target"
	GoalTypeMonthlyBudget  = "monthly_budget_target"
	GoalTypeEmergencyFund  = "emergency_fund"
	GoalTypeCustom         = "custom"

	GoalDirectionReceive = "receive"
	GoalDirectionPay     = "pay"
	GoalDirectionSave    = "save"
	GoalDirectionNeutral = "neutral"

	GoalStatusNotStarted = "not_started"
	GoalStatusInProgress = "in_progress"
	GoalStatusDueSoon    = "due_soon"
	GoalStatusDueToday   = "due_today"
	GoalStatusOverdue    = "overdue"
	GoalStatusAchieved   = "achieved"
	GoalStatusCancelled  = "cancelled"
)

var predefinedGoalTypes = map[string]string{
	GoalTypeReceivePayment: GoalDirectionReceive,
	GoalTypePaySomeone:     GoalDirectionPay,
	GoalTypeSavingsTarget:  GoalDirectionSave,
	GoalTypeDebtRepayment:  GoalDirectionPay,
	GoalTypeBillPayment:    GoalDirectionPay,
	GoalTypePurchaseTarget: GoalDirectionPay,
	GoalTypeMonthlyBudget:  GoalDirectionNeutral,
	GoalTypeEmergencyFund:  GoalDirectionSave,
	GoalTypeCustom:         GoalDirectionNeutral,
}

func IsPredefinedGoalType(value string) bool {
	_, ok := predefinedGoalTypes[strings.ToLower(strings.TrimSpace(value))]
	return ok
}

func DefaultGoalDirection(goalType string) string {
	if direction, ok := predefinedGoalTypes[strings.ToLower(strings.TrimSpace(goalType))]; ok {
		return direction
	}
	return GoalDirectionNeutral
}

// EffectiveDueDate keeps targetDate as the legacy source of truth while
// allowing the additive dueDate field used by newer clients.
func (goal Goal) EffectiveDueDate() *time.Time {
	if goal.DueDate != nil {
		return goal.DueDate
	}
	return goal.TargetDate
}

// EffectiveStatus derives reporting state from progress and civil UTC dates.
// Cancellation is the only durable status transition; passing a due date
// never marks a goal achieved.
func (goal Goal) EffectiveStatus(now time.Time) string {
	if goal.CancelledAt != nil {
		return GoalStatusCancelled
	}
	if goal.TargetMinor > 0 && goal.CurrentMinor >= goal.TargetMinor {
		return GoalStatusAchieved
	}
	if goal.CurrentMinor > 0 {
		if due := goal.EffectiveDueDate(); due != nil {
			today := civilDay(now)
			dueDay := civilDay(*due)
			switch {
			case dueDay.Before(today):
				return GoalStatusOverdue
			case dueDay.Equal(today):
				return GoalStatusDueToday
			case !dueDay.After(today.AddDate(0, 0, 7)):
				return GoalStatusDueSoon
			}
		}
		return GoalStatusInProgress
	}
	if due := goal.EffectiveDueDate(); due != nil {
		today := civilDay(now)
		dueDay := civilDay(*due)
		switch {
		case dueDay.Before(today):
			return GoalStatusOverdue
		case dueDay.Equal(today):
			return GoalStatusDueToday
		case !dueDay.After(today.AddDate(0, 0, 7)):
			return GoalStatusDueSoon
		}
	}
	return GoalStatusNotStarted
}

func (goal *Goal) ApplyDerived(now time.Time) {
	if goal == nil {
		return
	}
	if goal.Type == "" {
		goal.Type = GoalTypeSavingsTarget
	}
	goal.Status = goal.EffectiveStatus(now)
	goal.RemainingMinor = goal.TargetMinor - goal.CurrentMinor
	if goal.RemainingMinor < 0 {
		goal.RemainingMinor = 0
	}
	if goal.Direction == "" {
		goal.Direction = DefaultGoalDirection(goal.Type)
	}
	if goal.DueDate == nil && goal.TargetDate != nil {
		goal.DueDate = goal.TargetDate
	}
}

func civilDay(value time.Time) time.Time {
	utc := value.UTC()
	return time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC)
}
