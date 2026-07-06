package domain

import "time"

type TraceHTTPMessage struct {
	Method        string         `json:"method,omitempty"`
	URL           string         `json:"url,omitempty"`
	Path          map[string]any `json:"path,omitempty"`
	Query         map[string]any `json:"query,omitempty"`
	Headers       map[string]any `json:"headers,omitempty"`
	Body          any            `json:"body,omitempty"`
	BodySize      int            `json:"bodySize,omitempty"`
	BodyTruncated bool           `json:"bodyTruncated,omitempty"`
	StatusCode    int            `json:"statusCode,omitempty"`
}

type TraceNode struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Type       NodeType       `json:"type"`
	StartedAt  time.Time      `json:"startedAt"`
	FinishedAt time.Time      `json:"finishedAt"`
	DurationMS int64          `json:"durationMs"`
	Input      map[string]any `json:"input,omitempty"`
	Output     any            `json:"output,omitempty"`
	Error      string         `json:"error,omitempty"`
}

type TraceEdge struct {
	ID            string     `json:"id"`
	Source        string     `json:"source"`
	Target        string     `json:"target"`
	Priority      int        `json:"priority,omitempty"`
	Condition     *Condition `json:"condition,omitempty"`
	Unconditional bool       `json:"unconditional"`
	Matched       bool       `json:"matched"`
	Selected      bool       `json:"selected"`
	Error         string     `json:"error,omitempty"`
}

type Trace struct {
	ID          string           `json:"id"`
	SpecID      string           `json:"specId"`
	OperationID string           `json:"operationId"`
	Method      string           `json:"method"`
	Path        string           `json:"path"`
	StartedAt   time.Time        `json:"startedAt"`
	FinishedAt  time.Time        `json:"finishedAt"`
	DurationMS  int64            `json:"durationMs"`
	StatusCode  int              `json:"statusCode"`
	Error       string           `json:"error,omitempty"`
	Request     TraceHTTPMessage `json:"request"`
	Response    TraceHTTPMessage `json:"response"`
	Context     map[string]any   `json:"context"`
	Nodes       []TraceNode      `json:"nodes"`
	Edges       []TraceEdge      `json:"edges"`
}

type TraceSummary struct {
	ID          string    `json:"id"`
	SpecID      string    `json:"specId"`
	OperationID string    `json:"operationId"`
	Method      string    `json:"method"`
	Path        string    `json:"path"`
	StartedAt   time.Time `json:"startedAt"`
	DurationMS  int64     `json:"durationMs"`
	StatusCode  int       `json:"statusCode"`
	Error       string    `json:"error,omitempty"`
}
