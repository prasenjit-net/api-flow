package domain

import "strings"

type Flow struct {
	SpecID      string `json:"specId"`
	OperationID string `json:"operationId"`
	Nodes       []Node `json:"nodes"`
	Edges       []Edge `json:"edges"`
}

type NodeType string

const (
	NodeTypeStart         NodeType = "start"
	NodeTypeContextMapper NodeType = "contextMapper"
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

type NodeData struct {
	Mappings   []Mapping `json:"mappings,omitempty"`
	TemplateID string    `json:"templateId,omitempty"`
}

type Mapping struct {
	Source string `json:"source"`
	Key    string `json:"key"`
}

type Edge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
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
