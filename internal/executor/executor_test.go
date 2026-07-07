package executor

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

func TestExecuteSelectsOneTemplateAndUsesScopedInput(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	for _, responseTemplate := range []domain.Template{
		{ID: "vip-template", SpecID: "customer-spec", StatusCode: http.StatusAccepted, Body: `vip {{.name}}`, Headers: map[string]string{"X-Branch": "vip"}},
		{ID: "default-template", SpecID: "customer-spec", StatusCode: http.StatusOK, Body: `default {{.request.body.name}}`, Headers: map[string]string{"X-Branch": "default"}},
	} {
		if err := dataStore.SaveTemplate("customer-spec", responseTemplate); err != nil {
			t.Fatalf("save template: %v", err)
		}
	}

	exec := New(dataStore)
	flow := executableBranchingFlow()

	vipRequest := httptest.NewRequest(http.MethodPost, "/customers", strings.NewReader(`{"tier":"vip","name":"Asha"}`))
	vipResponse := httptest.NewRecorder()
	exec.Execute(vipResponse, vipRequest, flow, nil)
	if vipResponse.Code != http.StatusAccepted || vipResponse.Body.String() != "vip Asha" {
		t.Fatalf("unexpected VIP response: status=%d body=%q", vipResponse.Code, vipResponse.Body.String())
	}
	if got := vipResponse.Header().Get("X-Branch"); got != "vip" {
		t.Fatalf("expected VIP template header, got %q", got)
	}

	defaultRequest := httptest.NewRequest(http.MethodPost, "/customers", strings.NewReader(`{"tier":"basic","name":"Bo"}`))
	defaultResponse := httptest.NewRecorder()
	exec.Execute(defaultResponse, defaultRequest, flow, nil)
	if defaultResponse.Code != http.StatusOK || defaultResponse.Body.String() != "default Bo" {
		t.Fatalf("unexpected default response: status=%d body=%q", defaultResponse.Code, defaultResponse.Body.String())
	}
	if got := defaultResponse.Header().Get("X-Branch"); got != "default" {
		t.Fatalf("expected default template header, got %q", got)
	}
}

