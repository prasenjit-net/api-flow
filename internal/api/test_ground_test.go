package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

func TestTestGroundPlansPersistMixedSpecRequests(t *testing.T) {
	router, dataStore := testGroundRouter(t)
	for _, meta := range []domain.SpecMeta{
		{ID: "billing", Name: "Billing", ContextPath: "/billing"},
		{ID: "identity", Name: "Identity", ContextPath: "/identity"},
	} {
		if err := dataStore.SaveSpecMeta(meta); err != nil {
			t.Fatalf("save spec metadata: %v", err)
		}
	}

	planBody := bytes.NewReader([]byte(`{"name":"Smoke","description":"Mixed spec smoke test"}`))
	planResponse := httptest.NewRecorder()
	router.ServeHTTP(planResponse, httptest.NewRequest(http.MethodPost, "/test-ground/plans", planBody))
	if planResponse.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", planResponse.Code, planResponse.Body.String())
	}
	var plan domain.TestPlan
	if err := json.NewDecoder(planResponse.Body).Decode(&plan); err != nil {
		t.Fatalf("decode plan: %v", err)
	}

	requests := []string{
		`{"name":"Create invoice","specId":"billing","operationId":"post_invoices","method":"POST","path":"/invoices","headers":{"content-type":"application/json"},"body":"{\"amount\":10}"}`,
		`{"name":"Get profile","specId":"identity","operationId":"get_users_userId","method":"GET","path":"/users/{userId}","pathParams":{"userId":"u1"}}`,
	}
	for _, payload := range requests {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/test-ground/plans/"+plan.ID+"/requests", bytes.NewReader([]byte(payload))))
		if response.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
		}
	}

	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, httptest.NewRequest(http.MethodGet, "/test-ground/plans/"+plan.ID+"/requests", nil))
	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", listResponse.Code, listResponse.Body.String())
	}
	var saved []domain.TestPlanRequest
	if err := json.NewDecoder(listResponse.Body).Decode(&saved); err != nil {
		t.Fatalf("decode requests: %v", err)
	}
	if len(saved) != 2 {
		t.Fatalf("expected two saved requests, got %#v", saved)
	}
	if saved[0].SpecID != "billing" || saved[1].SpecID != "identity" {
		t.Fatalf("requests were not returned in saved order: %#v", saved)
	}
}

func TestTestGroundRejectsUnknownSpecRequest(t *testing.T) {
	router, _ := testGroundRouter(t)
	planResponse := httptest.NewRecorder()
	router.ServeHTTP(planResponse, httptest.NewRequest(http.MethodPost, "/test-ground/plans", bytes.NewReader([]byte(`{"name":"Smoke"}`))))
	if planResponse.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", planResponse.Code, planResponse.Body.String())
	}
	var plan domain.TestPlan
	if err := json.NewDecoder(planResponse.Body).Decode(&plan); err != nil {
		t.Fatalf("decode plan: %v", err)
	}

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/test-ground/plans/"+plan.ID+"/requests", bytes.NewReader([]byte(`{
		"name":"Missing spec",
		"specId":"missing",
		"operationId":"get_missing",
		"method":"GET",
		"path":"/missing"
	}`))))
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", response.Code, response.Body.String())
	}
}

func testGroundRouter(t *testing.T) (http.Handler, *store.FileStore) {
	t.Helper()
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	router := NewRouter(
		config.Default(),
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		version.Current(),
		dataStore,
		nil,
	)
	return router, dataStore
}
