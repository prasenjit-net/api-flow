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
	"github.com/prasenjit-net/api-flow/internal/store"
)

func (h *Handler) ListCollections(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	collections, err := h.store.ListCollections(specID)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if collections == nil {
		collections = []domain.Collection{}
	}
	sort.Slice(collections, func(i, j int) bool {
		return strings.ToLower(collections[i].Name) < strings.ToLower(collections[j].Name)
	})
	respondJSON(w, http.StatusOK, collections)
}

func (h *Handler) GetCollection(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	collection, err := h.store.GetCollection(specID, chi.URLParam(r, "collectionId"))
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "collection not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, collection)
}

func (h *Handler) CreateCollection(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	var collection domain.Collection
	if err := json.NewDecoder(r.Body).Decode(&collection); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(collection.Name) == "" {
		respondError(w, r, http.StatusUnprocessableEntity, "collection name is required")
		return
	}
	now := time.Now().UTC()
	collection.ID = uuid.New().String()
	collection.CreatedAt = now
	collection.UpdatedAt = now
	if err := h.store.SaveCollection(specID, collection); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, collection)
}

func (h *Handler) UpdateCollection(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	collectionID := chi.URLParam(r, "collectionId")
	if !h.specExists(w, r, specID) {
		return
	}
	existing, err := h.store.GetCollection(specID, collectionID)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "collection not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	var collection domain.Collection
	if err := json.NewDecoder(r.Body).Decode(&collection); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(collection.Name) == "" {
		respondError(w, r, http.StatusUnprocessableEntity, "collection name is required")
		return
	}
	collection.ID = existing.ID
	collection.CreatedAt = existing.CreatedAt
	collection.UpdatedAt = time.Now().UTC()
	if err := h.store.SaveCollection(specID, collection); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, collection)
}

func (h *Handler) DeleteCollection(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	collectionID := chi.URLParam(r, "collectionId")
	meta, ok := h.getSpecMeta(w, r, specID)
	if !ok {
		return
	}
	if _, err := h.store.GetCollection(specID, collectionID); err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "collection not found")
		return
	} else if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}

	references, err := h.draftCollectionReferences(specID, collectionID)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if len(references) > 0 {
		respondJSON(w, http.StatusConflict, withRequestID(r, map[string]any{
			"error":      "collection is referenced by saved flows",
			"references": references,
		}))
		return
	}
	if meta.PublishedVersion > 0 {
		bundle, err := h.store.GetRelease(specID, meta.PublishedVersion)
		if err != nil {
			respondError(w, r, http.StatusInternalServerError, err.Error())
			return
		}
		if releaseReferencesCollection(bundle, collectionID) {
			respondError(w, r, http.StatusConflict, "collection is referenced by the published release")
			return
		}
	}
	if err := h.store.DeleteCollection(specID, collectionID); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListDocuments(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	collectionID := chi.URLParam(r, "collectionId")
	if !h.collectionExistsForRequest(w, r, specID, collectionID) {
		return
	}
	docs, err := h.store.ListDocuments(specID, collectionID)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if docs == nil {
		docs = []domain.Document{}
	}
	sort.Slice(docs, func(i, j int) bool {
		return docs[i].UpdatedAt.After(docs[j].UpdatedAt)
	})
	respondJSON(w, http.StatusOK, docs)
}

func (h *Handler) GetDocument(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	collectionID := chi.URLParam(r, "collectionId")
	if !h.specExists(w, r, specID) {
		return
	}
	doc, err := h.store.GetDocument(specID, collectionID, chi.URLParam(r, "documentId"))
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "document not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, doc)
}

func (h *Handler) CreateDocument(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	collectionID := chi.URLParam(r, "collectionId")
	if !h.collectionExistsForRequest(w, r, specID, collectionID) {
		return
	}
	var data map[string]any
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	now := time.Now().UTC()
	doc := domain.Document{ID: uuid.New().String(), CollectionID: collectionID, Data: data, CreatedAt: now, UpdatedAt: now}
	if err := h.store.SaveDocument(specID, collectionID, doc); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, doc)
}

func (h *Handler) UpdateDocument(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	collectionID := chi.URLParam(r, "collectionId")
	documentID := chi.URLParam(r, "documentId")
	if !h.specExists(w, r, specID) {
		return
	}
	existing, err := h.store.GetDocument(specID, collectionID, documentID)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "document not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	var data map[string]any
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	doc := domain.Document{
		ID:           existing.ID,
		CollectionID: collectionID,
		Data:         data,
		CreatedAt:    existing.CreatedAt,
		UpdatedAt:    time.Now().UTC(),
	}
	if err := h.store.SaveDocument(specID, collectionID, doc); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, doc)
}

func (h *Handler) DeleteDocument(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	collectionID := chi.URLParam(r, "collectionId")
	documentID := chi.URLParam(r, "documentId")
	if !h.specExists(w, r, specID) {
		return
	}
	if _, err := h.store.GetDocument(specID, collectionID, documentID); err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "document not found")
		return
	} else if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.DeleteDocument(specID, collectionID, documentID); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) collectionExistsForRequest(w http.ResponseWriter, r *http.Request, specID, collectionID string) bool {
	if !h.specExists(w, r, specID) {
		return false
	}
	if _, err := h.store.GetCollection(specID, collectionID); err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "collection not found")
		return false
	} else if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return false
	}
	return true
}

func (h *Handler) draftCollectionReferences(specID, collectionID string) ([]map[string]string, error) {
	flows, err := h.store.ListFlows(specID)
	if err != nil {
		return nil, err
	}
	var references []map[string]string
	for _, flow := range flows {
		for _, node := range flow.Nodes {
			if node.Type == domain.NodeTypeDataMapper && node.Data.CollectionID == collectionID {
				references = append(references, map[string]string{
					"specId":      specID,
					"operationId": flow.OperationID,
					"nodeId":      node.ID,
				})
			}
		}
	}
	return references, nil
}

func releaseReferencesCollection(bundle domain.ReleaseBundle, collectionID string) bool {
	for _, flow := range bundle.Flows {
		for _, node := range flow.Nodes {
			if node.Type == domain.NodeTypeDataMapper && node.Data.CollectionID == collectionID {
				return true
			}
		}
	}
	return false
}
