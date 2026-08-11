import type { Collection, CollectionDocument, Flow, FlowValidationError, MetaResponse, ReleaseBundle, Script, SessionDetail, SessionPersistSummary, SessionSummary, SpecDetail, SpecMeta, Template, TemplateExample, TestPlan, TestPlanRequest, Trace, TraceSummary } from '../types'

const BASE = import.meta.env.VITE_API_BASE || '/_api'
const DEFAULT_REQUEST_TIMEOUT_MS = 30000

export class ApiError extends Error {
  status: number
  details: FlowValidationError[]
  requestId?: string

  constructor(status: number, message: string, details: FlowValidationError[] = [], requestId?: string) {
    super(requestId ? `${message} (request ID: ${requestId})` : message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
    this.requestId = requestId
  }
}

type ApiRequestInit = RequestInit & {
  timeoutMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function fetchWithTimeout(input: RequestInfo | URL, init: ApiRequestInit = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal, ...fetchInit } = init
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()

  if (signal?.aborted) {
    controller.abort()
  } else {
    signal?.addEventListener('abort', abort, { once: true })
  }

  try {
    return await fetch(input, { ...fetchInit, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out')
    }
    throw new ApiError(0, error instanceof Error ? error.message : 'Network request failed')
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined
  const contentType = res.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    return res.json()
  }
  const text = await res.text()
  return text.trim() || undefined
}

async function handle<T>(res: Response): Promise<T> {
  const body = await parseBody(res)
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    let details: FlowValidationError[] = []
    let requestId = res.headers.get('X-Request-ID') ?? undefined

    if (typeof body === 'string') {
      msg = body
    } else if (isRecord(body)) {
      if (typeof body.error === 'string') msg = body.error
      if (Array.isArray(body.details)) details = body.details as FlowValidationError[]
      if (!requestId && typeof body.requestId === 'string') requestId = body.requestId
    }

    throw new ApiError(res.status, msg, details, requestId)
  }
  return body as T
}

function request<T>(path: string, init?: ApiRequestInit): Promise<T> {
  return fetchWithTimeout(`${BASE}${path}`, init).then(response => handle<T>(response))
}

async function requestVoid(path: string, init?: ApiRequestInit): Promise<void> {
  const response = await fetchWithTimeout(`${BASE}${path}`, init)
  if (!response.ok) await handle<never>(response)
}

function jsonRequest<T>(path: string, method: 'POST' | 'PUT' | 'PATCH', body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export const metaApi = {
  get: () => request<MetaResponse>('/meta'),
}

export type AgentEvent = { type: 'text' | 'tool_start' | 'tool_result' | 'error'; text?: string; tool?: string; data?: unknown }
export const agentApi = {
  chat: async (prompt: string, onEvent: (event: AgentEvent) => void, signal?: AbortSignal) => {
    const response = await fetch(`${BASE}/agent/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }), signal })
    if (!response.ok || !response.body) await handle<never>(response)
    const body = response.body
    if (!body) throw new ApiError(0, 'Streaming response is unavailable')
    const reader = body.getReader(); const decoder = new TextDecoder(); let buffer = ''
    for (;;) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() ?? ''; for (const line of lines) if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)) as AgentEvent) }
  },
}

export const specsApi = {
  list: () => request<SpecMeta[]>('/specs'),
  get: (id: string) => request<SpecDetail>(`/specs/${id}`),
  upload: (formData: FormData) =>
    request<SpecMeta>('/specs', { method: 'POST', body: formData }),
  delete: (id: string) =>
    requestVoid(`/specs/${id}`, { method: 'DELETE' }),
  setTracing: (id: string, enabled: boolean) =>
    jsonRequest<SpecMeta>(`/specs/${id}/tracing`, 'PATCH', { enabled }),
}

export const releasesApi = {
  list: (specId: string) =>
    request<ReleaseBundle[]>(`/specs/${specId}/releases`),
  create: (specId: string, notes: string) =>
    jsonRequest<ReleaseBundle>(`/specs/${specId}/releases`, 'POST', { notes }),
  publishSnapshot: (specId: string) =>
    jsonRequest<ReleaseBundle>(`/specs/${specId}/releases/snapshot/publish`, 'POST', {}),
  promoteSnapshot: (specId: string, notes: string) =>
    jsonRequest<ReleaseBundle>(`/specs/${specId}/releases/snapshot/promote`, 'POST', { notes }),
  publish: (specId: string, version: number) =>
    jsonRequest<SpecMeta>(`/specs/${specId}/releases/${version}/publish`, 'POST', {}),
  unpublish: (specId: string) =>
    jsonRequest<SpecMeta>(`/specs/${specId}/unpublish`, 'POST', {}),
  delete: (specId: string, version: number) =>
    requestVoid(`/specs/${specId}/releases/${version}`, { method: 'DELETE' }),
}

export const flowsApi = {
  get: (specId: string, opId: string) =>
    request<Flow>(`/specs/${specId}/flows/${opId}`),
  save: (specId: string, opId: string, flow: Flow) =>
    jsonRequest<Flow>(`/specs/${specId}/flows/${opId}`, 'PUT', flow),
}

export const templatesApi = {
  list: (specId: string, operationId?: string) => {
    const query = operationId ? `?operationId=${encodeURIComponent(operationId)}` : ''
    return request<Template[]>(`/specs/${specId}/templates${query}`)
  },
  create: (specId: string, t: Omit<Template, 'id' | 'specId' | 'createdAt' | 'updatedAt'>) =>
    jsonRequest<Template>(`/specs/${specId}/templates`, 'POST', t),
  update: (specId: string, id: string, t: Omit<Template, 'id' | 'specId' | 'createdAt' | 'updatedAt'>) =>
    jsonRequest<Template>(`/specs/${specId}/templates/${id}`, 'PUT', t),
  delete: (specId: string, id: string) =>
    requestVoid(`/specs/${specId}/templates/${id}`, { method: 'DELETE' }),
  examples: (specId: string, operationId: string) =>
    request<TemplateExample[]>(`/specs/${specId}/operations/${operationId}/response-examples`),
}

export const scriptsApi = {
  list: (specId: string) => request<Script[]>(`/specs/${specId}/scripts`),
  get: (specId: string, id: string) => request<Script>(`/specs/${specId}/scripts/${id}`),
  create: (specId: string, script: Pick<Script, 'name' | 'description' | 'source'>) =>
    jsonRequest<Script>(`/specs/${specId}/scripts`, 'POST', script),
  update: (specId: string, id: string, script: Pick<Script, 'name' | 'description' | 'source'>) =>
    jsonRequest<Script>(`/specs/${specId}/scripts/${id}`, 'PUT', script),
  delete: (specId: string, id: string) =>
    requestVoid(`/specs/${specId}/scripts/${id}`, { method: 'DELETE' }),
}

export const collectionsApi = {
  list: (specId: string) => request<Collection[]>(`/specs/${specId}/collections`),
  get: (specId: string, id: string) => request<Collection>(`/specs/${specId}/collections/${id}`),
  create: (specId: string, c: Pick<Collection, 'name' | 'description'>) =>
    jsonRequest<Collection>(`/specs/${specId}/collections`, 'POST', c),
  update: (specId: string, id: string, c: Pick<Collection, 'name' | 'description'>) =>
    jsonRequest<Collection>(`/specs/${specId}/collections/${id}`, 'PUT', c),
  delete: (specId: string, id: string) =>
    requestVoid(`/specs/${specId}/collections/${id}`, { method: 'DELETE' }),
}

export const documentsApi = {
  list: (specId: string, collectionId: string) =>
    request<CollectionDocument[]>(`/specs/${specId}/collections/${collectionId}/documents`),
  get: (specId: string, collectionId: string, id: string) =>
    request<CollectionDocument>(`/specs/${specId}/collections/${collectionId}/documents/${id}`),
  create: (specId: string, collectionId: string, data: Record<string, unknown>) =>
    jsonRequest<CollectionDocument>(`/specs/${specId}/collections/${collectionId}/documents`, 'POST', data),
  update: (specId: string, collectionId: string, id: string, data: Record<string, unknown>) =>
    jsonRequest<CollectionDocument>(`/specs/${specId}/collections/${collectionId}/documents/${id}`, 'PUT', data),
  delete: (specId: string, collectionId: string, id: string) =>
    requestVoid(`/specs/${specId}/collections/${collectionId}/documents/${id}`, { method: 'DELETE' }),
}

type TestPlanPayload = Pick<TestPlan, 'name' | 'description'>
type TestPlanRequestPayload = Omit<TestPlanRequest, 'id' | 'planId' | 'createdAt' | 'updatedAt'>

export const testGroundApi = {
  listPlans: () => request<TestPlan[]>('/test-ground/plans'),
  getPlan: (planId: string) => request<TestPlan>(`/test-ground/plans/${planId}`),
  createPlan: (plan: TestPlanPayload) =>
    jsonRequest<TestPlan>('/test-ground/plans', 'POST', plan),
  updatePlan: (planId: string, plan: TestPlanPayload) =>
    jsonRequest<TestPlan>(`/test-ground/plans/${planId}`, 'PUT', plan),
  deletePlan: (planId: string) =>
    requestVoid(`/test-ground/plans/${planId}`, { method: 'DELETE' }),
  listRequests: (planId: string) =>
    request<TestPlanRequest[]>(`/test-ground/plans/${planId}/requests`),
  getRequest: (planId: string, requestId: string) =>
    request<TestPlanRequest>(`/test-ground/plans/${planId}/requests/${requestId}`),
  createRequest: (planId: string, savedRequest: TestPlanRequestPayload) =>
    jsonRequest<TestPlanRequest>(`/test-ground/plans/${planId}/requests`, 'POST', savedRequest),
  updateRequest: (planId: string, requestId: string, savedRequest: TestPlanRequestPayload) =>
    jsonRequest<TestPlanRequest>(`/test-ground/plans/${planId}/requests/${requestId}`, 'PUT', savedRequest),
  deleteRequest: (planId: string, requestId: string) =>
    requestVoid(`/test-ground/plans/${planId}/requests/${requestId}`, { method: 'DELETE' }),
}

export const tracesApi = {
  list: (filters?: { specId?: string; operationId?: string }) => {
    const params = new URLSearchParams()
    if (filters?.specId) params.set('specId', filters.specId)
    if (filters?.operationId) params.set('operationId', filters.operationId)
    const query = params.toString()
    return request<TraceSummary[]>(`/traces${query ? `?${query}` : ''}`)
  },
  get: (id: string) => request<Trace>(`/traces/${id}`),
  delete: (id: string) =>
    requestVoid(`/traces/${id}`, { method: 'DELETE' }),
  deleteAll: () =>
    requestVoid('/traces', { method: 'DELETE' }),
}

export const sessionsApi = {
  list: () => request<SessionSummary[]>('/sessions'),
  get: (id: string) => request<SessionDetail>(`/sessions/${id}`),
  delete: (id: string) =>
    requestVoid(`/sessions/${id}`, { method: 'DELETE' }),
  persist: (id: string) =>
    jsonRequest<SessionPersistSummary>(`/sessions/${id}/persist`, 'POST', {}),
}
