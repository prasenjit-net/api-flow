package domain

import (
	"fmt"
	"regexp"
	"strings"
)

type FlowValidationError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	NodeID  string `json:"nodeId,omitempty"`
	EdgeID  string `json:"edgeId,omitempty"`
	Field   string `json:"field,omitempty"`
}

func ValidateFlow(flow Flow) []FlowValidationError {
	var errors []FlowValidationError
	add := func(issue FlowValidationError) {
		errors = append(errors, issue)
	}

	nodesByID := make(map[string]Node, len(flow.Nodes))
	nodesByName := make(map[string]Node, len(flow.Nodes))
	var startIDs, endIDs []string

	for _, node := range flow.Nodes {
		if strings.TrimSpace(node.ID) == "" {
			add(FlowValidationError{Code: "node_id_required", Message: "node ID is required", Field: "id"})
			continue
		}
		if _, exists := nodesByID[node.ID]; exists {
			add(FlowValidationError{Code: "node_id_duplicate", Message: "node IDs must be unique", NodeID: node.ID, Field: "id"})
			continue
		}
		nodesByID[node.ID] = node

		name := node.Data.Name
		if !NodeNamePattern.MatchString(name) {
			add(FlowValidationError{
				Code:    "node_name_invalid",
				Message: "node name must start with a lowercase letter or number and contain only lowercase letters, numbers, '-' or '_' (maximum 64 characters)",
				NodeID:  node.ID,
				Field:   "data.name",
			})
		} else if name == "request" || name == "nodes" {
			add(FlowValidationError{Code: "node_name_reserved", Message: fmt.Sprintf("%q is a reserved node name", name), NodeID: node.ID, Field: "data.name"})
		} else if existing, exists := nodesByName[name]; exists {
			add(FlowValidationError{
				Code:    "node_name_duplicate",
				Message: fmt.Sprintf("node name %q is already used by node %q", name, existing.ID),
				NodeID:  node.ID,
				Field:   "data.name",
			})
		} else {
			nodesByName[name] = node
		}

		switch node.Type {
		case NodeTypeStart:
			startIDs = append(startIDs, node.ID)
		case NodeTypeEnd:
			endIDs = append(endIDs, node.ID)
		case NodeTypeContextMapper:
		case NodeTypeStarlark:
			if strings.TrimSpace(node.Data.ScriptID) == "" {
				add(FlowValidationError{Code: "script_required", Message: "Starlark node must select a script", NodeID: node.ID, Field: "data.scriptId"})
			}
		case NodeTypeTemplate:
			if strings.TrimSpace(node.Data.TemplateID) == "" {
				add(FlowValidationError{Code: "template_required", Message: "template node must select a template", NodeID: node.ID, Field: "data.templateId"})
			}
		case NodeTypeDataMapper:
			if strings.TrimSpace(node.Data.CollectionID) == "" {
				add(FlowValidationError{Code: "collection_required", Message: "Data Mapper node must select a collection", NodeID: node.ID, Field: "data.collectionId"})
			}
			if !DataMapperOperations[node.Data.Operation] {
				add(FlowValidationError{Code: "data_mapper_operation_invalid", Message: fmt.Sprintf("unsupported data mapper operation %q", node.Data.Operation), NodeID: node.ID, Field: "data.operation"})
			}
			switch node.Data.Operation {
			case "findOne", "update", "upsert", "delete":
				if len(node.Data.QueryMappings) == 0 {
					add(FlowValidationError{Code: "data_mapper_query_required", Message: "this operation requires at least one query mapping to identify a target document", NodeID: node.ID, Field: "data.queryMappings"})
				}
			}
			switch node.Data.Operation {
			case "insert", "update", "upsert":
				if len(node.Data.BodyMappings) == 0 {
					add(FlowValidationError{Code: "data_mapper_body_required", Message: "this operation requires at least one body mapping", NodeID: node.ID, Field: "data.bodyMappings"})
				}
			}
		default:
			add(FlowValidationError{Code: "node_type_invalid", Message: fmt.Sprintf("unsupported node type %q", node.Type), NodeID: node.ID, Field: "type"})
		}

	}

	if len(startIDs) != 1 {
		add(FlowValidationError{Code: "start_count_invalid", Message: "workflow must contain exactly one start node"})
	}
	if len(endIDs) != 1 {
		add(FlowValidationError{Code: "end_count_invalid", Message: "workflow must contain exactly one end node"})
	}

	for _, node := range flow.Nodes {
		validateMappingList(node, node.Data.Mappings, "data.mappings", nodesByName, mappingValidationOptions{enforceUnique: true}, add)
		validateMappingList(node, node.Data.BodyMappings, "data.bodyMappings", nodesByName, mappingValidationOptions{enforceUnique: true}, add)
		validateMappingList(node, node.Data.QueryMappings, "data.queryMappings", nodesByName, mappingValidationOptions{
			keyPattern:      QueryFieldPattern,
			keyPatternError: "query field must be a dotted path of lowercase letters, numbers, '-' or '_' segments (e.g. profile.age)",
			validateOperator: true,
		}, add)
	}

	outgoing := make(map[string][]Edge, len(flow.Nodes))
	incoming := make(map[string][]Edge, len(flow.Nodes))
	edgeIDs := make(map[string]struct{}, len(flow.Edges))
	for _, edge := range flow.Edges {
		if strings.TrimSpace(edge.ID) == "" {
			add(FlowValidationError{Code: "edge_id_required", Message: "edge ID is required", Field: "id"})
		} else if _, exists := edgeIDs[edge.ID]; exists {
			add(FlowValidationError{Code: "edge_id_duplicate", Message: "edge IDs must be unique", EdgeID: edge.ID, Field: "id"})
		} else {
			edgeIDs[edge.ID] = struct{}{}
		}
		_, sourceExists := nodesByID[edge.Source]
		_, targetExists := nodesByID[edge.Target]
		if !sourceExists {
			add(FlowValidationError{Code: "edge_source_missing", Message: fmt.Sprintf("source node %q does not exist", edge.Source), EdgeID: edge.ID, Field: "source"})
		}
		if !targetExists {
			add(FlowValidationError{Code: "edge_target_missing", Message: fmt.Sprintf("target node %q does not exist", edge.Target), EdgeID: edge.ID, Field: "target"})
		}
		if edge.Source == edge.Target && sourceExists {
			add(FlowValidationError{Code: "edge_self_reference", Message: "an edge cannot connect a node to itself", EdgeID: edge.ID})
		}
		if sourceExists && targetExists && edge.Source != edge.Target {
			outgoing[edge.Source] = append(outgoing[edge.Source], edge)
			incoming[edge.Target] = append(incoming[edge.Target], edge)
		}
		if edge.Condition != nil {
			validateCondition(*edge.Condition, edge.ID, "condition", nodesByName, &errors)
		}
	}

	for _, node := range flow.Nodes {
		inCount := len(incoming[node.ID])
		outEdges := outgoing[node.ID]
		switch node.Type {
		case NodeTypeStart:
			if inCount != 0 {
				add(FlowValidationError{Code: "start_has_incoming", Message: "start node cannot have incoming edges", NodeID: node.ID})
			}
		case NodeTypeEnd:
			if len(outEdges) != 0 {
				add(FlowValidationError{Code: "end_has_outgoing", Message: "end node cannot have outgoing edges", NodeID: node.ID})
			}
		default:
			if inCount == 0 {
				add(FlowValidationError{Code: "node_has_no_incoming", Message: "node must have at least one incoming edge", NodeID: node.ID})
			}
		}
		if node.Type != NodeTypeEnd && len(outEdges) == 0 {
			add(FlowValidationError{Code: "node_has_no_outgoing", Message: "node must have at least one outgoing edge", NodeID: node.ID})
		}
		if len(outEdges) > 0 {
			unconditional := 0
			priorities := make(map[int]string)
			for _, edge := range outEdges {
				if edge.Condition == nil {
					unconditional++
					continue
				}
				if existing, exists := priorities[edge.Priority]; exists {
					add(FlowValidationError{
						Code:    "edge_priority_duplicate",
						Message: fmt.Sprintf("conditional edges %q and %q have the same priority", existing, edge.ID),
						EdgeID:  edge.ID,
						Field:   "priority",
					})
				} else {
					priorities[edge.Priority] = edge.ID
				}
			}
			if unconditional != 1 {
				add(FlowValidationError{
					Code:    "fallback_edge_count_invalid",
					Message: "every node with outgoing edges must have exactly one unconditional fallback edge",
					NodeID:  node.ID,
				})
			}
		}
	}

	if len(startIDs) != 1 || len(endIDs) != 1 {
		return errors
	}
	startID, endID := startIDs[0], endIDs[0]

	if hasCycle(nodesByID, outgoing) {
		add(FlowValidationError{Code: "workflow_cycle", Message: "workflow must be acyclic"})
		return errors
	}

	reachable := walkForward(startID, outgoing)
	canReachEnd := walkBackward(endID, incoming)
	for _, node := range flow.Nodes {
		if !reachable[node.ID] {
			add(FlowValidationError{Code: "node_unreachable", Message: "node is not reachable from start", NodeID: node.ID})
		}
		if !canReachEnd[node.ID] {
			add(FlowValidationError{Code: "node_cannot_reach_end", Message: "node has no path to end", NodeID: node.ID})
		}
	}

	dominators := calculateDominators(startID, reachable, incoming)
	for _, node := range flow.Nodes {
		checkMappingReachability(node, node.Data.Mappings, "data.mappings", nodesByName, dominators, add)
		checkMappingReachability(node, node.Data.QueryMappings, "data.queryMappings", nodesByName, dominators, add)
		checkMappingReachability(node, node.Data.BodyMappings, "data.bodyMappings", nodesByName, dominators, add)
	}
	for _, edge := range flow.Edges {
		if edge.Condition == nil {
			continue
		}
		for _, source := range conditionSources(*edge.Condition) {
			referencedName, referencesNode := referencedNodeName(source)
			if !referencesNode {
				continue
			}
			referenced, exists := nodesByName[referencedName]
			if exists && !dominators[edge.Source][referenced.ID] {
				add(FlowValidationError{
					Code:    "condition_source_not_available",
					Message: fmt.Sprintf("node output %q is not available when this condition is evaluated", referencedName),
					EdgeID:  edge.ID,
					Field:   "condition",
				})
			}
		}
	}

	return errors
}

