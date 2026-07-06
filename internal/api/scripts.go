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
	scripts, err := h.store.ListScripts()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
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
	script, err := h.store.GetScript(chi.URLParam(r, "scriptId"))
	if err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "script not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, script)
}

func (h *Handler) CreateScript(w http.ResponseWriter, r *http.Request) {
	var script domain.Script
	if err := json.NewDecoder(r.Body).Decode(&script); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !validateScriptPayload(w, script) {
		return
	}
	now := time.Now().UTC()
	script.ID = uuid.New().String()
	script.CreatedAt = now
	script.UpdatedAt = now
	if err := h.store.SaveScript(script); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, script)
}

func (h *Handler) UpdateScript(w http.ResponseWriter, r *http.Request) {
	scriptID := chi.URLParam(r, "scriptId")
	existing, err := h.store.GetScript(scriptID)
	if err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "script not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var script domain.Script
	if err := json.NewDecoder(r.Body).Decode(&script); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !validateScriptPayload(w, script) {
		return
	}
	script.ID = existing.ID
	script.CreatedAt = existing.CreatedAt
	script.UpdatedAt = time.Now().UTC()
	if err := h.store.SaveScript(script); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, script)
}

func (h *Handler) DeleteScript(w http.ResponseWriter, r *http.Request) {
	scriptID := chi.URLParam(r, "scriptId")
	if _, err := h.store.GetScript(scriptID); err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "script not found")
		return
	} else if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	specs, err := h.store.ListSpecMeta()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var references []map[string]string
	for _, spec := range specs {
		flows, err := h.store.ListFlows(spec.ID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, flow := range flows {
			for _, node := range flow.Nodes {
				if node.Type == domain.NodeTypeStarlark && node.Data.ScriptID == scriptID {
					references = append(references, map[string]string{
						"specId":      spec.ID,
						"operationId": flow.OperationID,
						"nodeId":      node.ID,
					})
				}
			}
		}
	}
	if len(references) > 0 {
		respondJSON(w, http.StatusConflict, map[string]any{
			"error":      "script is referenced by saved flows",
			"references": references,
		})
		return
	}
	if err := h.store.DeleteScript(scriptID); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func validateScriptPayload(w http.ResponseWriter, script domain.Script) bool {
	if strings.TrimSpace(script.Name) == "" {
		respondError(w, http.StatusUnprocessableEntity, "script name is required")
		return false
	}
	if strings.TrimSpace(script.Source) == "" {
		respondError(w, http.StatusUnprocessableEntity, "script source is required")
		return false
	}
	if err := executor.ValidateStarlarkSource(script.Name, script.Source); err != nil {
		respondJSON(w, http.StatusUnprocessableEntity, map[string]string{
			"error": "invalid Starlark script: " + err.Error(),
		})
		return false
	}
	return true
}
