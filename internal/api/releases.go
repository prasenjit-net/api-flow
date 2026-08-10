package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

type releaseResponse struct {
	domain.ReleaseBundle
	Published bool `json:"published"`
}

func (h *Handler) ListReleases(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	meta, ok := h.getSpecMeta(w, r, specID)
	if !ok {
		return
	}
	releases, err := h.store.ListReleases(specID)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	result := make([]releaseResponse, 0, len(releases))
	for _, release := range releases {
		result = append(result, releaseResponse{
			ReleaseBundle: release,
			Published:     (release.Snapshot && meta.PublishedSnapshot) || (!release.Snapshot && release.Version == meta.PublishedVersion),
		})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Snapshot != result[j].Snapshot {
			return result[i].Snapshot
		}
		return result[i].Version > result[j].Version
	})
	respondJSON(w, http.StatusOK, result)
}

func (h *Handler) CreateRelease(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	var payload struct {
		Notes string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && err != io.EOF {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	if validationErrors, err := h.validateDraftRelease(specID); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	} else if len(validationErrors) > 0 {
		respondJSON(w, http.StatusUnprocessableEntity, withRequestID(r, map[string]any{
			"error":   "draft validation failed",
			"details": validationErrors,
		}))
		return
	}
	bundle, err := h.store.CreateRelease(specID, payload.Notes)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, bundle)
}

func (h *Handler) PublishRelease(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	meta, ok := h.getSpecMeta(w, r, specID)
	if !ok {
		return
	}
	version, ok := parseVersionParam(w, r)
	if !ok {
		return
	}
	bundle, err := h.store.GetRelease(specID, version)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "release not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.SetPublishedVersion(specID, version); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	meta.PublishedVersion = version
	meta.PublishedSnapshot = false
	if h.registry != nil {
		h.registry.Register(meta, bundle)
	}
	respondJSON(w, http.StatusOK, meta)
}

func (h *Handler) PublishSnapshot(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	if validationErrors, err := h.validateDraftRelease(specID); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	} else if len(validationErrors) > 0 {
		respondJSON(w, http.StatusUnprocessableEntity, withRequestID(r, map[string]any{
			"error":   "draft validation failed",
			"details": validationErrors,
		}))
		return
	}
	bundle, err := h.store.CreateSnapshot(specID)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.SetPublishedSnapshot(specID); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	meta, err := h.store.GetSpecMeta(specID)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if h.registry != nil {
		h.registry.Register(meta, bundle)
	}
	respondJSON(w, http.StatusCreated, releaseResponse{ReleaseBundle: bundle, Published: true})
}

func (h *Handler) PromoteSnapshot(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	var payload struct {
		Notes string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && err != io.EOF {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	bundle, err := h.store.PromoteSnapshot(specID, payload.Notes)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "snapshot not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	meta, err := h.store.GetSpecMeta(specID)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if h.registry != nil {
		h.registry.Register(meta, bundle)
	}
	respondJSON(w, http.StatusCreated, releaseResponse{ReleaseBundle: bundle, Published: true})
}

func (h *Handler) UnpublishSpec(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	meta, ok := h.getSpecMeta(w, r, specID)
	if !ok {
		return
	}
	if err := h.store.SetPublishedVersion(specID, 0); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	meta.PublishedVersion = 0
	meta.PublishedSnapshot = false
	if h.registry != nil {
		h.registry.Unregister(specID)
	}
	respondJSON(w, http.StatusOK, meta)
}

func (h *Handler) DeleteRelease(w http.ResponseWriter, r *http.Request) {
	specID := chi.URLParam(r, "id")
	if !h.specExists(w, r, specID) {
		return
	}
	version, ok := parseVersionParam(w, r)
	if !ok {
		return
	}
	err := h.store.DeleteRelease(specID, version)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "release not found")
		return
	}
	if err == store.ErrConflict {
		respondError(w, r, http.StatusConflict, "cannot delete the published release")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) validateDraftRelease(specID string) ([]domain.FlowValidationError, error) {
	flows, err := h.store.ListFlows(specID)
	if err != nil {
		return nil, err
	}
	var result []domain.FlowValidationError
	for _, flow := range flows {
		flow = domain.NormalizeFlow(flow)
		result = append(result, domain.ValidateFlow(flow)...)
		for _, node := range flow.Nodes {
			switch node.Type {
			case domain.NodeTypeStarlark:
				if node.Data.ScriptID == "" {
					continue
				}
				if _, err := h.store.GetScript(specID, node.Data.ScriptID); err == store.ErrNotFound {
					result = append(result, domain.FlowValidationError{
						Code:    "script_not_found",
						Message: "selected Starlark script does not exist in this specification",
						NodeID:  node.ID,
						Field:   "data.scriptId",
					})
				} else if err != nil {
					return nil, err
				}
			case domain.NodeTypeTemplate:
				if node.Data.TemplateID == "" {
					continue
				}
				template, err := h.store.GetTemplate(specID, node.Data.TemplateID)
				if err == store.ErrNotFound {
					result = append(result, domain.FlowValidationError{
						Code:    "template_not_found",
						Message: "selected template does not exist in this specification",
						NodeID:  node.ID,
						Field:   "data.templateId",
					})
				} else if err != nil {
					return nil, err
				} else if template.OperationID != "" && template.OperationID != flow.OperationID {
					result = append(result, domain.FlowValidationError{
						Code:    "template_operation_mismatch",
						Message: "selected template is scoped to a different operation",
						NodeID:  node.ID,
						Field:   "data.templateId",
					})
				}
			case domain.NodeTypeDataMapper:
				if node.Data.CollectionID == "" {
					continue
				}
				if _, err := h.store.GetCollection(specID, node.Data.CollectionID); err == store.ErrNotFound {
					result = append(result, domain.FlowValidationError{
						Code:    "collection_not_found",
						Message: "selected collection does not exist in this specification",
						NodeID:  node.ID,
						Field:   "data.collectionId",
					})
				} else if err != nil {
					return nil, err
				}
			}
		}
	}
	return result, nil
}

func (h *Handler) getSpecMeta(w http.ResponseWriter, r *http.Request, specID string) (domain.SpecMeta, bool) {
	meta, err := h.store.GetSpecMeta(specID)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "spec not found")
		return domain.SpecMeta{}, false
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return domain.SpecMeta{}, false
	}
	return meta, true
}

func parseVersionParam(w http.ResponseWriter, r *http.Request) (int, bool) {
	var version int
	if _, err := fmt.Sscanf(chi.URLParam(r, "version"), "%d", &version); err != nil || version <= 0 {
		respondError(w, r, http.StatusBadRequest, "invalid release version")
		return 0, false
	}
	return version, true
}
