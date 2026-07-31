# Plan: Draft / Release / Publish for Specifications

Change management for uploaded specifications: intermediate edits are invisible to
the mock runtime until they are released as a new version and that version is
published. Publishing any existing version doubles as rollback.

## Why this is needed

Today a spec lives in `data/specs/<id>/` as one mutable working copy. The registry
fetches the flow from the store on every incoming mock request
(`internal/registry/registry.go`, `TryServe`), and the executor resolves templates,
scripts, and the spec file live (`internal/executor/executor.go`). Every flow or
template save in the editor changes runtime behavior instantly.

## Core model

- The editor always works on a mutable **draft**. The runtime never reads the draft.
- **Create release** = validate the draft, then snapshot it as an immutable,
  auto-numbered single-file bundle (v1, v2, …) with optional release notes.
- **Publish** = point the spec's live pointer at any existing release. The mock
  runtime (registry + executor) serves exclusively from the published bundle.

## Key design decisions

1. **Single-file immutable releases.** Each release is one JSON bundle, not a
   directory tree. The store needs no version-scoped variants of its read methods,
   and the registry loads the published bundle once and serves from memory — zero
   disk reads on the mock hot path.
2. **Collections are spec-scoped.** Collections move from global
   `data/collections/` into the spec, so a release bundle fully describes the
   spec's behavior. Collection **definitions** are snapshot into the bundle;
   collection **documents** are runtime data mutated by Data Mapper nodes and stay
   in mutable spec-scoped storage shared by the draft and all releases.
3. **Scripts are frozen into bundles.** Scripts are globally editable behavior, so
   without snapshotting them a script edit would silently change published
   behavior. Consequence: fixing a script bug requires re-releasing each spec that
   uses it — correct for change management, but it replaces the current
   "edit script, instantly live" workflow.
4. **Integer versions** (v1, v2, …), auto-assigned. Release notes carry meaning.
5. **Auto-create and publish v1** on upload and on startup migration, preserving
   the current "upload and it's immediately mockable" UX. The gate applies to
   *changes*, not first upload.

## Phase 1 — Storage layout, domain, migration

New per-spec layout:

```
data/specs/<id>/
  meta.json                  # + publishedVersion, latestVersion
  draft/
    spec.raw  flows/  templates/  collections/<cid>/meta.json
  collections/<cid>/documents/    # live runtime data, NOT versioned
  releases/
    v1.json  v2.json  ...         # one immutable bundle per release
```

- `internal/domain/spec.go`: `SpecMeta` gains `PublishedVersion int` (0 = none)
  and `LatestVersion int`. New bundle type:

```go
type ReleaseBundle struct {
    SpecID      string
    Version     int
    Notes       string
    CreatedAt   time.Time
    ContentHash string       // draft hash at release time, for dirty detection
    SpecRaw     []byte       // base64-encoded in JSON
    Flows       []Flow
    Templates   []Template
    Scripts     []Script     // scripts referenced by the flows, frozen
    Collections []Collection // definitions only, documents stay live
}
```

- `internal/store/store.go`: existing content methods keep their draft semantics
  (they read/write `draft/` now). Collection and document methods gain a `specID`
  parameter. New methods: `CreateRelease(specID, notes) (ReleaseBundle, error)`,
  `ListReleases(specID)`, `GetRelease(specID, version)`,
  `DeleteRelease(specID, version)`, `SetPublishedVersion(specID, version)`.
- `internal/store/filestore.go`: `CreateRelease` assembles the bundle from the
  draft (resolving referenced scripts from the global script store into the
  bundle) and writes `v<n>.json` — a single atomic write is the whole commit.
- **Startup migration**, following the existing `migrateGlobalTemplates`
  precedent in `internal/store/filestore.go`, in order:
  1. Move legacy `spec.raw` / `flows/` / `templates/` into `draft/`.
  2. Assign global collections to specs by scanning Data Mapper node references
     in flows: copy the definition into `draft/collections/`, move documents into
     the spec's live `collections/` dir, back up originals. A collection
     referenced by two specs gets duplicated into both (flag in the summary log).
  3. Auto-create **and publish v1** per spec, so existing mocks keep working with
     zero behavior change after upgrade.

