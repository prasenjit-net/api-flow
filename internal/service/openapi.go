package service

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

var operationMethodOrder = map[string]int{
	http.MethodGet: 0, http.MethodPost: 1, http.MethodPut: 2, http.MethodHead: 3,
	"OPTION": 4, http.MethodOptions: 4, http.MethodDelete: 5,
}

// ListOperations returns compact, agent-oriented metadata for every operation
// in the specification. The OpenAPI source remains available through spec_get
// when an agent needs the complete document.
func (w *Workspace) ListOperations(specID string) ([]domain.Operation, error) {
	doc, err := w.loadSpecDocument(specID)
	if err != nil {
		return nil, err
	}
	flows, err := w.store.ListFlows(specID)
	if err != nil {
		return nil, err
	}
	flowSet := make(map[string]bool, len(flows))
	for _, flow := range flows {
		flowSet[flow.OperationID] = true
	}

	operations := operationMetadata(doc, flowSet)
	sortOperations(operations)
	return operations, nil
}

func operationMetadata(doc *openapi3.T, flowSet map[string]bool) []domain.Operation {
	operations := make([]domain.Operation, 0)
	for path, pathItem := range doc.Paths.Map() {
		for method, operation := range pathItem.Operations() {
			operationID := domain.MakeOpID(method, path)
			operations = append(operations, domain.Operation{
				ID: operationID, Method: strings.ToUpper(method), Path: path,
				Summary: operationSummary(operation), Description: operationDescription(operation), HasFlow: flowSet[operationID],
				InputHints: operationHints(pathItem, operation),
			})
		}
	}
	return operations
}

func operationSummary(operation *openapi3.Operation) string {
	if operation == nil {
		return ""
	}
	return operation.Summary
}

func operationDescription(operation *openapi3.Operation) string {
	if operation == nil {
		return ""
	}
	return operation.Description
}

func sortOperations(operations []domain.Operation) {
	sort.Slice(operations, func(i, j int) bool {
		leftOrder, leftKnown := operationMethodOrder[operations[i].Method]
		rightOrder, rightKnown := operationMethodOrder[operations[j].Method]
		if leftKnown != rightKnown {
			return leftKnown
		}
		if leftKnown && leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if operations[i].Method != operations[j].Method {
			return operations[i].Method < operations[j].Method
		}
		return operations[i].Path < operations[j].Path
	})
}

func (w *Workspace) GetOperation(specID, operationID string) (domain.Operation, error) {
	operations, err := w.ListOperations(specID)
	if err != nil {
		return domain.Operation{}, err
	}
	for _, operation := range operations {
		if operation.ID == operationID {
			return operation, nil
		}
	}
	return domain.Operation{}, fmt.Errorf("operation not found")
}

func (w *Workspace) ListResponseExamples(specID, operationID string) ([]domain.TemplateExample, error) {
	doc, err := w.loadSpecDocument(specID)
	if err != nil {
		return nil, err
	}
	operation := findOperation(doc, operationID)
	if operation == nil {
		return nil, fmt.Errorf("operation not found")
	}
	return extractResponseExamples(operationID, operation), nil
}

