package domain

import "time"

type SpecMeta struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	ContextPath      string    `json:"contextPath"`
	UploadedAt       time.Time `json:"uploadedAt"`
	TracingEnabled   bool      `json:"tracingEnabled"`
	PublishedVersion int       `json:"publishedVersion"`
	LatestVersion    int       `json:"latestVersion"`
}

type ReleaseBundle struct {
	SpecID      string       `json:"specId"`
	Version     int          `json:"version"`
	Notes       string       `json:"notes"`
	CreatedAt   time.Time    `json:"createdAt"`
	ContentHash string       `json:"contentHash"`
	SpecRaw     []byte       `json:"specRaw"`
	Flows       []Flow       `json:"flows"`
	Templates   []Template   `json:"templates"`
	Scripts     []Script     `json:"scripts"`
	Collections []Collection `json:"collections"`
}