func validateCondition(condition Condition, edgeID, field string, nodesByName map[string]Node, errors *[]FlowValidationError) {
	add := func(code, message, childField string) {
		*errors = append(*errors, FlowValidationError{Code: code, Message: message, EdgeID: edgeID, Field: childField})
	}
	switch condition.Type {
	case ConditionTypeGroup:
		switch LogicalOperator(condition.Operator) {
		case LogicalOperatorAnd, LogicalOperatorOr:
			if len(condition.Children) == 0 {
				add("condition_group_empty", "and/or condition groups must contain at least one child", field+".children")
			}
		case LogicalOperatorNot:
			if len(condition.Children) != 1 {
				add("condition_not_arity", "not condition groups must contain exactly one child", field+".children")
			}
		default:
			add("condition_logical_operator_invalid", fmt.Sprintf("unsupported logical operator %q", condition.Operator), field+".operator")
		}
		for i, child := range condition.Children {
			validateCondition(child, edgeID, fmt.Sprintf("%s.children[%d]", field, i), nodesByName, errors)
		}
	case ConditionTypeRule:
		if strings.TrimSpace(condition.Source) == "" {
			add("condition_source_required", "condition source is required", field+".source")
		} else if sourceErr := validateContextSource(condition.Source, nodesByName); sourceErr != "" {
			add("condition_source_invalid", sourceErr, field+".source")
		}
		operator := ConditionOperator(condition.Operator)
		switch operator {
		case ConditionOperatorEquals, ConditionOperatorNotEquals,
			ConditionOperatorGreaterThan, ConditionOperatorGreaterThanOrEqual,
			ConditionOperatorLessThan, ConditionOperatorLessThanOrEqual,
			ConditionOperatorContains, ConditionOperatorStartsWith,
			ConditionOperatorEndsWith, ConditionOperatorIn:
			if condition.Value == nil && condition.ValueType != "null" {
				add("condition_value_required", fmt.Sprintf("operator %q requires a value", condition.Operator), field+".value")
			}
		case ConditionOperatorExists, ConditionOperatorNotExists:
		default:
			add("condition_operator_invalid", fmt.Sprintf("unsupported condition operator %q", condition.Operator), field+".operator")
		}
	default:
		add("condition_type_invalid", fmt.Sprintf("unsupported condition type %q", condition.Type), field+".type")
	}
}

