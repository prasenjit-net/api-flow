package api

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

func TestSaveFlowRejectsInvalidWorkflowWithoutPersisting(t *testing.T) {
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
	body := []byte(`{
		"version": 2,
		"nodes": [
			{"id":"start","type":"start","position":{"x":0,"y":0},"data":{"name":"start"}},
			{"id":"end","type":"end","position":{"x":100,"y":0},"data":{"name":"end"}}
		],
		"edges": [{"id":"start-end","source":"start","target":"end"}]
	}`)
	request := httptest.NewRequest(http.MethodPut, "/specs/example/flows/get-users", bytes.NewReader(body))
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"route_template_missing"`) {
		t.Fatalf("expected structured validation details, got %s", response.Body.String())
	}
	if _, err := dataStore.GetFlow("example", "get-users"); err != store.ErrNotFound {
		t.Fatalf("invalid workflow was persisted, get error: %v", err)
	}
}
