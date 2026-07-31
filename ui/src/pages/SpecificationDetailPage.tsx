import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, GitBranch, CheckCircle2, FileCode, FileJson, Activity, Database, Rocket, Trash2 } from 'lucide-react'
import { releasesApi, specsApi } from '../services/api'
import MethodBadge from '../components/MethodBadge'

export default function SpecificationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [releaseNotes, setReleaseNotes] = useState('')
  const [releaseError, setReleaseError] = useState('')

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
  const createReleaseMutation = useMutation({
    mutationFn: () => releasesApi.create(id!, releaseNotes),
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
      qc.invalidateQueries({ queryKey: ['releases', id] })
      qc.invalidateQueries({ queryKey: ['specs', id] })
      qc.invalidateQueries({ queryKey: ['specs'] })
    },
    onError: (error: Error) => setReleaseError(error.message),
  })
  const deleteReleaseMutation = useMutation({
    mutationFn: (version: number) => releasesApi.delete(id!, version),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['releases', id] })
      qc.invalidateQueries({ queryKey: ['specs', id] })
      qc.invalidateQueries({ queryKey: ['specs'] })
    },
    onError: (error: Error) => setReleaseError(error.message),
  })

  if (isLoading) return <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
  if (error || !spec) return <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load specification.</div>

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 px-6 dark:border-slate-800">
        <Link
          to="/specifications"
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Specifications
        </Link>
        <span className="text-slate-300 dark:text-slate-700">/</span>
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{spec.name}</span>
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {spec.operations.length} operations
        </span>
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          Published: {spec.publishedVersion > 0 ? `v${spec.publishedVersion}` : 'none'}
        </span>
        {spec.draftDirty && (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            unreleased changes
          </span>
        )}
        <code className="ml-1 font-mono text-xs text-slate-400">{spec.contextPath}</code>
        <button
          type="button"
          onClick={() => tracingMutation.mutate(!spec.tracingEnabled)}
          disabled={tracingMutation.isPending}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            spec.tracingEnabled
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          Tracing {spec.tracingEnabled ? 'on' : 'off'}
        </button>
        <Link
          to={`/specifications/${id}/collections`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
        >
          <Database className="h-3.5 w-3.5" />
          Collections
        </Link>
        <Link
          to={`/templates/${id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-900/50 dark:text-violet-300 dark:hover:bg-violet-950/30"
        >
          <FileCode className="h-3.5 w-3.5" />
          Templates
        </Link>
      </div>

      {/* Operations table */}
      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Releases</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Mock traffic serves the published release bundle.</p>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <input
                value={releaseNotes}
                onChange={event => setReleaseNotes(event.target.value)}
                placeholder="Release notes"
                className="w-64 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
              <button
                type="button"
                onClick={() => createReleaseMutation.mutate()}
                disabled={createReleaseMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Rocket className="h-3.5 w-3.5" />
                {createReleaseMutation.isPending ? 'Creating…' : 'Create release'}
              </button>
            </div>
          </div>
          {releaseError && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{releaseError}</div>}
          {releasesLoading ? (
            <div className="py-3 text-xs text-slate-400">Loading releases…</div>
          ) : releases.length === 0 ? (
            <div className="py-3 text-xs text-slate-400">No releases yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {releases.map(release => (
                <div key={release.version} className="grid grid-cols-[80px_1fr_160px_180px] items-center gap-3 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">v{release.version}</span>
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">{release.notes || 'No notes'}</span>
                  <span className="text-xs text-slate-400">{new Date(release.createdAt).toLocaleString()}</span>
                  <div className="flex justify-end gap-2">
                    {release.published ? (
                      <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Published</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => publishMutation.mutate(release.version)}
                        className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Publish
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={release.published}
                      onClick={() => { if (confirm(`Delete release v${release.version}?`)) deleteReleaseMutation.mutate(release.version) }}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/30"
                      title="Delete release"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {spec.operations.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            No operations found in this spec.
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[80px_1fr_1fr_160px] items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900">
              <span>Method</span>
              <span>Path</span>
              <span>Summary</span>
              <span>Flow</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {spec.operations.map(op => (
                <div
                  key={op.id}
                  className="grid grid-cols-[80px_1fr_1fr_160px] items-center gap-4 px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                >
                  <MethodBadge method={op.method} />
                  <code className="font-mono text-xs text-slate-700 dark:text-slate-300">{op.path}</code>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{op.summary || '—'}</span>
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
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
