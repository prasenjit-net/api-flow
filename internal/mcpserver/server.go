package mcpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/prasenjit-net/api-flow/internal/service"
)

const resourceScheme = "api-flow"

type Options struct {
	Version string
}

// New creates an MCP server whose handlers delegate to the shared workspace
// service. No MCP handler performs persistence or registry work itself.
func New(workspace *service.Workspace, options Options) *mcp.Server {
	version := options.Version
	if version == "" {
		version = "dev"
	}
	server := mcp.NewServer(&mcp.Implementation{Name: "api-flow", Version: version, Title: "API Flow"}, nil)
	registerResources(server, workspace)
	registerPrompts(server)
	registerTools(server, workspace)
	return server
}

// HTTPHandler serves the current stateless Streamable HTTP transport. The
// SDK validates the protocol metadata headers for MCP 2026-07-28 requests.
func HTTPHandler(server *mcp.Server) http.Handler {
	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{
		Stateless:                    true,
		JSONResponse:                 true,
		MaxRequestBodyBytes:          4 << 20,
		PropagateRequestCancellation: true,
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" && !sameOrigin(origin, r) {
			http.Error(w, "MCP origin is not allowed", http.StatusForbidden)
			return
		}
		handler.ServeHTTP(w, r)
	})
}

// BearerAuth protects opt-in remote MCP HTTP deployments. Local stdio does
// not use this middleware because process access is the trust boundary.
func BearerAuth(next http.Handler, token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+token {
			w.Header().Set("WWW-Authenticate", `Bearer realm="api-flow-mcp"`)
			http.Error(w, "MCP authentication required", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func sameOrigin(origin string, r *http.Request) bool {
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return u.Host == r.Host
}

func registerResources(server *mcp.Server, workspace *service.Workspace) {
	server.AddResource(&mcp.Resource{
		URI: "api-flow://workspace", Name: "workspace", Title: "API Flow workspace", MIMEType: "application/json",
		Description: "Compact workspace counts and specification metadata.",
	}, jsonResource(func() (any, error) { return workspace.Overview() }))
	server.AddResource(&mcp.Resource{
		URI: "api-flow://configuration", Name: "configuration", Title: "Effective configuration", MIMEType: "application/json",
		Description: "Sanitized effective API Flow configuration. It is read-only.",
	}, jsonResource(func() (any, error) { return workspace.Configuration(), nil }))
	server.AddResourceTemplate(&mcp.ResourceTemplate{
		URITemplate: "api-flow://specs/{specId}", Name: "spec", Title: "Specification design", MIMEType: "application/json",
		Description: "A specification with its OpenAPI source and all draft design assets.",
	}, func(_ context.Context, request *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
		u, err := url.Parse(request.Params.URI)
		if err != nil || u.Host != "specs" || strings.Trim(u.Path, "/") == "" {
			return nil, mcp.ResourceNotFoundError(request.Params.URI)
		}
		value, err := workspace.GetSpec(strings.Trim(u.Path, "/"))
		if err != nil {
			return nil, resourceError(request.Params.URI, err)
		}
		return marshalResource(request.Params.URI, value)
	})
	server.AddResourceTemplate(&mcp.ResourceTemplate{
		URITemplate: "api-flow://sessions/{sessionId}", Name: "session", Title: "Session events", MIMEType: "application/json",
		Description: "A short-lived data session and its event log.",
	}, func(_ context.Context, request *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
		u, err := url.Parse(request.Params.URI)
		if err != nil || u.Host != "sessions" || strings.Trim(u.Path, "/") == "" {
			return nil, mcp.ResourceNotFoundError(request.Params.URI)
		}
		value, err := workspace.GetSession(strings.Trim(u.Path, "/"))
		if err != nil {
			return nil, resourceError(request.Params.URI, err)
		}
		return marshalResource(request.Params.URI, value)
	})
	server.AddResourceTemplate(&mcp.ResourceTemplate{
		URITemplate: "api-flow://traces/{traceId}", Name: "trace", Title: "Execution trace", MIMEType: "application/json",
		Description: "A complete mock execution trace, including request, response, node, and edge details.",
	}, func(_ context.Context, request *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
		u, err := url.Parse(request.Params.URI)
		if err != nil || u.Host != "traces" || strings.Trim(u.Path, "/") == "" {
			return nil, mcp.ResourceNotFoundError(request.Params.URI)
		}
		value, err := workspace.GetTrace(strings.Trim(u.Path, "/"))
		if err != nil {
			return nil, resourceError(request.Params.URI, err)
		}
		return marshalResource(request.Params.URI, value)
	})
}

func jsonResource(read func() (any, error)) mcp.ResourceHandler {
	return func(_ context.Context, request *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
		value, err := read()
		if err != nil {
			return nil, err
		}
		return marshalResource(request.Params.URI, value)
	}
}

func marshalResource(uri string, value any) (*mcp.ReadResourceResult, error) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, err
	}
	return &mcp.ReadResourceResult{Cacheable: mcp.Cacheable{TTLMs: 3_000, CacheScope: "private"}, Contents: []*mcp.ResourceContents{{URI: uri, MIMEType: "application/json", Text: string(data)}}}, nil
}

func resourceError(uri string, err error) error {
	if strings.Contains(err.Error(), "not found") {
		return mcp.ResourceNotFoundError(uri)
	}
	return err
}

func registerPrompts(server *mcp.Server) {
	server.AddPrompt(&mcp.Prompt{Name: "inspect_spec", Title: "Inspect a specification", Description: "Guide an agent through understanding a specification before changing it.", Arguments: []*mcp.PromptArgument{{Name: "specId", Required: true, Description: "The specification ID."}}}, prompt("Inspect specification {{specId}}. Read api-flow://specs/{{specId}}, identify flows and dependencies, and summarize proposed changes before writing."))
	server.AddPrompt(&mcp.Prompt{Name: "investigate_trace", Title: "Investigate a trace", Description: "Guide an agent through debugging a mock execution trace.", Arguments: []*mcp.PromptArgument{{Name: "traceId", Required: true, Description: "The trace ID."}}}, prompt("Investigate trace {{traceId}}. Read api-flow://traces/{{traceId}}, identify the first failed node or edge, then propose the smallest design correction."))
	server.AddPrompt(&mcp.Prompt{Name: "promote_release", Title: "Promote a snapshot", Description: "Guide an agent through making a snapshot into an immutable release.", Arguments: []*mcp.PromptArgument{{Name: "specId", Required: true, Description: "The specification ID."}}}, prompt("Inspect releases for {{specId}}, verify the published snapshot and draft intent, then call release_promote_snapshot with concise notes and confirm=true."))
}

func prompt(text string) mcp.PromptHandler {
	return func(_ context.Context, request *mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		for key, value := range request.Params.Arguments {
			text = strings.ReplaceAll(text, "{{"+key+"}}", value)
		}
		return &mcp.GetPromptResult{Messages: []*mcp.PromptMessage{{Role: mcp.Role("user"), Content: &mcp.TextContent{Text: text}}}}, nil
	}
}

type emptyInput struct{}
type specIDInput struct {
	SpecID string `json:"specId" jsonschema:"The API Flow specification ID."`
}
type importSpecInput struct {
	Name        string `json:"name,omitempty" jsonschema:"Optional display name."`
	ContextPath string `json:"contextPath,omitempty" jsonschema:"Mock HTTP context path, such as /payments."`
	OpenAPI     string `json:"openapi" jsonschema:"OpenAPI YAML or JSON source."`
	Confirm     bool   `json:"confirm" jsonschema:"Set true to import the specification."`
}
type tracingInput struct {
	SpecID  string `json:"specId"`
	Enabled bool   `json:"enabled"`
	Confirm bool   `json:"confirm" jsonschema:"Set true to apply this configuration change."`
}
type specUpdateInput struct {
	SpecID      string `json:"specId"`
	Name        string `json:"name,omitempty" jsonschema:"Optional replacement display name."`
	ContextPath string `json:"contextPath,omitempty" jsonschema:"Optional replacement mock HTTP context path."`
	OpenAPI     string `json:"openapi,omitempty" jsonschema:"Optional complete replacement OpenAPI YAML or JSON source. This changes the draft only."`
	Confirm     bool   `json:"confirm"`
}
type operationInput struct {
	SpecID      string `json:"specId"`
	OperationID string `json:"operationId" jsonschema:"The stable operation ID returned by operation_list, such as get:/widgets."`
}
type designScopeInput struct {
	SpecID   string `json:"specId,omitempty" jsonschema:"Required for specification-scoped assets."`
	ParentID string `json:"parentId,omitempty" jsonschema:"Required collection ID for documents or test plan ID for test requests."`
	ID       string `json:"id,omitempty" jsonschema:"The existing asset ID. Omit only when listing."`
}
type saveDesignScopeInput struct {
	SpecID   string         `json:"specId,omitempty" jsonschema:"Required for specification-scoped assets."`
	ParentID string         `json:"parentId,omitempty" jsonschema:"Required collection ID for documents or test plan ID for test requests."`
	ID       string         `json:"id,omitempty" jsonschema:"Existing asset ID to update. Omit to create a new asset."`
	Payload  map[string]any `json:"payload" jsonschema:"The complete asset JSON. Server-owned IDs, scope fields, and timestamps are ignored."`
	Confirm  bool           `json:"confirm"`
}
type deleteDesignScopeInput struct {
	SpecID   string `json:"specId,omitempty"`
	ParentID string `json:"parentId,omitempty"`
	ID       string `json:"id"`
	Confirm  bool   `json:"confirm"`
}
type releaseInput struct {
	SpecID  string `json:"specId"`
	Version int    `json:"version,omitempty"`
	Notes   string `json:"notes,omitempty"`
	Confirm bool   `json:"confirm"`
}
type sessionInput struct {
	SessionID string `json:"sessionId"`
	Confirm   bool   `json:"confirm"`
}
type traceInput struct {
	TraceID     string `json:"traceId,omitempty"`
	SpecID      string `json:"specId,omitempty"`
	OperationID string `json:"operationId,omitempty"`
	Confirm     bool   `json:"confirm"`
}

func registerTools(server *mcp.Server, workspace *service.Workspace) {
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true, DestructiveHint: boolPtr(false), OpenWorldHint: boolPtr(false)}
	write := &mcp.ToolAnnotations{ReadOnlyHint: false, DestructiveHint: boolPtr(false), OpenWorldHint: boolPtr(false)}
	destructive := &mcp.ToolAnnotations{ReadOnlyHint: false, DestructiveHint: boolPtr(true), OpenWorldHint: boolPtr(false)}

	mcp.AddTool(server, &mcp.Tool{Name: "workspace_overview", Description: "Get a compact workspace inventory before using narrower tools.", Annotations: readOnly}, func(context.Context, *mcp.CallToolRequest, emptyInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.Overview())
	})
	mcp.AddTool(server, &mcp.Tool{Name: "configuration_get", Description: "Read sanitized effective configuration. Configuration is read-only through MCP.", Annotations: readOnly}, func(context.Context, *mcp.CallToolRequest, emptyInput) (*mcp.CallToolResult, any, error) {
		return success(workspace.Configuration())
	})
	mcp.AddTool(server, &mcp.Tool{Name: "spec_list", Description: "List specifications with stable IDs and publication state.", Annotations: readOnly}, func(context.Context, *mcp.CallToolRequest, emptyInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.ListSpecs())
	})
	mcp.AddTool(server, &mcp.Tool{Name: "spec_get", Description: "Read a specification's OpenAPI source and draft design assets.", Annotations: readOnly}, func(_ context.Context, _ *mcp.CallToolRequest, input specIDInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.GetSpec(input.SpecID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "spec_import", Description: "Import an OpenAPI document and create its initial published release.", Annotations: write}, func(_ context.Context, _ *mcp.CallToolRequest, input importSpecInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(workspace.ImportSpec(input.Name, input.ContextPath, input.OpenAPI))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "spec_update", Description: "Update draft specification metadata and/or replace its OpenAPI source. This never publishes a release.", Annotations: write}, func(_ context.Context, _ *mcp.CallToolRequest, input specUpdateInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(workspace.UpdateSpec(input.SpecID, input.Name, input.ContextPath, input.OpenAPI))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "spec_set_tracing", Description: "Enable or disable trace capture for a specification.", Annotations: write}, func(_ context.Context, _ *mcp.CallToolRequest, input tracingInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(workspace.SetTracing(input.SpecID, input.Enabled))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "spec_delete", Description: "Permanently delete a specification and all stored assets.", Annotations: destructive}, func(_ context.Context, _ *mcp.CallToolRequest, input tracingInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(nil, workspace.DeleteSpec(input.SpecID))
	})

	mcp.AddTool(server, &mcp.Tool{Name: "operation_list", Description: "List every operation under one specification with stable IDs, methods, paths, summaries, flow state, and input hints. Call this before creating a flow or Test Ground request.", Annotations: readOnly}, func(_ context.Context, _ *mcp.CallToolRequest, input specIDInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.ListOperations(input.SpecID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "operation_get", Description: "Read one operation's method, path, metadata, flow state, and request input hints.", Annotations: readOnly}, func(_ context.Context, _ *mcp.CallToolRequest, input operationInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.GetOperation(input.SpecID, input.OperationID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "operation_response_examples_list", Description: "Extract response examples declared by one OpenAPI operation. Use these when creating response templates.", Annotations: readOnly}, func(_ context.Context, _ *mcp.CallToolRequest, input operationInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.ListResponseExamples(input.SpecID, input.OperationID))
	})
	registerDesignTools(server, workspace, readOnly, write, destructive, "flow", "flow", "operation flow", false)
	registerDesignTools(server, workspace, readOnly, write, destructive, "template", "template", "response template", true)
	registerDesignTools(server, workspace, readOnly, write, destructive, "script", "script", "specification-scoped Starlark script", true)
	registerDesignTools(server, workspace, readOnly, write, destructive, "collection", "collection", "specification-scoped collection", true)
	registerDesignTools(server, workspace, readOnly, write, destructive, "document", "collection_document", "document in a collection", true)
	registerDesignTools(server, workspace, readOnly, write, destructive, "test_plan", "test_plan", "global Test Ground plan", true)
	registerDesignTools(server, workspace, readOnly, write, destructive, "test_request", "test_request", "request in a Test Ground plan", true)

	mcp.AddTool(server, &mcp.Tool{Name: "release_list", Description: "List immutable releases and the current replaceable snapshot.", Annotations: readOnly}, func(_ context.Context, _ *mcp.CallToolRequest, input specIDInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.ListReleases(input.SpecID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "release_create", Description: "Validate the draft and create the next immutable versioned release without publishing it.", Annotations: write}, func(_ context.Context, _ *mcp.CallToolRequest, input releaseInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(workspace.CreateRelease(input.SpecID, input.Notes))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "release_publish_snapshot", Description: "Validate, replace, and publish the current draft as SNAPSHOT in one operation.", Annotations: write}, func(_ context.Context, _ *mcp.CallToolRequest, input releaseInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(workspace.PublishSnapshot(input.SpecID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "release_promote_snapshot", Description: "Convert the current snapshot to the next immutable versioned release with notes.", Annotations: write}, func(_ context.Context, _ *mcp.CallToolRequest, input releaseInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(workspace.PromoteSnapshot(input.SpecID, input.Notes))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "release_publish_version", Description: "Publish an existing immutable version, including rollback to an older version.", Annotations: write}, func(_ context.Context, _ *mcp.CallToolRequest, input releaseInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(workspace.PublishRelease(input.SpecID, input.Version))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "release_unpublish", Description: "Stop mock traffic for a specification.", Annotations: destructive}, func(_ context.Context, _ *mcp.CallToolRequest, input releaseInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(nil, workspace.Unpublish(input.SpecID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "release_delete", Description: "Delete an immutable release that is not published.", Annotations: destructive}, func(_ context.Context, _ *mcp.CallToolRequest, input releaseInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(nil, workspace.DeleteRelease(input.SpecID, input.Version))
	})

	mcp.AddTool(server, &mcp.Tool{Name: "session_list", Description: "List live short-lived data sessions.", Annotations: readOnly}, func(context.Context, *mcp.CallToolRequest, emptyInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.ListSessions())
	})
	mcp.AddTool(server, &mcp.Tool{Name: "session_get", Description: "Read an event-sourced data session.", Annotations: readOnly}, func(_ context.Context, _ *mcp.CallToolRequest, input sessionInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.GetSession(input.SessionID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "session_persist", Description: "Merge a session's effective data into collections and destroy the session.", Annotations: destructive}, func(_ context.Context, _ *mcp.CallToolRequest, input sessionInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(workspace.PersistSession(input.SessionID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "session_delete", Description: "Discard a session and its event history.", Annotations: destructive}, func(_ context.Context, _ *mcp.CallToolRequest, input sessionInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(nil, workspace.DeleteSession(input.SessionID))
	})

	mcp.AddTool(server, &mcp.Tool{Name: "trace_list", Description: "List recent traces, optionally filtered by specification or operation.", Annotations: readOnly}, func(_ context.Context, _ *mcp.CallToolRequest, input traceInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.ListTraces(input.SpecID, input.OperationID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "trace_get", Description: "Read a complete request execution trace.", Annotations: readOnly}, func(_ context.Context, _ *mcp.CallToolRequest, input traceInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.GetTrace(input.TraceID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "trace_delete", Description: "Permanently delete one trace.", Annotations: destructive}, func(_ context.Context, _ *mcp.CallToolRequest, input traceInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(nil, workspace.DeleteTrace(input.TraceID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: "trace_purge", Description: "Permanently delete all traces.", Annotations: destructive}, func(_ context.Context, _ *mcp.CallToolRequest, input traceInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(nil, workspace.DeleteAllTraces())
	})
}

func registerDesignTools(server *mcp.Server, workspace *service.Workspace, readOnly, write, destructive *mcp.ToolAnnotations, kind, prefix, asset string, canDelete bool) {
	mcp.AddTool(server, &mcp.Tool{Name: prefix + "_list", Description: "List " + asset + " assets in the selected scope.", Annotations: readOnly}, func(_ context.Context, _ *mcp.CallToolRequest, input designScopeInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.ListDesign(kind, input.SpecID, input.ParentID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: prefix + "_get", Description: "Read one " + asset + " by ID.", Annotations: readOnly}, func(_ context.Context, _ *mcp.CallToolRequest, input designScopeInput) (*mcp.CallToolResult, any, error) {
		return response(workspace.GetDesign(kind, input.SpecID, input.ParentID, input.ID))
	})
	mcp.AddTool(server, &mcp.Tool{Name: prefix + "_save", Description: "Create or update one " + asset + ". Omit id to create; provide id to update. The full replacement payload is required.", Annotations: write}, func(_ context.Context, _ *mcp.CallToolRequest, input saveDesignScopeInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(workspace.SaveDesign(kind, input.SpecID, input.ParentID, input.ID, input.Payload))
	})
	if !canDelete {
		return
	}
	mcp.AddTool(server, &mcp.Tool{Name: prefix + "_delete", Description: "Permanently delete one " + asset + " by ID.", Annotations: destructive}, func(_ context.Context, _ *mcp.CallToolRequest, input deleteDesignScopeInput) (*mcp.CallToolResult, any, error) {
		if result := confirmation(input.Confirm); result != nil {
			return result, nil, nil
		}
		return response(nil, workspace.DeleteDesign(kind, input.SpecID, input.ParentID, input.ID))
	})
}

func confirmation(confirmed bool) *mcp.CallToolResult {
	if confirmed {
		return nil
	}
	return &mcp.CallToolResult{IsError: true, Content: []mcp.Content{&mcp.TextContent{Text: `{"error":"confirmation_required","message":"Repeat this tool call with confirm=true after user approval."}`}}}
}

func success(value any) (*mcp.CallToolResult, any, error) { return nil, value, nil }
func response(value any, err error) (*mcp.CallToolResult, any, error) {
	if err != nil {
		return &mcp.CallToolResult{IsError: true, Content: []mcp.Content{&mcp.TextContent{Text: fmt.Sprintf(`{"error":%q}`, err.Error())}}}, nil, nil
	}
	return success(value)
}
func boolPtr(value bool) *bool { return &value }