var validConditionOperators = map[ConditionOperator]bool{
	ConditionOperatorEquals:             true,
	ConditionOperatorNotEquals:          true,
	ConditionOperatorGreaterThan:        true,
	ConditionOperatorGreaterThanOrEqual: true,
	ConditionOperatorLessThan:           true,
	ConditionOperatorLessThanOrEqual:    true,
	ConditionOperatorContains:           true,
	ConditionOperatorStartsWith:         true,
	ConditionOperatorEndsWith:           true,
	ConditionOperatorIn:                 true,
	ConditionOperatorExists:             true,
	ConditionOperatorNotExists:          true,
}

type mappingValidationOptions struct {
	keyPattern       *regexp.Regexp
	keyPatternError  string
	enforceUnique    bool
	validateOperator bool
}

func validateMappingList(node Node, mappings []Mapping, fieldPrefix string, nodesByName map[string]Node, opts mappingValidationOptions, add func(FlowValidationError)) {
	pattern := opts.keyPattern
	if pattern == nil {
		pattern = NodeNamePattern
	}
	patternErr := opts.keyPatternError
	if patternErr == "" {
		patternErr = "mapping input key must start with a lowercase letter or number and contain only lowercase letters, numbers, '-' or '_' (maximum 64 characters)"
	}
	keys := make(map[string]struct{}, len(mappings))
	for i, mapping := range mappings {
		field := fmt.Sprintf("%s[%d]", fieldPrefix, i)
		switch mapping.Type {
		case "", "context":
			if strings.TrimSpace(mapping.Source) == "" {
				add(FlowValidationError{Code: "mapping_source_required", Message: "mapping source is required", NodeID: node.ID, Field: field + ".source"})
			} else if sourceErr := validateContextSource(mapping.Source, nodesByName); sourceErr != "" {
				add(FlowValidationError{Code: "mapping_source_invalid", Message: sourceErr, NodeID: node.ID, Field: field + ".source"})
			}
		case "constant":
		default:
			add(FlowValidationError{Code: "mapping_type_invalid", Message: fmt.Sprintf("unsupported mapping type %q", mapping.Type), NodeID: node.ID, Field: field + ".type"})
		}
		key := strings.TrimSpace(mapping.Key)
		if key == "" {
			add(FlowValidationError{Code: "mapping_key_required", Message: "mapping input key is required", NodeID: node.ID, Field: field + ".key"})
		} else if !pattern.MatchString(key) {
			add(FlowValidationError{Code: "mapping_key_invalid", Message: patternErr, NodeID: node.ID, Field: field + ".key"})
		} else if opts.enforceUnique {
			if _, exists := keys[key]; exists {
				add(FlowValidationError{Code: "mapping_key_duplicate", Message: fmt.Sprintf("input key %q is mapped more than once", key), NodeID: node.ID, Field: field + ".key"})
			} else {
				keys[key] = struct{}{}
			}
		}
		if opts.validateOperator && mapping.Operator != "" && !validConditionOperators[ConditionOperator(mapping.Operator)] {
			add(FlowValidationError{Code: "mapping_operator_invalid", Message: fmt.Sprintf("unsupported operator %q", mapping.Operator), NodeID: node.ID, Field: field + ".operator"})
		}
	}
}

