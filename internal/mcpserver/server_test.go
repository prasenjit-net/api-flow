package mcpserver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/service"
	"github.com/prasenjit-net/api-flow/internal/sessions"
	"github.com/prasenjit-net/api-flow/internal/store"
)

func TestServerExposesWorkspaceResourcesAndTools(t *testing.T) { // NOSONAR: integration scenario keeps setup and assertions together
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveSpecMeta(domain.SpecMeta{ID: "widgets", Name: "Widgets", ContextPath: "/widgets"}); err != nil {
		t.Fatalf("save spec: %v", err)
	}
	if err := dataStore.SaveSpecFile("widgets", []byte("openapi: 3.0.3\ninfo:\n  title: Widgets\n  version: '1'\npaths:\n  /widgets:\n    get:\n      summary: List widgets\n      responses:\n        '200':\n          description: OK\n    post:\n      summary: Create widget\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema:\n              type: object\n              required: [name]\n              properties:\n                name:\n                  type: string\n                  minLength: 2\n      responses:\n        '200':\n          description: OK\n")); err != nil {
		t.Fatalf("save spec source: %v", err)
	}
	workspace := service.New(config.Default(), dataStore, nil, sessions.NewManager(0))
	server := New(workspace, Options{Version: "test"})
	clientSession := connectClient(t, server)

	tools, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	want := map[string]bool{
		"workspace_overview": false, "operation_list": false, "flow_save": false,
		"template_save": false, "collection_document_save": false, "test_request_save": false,
		"release_create": false, "release_publish_snapshot": false, "session_persist": false, "trace_get": false,
		"spec_validation_config_get": false, "spec_validation_config_set": false, "spec_validation_test": false,
	}
	for _, tool := range tools.Tools {
		if _, ok := want[tool.Name]; ok {
			want[tool.Name] = true
		}
	}
	for name, found := range want {
		if !found {
			t.Errorf("missing MCP tool %q", name)
		}
	}

	resource, err := clientSession.ReadResource(context.Background(), &mcp.ReadResourceParams{URI: "api-flow://configuration"})
	if err != nil {
		t.Fatalf("read configuration resource: %v", err)
	}
	if len(resource.Contents) != 1 || !strings.Contains(resource.Contents[0].Text, `"name": "API Flow"`) {
		t.Fatalf("unexpected configuration resource: %#v", resource.Contents)
	}

	result, err := clientSession.CallTool(context.Background(), &mcp.CallToolParams{Name: "release_publish_snapshot", Arguments: map[string]any{"specId": "widgets"}})
	if err != nil {
		t.Fatalf("call tool: %v", err)
	}
	if !result.IsError || len(result.Content) != 1 {
		t.Fatalf("expected confirmation response, got %#v", result)
	}

	operations, err := clientSession.CallTool(context.Background(), &mcp.CallToolParams{Name: "operation_list", Arguments: map[string]any{"specId": "widgets"}})
	if err != nil {
		t.Fatalf("list operations: %v", err)
	}
	if operations.IsError || len(operations.Content) == 0 || !strings.Contains(operations.Content[0].(*mcp.TextContent).Text, "get_widgets") {
		t.Fatalf("unexpected operation list: %#v", operations)
	}

	savedConfig, err := clientSession.CallTool(context.Background(), &mcp.CallToolParams{Name: "spec_validation_config_set", Arguments: map[string]any{
		"specId":  "widgets",
		"confirm": true,
		"config": map[string]any{
			"pathMessages": map[string]any{"/name|required": "Please provide {field}"},
			"aliases":      map[string]any{"/name": "widget_name"},
			"codes":        map[string]any{"/name|required": "E_WIDGET_NAME_REQUIRED"},
		},
	}})
	if err != nil {
		t.Fatalf("set validation config: %v", err)
	}
	if savedConfig.IsError || len(savedConfig.Content) == 0 || !strings.Contains(savedConfig.Content[0].(*mcp.TextContent).Text, "E_WIDGET_NAME_REQUIRED") {
		t.Fatalf("unexpected validation config result: %#v", savedConfig)
	}

	validation, err := clientSession.CallTool(context.Background(), &mcp.CallToolParams{Name: "spec_validation_test", Arguments: map[string]any{
		"specId":      "widgets",
		"operationId": "post_widgets",
		"body":        map[string]any{},
	}})
	if err != nil {
		t.Fatalf("test schema validation: %v", err)
	}
	if validation.IsError || len(validation.Content) == 0 {
		t.Fatalf("unexpected validation result: %#v", validation)
	}
	validationText := validation.Content[0].(*mcp.TextContent).Text
	if !strings.Contains(validationText, "E_WIDGET_NAME_REQUIRED_WIDGET_NAME") || !strings.Contains(validationText, "Please provide widget_name") {
		t.Fatalf("validation result did not include translated issue: %s", validationText)
	}
}

func TestHTTPHandlerRejectsCrossOriginRequests(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	handler := HTTPHandler(New(service.New(config.Default(), dataStore, nil, sessions.NewManager(0)), Options{}))
	request := httptest.NewRequest("POST", "http://localhost/mcp", strings.NewReader(`{}`))
	request.Header.Set("Origin", "https://example.test")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 403 {
		t.Fatalf("status = %d, want 403", response.Code)
	}
}

func TestBearerAuthRejectsMissingToken(t *testing.T) {
	handler := BearerAuth(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }), "secret")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("POST", "http://localhost/mcp", nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", response.Code)
	}
}

func connectClient(t *testing.T, server *mcp.Server) *mcp.ClientSession {
	t.Helper()
	clientTransport, serverTransport := mcp.NewInMemoryTransports()
	if _, err := server.Connect(context.Background(), serverTransport, nil); err != nil {
		t.Fatalf("connect server: %v", err)
	}
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "test"}, nil)
	clientSession, err := client.Connect(context.Background(), clientTransport, nil)
	if err != nil {
		t.Fatalf("connect client: %v", err)
	}
	t.Cleanup(func() { clientSession.Close() })
	return clientSession
}
