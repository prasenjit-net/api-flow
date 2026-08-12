import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
	Code2,
	Copy,
	FileCode,
	FileJson,
	GitBranch,
	Check,
	PlugZap,
  RadioTower,
  Route,
} from 'lucide-react'
import StatCard from '../components/StatCard'
import MethodBadge from '../components/MethodBadge'
import { scriptsApi, specsApi, templatesApi, tracesApi } from '../services/api'
import type { Operation, Script, SpecDetail, SpecMeta, Template, TraceSummary } from '../types'

interface OverviewStats {
  specs: SpecMeta[]
  specDetails: SpecDetail[]
  templates: Template[]
  scripts: Script[]
  traces: TraceSummary[]
}

async function loadOverview(): Promise<OverviewStats> {
  const specs = await specsApi.list()
  const [specDetails, templateGroups, scriptGroups, traces] = await Promise.all([
    Promise.all(specs.map(spec => specsApi.get(spec.id))),
    Promise.all(specs.map(spec => templatesApi.list(spec.id))),
    Promise.all(specs.map(spec => scriptsApi.list(spec.id))),
    tracesApi.list(),
  ])
  return {
    specs,
    specDetails,
    templates: templateGroups.flat(),
    scripts: scriptGroups.flat(),
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

const mcpClientGuides = [
  {
    id: 'codex',
    label: 'Codex',
    location: '~/.codex/config.toml',
    config: `[mcp_servers.api_flow]
command = "api-flow"
args = ["mcp"]`,
    href: 'https://developers.openai.com/codex/mcp/',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    location: 'Terminal',
    config: 'claude mcp add --scope project api-flow -- api-flow mcp',
    href: 'https://docs.anthropic.com/en/docs/claude-code/mcp',
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    location: 'claude_desktop_config.json',
    config: `{
  "mcpServers": {
    "api-flow": {
      "command": "api-flow",
      "args": ["mcp"]
    }
  }
}`,
    href: 'https://modelcontextprotocol.io/docs/learn/architecture',
  },
  {
    id: 'vscode',
    label: 'VS Code',
    location: '.vscode/mcp.json',
    config: `{
  "servers": {
    "api-flow": {
      "type": "stdio",
      "command": "api-flow",
      "args": ["mcp"],
      "cwd": "${'${workspaceFolder}'}"
    }
  }
}`,
    href: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration',
  },
  {
    id: 'http',
    label: 'Remote HTTP',
    location: 'Client MCP settings',
    config: `{
  "type": "http",
  "url": "https://your-api-flow.example/mcp",
  "headers": {
    "Authorization": "Bearer <APP_MCP_HTTP_BEARER_TOKEN>"
  }
}`,
    href: 'https://modelcontextprotocol.io/specification/2025-11-25/basic/transports',
  },
] as const

export default function OverviewPage() {
	const [activeMCPClient, setActiveMCPClient] = useState<(typeof mcpClientGuides)[number]['id']>('codex')
	const [copiedMCPClient, setCopiedMCPClient] = useState<string | null>(null)
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
  const publishedSpecCount = specs.filter(spec => spec.publishedSnapshot || spec.publishedVersion > 0).length
  const dirtySpecCount = specs.filter(spec => spec.draftDirty).length
  const operationScopedTemplateCount = templates.filter(template => template.operationId).length
  const reusableTemplateCount = templates.length - operationScopedTemplateCount
  const successfulTraces = traces.filter(trace => !trace.error && trace.statusCode > 0 && trace.statusCode < 400).length
  const failedTraces = traces.filter(trace => trace.error || trace.statusCode >= 400).length
  const avgTraceDuration = average(traces.map(trace => trace.durationMs))
  const latest = latestTrace(traces)
	const activeMCPGuide = mcpClientGuides.find(guide => guide.id === activeMCPClient) ?? mcpClientGuides[0]
	const copyMCPGuide = async () => {
		await navigator.clipboard.writeText(activeMCPGuide.config)
		setCopiedMCPClient(activeMCPGuide.id)
		window.setTimeout(() => setCopiedMCPClient(null), 1800)
	}

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
              <StatCard label="Specifications" value={String(specs.length)} description={`${publishedSpecCount} published · ${dirtySpecCount} need release`} icon={FileJson} tone="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300" />
              <StatCard label="Operations" value={String(operationCount)} description={`${flowCount} with flows · ${percent(flowCount, operationCount)} coverage`} icon={Route} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300" />
              <StatCard label="Templates" value={String(templates.length)} description={`${reusableTemplateCount} reusable · ${operationScopedTemplateCount} operation scoped`} icon={FileCode} tone="bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300" />
              <StatCard label="Scripts" value={String(scripts.length)} description="Spec-scoped Starlark scripts" icon={Code2} tone="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300" />
              <StatCard label="Traces" value={String(traces.length)} description={`${successfulTraces} successful · ${failedTraces} failed`} icon={Activity} tone="bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300" />
              <StatCard label="Average trace" value={formatDuration(avgTraceDuration)} description="Mean saved request duration" icon={Clock3} tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
              <StatCard label="Flow coverage" value={percent(flowCount, operationCount)} description={`${operationCount - flowCount} operations without flows`} icon={GitBranch} tone="bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-300" />
              <StatCard label="Tracing" value={percent(tracingEnabledCount, specs.length)} description={`${tracingEnabledCount} of ${specs.length} specs enabled`} icon={RadioTower} tone="bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              spec.publishedSnapshot || spec.publishedVersion > 0
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                                : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                            }`}>
                              {spec.publishedSnapshot ? 'published snapshot' : spec.publishedVersion > 0 ? `published v${spec.publishedVersion}` : 'unpublished'}
                            </span>
                            {spec.draftDirty && (
                              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                                needs release
                              </span>
                            )}
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

              <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Operations by method</h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Distribution across uploaded OpenAPI specs.</p>
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

            <section className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <PlugZap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Connect an agent</h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Use the local stdio server for this workspace, or configure the protected HTTP endpoint for remote agents.</p>
                </div>
                <a href="https://modelcontextprotocol.io/docs/learn/architecture" target="_blank" rel="noreferrer" className="w-fit text-xs text-blue-600 hover:underline dark:text-blue-400">MCP reference</a>
              </div>
              <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="mb-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="MCP client setup">
                  {mcpClientGuides.map(guide => (
                    <button
                      key={guide.id}
                      type="button"
                      role="tab"
                      aria-selected={activeMCPGuide.id === guide.id}
                      onClick={() => setActiveMCPClient(guide.id)}
                      className={`shrink-0 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activeMCPGuide.id === guide.id
                          ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500 dark:text-white'
                          : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                      }`}
                    >
                      {guide.label}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="block font-medium text-slate-700 dark:text-slate-300">Add to {activeMCPGuide.location}</span>
                    <a href={activeMCPGuide.href} target="_blank" rel="noreferrer" className="mt-1 inline-block text-blue-600 hover:underline dark:text-blue-400">Client documentation</a>
                  </div>
                  <div className="relative min-w-0 overflow-hidden rounded border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-950">
                    <pre className="overflow-x-auto p-3 pr-12 text-xs leading-5 text-slate-800 dark:text-slate-100"><code>{activeMCPGuide.config}</code></pre>
                    <button
                      type="button"
                      onClick={() => void copyMCPGuide()}
                      className="absolute right-2 top-2 rounded p-1.5 text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                      title="Copy configuration"
                      aria-label="Copy configuration"
                    >
                      {copiedMCPClient === activeMCPGuide.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                        <Link key={trace.id} to={`/traces/${trace.id}`} className="grid gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 md:grid-cols-[120px_1fr_90px_120px_120px_180px] md:items-center md:gap-4">
                          <div className="flex items-center justify-between gap-2 md:block">
                            <MethodBadge method={trace.method} />
                            <span className="text-xs text-slate-400 md:hidden">{new Date(trace.startedAt).toLocaleString()}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{spec?.name ?? trace.specId}</p>
                            <p className="truncate font-mono text-xs text-slate-400">{trace.operationId}</p>
                          </div>
                          <span className="w-fit rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {trace.releaseSnapshot ? 'snapshot' : trace.releaseVersion ? `v${trace.releaseVersion}` : 'draft'}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${failed ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {failed ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {trace.statusCode || '—'}
                          </span>
                          <span className="text-xs text-slate-500">{formatDuration(trace.durationMs)}</span>
                          <span className="hidden text-xs text-slate-400 md:block">{new Date(trace.startedAt).toLocaleString()}</span>
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
