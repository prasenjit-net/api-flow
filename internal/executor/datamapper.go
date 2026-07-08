package executor

import (
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

// executeDataMapper performs the requested collection operation. Query filters
// are AND-combined; update/upsert/delete act on the first matching document,
// findMany is the only operation that returns more than one.
func (e *Executor) executeDataMapper(collectionID, operation string, filters []resolvedFilter, body map[string]any) (any, error) {
	if _, err := e.store.GetCollection(collectionID); err != nil {
		if err == store.ErrNotFound {
			return nil, fmt.Errorf("collection %q not found", collectionID)
		}
		return nil, err
	}

	switch operation {
	case "insert":
		now := time.Now().UTC()
		doc := domain.Document{ID: uuid.New().String(), CollectionID: collectionID, Data: body, CreatedAt: now, UpdatedAt: now}
		if err := e.store.SaveDocument(collectionID, doc); err != nil {
			return nil, err
		}
		return documentOutput(doc), nil

	case "findOne":
		doc, found, err := e.findFirstDocument(collectionID, filters)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, nil
		}
		return documentOutput(doc), nil

	case "findMany":
		docs, err := e.store.ListDocuments(collectionID)
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
		doc, found, err := e.findFirstDocument(collectionID, filters)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, fmt.Errorf("no document matched the query")
		}
		mergeInto(doc.Data, body)
		doc.UpdatedAt = time.Now().UTC()
		if err := e.store.SaveDocument(collectionID, doc); err != nil {
			return nil, err
		}
		return documentOutput(doc), nil

	case "upsert":
		doc, found, err := e.findFirstDocument(collectionID, filters)
		if err != nil {
			return nil, err
		}
		now := time.Now().UTC()
		created := !found
		if !found {
			doc = domain.Document{ID: uuid.New().String(), CollectionID: collectionID, Data: map[string]any{}, CreatedAt: now}
		}
		mergeInto(doc.Data, body)
		doc.UpdatedAt = now
		if err := e.store.SaveDocument(collectionID, doc); err != nil {
			return nil, err
		}
		output := documentOutput(doc)
		output["created"] = created
		return output, nil

	case "delete":
		doc, found, err := e.findFirstDocument(collectionID, filters)
		if err != nil {
			return nil, err
		}
		if !found {
			return map[string]any{"deleted": false}, nil
		}
		if err := e.store.DeleteDocument(collectionID, doc.ID); err != nil {
			return nil, err
		}
		return map[string]any{"deleted": true, "id": doc.ID}, nil

	default:
		return nil, fmt.Errorf("unsupported data mapper operation %q", operation)
	}
}

func (e *Executor) findFirstDocument(collectionID string, filters []resolvedFilter) (domain.Document, bool, error) {
	docs, err := e.store.ListDocuments(collectionID)
	if err != nil {
		return domain.Document{}, false, err
	}
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
