package domain

import "time"

type SpecMeta struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	ContextPath string    `json:"contextPath"`
	UploadedAt  time.Time `json:"uploadedAt"`
}
