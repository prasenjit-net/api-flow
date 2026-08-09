package executor

import (
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/sessions"
	"github.com/prasenjit-net/api-flow/internal/store"
)

// executeDataMapper performs the requested collection operation. Query filters
// are AND-combined; update/upsert/delete act on the first matching document,
// findMany is the only operation that returns more than one.
func (e *Executor) executeDataMapper(w http.ResponseWriter, r *http.Request, specID string, bundle *domain.ReleaseBundle, collectionID, operation string, filters []resolvedFilter, body map[string]any) (any, error) {
	if !e.collectionExists(specID, bundle, collectionID) {
		return nil, fmt.Errorf("collection %q not found", collectionID)
	}
	if bundle == nil {
		if _, err := e.store.GetCollection(specID, collectionID); err != nil {
			if err == store.ErrNotFound {
				return nil, fmt.Errorf("collection %q not found", collectionID)
			}
			return nil, err
		}
	}

	switch operation {
	case "insert":
		now := time.Now().UTC()
		doc := domain.Document{ID: uuid.New().String(), CollectionID: collectionID, Data: cloneMap(body), CreatedAt: now, UpdatedAt: now}
		if err := e.appendSessionEvent(w, r, sessions.Event{
			Type:         sessions.EventInsert,
			SpecID:       specID,
			CollectionID: collectionID,
			DocumentID:   doc.ID,
			Body:         body,
			After:        &doc,
		}); err != nil {
			return nil, err
		}
		return documentOutput(doc), nil

	case "findOne":
		docs, err := e.listEffectiveDocuments(r, specID, collectionID)
		if err != nil {
			return nil, err
		}
		doc, found, err := findFirstInDocuments(docs, filters)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, nil
		}
		return documentOutput(doc), nil

	case "findMany":
		docs, err := e.listEffectiveDocuments(r, specID, collectionID)
		if err != nil {
			return nil, err
		}
		results := make([]map[string]any, 0, len(docs))
		for _, doc := range docs {
			matched, err := matchesFilters(doc.Data, filters)
			if err != nil {
				return nil, err
			}
			if matched {
				results = append(results, documentOutput(doc))
			}
		}
		return results, nil

	case "update":
		docs, err := e.listEffectiveDocuments(r, specID, collectionID)
		if err != nil {
			return nil, err
		}
		doc, found, err := findFirstInDocuments(docs, filters)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, fmt.Errorf("no document matched the query")
		}
		before := cloneDocument(doc)
		mergeInto(doc.Data, body)
		doc.UpdatedAt = time.Now().UTC()
		if err := e.appendSessionEvent(w, r, sessions.Event{
			Type:         sessions.EventUpdate,
			SpecID:       specID,
			CollectionID: collectionID,
			DocumentID:   doc.ID,
			Filters:      sessionFilters(filters),
			Body:         body,
			Before:       &before,
			After:        &doc,
		}); err != nil {
			return nil, err
		}
		return documentOutput(doc), nil

	case "upsert":
		docs, err := e.listEffectiveDocuments(r, specID, collectionID)
		if err != nil {
			return nil, err
		}
		doc, found, err := findFirstInDocuments(docs, filters)
		if err != nil {
			return nil, err
		}
		now := time.Now().UTC()
		created := !found
		var before *domain.Document
		if !found {
			doc = domain.Document{ID: uuid.New().String(), CollectionID: collectionID, Data: map[string]any{}, CreatedAt: now}
		} else {
			copied := cloneDocument(doc)
			before = &copied
		}
		mergeInto(doc.Data, body)
		doc.UpdatedAt = now
		if err := e.appendSessionEvent(w, r, sessions.Event{
			Type:         sessions.EventUpsert,
			SpecID:       specID,
			CollectionID: collectionID,
			DocumentID:   doc.ID,
			Filters:      sessionFilters(filters),
			Body:         body,
			Before:       before,
			After:        &doc,
		}); err != nil {
			return nil, err
		}
		output := documentOutput(doc)
		output["created"] = created
		return output, nil

	case "delete":
		docs, err := e.listEffectiveDocuments(r, specID, collectionID)
		if err != nil {
			return nil, err
		}
		doc, found, err := findFirstInDocuments(docs, filters)
		if err != nil {
			return nil, err
		}
		if !found {
			return map[string]any{"deleted": false}, nil
		}
		before := cloneDocument(doc)
		if err := e.appendSessionEvent(w, r, sessions.Event{
			Type:         sessions.EventDelete,
			SpecID:       specID,
			CollectionID: collectionID,
			DocumentID:   doc.ID,
			Filters:      sessionFilters(filters),
			Before:       &before,
		}); err != nil {
			return nil, err
		}
		return map[string]any{"deleted": true, "id": doc.ID}, nil

	default:
		return nil, fmt.Errorf("unsupported data mapper operation %q", operation)
	}
}

func (e *Executor) collectionExists(specID string, bundle *domain.ReleaseBundle, collectionID string) bool {
	if bundle != nil {
		for _, collection := range bundle.Collections {
			if collection.ID == collectionID {
				return true
			}
		}
		return false
	}
	if _, err := e.store.GetCollection(specID, collectionID); err != nil {
		return false
	}
	return true
}

func (e *Executor) listEffectiveDocuments(r *http.Request, specID, collectionID string) ([]domain.Document, error) {
	docs, err := e.store.ListDocuments(specID, collectionID)
	if err != nil {
		return nil, err
	}
	if e.sessions == nil {
		return docs, nil
	}
	sessionID := r.Header.Get(sessions.HeaderName)
	if sessionID == "" {
		return docs, nil
	}
	return e.sessions.EffectiveDocuments(sessionID, specID, collectionID, docs), nil
}

func findFirstInDocuments(docs []domain.Document, filters []resolvedFilter) (domain.Document, bool, error) {
	for _, doc := range docs {
		matched, err := matchesFilters(doc.Data, filters)
		if err != nil {
			return domain.Document{}, false, err
		}
		if matched {
			return doc, true, nil
		}
	}
	return domain.Document{}, false, nil
}

func (e *Executor) appendSessionEvent(w http.ResponseWriter, r *http.Request, event sessions.Event) error {
	if e.sessions == nil {
		return fmt.Errorf("session store is unavailable")
	}
	sessionID := e.sessions.EnsureForRequest(w, r)
	if _, ok := e.sessions.Append(sessionID, event); !ok {
		return fmt.Errorf("session %q is unavailable", sessionID)
	}
	return nil
}

func mergeInto(target, updates map[string]any) {
	for key, value := range updates {
		target[key] = value
	}
}

func documentOutput(doc domain.Document) map[string]any {
	return map[string]any{
		"id":           doc.ID,
		"collectionId": doc.CollectionID,
		"data":         doc.Data,
		"createdAt":    doc.CreatedAt,
		"updatedAt":    doc.UpdatedAt,
	}
}

func sessionFilters(filters []resolvedFilter) []sessions.QueryFilter {
	result := make([]sessions.QueryFilter, 0, len(filters))
	for _, filter := range filters {
		result = append(result, sessions.QueryFilter{
			Key:      filter.key,
			Operator: string(filter.operator),
			Value:    filter.value,
		})
	}
	return result
}

func cloneDocument(doc domain.Document) domain.Document {
	doc.Data = cloneMap(doc.Data)
	return doc
}

func cloneMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}
