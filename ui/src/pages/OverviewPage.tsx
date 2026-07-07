import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Code2,
  FileCode,
  FileJson,
  GitBranch,
  RadioTower,
  Route,
} from 'lucide-react'
import StatCard from '../components/StatCard'
import MethodBadge from '../components/MethodBadge'
import { scriptsApi, specsApi, templatesApi, tracesApi } from '../services/api'
import type { Operation, SpecDetail, SpecMeta, Template, TraceSummary } from '../types'

interface OverviewStats {
  specs: SpecMeta[]
  specDetails: SpecDetail[]
  templates: Template[]
  scripts: Awaited<ReturnType<typeof scriptsApi.list>>
  traces: TraceSummary[]
}

async function loadOverview(): Promise<OverviewStats> {
  const specs = await specsApi.list()
  const [specDetails, templateGroups, scripts, traces] = await Promise.all([
    Promise.all(specs.map(spec => specsApi.get(spec.id))),
    Promise.all(specs.map(spec => templatesApi.list(spec.id))),
    scriptsApi.list(),
    tracesApi.list(),
  ])
  return {
    specs,
    specDetails,
    templates: templateGroups.flat(),
    scripts,
    traces,
  }
}

function percent(value: number, total: number) {
  if (total === 0) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function latestTrace(traces: TraceSummary[]) {
  return traces
    .slice()
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
}

export default function OverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['overview'],
    queryFn: loadOverview,
  })

  const specs = data?.specs ?? []
  const specDetails = data?.specDetails ?? []
  const templates = data?.templates ?? []
  const scripts = data?.scripts ?? []
  const traces = data?.traces ?? []
  const operations = specDetails.flatMap(spec => spec.operations.map(operation => ({ ...operation, spec })))
  const operationCount = operations.length
  const flowCount = operations.filter(operation => operation.hasFlow).length
  const tracingEnabledCount = specs.filter(spec => spec.tracingEnabled).length
  const operationScopedTemplateCount = templates.filter(template => template.operationId).length
  const reusableTemplateCount = templates.length - operationScopedTemplateCount
  const successfulTraces = traces.filter(trace => !trace.error && trace.statusCode > 0 && trace.statusCode < 400).length
  const failedTraces = traces.filter(trace => trace.error || trace.statusCode >= 400).length
  const avgTraceDuration = average(traces.map(trace => trace.durationMs))
  const latest = latestTrace(traces)

  const operationsByMethod = operations.reduce<Record<string, Operation[]>>((acc, operation) => {
    const method = operation.method || 'OTHER'
    acc[method] = [...(acc[method] ?? []), operation]
    return acc
  }, {})
  const methodRows = Object.entries(operationsByMethod)
    .sort(([left], [right]) => left.localeCompare(right))

  const specsWithFlowStats = specDetails
    .map(spec => {
      const total = spec.operations.length
      const flows = spec.operations.filter(operation => operation.hasFlow).length
      const templateCount = templates.filter(template => template.specId === spec.id).length
      const traceCount = traces.filter(trace => trace.specId === spec.id).length
      return { spec, total, flows, templateCount, traceCount }
    })
    .sort((a, b) => b.total - a.total)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Overview</span>
        </div>
        {latest && (
          <Link to={`/traces/${latest.id}`} className="text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
            Latest trace · {new Date(latest.startedAt).toLocaleString()}
          </Link>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50/70 p-6 dark:bg-slate-950">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading overview…</div>
        ) : error || !data ? (
          <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load overview.</div>
        ) : (
          <div className="mx-auto max-w-7xl space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Workspace overview</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                A quick pulse of specifications, executable flows, reusable assets, and captured request traces.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Specifications" value={String(specs.length)} description={`${tracingEnabledCount} tracing enabled`} icon={FileJson} tone="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300" />
              <StatCard label="Operations" value={String(operationCount)} description={`${flowCount} with flows · ${percent(flowCount, operationCount)} coverage`} icon={Route} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300" />
              <StatCard label="Templates" value={String(templates.length)} description={`${reusableTemplateCount} reusable · ${operationScopedTemplateCount} operation scoped`} icon={FileCode} tone="bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300" />
              <StatCard label="Scripts" value={String(scripts.length)} description="Global Starlark scripts" icon={Code2} tone="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300" />
              <StatCard label="Traces" value={String(traces.length)} description={`${successfulTraces} successful · ${failedTraces} failed`} icon={Activity} tone="bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300" />
              <StatCard label="Average trace" value={formatDuration(avgTraceDuration)} description="Mean saved request duration" icon={Clock3} tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
              <StatCard label="Flow coverage" value={percent(flowCount, operationCount)} description={`${operationCount - flowCount} operations without flows`} icon={GitBranch} tone="bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-300" />
              <StatCard label="Tracing" value={percent(tracingEnabledCount, specs.length)} description={`${tracingEnabledCount} of ${specs.length} specs enabled`} icon={RadioTower} tone="bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Specifications</h2>
                    <p className="mt-0.5 text-xs text-slate-500">Operations, flows, templates, and traces by spec.</p>
                  </div>
                  <Link to="/specifications" className="text-xs text-blue-600 hover:underline dark:text-blue-400">View specs</Link>
                </div>
                {specsWithFlowStats.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-sm text-slate-400">No specifications uploaded yet.</div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {specsWithFlowStats.map(({ spec, total, flows, templateCount, traceCount }) => (
                      <Link key={spec.id} to={`/specifications/${spec.id}`} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{spec.name}</span>
                            {spec.tracingEnabled ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" /> tracing
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-800">tracing off</span>
                            )}
                          </div>
                          <code className="mt-1 block truncate font-mono text-xs text-slate-400">{spec.contextPath}</code>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className="h-full rounded-full bg-emerald-400 dark:bg-emerald-500" style={{ width: percent(flows, total) }} />
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-right text-xs">
                          <div><p className="font-semibold text-slate-800 dark:text-slate-100">{total}</p><p className="text-slate-400">ops</p></div>
                          <div><p className="font-semibold text-slate-800 dark:text-slate-100">{flows}</p><p className="text-slate-400">flows</p></div>
                          <div><p className="font-semibold text-slate-800 dark:text-slate-100">{templateCount}</p><p className="text-slate-400">templates</p></div>
                          <div><p className="font-semibold text-slate-800 dark:text-slate-100">{traceCount}</p><p className="text-slate-400">traces</p></div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Operations by method</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Distribution across uploaded OpenAPI specs.</p>
                </div>
                {methodRows.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-sm text-slate-400">No operations found.</div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {methodRows.map(([method, rows]) => (
                      <div key={method} className="flex items-center justify-between px-5 py-3">
                        <MethodBadge method={method} />
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className="h-full rounded-full bg-blue-400" style={{ width: percent(rows.length, operationCount) }} />
                          </div>
                          <span className="w-10 text-right text-sm font-semibold text-slate-800 dark:text-slate-100">{rows.length}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Recent traces</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Latest saved flow-based requests.</p>
                </div>
                <Link to="/traces" className="text-xs text-blue-600 hover:underline dark:text-blue-400">View all traces</Link>
              </div>
              {traces.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-slate-400">No traces captured yet.</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {traces
                    .slice()
                    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
                    .slice(0, 6)
                    .map(trace => {
                      const spec = specs.find(candidate => candidate.id === trace.specId)
                      const failed = trace.error || trace.statusCode >= 400
                      return (
                        <Link key={trace.id} to={`/traces/${trace.id}`} className="grid grid-cols-[120px_1fr_120px_120px_180px] items-center gap-4 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <MethodBadge method={trace.method} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{spec?.name ?? trace.specId}</p>
                            <p className="truncate font-mono text-xs text-slate-400">{trace.operationId}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${failed ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {failed ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {trace.statusCode || '—'}
                          </span>
                          <span className="text-xs text-slate-500">{formatDuration(trace.durationMs)}</span>
                          <span className="text-xs text-slate-400">{new Date(trace.startedAt).toLocaleString()}</span>
                        </Link>
                      )
                    })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
