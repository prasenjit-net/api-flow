import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, FileCode, X, Check } from 'lucide-react'
import { templatesApi } from '../services/api'
import type { Template } from '../types'

type FormState = Omit<Template, 'id' | 'createdAt' | 'updatedAt'>
const emptyForm = (): FormState => ({ name: '', statusCode: 200, body: '', headers: {} })

export default function TemplatesPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [headerKey, setHeaderKey] = useState('')
  const [headerVal, setHeaderVal] = useState('')
  const [error, setError] = useState('')

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.list,
  })

  const createMutation = useMutation({
    mutationFn: (t: FormState) => templatesApi.create(t),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); closeForm() },
    onError: (e: Error) => setError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormState }) => templatesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); closeForm() },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: templatesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })

  function openCreate() {
    setForm(emptyForm())
    setHeaderKey('')
    setHeaderVal('')
    setError('')
    setEditing(null)
    setCreating(true)
  }

  function openEdit(t: Template) {
    setForm({ name: t.name, statusCode: t.statusCode, body: t.body, headers: { ...t.headers } })
    setHeaderKey('')
    setHeaderVal('')
    setError('')
    setEditing(t)
    setCreating(true)
  }

  function closeForm() {
    setCreating(false)
    setEditing(null)
    setForm(emptyForm())
    setError('')
  }

  function addHeader() {
    if (!headerKey.trim()) return
    setForm(f => ({ ...f, headers: { ...f.headers, [headerKey.trim()]: headerVal } }))
    setHeaderKey('')
    setHeaderVal('')
  }

  function removeHeader(key: string) {
    setForm(f => {
      const h = { ...f.headers }
      delete h[key]
      return { ...f, headers: h }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Name is required'); return }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const isBusy = createMutation.isPending || updateMutation.isPending

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Templates</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Reusable response templates for flow nodes</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> New Template
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : templates.length === 0 && !creating ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center dark:border-slate-700">
          <FileCode className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">No templates yet</p>
          <button type="button" onClick={openCreate} className="mt-3 text-sm text-blue-600 hover:underline dark:text-blue-400">
            Create your first template
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => (
            <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-purple-100 px-2 py-0.5 font-mono text-xs font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                    {t.statusCode}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-slate-100">{t.name}</span>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => openEdit(t)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteMutation.mutate(t.id) }}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {Object.keys(t.headers).length > 0 && (
                <div className="mb-2 space-y-0.5">
                  {Object.entries(t.headers).map(([k, v]) => (
                    <div key={k} className="font-mono text-xs text-gray-500 dark:text-slate-400">
                      <span className="text-gray-700 dark:text-slate-300">{k}:</span> {v}
                    </div>
                  ))}
                </div>
              )}
              {t.body && (
                <pre className="max-h-24 overflow-hidden rounded bg-gray-50 p-2 text-xs text-gray-600 dark:bg-slate-800 dark:text-slate-400">
                  {t.body.slice(0, 200)}{t.body.length > 200 ? '…' : ''}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-slate-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                {editing ? 'Edit Template' : 'New Template'}
              </h2>
              <button type="button" onClick={closeForm} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">Name <span className="text-red-500">*</span></label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">Status</label>
                  <input
                    type="number"
                    value={form.statusCode}
                    onChange={e => setForm(f => ({ ...f, statusCode: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">Headers</label>
                <div className="space-y-1 rounded-lg border border-gray-200 p-2 dark:border-slate-700">
                  {Object.entries(form.headers).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-gray-700 dark:text-slate-300">{k}: {v}</code>
                      <button type="button" onClick={() => removeHeader(k)} className="text-gray-400 hover:text-red-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-1">
                    <input
                      value={headerKey}
                      onChange={e => setHeaderKey(e.target.value)}
                      placeholder="Header-Name"
                      className="flex-1 rounded border border-gray-200 px-2 py-1 font-mono text-xs focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                    <input
                      value={headerVal}
                      onChange={e => setHeaderVal(e.target.value)}
                      placeholder="{{.value}} or literal"
                      className="flex-1 rounded border border-gray-200 px-2 py-1 font-mono text-xs focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                    <button type="button" onClick={addHeader} className="rounded bg-gray-100 px-2 text-xs text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">Body (Go template)</label>
                <textarea
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  rows={6}
                  placeholder={'{"message": "Hello {{.name}}"}'}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeForm} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  Cancel
                </button>
                <button type="submit" disabled={isBusy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                  {isBusy ? 'Saving…' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
