package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/prasenjit-net/api-flow/internal/store"
)

func (h *Handler) ListTraces(w http.ResponseWriter, r *http.Request) {
	traces, err := h.workspace.ListTraces(r.URL.Query().Get("specId"), r.URL.Query().Get("operationId"))
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, traces)
}

func (h *Handler) GetTrace(w http.ResponseWriter, r *http.Request) {
	traceID := chi.URLParam(r, "traceId")
	trace, err := h.workspace.GetTrace(traceID)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "trace not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, trace)
}

func (h *Handler) DeleteTrace(w http.ResponseWriter, r *http.Request) {
	traceID := chi.URLParam(r, "traceId")
	if err := h.workspace.DeleteTrace(traceID); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteAllTraces(w http.ResponseWriter, r *http.Request) {
	if err := h.workspace.DeleteAllTraces(); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
