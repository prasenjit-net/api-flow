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
	respondJSON(w, http.StatusOK, flow)
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

	if err := h.store.SaveFlow(flow); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, flow)
}
