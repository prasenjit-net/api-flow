package api

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

func (h *Handler) ListTestPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.store.ListTestPlans()
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if plans == nil {
		plans = []domain.TestPlan{}
	}
	sort.Slice(plans, func(i, j int) bool {
		return plans[i].UpdatedAt.After(plans[j].UpdatedAt)
	})
	respondJSON(w, http.StatusOK, plans)
}

func (h *Handler) GetTestPlan(w http.ResponseWriter, r *http.Request) {
	plan, err := h.store.GetTestPlan(chi.URLParam(r, "planId"))
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "test plan not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, plan)
}

func (h *Handler) CreateTestPlan(w http.ResponseWriter, r *http.Request) {
	var plan domain.TestPlan
	if err := json.NewDecoder(r.Body).Decode(&plan); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(plan.Name) == "" {
		respondError(w, r, http.StatusUnprocessableEntity, "test plan name is required")
		return
	}
	now := time.Now().UTC()
	plan.ID = uuid.New().String()
	plan.CreatedAt = now
	plan.UpdatedAt = now
	if err := h.store.SaveTestPlan(plan); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, plan)
}

func (h *Handler) UpdateTestPlan(w http.ResponseWriter, r *http.Request) {
	planID := chi.URLParam(r, "planId")
	existing, err := h.store.GetTestPlan(planID)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "test plan not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	var plan domain.TestPlan
	if err := json.NewDecoder(r.Body).Decode(&plan); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(plan.Name) == "" {
		respondError(w, r, http.StatusUnprocessableEntity, "test plan name is required")
		return
	}
	plan.ID = existing.ID
	plan.CreatedAt = existing.CreatedAt
	plan.UpdatedAt = time.Now().UTC()
	if err := h.store.SaveTestPlan(plan); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, plan)
}

func (h *Handler) DeleteTestPlan(w http.ResponseWriter, r *http.Request) {
	planID := chi.URLParam(r, "planId")
	if _, err := h.store.GetTestPlan(planID); err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "test plan not found")
		return
	} else if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.DeleteTestPlan(planID); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListTestPlanRequests(w http.ResponseWriter, r *http.Request) {
	planID := chi.URLParam(r, "planId")
	if !h.testPlanExists(w, r, planID) {
		return
	}
	requests, err := h.store.ListTestPlanRequests(planID)
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if requests == nil {
		requests = []domain.TestPlanRequest{}
	}
	sort.Slice(requests, func(i, j int) bool {
		if requests[i].Position != requests[j].Position {
			return requests[i].Position < requests[j].Position
		}
		return requests[i].CreatedAt.Before(requests[j].CreatedAt)
	})
	respondJSON(w, http.StatusOK, requests)
}

func (h *Handler) GetTestPlanRequest(w http.ResponseWriter, r *http.Request) {
	planID := chi.URLParam(r, "planId")
	request, err := h.store.GetTestPlanRequest(planID, chi.URLParam(r, "requestId"))
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "test request not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, request)
}

func (h *Handler) CreateTestPlanRequest(w http.ResponseWriter, r *http.Request) {
	planID := chi.URLParam(r, "planId")
	if !h.testPlanExists(w, r, planID) {
		return
	}
	var request domain.TestPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !h.validateTestPlanRequest(w, r, request) {
		return
	}
	now := time.Now().UTC()
	request.ID = uuid.New().String()
	request.PlanID = planID
	request.CreatedAt = now
	request.UpdatedAt = now
	if request.Position == 0 {
		existing, err := h.store.ListTestPlanRequests(planID)
		if err != nil {
			respondError(w, r, http.StatusInternalServerError, err.Error())
			return
		}
		request.Position = len(existing) + 1
	}
	if err := h.store.SaveTestPlanRequest(planID, request); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	_ = h.touchTestPlan(planID)
	respondJSON(w, http.StatusCreated, request)
}

func (h *Handler) UpdateTestPlanRequest(w http.ResponseWriter, r *http.Request) {
	planID := chi.URLParam(r, "planId")
	requestID := chi.URLParam(r, "requestId")
	existing, err := h.store.GetTestPlanRequest(planID, requestID)
	if err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "test request not found")
		return
	}
	if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	var request domain.TestPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		respondError(w, r, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !h.validateTestPlanRequest(w, r, request) {
		return
	}
	request.ID = existing.ID
	request.PlanID = planID
	request.CreatedAt = existing.CreatedAt
	request.UpdatedAt = time.Now().UTC()
	if request.Position == 0 {
		request.Position = existing.Position
	}
	if err := h.store.SaveTestPlanRequest(planID, request); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	_ = h.touchTestPlan(planID)
	respondJSON(w, http.StatusOK, request)
}

func (h *Handler) DeleteTestPlanRequest(w http.ResponseWriter, r *http.Request) {
	planID := chi.URLParam(r, "planId")
	requestID := chi.URLParam(r, "requestId")
	if _, err := h.store.GetTestPlanRequest(planID, requestID); err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "test request not found")
		return
	} else if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.DeleteTestPlanRequest(planID, requestID); err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return
	}
	_ = h.touchTestPlan(planID)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) testPlanExists(w http.ResponseWriter, r *http.Request, planID string) bool {
	if _, err := h.store.GetTestPlan(planID); err == store.ErrNotFound {
		respondError(w, r, http.StatusNotFound, "test plan not found")
		return false
	} else if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return false
	}
	return true
}

func (h *Handler) validateTestPlanRequest(w http.ResponseWriter, r *http.Request, request domain.TestPlanRequest) bool {
	if strings.TrimSpace(request.Name) == "" {
		respondError(w, r, http.StatusUnprocessableEntity, "test request name is required")
		return false
	}
	if strings.TrimSpace(request.SpecID) == "" || strings.TrimSpace(request.OperationID) == "" {
		respondError(w, r, http.StatusUnprocessableEntity, "spec and operation are required")
		return false
	}
	if strings.TrimSpace(request.Method) == "" || strings.TrimSpace(request.Path) == "" {
		respondError(w, r, http.StatusUnprocessableEntity, "method and path are required")
		return false
	}
	if _, err := h.store.GetSpecMeta(request.SpecID); err == store.ErrNotFound {
		respondError(w, r, http.StatusUnprocessableEntity, "selected spec does not exist")
		return false
	} else if err != nil {
		respondError(w, r, http.StatusInternalServerError, err.Error())
		return false
	}
	return true
}

func (h *Handler) touchTestPlan(planID string) error {
	plan, err := h.store.GetTestPlan(planID)
	if err != nil {
		return err
	}
	plan.UpdatedAt = time.Now().UTC()
	return h.store.SaveTestPlan(plan)
}