func TestExecuteRejectsTemplateScopedToAnotherOperation(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveTemplate("customer-spec", domain.Template{
		ID:          "vip-template",
		SpecID:      "customer-spec",
		OperationID: "delete-customer",
		StatusCode:  http.StatusOK,
		Body:        "wrong operation",
		Headers:     map[string]string{},
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/customers", strings.NewReader(`{"tier":"vip","name":"Asha"}`))
	response := httptest.NewRecorder()
	New(dataStore).Execute(response, request, executableBranchingFlow(), nil)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected scope failure, got status=%d body=%q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "scoped to operation") {
		t.Fatalf("expected operation scope error, got %q", response.Body.String())
	}
}

func TestExecuteAppendsStarlarkOutputToContext(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveScript(domain.Script{
		ID:     "double-script",
		Name:   "Double",
		Source: "def run(input):\n    return {\"doubled\": input[\"amount\"] * 2}\n",
	}); err != nil {
		t.Fatalf("save script: %v", err)
	}
	if err := dataStore.SaveTemplate("math-spec", domain.Template{
		ID:         "response-template",
		SpecID:     "math-spec",
		Name:       "Response",
		StatusCode: http.StatusOK,
		Body:       `{{index .nodes "calculate" "doubled"}}`,
		Headers:    map[string]string{},
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	flow := domain.Flow{
		Version:     domain.CurrentFlowVersion,
		SpecID:      "math-spec",
		OperationID: "post-math",
		Nodes: []domain.Node{
			{ID: "start", Type: domain.NodeTypeStart, Data: domain.NodeData{Name: "start"}},
			{
				ID:   "calculate",
				Type: domain.NodeTypeStarlark,
				Data: domain.NodeData{
					Name:     "calculate",
					ScriptID: "double-script",
					Mappings: []domain.Mapping{{Source: "request.body.amount", Key: "amount"}},
				},
			},
			{ID: "response", Type: domain.NodeTypeTemplate, Data: domain.NodeData{Name: "response", TemplateID: "response-template"}},
			{ID: "end", Type: domain.NodeTypeEnd, Data: domain.NodeData{Name: "end"}},
		},
		Edges: []domain.Edge{
			{ID: "start-calculate", Source: "start", Target: "calculate"},
			{ID: "calculate-response", Source: "calculate", Target: "response"},
			{ID: "response-end", Source: "response", Target: "end"},
		},
	}
	request := httptest.NewRequest(http.MethodPost, "/math", strings.NewReader(`{"amount":21}`))
	response := httptest.NewRecorder()

	New(dataStore).Execute(response, request, flow, nil)

	if response.Code != http.StatusOK || response.Body.String() != "42" {
		t.Fatalf("unexpected response: status=%d body=%q", response.Code, response.Body.String())
	}
}

func TestExecuteUsesConstantMappedInputs(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveTemplate("customer-spec", domain.Template{
		ID:         "constant-template",
		SpecID:     "customer-spec",
		StatusCode: http.StatusOK,
		Body:       `hello {{.nodes.constants.display_name}}`,
		Headers:    map[string]string{},
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}

	flow := domain.Flow{
		Version:     domain.CurrentFlowVersion,
		SpecID:      "customer-spec",
		OperationID: "constant-operation",
		Nodes: []domain.Node{
			{ID: "start", Type: domain.NodeTypeStart, Data: domain.NodeData{Name: "start"}},
			{
				ID:   "constants",
				Type: domain.NodeTypeContextMapper,
				Data: domain.NodeData{
					Name: "constants",
					Mappings: []domain.Mapping{{
						Type:      "constant",
						Key:       "display_name",
						Value:     "user name",
						ValueType: "string",
					}},
				},
			},
			{ID: "response", Type: domain.NodeTypeTemplate, Data: domain.NodeData{Name: "response", TemplateID: "constant-template"}},
			{ID: "end", Type: domain.NodeTypeEnd, Data: domain.NodeData{Name: "end"}},
		},
		Edges: []domain.Edge{
			{ID: "start-constants", Source: "start", Target: "constants"},
			{ID: "constants-response", Source: "constants", Target: "response"},
			{ID: "response-end", Source: "response", Target: "end"},
		},
	}
	request := httptest.NewRequest(http.MethodGet, "/constant", nil)
	response := httptest.NewRecorder()

	New(dataStore).Execute(response, request, flow, nil)

	if response.Code != http.StatusOK || response.Body.String() != "hello user name" {
		t.Fatalf("unexpected response: status=%d body=%q", response.Code, response.Body.String())
	}
}

func TestExecuteTemplateSupportsContextPathShorthand(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveTemplate("customer-spec", domain.Template{
		ID:         "shorthand-template",
		SpecID:     "customer-spec",
		StatusCode: http.StatusOK,
		Body:       `{"name":"{{nodes.script-1.value}}","id":"{{request.path.petId}}"}`,
		Headers:    map[string]string{},
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}

	flow := domain.Flow{
		Version:     domain.CurrentFlowVersion,
		SpecID:      "customer-spec",
		OperationID: "get_pet",
		Nodes: []domain.Node{
			{ID: "start", Type: domain.NodeTypeStart, Data: domain.NodeData{Name: "start"}},
			{
				ID:   "script",
				Type: domain.NodeTypeContextMapper,
				Data: domain.NodeData{
					Name: "script-1",
					Mappings: []domain.Mapping{{
						Type:      "constant",
						Key:       "value",
						Value:     "Momo",
						ValueType: "string",
					}},
				},
			},
			{ID: "response", Type: domain.NodeTypeTemplate, Data: domain.NodeData{Name: "response", TemplateID: "shorthand-template"}},
			{ID: "end", Type: domain.NodeTypeEnd, Data: domain.NodeData{Name: "end"}},
		},
		Edges: []domain.Edge{
			{ID: "start-script", Source: "start", Target: "script"},
			{ID: "script-response", Source: "script", Target: "response"},
			{ID: "response-end", Source: "response", Target: "end"},
		},
	}
	request := httptest.NewRequest(http.MethodGet, "/pets/a1", nil)
	response := httptest.NewRecorder()

	New(dataStore).Execute(response, request, flow, map[string]string{"petId": "a1"})

	if response.Code != http.StatusOK || response.Body.String() != `{"name":"Momo","id":"a1"}` {
		t.Fatalf("unexpected response: status=%d body=%q", response.Code, response.Body.String())
	}
}

func TestExecuteUsesOpenAPIExampleWhenNoTemplateRendered(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveSpecFile("fallback-spec", []byte(fallbackExampleSpec)); err != nil {
		t.Fatalf("save spec file: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/fallback?name=Asha", nil)
	response := httptest.NewRecorder()
	New(dataStore).Execute(response, request, flowWithoutTemplate("fallback-spec", "get_fallback"), nil)

	if response.Code != http.StatusOK {
		t.Fatalf("expected example response status 200, got %d: %s", response.Code, response.Body.String())
	}
	if response.Body.String() != "hello Asha" {
		t.Fatalf("expected rendered example body, got %q", response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); got != "text/plain" {
		t.Fatalf("expected example content type, got %q", got)
	}
}

func TestExecuteReturns404WhenNoTemplateOrExampleExists(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveSpecFile("fallback-spec", []byte(fallbackExampleSpec)); err != nil {
		t.Fatalf("save spec file: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/empty", nil)
	response := httptest.NewRecorder()
	New(dataStore).Execute(response, request, flowWithoutTemplate("fallback-spec", "get_empty"), nil)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when no response source exists, got %d: %s", response.Code, response.Body.String())
	}
}

func TestExecuteUsesLastTemplateResponseWhenMultipleTemplatesRun(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	for _, template := range []domain.Template{
		{ID: "first-template", SpecID: "multi-spec", StatusCode: http.StatusAccepted, Body: "first", Headers: map[string]string{"X-Template": "first"}},
		{ID: "second-template", SpecID: "multi-spec", StatusCode: http.StatusCreated, Body: "second", Headers: map[string]string{"X-Template": "second"}},
	} {
		if err := dataStore.SaveTemplate("multi-spec", template); err != nil {
			t.Fatalf("save template: %v", err)
		}
	}

	flow := domain.Flow{
		Version:     domain.CurrentFlowVersion,
		SpecID:      "multi-spec",
		OperationID: "get_multi",
		Nodes: []domain.Node{
			{ID: "start", Type: domain.NodeTypeStart, Data: domain.NodeData{Name: "start"}},
			{ID: "first", Type: domain.NodeTypeTemplate, Data: domain.NodeData{Name: "first", TemplateID: "first-template"}},
			{ID: "second", Type: domain.NodeTypeTemplate, Data: domain.NodeData{Name: "second", TemplateID: "second-template"}},
			{ID: "end", Type: domain.NodeTypeEnd, Data: domain.NodeData{Name: "end"}},
		},
		Edges: []domain.Edge{
			{ID: "start-first", Source: "start", Target: "first"},
			{ID: "first-second", Source: "first", Target: "second"},
			{ID: "second-end", Source: "second", Target: "end"},
		},
	}
	request := httptest.NewRequest(http.MethodGet, "/multi", nil)
	response := httptest.NewRecorder()
	New(dataStore).Execute(response, request, flow, nil)

	if response.Code != http.StatusCreated || response.Body.String() != "second" {
		t.Fatalf("expected last template response, got status=%d body=%q", response.Code, response.Body.String())
	}
	if got := response.Header().Get("X-Template"); got != "second" {
		t.Fatalf("expected last template header, got %q", got)
	}
}

func TestExecuteSavesTraceWhenSpecTracingEnabled(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveSpecMeta(domain.SpecMeta{ID: "customer-spec", Name: "Customers", TracingEnabled: true}); err != nil {
		t.Fatalf("save spec meta: %v", err)
	}
	if err := dataStore.SaveTemplate("customer-spec", domain.Template{
		ID:         "vip-template",
		SpecID:     "customer-spec",
		StatusCode: http.StatusAccepted,
		Body:       `vip {{.name}}`,
		Headers:    map[string]string{"X-Branch": "vip"},
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/customers", strings.NewReader(`{"tier":"vip","name":"Asha"}`))
	response := httptest.NewRecorder()
	New(dataStore).Execute(response, request, executableBranchingFlow(), nil)

	if response.Code != http.StatusAccepted {
		t.Fatalf("unexpected response status: %d", response.Code)
	}
	traces, err := dataStore.ListTraces()
	if err != nil {
		t.Fatalf("list traces: %v", err)
	}
	if len(traces) != 1 {
		t.Fatalf("expected one trace, got %d", len(traces))
	}
	trace, err := dataStore.GetTrace(traces[0].ID)
	if err != nil {
		t.Fatalf("get trace: %v", err)
	}
	if trace.SpecID != "customer-spec" || trace.OperationID != "create-customer" {
		t.Fatalf("unexpected trace target: %#v", trace)
	}
	if trace.Request.Body == nil || trace.Response.Body != "vip Asha" {
		t.Fatalf("trace did not capture request/response bodies: request=%#v response=%#v", trace.Request.Body, trace.Response.Body)
	}
	if trace.StatusCode != http.StatusAccepted || trace.DurationMS < 0 {
		t.Fatalf("unexpected trace status/timing: status=%d duration=%d", trace.StatusCode, trace.DurationMS)
	}
	if len(trace.Nodes) == 0 {
		t.Fatal("expected node traces")
	}
	if _, ok := trace.Context["nodes"]; !ok {
		t.Fatalf("expected final context nodes, got %#v", trace.Context)
	}
	var selectedConditional bool
	for _, edge := range trace.Edges {
		if edge.ID == "route-vip" && edge.Selected && edge.Matched {
			selectedConditional = true
		}
	}
	if !selectedConditional {
		t.Fatalf("expected selected route-vip edge, got %#v", trace.Edges)
	}
}

const fallbackExampleSpec = `openapi: 3.0.3
info:
  title: Fallback
  version: 1.0.0
paths:
  /fallback:
    get:
      responses:
        '500':
          description: Ignored error
          content:
            text/plain:
              example: error
        '200':
          description: Success
          content:
            text/plain:
              example: hello {{.request.query.name}}
  /empty:
    get:
      responses:
        '200':
          description: Success without example
`

func flowWithoutTemplate(specID, operationID string) domain.Flow {
	return domain.Flow{
		Version:     domain.CurrentFlowVersion,
		SpecID:      specID,
		OperationID: operationID,
		Nodes: []domain.Node{
			{ID: "start", Type: domain.NodeTypeStart, Data: domain.NodeData{Name: "start"}},
			{ID: "end", Type: domain.NodeTypeEnd, Data: domain.NodeData{Name: "end"}},
		},
		Edges: []domain.Edge{{ID: "start-end", Source: "start", Target: "end"}},
	}
}

func executableBranchingFlow() domain.Flow {
	return domain.Flow{
		Version:     domain.CurrentFlowVersion,
		SpecID:      "customer-spec",
		OperationID: "create-customer",
		Nodes: []domain.Node{
			{ID: "start", Type: domain.NodeTypeStart, Data: domain.NodeData{Name: "start"}},
			{
				ID:   "route",
				Type: domain.NodeTypeContextMapper,
				Data: domain.NodeData{
					Name: "route-request",
					Mappings: []domain.Mapping{
						{Source: "request.body.tier", Key: "tier"},
						{Source: "request.body.name", Key: "name"},
					},
				},
			},
			{
				ID:   "vip",
				Type: domain.NodeTypeTemplate,
				Data: domain.NodeData{
					Name:       "vip-response",
					TemplateID: "vip-template",
					Mappings:   []domain.Mapping{{Source: "nodes.route-request.name", Key: "name"}},
				},
			},
			{
				ID:   "default",
				Type: domain.NodeTypeTemplate,
				Data: domain.NodeData{
					Name:       "default-response",
					TemplateID: "default-template",
					Mappings:   []domain.Mapping{{Source: "nodes.route-request.name", Key: "name"}},
				},
			},
			{ID: "end", Type: domain.NodeTypeEnd, Data: domain.NodeData{Name: "end"}},
		},
		Edges: []domain.Edge{
			{ID: "start-route", Source: "start", Target: "route"},
			{
				ID:       "route-vip",
				Source:   "route",
				Target:   "vip",
				Priority: 0,
				Condition: &domain.Condition{
					Type:     domain.ConditionTypeRule,
					Source:   "nodes.route-request.tier",
					Operator: string(domain.ConditionOperatorEquals),
					Value:    "vip",
				},
			},
			{ID: "route-default", Source: "route", Target: "default"},
			{ID: "vip-end", Source: "vip", Target: "end"},
			{ID: "default-end", Source: "default", Target: "end"},
		},
	}
}
