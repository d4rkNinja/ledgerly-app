package model

import (
	"testing"
	"time"
)

func TestGoalPredefinedTypesHaveStableDirections(t *testing.T) {
	tests := map[string]string{
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
	for goalType, wantDirection := range tests {
		if !IsPredefinedGoalType(goalType) {
			t.Errorf("IsPredefinedGoalType(%q) = false", goalType)
		}
		if got := DefaultGoalDirection(goalType); got != wantDirection {
			t.Errorf("DefaultGoalDirection(%q) = %q, want %q", goalType, got, wantDirection)
		}
	}
	if IsPredefinedGoalType("not-a-goal-type") {
		t.Fatal("unknown goal type was accepted")
	}
}

func TestGoalApplyDerivedPreservesLegacyTargetDateAndNeverAutoAchieves(t *testing.T) {
	now := time.Date(2026, time.August, 6, 18, 0, 0, 0, time.FixedZone("local", 5*60*60+30*60))
	due := time.Date(2026, time.August, 1, 23, 30, 0, 0, time.FixedZone("legacy", -7*60*60))
	goal := Goal{TargetMinor: 10_000, CurrentMinor: 1_000, TargetDate: &due}
	goal.ApplyDerived(now)
	if goal.Type != GoalTypeSavingsTarget {
		t.Fatalf("legacy type = %q, want %q", goal.Type, GoalTypeSavingsTarget)
	}
	if goal.Direction != GoalDirectionSave {
		t.Fatalf("legacy direction = %q, want %q", goal.Direction, GoalDirectionSave)
	}
	if goal.DueDate == nil || !goal.DueDate.Equal(due) {
		t.Fatalf("due date was not copied from legacy target date: %#v", goal.DueDate)
	}
	if goal.Status != GoalStatusOverdue {
		t.Fatalf("status = %q, want %q", goal.Status, GoalStatusOverdue)
	}
	goal.CurrentMinor = goal.TargetMinor
	goal.ApplyDerived(now)
	if goal.Status != GoalStatusAchieved {
		t.Fatalf("fully funded goal status = %q, want %q", goal.Status, GoalStatusAchieved)
	}
	goal.CurrentMinor = 0
	goal.CancelledAt = &now
	goal.ApplyDerived(now)
	if goal.Status != GoalStatusCancelled {
		t.Fatalf("cancelled goal status = %q, want %q", goal.Status, GoalStatusCancelled)
	}
}

func TestGoalEffectiveStatusUsesCivilUTCDateBoundaries(t *testing.T) {
	now := time.Date(2026, time.August, 6, 23, 59, 0, 0, time.FixedZone("IST", 5*60*60+30*60))
	due := time.Date(2026, time.August, 6, 0, 5, 0, 0, time.UTC)
	goal := Goal{TargetMinor: 100, CurrentMinor: 25, DueDate: &due}
	if got := goal.EffectiveStatus(now); got != GoalStatusDueToday {
		t.Fatalf("status = %q, want %q for the shared UTC civil day", got, GoalStatusDueToday)
	}
	future := now.AddDate(0, 0, 8)
	goal.DueDate = &future
	if got := goal.EffectiveStatus(now); got != GoalStatusInProgress {
		t.Fatalf("status = %q, want %q when due date is outside due-soon window", got, GoalStatusInProgress)
	}
}
