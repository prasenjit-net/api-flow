import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, GitBranch, CheckCircle2, FileCode, FileJson, Activity } from 'lucide-react'
import { specsApi } from '../services/api'
import MethodBadge from '../components/MethodBadge'

export default function SpecificationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()

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
          to={`/templates/${id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-900/50 dark:text-violet-300 dark:hover:bg-violet-950/30"
        >
          <FileCode className="h-3.5 w-3.5" />
          Templates
        </Link>
      </div>

      {/* Operations table */}
      <div className="flex-1 overflow-y-auto">
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
