# Repository Guidelines

## Project Shape

- This is a Go CLI/server application with a React + Vite frontend in `ui/`.
- The production frontend is embedded into the Go binary from `ui/dist` via `ui_embed.go`.
- Backend packages live under `cmd/` and `internal/`; keep new Go code inside the existing package boundaries unless a new package is clearly warranted.
- Runtime data and local config files are not part of the source contract. Avoid committing local state from `data/`, `.env`, or generated build outputs unless explicitly requested.

## Backend

- Use Go module `github.com/prasenjit-net/api-flow`.
- Format Go changes with `gofmt`/`go fmt`; prefer the existing stdlib-first style.
- Keep API handlers in `internal/api`, domain models and validation in `internal/domain`, execution behavior in `internal/executor`, persistence in `internal/store`, and CLI commands in `cmd/app`.
- Add or update focused Go tests near the package being changed.
- Starlark execution is intentionally sandboxed. Do not add filesystem, network, process, environment, or module-loading access to scripts without an explicit product decision.
- Preserve the node execution contract: non-template executable nodes receive mapped-only inputs and append their returned value under `nodes.<node-name>`.

## Frontend

- The UI is in `ui/` and uses React 18, TypeScript, Vite, Tailwind, React Query, React Router, Monaco, XYFlow, and lucide-react.
- Keep route-level views in `ui/src/pages`, shared UI in `ui/src/components`, API calls in `ui/src/services/api.ts`, and shared types in `ui/src/types`.
- Use existing Tailwind and component patterns before introducing new styling systems or abstractions.
- Prefer lucide-react icons for icon buttons and commands.
- Keep flow-editor changes compatible with the backend domain and executor contracts.

## Build And Test Commands

- Install dependencies: `make install-deps`
- Backend development server: `make dev`
- Frontend development server: `make dev-ui`
- Backend and frontend together: `make dev-all`
- Build production UI and Go binary: `make build`
- Build only the UI: `make build-ui`
- Build only the Go binary after `ui/dist` exists: `make build-go`
- Run Go tests: `make test`
- Run Go vet: `make lint`
- Run frontend lint: `make lint-ui`

CI builds the UI before running `go vet` and `go test` because `go:embed` requires `ui/dist` to exist.

## Verification Expectations

- For backend changes, run `make test` and `make lint` when practical.
- For frontend changes, run `npm run build --prefix ui` or `make build-ui`, plus `make lint-ui` when practical.
- For full-stack or embed-related changes, run `make build`.
- If a verification command cannot be run, state the reason in the final response.

## Editing Notes

- Do not commit dependency lockfile churn unless dependencies actually changed.
- Do not hand-edit generated files in `ui/dist`; change source files under `ui/src` and rebuild when needed.
- Keep changes scoped. Avoid unrelated refactors while fixing bugs or adding requested behavior.
- Maintain compatibility with config loading order documented in `README.md`: defaults, `config.yaml`, `.env`/`.env.local`, `APP_` environment variables, then CLI flags.
