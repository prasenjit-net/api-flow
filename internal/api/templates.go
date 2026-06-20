package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

func (h *Handler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	templates, err := h.store.ListTemplates()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if templates == nil {
		templates = []domain.Template{}
	}
	respondJSON(w, http.StatusOK, templates)
}

func (h *Handler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	var t domain.Template
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if t.StatusCode == 0 {
		t.StatusCode = http.StatusOK
	}
	if t.Headers == nil {
		t.Headers = map[string]string{}
	}
	now := time.Now().UTC()
	t.ID = uuid.New().String()
	t.CreatedAt = now
	t.UpdatedAt = now

	if err := h.store.SaveTemplate(t); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, t)
}

func (h *Handler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	existing, err := h.store.GetTemplate(id)
	if err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "template not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var t domain.Template
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	t.ID = existing.ID
	t.CreatedAt = existing.CreatedAt
	t.UpdatedAt = time.Now().UTC()
	if t.StatusCode == 0 {
		t.StatusCode = http.StatusOK
	}
	if t.Headers == nil {
		t.Headers = map[string]string{}
	}

	if err := h.store.SaveTemplate(t); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, t)
}

func (h *Handler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := h.store.GetTemplate(id); err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "template not found")
		return
	}
	if err := h.store.DeleteTemplate(id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
