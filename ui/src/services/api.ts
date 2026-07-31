import type { Collection, CollectionDocument, Flow, FlowValidationError, MetaResponse, Script, SpecDetail, SpecMeta, Template, TemplateExample, Trace, TraceSummary } from '../types'

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
  list: () => request<Script[]>('/scripts'),
  get: (id: string) => request<Script>(`/scripts/${id}`),
  create: (script: Pick<Script, 'name' | 'description' | 'source'>) =>
    jsonRequest<Script>('/scripts', 'POST', script),
  update: (id: string, script: Pick<Script, 'name' | 'description' | 'source'>) =>
    jsonRequest<Script>(`/scripts/${id}`, 'PUT', script),
  delete: (id: string) =>
    requestVoid(`/scripts/${id}`, { method: 'DELETE' }),
}

export const collectionsApi = {
  list: () => request<Collection[]>('/collections'),
  get: (id: string) => request<Collection>(`/collections/${id}`),
  create: (c: Pick<Collection, 'name' | 'description'>) =>
    jsonRequest<Collection>('/collections', 'POST', c),
  update: (id: string, c: Pick<Collection, 'name' | 'description'>) =>
    jsonRequest<Collection>(`/collections/${id}`, 'PUT', c),
  delete: (id: string) =>
    requestVoid(`/collections/${id}`, { method: 'DELETE' }),
}

export const documentsApi = {
  list: (collectionId: string) =>
    request<CollectionDocument[]>(`/collections/${collectionId}/documents`),
  get: (collectionId: string, id: string) =>
    request<CollectionDocument>(`/collections/${collectionId}/documents/${id}`),
  create: (collectionId: string, data: Record<string, unknown>) =>
    jsonRequest<CollectionDocument>(`/collections/${collectionId}/documents`, 'POST', data),
  update: (collectionId: string, id: string, data: Record<string, unknown>) =>
    jsonRequest<CollectionDocument>(`/collections/${collectionId}/documents/${id}`, 'PUT', data),
  delete: (collectionId: string, id: string) =>
    requestVoid(`/collections/${collectionId}/documents/${id}`, { method: 'DELETE' }),
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
