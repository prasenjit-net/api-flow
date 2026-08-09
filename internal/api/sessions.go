package api

import (
	"net/http"
	"reflect"

	"github.com/go-chi/chi/v5"

	"github.com/prasenjit-net/api-flow/internal/domain"
	sessionstore "github.com/prasenjit-net/api-flow/internal/sessions"
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
	respondJSON(w, http.StatusOK, h.sessions.List())
}

func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	if h.sessions == nil {
		respondError(w, r, http.StatusServiceUnavailable, "session store is unavailable")
		return
	}
	sessionID := chi.URLParam(r, "sessionId")
	session, ok := h.sessions.Get(sessionID)
	if !ok {
		respondError(w, r, http.StatusNotFound, "session not found")
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
	if !h.sessions.Delete(chi.URLParam(r, "sessionId")) {
		respondError(w, r, http.StatusNotFound, "session not found")
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
	session, ok := h.sessions.Get(sessionID)
	if !ok {
		respondError(w, r, http.StatusNotFound, "session not found")
		return
	}
	summary := sessionstore.PersistSummary{SessionID: session.ID}
	for _, target := range sessionstore.ReplayTargets(session.Events) {
		base, err := h.store.ListDocuments(target.SpecID, target.CollectionID)
		if err != nil {
			respondError(w, r, http.StatusInternalServerError, err.Error())
			return
		}
		effective := sessionstore.Replay(base, session.Events, target.SpecID, target.CollectionID)
		baseByID := documentsByID(base)
		effectiveByID := documentsByID(effective)
		for id := range baseByID {
			if _, ok := effectiveByID[id]; ok {
				continue
			}
			if err := h.store.DeleteDocument(target.SpecID, target.CollectionID, id); err != nil {
				respondError(w, r, http.StatusInternalServerError, err.Error())
				return
			}
			summary.Deleted++
		}
		for id, doc := range effectiveByID {
			baseDoc, existed := baseByID[id]
			if err := h.store.SaveDocument(target.SpecID, target.CollectionID, doc); err != nil {
				respondError(w, r, http.StatusInternalServerError, err.Error())
				return
			}
			if !existed {
				summary.Inserted++
			} else if !reflect.DeepEqual(baseDoc, doc) {
				summary.Updated++
			}
		}
	}
	h.sessions.Delete(sessionID)
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

func documentsByID(docs []domain.Document) map[string]domain.Document {
	result := make(map[string]domain.Document, len(docs))
	for _, doc := range docs {
		result[doc.ID] = doc
	}
	return result
}
