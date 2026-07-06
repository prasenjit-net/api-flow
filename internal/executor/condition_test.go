package executor

import (
	"testing"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

func TestEvaluateConditionSupportsNestedLogicalGroups(t *testing.T) {
	context := map[string]any{
		"request": map[string]any{
			"body": map[string]any{
				"tier":   "vip",
				"amount": float64(125),
			},
		},
	}
	condition := domain.Condition{
		Type:     domain.ConditionTypeGroup,
		Operator: string(domain.LogicalOperatorAnd),
		Children: []domain.Condition{
			{
				Type:     domain.ConditionTypeRule,
				Source:   "request.body.tier",
				Operator: string(domain.ConditionOperatorEquals),
				Value:    "vip",
			},
			{
				Type:     domain.ConditionTypeGroup,
				Operator: string(domain.LogicalOperatorNot),
				Children: []domain.Condition{{
					Type:     domain.ConditionTypeRule,
					Source:   "request.body.amount",
					Operator: string(domain.ConditionOperatorLessThan),
					Value:    100,
				}},
			},
		},
	}

	matched, err := EvaluateCondition(condition, context)
	if err != nil {
		t.Fatalf("evaluate condition: %v", err)
	}
	if !matched {
		t.Fatal("expected nested condition to match")
	}
}

func TestEvaluateConditionTreatsMissingPathAsNotExisting(t *testing.T) {
	condition := domain.Condition{
		Type:     domain.ConditionTypeRule,
		Source:   "request.body.unknown",
		Operator: string(domain.ConditionOperatorNotExists),
	}
	matched, err := EvaluateCondition(condition, map[string]any{"request": map[string]any{"body": map[string]any{}}})
	if err != nil {
		t.Fatalf("evaluate condition: %v", err)
	}
	if !matched {
		t.Fatal("expected notExists to match a missing path")
	}
}