func (w *Workspace) loadSpecDocument(specID string) (*openapi3.T, error) {
	data, err := w.store.GetSpecFile(specID)
	if err != nil {
		return nil, err
	}
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = false
	return loader.LoadFromData(data)
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

func operationHints(pathItem *openapi3.PathItem, operation *openapi3.Operation) domain.OperationHints {
	hints := domain.OperationHints{}
	if pathItem != nil {
		addParameterHints(&hints, pathItem.Parameters)
	}
	if operation != nil {
		addParameterHints(&hints, operation.Parameters)
		addBodyHints(&hints, operation.RequestBody)
	}
	hints.Path = uniqueSorted(hints.Path)
	hints.Query = uniqueSorted(hints.Query)
	hints.Headers = uniqueSorted(hints.Headers)
	hints.Body = uniqueSorted(hints.Body)
	return hints
}

func addParameterHints(hints *domain.OperationHints, parameters openapi3.Parameters) {
	for _, ref := range parameters {
		if ref == nil || ref.Value == nil || ref.Value.Name == "" {
			continue
		}
		switch ref.Value.In {
		case openapi3.ParameterInPath:
			hints.Path = append(hints.Path, ref.Value.Name)
		case openapi3.ParameterInQuery:
			hints.Query = append(hints.Query, ref.Value.Name)
		case openapi3.ParameterInHeader:
			hints.Headers = append(hints.Headers, strings.ToLower(ref.Value.Name))
		}
	}
}

func addBodyHints(hints *domain.OperationHints, requestBody *openapi3.RequestBodyRef) {
	if requestBody == nil || requestBody.Value == nil {
		return
	}
	for _, mediaType := range requestBody.Value.Content {
		if mediaType != nil && mediaType.Schema != nil {
			collectSchemaPaths(mediaType.Schema, "", 0, &hints.Body)
		}
	}
}

func collectSchemaPaths(ref *openapi3.SchemaRef, prefix string, depth int, out *[]string) {
	if ref == nil || ref.Value == nil || depth > 3 {
		return
	}
	schema := ref.Value
	for _, child := range schema.AllOf {
		collectSchemaPaths(child, prefix, depth, out)
	}
	for _, child := range schema.AnyOf {
		collectSchemaPaths(child, prefix, depth, out)
	}
	for _, child := range schema.OneOf {
		collectSchemaPaths(child, prefix, depth, out)
	}
	for name, child := range schema.Properties {
		path := name
		if prefix != "" {
			path = prefix + "." + name
		}
		*out = append(*out, path)
		if child != nil && child.Value != nil && len(child.Value.Properties) > 0 {
			collectSchemaPaths(child, path, depth+1, out)
		}
	}
	if schema.Items != nil && schema.Items.Value != nil && len(schema.Items.Value.Properties) > 0 {
		collectSchemaPaths(schema.Items, prefix, depth+1, out)
	}
}

func uniqueSorted(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func extractResponseExamples(operationID string, operation *openapi3.Operation) []domain.TemplateExample {
	if operation == nil || operation.Responses == nil {
		return []domain.TemplateExample{}
	}
	result := make([]domain.TemplateExample, 0)
	statuses := operation.Responses.Keys()
	sort.Strings(statuses)
	for _, statusText := range statuses {
		result = append(result, responseExamplesForStatus(operationID, statusText, operation.Responses.Value(statusText))...)
	}
	return result
}

func responseExamplesForStatus(operationID, statusText string, ref *openapi3.ResponseRef) []domain.TemplateExample {
	statusCode, err := strconv.Atoi(statusText)
	if err != nil || statusCode < 100 || statusCode > 599 || ref == nil || ref.Value == nil {
		return nil
	}
	response := ref.Value
	result := make([]domain.TemplateExample, 0)
	for _, mediaType := range sortedMediaTypes(response.Content) {
		result = append(result, mediaExamples(operationID, statusText, statusCode, mediaType, response.Content[mediaType], exampleHeaders(response.Headers))...)
	}
	return result
}

func sortedMediaTypes(content openapi3.Content) []string {
	mediaTypes := make([]string, 0, len(content))
	for mediaType := range content {
		mediaTypes = append(mediaTypes, mediaType)
	}
	sort.Strings(mediaTypes)
	return mediaTypes
}

func mediaExamples(operationID, statusText string, statusCode int, mediaType string, media *openapi3.MediaType, headers map[string]string) []domain.TemplateExample {
	if media == nil {
		return nil
	}
	result := make([]domain.TemplateExample, 0)
	exampleHeaders := cloneHeaders(headers)
	exampleHeaders["Content-Type"] = mediaType
	for _, name := range sortedExampleNames(media.Examples) {
		if ref := media.Examples[name]; ref != nil && ref.Value != nil && ref.Value.Value != nil {
			label := ref.Value.Summary
			if strings.TrimSpace(label) == "" {
				label = name
			}
			result = appendTemplateExample(result, operationID, statusText, statusCode, mediaType, "named-"+name, fmt.Sprintf("%d · %s", statusCode, label), ref.Value.Value, exampleHeaders)
		}
	}
	result = appendTemplateExample(result, operationID, statusText, statusCode, mediaType, "media", fmt.Sprintf("%d · %s example", statusCode, mediaType), media.Example, exampleHeaders)
	if media.Schema != nil && media.Schema.Value != nil {
		schema := media.Schema.Value
		result = appendTemplateExample(result, operationID, statusText, statusCode, mediaType, "schema", fmt.Sprintf("%d · schema example", statusCode), schema.Example, exampleHeaders)
		for i, value := range schema.Examples {
			result = appendTemplateExample(result, operationID, statusText, statusCode, mediaType, fmt.Sprintf("schema-%d", i+1), fmt.Sprintf("%d · schema example %d", statusCode, i+1), value, exampleHeaders)
		}
	}
	return result
}

func sortedExampleNames(examples openapi3.Examples) []string {
	names := make([]string, 0, len(examples))
	for name := range examples {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func appendTemplateExample(result []domain.TemplateExample, operationID, statusText string, statusCode int, mediaType, key, name string, value any, headers map[string]string) []domain.TemplateExample {
	if value == nil {
		return result
	}
	return append(result, domain.TemplateExample{ID: fmt.Sprintf("%s:%s:%s:%s", operationID, statusText, mediaType, key), Name: name, OperationID: operationID, StatusCode: statusCode, MediaType: mediaType, Body: formatExampleBody(value), Headers: cloneHeaders(headers)})
}

func exampleHeaders(headers openapi3.Headers) map[string]string {
	result := map[string]string{}
	for name, ref := range headers {
		if ref != nil && ref.Value != nil && ref.Value.Example != nil {
			result[name] = fmt.Sprint(ref.Value.Example)
		}
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
