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
	collections, err := h.store.ListCollections()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
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
	collection, err := h.store.GetCollection(chi.URLParam(r, "collectionId"))
	if err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "collection not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, collection)
}

func (h *Handler) CreateCollection(w http.ResponseWriter, r *http.Request) {
	var collection domain.Collection
	if err := json.NewDecoder(r.Body).Decode(&collection); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(collection.Name) == "" {
		respondError(w, http.StatusUnprocessableEntity, "collection name is required")
		return
	}
	now := time.Now().UTC()
	collection.ID = uuid.New().String()
	collection.CreatedAt = now
	collection.UpdatedAt = now
	if err := h.store.SaveCollection(collection); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, collection)
}

func (h *Handler) UpdateCollection(w http.ResponseWriter, r *http.Request) {
	collectionID := chi.URLParam(r, "collectionId")
	existing, err := h.store.GetCollection(collectionID)
	if err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "collection not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var collection domain.Collection
	if err := json.NewDecoder(r.Body).Decode(&collection); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(collection.Name) == "" {
		respondError(w, http.StatusUnprocessableEntity, "collection name is required")
		return
	}
	collection.ID = existing.ID
	collection.CreatedAt = existing.CreatedAt
	collection.UpdatedAt = time.Now().UTC()
	if err := h.store.SaveCollection(collection); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, collection)
}

func (h *Handler) DeleteCollection(w http.ResponseWriter, r *http.Request) {
	collectionID := chi.URLParam(r, "collectionId")
	if _, err := h.store.GetCollection(collectionID); err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "collection not found")
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
				if node.Type == domain.NodeTypeDataMapper && node.Data.CollectionID == collectionID {
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
			"error":      "collection is referenced by saved flows",
			"references": references,
		})
		return
	}
	if err := h.store.DeleteCollection(collectionID); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListDocuments(w http.ResponseWriter, r *http.Request) {
	collectionID := chi.URLParam(r, "collectionId")
	if _, err := h.store.GetCollection(collectionID); err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "collection not found")
		return
	} else if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	docs, err := h.store.ListDocuments(collectionID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
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
	collectionID := chi.URLParam(r, "collectionId")
	doc, err := h.store.GetDocument(collectionID, chi.URLParam(r, "documentId"))
	if err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "document not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, doc)
}

func (h *Handler) CreateDocument(w http.ResponseWriter, r *http.Request) {
	collectionID := chi.URLParam(r, "collectionId")
	if _, err := h.store.GetCollection(collectionID); err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "collection not found")
		return
	} else if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var data map[string]any
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	now := time.Now().UTC()
	doc := domain.Document{ID: uuid.New().String(), CollectionID: collectionID, Data: data, CreatedAt: now, UpdatedAt: now}
	if err := h.store.SaveDocument(collectionID, doc); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, doc)
}

func (h *Handler) UpdateDocument(w http.ResponseWriter, r *http.Request) {
	collectionID := chi.URLParam(r, "collectionId")
	documentID := chi.URLParam(r, "documentId")
	existing, err := h.store.GetDocument(collectionID, documentID)
	if err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "document not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var data map[string]any
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	doc := domain.Document{
		ID:           existing.ID,
		CollectionID: collectionID,
		Data:         data,
		CreatedAt:    existing.CreatedAt,
		UpdatedAt:    time.Now().UTC(),
	}
	if err := h.store.SaveDocument(collectionID, doc); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, doc)
}

func (h *Handler) DeleteDocument(w http.ResponseWriter, r *http.Request) {
	collectionID := chi.URLParam(r, "collectionId")
	documentID := chi.URLParam(r, "documentId")
	if _, err := h.store.GetDocument(collectionID, documentID); err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "document not found")
		return
	} else if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.DeleteDocument(collectionID, documentID); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
