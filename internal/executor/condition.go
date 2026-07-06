package executor

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

func EvaluateCondition(condition domain.Condition, context map[string]any) (bool, error) {
	switch condition.Type {
	case domain.ConditionTypeGroup:
		switch domain.LogicalOperator(condition.Operator) {
		case domain.LogicalOperatorAnd:
			for _, child := range condition.Children {
				matched, err := EvaluateCondition(child, context)
				if err != nil || !matched {
					return matched, err
				}
			}
			return true, nil
		case domain.LogicalOperatorOr:
			for _, child := range condition.Children {
				matched, err := EvaluateCondition(child, context)
				if err != nil {
					return false, err
				}
				if matched {
					return true, nil
				}
			}
			return false, nil
		case domain.LogicalOperatorNot:
			if len(condition.Children) != 1 {
				return false, fmt.Errorf("not condition requires exactly one child")
			}
			matched, err := EvaluateCondition(condition.Children[0], context)
			return !matched, err
		default:
			return false, fmt.Errorf("unsupported logical operator %q", condition.Operator)
		}
	case domain.ConditionTypeRule:
		actual, exists := ResolveContextPath(context, condition.Source)
		return evaluateRule(domain.ConditionOperator(condition.Operator), actual, exists, condition.Value)
	default:
		return false, fmt.Errorf("unsupported condition type %q", condition.Type)
	}
}

func ResolveContextPath(context map[string]any, source string) (any, bool) {
	parts := strings.Split(strings.TrimSpace(source), ".")
	if len(parts) == 0 || parts[0] == "" {
		return nil, false
	}
	var current any = context
	for _, part := range parts {
		switch value := current.(type) {
		case map[string]any:
			next, ok := value[part]
			if !ok {
				for key, candidate := range value {
					if strings.EqualFold(key, part) {
						next, ok = candidate, true
						break
					}
				}
			}
			if !ok {
				return nil, false
			}
			current = next
		case map[string]string:
			next, ok := value[part]
			if !ok {
				for key, candidate := range value {
					if strings.EqualFold(key, part) {
						next, ok = candidate, true
						break
					}
				}
			}
			if !ok {
				return nil, false
			}
			current = next
		case map[string][]string:
			next, ok := value[part]
			if !ok {
				for key, candidate := range value {
					if strings.EqualFold(key, part) {
						next, ok = candidate, true
						break
					}
				}
			}
			if !ok {
				return nil, false
			}
			if len(next) == 1 {
				current = next[0]
			} else {
				current = next
			}
		case []any:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(value) {
				return nil, false
			}
			current = value[index]
		case []string:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(value) {
				return nil, false
			}
			current = value[index]
		default:
			return nil, false
		}
	}
	return current, true
}

func evaluateRule(operator domain.ConditionOperator, actual any, exists bool, expected any) (bool, error) {
	switch operator {
	case domain.ConditionOperatorExists:
		return exists, nil
	case domain.ConditionOperatorNotExists:
		return !exists, nil
	}
	if !exists {
		return false, nil
	}
	switch operator {
	case domain.ConditionOperatorEquals:
		return valuesEqual(actual, expected), nil
	case domain.ConditionOperatorNotEquals:
		return !valuesEqual(actual, expected), nil
	case domain.ConditionOperatorGreaterThan,
		domain.ConditionOperatorGreaterThanOrEqual,
		domain.ConditionOperatorLessThan,
		domain.ConditionOperatorLessThanOrEqual:
		left, leftOK := numberValue(actual)
		right, rightOK := numberValue(expected)
		if !leftOK || !rightOK {
			return false, nil
		}
		switch operator {
		case domain.ConditionOperatorGreaterThan:
			return left > right, nil
		case domain.ConditionOperatorGreaterThanOrEqual:
			return left >= right, nil
		case domain.ConditionOperatorLessThan:
			return left < right, nil
		default:
			return left <= right, nil
		}
	case domain.ConditionOperatorContains:
		return containsValue(actual, expected), nil
	case domain.ConditionOperatorStartsWith:
		return strings.HasPrefix(fmt.Sprint(actual), fmt.Sprint(expected)), nil
	case domain.ConditionOperatorEndsWith:
		return strings.HasSuffix(fmt.Sprint(actual), fmt.Sprint(expected)), nil
	case domain.ConditionOperatorIn:
		return containsValue(expected, actual), nil
	default:
		return false, fmt.Errorf("unsupported condition operator %q", operator)
	}
}

func valuesEqual(left, right any) bool {
	if leftNumber, ok := numberValue(left); ok {
		if rightNumber, rightOK := numberValue(right); rightOK {
			return leftNumber == rightNumber
		}
	}
	return reflect.DeepEqual(left, right)
}

func numberValue(value any) (float64, bool) {
	switch number := value.(type) {
	case int:
		return float64(number), true
	case int8:
		return float64(number), true
	case int16:
		return float64(number), true
	case int32:
		return float64(number), true
	case int64:
		return float64(number), true
	case uint:
		return float64(number), true
	case uint8:
		return float64(number), true
	case uint16:
		return float64(number), true
	case uint32:
		return float64(number), true
	case uint64:
		return float64(number), true
	case float32:
		return float64(number), true
	case float64:
		return number, true
	case string:
		parsed, err := strconv.ParseFloat(number, 64)
		return parsed, err == nil
	default:
		return 0, false
	}
}

func containsValue(container, candidate any) bool {
	switch value := container.(type) {
	case string:
		if strings.Contains(value, ",") {
			for _, item := range strings.Split(value, ",") {
				if valuesEqual(strings.TrimSpace(item), candidate) {
					return true
				}
			}
		}
		return strings.Contains(value, fmt.Sprint(candidate))
	case []any:
		for _, item := range value {
			if valuesEqual(item, candidate) {
				return true
			}
		}
	case []string:
		for _, item := range value {
			if valuesEqual(item, candidate) {
				return true
			}
		}
	}
	return false
}
