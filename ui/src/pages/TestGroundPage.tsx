import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Copy, FileText, FlaskConical, Plus, Play, Save, Trash2, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { specsApi, testGroundApi } from '../services/api'
import MethodBadge from '../components/MethodBadge'
import type { Operation, SpecDetail, TestPlan, TestPlanRequest } from '../types'

type KeyValueRow = {
  id: string
  key: string
  value: string
}

type DraftRequest = Omit<TestPlanRequest, 'id' | 'planId' | 'createdAt' | 'updatedAt'>

type RunResult = {
  id: string
  name: string
  url: string
  sessionId?: string
  status?: number
  ok: boolean
  durationMs: number
  headers: Record<string, string>
  body: string
  error?: string
}

const apiBase = import.meta.env.VITE_API_BASE || '/_api'
const emptyRows = (): KeyValueRow[] => [{ id: crypto.randomUUID(), key: '', value: '' }]

const emptyDraft = (specId = '', operation?: Operation): DraftRequest => ({
  name: operation?.summary || operation ? `${operation.method} ${operation.path}` : 'Untitled request',
  description: '',
  specId,
  operationId: operation?.id ?? '',
  method: operation?.method ?? 'GET',
  path: operation?.path ?? '',
  pathParams: {},
  queryParams: {},
  headers: {},
  body: '',
  position: 0,
})

function rowsToRecord(rows: KeyValueRow[]): Record<string, string> {
  return rows.reduce<Record<string, string>>((acc, row) => {
    const key = row.key.trim()
    if (key) acc[key] = row.value
    return acc
  }, {})
}

function recordToRows(record: Record<string, string> | undefined): KeyValueRow[] {
  const entries = Object.entries(record ?? {})
  if (entries.length === 0) return emptyRows()
  return entries.map(([key, value]) => ({ id: crypto.randomUUID(), key, value }))
}

function pathParamNames(path: string): string[] {
  return Array.from(path.matchAll(/\{([^}]+)\}/g)).map(match => match[1])
}

function mockOrigin(): string {
  return new URL(apiBase, window.location.origin).origin
}

function joinPaths(left: string, right: string): string {
  const a = left === '/' ? '' : left.replace(/\/+$/, '')
  const b = right.startsWith('/') ? right : `/${right}`
  return `${a}${b}` || '/'
}

function buildRequestUrl(spec: SpecDetail, draft: DraftRequest, queryRows: KeyValueRow[]): string {
  let path = draft.path || '/'
  for (const [key, value] of Object.entries(draft.pathParams)) {
    path = path.split(`{${key}}`).join(encodeURIComponent(value))
  }
  const url = new URL(joinPaths(spec.contextPath || '/', path), mockOrigin())
  for (const row of queryRows) {
    const key = row.key.trim()
    if (key) url.searchParams.append(key, row.value)
  }
  return url.toString()
}

function requestToDraft(request: TestPlanRequest): DraftRequest {
  return {
    name: request.name,
    description: request.description,
    specId: request.specId,
    operationId: request.operationId,
    method: request.method,
    path: request.path,
    pathParams: request.pathParams ?? {},
    queryParams: request.queryParams ?? {},
    headers: request.headers ?? {},
    body: request.body ?? '',
    position: request.position,
  }
}

function draftPayload(draft: DraftRequest, queryRows: KeyValueRow[], headerRows: KeyValueRow[]): DraftRequest {
  return {
    ...draft,
    method: draft.method.toUpperCase(),
    queryParams: rowsToRecord(queryRows),
    headers: rowsToRecord(headerRows),
  }
}

function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  rows: KeyValueRow[]
  onChange: (rows: KeyValueRow[]) => void
  keyPlaceholder: string
  valuePlaceholder: string
}) {
  const update = (id: string, patch: Partial<KeyValueRow>) => {
    onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row))
  }
  return (
    <div className="space-y-2">
      {rows.map(row => (
        <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-2">
          <input
            value={row.key}
            onChange={event => update(row.id, { key: event.target.value })}
            placeholder={keyPlaceholder}
            className="min-w-0 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
          <input
            value={row.value}
            onChange={event => update(row.id, { value: event.target.value })}
            placeholder={valuePlaceholder}
            className="min-w-0 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
          <button
            type="button"
            onClick={() => onChange(rows.length === 1 ? emptyRows() : rows.filter(candidate => candidate.id !== row.id))}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-800"
            title="Remove row"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { id: crypto.randomUUID(), key: '', value: '' }])}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
      >
        <Plus className="h-3.5 w-3.5" /> Add row
      </button>
    </div>
  )
}

