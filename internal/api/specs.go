package api

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

type specDetailResponse struct {
	domain.SpecMeta
	Operations []domain.Operation `json:"operations"`
}

func (h *Handler) ListSpecs(w http.ResponseWriter, r *http.Request) {
	metas, err := h.store.ListSpecMeta()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if metas == nil {
		metas = []domain.SpecMeta{}
	}
	respondJSON(w, http.StatusOK, metas)
}

func (h *Handler) UploadSpec(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	name := strings.TrimSpace(r.FormValue("name"))
	contextPath := strings.TrimSpace(r.FormValue("contextPath"))
	if contextPath == "" {
		contextPath = "/"
	}
	if !strings.HasPrefix(contextPath, "/") {
		contextPath = "/" + contextPath
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "read file: "+err.Error())
		return
	}

	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = false
	doc, err := loader.LoadFromData(data)
	if err != nil {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("invalid OpenAPI spec: %v", err))
		return
	}

	if name == "" && doc.Info != nil {
		name = doc.Info.Title
	}
	if name == "" {
		name = "Unnamed Spec"
	}

	id := uuid.New().String()
	meta := domain.SpecMeta{
		ID:          id,
		Name:        name,
		ContextPath: contextPath,
		UploadedAt:  time.Now().UTC(),
	}

	if err := h.store.SaveSpecMeta(meta); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.SaveSpecFile(id, data); err != nil {
		_ = h.store.DeleteSpec(id)
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.registry.Register(meta, doc)

	respondJSON(w, http.StatusCreated, meta)
}

func (h *Handler) GetSpec(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	meta, err := h.store.GetSpecMeta(id)
	if err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "spec not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	ops, err := h.parseOperations(id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, specDetailResponse{SpecMeta: meta, Operations: ops})
}

func (h *Handler) DeleteSpec(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := h.store.GetSpecMeta(id); err == store.ErrNotFound {
		respondError(w, http.StatusNotFound, "spec not found")
		return
	}

	h.registry.Unregister(id)

	if err := h.store.DeleteSpec(id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) parseOperations(specID string) ([]domain.Operation, error) {
	data, err := h.store.GetSpecFile(specID)
	if err != nil {
		return nil, err
	}

	doc, err := openapi3.NewLoader().LoadFromData(data)
	if err != nil {
		return nil, err
	}

	flows, _ := h.store.ListFlows(specID)
	flowSet := make(map[string]bool, len(flows))
	for _, f := range flows {
		flowSet[f.OperationID] = true
	}

	var ops []domain.Operation
	for path, pathItem := range doc.Paths.Map() {
		for method, op := range pathItem.Operations() {
			summary, description := "", ""
			if op != nil {
				summary = op.Summary
				description = op.Description
			}
			opID := domain.MakeOpID(method, path)
			ops = append(ops, domain.Operation{
				ID:          opID,
				Method:      strings.ToUpper(method),
				Path:        path,
				Summary:     summary,
				Description: description,
				HasFlow:     flowSet[opID],
			})
		}
	}
	return ops, nil
}
