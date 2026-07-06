package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

func TestCreateScriptValidatesRunFunction(t *testing.T) {
	router, _ := scriptTestRouter(t)
	request := httptest.NewRequest(http.MethodPost, "/scripts", strings.NewReader(`{
		"name": "Missing run",
		"source": "value = 1"
	}`))
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", response.Code, response.Body.String())
	}
}

func TestCreateAndListScripts(t *testing.T) {
	router, _ := scriptTestRouter(t)
	request := httptest.NewRequest(http.MethodPost, "/scripts", strings.NewReader(`{
		"name": "Calculate",
		"description": "Calculates a value",
		"source": "def run(input):\n    return {\"value\": input.get(\"value\")}\n"
	}`))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/scripts", nil)
	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, listRequest)
	var scripts []domain.Script
	if err := json.NewDecoder(listResponse.Body).Decode(&scripts); err != nil {
		t.Fatalf("decode scripts: %v", err)
	}
	if len(scripts) != 1 || scripts[0].Name != "Calculate" {
		t.Fatalf("unexpected scripts: %#v", scripts)
	}
}

func TestDeleteScriptRejectsFlowReference(t *testing.T) {
	router, dataStore := scriptTestRouter(t)
	script := domain.Script{ID: "used-script", Name: "Used", Source: "def run(input):\n    return input\n"}
	if err := dataStore.SaveScript(script); err != nil {
		t.Fatalf("save script: %v", err)
	}
	if err := dataStore.SaveSpecMeta(domain.SpecMeta{ID: "spec-one", Name: "Spec One"}); err != nil {
		t.Fatalf("save spec: %v", err)
	}
	if err := dataStore.SaveFlow(domain.Flow{
		SpecID:      "spec-one",
		OperationID: "get-items",
		Nodes: []domain.Node{{
			ID:   "script-node",
			Type: domain.NodeTypeStarlark,
			Data: domain.NodeData{Name: "calculate", ScriptID: script.ID},
		}},
	}); err != nil {
		t.Fatalf("save flow: %v", err)
	}

	request := httptest.NewRequest(http.MethodDelete, "/scripts/"+script.ID, bytes.NewReader(nil))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", response.Code, response.Body.String())
	}
}

func scriptTestRouter(t *testing.T) (http.Handler, *store.FileStore) {
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
