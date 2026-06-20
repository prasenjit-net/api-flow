package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/registry"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

type Handler struct {
	config   config.Config
	version  version.Info
	store    store.Store
	registry *registry.Registry
}

type healthResponse struct {
	Status  string       `json:"status"`
	Service string       `json:"service"`
	Env     string       `json:"env"`
	Time    time.Time    `json:"time"`
	Version version.Info `json:"version"`
}

type metaResponse struct {
	Name        string       `json:"name"`
	Description string       `json:"description"`
	Environment string       `json:"environment"`
	URL         string       `json:"url"`
	UIProxy     string       `json:"uiProxy"`
	Version     version.Info `json:"version"`
}

func NewHandler(cfg config.Config, build version.Info, s store.Store, reg *registry.Registry) *Handler {
	return &Handler{config: cfg, version: build, store: s, registry: reg}
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, healthResponse{
		Status:  "ok",
		Service: h.config.App.Name,
		Env:     h.config.App.Env,
		Time:    time.Now().UTC(),
		Version: h.version,
	})
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

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}