func checkMappingReachability(node Node, mappings []Mapping, fieldPrefix string, nodesByName map[string]Node, dominators map[string]map[string]bool, add func(FlowValidationError)) {
	for i, mapping := range mappings {
		if mapping.Type == "constant" {
			continue
		}
		referencedName, referencesNode := referencedNodeName(mapping.Source)
		if !referencesNode {
			continue
		}
		referenced, exists := nodesByName[referencedName]
		if exists && !dominators[node.ID][referenced.ID] {
			add(FlowValidationError{
				Code:    "mapping_source_not_available",
				Message: fmt.Sprintf("node output %q is not available on every path to this node", referencedName),
				NodeID:  node.ID,
				Field:   fmt.Sprintf("%s[%d].source", fieldPrefix, i),
			})
		}
	}
}

func validateContextSource(source string, nodesByName map[string]Node) string {
	parts := strings.Split(source, ".")
	if len(parts) == 0 {
		return "context source is required"
	}
	switch parts[0] {
	case "request":
		if len(parts) < 2 {
			return "request source must include a field path"
		}
	case "nodes":
		if len(parts) < 3 {
			return "node source must use nodes.<node-name>.<output-path>"
		}
		if _, exists := nodesByName[parts[1]]; !exists {
			return fmt.Sprintf("referenced node %q does not exist", parts[1])
		}
	default:
		return "context source must begin with request. or nodes."
	}
	return ""
}

