package domain

import (
	"fmt"
	"regexp"
	"strings"
)

const CurrentFlowVersion = 3

var NodeNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

type Flow struct {
	Version     int      `json:"version"`
	SpecID      string   `json:"specId"`
	OperationID string   `json:"operationId"`
	Nodes       []Node   `json:"nodes"`
	Edges       []Edge   `json:"edges"`
	Viewport    Viewport `json:"viewport"`
}

type NodeType string

const (
	NodeTypeStart         NodeType = "start"
	NodeTypeContextMapper NodeType = "contextMapper"
	NodeTypeStarlark      NodeType = "starlark"
	NodeTypeTemplate      NodeType = "template"
	NodeTypeEnd           NodeType = "end"
)

type Node struct {
	ID       string   `json:"id"`
	Type     NodeType `json:"type"`
	Position Position `json:"position"`
	Data     NodeData `json:"data"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Viewport struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

type NodeData struct {
	Mappings   []Mapping `json:"mappings,omitempty"`
	TemplateID string    `json:"templateId,omitempty"`
	ScriptID   string    `json:"scriptId,omitempty"`
	Name       string    `json:"name"`
}

type Mapping struct {
	Source string `json:"source"`
	Key    string `json:"key"`
}

type Edge struct {
	ID        string     `json:"id"`
	Source    string     `json:"source"`
	Target    string     `json:"target"`
	Priority  int        `json:"priority,omitempty"`
	Condition *Condition `json:"condition,omitempty"`
}

type ConditionType string

const (
	ConditionTypeGroup ConditionType = "group"
	ConditionTypeRule  ConditionType = "rule"
)

type LogicalOperator string

const (
	LogicalOperatorAnd LogicalOperator = "and"
	LogicalOperatorOr  LogicalOperator = "or"
	LogicalOperatorNot LogicalOperator = "not"
)

type ConditionOperator string

const (
	ConditionOperatorEquals             ConditionOperator = "equals"
	ConditionOperatorNotEquals          ConditionOperator = "notEquals"
	ConditionOperatorGreaterThan        ConditionOperator = "greaterThan"
	ConditionOperatorGreaterThanOrEqual ConditionOperator = "greaterThanOrEqual"
	ConditionOperatorLessThan           ConditionOperator = "lessThan"
	ConditionOperatorLessThanOrEqual    ConditionOperator = "lessThanOrEqual"
	ConditionOperatorContains           ConditionOperator = "contains"
	ConditionOperatorStartsWith         ConditionOperator = "startsWith"
	ConditionOperatorEndsWith           ConditionOperator = "endsWith"
	ConditionOperatorIn                 ConditionOperator = "in"
	ConditionOperatorExists             ConditionOperator = "exists"
	ConditionOperatorNotExists          ConditionOperator = "notExists"
)

type Condition struct {
	Type      ConditionType `json:"type"`
	Operator  string        `json:"operator"`
	Children  []Condition   `json:"children,omitempty"`
	Source    string        `json:"source,omitempty"`
	Value     any           `json:"value,omitempty"`
	ValueType string        `json:"valueType,omitempty"`
}

// NormalizeFlow upgrades legacy flows to the current in-memory schema. It is
// intentionally conservative: invalid legacy branch shapes are left for the
// validator and editor to surface rather than silently changing their meaning.
func NormalizeFlow(flow Flow) Flow {
	if flow.Version >= CurrentFlowVersion {
		return flow
	}

	if flow.Version < 2 {
		usedNames := make(map[string]struct{}, len(flow.Nodes))
		for i := range flow.Nodes {
			node := &flow.Nodes[i]
			base := sanitizeNodeName(node.ID)
			if node.Type == NodeTypeStart {
				base = "start"
			} else if node.Type == NodeTypeEnd {
				base = "end"
			}
			node.Data.Name = uniqueNodeName(base, usedNames)
			for j := range node.Data.Mappings {
				node.Data.Mappings[j].Source = normalizeLegacySource(node.Data.Mappings[j].Source)
			}
		}

		// Legacy templates saw one flat context assembled from every mapper.
		// Preserve those keys as aliases alongside the new full context.
		for i := range flow.Nodes {
			if flow.Nodes[i].Type != NodeTypeTemplate || len(flow.Nodes[i].Data.Mappings) > 0 {
				continue
			}
			for _, mapper := range flow.Nodes {
				if mapper.Type != NodeTypeContextMapper {
					continue
				}
				for _, mapping := range mapper.Data.Mappings {
					flow.Nodes[i].Data.Mappings = append(flow.Nodes[i].Data.Mappings, Mapping{
						Source: fmt.Sprintf("nodes.%s.%s", mapper.Data.Name, mapping.Key),
						Key:    mapping.Key,
					})
				}
			}
		}
	}

	flow.Version = CurrentFlowVersion
	return flow
}

func sanitizeNodeName(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('-')
		}
	}
	result := strings.Trim(b.String(), "-_")
	if result == "" {
		return "node"
	}
	if len(result) > 64 {
		result = result[:64]
	}
	return result
}

func uniqueNodeName(base string, used map[string]struct{}) string {
	if _, exists := used[base]; !exists {
		used[base] = struct{}{}
		return base
	}
	for suffix := 2; ; suffix++ {
		candidateBase := base
		suffixText := fmt.Sprintf("-%d", suffix)
		if len(candidateBase)+len(suffixText) > 64 {
			candidateBase = candidateBase[:64-len(suffixText)]
		}
		candidate := candidateBase + suffixText
		if _, exists := used[candidate]; !exists {
			used[candidate] = struct{}{}
			return candidate
		}
	}
}

func normalizeLegacySource(source string) string {
	source = strings.TrimSpace(source)
	replacements := map[string]string{
		"body":   "request.body",
		"path":   "request.path",
		"query":  "request.query",
		"header": "request.headers",
	}
	parts := strings.SplitN(source, ".", 2)
	prefix, ok := replacements[parts[0]]
	if !ok {
		return source
	}
	if len(parts) == 1 {
		return prefix
	}
	return prefix + "." + parts[1]
}

func MakeOpID(method, path string) string {
	r := strings.NewReplacer("/", "_", "{", "", "}", "")
	s := strings.ToLower(method) + r.Replace(path)
	s = strings.Trim(s, "_")
	for strings.Contains(s, "__") {
		s = strings.ReplaceAll(s, "__", "_")
	}
	return s
}
