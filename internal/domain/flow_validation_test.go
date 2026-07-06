package domain

import "testing"

func TestValidateFlowAcceptsConditionalBranchWithFallback(t *testing.T) {
	flow := validBranchingFlow()
	if issues := ValidateFlow(flow); len(issues) != 0 {
		t.Fatalf("expected valid flow, got %#v", issues)
	}
}

func TestValidateFlowRequiresOneFallbackPerBranch(t *testing.T) {
	flow := validBranchingFlow()
	flow.Edges[2].Condition = &Condition{
		Type:     ConditionTypeRule,
		Source:   "request.body.tier",
		Operator: string(ConditionOperatorEquals),
		Value:    "standard",
	}

	issues := ValidateFlow(flow)
	if !hasValidationCode(issues, "fallback_edge_count_invalid") {
		t.Fatalf("expected fallback validation error, got %#v", issues)
	}
}

func TestValidateFlowRequiresExactlyOneTemplatePerRoute(t *testing.T) {
	flow := validBranchingFlow()
	flow.Nodes[3].Type = NodeTypeContextMapper
	flow.Nodes[3].Data.TemplateID = ""

	issues := ValidateFlow(flow)
	if !hasValidationCode(issues, "route_template_missing") {
		t.Fatalf("expected missing template route error, got %#v", issues)
	}
}

func TestValidateFlowRejectsOutputThatDoesNotDominateConsumer(t *testing.T) {
	flow := validBranchingFlow()
	flow.Nodes[3].Data.Mappings = []Mapping{{
		Source: "nodes.vip-response.body",
		Key:    "body",
	}}

	issues := ValidateFlow(flow)
	if !hasValidationCode(issues, "mapping_source_not_available") {
		t.Fatalf("expected unavailable output error, got %#v", issues)
	}
}

func TestValidateFlowRequiresScriptOnStarlarkNode(t *testing.T) {
	flow := validBranchingFlow()
	flow.Nodes[1].Type = NodeTypeStarlark
	flow.Nodes[1].Data.ScriptID = ""

	issues := ValidateFlow(flow)
	if !hasValidationCode(issues, "script_required") {
		t.Fatalf("expected script-required error, got %#v", issues)
	}
}

func validBranchingFlow() Flow {
	return Flow{
		Version: CurrentFlowVersion,
		Nodes: []Node{
			{ID: "start", Type: NodeTypeStart, Data: NodeData{Name: "start"}},
			{
				ID:   "route",
				Type: NodeTypeContextMapper,
				Data: NodeData{
					Name: "route-request",
					Mappings: []Mapping{
						{Source: "request.body.tier", Key: "tier"},
						{Source: "request.body.name", Key: "name"},
					},
				},
			},
			{
				ID:   "vip",
				Type: NodeTypeTemplate,
				Data: NodeData{
					Name:       "vip-response",
					TemplateID: "vip-template",
					Mappings:   []Mapping{{Source: "nodes.route-request.name", Key: "name"}},
				},
			},
			{
				ID:   "default",
				Type: NodeTypeTemplate,
				Data: NodeData{
					Name:       "default-response",
					TemplateID: "default-template",
					Mappings:   []Mapping{{Source: "nodes.route-request.name", Key: "name"}},
				},
			},
			{ID: "end", Type: NodeTypeEnd, Data: NodeData{Name: "end"}},
		},
		Edges: []Edge{
			{ID: "start-route", Source: "start", Target: "route"},
			{
				ID:       "route-vip",
				Source:   "route",
				Target:   "vip",
				Priority: 0,
				Condition: &Condition{
					Type:     ConditionTypeRule,
					Source:   "nodes.route-request.tier",
					Operator: string(ConditionOperatorEquals),
					Value:    "vip",
				},
			},
			{ID: "route-default", Source: "route", Target: "default"},
			{ID: "vip-end", Source: "vip", Target: "end"},
			{ID: "default-end", Source: "default", Target: "end"},
		},
	}
}

func hasValidationCode(issues []FlowValidationError, code string) bool {
	for _, issue := range issues {
		if issue.Code == code {
			return true
		}
	}
	return false
}
