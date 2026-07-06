package executor

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"text/template"
	"time"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

type Executor struct {
	store store.Store
}

func New(s store.Store) *Executor {
	return &Executor{store: s}
}

func (e *Executor) Execute(w http.ResponseWriter, r *http.Request, flow domain.Flow, pathParams map[string]string) {
	flow = domain.NormalizeFlow(flow)

	var responseRecorder *traceResponseWriter
	tracingEnabled := false
	if meta, err := e.store.GetSpecMeta(flow.SpecID); err == nil {
		tracingEnabled = meta.TracingEnabled
	}
	if tracingEnabled {
		responseRecorder = newTraceResponseWriter(w)
		w = responseRecorder
	}

	var traceErr string
	ctx, err := buildRequestContext(r, pathParams)
	if ctx == nil {
		ctx = map[string]any{}
	}
	var recorder *traceRecorder
	if tracingEnabled {
		recorder = newTraceRecorder(flow, r, ctx)
		defer func() {
			errText := traceErr
			if errText == "" && responseRecorder != nil && responseRecorder.statusCode >= http.StatusBadRequest {
				if body := strings.TrimSpace(responseRecorder.body.String()); body != "" {
					errText = body
				}
			}
			_ = e.store.SaveTrace(recorder.finish(ctx, responseRecorder, errText))
		}()
	}

	fail := func(status int, msg string) {
		traceErr = msg
		http.Error(w, msg, status)
	}

	if err != nil {
		fail(http.StatusInternalServerError, fmt.Sprintf("context error: %v", err))
		return
	}

	if validationErrors := domain.ValidateFlow(flow); len(validationErrors) > 0 {
		fail(http.StatusInternalServerError, fmt.Sprintf("invalid workflow: %s", validationErrors[0].Message))
		return
	}

	nodesByID := make(map[string]domain.Node, len(flow.Nodes))
	outgoing := make(map[string][]domain.Edge, len(flow.Nodes))
	var startNode *domain.Node
	for i := range flow.Nodes {
		node := flow.Nodes[i]
		nodesByID[node.ID] = node
		if node.Type == domain.NodeTypeStart {
			startNode = &node
		}
	}
	for _, edge := range flow.Edges {
		outgoing[edge.Source] = append(outgoing[edge.Source], edge)
	}
	if startNode == nil {
		fail(http.StatusInternalServerError, "invalid workflow: start node is missing")
		return
	}

	var response *responseCandidate
	current := *startNode
	visited := make(map[string]bool, len(flow.Nodes))

	for {
		if visited[current.ID] {
			fail(http.StatusInternalServerError, "workflow execution encountered a cycle")
			return
		}
		visited[current.ID] = true

		nodeStartedAt := time.Now().UTC()
		var nodeInput map[string]any
		var nodeOutput any
		var nodeErr error
		switch current.Type {
		case domain.NodeTypeStart:
		case domain.NodeTypeContextMapper:
			nodeInput = buildNodeInput(current, ctx)
			nodeOutput = nodeInput
			contextNodes(ctx)[current.Data.Name] = nodeOutput
		case domain.NodeTypeStarlark:
			nodeInput = buildNodeInput(current, ctx)
			script, err := e.store.GetScript(current.Data.ScriptID)
			if err != nil {
				nodeErr = fmt.Errorf("script %q not found", current.Data.ScriptID)
				recorder.recordNode(current, nodeStartedAt, nodeInput, nil, nodeErr)
				fail(http.StatusInternalServerError, nodeErr.Error())
				return
			}
			output, err := ExecuteStarlark(r.Context(), current.Data.Name, script.Source, nodeInput)
			if err != nil {
				nodeErr = fmt.Errorf("Starlark node %q failed: %v", current.Data.Name, err)
				recorder.recordNode(current, nodeStartedAt, nodeInput, nil, nodeErr)
				fail(http.StatusInternalServerError, nodeErr.Error())
				return
			}
			nodeOutput = output
			contextNodes(ctx)[current.Data.Name] = nodeOutput
		case domain.NodeTypeTemplate:
			nodeInput = buildTemplateContext(current, ctx)
			candidate, output, err := e.executeTemplate(flow.SpecID, flow.OperationID, current, nodeInput)
			if err != nil {
				nodeErr = err
				recorder.recordNode(current, nodeStartedAt, nodeInput, nil, nodeErr)
				fail(http.StatusInternalServerError, err.Error())
				return
			}
			response = candidate
			nodeOutput = output
			contextNodes(ctx)[current.Data.Name] = nodeOutput
		case domain.NodeTypeEnd:
			if response == nil {
				nodeErr = fmt.Errorf("workflow ended without producing a response")
				recorder.recordNode(current, nodeStartedAt, nodeInput, nil, nodeErr)
				fail(http.StatusInternalServerError, nodeErr.Error())
				return
			}
			recorder.recordNode(current, nodeStartedAt, nodeInput, nodeOutput, nil)
			writeResponse(w, *response)
			return
		default:
			nodeErr = fmt.Errorf("unsupported node type %q", current.Type)
			recorder.recordNode(current, nodeStartedAt, nodeInput, nil, nodeErr)
			fail(http.StatusInternalServerError, nodeErr.Error())
			return
		}
		recorder.recordNode(current, nodeStartedAt, nodeInput, nodeOutput, nil)

		edge, err := selectOutgoingEdge(outgoing[current.ID], ctx, recorder)
		if err != nil {
			fail(http.StatusInternalServerError, fmt.Sprintf("branch evaluation error: %v", err))
			return
		}
		next, exists := nodesByID[edge.Target]
		if !exists {
			fail(http.StatusInternalServerError, fmt.Sprintf("workflow target node %q not found", edge.Target))
			return
		}
		current = next
	}
}

