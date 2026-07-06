import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, Eye, Trash2 } from 'lucide-react'
import MethodBadge from '../components/MethodBadge'
import { specsApi, tracesApi } from '../services/api'
import type { TraceSummary } from '../types'
import { useState } from 'react'

type DeleteTarget = { type: 'one'; trace: TraceSummary } | { type: 'all' } | null

function DeleteTraceModal({
  target,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  target: DeleteTarget
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!target) return null
  const isAll = target.type === 'all'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-50 p-2 text-red-500 dark:bg-red-950/40">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {isAll ? 'Delete all traces?' : 'Delete this trace?'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {isAll
                ? 'This removes every saved trace from the local store. This cannot be undone.'
                : `This removes trace ${target.trace.id}. This cannot be undone.`}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isDeleting} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {isDeleting ? 'Deleting…' : isAll ? 'Delete all traces' : 'Delete trace'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TracesPage() {
  const qc = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const { data: traces = [], isLoading, error } = useQuery({
    queryKey: ['traces'],
    queryFn: () => tracesApi.list(),
  })
  const { data: specs = [] } = useQuery({
    queryKey: ['specs'],
    queryFn: specsApi.list,
  })
  const specNames = new Map(specs.map(spec => [spec.id, spec.name]))

  const deleteOneMutation = useMutation({
    mutationFn: tracesApi.delete,
    onSuccess: () => {
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['traces'] })
    },
  })
  const deleteAllMutation = useMutation({
    mutationFn: tracesApi.deleteAll,
    onSuccess: () => {
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['traces'] })
    },
  })

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Traces</span>
            {!isLoading && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{traces.length}</span>}
          </div>
          <button
            type="button"
            onClick={() => setDeleteTarget({ type: 'all' })}
            disabled={traces.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete all
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
          ) : error ? (
            <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load traces.</div>
          ) : traces.length === 0 ? (
            <div className="flex h-60 flex-col items-center justify-center gap-3">
              <Activity className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500">No traces captured yet</p>
              <p className="max-w-md text-center text-xs text-slate-400">Enable tracing on a specification, send a request through a saved flow, and the execution trace will appear here.</p>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-[120px_1fr_1fr_100px_100px_150px_auto] items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                <span>Method</span>
                <span>Spec</span>
                <span>Operation</span>
                <span>Status</span>
                <span>Duration</span>
                <span>Started</span>
                <span />
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {traces.map(trace => (
                  <div key={trace.id} className="grid grid-cols-[120px_1fr_1fr_100px_100px_150px_auto] items-center gap-4 px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <div className="flex items-center gap-2">
                      <MethodBadge method={trace.method} />
                    </div>
                    <span className="truncate text-xs text-slate-600 dark:text-slate-300">{specNames.get(trace.specId) ?? trace.specId}</span>
                    <span className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">{trace.operationId}</span>
                    <span className={`text-xs font-semibold ${trace.error || trace.statusCode >= 500 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {trace.statusCode || '—'}
                    </span>
                    <span className="text-xs text-slate-500">{trace.durationMs} ms</span>
                    <span className="text-xs text-slate-400">{new Date(trace.startedAt).toLocaleString()}</span>
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/traces/${trace.id}`} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800">
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                      <button type="button" onClick={() => setDeleteTarget({ type: 'one', trace })} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <DeleteTraceModal
        target={deleteTarget}
        isDeleting={deleteOneMutation.isPending || deleteAllMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return
          if (deleteTarget.type === 'all') deleteAllMutation.mutate()
          else deleteOneMutation.mutate(deleteTarget.trace.id)
        }}
      />
    </>
  )
}
