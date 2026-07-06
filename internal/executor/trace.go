package executor

import (
	"bytes"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

const maxTraceBodyBytes = 64 * 1024

type traceResponseWriter struct {
	http.ResponseWriter
	statusCode    int
	body          bytes.Buffer
	bodySize      int
	bodyTruncated bool
}

func newTraceResponseWriter(w http.ResponseWriter) *traceResponseWriter {
	return &traceResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
}

func (w *traceResponseWriter) WriteHeader(statusCode int) {
	w.statusCode = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *traceResponseWriter) Write(data []byte) (int, error) {
	w.bodySize += len(data)
	if w.body.Len() < maxTraceBodyBytes {
		remaining := maxTraceBodyBytes - w.body.Len()
		if len(data) > remaining {
			_, _ = w.body.Write(data[:remaining])
			w.bodyTruncated = true
		} else {
			_, _ = w.body.Write(data)
		}
	} else if len(data) > 0 {
		w.bodyTruncated = true
	}
	return w.ResponseWriter.Write(data)
}

type traceRecorder struct {
	trace *domain.Trace
}

func newTraceRecorder(flow domain.Flow, r *http.Request, context map[string]any) *traceRecorder {
	request := domain.TraceHTTPMessage{
		Method: r.Method,
		URL:    r.URL.String(),
	}
	if requestContext, ok := context["request"].(map[string]any); ok {
		request.Path = mapFromAny(requestContext["path"])
		request.Query = mapFromAny(requestContext["query"])
		request.Headers = mapFromAny(requestContext["headers"])
		request.Body = truncateTraceValue(requestContext["body"])
		request.BodySize = traceValueSize(requestContext["body"])
		request.BodyTruncated = traceValueTruncated(requestContext["body"])
	}

	now := time.Now().UTC()
	return &traceRecorder{
		trace: &domain.Trace{
			ID:          uuid.NewString(),
			SpecID:      flow.SpecID,
			OperationID: flow.OperationID,
			Method:      r.Method,
			Path:        r.URL.Path,
			StartedAt:   now,
			Request:     request,
			Context:     map[string]any{},
			Nodes:       []domain.TraceNode{},
			Edges:       []domain.TraceEdge{},
		},
	}
}

func (t *traceRecorder) recordNode(node domain.Node, startedAt time.Time, input map[string]any, output any, err error) {
	if t == nil {
		return
	}
	finishedAt := time.Now().UTC()
	entry := domain.TraceNode{
		ID:         node.ID,
		Name:       node.Data.Name,
		Type:       node.Type,
		StartedAt:  startedAt.UTC(),
		FinishedAt: finishedAt,
		DurationMS: finishedAt.Sub(startedAt.UTC()).Milliseconds(),
		Input:      truncateTraceMap(input),
		Output:     truncateTraceValue(output),
	}
	if err != nil {
		entry.Error = err.Error()
	}
	t.trace.Nodes = append(t.trace.Nodes, entry)
}

func (t *traceRecorder) recordEdge(edge domain.Edge, matched bool, selected bool, err error) {
	if t == nil {
		return
	}
	entry := domain.TraceEdge{
		ID:            edge.ID,
		Source:        edge.Source,
		Target:        edge.Target,
		Priority:      edge.Priority,
		Condition:     edge.Condition,
		Unconditional: edge.Condition == nil,
		Matched:       matched,
		Selected:      selected,
	}
	if err != nil {
		entry.Error = err.Error()
	}
	t.trace.Edges = append(t.trace.Edges, entry)
}

func (t *traceRecorder) finish(context map[string]any, response *traceResponseWriter, errText string) domain.Trace {
	if t == nil {
		return domain.Trace{}
	}
	now := time.Now().UTC()
	t.trace.FinishedAt = now
	t.trace.DurationMS = now.Sub(t.trace.StartedAt).Milliseconds()
	t.trace.Context = truncateTraceMap(context)
	t.trace.Error = errText
	if response != nil {
		headers := make(map[string]any, len(response.Header()))
		for key, values := range response.Header() {
			if len(values) == 1 {
				headers[key] = values[0]
			} else {
				headers[key] = values
			}
		}
		t.trace.StatusCode = response.statusCode
		t.trace.Response = domain.TraceHTTPMessage{
			Headers:       headers,
			StatusCode:    response.statusCode,
			Body:          response.body.String(),
			BodySize:      response.bodySize,
			BodyTruncated: response.bodyTruncated,
		}
	}
	return *t.trace
}

func mapFromAny(value any) map[string]any {
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return nil
}

func truncateTraceMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = truncateTraceValue(value)
	}
	return output
}

func truncateTraceValue(value any) any {
	switch typed := value.(type) {
	case string:
		if len(typed) > maxTraceBodyBytes {
			return typed[:maxTraceBodyBytes] + "…"
		}
		return typed
	case []byte:
		if len(typed) > maxTraceBodyBytes {
			return string(typed[:maxTraceBodyBytes]) + "…"
		}
		return string(typed)
	case map[string]any:
		return truncateTraceMap(typed)
	case []any:
		output := make([]any, len(typed))
		for i, item := range typed {
			output[i] = truncateTraceValue(item)
		}
		return output
	default:
		return typed
	}
}

func traceValueSize(value any) int {
	switch typed := value.(type) {
	case nil:
		return 0
	case string:
		return len(typed)
	case []byte:
		return len(typed)
	default:
		data, err := json.Marshal(typed)
		if err != nil {
			return 0
		}
		return len(data)
	}
}

func traceValueTruncated(value any) bool {
	return traceValueSize(value) > maxTraceBodyBytes
}
