package service

import (
	"fmt"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/schemavalidation"
)

type SchemaValidationPreview struct {
	SpecID           string                          `json:"specId"`
	OperationID      string                          `json:"operationId"`
	MediaType        string                          `json:"mediaType,omitempty"`
	HasRequestBody   bool                            `json:"hasRequestBody"`
	HasRequestSchema bool                            `json:"hasRequestSchema"`
	ValidationConfig domain.SchemaValidationSettings `json:"validationConfig"`
	Result           map[string]any                  `json:"result"`
}

func (w *Workspace) GetValidationConfig(specID string) (domain.SchemaValidationSettings, error) {
	meta, err := w.store.GetSpecMeta(specID)
	if err != nil {
		return domain.SchemaValidationSettings{}, err
	}
	return meta.ValidationConfig, nil
}

func (w *Workspace) SetValidationConfig(specID string, config domain.SchemaValidationSettings) (domain.SpecMeta, error) {
	meta, err := w.store.GetSpecMeta(specID)
	if err != nil {
		return domain.SpecMeta{}, err
	}
	meta.ValidationConfig = schemavalidation.NormalizeSettings(config)
	return meta, w.store.SaveSpecMeta(meta)
}

func (w *Workspace) TestSchemaValidation(specID, operationID, contentType string, body any) (SchemaValidationPreview, error) {
	meta, err := w.store.GetSpecMeta(specID)
	if err != nil {
		return SchemaValidationPreview{}, err
	}
	doc, err := w.loadSpecDocument(specID)
	if err != nil {
		return SchemaValidationPreview{}, err
	}
	operation := findOperation(doc, operationID)
	if operation == nil {
		return SchemaValidationPreview{}, fmt.Errorf("operation not found")
	}

	preview := SchemaValidationPreview{
		SpecID:           specID,
		OperationID:      operationID,
		ValidationConfig: meta.ValidationConfig,
		Result:           schemavalidation.EmptyResult(),
	}
	if operation.RequestBody == nil || operation.RequestBody.Value == nil {
		return preview, nil
	}
	preview.HasRequestBody = true
	requestBody := operation.RequestBody.Value
	if body == nil && !requestBody.Required {
		return preview, nil
	}
	mediaType := selectValidationMediaType(requestBody.Content, contentType)
	if mediaType == "" {
		return preview, nil
	}
	preview.MediaType = mediaType
	media := requestBody.Content.Get(mediaType)
	if media == nil || media.Schema == nil || media.Schema.Value == nil {
		return preview, nil
	}
	preview.HasRequestSchema = true
	result, err := schemavalidation.ValidateBody(media.Schema.Value, body, meta.ValidationConfig)
	if err != nil {
		return SchemaValidationPreview{}, err
	}
	preview.Result = result
	return preview, nil
}

func selectValidationMediaType(content openapi3.Content, contentType string) string {
	if len(content) == 0 {
		return ""
	}
	contentType = strings.TrimSpace(strings.Split(contentType, ";")[0])
	if contentType != "" && content.Get(contentType) != nil {
		return contentType
	}
	if content.Get("application/json") != nil {
		return "application/json"
	}
	mediaTypes := sortedMediaTypes(content)
	if len(mediaTypes) == 0 {
		return ""
	}
	return mediaTypes[0]
}
