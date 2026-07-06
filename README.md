# API Flow

API flow visualization and management tool — a full-stack application with:

- Go backend at the repository root
- React + Vite frontend in `ui/`
- Embedded production UI served directly from the Go binary
- Cobra CLI, Viper config, `.env` support, and a Tailwind-based UI shell

App repository: `https://github.com/prasenjit-net/api-flow`

## What You Get

- `serve`, `init`, and `version` CLI commands
- `chi`-based API routing under `/api`
- Endpoints at `/api/health`, `/api/example`, and `/api/meta`
- Embedded React build via Go `embed`
- Development mode with Vite proxy support
- Structured logging with `slog`

## Folder Structure

```text
.
├── cmd/
│   └── app/
├── internal/
│   ├── api/
│   ├── config/
│   ├── logging/
│   ├── server/
│   └── version/
├── ui/
│   ├── dist/
│   ├── public/
│   └── src/
├── .env.example
├── config.yaml
├── main.go
├── ui_embed.go
├── Makefile
└── README.md
```

## Development Workflow

### Prerequisites

- Go 1.23+
- Node.js 20+
- npm

### Initial Setup

```bash
cp .env.example .env
make install-deps
make dev-all
```

Open:

- UI: `http://localhost:8080`
- API: `http://localhost:8080/api`
- Health: `http://localhost:8080/api/health`

### Common Commands

```bash
make dev        # backend only, proxies UI requests to Vite when APP_UI_DEV_PROXY_URL is set
make dev-ui     # Vite dev server on :5173
make dev-all    # backend + Vite together
make build      # build UI, embed it, compile one binary
make run        # build and run the production binary
make test       # run Go tests
make lint       # go vet
make lint-ui    # eslint for the React app
```

## Production Build

```bash
make build
./build/api-flow serve
```

The binary contains the compiled React app. No separate Node.js server is required in production.

## Node Execution Contract

All current and future executable node types use mapped-only input by default:

- A node receives only variables explicitly configured in its input mappings.
- A node returns an output value; the workflow engine appends it at `nodes.<node-name>`.
- Node implementations do not receive or mutate the full execution context.
- Start and End are structural nodes and do not execute user data.

Template is the only full-context exception. It receives the complete `request` and accumulated `nodes` context. Existing Template mappings are retained as root-level aliases for compatibility.

Starlark nodes link to globally managed scripts and remain mapped-only. A script must define:

```python
def run(input):
    return {"value": input.get("value")}
```

Starlark scripts have no filesystem, network, process, environment, or module-loading access. Their JSON-compatible return value is appended to context under the node name.

## Configuration

Configuration is loaded in this order:

1. defaults from the Go config package
2. `config.yaml`
3. `.env` and `.env.local`
4. environment variables prefixed with `APP_`
5. CLI flags

Example environment overrides:

```bash
APP_SERVER_PORT=9090
APP_LOGGING_LEVEL=debug
APP_UI_DEV_PROXY_URL=http://localhost:5173
```

## How Embedding Works

1. The frontend lives in `ui/`.
2. `npm run build` writes the production bundle to `ui/dist`.
3. `ui_embed.go` embeds `ui/dist` into the Go binary.
4. The server mounts API routes under `/api` and serves the React SPA for every other route.

That gives you one deployment artifact: the compiled Go executable.
