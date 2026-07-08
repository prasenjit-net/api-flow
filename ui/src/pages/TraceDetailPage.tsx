import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Activity, ChevronLeft, Clock, Code2, Database, FileCode, GitBranch, Play, Server, SlidersHorizontal, Square } from 'lucide-react'
import MethodBadge from '../components/MethodBadge'
import { tracesApi } from '../services/api'
import type { NodeType, TraceEdge, TraceNode } from '../types'
import { summarizeCondition } from '../components/flow/edgeConditions'

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

function nodeTone(type: NodeType) {
  switch (type) {
    case 'start':
      return {
        label: 'Start',
        Icon: Play,
        card: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100',
        icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200',
        rail: 'bg-emerald-300 dark:bg-emerald-700',
      }
    case 'end':
      return {
        label: 'End',
        Icon: Square,
        card: 'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100',
        icon: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
        badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200',
        rail: 'bg-red-300 dark:bg-red-700',
      }
    case 'contextMapper':
      return {
        label: 'Mapper',
        Icon: SlidersHorizontal,
        card: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100',
        icon: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
        badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200',
        rail: 'bg-sky-300 dark:bg-sky-700',
      }
    case 'starlark':
      return {
        label: 'Script',
        Icon: Code2,
        card: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100',
        icon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200',
        rail: 'bg-amber-300 dark:bg-amber-700',
      }
    case 'template':
      return {
        label: 'Response',
        Icon: FileCode,
        card: 'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100',
        icon: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
        badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200',
        rail: 'bg-violet-300 dark:bg-violet-700',
      }
    case 'dataMapper':
      return {
        label: 'Data Mapper',
        Icon: Database,
        card: 'border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-100',
        icon: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200',
        badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200',
        rail: 'bg-teal-300 dark:bg-teal-700',
      }
  }
}

function TraceNodeCard({ node, index }: { node: TraceNode; index: number }) {
  const tone = nodeTone(node.type)
  const Icon = tone.Icon
  return (
    <div className="relative pl-9">
      <div className={clsx('absolute left-2 top-4 h-3 w-3 rounded-full ring-4 ring-white dark:ring-slate-900', tone.rail)} />
      <div className={clsx('rounded-2xl border p-3 shadow-sm', tone.card)}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={clsx('rounded-md p-1.5', tone.icon)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{node.name || node.id}</span>
          <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', tone.badge)}>
            {tone.label}
          </span>
          <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm dark:bg-slate-900/60 dark:text-slate-300">
            #{index + 1}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{node.durationMs} ms</span>
          {node.error && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">{node.error}</span>}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Input</div>
            <JsonBlock value={node.input ?? {}} />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Output</div>
            <JsonBlock value={node.output ?? {}} />
          </div>
        </div>
      </div>
    </div>
  )
}

function TraceEdgeCard({ edge }: { edge: TraceEdge }) {
  const isConditional = !edge.unconditional
  return (
    <div className="relative pl-9">
      <div className={clsx(
        'absolute left-[13px] top-0 h-full border-l',
        isConditional ? 'border-dashed border-slate-300 dark:border-slate-700' : 'border-emerald-300 dark:border-emerald-800',
      )} />
      <div className={clsx(
        'ml-3 rounded-xl border px-3 py-2 text-xs shadow-sm',
        edge.selected
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'
          : isConditional
            ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950'
            : 'border-emerald-100 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20',
      )}>
        <div className="flex flex-wrap items-center gap-2">
          <GitBranch className={clsx('h-3.5 w-3.5', edge.selected ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400')} />
          <span className="font-mono text-slate-700 dark:text-slate-300">{edge.source} → {edge.target}</span>
          <span className={clsx(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            isConditional
              ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
          )}>
            {isConditional ? 'conditional' : 'fallback'}
          </span>
          {edge.matched && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-600 dark:bg-blue-950/30 dark:text-blue-300">matched</span>}
          {edge.selected && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">selected</span>}
          {!edge.selected && !edge.matched && isConditional && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-400 dark:bg-slate-800">skipped</span>}
          {edge.error && <span className="text-red-500">{edge.error}</span>}
        </div>
        <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          {summarizeCondition(edge.condition)}
        </div>
        {edge.condition && <div className="mt-2"><JsonBlock value={edge.condition} /></div>}
      </div>
    </div>
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
  const edgesBySource = trace.edges.reduce<Record<string, TraceEdge[]>>((acc, edge) => {
    acc[edge.source] = [...(acc[edge.source] ?? []), edge]
    return acc
  }, {})

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

          <DetailCard title="Execution timeline" icon={Activity}>
            <div className="space-y-3">
              {trace.nodes.map((node, index) => (
                <div key={`${node.id}-${index}`} className="space-y-2">
                  <TraceNodeCard node={node} index={index} />
                  {(edgesBySource[node.id] ?? []).map((edge, edgeIndex) => (
                    <TraceEdgeCard key={`${edge.id}-${edgeIndex}`} edge={edge} />
                  ))}
                </div>
              ))}
            </div>
          </DetailCard>
        </div>
      </div>
    </div>
  )
}
