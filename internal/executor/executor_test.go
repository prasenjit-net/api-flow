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
		{ID: "default-template", SpecID: "customer-spec", StatusCode: http.StatusOK, Body: `default {{.name}}`, Headers: map[string]string{"X-Branch": "default"}},
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
