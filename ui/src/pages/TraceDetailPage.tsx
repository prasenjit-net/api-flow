import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, ChevronLeft, Clock, Database, GitBranch, Server } from 'lucide-react'
import MethodBadge from '../components/MethodBadge'
import { tracesApi } from '../services/api'

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  )
}

function DetailCard({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
      </div>
      {children}
    </section>
  )
}

export default function TraceDetailPage() {
  const { traceId } = useParams<{ traceId: string }>()
  const { data: trace, isLoading, error } = useQuery({
    queryKey: ['traces', traceId],
    queryFn: () => tracesApi.get(traceId!),
    enabled: !!traceId,
  })

  if (isLoading) return <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
  if (error || !trace) return <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load trace.</div>

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 px-6 dark:border-slate-800">
        <Link to="/traces" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">
          <ChevronLeft className="h-3.5 w-3.5" /> Traces
        </Link>
        <span className="text-slate-300 dark:text-slate-700">/</span>
        <Activity className="h-4 w-4 text-slate-400" />
        <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">{trace.id}</span>
        <MethodBadge method={trace.method} />
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${trace.error || trace.statusCode >= 500 ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>
          {trace.statusCode || '—'}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" /> {trace.durationMs} ms
        </span>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50/70 p-6 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl space-y-4">
          {trace.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {trace.error}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <DetailCard title="Request" icon={Server}>
              <JsonBlock value={trace.request} />
            </DetailCard>
            <DetailCard title="Response" icon={Server}>
              <JsonBlock value={trace.response} />
            </DetailCard>
          </div>

          <DetailCard title="Context" icon={Database}>
            <JsonBlock value={trace.context} />
          </DetailCard>

          <DetailCard title="Node timeline" icon={Activity}>
            <div className="space-y-3">
              {trace.nodes.map((node, index) => (
                <div key={`${node.id}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">{node.type}</span>
                    <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">{node.name || node.id}</span>
                    <span className="text-xs text-slate-400">{node.durationMs} ms</span>
                    {node.error && <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-300">{node.error}</span>}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Input</div>
                      <JsonBlock value={node.input ?? {}} />
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Output</div>
                      <JsonBlock value={node.output ?? {}} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DetailCard>

          <DetailCard title="Branch decisions" icon={GitBranch}>
            {trace.edges.length === 0 ? (
              <p className="text-sm text-slate-400">No edge decisions recorded.</p>
            ) : (
              <div className="space-y-2">
                {trace.edges.map((edge, index) => (
                  <div key={`${edge.id}-${index}`} className={`rounded-xl border px-3 py-2 text-xs ${edge.selected ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30' : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-slate-700 dark:text-slate-300">{edge.source} → {edge.target}</span>
                      {edge.unconditional && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase text-slate-500 dark:bg-slate-800">unconditional</span>}
                      {edge.matched && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] uppercase text-blue-600 dark:bg-blue-950/30 dark:text-blue-300">matched</span>}
                      {edge.selected && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">selected</span>}
                      {edge.error && <span className="text-red-500">{edge.error}</span>}
                    </div>
                    {edge.condition && <div className="mt-2"><JsonBlock value={edge.condition} /></div>}
                  </div>
                ))}
              </div>
            )}
          </DetailCard>
        </div>
      </div>
    </div>
  )
}
