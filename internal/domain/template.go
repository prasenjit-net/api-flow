package domain

import "time"

type Template struct {
	ID              string            `json:"id"`
	SpecID          string            `json:"specId"`
	OperationID     string            `json:"operationId,omitempty"`
	SourceExampleID string            `json:"sourceExampleId,omitempty"`
	Name            string            `json:"name"`
	StatusCode      int               `json:"statusCode"`
	Body            string            `json:"body"`
	Headers         map[string]string `json:"headers"`
	CreatedAt       time.Time         `json:"createdAt"`
	UpdatedAt       time.Time         `json:"updatedAt"`
}

type TemplateExample struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	OperationID string            `json:"operationId"`
	StatusCode  int               `json:"statusCode"`
	MediaType   string            `json:"mediaType"`
	Body        string            `json:"body"`
	Headers     map[string]string `json:"headers"`
}
