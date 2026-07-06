import type { Flow, FlowValidationError, MetaResponse, Script, SpecDetail, SpecMeta, Template, TemplateExample, Trace, TraceSummary } from '../types'

const BASE = import.meta.env.VITE_API_BASE || '/_api'

export class ApiError extends Error {
  status: number
  details: FlowValidationError[]

  constructor(status: number, message: string, details: FlowValidationError[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    let details: FlowValidationError[] = []
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
      if (Array.isArray(body?.details)) details = body.details
    } catch { /* ignore */ }
    throw new ApiError(res.status, msg, details)
  }
  return res.json() as Promise<T>
}

export const metaApi = {
  get: () => fetch(`${BASE}/meta`).then(r => handle<MetaResponse>(r)),
}

export const specsApi = {
  list: () => fetch(`${BASE}/specs`).then(r => handle<SpecMeta[]>(r)),
  get: (id: string) => fetch(`${BASE}/specs/${id}`).then(r => handle<SpecDetail>(r)),
  upload: (formData: FormData) =>
    fetch(`${BASE}/specs`, { method: 'POST', body: formData }).then(r => handle<SpecMeta>(r)),
  delete: (id: string) =>
    fetch(`${BASE}/specs/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    }),
  setTracing: (id: string, enabled: boolean) =>
    fetch(`${BASE}/specs/${id}/tracing`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).then(r => handle<SpecMeta>(r)),
}

export const flowsApi = {
  get: (specId: string, opId: string) =>
    fetch(`${BASE}/specs/${specId}/flows/${opId}`).then(r => handle<Flow>(r)),
  save: (specId: string, opId: string, flow: Flow) =>
    fetch(`${BASE}/specs/${specId}/flows/${opId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flow),
    }).then(r => handle<Flow>(r)),
}

export const templatesApi = {
  list: (specId: string, operationId?: string) => {
    const query = operationId ? `?operationId=${encodeURIComponent(operationId)}` : ''
    return fetch(`${BASE}/specs/${specId}/templates${query}`).then(r => handle<Template[]>(r))
  },
  create: (specId: string, t: Omit<Template, 'id' | 'specId' | 'createdAt' | 'updatedAt'>) =>
    fetch(`${BASE}/specs/${specId}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    }).then(r => handle<Template>(r)),
  update: (specId: string, id: string, t: Omit<Template, 'id' | 'specId' | 'createdAt' | 'updatedAt'>) =>
    fetch(`${BASE}/specs/${specId}/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    }).then(r => handle<Template>(r)),
  delete: (specId: string, id: string) =>
    fetch(`${BASE}/specs/${specId}/templates/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    }),
  examples: (specId: string, operationId: string) =>
    fetch(`${BASE}/specs/${specId}/operations/${operationId}/response-examples`).then(r => handle<TemplateExample[]>(r)),
}

export const scriptsApi = {
  list: () => fetch(`${BASE}/scripts`).then(r => handle<Script[]>(r)),
  get: (id: string) => fetch(`${BASE}/scripts/${id}`).then(r => handle<Script>(r)),
  create: (script: Pick<Script, 'name' | 'description' | 'source'>) =>
    fetch(`${BASE}/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(script),
    }).then(r => handle<Script>(r)),
  update: (id: string, script: Pick<Script, 'name' | 'description' | 'source'>) =>
    fetch(`${BASE}/scripts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(script),
    }).then(r => handle<Script>(r)),
  delete: (id: string) =>
    fetch(`${BASE}/scripts/${id}`, { method: 'DELETE' }).then(async response => {
      if (!response.ok) await handle<never>(response)
  }),
}

export const tracesApi = {
  list: (filters?: { specId?: string; operationId?: string }) => {
    const params = new URLSearchParams()
    if (filters?.specId) params.set('specId', filters.specId)
    if (filters?.operationId) params.set('operationId', filters.operationId)
    const query = params.toString()
    return fetch(`${BASE}/traces${query ? `?${query}` : ''}`).then(r => handle<TraceSummary[]>(r))
  },
  get: (id: string) => fetch(`${BASE}/traces/${id}`).then(r => handle<Trace>(r)),
  delete: (id: string) =>
    fetch(`${BASE}/traces/${id}`, { method: 'DELETE' }).then(async response => {
      if (!response.ok) await handle<never>(response)
    }),
  deleteAll: () =>
    fetch(`${BASE}/traces`, { method: 'DELETE' }).then(async response => {
      if (!response.ok) await handle<never>(response)
    }),
}