## Phase 2 — Runtime serves the published bundle from memory

- `internal/registry/registry.go`: `Register(meta, bundle)` compiles routes from
  the bundle's spec document and keeps the `*ReleaseBundle` in an in-memory map
  keyed by spec ID. `TryServe` pulls the flow straight from the cached bundle —
  the per-request `store.GetFlow` call goes away. Specs with
  `publishedVersion == 0` register nothing (mock traffic 404s). `LoadFromStore`
  loads each spec's published bundle.
- `internal/executor/executor.go`: `Execute` receives the bundle and resolves
  templates and scripts from it in memory, replacing the live `GetScript`,
  `GetTemplate`, and `GetSpecFile` lookups. `internal/executor/datamapper.go`
  validates the collection against the bundle's definitions but reads/writes
  documents through the store with `flow.SpecID`. Traces record the release
  version that served the request.
- Publishing re-registers the spec from the new bundle; draft saves no longer
  touch the registry at all.

## Phase 3 — API

New `internal/api/releases.go`, wired in `internal/api/router.go`:

```
GET    /api/specs/{id}/releases                    list versions (+ published flag)
POST   /api/specs/{id}/releases                    {notes} → validate draft, snapshot vN
POST   /api/specs/{id}/releases/{version}/publish  point traffic at vN (any version)
POST   /api/specs/{id}/unpublish                   stop serving
DELETE /api/specs/{id}/releases/{version}          rejected if currently published
```

- Release creation runs flow validation (`internal/domain/flow_validation.go`)
  plus referential checks — every `templateId`, `scriptId`, and `collectionId` in
  the draft must resolve — returning 422 with per-flow errors otherwise.
- Collections routes move from `/api/collections/...` to
  `/api/specs/{id}/collections/...` in `internal/api/collections.go` (handlers
  gain the spec ID from the URL and a spec-existence check).
- Spec list/detail responses gain `publishedVersion`, `latestVersion`, and a
  computed `draftDirty` (draft hash ≠ latest bundle's `ContentHash`).
- Upload (`internal/api/specs.go`) writes to `draft/` then auto-creates and
  publishes v1.
- Deleting a draft collection that the *published* bundle still references
  returns 409 — otherwise it would orphan the documents the live release serves.

## Phase 4 — UI

- `ui/src/services/api.ts`: release types and calls; `collectionsApi` reworked to
  take a `specId`.
- `ui/src/pages/SpecificationDetailPage.tsx`: Releases section — version table
  (notes, date, Published badge, Publish/Delete per row), "Create release" with
  notes field; header shows `Published: v3` plus an "unreleased changes" chip
  when `draftDirty`.
- `ui/src/pages/CollectionsPage.tsx` / `CollectionDocumentsPage.tsx`: move under
  the spec's navigation context (same pattern as templates), with route and nav
  updates in `ui/src/App.tsx`.
- `ui/src/pages/SpecificationsPage.tsx`: published-version column and dirty
  indicator per spec.
- `ui/src/pages/FlowEditorPage.tsx` / `TemplatesPage.tsx`: banner — "Editing
  draft; changes go live after release & publish."

## Phase 5 — Tests

- Store: legacy-layout migration (including collection assignment), bundle
  immutability (edit draft/scripts after release → published bundle unchanged),
  publish pointer, refusal to delete the published version.
- Registry/executor: the core behavioral test — edit a draft flow, mock endpoint
  still serves old behavior; release + publish, new behavior; republish v1,
  rollback. Plus Data Mapper reading/writing spec-scoped documents.
- Handlers: release CRUD, 422 on invalid draft, collections under the new
  spec-scoped routes, 409 on deleting a published-referenced collection.

## Build order

Phases 1–2 together (one coherent change to storage + runtime), then 3, then
4/5. Phases 1–2 are the bulk of the work; the rest is mostly plumbing.
