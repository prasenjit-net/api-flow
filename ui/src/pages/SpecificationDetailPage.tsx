import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Ban, ChevronLeft, GitBranch, CheckCircle2, FileJson, Activity, Play, Rocket, Trash2, X } from 'lucide-react'
import { collectionsApi, releasesApi, scriptsApi, specsApi, templatesApi } from '../services/api'
import MethodBadge from '../components/MethodBadge'
import type { ReleaseBundle } from '../types'
import { TemplatesPanel } from './TemplatesPage'
import { CollectionsPanel } from './CollectionsPage'
import { ScriptsPanel } from './ScriptsPage'

type SpecTab = 'operations' | 'releases' | 'templates' | 'scripts' | 'collections'
type ReleaseAction =
  | { type: 'publish'; release: ReleaseBundle }
  | { type: 'delete'; release: ReleaseBundle }
  | { type: 'unpublish' }
  | null

const specTabs: SpecTab[] = ['operations', 'releases', 'templates', 'scripts', 'collections']

function parseSpecTab(value: string | null): SpecTab {
  return specTabs.includes(value as SpecTab) ? value as SpecTab : 'operations'
}

function StatusPill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'blue' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  }
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

function ReleaseConfirmModal({
  action,
  specName,
  publishedVersion,
  publishedSnapshot,
  isPending,
  onCancel,
  onConfirm,
}: {
  action: ReleaseAction
  specName: string
  publishedVersion: number
  publishedSnapshot: boolean
  isPending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!action) return null

  const isRollback = action.type === 'publish' && !publishedSnapshot && publishedVersion > 0 && action.release.version < publishedVersion
  const title = action.type === 'delete'
    ? `Delete release v${action.release.version}?`
    : action.type === 'unpublish'
      ? `Unpublish ${specName}?`
      : isRollback
        ? `Roll back to v${action.release.version}?`
        : `Publish release v${action.release.version}?`
  const body = action.type === 'delete'
    ? 'This removes the saved release bundle from local storage. This cannot be undone.'
    : action.type === 'unpublish'
      ? 'Mock traffic will stop serving a published bundle for this specification until another release is published.'
      : isRollback
        ? `Mock traffic currently serves v${publishedVersion}. Publishing v${action.release.version} will make that older bundle live again.`
        : 'Mock traffic will start serving this release bundle immediately.'
  const confirmLabel = action.type === 'delete'
    ? isPending ? 'Deleting...' : 'Delete release'
    : action.type === 'unpublish'
      ? isPending ? 'Unpublishing...' : 'Unpublish'
      : isRollback
        ? isPending ? 'Rolling back...' : `Roll back to v${action.release.version}`
        : isPending ? 'Publishing...' : 'Publish release'
  const destructive = action.type === 'delete' || action.type === 'unpublish' || isRollback

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className={`rounded-full p-2 ${destructive ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{body}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${destructive ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SpecificationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<SpecTab>(() => parseSpecTab(searchParams.get('tab')))
  const [releaseNotes, setReleaseNotes] = useState('')
  const [releaseError, setReleaseError] = useState('')
  const [releaseAction, setReleaseAction] = useState<ReleaseAction>(null)

  const { data: spec, isLoading, error } = useQuery({
    queryKey: ['specs', id],
    queryFn: () => specsApi.get(id!),
    enabled: !!id,
  })
  const tracingMutation = useMutation({
    mutationFn: (enabled: boolean) => specsApi.setTracing(id!, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['specs', id] })
      qc.invalidateQueries({ queryKey: ['specs'] })
    },
  })
  const { data: releases = [], isLoading: releasesLoading } = useQuery({
    queryKey: ['releases', id],
    queryFn: () => releasesApi.list(id!),
    enabled: !!id,
  })
  const { data: templates = [] } = useQuery({
    queryKey: ['templates', id],
    queryFn: () => templatesApi.list(id!),
    enabled: !!id,
  })
  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts', id],
    queryFn: () => scriptsApi.list(id!),
    enabled: !!id,
  })
  const { data: collections = [] } = useQuery({
    queryKey: ['collections', id],
    queryFn: () => collectionsApi.list(id!),
    enabled: !!id,
  })
  const publishSnapshotMutation = useMutation({
    mutationFn: () => releasesApi.publishSnapshot(id!),
    onSuccess: () => {
      setReleaseError('')
      qc.invalidateQueries({ queryKey: ['releases', id] })
      qc.invalidateQueries({ queryKey: ['specs', id] })
      qc.invalidateQueries({ queryKey: ['specs'] })
    },
    onError: (error: Error) => setReleaseError(error.message),
  })
  const promoteSnapshotMutation = useMutation({
    mutationFn: () => releasesApi.promoteSnapshot(id!, releaseNotes),
    onSuccess: () => {
      setReleaseNotes('')
      setReleaseError('')
      qc.invalidateQueries({ queryKey: ['releases', id] })
      qc.invalidateQueries({ queryKey: ['specs', id] })
      qc.invalidateQueries({ queryKey: ['specs'] })
    },
    onError: (error: Error) => setReleaseError(error.message),
  })
  const publishMutation = useMutation({
    mutationFn: (version: number) => releasesApi.publish(id!, version),
    onSuccess: () => {
      setReleaseAction(null)
      qc.invalidateQueries({ queryKey: ['releases', id] })
      qc.invalidateQueries({ queryKey: ['specs', id] })
      qc.invalidateQueries({ queryKey: ['specs'] })
    },
    onError: (error: Error) => setReleaseError(error.message),
  })
  const deleteReleaseMutation = useMutation({
    mutationFn: (version: number) => releasesApi.delete(id!, version),
    onSuccess: () => {
      setReleaseAction(null)
      qc.invalidateQueries({ queryKey: ['releases', id] })
      qc.invalidateQueries({ queryKey: ['specs', id] })
      qc.invalidateQueries({ queryKey: ['specs'] })
    },
    onError: (error: Error) => setReleaseError(error.message),
  })
  const unpublishMutation = useMutation({
    mutationFn: () => releasesApi.unpublish(id!),
    onSuccess: () => {
      setReleaseAction(null)
      qc.invalidateQueries({ queryKey: ['releases', id] })
      qc.invalidateQueries({ queryKey: ['specs', id] })
      qc.invalidateQueries({ queryKey: ['specs'] })
    },
    onError: (error: Error) => setReleaseError(error.message),
  })

  useEffect(() => {
    setActiveTab(parseSpecTab(searchParams.get('tab')))
  }, [searchParams])

  if (isLoading) return <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
  if (error || !spec) return <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load specification.</div>

  const isMutatingRelease = publishSnapshotMutation.isPending || promoteSnapshotMutation.isPending || publishMutation.isPending || deleteReleaseMutation.isPending || unpublishMutation.isPending
  const canPublishSnapshot = spec.draftDirty && !isMutatingRelease
  const publishedRelease = releases.find(release => release.published)
  const snapshot = releases.find(release => release.snapshot)
  const tabs: Array<{ id: SpecTab; label: string; count?: number }> = [
    { id: 'operations', label: 'Operations', count: spec.operations.length },
    { id: 'releases', label: 'Releases', count: releases.filter(release => !release.snapshot).length },
    { id: 'templates', label: 'Templates', count: templates.length },
    { id: 'scripts', label: 'Scripts', count: scripts.length },
    { id: 'collections', label: 'Collections', count: collections.length },
  ]
  const selectTab = (tab: SpecTab) => {
    setActiveTab(tab)
    setSearchParams(tab === 'operations' ? {} : { tab })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/specifications"
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Specifications
              </Link>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <FileJson className="h-4 w-4 text-slate-400" />
              <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{spec.name}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill>{spec.operations.length} operations</StatusPill>
              <code className="max-w-full truncate font-mono text-xs text-slate-400">{spec.contextPath}</code>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => tracingMutation.mutate(!spec.tracingEnabled)}
              disabled={tracingMutation.isPending}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                spec.tracingEnabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Tracing {spec.tracingEnabled ? 'on' : 'off'}
            </button>
          </div>
        </div>
      </div>

      <section className="shrink-0 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="mr-auto min-w-0">
            <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Release and traffic</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {publishedRelease ? `Mock traffic serves ${publishedRelease.snapshot ? 'SNAPSHOT' : `v${publishedRelease.version}`}` : 'No release is serving mock traffic'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill tone={spec.publishedVersion > 0 || spec.publishedSnapshot ? 'emerald' : 'slate'}>
              Published {spec.publishedSnapshot ? 'SNAPSHOT' : spec.publishedVersion > 0 ? `v${spec.publishedVersion}` : 'none'}
            </StatusPill>
            <StatusPill tone={spec.latestVersion > 0 ? 'blue' : 'slate'}>
              Latest {spec.latestVersion > 0 ? `v${spec.latestVersion}` : 'none'}
            </StatusPill>
            <StatusPill tone={spec.draftDirty ? 'amber' : 'slate'}>
              Draft {spec.draftDirty ? 'needs release' : 'current'}
            </StatusPill>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => publishSnapshotMutation.mutate()}
              disabled={!canPublishSnapshot}
              className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={spec.draftDirty ? 'Create and publish a replaceable snapshot from the current draft' : 'No unreleased draft changes'}
            >
              <Rocket className="h-3.5 w-3.5" />
              {publishSnapshotMutation.isPending ? 'Publishing...' : 'Publish snapshot'}
            </button>
            {(spec.publishedVersion > 0 || spec.publishedSnapshot) && (
              <button
                type="button"
                onClick={() => setReleaseAction({ type: 'unpublish' })}
                disabled={isMutatingRelease}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-950/30"
              >
                <Ban className="h-3.5 w-3.5" />
                Unpublish
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="shrink-0 border-b border-slate-200 px-4 py-2 dark:border-slate-800 sm:px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && <span className="text-[10px] opacity-70">{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'releases' && (
          <div className="p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Releases</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Promote the current snapshot to preserve it as an immutable versioned release.</p>
              </div>
              {snapshot && (
              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                <input
                  value={releaseNotes}
                  onChange={event => setReleaseNotes(event.target.value)}
                  placeholder="Versioned release notes"
                  disabled={isMutatingRelease}
                  className="min-w-0 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:w-72"
                />
                <button
                  type="button"
                  onClick={() => promoteSnapshotMutation.mutate()}
                  disabled={isMutatingRelease}
                  className="inline-flex items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Convert the current snapshot into an immutable release"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  {promoteSnapshotMutation.isPending ? 'Converting...' : `Create v${spec.latestVersion + 1}`}
                </button>
              </div>
              )}
            </div>
            {releaseError && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{releaseError}</div>}
            {!snapshot && (
              <div className="mb-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                Publish a snapshot from the spec overview before creating a versioned release.
              </div>
            )}
            {releasesLoading ? (
              <div className="py-3 text-xs text-slate-400">Loading releases...</div>
            ) : releases.length === 0 ? (
              <div className="py-3 text-xs text-slate-400">No releases yet.</div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {releases.map(release => {
                  const isRollback = !spec.publishedSnapshot && spec.publishedVersion > 0 && !release.snapshot && release.version < spec.publishedVersion
                  return (
                    <div key={release.version} className="grid gap-3 px-3 py-3 sm:grid-cols-[80px_1fr_170px_220px] sm:items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{release.snapshot ? 'SNAPSHOT' : `v${release.version}`}</span>
                        {release.published && <StatusPill tone="emerald">Published</StatusPill>}
                      </div>
                      <span className="min-w-0 text-xs text-slate-500 dark:text-slate-400 sm:truncate">{release.snapshot ? 'Replaceable draft release' : release.notes || 'No notes'}</span>
                      <span className="text-xs text-slate-400">{new Date(release.createdAt).toLocaleString()}</span>
                      <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                        {release.snapshot ? null : !release.published ? (
                          <button
                            type="button"
                            onClick={() => setReleaseAction({ type: 'publish', release })}
                            disabled={isMutatingRelease}
                            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            {isRollback ? `Roll back to v${release.version}` : 'Publish'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setReleaseAction({ type: 'unpublish' })}
                            disabled={isMutatingRelease}
                            className="inline-flex items-center gap-1 rounded border border-amber-200 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-950/30"
                          >
                            <X className="h-3 w-3" />
                            Unpublish
                          </button>
                        )}
                        {!release.snapshot && <button
                          type="button"
                          disabled={release.published || isMutatingRelease}
                          onClick={() => setReleaseAction({ type: 'delete', release })}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/30"
                          title="Delete release"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'operations' && spec.operations.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            No operations found in this spec.
          </div>
        ) : activeTab === 'operations' ? (
          <div>
            <div className="hidden grid-cols-[80px_1fr_1fr_220px] items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900 md:grid">
              <span>Method</span>
              <span>Path</span>
              <span>Summary</span>
              <span>Actions</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {spec.operations.map(op => (
                <div
                  key={op.id}
                  className="grid gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 md:grid-cols-[80px_1fr_1fr_220px] md:items-center md:gap-4 md:px-6"
                >
                  <div><MethodBadge method={op.method} /></div>
                  <code className="break-all font-mono text-xs text-slate-700 dark:text-slate-300">{op.path}</code>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{op.summary || '-'}</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      to={`/test-ground?specId=${id}&operationId=${op.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      <Play className="h-3.5 w-3.5" /> Test
                    </Link>
                    <Link
                      to={`/specifications/${id}/operations/${op.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium"
                    >
                      {op.hasFlow ? (
                        <span className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Edit flow
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
                          <GitBranch className="h-3.5 w-3.5" /> Create flow
                        </span>
                      )}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'templates' && id && <TemplatesPanel specId={id} spec={spec} showHeader={false} />}
        {activeTab === 'scripts' && id && <ScriptsPanel specId={id} showHeader={false} />}
        {activeTab === 'collections' && id && <CollectionsPanel specId={id} showHeader={false} />}
      </div>

      <ReleaseConfirmModal
        action={releaseAction}
        specName={spec.name}
        publishedVersion={spec.publishedVersion}
        publishedSnapshot={spec.publishedSnapshot}
        isPending={publishMutation.isPending || deleteReleaseMutation.isPending || unpublishMutation.isPending}
        onCancel={() => setReleaseAction(null)}
        onConfirm={() => {
          if (!releaseAction) return
          setReleaseError('')
          if (releaseAction.type === 'publish') publishMutation.mutate(releaseAction.release.version)
          if (releaseAction.type === 'delete') deleteReleaseMutation.mutate(releaseAction.release.version)
          if (releaseAction.type === 'unpublish') unpublishMutation.mutate()
        }}
      />
    </div>
  )
}
