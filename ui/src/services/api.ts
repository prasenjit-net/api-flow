import type { Flow, MetaResponse, SpecDetail, SpecMeta, Template } from '../types'

const BASE = import.meta.env.VITE_API_BASE || '/_api'

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch { /* ignore */ }
    throw new Error(msg)
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
  list: () => fetch(`${BASE}/templates`).then(r => handle<Template[]>(r)),
  create: (t: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>) =>
    fetch(`${BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    }).then(r => handle<Template>(r)),
  update: (id: string, t: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>) =>
    fetch(`${BASE}/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    }).then(r => handle<Template>(r)),
  delete: (id: string) =>
    fetch(`${BASE}/templates/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    }),
}
