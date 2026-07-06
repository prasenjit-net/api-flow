package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

func (h *Handler) GetFlow(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	opID := chi.URLParam(r, "opId")

	flow, err := h.store.GetFlow(specID, opID)
	if err == store.ErrNotFound {
		respondJSON(w, http.StatusOK, domain.Flow{
			Version:     domain.CurrentFlowVersion,
			SpecID:      specID,
			OperationID: opID,
			Nodes:       []domain.Node{},
			Edges:       []domain.Edge{},
		})
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, domain.NormalizeFlow(flow))
}

func (h *Handler) SaveFlow(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	opID := chi.URLParam(r, "opId")

	var flow domain.Flow
	if err := json.NewDecoder(r.Body).Decode(&flow); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	flow.SpecID = specID
	flow.OperationID = opID
	flow = domain.NormalizeFlow(flow)

	validationErrors := domain.ValidateFlow(flow)
	for _, node := range flow.Nodes {
		if node.Type == domain.NodeTypeStarlark && node.Data.ScriptID != "" {
			if _, err := h.store.GetScript(node.Data.ScriptID); err == store.ErrNotFound {
				validationErrors = append(validationErrors, domain.FlowValidationError{
					Code:    "script_not_found",
					Message: "selected Starlark script does not exist",
					NodeID:  node.ID,
					Field:   "data.scriptId",
				})
			} else if err != nil {
				respondError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
		if node.Type != domain.NodeTypeTemplate || node.Data.TemplateID == "" {
			continue
		}
		template, err := h.store.GetTemplate(specID, node.Data.TemplateID)
		if err == store.ErrNotFound {
			validationErrors = append(validationErrors, domain.FlowValidationError{
				Code:    "template_not_found",
				Message: "selected template does not exist in this specification",
				NodeID:  node.ID,
				Field:   "data.templateId",
			})
		} else if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		} else if template.OperationID != "" && template.OperationID != opID {
			validationErrors = append(validationErrors, domain.FlowValidationError{
				Code:    "template_operation_mismatch",
				Message: "selected template is scoped to a different operation",
				NodeID:  node.ID,
				Field:   "data.templateId",
			})
		}
	}
	if len(validationErrors) > 0 {
		respondJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":   "workflow validation failed",
			"details": validationErrors,
		})
		return
	}

	if err := h.store.SaveFlow(flow); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, flow)
}
