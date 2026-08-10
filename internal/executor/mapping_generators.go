package executor

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

const (
	randomCharsetAlpha        = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
	randomCharsetAlphanumeric = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	randomCharsetHex          = "0123456789abcdef"
)

var relativeTimePattern = regexp.MustCompile(`^(now|today)((?:[+-]\d+(?:ms|s|m|h|d|w)?)*)$`)
var relativeTimeOffsetPattern = regexp.MustCompile(`[+-]\d+(?:ms|s|m|h|d|w)?`)

func generatedMappingValue(mapping domain.Mapping) (any, error) {
	switch mapping.Type {
	case "random":
		return randomMappingValue(mapping)
	case "fake":
		return fakeMappingValue(mapping.Generator)
	case "relativeTime":
		return relativeTimeMappingValue(mapping.Source, mapping.Format, time.Now)
	default:
		return nil, fmt.Errorf("unsupported generated mapping type %q", mapping.Type)
	}
}

func randomMappingValue(mapping domain.Mapping) (any, error) {
	switch mapping.Generator {
	case "", "uuid":
		return uuid.NewString(), nil
	case "string", "alpha", "alphanumeric", "hex":
		charset := randomCharsetAlphanumeric
		if mapping.Generator == "alpha" {
			charset = randomCharsetAlpha
		} else if mapping.Generator == "hex" {
			charset = randomCharsetHex
		}
		length := mapping.Length
		if length == 0 {
			length = 12
		}
		if length < 1 || length > 256 {
			return nil, fmt.Errorf("random string length must be between 1 and 256")
		}
		return randomString(charset, length)
	case "number":
		minimum, maximum := mapping.Min, mapping.Max
		if maximum == 0 && minimum == 0 {
			maximum = 100
		}
		if maximum < minimum {
			return nil, fmt.Errorf("random number maximum must be greater than or equal to minimum")
		}
		return randomInt(minimum, maximum)
	case "boolean":
		value, err := randomInt(0, 1)
		if err != nil {
			return nil, err
		}
		return value == 1, nil
	default:
		return nil, fmt.Errorf("unsupported random generator %q", mapping.Generator)
	}
}

func randomString(charset string, length int) (string, error) {
	var builder strings.Builder
	builder.Grow(length)
	maximum := big.NewInt(int64(len(charset)))
	for i := 0; i < length; i++ {
		index, err := rand.Int(rand.Reader, maximum)
		if err != nil {
			return "", err
		}
		builder.WriteByte(charset[index.Int64()])
	}
	return builder.String(), nil
}

func randomInt(minimum, maximum int) (int, error) {
	if minimum == maximum {
		return minimum, nil
	}
	value, err := rand.Int(rand.Reader, big.NewInt(int64(maximum-minimum+1)))
	if err != nil {
		return 0, err
	}
	return minimum + int(value.Int64()), nil
}

func fakeMappingValue(generator string) (any, error) {
	values := map[string][]string{
		"name.fullName":    {"Asha Sen", "Mira Patel", "Noah Kim", "Lina Garcia", "Owen Brooks"},
		"name.firstName":   {"Asha", "Mira", "Noah", "Lina", "Owen"},
		"name.lastName":    {"Sen", "Patel", "Kim", "Garcia", "Brooks"},
		"internet.email":   {"asha.sen@example.com", "mira.patel@example.com", "noah.kim@example.com", "lina.garcia@example.com", "owen.brooks@example.com"},
		"internet.user":    {"asha_sen", "mira_patel", "noah_kim", "lina_garcia", "owen_brooks"},
		"internet.url":     {"https://example.com/accounts/alpha", "https://example.com/orders/42", "https://example.com/profiles/test"},
		"phone.number":     {"+1-415-555-0134", "+1-212-555-0198", "+1-206-555-0177"},
		"company.name":     {"Northstar Labs", "Acme API Co", "Cedar Systems", "Bluebird Finance"},
		"location.city":    {"San Francisco", "Seattle", "Austin", "Boston", "Denver"},
		"location.country": {"United States", "Canada", "United Kingdom", "Germany", "India"},
		"location.street":  {"100 Market St", "42 Pine Ave", "8 Lake Road", "77 Mission Blvd"},
		"lorem.word":       {"alpha", "ledger", "profile", "sandbox", "workflow"},
		"lorem.sentence":   {"Generated test request payload.", "Synthetic customer profile.", "Temporary session data."},
	}
	if generator == "" {
		generator = "name.fullName"
	}
	candidates, ok := values[generator]
	if !ok {
		return nil, fmt.Errorf("unsupported fake generator %q", generator)
	}
	index, err := randomInt(0, len(candidates)-1)
	if err != nil {
		return nil, err
	}
	return candidates[index], nil
}

func relativeTimeMappingValue(expression, format string, now func() time.Time) (any, error) {
	base, offsets, err := parseRelativeTime(expression, now().UTC())
	if err != nil {
		return nil, err
	}
	value := applyRelativeOffsets(base, offsets)
	return formatRelativeTime(value, format), nil
}

func parseRelativeTime(expression string, now time.Time) (time.Time, []string, error) {
	expression = strings.TrimSpace(expression)
	if expression == "" {
		expression = "now"
	}
	matches := relativeTimePattern.FindStringSubmatch(expression)
	if matches == nil {
		return time.Time{}, nil, fmt.Errorf("relative time must look like now+5h or today-3d")
	}
	base := now
	if matches[1] == "today" {
		base = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	}
	return base, relativeTimeOffsetPattern.FindAllString(matches[2], -1), nil
}

func applyRelativeOffsets(value time.Time, offsets []string) time.Time {
	for _, offset := range offsets {
		sign := 1
		if strings.HasPrefix(offset, "-") {
			sign = -1
		}
		body := offset[1:]
		unit := "d"
		for _, candidate := range []string{"ms", "s", "m", "h", "d", "w"} {
			if strings.HasSuffix(body, candidate) {
				unit = candidate
				body = strings.TrimSuffix(body, candidate)
				break
			}
		}
		amount := 0
		for _, r := range body {
			amount = amount*10 + int(r-'0')
		}
		amount *= sign
		switch unit {
		case "ms":
			value = value.Add(time.Duration(amount) * time.Millisecond)
		case "s":
			value = value.Add(time.Duration(amount) * time.Second)
		case "m":
			value = value.Add(time.Duration(amount) * time.Minute)
		case "h":
			value = value.Add(time.Duration(amount) * time.Hour)
		case "w":
			value = value.AddDate(0, 0, amount*7)
		default:
			value = value.AddDate(0, 0, amount)
		}
	}
	return value
}

func formatRelativeTime(value time.Time, format string) any {
	switch strings.TrimSpace(format) {
	case "", "rfc3339":
		return value.Format(time.RFC3339)
	case "date":
		return value.Format("2006-01-02")
	case "time":
		return value.Format("15:04:05")
	case "datetime":
		return value.Format("2006-01-02 15:04:05")
	case "unix":
		return value.Unix()
	case "unixMilli":
		return value.UnixMilli()
	default:
		return value.Format(toGoTimeFormat(format))
	}
}

func toGoTimeFormat(format string) string {
	replacements := []string{
		"YYYY", "2006",
		"YY", "06",
		"MM", "01",
		"DD", "02",
		"HH", "15",
		"mm", "04",
		"ss", "05",
	}
	return strings.NewReplacer(replacements...).Replace(format)
}