func hasCycle(nodes map[string]Node, outgoing map[string][]Edge) bool {
	const (
		unvisited = iota
		visiting
		visited
	)
	state := map[string]int{}
	var visit func(string) bool
	visit = func(nodeID string) bool {
		if state[nodeID] == visiting {
			return true
		}
		if state[nodeID] == visited {
			return false
		}
		state[nodeID] = visiting
		for _, edge := range outgoing[nodeID] {
			if visit(edge.Target) {
				return true
			}
		}
		state[nodeID] = visited
		return false
	}
	for nodeID := range nodes {
		if visit(nodeID) {
			return true
		}
	}
	return false
}

func walkForward(startID string, outgoing map[string][]Edge) map[string]bool {
	visited := map[string]bool{}
	queue := []string{startID}
	for len(queue) > 0 {
		nodeID := queue[0]
		queue = queue[1:]
		if visited[nodeID] {
			continue
		}
		visited[nodeID] = true
		for _, edge := range outgoing[nodeID] {
			queue = append(queue, edge.Target)
		}
	}
	return visited
}

func walkBackward(endID string, incoming map[string][]Edge) map[string]bool {
	visited := map[string]bool{}
	queue := []string{endID}
	for len(queue) > 0 {
		nodeID := queue[0]
		queue = queue[1:]
		if visited[nodeID] {
			continue
		}
		visited[nodeID] = true
		for _, edge := range incoming[nodeID] {
			queue = append(queue, edge.Source)
		}
	}
	return visited
}

func calculateDominators(startID string, reachable map[string]bool, incoming map[string][]Edge) map[string]map[string]bool {
	all := make(map[string]bool, len(reachable))
	for nodeID := range reachable {
		all[nodeID] = true
	}
	dominators := make(map[string]map[string]bool, len(reachable))
	for nodeID := range reachable {
		if nodeID == startID {
			dominators[nodeID] = map[string]bool{startID: true}
		} else {
			dominators[nodeID] = cloneSet(all)
		}
	}

	changed := true
	for changed {
		changed = false
		for nodeID := range reachable {
			if nodeID == startID {
				continue
			}
			var intersection map[string]bool
			for _, edge := range incoming[nodeID] {
				if !reachable[edge.Source] {
					continue
				}
				if intersection == nil {
					intersection = cloneSet(dominators[edge.Source])
				} else {
					for candidate := range intersection {
						if !dominators[edge.Source][candidate] {
							delete(intersection, candidate)
						}
					}
				}
			}
			if intersection == nil {
				intersection = map[string]bool{}
			}
			intersection[nodeID] = true
			if !sameSet(intersection, dominators[nodeID]) {
				dominators[nodeID] = intersection
				changed = true
			}
		}
	}
	return dominators
}

func cloneSet(input map[string]bool) map[string]bool {
	result := make(map[string]bool, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

func sameSet(left, right map[string]bool) bool {
	if len(left) != len(right) {
		return false
	}
	for key := range left {
		if !right[key] {
			return false
		}
	}
	return true
}

func referencedNodeName(source string) (string, bool) {
	parts := strings.Split(source, ".")
	if len(parts) >= 2 && parts[0] == "nodes" {
		return parts[1], true
	}
	return "", false
}

func conditionSources(condition Condition) []string {
	if condition.Type == ConditionTypeRule {
		return []string{condition.Source}
	}
	var result []string
	for _, child := range condition.Children {
		result = append(result, conditionSources(child)...)
	}
	return result
}
