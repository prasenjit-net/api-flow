package executor

import (
	"regexp"
	"testing"
	"time"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

func TestBuildMappingValuesSupportsGeneratedSources(t *testing.T) {
	input := buildMappingValues([]domain.Mapping{
		{Type: "random", Generator: "uuid", Key: "id"},
		{Type: "random", Generator: "number", Min: 10, Max: 10, Key: "score"},
		{Type: "fake", Generator: "internet.email", Key: "email"},
	}, map[string]any{})

	id, ok := input["id"].(string)
	if !ok || !regexp.MustCompile(`^[0-9a-f-]{36}$`).MatchString(id) {
		t.Fatalf("expected uuid string, got %#v", input["id"])
	}
	if input["score"] != 10 {
		t.Fatalf("expected fixed random number 10, got %#v", input["score"])
	}
	email, ok := input["email"].(string)
	if !ok || email == "" {
		t.Fatalf("expected fake email, got %#v", input["email"])
	}
}

func TestRelativeTimeMappingValueSupportsOffsetsAndFormats(t *testing.T) {
	now := func() time.Time {
		return time.Date(2026, 8, 10, 12, 30, 0, 0, time.UTC)
	}
	value, err := relativeTimeMappingValue("today-3d", "date", now)
	if err != nil {
		t.Fatalf("relative time: %v", err)
	}
	if value != "2026-08-07" {
		t.Fatalf("expected formatted date, got %#v", value)
	}

	value, err = relativeTimeMappingValue("now+5h", "unix", now)
	if err != nil {
		t.Fatalf("relative time unix: %v", err)
	}
	if value != int64(1786383000) {
		t.Fatalf("expected unix timestamp, got %#v", value)
	}
}
