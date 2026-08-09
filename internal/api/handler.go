package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/registry"
	"github.com/prasenjit-net/api-flow/internal/sessions"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

type Handler struct {
	config   config.Config
	version  version.Info
	store    store.Store
	registry *registry.Registry
	sessions *sessions.Manager
}

type metaResponse struct {
	Name        string       `json:"name"`
	Description string       `json:"description"`
	Environment string       `json:"environment"`
	URL         string       `json:"url"`
	UIProxy     string       `json:"uiProxy"`
	Version     version.Info `json:"version"`
}

func NewHandler(cfg config.Config, build version.Info, s store.Store, reg *registry.Registry, managers ...*sessions.Manager) *Handler {
	var manager *sessions.Manager
	if len(managers) > 0 {
		manager = managers[0]
	}
	return &Handler{config: cfg, version: build, store: s, registry: reg, sessions: manager}
}

func (h *Handler) Meta(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, metaResponse{
		Name:        h.config.App.Name,
		Description: h.config.App.Description,
		Environment: h.config.App.Env,
		URL:         h.config.App.URL,
		UIProxy:     h.config.UI.DevProxyURL,
		Version:     h.version,
	})
}

func respondJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func respondError(w http.ResponseWriter, r *http.Request, status int, msg string) {
	payload := map[string]any{"error": msg}
	respondJSON(w, status, withRequestID(r, payload))
}

func withRequestID(r *http.Request, payload map[string]any) map[string]any {
	if requestID := middleware.GetReqID(r.Context()); requestID != "" {
		payload["requestId"] = requestID
	}
	return payload
}
