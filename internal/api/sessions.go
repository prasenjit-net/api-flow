package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/prasenjit-net/api-flow/internal/domain"
	sessionstore "github.com/prasenjit-net/api-flow/internal/sessions"
	"github.com/prasenjit-net/api-flow/internal/store"
)

type sessionCollectionData struct {
	SpecID       string            `json:"specId"`
	CollectionID string            `json:"collectionId"`
	Documents    []domain.Document `json:"documents"`
}

type sessionDetailResponse struct {
	sessionstore.Session
	Summary sessionstore.Summary    `json:"summary"`
	Data    []sessionCollectionData `json:"data"`
}

func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	if h.sessions == nil {
		respondError(w, r, http.StatusServiceUnavailable, "session store is unavailable")
		return
	}
	items, err := h.workspace.ListSessions()
	if err != nil {
		respondError(w, r, http.StatusServiceUnavailable, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, items)
}

func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	if h.sessions == nil {
		respondError(w, r, http.StatusServiceUnavailable, "session store is unavailable")
		return
	}
	sessionID := chi.URLParam(r, "sessionId")
	session, err := h.workspace.GetSession(sessionID)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "session not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusServiceUnavailable, err.Error())
		return
	}
	data, err := h.materializeSessionData(session)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, sessionDetailResponse{
		Session: session,
		Summary: sessionstore.Summary{
			ID:         session.ID,
			CreatedAt:  session.CreatedAt,
			LastSeenAt: session.LastSeenAt,
			ExpiresAt:  session.ExpiresAt,
			EventCount: len(session.Events),
		},
		Data: data,
	})
}

func (h *Handler) DeleteSession(w http.ResponseWriter, r *http.Request) {
	if h.sessions == nil {
		respondError(w, r, http.StatusServiceUnavailable, "session store is unavailable")
		return
	}
	if err := h.workspace.DeleteSession(chi.URLParam(r, "sessionId")); err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "session not found")
		return
	} else if err != nil {
		respondError(w, r, http.StatusServiceUnavailable, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) PersistSession(w http.ResponseWriter, r *http.Request) {
	if h.sessions == nil {
		respondError(w, r, http.StatusServiceUnavailable, "session store is unavailable")
		return
	}
	sessionID := chi.URLParam(r, "sessionId")
	summary, err := h.workspace.PersistSession(sessionID)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "session not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, summary)
}

func (h *Handler) materializeSessionData(session sessionstore.Session) ([]sessionCollectionData, error) {
	targets := sessionstore.ReplayTargets(session.Events)
	result := make([]sessionCollectionData, 0, len(targets))
	for _, target := range targets {
		base, err := h.store.ListDocuments(target.SpecID, target.CollectionID)
		if err != nil {
			return nil, err
		}
		result = append(result, sessionCollectionData{
			SpecID:       target.SpecID,
			CollectionID: target.CollectionID,
			Documents:    sessionstore.Replay(base, session.Events, target.SpecID, target.CollectionID),
		})
	}
	return result, nil
}
