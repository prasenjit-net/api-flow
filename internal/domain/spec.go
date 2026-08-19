package domain

import "time"

type SpecMeta struct {
	ID                string                   `json:"id"`
	Name              string                   `json:"name"`
	ContextPath       string                   `json:"contextPath"`
	UploadedAt        time.Time                `json:"uploadedAt"`
	TracingEnabled    bool                     `json:"tracingEnabled"`
	ValidationConfig  SchemaValidationSettings `json:"validationConfig"`
	PublishedVersion  int                      `json:"publishedVersion"`
	PublishedSnapshot bool                     `json:"publishedSnapshot"`
	LatestVersion     int                      `json:"latestVersion"`
}

func (m SpecMeta) IsPublished() bool {
	return m.PublishedSnapshot || m.PublishedVersion > 0
}

type ReleaseBundle struct {
	SpecID           string                   `json:"specId"`
	Version          int                      `json:"version"`
	Snapshot         bool                     `json:"snapshot,omitempty"`
	Notes            string                   `json:"notes"`
	CreatedAt        time.Time                `json:"createdAt"`
	ContentHash      string                   `json:"contentHash"`
	SpecRaw          []byte                   `json:"specRaw"`
	ValidationConfig SchemaValidationSettings `json:"validationConfig"`
	Flows            []Flow                   `json:"flows"`
	Templates        []Template               `json:"templates"`
	Scripts          []Script                 `json:"scripts"`
	Collections      []Collection             `json:"collections"`
}

type SchemaValidationSettings struct {
	PathMessages  map[string]string `json:"pathMessages,omitempty"`
	FieldMessages map[string]string `json:"fieldMessages,omitempty"`
	Aliases       map[string]string `json:"aliases,omitempty"`
	Codes         map[string]string `json:"codes,omitempty"`
}