export default function TestGroundPage() {
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const [activePlanId, setActivePlanId] = useState('')
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [draft, setDraft] = useState<DraftRequest>(() => emptyDraft(searchParams.get('specId') ?? ''))
  const [queryRows, setQueryRows] = useState<KeyValueRow[]>(emptyRows)
  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>(emptyRows)
  const [planName, setPlanName] = useState('')
  const [planDescription, setPlanDescription] = useState('')
  const [response, setResponse] = useState<RunResult | null>(null)
  const [planResults, setPlanResults] = useState<RunResult[]>([])
  const [sessionId, setSessionId] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [formError, setFormError] = useState('')

  const { data: specs = [], isLoading: specsLoading } = useQuery({
    queryKey: ['specs'],
    queryFn: specsApi.list,
  })
  const { data: selectedSpec } = useQuery({
    queryKey: ['specs', draft.specId],
    queryFn: () => specsApi.get(draft.specId),
    enabled: !!draft.specId,
  })
  const { data: plans = [] } = useQuery({
    queryKey: ['test-ground', 'plans'],
    queryFn: testGroundApi.listPlans,
  })
  const { data: requests = [] } = useQuery({
    queryKey: ['test-ground', 'plans', activePlanId, 'requests'],
    queryFn: () => testGroundApi.listRequests(activePlanId),
    enabled: !!activePlanId,
  })

  const activePlan = plans.find(plan => plan.id === activePlanId)
  const selectedOperation = selectedSpec?.operations.find(op => op.id === draft.operationId)

  const createPlanMutation = useMutation({
    mutationFn: () => testGroundApi.createPlan({ name: 'Untitled plan', description: '' }),
    onSuccess: plan => {
      qc.invalidateQueries({ queryKey: ['test-ground', 'plans'] })
      setActivePlanId(plan.id)
    },
    onError: (error: Error) => setFormError(error.message),
  })
  const updatePlanMutation = useMutation({
    mutationFn: (plan: TestPlan) => testGroundApi.updatePlan(plan.id, { name: planName, description: planDescription }),
    onSuccess: plan => {
      qc.invalidateQueries({ queryKey: ['test-ground', 'plans'] })
      setPlanName(plan.name)
      setPlanDescription(plan.description)
    },
    onError: (error: Error) => setFormError(error.message),
  })
  const deletePlanMutation = useMutation({
    mutationFn: (planId: string) => testGroundApi.deletePlan(planId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-ground', 'plans'] })
      setActivePlanId('')
      setSelectedRequestId('')
    },
    onError: (error: Error) => setFormError(error.message),
  })
  const createRequestMutation = useMutation({
    mutationFn: () => testGroundApi.createRequest(activePlanId, { ...draftPayload(draft, queryRows, headerRows), position: 0 }),
    onSuccess: request => {
      qc.invalidateQueries({ queryKey: ['test-ground', 'plans'] })
      qc.invalidateQueries({ queryKey: ['test-ground', 'plans', activePlanId, 'requests'] })
      setSelectedRequestId(request.id)
      setDraft(requestToDraft(request))
    },
    onError: (error: Error) => setFormError(error.message),
  })
  const updateRequestMutation = useMutation({
    mutationFn: () => testGroundApi.updateRequest(activePlanId, selectedRequestId, draftPayload(draft, queryRows, headerRows)),
    onSuccess: request => {
      qc.invalidateQueries({ queryKey: ['test-ground', 'plans'] })
      qc.invalidateQueries({ queryKey: ['test-ground', 'plans', activePlanId, 'requests'] })
      setDraft(requestToDraft(request))
    },
    onError: (error: Error) => setFormError(error.message),
  })
  const deleteRequestMutation = useMutation({
    mutationFn: (requestId: string) => testGroundApi.deleteRequest(activePlanId, requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-ground', 'plans'] })
      qc.invalidateQueries({ queryKey: ['test-ground', 'plans', activePlanId, 'requests'] })
      setSelectedRequestId('')
      setDraft(emptyDraft(draft.specId, selectedOperation))
    },
    onError: (error: Error) => setFormError(error.message),
  })

  useEffect(() => {
    if (!activePlanId && plans.length > 0) setActivePlanId(plans[0].id)
  }, [activePlanId, plans])

  useEffect(() => {
    if (!activePlan) {
      setPlanName('')
      setPlanDescription('')
      return
    }
    setPlanName(activePlan.name)
    setPlanDescription(activePlan.description)
  }, [activePlan])

  useEffect(() => {
    const specId = searchParams.get('specId')
    const operationId = searchParams.get('operationId')
    if (!specId) return
    setDraft(current => ({ ...current, specId, operationId: operationId ?? current.operationId }))
  }, [searchParams])

  useEffect(() => {
    const operationId = searchParams.get('operationId')
    if (!selectedSpec || !operationId) return
    const op = selectedSpec.operations.find(candidate => candidate.id === operationId)
    if (!op) return
    setDraft(current => ({
      ...current,
      operationId: op.id,
      method: op.method,
      path: op.path,
      name: current.name === 'Untitled request' ? `${op.method} ${op.path}` : current.name,
    }))
  }, [searchParams, selectedSpec])

  useEffect(() => {
    const names = pathParamNames(draft.path)
    setDraft(current => {
      if (names.length === 0) {
        return Object.keys(current.pathParams).length > 0 ? { ...current, pathParams: {} } : current
      }
      const next = names.reduce<Record<string, string>>((acc, name) => {
        acc[name] = current.pathParams[name] ?? ''
        return acc
      }, {})
      if (JSON.stringify(next) === JSON.stringify(current.pathParams)) return current
      return { ...current, pathParams: next }
    })
  }, [draft.path])

  const canSave = !!activePlanId && !!draft.name.trim() && !!draft.specId && !!draft.operationId
  const methodAllowsBody = !['GET', 'HEAD'].includes(draft.method.toUpperCase())
  const planDirty = activePlan && (activePlan.name !== planName || activePlan.description !== planDescription)

  const selectOperation = (operationId: string) => {
    const op = selectedSpec?.operations.find(candidate => candidate.id === operationId)
    setSelectedRequestId('')
    setDraft(current => ({
      ...current,
      operationId,
      method: op?.method ?? current.method,
      path: op?.path ?? current.path,
      name: op ? `${op.method} ${op.path}` : current.name,
      pathParams: {},
    }))
  }

  const selectSavedRequest = (request: TestPlanRequest) => {
    setSelectedRequestId(request.id)
    setDraft(requestToDraft(request))
    setQueryRows(recordToRows(request.queryParams))
    setHeaderRows(recordToRows(request.headers))
    setResponse(null)
  }

  const resetDraft = () => {
    setSelectedRequestId('')
    setResponse(null)
    setPlanResults([])
    setQueryRows(emptyRows())
    setHeaderRows(emptyRows())
    setDraft(emptyDraft(draft.specId, selectedOperation))
  }

  const runDraft = async (candidate: DraftRequest, name: string, requestSessionId = sessionId): Promise<RunResult> => {
    const spec = await qc.fetchQuery({
      queryKey: ['specs', candidate.specId],
      queryFn: () => specsApi.get(candidate.specId),
    })
    const candidateQueryRows = recordToRows(candidate.queryParams)
    const candidateHeaderRows = recordToRows(candidate.headers)
    const url = buildRequestUrl(spec, candidate, candidateQueryRows)
    const headers = rowsToRecord(candidateHeaderRows)
    if (requestSessionId.trim()) headers['X-Session-Id'] = requestSessionId.trim()
    const started = performance.now()
    try {
      const res = await fetch(url, {
        method: candidate.method.toUpperCase(),
        headers,
        body: ['GET', 'HEAD'].includes(candidate.method.toUpperCase()) ? undefined : candidate.body,
      })
      const body = await res.text()
      const responseHeaders: Record<string, string> = {}
      res.headers.forEach((value, key) => { responseHeaders[key] = value })
      const nextSessionId = res.headers.get('X-Session-Id') ?? undefined
      return {
        id: crypto.randomUUID(),
        name,
        url,
        sessionId: nextSessionId,
        status: res.status,
        ok: res.ok,
        durationMs: Math.round(performance.now() - started),
        headers: responseHeaders,
        body,
      }
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        name,
        url,
        ok: false,
        durationMs: Math.round(performance.now() - started),
        headers: {},
        body: '',
        error: error instanceof Error ? error.message : 'Request failed',
      }
    }
  }

  const runCurrent = async () => {
    setFormError('')
    setIsRunning(true)
    setPlanResults([])
    const payload = draftPayload(draft, queryRows, headerRows)
    try {
      const result = await runDraft(payload, payload.name || `${payload.method} ${payload.path}`)
      if (result.sessionId) setSessionId(result.sessionId)
      setResponse(result)
    } finally {
      setIsRunning(false)
    }
  }

  const runPlan = async () => {
    setFormError('')
    setIsRunning(true)
    setResponse(null)
    setPlanResults([])
    const results: RunResult[] = []
    let currentSessionId = sessionId
    try {
      for (const request of requests) {
        const result = await runDraft(requestToDraft(request), request.name, currentSessionId)
        if (result.sessionId) {
          currentSessionId = result.sessionId
          setSessionId(result.sessionId)
        }
        results.push(result)
        setPlanResults([...results])
      }
    } finally {
      setIsRunning(false)
    }
  }

  const groupedPlanCount = useMemo(() => plans.length, [plans.length])

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-slate-400" />
              <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Test Ground</h1>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{groupedPlanCount} plans</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Design, save, and run HTTP requests against published mock APIs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={sessionId}
              onChange={event => setSessionId(event.target.value)}
              placeholder="Session id"
              className="w-52 rounded border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            <button
              type="button"
              onClick={() => setSessionId('')}
              className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              New session
            </button>
            <button
              type="button"
              onClick={resetDraft}
              className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" /> New request
            </button>
            <button
              type="button"
              onClick={runCurrent}
              disabled={isRunning || !draft.specId || !draft.operationId}
              className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" /> {isRunning ? 'Running...' : 'Run'}
            </button>
          </div>
        </div>
      </header>

      {formError && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 sm:px-6">
          {formError}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_minmax(320px,420px)]">
        <aside className="min-h-0 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:border-b-0 lg:border-r">
          <div className="flex h-12 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Plans</div>
            <button
              type="button"
              onClick={() => createPlanMutation.mutate()}
              disabled={createPlanMutation.isPending}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-blue-600 disabled:opacity-50 dark:hover:bg-slate-800"
              title="New plan"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[36vh] overflow-y-auto lg:max-h-none">
            {plans.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">No plans yet.</div>
            ) : plans.map(plan => (
              <div key={plan.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActivePlanId(plan.id)
                    setSelectedRequestId('')
                  }}
                  className={clsx(
                    'flex w-full items-center gap-2 border-b border-slate-100 px-4 py-3 text-left dark:border-slate-800/60',
                    activePlanId === plan.id ? 'bg-blue-50 dark:bg-blue-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-900/60',
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{plan.name}</span>
                    <span className="block truncate text-[11px] text-slate-400">{plan.description || 'No description'}</span>
                  </span>
                </button>
                {activePlanId === plan.id && (
                  <div className="border-b border-slate-100 bg-slate-50/70 py-1 dark:border-slate-800/60 dark:bg-slate-900/40">
                    {requests.length === 0 ? (
                      <div className="px-8 py-2 text-[11px] text-slate-400">No saved requests</div>
                    ) : requests.map(request => (
                      <button
                        key={request.id}
                        type="button"
                        onClick={() => selectSavedRequest(request)}
                        className={clsx(
                          'flex w-full items-center gap-2 px-8 py-1.5 text-left text-xs',
                          selectedRequestId === request.id
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                        )}
                      >
                        <span className="w-12 shrink-0 font-mono text-[10px]">{request.method}</span>
                        <span className="truncate">{request.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Spec</label>
                  <select
                    value={draft.specId}
                    onChange={event => {
                      setSelectedRequestId('')
                      setDraft(emptyDraft(event.target.value))
                      setQueryRows(emptyRows())
                      setHeaderRows(emptyRows())
                    }}
                    className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">{specsLoading ? 'Loading specs...' : 'Select a spec'}</option>
                    {specs.map(spec => <option key={spec.id} value={spec.id}>{spec.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Operation</label>
                  <select
                    value={draft.operationId}
                    onChange={event => selectOperation(event.target.value)}
                    disabled={!selectedSpec}
                    className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Select an operation</option>
                    {selectedSpec?.operations.map(op => <option key={op.id} value={op.id}>{op.method} {op.path}</option>)}
                  </select>
                </div>
              </div>
              {activePlan && (
                <div className="flex flex-wrap items-end gap-2 xl:justify-end">
                  <button
                    type="button"
                    onClick={() => updatePlanMutation.mutate(activePlan)}
                    disabled={!planDirty || !planName.trim() || updatePlanMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Save className="h-3.5 w-3.5" /> Save plan
                  </button>
                  <button
                    type="button"
                    onClick={runPlan}
                    disabled={isRunning || requests.length === 0}
                    className="inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    <Play className="h-3.5 w-3.5" /> Run plan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete "${activePlan.name}"?`)) deletePlanMutation.mutate(activePlan.id)
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:border-slate-700 dark:hover:bg-red-950/30"
                    title="Delete plan"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            {activePlan && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  value={planName}
                  onChange={event => setPlanName(event.target.value)}
                  placeholder="Plan name"
                  className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <input
                  value={planDescription}
                  onChange={event => setPlanDescription(event.target.value)}
                  placeholder="Plan description"
                  className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            )}
          </div>

          <div className="space-y-5 px-4 py-4 sm:px-6">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Request</h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => createRequestMutation.mutate()}
                    disabled={!canSave || createRequestMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Copy className="h-3.5 w-3.5" /> Save as
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedRequestId ? updateRequestMutation.mutate() : createRequestMutation.mutate()}
                    disabled={!canSave || updateRequestMutation.isPending || createRequestMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" /> Save
                  </button>
                  {selectedRequestId && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${draft.name}"?`)) deleteRequestMutation.mutate(selectedRequestId)
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      title="Delete request"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                <input
                  value={draft.name}
                  onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
                  placeholder="Request name"
                  className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <input
                  value={draft.method}
                  onChange={event => setDraft(current => ({ ...current, method: event.target.value.toUpperCase() }))}
                  className="rounded border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <input
                  value={draft.path}
                  onChange={event => setDraft(current => ({ ...current, path: event.target.value }))}
                  placeholder="/resource/{id}"
                  className="rounded border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <input
                  value={draft.description}
                  onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
                  placeholder="Optional request description"
                  className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              {selectedSpec && draft.path && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                  <MethodBadge method={draft.method} />
                  <code className="min-w-0 break-all font-mono text-xs text-slate-600 dark:text-slate-300">{joinPaths(selectedSpec.contextPath, draft.path)}</code>
                </div>
              )}
            </section>

            {Object.keys(draft.pathParams).length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Path params</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(draft.pathParams).map(([key, value]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block font-mono text-xs text-slate-500">{key}</span>
                      <input
                        value={value}
                        onChange={event => setDraft(current => ({ ...current, pathParams: { ...current.pathParams, [key]: event.target.value } }))}
                        className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </label>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Query params</h2>
              <KeyValueEditor rows={queryRows} onChange={setQueryRows} keyPlaceholder="name" valuePlaceholder="value" />
            </section>

            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Headers</h2>
              <KeyValueEditor rows={headerRows} onChange={setHeaderRows} keyPlaceholder="content-type" valuePlaceholder="application/json" />
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Body</h2>
                {!methodAllowsBody && <span className="text-xs text-slate-400">Ignored for {draft.method}</span>}
              </div>
              <textarea
                value={draft.body}
                onChange={event => setDraft(current => ({ ...current, body: event.target.value }))}
                rows={10}
                spellCheck={false}
                placeholder='{"name":"Asha"}'
                className="w-full resize-y rounded border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </section>
          </div>
        </main>

        <aside className="min-h-0 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:border-l lg:border-t-0">
          <div className="flex h-12 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Response</div>
            {response && (
              <span className={clsx('rounded px-2 py-0.5 text-xs font-semibold', response.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300')}>
                {response.status ?? 'ERR'} {response.durationMs}ms
              </span>
            )}
          </div>
          <div className="max-h-[44vh] overflow-y-auto p-4 lg:max-h-none">
            {planResults.length > 0 ? (
              <div className="space-y-3">
                {planResults.map(result => (
                  <div key={result.id} className="rounded border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      {result.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{result.name}</span>
                      <span className="text-xs text-slate-400">{result.status ?? 'ERR'} / {result.durationMs}ms</span>
                    </div>
                    <code className="mt-2 block break-all text-[11px] text-slate-400">{result.url}</code>
                    {result.sessionId && <Link to={`/sessions/${result.sessionId}`} className="mt-2 inline-flex font-mono text-[11px] text-blue-600 hover:underline dark:text-blue-400">Session {result.sessionId}</Link>}
                    {result.error && <p className="mt-2 text-xs text-red-500">{result.error}</p>}
                  </div>
                ))}
              </div>
            ) : response ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-500">URL</div>
                  <code className="block break-all rounded bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">{response.url}</code>
                </div>
                {response.sessionId && (
                  <div>
                    <div className="mb-1 text-xs font-semibold text-slate-500">Session</div>
                    <Link to={`/sessions/${response.sessionId}`} className="block break-all rounded bg-blue-50 p-2 font-mono text-[11px] text-blue-700 hover:underline dark:bg-blue-950/30 dark:text-blue-300">{response.sessionId}</Link>
                  </div>
                )}
                {response.error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{response.error}</div>}
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-500">Headers</div>
                  <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">{JSON.stringify(response.headers, null, 2)}</pre>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-500">Body</div>
                  <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-900 dark:text-slate-200">{response.body || '(empty)'}</pre>
                </div>
                <Link to={`/traces?specId=${draft.specId}&operationId=${draft.operationId}`} className="inline-flex text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                  View matching traces
                </Link>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-center text-xs text-slate-400">
                Run a request or plan to inspect the response.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
