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
	"time"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

const templateTestSpec = `openapi: 3.0.3
info:
  title: Widgets
  version: 1.0.0
paths:
  /widgets:
    get:
      responses:
        '200':
          description: Found
          content:
            application/json:
              example:
                id: widget-1
                name: First widget
    post:
      responses:
        '201':
          description: Created
          content:
            application/json:
              example:
                id: widget-2
`

func TestListTemplatesFiltersByOperationAndKeepsReusableTemplates(t *testing.T) {
	router, dataStore := templateTestRouter(t)
	now := time.Now().UTC()
	for _, template := range []domain.Template{
		{ID: "reusable", SpecID: "widgets", Name: "Reusable", UpdatedAt: now},
		{ID: "get-only", SpecID: "widgets", OperationID: "get_widgets", Name: "GET only", UpdatedAt: now},
		{ID: "post-only", SpecID: "widgets", OperationID: "post_widgets", Name: "POST only", UpdatedAt: now},
	} {
		if err := dataStore.SaveTemplate("widgets", template); err != nil {
			t.Fatalf("save template: %v", err)
		}
	}

	request := httptest.NewRequest(http.MethodGet, "/specs/widgets/templates?operationId=get_widgets", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var templates []domain.Template
	if err := json.NewDecoder(response.Body).Decode(&templates); err != nil {
		t.Fatalf("decode templates: %v", err)
	}
	if len(templates) != 2 {
		t.Fatalf("expected reusable and matching templates, got %#v", templates)
	}
	for _, template := range templates {
		if template.ID == "post-only" {
			t.Fatal("operation filter leaked a template from another operation")
		}
	}
}

func TestListResponseExamplesExtractsOpenAPIResponseData(t *testing.T) {
	router, _ := templateTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/specs/widgets/operations/get_widgets/response-examples", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var examples []domain.TemplateExample
	if err := json.NewDecoder(response.Body).Decode(&examples); err != nil {
		t.Fatalf("decode examples: %v", err)
	}
	if len(examples) != 1 {
		t.Fatalf("expected one response example, got %#v", examples)
	}
	if examples[0].StatusCode != 200 || examples[0].Headers["Content-Type"] != "application/json" {
		t.Fatalf("unexpected example metadata: %#v", examples[0])
	}
	if !strings.Contains(examples[0].Body, `"widget-1"`) {
		t.Fatalf("expected formatted example body, got %q", examples[0].Body)
	}
}

func TestSaveFlowRejectsTemplateFromDifferentOperation(t *testing.T) {
	router, dataStore := templateTestRouter(t)
	if err := dataStore.SaveTemplate("widgets", domain.Template{
		ID:          "post-response",
		SpecID:      "widgets",
		OperationID: "post_widgets",
		Name:        "POST response",
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	flow := domain.Flow{
		Version: domain.CurrentFlowVersion,
		Nodes: []domain.Node{
			{ID: "start", Type: domain.NodeTypeStart, Data: domain.NodeData{Name: "start"}},
			{ID: "response", Type: domain.NodeTypeTemplate, Data: domain.NodeData{Name: "response", TemplateID: "post-response"}},
			{ID: "end", Type: domain.NodeTypeEnd, Data: domain.NodeData{Name: "end"}},
		},
		Edges: []domain.Edge{
			{ID: "start-response", Source: "start", Target: "response"},
			{ID: "response-end", Source: "response", Target: "end"},
		},
	}
	body, err := json.Marshal(flow)
	if err != nil {
		t.Fatalf("marshal flow: %v", err)
	}
	request := httptest.NewRequest(http.MethodPut, "/specs/widgets/flows/get_widgets", bytes.NewReader(body))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"template_operation_mismatch"`) {
		t.Fatalf("expected operation scope validation, got %s", response.Body.String())
	}
}

func templateTestRouter(t *testing.T) (http.Handler, *store.FileStore) {
	t.Helper()
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveSpecMeta(domain.SpecMeta{ID: "widgets", Name: "Widgets"}); err != nil {
		t.Fatalf("save spec metadata: %v", err)
	}
	if err := dataStore.SaveSpecFile("widgets", []byte(templateTestSpec)); err != nil {
		t.Fatalf("save spec: %v", err)
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
