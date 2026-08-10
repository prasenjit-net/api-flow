# API Flow MCP Server

API Flow exposes its workspace as a Model Context Protocol server using the
official Go SDK and the MCP `2026-07-28` protocol.

## Local stdio

Use the same project configuration and data directory as the UI/server:

```json
{
  "mcpServers": {
    "api-flow": {
      "command": "api-flow",
      "args": ["mcp"],
      "cwd": "/path/to/api-flow-project"
    }
  }
}
```

The stdio server writes protocol messages only to stdout. Diagnostics continue
to use stderr. Local process permissions are the authentication boundary.

## Streamable HTTP

HTTP is disabled by default. To expose `/mcp`, configure a bearer token:

```yaml
mcp:
  http:
    enabled: true
    bearerToken: replace-with-a-long-random-secret
```

The endpoint requires `Authorization: Bearer <token>`, rejects cross-origin
browser requests, uses stateless Streamable HTTP, and limits request bodies to
4 MiB. Place it behind TLS and an identity-aware proxy in production.

## Agent workflow

Start with `workspace_overview` and `spec_list`. Call `operation_list` with a
specification ID before creating a flow, template, or Test Ground request: it
returns stable operation IDs, methods, paths, request input hints, and whether
a flow already exists. Read tools are annotated read-only. Every write or
destructive tool requires `confirm: true`; this prevents an agent from
accidentally publishing, persisting session data, or deleting history.

Every design component has its own tools rather than an ambiguous type
selector. `*_save` creates when `id` is omitted and replaces an existing asset
when `id` is provided. Results include structured JSON, while resources provide
larger documents only when an agent asks for them.

## Tool groups

- Workspace and configuration: `workspace_overview`, `configuration_get`
- Specifications: `spec_list`, `spec_get`, `spec_import`, `spec_update`, `spec_set_tracing`, `spec_delete`
- Operations: `operation_list`, `operation_get`, `operation_response_examples_list`
- Flows: `flow_list`, `flow_get`, `flow_save`
- Templates: `template_list`, `template_get`, `template_save`, `template_delete`
- Scripts: `script_list`, `script_get`, `script_save`, `script_delete`
- Collections: `collection_list`, `collection_get`, `collection_save`, `collection_delete`
- Collection documents: `collection_document_list`, `collection_document_get`, `collection_document_save`, `collection_document_delete`
- Test Ground: `test_plan_list`, `test_plan_get`, `test_plan_save`, `test_plan_delete`, `test_request_list`, `test_request_get`, `test_request_save`, `test_request_delete`
- Releases: `release_list`, `release_create`, `release_publish_snapshot`, `release_promote_snapshot`, `release_publish_version`, `release_unpublish`, `release_delete`
- Sessions: `session_list`, `session_get`, `session_persist`, `session_delete`
- Traces: `trace_list`, `trace_get`, `trace_delete`, `trace_purge`

The server also provides `inspect_spec`, `investigate_trace`, and
`promote_release` prompts.
