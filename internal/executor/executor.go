package executor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"text/template"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	schemavalidator "github.com/prasenjit-net/schema-validator"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/sessions"
	"github.com/prasenjit-net/api-flow/internal/store"
)

type Executor struct {
	store    store.Store
	sessions *sessions.Manager
}

var shorthandTemplatePathPattern = regexp.MustCompile(`\{\{\s*((?:request|nodes)(?:\.[A-Za-z0-9_-]+)+)\s*\}\}`)

func New(s store.Store, managers ...*sessions.Manager) *Executor {
	var manager *sessions.Manager
	if len(managers) > 0 {
		manager = managers[0]
	}
	return &Executor{store: s, sessions: manager}
}

func (e *Executor) Execute(w http.ResponseWriter, r *http.Request, flow domain.Flow, pathParams map[string]string) {
	e.execute(w, r, nil, flow, pathParams)
}

func (e *Executor) ExecuteRelease(w http.ResponseWriter, r *http.Request, bundle domain.ReleaseBundle, flow domain.Flow, pathParams map[string]string) {
	e.execute(w, r, &bundle, flow, pathParams)
}

func (e *Executor) execute(w http.ResponseWriter, r *http.Request, bundle *domain.ReleaseBundle, flow domain.Flow, pathParams map[string]string) {
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
	if e.sessions != nil {
		e.sessions.TouchFromRequest(w, r)
	}

	var traceErr string
	ctx, err := buildRequestContext(r, pathParams)
	if ctx == nil {
		ctx = map[string]any{}
	}
	var recorder *traceRecorder
	if tracingEnabled {
		releaseVersion := 0
		releaseSnapshot := false
		if bundle != nil {
			releaseVersion = bundle.Version
			releaseSnapshot = bundle.Snapshot
		}
		recorder = newTraceRecorder(flow, r, ctx, releaseVersion, releaseSnapshot)
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
	if err := e.applyStartSchemaValidation(r, bundle, flow, *startNode, ctx); err != nil {
		fail(http.StatusInternalServerError, fmt.Sprintf("schema validation setup error: %v", err))
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
			script, found, err := e.resolveScript(bundle, flow.SpecID, current.Data.ScriptID)
			if err != nil || !found {
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
		case domain.NodeTypeDataMapper:
			filters := resolveQueryFilters(current.Data.QueryMappings, ctx)
			bodyValues := buildMappingValues(current.Data.BodyMappings, ctx)
			nodeInput = map[string]any{"query": filterSummary(filters), "body": bodyValues}
			output, err := e.executeDataMapper(w, r, flow.SpecID, bundle, current.Data.CollectionID, current.Data.Operation, filters, bodyValues)
			if err != nil {
				nodeErr = fmt.Errorf("data mapper node %q failed: %v", current.Data.Name, err)
				recorder.recordNode(current, nodeStartedAt, nodeInput, nil, nodeErr)
				fail(http.StatusInternalServerError, nodeErr.Error())
				return
			}
			nodeOutput = output
			contextNodes(ctx)[current.Data.Name] = nodeOutput
		case domain.NodeTypeTemplate:
			nodeInput = buildTemplateContext(current, ctx)
			candidate, output, err := e.executeTemplate(bundle, flow.SpecID, flow.OperationID, current, nodeInput)
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
				fallback, output, found, err := e.exampleResponse(bundle, flow, ctx)
				if err != nil {
					nodeErr = err
					recorder.recordNode(current, nodeStartedAt, nodeInput, nil, nodeErr)
					fail(http.StatusInternalServerError, err.Error())
					return
				}
				if !found {
					recorder.recordNode(current, nodeStartedAt, nodeInput, map[string]any{
						"statusCode": http.StatusNotFound,
						"body":       "no template response or OpenAPI response example found",
					}, nil)
					http.Error(w, "no template response or OpenAPI response example found", http.StatusNotFound)
					return
				}
				response = fallback
				nodeOutput = output
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

func (e *Executor) applyStartSchemaValidation(r *http.Request, bundle *domain.ReleaseBundle, flow domain.Flow, startNode domain.Node, ctx map[string]any) error {
	if startNode.Data.SchemaValidation == nil || !startNode.Data.SchemaValidation.Enabled {
		return nil
	}

	result, err := e.validateRequestSchema(r.Context(), bundle, flow, ctx)
	if err != nil {
		return err
	}
	validationContext(ctx)["schema"] = result
	contextNodes(ctx)[startNode.Data.Name] = map[string]any{"schemaValidation": result}
	return nil
}

func validationContext(context map[string]any) map[string]any {
	validation, ok := context["validation"].(map[string]any)
	if !ok {
		validation = map[string]any{}
		context["validation"] = validation
	}
	return validation
}

func (e *Executor) validateRequestSchema(ctx context.Context, bundle *domain.ReleaseBundle, flow domain.Flow, requestContext map[string]any) (map[string]any, error) {
	result := map[string]any{
		"enabled":       true,
		"valid":         true,
		"failed":        false,
		"issues":        []map[string]any{},
		"scenarioCodes": []string{},
	}

	doc, operation, err := e.loadOperationDocument(bundle, flow)
	if err != nil {
		return nil, err
	}
	if doc == nil || operation == nil || operation.RequestBody == nil || operation.RequestBody.Value == nil {
		return result, nil
	}

	body, _ := ResolveContextPath(requestContext, "request.body")
	if body == nil && !operation.RequestBody.Value.Required {
		return result, nil
	}
	contentType, _ := ResolveContextPath(requestContext, "request.headers.content-type")
	mediaType := selectRequestMediaType(operation.RequestBody.Value.Content, fmt.Sprint(contentType))
	if mediaType == "" {
		return result, nil
	}
	media := operation.RequestBody.Value.Content.Get(mediaType)
	if media == nil || media.Schema == nil || media.Schema.Value == nil {
		return result, nil
	}

	schemaData, err := json.Marshal(media.Schema.Value)
	if err != nil {
		return nil, fmt.Errorf("marshal request schema: %w", err)
	}
	schema, err := schemavalidator.Compile(schemaData, schemavalidator.WithAssertFormats())
	if err != nil {
		return nil, fmt.Errorf("compile request schema: %w", err)
	}
	bodyData, err := schemaValidationBodyJSON(body)
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
	settings, err := e.schemaValidationSettings(bundle, flow.SpecID)
	if err != nil {
		return nil, err
	}
	issues := renderedValidationIssues(newSchemaValidationRenderer(settings).Render(validationResult))
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

func (e *Executor) schemaValidationSettings(bundle *domain.ReleaseBundle, specID string) (domain.SchemaValidationSettings, error) {
	if bundle != nil {
		return bundle.ValidationConfig, nil
	}
	meta, err := e.store.GetSpecMeta(specID)
	if err == store.ErrNotFound {
		return domain.SchemaValidationSettings{}, nil
	}
	if err != nil {
		return domain.SchemaValidationSettings{}, err
	}
	return meta.ValidationConfig, nil
}

func schemaValidationBodyJSON(body any) ([]byte, error) {
	if body == nil {
		return []byte("null"), nil
	}
	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request body for schema validation: %w", err)
	}
	return data, nil
}

func (e *Executor) loadOperationDocument(bundle *domain.ReleaseBundle, flow domain.Flow) (*openapi3.T, *openapi3.Operation, error) {
	var data []byte
	if bundle != nil {
		data = bundle.SpecRaw
	} else {
		var err error
		data, err = e.store.GetSpecFile(flow.SpecID)
		if err == store.ErrNotFound {
			return nil, nil, nil
		}
		if err != nil {
			return nil, nil, err
		}
	}
	if len(data) == 0 {
		return nil, nil, nil
	}
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = false
	doc, err := loader.LoadFromData(data)
	if err != nil {
		return nil, nil, fmt.Errorf("load OpenAPI spec for schema validation: %w", err)
	}
	return doc, findOperation(doc, flow.OperationID), nil
}

func selectRequestMediaType(content openapi3.Content, contentType string) string {
	if len(content) == 0 {
		return ""
	}
	contentType = strings.TrimSpace(strings.Split(contentType, ";")[0])
	if contentType != "" && content.Get(contentType) != nil {
		return contentType
	}
	if content.Get("application/json") != nil {
		return "application/json"
	}
	mediaTypes := make([]string, 0, len(content))
	for mediaType := range content {
		mediaTypes = append(mediaTypes, mediaType)
	}
	sort.Strings(mediaTypes)
	return mediaTypes[0]
}

func newSchemaValidationRenderer(settings domain.SchemaValidationSettings) *schemavalidator.Renderer {
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

func renderedValidationIssues(messages []schemavalidator.Message) []map[string]any {
	issues := make([]map[string]any, 0, len(messages))
	for _, msg := range messages {
		scenarioCode := schemaScenarioCode(string(msg.Code), msg.Path)
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

func schemaScenarioCode(code, path string) string {
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

type responseCandidate struct {
	StatusCode int
	Headers    map[string]string
	Body       string
}

func (e *Executor) executeTemplate(bundle *domain.ReleaseBundle, specID, operationID string, node domain.Node, input map[string]any) (*responseCandidate, map[string]any, error) {
	t, found, err := e.resolveTemplate(bundle, specID, node.Data.TemplateID)
	if err != nil || !found {
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

func (e *Executor) resolveTemplate(bundle *domain.ReleaseBundle, specID, templateID string) (domain.Template, bool, error) {
	if bundle != nil {
		for _, template := range bundle.Templates {
			if template.ID == templateID {
				return template, true, nil
			}
		}
		return domain.Template{}, false, nil
	}
	template, err := e.store.GetTemplate(specID, templateID)
	if err == store.ErrNotFound {
		return domain.Template{}, false, nil
	}
	if err != nil {
		return domain.Template{}, false, err
	}
	return template, true, nil
}

func (e *Executor) resolveScript(bundle *domain.ReleaseBundle, specID, scriptID string) (domain.Script, bool, error) {
	if bundle != nil {
		for _, script := range bundle.Scripts {
			if script.ID == scriptID {
				return script, true, nil
			}
		}
		return domain.Script{}, false, nil
	}
	script, err := e.store.GetScript(specID, scriptID)
	if err == store.ErrNotFound {
		return domain.Script{}, false, nil
	}
	if err != nil {
		return domain.Script{}, false, err
	}
	return script, true, nil
}

func (e *Executor) exampleResponse(bundle *domain.ReleaseBundle, flow domain.Flow, context map[string]any) (*responseCandidate, map[string]any, bool, error) {
	var data []byte
	if bundle != nil {
		data = bundle.SpecRaw
	} else {
		var err error
		data, err = e.store.GetSpecFile(flow.SpecID)
		if err == store.ErrNotFound {
			return nil, nil, false, nil
		}
		if err != nil {
			return nil, nil, false, err
		}
	}
	if len(data) == 0 {
		return nil, nil, false, nil
	}
	doc, err := openapi3.NewLoader().LoadFromData(data)
	if err != nil {
		return nil, nil, false, fmt.Errorf("load OpenAPI spec for fallback response: %w", err)
	}
	operation := findOperation(doc, flow.OperationID)
	if operation == nil {
		return nil, nil, false, nil
	}
	example, found := firstSuccessResponseExample(flow.OperationID, operation)
	if !found {
		return nil, nil, false, nil
	}

	headers := make(map[string]string, len(example.Headers))
	for key, valTmpl := range example.Headers {
		rendered, err := renderString(valTmpl, context)
		if err != nil {
			return nil, nil, false, fmt.Errorf("example header %q render error: %w", key, err)
		}
		headers[key] = rendered
	}
	body, err := renderString(example.Body, context)
	if err != nil {
		return nil, nil, false, fmt.Errorf("example body render error: %w", err)
	}
	candidate := &responseCandidate{StatusCode: example.StatusCode, Headers: headers, Body: body}
	output := map[string]any{
		"statusCode": example.StatusCode,
		"headers":    headers,
		"body":       body,
		"source":     "openapi-example",
		"exampleId":  example.ID,
	}
	return candidate, output, true, nil
}

func findOperation(doc *openapi3.T, operationID string) *openapi3.Operation {
	for path, pathItem := range doc.Paths.Map() {
		for method, operation := range pathItem.Operations() {
			if domain.MakeOpID(method, path) == operationID {
				return operation
			}
		}
	}
	return nil
}

func firstSuccessResponseExample(operationID string, operation *openapi3.Operation) (domain.TemplateExample, bool) {
	if operation == nil || operation.Responses == nil {
		return domain.TemplateExample{}, false
	}
	statuses := operation.Responses.Keys()
	sort.Strings(statuses)
	for _, statusText := range statuses {
		statusCode, err := strconv.Atoi(statusText)
		if err != nil || statusCode < 200 || statusCode > 299 {
			continue
		}
		responseRef := operation.Responses.Value(statusText)
		if responseRef == nil || responseRef.Value == nil {
			continue
		}
		response := responseRef.Value
		headers := exampleHeaders(response.Headers)
		mediaTypes := make([]string, 0, len(response.Content))
		for mediaType := range response.Content {
			mediaTypes = append(mediaTypes, mediaType)
		}
		sort.Strings(mediaTypes)
		for _, mediaType := range mediaTypes {
			media := response.Content[mediaType]
			if media == nil {
				continue
			}
			exampleHeaders := cloneHeaders(headers)
			exampleHeaders["Content-Type"] = mediaType
			build := func(key, name string, value any) (domain.TemplateExample, bool) {
				if value == nil {
					return domain.TemplateExample{}, false
				}
				return domain.TemplateExample{
					ID:          fmt.Sprintf("%s:%s:%s:%s", operationID, statusText, mediaType, key),
					Name:        name,
					OperationID: operationID,
					StatusCode:  statusCode,
					MediaType:   mediaType,
					Body:        formatExampleBody(value),
					Headers:     cloneHeaders(exampleHeaders),
				}, true
			}

			names := make([]string, 0, len(media.Examples))
			for name := range media.Examples {
				names = append(names, name)
			}
			sort.Strings(names)
			for _, name := range names {
				ref := media.Examples[name]
				if ref == nil || ref.Value == nil || ref.Value.Value == nil {
					continue
				}
				label := strings.TrimSpace(ref.Value.Summary)
				if label == "" {
					label = name
				}
				if example, ok := build("named-"+name, fmt.Sprintf("%d · %s", statusCode, label), ref.Value.Value); ok {
					return example, true
				}
			}
			if example, ok := build("media", fmt.Sprintf("%d · %s example", statusCode, mediaType), media.Example); ok {
				return example, true
			}
			if media.Schema != nil && media.Schema.Value != nil {
				schema := media.Schema.Value
				if example, ok := build("schema", fmt.Sprintf("%d · schema example", statusCode), schema.Example); ok {
					return example, true
				}
				for i, value := range schema.Examples {
					if example, ok := build(fmt.Sprintf("schema-%d", i+1), fmt.Sprintf("%d · schema example %d", statusCode, i+1), value); ok {
						return example, true
					}
				}
			}
		}
	}
	return domain.TemplateExample{}, false
}

func exampleHeaders(headers openapi3.Headers) map[string]string {
	result := map[string]string{}
	for name, ref := range headers {
		if ref == nil || ref.Value == nil || ref.Value.Example == nil {
			continue
		}
		result[name] = fmt.Sprint(ref.Value.Example)
	}
	return result
}

func cloneHeaders(headers map[string]string) map[string]string {
	result := make(map[string]string, len(headers)+1)
	for key, value := range headers {
		result[key] = value
	}
	return result
}

func formatExampleBody(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	formatted, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Sprint(value)
	}
	return string(formatted)
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
	return buildMappingValues(node.Data.Mappings, context)
}

func buildMappingValues(mappings []domain.Mapping, context map[string]any) map[string]any {
	input := make(map[string]any, len(mappings))
	for _, mapping := range mappings {
		if mapping.Type == "constant" {
			input[mapping.Key] = mapping.Value
			continue
		}
		if isGeneratedMapping(mapping) {
			value, err := generatedMappingValue(mapping)
			if err != nil {
				input[mapping.Key] = nil
			} else {
				input[mapping.Key] = value
			}
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

type resolvedFilter struct {
	key      string
	operator domain.ConditionOperator
	value    any
}

func resolveQueryFilters(mappings []domain.Mapping, context map[string]any) []resolvedFilter {
	filters := make([]resolvedFilter, 0, len(mappings))
	for _, mapping := range mappings {
		var value any
		if mapping.Type == "constant" {
			value = mapping.Value
		} else if isGeneratedMapping(mapping) {
			generated, err := generatedMappingValue(mapping)
			if err == nil {
				value = generated
			}
		} else {
			value, _ = ResolveContextPath(context, mapping.Source)
		}
		operator := domain.ConditionOperator(mapping.Operator)
		if operator == "" {
			operator = domain.ConditionOperatorEquals
		}
		filters = append(filters, resolvedFilter{key: mapping.Key, operator: operator, value: value})
	}
	return filters
}

func filterSummary(filters []resolvedFilter) []map[string]any {
	summary := make([]map[string]any, 0, len(filters))
	for _, filter := range filters {
		summary = append(summary, map[string]any{
			"key":      filter.key,
			"operator": filter.operator,
			"value":    filter.value,
		})
	}
	return summary
}

func matchesFilters(docData map[string]any, filters []resolvedFilter) (bool, error) {
	for _, filter := range filters {
		actual, exists := ResolveContextPath(docData, filter.key)
		matched, err := evaluateRule(filter.operator, actual, exists, filter.value)
		if err != nil {
			return false, err
		}
		if !matched {
			return false, nil
		}
	}
	return true, nil
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
		if isGeneratedMapping(mapping) {
			value, err := generatedMappingValue(mapping)
			if err != nil {
				view[mapping.Key] = nil
			} else {
				view[mapping.Key] = value
			}
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

func isGeneratedMapping(mapping domain.Mapping) bool {
	return mapping.Type == "random" || mapping.Type == "fake" || mapping.Type == "relativeTime"
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
		"path": func(source string) any {
			value, exists := ResolveContextPath(ctx, source)
			if !exists {
				return nil
			}
			return templatePathValue(value)
		},
	}
	t, err := template.New("").Funcs(funcs).Parse(normalizeTemplateShorthand(tmplStr))
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, ctx); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// templatePathValue keeps scalar substitutions unchanged, while making a
// direct structured-path substitution valid JSON instead of Go's map format.
func templatePathValue(value any) any {
	switch value.(type) {
	case map[string]any, map[string]string, []any, []string:
		encoded, err := json.Marshal(value)
		if err == nil {
			return jsonTemplateValue(encoded)
		}
	}
	return value
}

type jsonTemplateValue []byte

func (value jsonTemplateValue) String() string { return string(value) }

func normalizeTemplateShorthand(tmplStr string) string {
	return shorthandTemplatePathPattern.ReplaceAllString(tmplStr, `{{path "$1"}}`)
}
