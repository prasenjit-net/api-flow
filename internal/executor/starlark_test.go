package executor

import (
	"context"
	"strings"
	"testing"
)

func TestExecuteStarlarkUsesMappedInputAndReturnsJSONValue(t *testing.T) {
	source := `def run(input):
    return {
        "doubled": input["amount"] * 2,
        "label": input.get("label", "missing"),
    }
`
	output, err := ExecuteStarlark(context.Background(), "calculate", source, map[string]any{
		"amount": int64(21),
	})
	if err != nil {
		t.Fatalf("execute script: %v", err)
	}
	result, ok := output.(map[string]any)
	if !ok {
		t.Fatalf("expected object output, got %T", output)
	}
	if result["doubled"] != int64(42) || result["label"] != "missing" {
		t.Fatalf("unexpected output: %#v", result)
	}
}

func TestExecuteStarlarkStopsAtStepLimit(t *testing.T) {
	source := `def run(input):
    total = 0
    for value in range(10000000):
        total += value
    return total
`
	_, err := ExecuteStarlark(context.Background(), "too-much-work", source, map[string]any{})
	if err == nil || !strings.Contains(err.Error(), "too many steps") {
		t.Fatalf("expected step-limit error, got %v", err)
	}
}

func TestValidateStarlarkSourceRequiresRunFunction(t *testing.T) {
	if err := ValidateStarlarkSource("missing-run", `value = 1`); err == nil {
		t.Fatal("expected validation error for missing run function")
	}
}
