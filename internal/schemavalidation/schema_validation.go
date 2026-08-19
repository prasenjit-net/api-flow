package schemavalidation

import (
	"encoding/json"
	"fmt"
	"strings"

	schemavalidator "github.com/prasenjit-net/schema-validator"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

func EmptyResult() map[string]any {
	return map[string]any{
		"enabled":       true,
		"valid":         true,
		"failed":        false,
		"issues":        []map[string]any{},
		"scenarioCodes": []string{},
	}
}

func NormalizeSettings(config domain.SchemaValidationSettings) domain.SchemaValidationSettings {
	return domain.SchemaValidationSettings{
		PathMessages:  cleanStringMap(config.PathMessages),
		FieldMessages: cleanStringMap(config.FieldMessages),
		Aliases:       cleanStringMap(config.Aliases),
		Codes:         cleanStringMap(config.Codes),
	}
}

func ValidateBody(schemaValue any, body any, settings domain.SchemaValidationSettings) (map[string]any, error) {
	result := EmptyResult()
	schemaData, err := json.Marshal(schemaValue)
	if err != nil {
		return nil, fmt.Errorf("marshal request schema: %w", err)
	}
	schema, err := schemavalidator.Compile(schemaData, schemavalidator.WithAssertFormats())
	if err != nil {
		return nil, fmt.Errorf("compile request schema: %w", err)
	}
	bodyData, err := bodyJSON(body)
	if err != nil {
		return nil, err
	}
	validationResult, err := schema.ValidateJSON(bodyData)
	if err != nil {
		return nil, fmt.Errorf("validate request body: %w", err)
	}
	if len(validationResult.Violations()) == 0 {
		return result, nil
	}
	issues := renderedIssues(newRenderer(settings).Render(validationResult))
	scenarioCodes := make([]string, 0, len(issues))
	for _, issue := range issues {
		if code, ok := issue["scenarioCode"].(string); ok && code != "" {
			scenarioCodes = append(scenarioCodes, code)
		}
	}
	result["valid"] = false
	result["failed"] = true
	result["issues"] = issues
	result["scenarioCodes"] = uniqueStrings(scenarioCodes)
	return result, nil
}

func bodyJSON(body any) ([]byte, error) {
	if body == nil {
		return []byte("null"), nil
	}
	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request body for schema validation: %w", err)
	}
	return data, nil
}

func newRenderer(settings domain.SchemaValidationSettings) *schemavalidator.Renderer {
	renderer := schemavalidator.NewRenderer(
		schemavalidator.PathMessages(settings.PathMessages),
		schemavalidator.FieldMessages(settings.FieldMessages),
		schemavalidator.SchemaMessages(),
	)
	if len(settings.Aliases) > 0 {
		renderer.Aliases = schemavalidator.NewPathRules(settings.Aliases)
	}
	if len(settings.Codes) > 0 {
		renderer.Codes = schemavalidator.NewPathRules(settings.Codes)
	}
	return renderer
}

func renderedIssues(messages []schemavalidator.Message) []map[string]any {
	issues := make([]map[string]any, 0, len(messages))
	for _, msg := range messages {
		scenarioCode := ScenarioCode(string(msg.Code), msg.Path)
		issue := map[string]any{
			"code":         string(msg.Code),
			"path":         msg.Path,
			"field":        msg.Field,
			"message":      msg.Message,
			"params":       msg.Params,
			"scenarioCode": scenarioCode,
		}
		if msg.Value != nil {
			issue["value"] = msg.Value
		}
		if len(msg.Extra) > 0 {
			issue["extra"] = msg.Extra
		}
		issues = append(issues, issue)
	}
	return issues
}

func ScenarioCode(code, path string) string {
	parts := []string{strings.ToUpper(sanitizeScenarioToken(code))}
	if cleanPath := strings.ToUpper(sanitizeScenarioToken(path)); cleanPath != "" {
		parts = append(parts, cleanPath)
	}
	return strings.Join(parts, "_")
}

func sanitizeScenarioToken(value string) string {
	value = strings.TrimSpace(value)
	var b strings.Builder
	lastUnderscore := false
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
			lastUnderscore = false
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r)
			lastUnderscore = false
		case r >= '0' && r <= '9':
			b.WriteRune(r)
			lastUnderscore = false
		default:
			if !lastUnderscore {
				b.WriteByte('_')
				lastUnderscore = true
			}
		}
	}
	return strings.Trim(b.String(), "_")
}

func uniqueStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func cleanStringMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return nil
	}
	result := make(map[string]string, len(input))
	for key, value := range input {
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "" || value == "" {
			continue
		}
		result[key] = value
	}
	if len(result) == 0 {
		return nil
	}
	return result
}
