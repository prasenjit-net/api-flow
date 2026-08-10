package api

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

func (h *Handler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	templates, err := h.store.ListTemplates(specID)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
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
	if !h.specExists(w, r, specID) {
		return
	}
	var template domain.Template
	if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	template.SpecID = specID
	if !h.validateTemplateOperation(w, r, specID, template.OperationID) {
		return
	}
	if strings.TrimSpace(template.Name) == "" {
		respondError(w, r, http.StatusUnprocessableEntity, "template name is required")
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
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, template)
}

func (h *Handler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	templateID := chi.URLParam(r, "templateId")
	if !h.specExists(w, r, specID) {
		return
	}
	existing, err := h.store.GetTemplate(specID, templateID)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "template not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}

	var template domain.Template
	if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(template.Name) == "" {
		respondError(w, r, http.StatusUnprocessableEntity, "template name is required")
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
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, template)
}

func (h *Handler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	templateID := chi.URLParam(r, "templateId")
	if _, err := h.store.GetTemplate(specID, templateID); err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "template not found")
		return
	} else if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}

	flows, err := h.store.ListFlows(specID)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
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
		respondJSON(w, http.StatusConflict, withRequestID(r, map[string]any{
			"error":      "template is referenced by saved flows",
			"operations": usedBy,
		}))
		return
	}
	if err := h.store.DeleteTemplate(specID, templateID); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListResponseExamples(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	operationID := chi.URLParam(r, "opId")
	if !h.specExists(w, r, specID) {
		return
	}
	examples, err := h.workspace.ListResponseExamples(specID, operationID)
	if err != nil {
		status := http.StatusInternalServerError
		if err == store.ErrNotFound || strings.Contains(err.Error(), "operation not found") {
			status = http.StatusNotFound
		}
		respondError(w, r, status, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, examples)
}

func (h *Handler) specExists(w http.ResponseWriter, r *http.Request, specID string) bool {
	if _, err := h.store.GetSpecMeta(specID); err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "spec not found")
		return false
	} else if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return false
	}
	return true
}

func (h *Handler) validateTemplateOperation(w http.ResponseWriter, r *http.Request, specID, operationID string) bool {
	if operationID == "" {
		return true
	}
	if _, err := h.workspace.GetOperation(specID, operationID); err != nil {
		respondError(w, r, http.StatusUnprocessableEntity, "operation does not belong to this specification")
		return false
	}
	return true
}
