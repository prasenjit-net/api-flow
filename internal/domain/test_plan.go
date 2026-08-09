package domain

import "time"

type TestPlan struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type TestPlanRequest struct {
	ID          string            `json:"id"`
	PlanID      string            `json:"planId"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	SpecID      string            `json:"specId"`
	OperationID string            `json:"operationId"`
	Method      string            `json:"method"`
	Path        string            `json:"path"`
	PathParams  map[string]string `json:"pathParams"`
	QueryParams map[string]string `json:"queryParams"`
	Headers     map[string]string `json:"headers"`
	Body        string            `json:"body"`
	Position    int               `json:"position"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
}
