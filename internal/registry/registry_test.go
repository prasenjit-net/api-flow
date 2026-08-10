package registry

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/executor"
	"github.com/prasenjit-net/api-flow/internal/store"
)

const registryTestSpec = `openapi: 3.0.3
info:
  title: Registry Test
  version: 1.0.0
paths:
  /pets:
    get:
      responses:
        '200':
          description: ok
`

func TestRegistryServesPublishedBundleAndSupportsRollback(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	specID := "pets"
	meta := domain.SpecMeta{ID: specID, Name: "Pets", ContextPath: "/mock"}
	if err := dataStore.SaveSpecMeta(meta); err != nil {
		t.Fatalf("save spec meta: %v", err)
	}
	if err := dataStore.SaveSpecFile(specID, []byte(registryTestSpec)); err != nil {
		t.Fatalf("save spec file: %v", err)
	}
	if err := dataStore.SaveTemplate(specID, domain.Template{ID: "response", SpecID: specID, Name: "Response", Body: "v1", StatusCode: http.StatusOK, Headers: map[string]string{}}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	flow := domain.Flow{
		Version:     domain.CurrentFlowVersion,
		SpecID:      specID,
		OperationID: domain.MakeOpID(http.MethodGet, "/pets"),
		Nodes: []domain.Node{
			{ID: "start", Type: domain.NodeTypeStart, Data: domain.NodeData{Name: "start"}},
			{ID: "response", Type: domain.NodeTypeTemplate, Data: domain.NodeData{Name: "response", TemplateID: "response"}},
			{ID: "end", Type: domain.NodeTypeEnd, Data: domain.NodeData{Name: "end"}},
		},
		Edges: []domain.Edge{
			{ID: "start-response", Source: "start", Target: "response"},
			{ID: "response-end", Source: "response", Target: "end"},
		},
	}
	if err := dataStore.SaveFlow(flow); err != nil {
		t.Fatalf("save flow: %v", err)
	}
	v1, err := dataStore.CreateRelease(specID, "v1")
	if err != nil {
		t.Fatalf("create v1: %v", err)
	}
	if err := dataStore.SetPublishedVersion(specID, v1.Version); err != nil {
		t.Fatalf("publish v1: %v", err)
	}

	reg := New(dataStore, executor.New(dataStore))
	reg.LoadFromStore()
	assertMockResponse(t, reg, "v1")

	if err := dataStore.SaveTemplate(specID, domain.Template{ID: "response", SpecID: specID, Name: "Response", Body: "v2", StatusCode: http.StatusOK, Headers: map[string]string{}}); err != nil {
		t.Fatalf("update draft template: %v", err)
	}
	assertMockResponse(t, reg, "v1")

	v2, err := dataStore.CreateRelease(specID, "v2")
	if err != nil {
		t.Fatalf("create v2: %v", err)
	}
	if err := dataStore.SetPublishedVersion(specID, v2.Version); err != nil {
		t.Fatalf("publish v2: %v", err)
	}
	meta, err = dataStore.GetSpecMeta(specID)
	if err != nil {
		t.Fatalf("get meta: %v", err)
	}
	reg.Register(meta, v2)
	assertMockResponse(t, reg, "v2")

	if err := dataStore.SetPublishedVersion(specID, v1.Version); err != nil {
		t.Fatalf("republish v1: %v", err)
	}
	meta, err = dataStore.GetSpecMeta(specID)
	if err != nil {
		t.Fatalf("get meta: %v", err)
	}
	reg.Register(meta, v1)
	assertMockResponse(t, reg, "v1")

	if err := dataStore.SaveTemplate(specID, domain.Template{ID: "response", SpecID: specID, Name: "Response", Body: "snapshot", StatusCode: http.StatusOK, Headers: map[string]string{}}); err != nil {
		t.Fatalf("update draft template for snapshot: %v", err)
	}
	if _, err := dataStore.CreateSnapshot(specID); err != nil {
		t.Fatalf("create snapshot: %v", err)
	}
	if err := dataStore.SetPublishedSnapshot(specID); err != nil {
		t.Fatalf("publish snapshot: %v", err)
	}
	reg = New(dataStore, executor.New(dataStore))
	reg.LoadFromStore()
	assertMockResponse(t, reg, "snapshot")
}

func assertMockResponse(t *testing.T, reg *Registry, expectedBody string) {
	t.Helper()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/mock/pets", nil)
	if !reg.TryServe(response, request) {
		t.Fatal("expected registry to serve request")
	}
	if response.Code != http.StatusOK || response.Body.String() != expectedBody {
		t.Fatalf("response = %d %q, want 200 %q", response.Code, response.Body.String(), expectedBody)
	}
}