type responseCandidate struct {
	StatusCode int
	Headers    map[string]string
	Body       string
}

func (e *Executor) executeTemplate(specID, operationID string, node domain.Node, input map[string]any) (*responseCandidate, map[string]any, error) {
	t, err := e.store.GetTemplate(specID, node.Data.TemplateID)
	if err != nil {
		return nil, nil, fmt.Errorf("template %q not found", node.Data.TemplateID)
	}
	if t.OperationID != "" && t.OperationID != operationID {
		return nil, nil, fmt.Errorf("template %q is scoped to operation %q", node.Data.TemplateID, t.OperationID)
	}
	headers := make(map[string]string, len(t.Headers))
	for key, valTmpl := range t.Headers {
		rendered, err := renderString(valTmpl, input)
		if err != nil {
			return nil, nil, fmt.Errorf("template header %q render error: %w", key, err)
		}
		headers[key] = rendered
	}

	body, err := renderString(t.Body, input)
	if err != nil {
		return nil, nil, fmt.Errorf("body render error: %w", err)
	}

	statusCode := t.StatusCode
	if statusCode == 0 {
		statusCode = http.StatusOK
	}
	candidate := &responseCandidate{StatusCode: statusCode, Headers: headers, Body: body}
	output := map[string]any{
		"statusCode": statusCode,
		"headers":    headers,
		"body":       body,
	}
	return candidate, output, nil
}

func writeResponse(w http.ResponseWriter, response responseCandidate) {
	for key, value := range response.Headers {
		w.Header().Set(key, value)
	}
	w.WriteHeader(response.StatusCode)
	_, _ = w.Write([]byte(response.Body))
}

func buildRequestContext(r *http.Request, pathParams map[string]string) (map[string]any, error) {
	var bodyData any
	if r.Body != nil && r.Body != http.NoBody {
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			return nil, err
		}
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &bodyData); err != nil {
				bodyData = string(raw)
			}
		}
	}

	query := make(map[string]any, len(r.URL.Query()))
	for key, values := range r.URL.Query() {
		if len(values) == 1 {
			query[key] = values[0]
		} else {
			query[key] = values
		}
	}
	headers := make(map[string]any, len(r.Header))
	for key, values := range r.Header {
		normalizedKey := strings.ToLower(key)
		if len(values) == 1 {
			headers[normalizedKey] = values[0]
		} else {
			headers[normalizedKey] = values
		}
	}
	path := make(map[string]any, len(pathParams))
	for key, value := range pathParams {
		path[key] = value
	}

	return map[string]any{
		"request": map[string]any{
			"method":  strings.ToUpper(r.Method),
			"url":     r.URL.String(),
			"path":    path,
			"query":   query,
			"headers": headers,
			"body":    bodyData,
		},
		"nodes": map[string]any{},
	}, nil
}

func contextNodes(context map[string]any) map[string]any {
	nodes, ok := context["nodes"].(map[string]any)
	if !ok {
		nodes = map[string]any{}
		context["nodes"] = nodes
	}
	return nodes
}

func buildNodeInput(node domain.Node, context map[string]any) map[string]any {
	input := make(map[string]any, len(node.Data.Mappings))
	for _, mapping := range node.Data.Mappings {
		if mapping.Type == "constant" {
			input[mapping.Key] = mapping.Value
			continue
		}
		value, exists := ResolveContextPath(context, mapping.Source)
		if !exists {
			value = nil
		}
		input[mapping.Key] = value
	}
	return input
}

// buildTemplateContext is the sole full-context exception to the mapped-only
// input policy used by executable nodes. Legacy mappings are retained as
// root-level aliases so existing templates continue to render during migration.
func buildTemplateContext(node domain.Node, context map[string]any) map[string]any {
	view := make(map[string]any, len(context)+len(node.Data.Mappings))
	for key, value := range context {
		view[key] = value
	}
	for _, mapping := range node.Data.Mappings {
		if mapping.Type == "constant" {
			view[mapping.Key] = mapping.Value
			continue
		}
		value, exists := ResolveContextPath(context, mapping.Source)
		if !exists {
			value = nil
		}
		view[mapping.Key] = value
	}
	return view
}

func selectOutgoingEdge(edges []domain.Edge, context map[string]any, recorder *traceRecorder) (domain.Edge, error) {
	var fallback *domain.Edge
	conditional := make([]domain.Edge, 0, len(edges))
	for i := range edges {
		if edges[i].Condition == nil {
			edge := edges[i]
			fallback = &edge
		} else {
			conditional = append(conditional, edges[i])
		}
	}
	sort.SliceStable(conditional, func(i, j int) bool {
		return conditional[i].Priority < conditional[j].Priority
	})
	for _, edge := range conditional {
		matched, err := EvaluateCondition(*edge.Condition, context)
		if err != nil {
			recorder.recordEdge(edge, false, false, err)
			return domain.Edge{}, fmt.Errorf("edge %q: %w", edge.ID, err)
		}
		recorder.recordEdge(edge, matched, matched, nil)
		if matched {
			return edge, nil
		}
	}
	if fallback == nil {
		return domain.Edge{}, fmt.Errorf("no condition matched and no unconditional fallback edge exists")
	}
	recorder.recordEdge(*fallback, true, true, nil)
	return *fallback, nil
}

func renderString(tmplStr string, ctx map[string]any) (string, error) {
	if tmplStr == "" {
		return "", nil
	}
	funcs := template.FuncMap{
		"now": func() string { return time.Now().UTC().Format(time.RFC3339) },
	}
	t, err := template.New("").Funcs(funcs).Parse(tmplStr)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, ctx); err != nil {
		return "", err
	}
	return buf.String(), nil
}
