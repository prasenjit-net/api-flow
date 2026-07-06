package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

func (h *Handler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, specID) {
		return
	}
	templates, err := h.store.ListTemplates(specID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	operationID := strings.TrimSpace(r.URL.Query().Get("operationId"))
	if operationID != "" {
		filtered := templates[:0]
		for _, template := range templates {
			if template.OperationID == "" || template.OperationID == operationID {
				filtered = append(filtered, template)
			}
		}
		templates = filtered
	}
	if templates == nil {
		templates = []domain.Template{}
	}
	sort.Slice(templates, func(i, j int) bool {
		if templates[i].OperationID != templates[j].OperationID {
			return templates[i].OperationID < templates[j].OperationID
		}
		return strings.ToLower(templates[i].Name) < strings.ToLower(templates[j].Name)
	})
	respondJSON(w, http.StatusOK, templates)
}

func (h *Handler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, specID) {
		return
	}
	var template domain.Template
	if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	template.SpecID = specID
	if !h.validateTemplateOperation(w, specID, template.OperationID) {
		return
	}
	if strings.TrimSpace(template.Name) == "" {
		respondError(w, http.StatusUnprocessableEntity, "template name is required")
		return
	}
	if template.StatusCode == 0 {
		template.StatusCode = http.StatusOK
	}
	if template.Headers == nil {
		template.Headers = map[string]string{}
	}
	now := time.Now().UTC()
	template.ID = uuid.New().String()
	template.CreatedAt = now
	template.UpdatedAt = now

	if err := h.store.SaveTemplate(specID, template); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, template)
}

func (h *Handler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	templateID := chi.URLParam(r, "templateId")
	if !h.specExists(w, specID) {
		return
	}
	existing, err := h.store.GetTemplate(specID, templateID)
	if err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "template not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var template domain.Template
	if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(template.Name) == "" {
		respondError(w, http.StatusUnprocessableEntity, "template name is required")
		return
	}
	template.ID = existing.ID
	template.SpecID = specID
	template.OperationID = existing.OperationID
	template.SourceExampleID = existing.SourceExampleID
	template.CreatedAt = existing.CreatedAt
	template.UpdatedAt = time.Now().UTC()
	if template.StatusCode == 0 {
		template.StatusCode = http.StatusOK
	}
	if template.Headers == nil {
		template.Headers = map[string]string{}
	}

	if err := h.store.SaveTemplate(specID, template); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, template)
}

func (h *Handler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	templateID := chi.URLParam(r, "templateId")
	if _, err := h.store.GetTemplate(specID, templateID); err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "template not found")
		return
	} else if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	flows, err := h.store.ListFlows(specID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var usedBy []string
	for _, flow := range flows {
		for _, node := range flow.Nodes {
			if node.Type == domain.NodeTypeTemplate && node.Data.TemplateID == templateID {
				usedBy = append(usedBy, flow.OperationID)
				break
			}
		}
	}
	if len(usedBy) > 0 {
		sort.Strings(usedBy)
		respondJSON(w, http.StatusConflict, map[string]any{
			"error":      "template is referenced by saved flows",
			"operations": usedBy,
		})
		return
	}
	if err := h.store.DeleteTemplate(specID, templateID); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListResponseExamples(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	operationID := chi.URLParam(r, "opId")
	if !h.specExists(w, specID) {
		return
	}
	doc, err := h.loadSpecDocument(specID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	operation := findOperation(doc, operationID)
	if operation == nil {
		respondError(w, http.StatusNotFound, "operation not found")
		return
	}

	examples := extractResponseExamples(operationID, operation)
	respondJSON(w, http.StatusOK, examples)
}

func (h *Handler) specExists(w http.ResponseWriter, specID string) bool {
	if _, err := h.store.GetSpecMeta(specID); err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "spec not found")
		return false
	} else if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	return true
}

func (h *Handler) validateTemplateOperation(w http.ResponseWriter, specID, operationID string) bool {
	if operationID == "" {
		return true
	}
	doc, err := h.loadSpecDocument(specID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	if findOperation(doc, operationID) == nil {
		respondError(w, http.StatusUnprocessableEntity, "operation does not belong to this specification")
		return false
	}
	return true
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

func extractResponseExamples(operationID string, operation *openapi3.Operation) []domain.TemplateExample {
	if operation == nil || operation.Responses == nil {
		return []domain.TemplateExample{}
	}
	var result []domain.TemplateExample
	statuses := operation.Responses.Keys()
	sort.Strings(statuses)
	for _, statusText := range statuses {
		statusCode, err := strconv.Atoi(statusText)
		if err != nil || statusCode < 100 || statusCode > 599 {
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
			appendExample := func(key, name string, value any) {
				if value == nil {
					return
				}
				result = append(result, domain.TemplateExample{
					ID:          fmt.Sprintf("%s:%s:%s:%s", operationID, statusText, mediaType, key),
					Name:        name,
					OperationID: operationID,
					StatusCode:  statusCode,
					MediaType:   mediaType,
					Body:        formatExampleBody(value),
					Headers:     cloneHeaders(exampleHeaders),
				})
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
				appendExample("named-"+name, fmt.Sprintf("%d · %s", statusCode, label), ref.Value.Value)
			}
			appendExample("media", fmt.Sprintf("%d · %s example", statusCode, mediaType), media.Example)
			if media.Schema != nil && media.Schema.Value != nil {
				schema := media.Schema.Value
				appendExample("schema", fmt.Sprintf("%d · schema example", statusCode), schema.Example)
				for i, value := range schema.Examples {
					appendExample(fmt.Sprintf("schema-%d", i+1), fmt.Sprintf("%d · schema example %d", statusCode, i+1), value)
				}
			}
		}
	}
	if result == nil {
		return []domain.TemplateExample{}
	}
	return result
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
