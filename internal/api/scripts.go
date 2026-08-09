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
	"github.com/prasenjit-net/api-flow/internal/executor"
	"github.com/prasenjit-net/api-flow/internal/store"
)

func (h *Handler) ListScripts(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	scripts, err := h.store.ListScripts(specID)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if scripts == nil {
		scripts = []domain.Script{}
	}
	sort.Slice(scripts, func(i, j int) bool {
		return strings.ToLower(scripts[i].Name) < strings.ToLower(scripts[j].Name)
	})
	respondJSON(w, http.StatusOK, scripts)
}

func (h *Handler) GetScript(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	script, err := h.store.GetScript(specID, chi.URLParam(r, "scriptId"))
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "script not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, script)
}

func (h *Handler) CreateScript(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	var script domain.Script
	if err := json.NewDecoder(r.Body).Decode(&script); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !validateScriptPayload(w, r, script) {
		return
	}
	now := time.Now().UTC()
	script.ID = uuid.New().String()
	script.SpecID = specID
	script.CreatedAt = now
	script.UpdatedAt = now
	if err := h.store.SaveScript(specID, script); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, script)
}

func (h *Handler) UpdateScript(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	scriptID := chi.URLParam(r, "scriptId")
	existing, err := h.store.GetScript(specID, scriptID)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "script not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	var script domain.Script
	if err := json.NewDecoder(r.Body).Decode(&script); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !validateScriptPayload(w, r, script) {
		return
	}
	script.ID = existing.ID
	script.SpecID = specID
	script.CreatedAt = existing.CreatedAt
	script.UpdatedAt = time.Now().UTC()
	if err := h.store.SaveScript(specID, script); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, script)
}

func (h *Handler) DeleteScript(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	scriptID := chi.URLParam(r, "scriptId")
	if _, err := h.store.GetScript(specID, scriptID); err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "script not found")
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
	var references []map[string]string
	for _, flow := range flows {
		for _, node := range flow.Nodes {
			if node.Type == domain.NodeTypeStarlark && node.Data.ScriptID == scriptID {
				references = append(references, map[string]string{
					"specId":      specID,
					"operationId": flow.OperationID,
					"nodeId":      node.ID,
				})
			}
		}
	}
	if len(references) > 0 {
		respondJSON(w, http.StatusConflict, withRequestID(r, map[string]any{
			"error":      "script is referenced by saved flows",
			"references": references,
		}))
		return
	}
	if err := h.store.DeleteScript(specID, scriptID); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func validateScriptPayload(w http.ResponseWriter, r *http.Request, script domain.Script) bool {
	if strings.TrimSpace(script.Name) == "" {
		respondError(w, r, http.StatusUnprocessableEntity, "script name is required")
		return false
	}
	if strings.TrimSpace(script.Source) == "" {
		respondError(w, r, http.StatusUnprocessableEntity, "script source is required")
		return false
	}
	if err := executor.ValidateStarlarkSource(script.Name, script.Source); err != nil {
		respondJSON(w, http.StatusUnprocessableEntity, withRequestID(r, map[string]any{
			"error": "invalid Starlark script: " + err.Error(),
		}))
		return false
	}
	return true
}
