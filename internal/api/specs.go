package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
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
	DraftDirty bool               `json:"draftDirty"`
}

type specListResponse struct {
	domain.SpecMeta
	DraftDirty bool `json:"draftDirty"`
}

var operationMethodOrder = map[string]int{
	http.MethodGet:     0,
	http.MethodPost:    1,
	http.MethodPut:     2,
	http.MethodHead:    3,
	"OPTION":           4,
	http.MethodOptions: 4,
	http.MethodDelete:  5,
}

func (h *Handler) ListSpecs(w http.ResponseWriter, r *http.Request) {
	metas, err := h.store.ListSpecMeta()
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	responses := make([]specListResponse, 0, len(metas))
	for _, meta := range metas {
		dirty, err := h.draftDirty(meta)
		if err != nil {
			respondError(w, r, http.StatusInternalServerError, err.Error())
			return
		}
		responses = append(responses, specListResponse{SpecMeta: meta, DraftDirty: dirty})
	}
	respondJSON(w, http.StatusOK, responses)
}

func (h *Handler) UploadSpec(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid multipart form")
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
		respondError(w, r, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, "read file: "+err.Error())
		return
	}

	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = false
	doc, err := loader.LoadFromData(data)
	if err != nil {
		respondError(w, r, http.StatusBadRequest, fmt.Sprintf("invalid OpenAPI spec: %v", err))
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
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.SaveSpecFile(id, data); err != nil {
		_ = h.store.DeleteSpec(id)
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}

	bundle, err := h.store.CreateRelease(id, "Initial release")
	if err != nil {
		_ = h.store.DeleteSpec(id)
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.SetPublishedVersion(id, bundle.Version); err != nil {
		_ = h.store.DeleteSpec(id)
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	meta, _ = h.store.GetSpecMeta(id)
	if h.registry != nil {
		h.registry.Register(meta, bundle)
	}

	respondJSON(w, http.StatusCreated, meta)
}

func (h *Handler) GetSpec(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	meta, err := h.store.GetSpecMeta(id)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "spec not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}

	ops, err := h.parseOperations(id)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}

	dirty, err := h.draftDirty(meta)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, specDetailResponse{SpecMeta: meta, Operations: ops, DraftDirty: dirty})
}

func (h *Handler) DeleteSpec(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := h.store.GetSpecMeta(id); err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "spec not found")
		return
	}

	if h.registry != nil {
		h.registry.Unregister(id)
	}

	if err := h.store.DeleteSpec(id); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) UpdateSpecTracing(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	meta, err := h.store.GetSpecMeta(id)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "spec not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}

	var payload struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid tracing payload")
		return
	}
	meta.TracingEnabled = payload.Enabled
	if err := h.store.SaveSpecMeta(meta); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, meta)
}

func (h *Handler) parseOperations(specID string) ([]domain.Operation, error) {
	doc, err := h.loadSpecDocument(specID)
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
				InputHints:  operationHints(pathItem, op),
			})
		}
	}
	sort.Slice(ops, func(i, j int) bool {
		leftOrder, leftKnown := operationMethodOrder[ops[i].Method]
		rightOrder, rightKnown := operationMethodOrder[ops[j].Method]
		if leftKnown != rightKnown {
			return leftKnown
		}
		if leftKnown && leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if ops[i].Method != ops[j].Method {
			return ops[i].Method < ops[j].Method
		}
		if ops[i].Path != ops[j].Path {
			return ops[i].Path < ops[j].Path
		}
		return ops[i].ID < ops[j].ID
	})
	return ops, nil
}

func operationHints(pathItem *openapi3.PathItem, op *openapi3.Operation) domain.OperationHints {
	hints := domain.OperationHints{}
	if pathItem != nil {
		addParameterHints(&hints, pathItem.Parameters)
	}
	if op != nil {
		addParameterHints(&hints, op.Parameters)
		addBodyHints(&hints, op.RequestBody)
	}
	hints.Path = uniqueSorted(hints.Path)
	hints.Query = uniqueSorted(hints.Query)
	hints.Headers = uniqueSorted(hints.Headers)
	hints.Body = uniqueSorted(hints.Body)
	return hints
}

func addParameterHints(hints *domain.OperationHints, parameters openapi3.Parameters) {
	for _, ref := range parameters {
		if ref == nil || ref.Value == nil || ref.Value.Name == "" {
			continue
		}
		switch ref.Value.In {
		case openapi3.ParameterInPath:
			hints.Path = append(hints.Path, ref.Value.Name)
		case openapi3.ParameterInQuery:
			hints.Query = append(hints.Query, ref.Value.Name)
		case openapi3.ParameterInHeader:
			hints.Headers = append(hints.Headers, strings.ToLower(ref.Value.Name))
		}
	}
}

func addBodyHints(hints *domain.OperationHints, requestBody *openapi3.RequestBodyRef) {
	if requestBody == nil || requestBody.Value == nil {
		return
	}
	for _, mediaType := range requestBody.Value.Content {
		if mediaType == nil || mediaType.Schema == nil {
			continue
		}
		collectSchemaPaths(mediaType.Schema, "", 0, &hints.Body)
	}
}

func collectSchemaPaths(ref *openapi3.SchemaRef, prefix string, depth int, out *[]string) {
	if ref == nil || ref.Value == nil || depth > 3 {
		return
	}
	schema := ref.Value
	for _, child := range schema.AllOf {
		collectSchemaPaths(child, prefix, depth, out)
	}
	for _, child := range schema.AnyOf {
		collectSchemaPaths(child, prefix, depth, out)
	}
	for _, child := range schema.OneOf {
		collectSchemaPaths(child, prefix, depth, out)
	}
	for name, child := range schema.Properties {
		path := name
		if prefix != "" {
			path = prefix + "." + name
		}
		*out = append(*out, path)
		if child != nil && child.Value != nil && len(child.Value.Properties) > 0 {
			collectSchemaPaths(child, path, depth+1, out)
		}
	}
	if schema.Items != nil && schema.Items.Value != nil && len(schema.Items.Value.Properties) > 0 {
		collectSchemaPaths(schema.Items, prefix, depth+1, out)
	}
}

func uniqueSorted(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func (h *Handler) loadSpecDocument(specID string) (*openapi3.T, error) {
	data, err := h.store.GetSpecFile(specID)
	if err != nil {
		return nil, err
	}

	doc, err := openapi3.NewLoader().LoadFromData(data)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (h *Handler) draftDirty(meta domain.SpecMeta) (bool, error) {
	if meta.LatestVersion == 0 {
		return true, nil
	}
	hash, err := h.store.DraftContentHash(meta.ID)
	if err != nil {
		return false, err
	}
	bundle, err := h.store.GetRelease(meta.ID, meta.LatestVersion)
	if err == store.ErrNotFound {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	return hash != bundle.ContentHash, nil
}
