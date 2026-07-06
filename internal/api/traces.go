package api

import (
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

func (h *Handler) ListTraces(w http.ResponseWriter, r *http.Request) {
	traces, err := h.store.ListTraces()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	specID := r.URL.Query().Get("specId")
	operationID := r.URL.Query().Get("operationId")
	if specID != "" || operationID != "" {
		filtered := traces[:0]
		for _, trace := range traces {
			if specID != "" && trace.SpecID != specID {
				continue
			}
			if operationID != "" && trace.OperationID != operationID {
				continue
			}
			filtered = append(filtered, trace)
		}
		traces = filtered
	}

	sort.SliceStable(traces, func(i, j int) bool {
		return traces[i].StartedAt.After(traces[j].StartedAt)
	})
	if traces == nil {
		traces = []domain.TraceSummary{}
	}
	respondJSON(w, http.StatusOK, traces)
}

func (h *Handler) GetTrace(w http.ResponseWriter, r *http.Request) {
	traceID := chi.URLParam(r, "traceId")
	trace, err := h.store.GetTrace(traceID)
	if err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "trace not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, trace)
}

func (h *Handler) DeleteTrace(w http.ResponseWriter, r *http.Request) {
	traceID := chi.URLParam(r, "traceId")
	if err := h.store.DeleteTrace(traceID); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteAllTraces(w http.ResponseWriter, r *http.Request) {
	if err := h.store.DeleteAllTraces(); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
