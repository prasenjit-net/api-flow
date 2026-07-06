import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { Plus, Trash2, Pencil, FileCode, X, Check, ChevronLeft } from 'lucide-react'
import { specsApi, templatesApi } from '../services/api'
import type { Operation, Template } from '../types'
import TemplateSeedModal, { type TemplateSeed } from '../components/templates/TemplateSeedModal'

type FormState = { name: string; statusCode: number; body: string; headers: Record<string, string> }
const empty = (): FormState => ({ name: '', statusCode: 200, body: '', headers: {} })

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return isDark
}

interface EditorPanelProps {
  specId: string
  editing: Template | null
  seed: TemplateSeed | null
  operations: Operation[]
  onClose: () => void
}

function TemplateEditorPanel({ specId, editing, seed, operations, onClose }: EditorPanelProps) {
  const qc = useQueryClient()
  const isDark = useIsDark()
  const [form, setForm] = useState<FormState>(
    editing
      ? { name: editing.name, statusCode: editing.statusCode, body: editing.body, headers: { ...editing.headers } }
      : seed
        ? { name: seed.name, statusCode: seed.statusCode, body: seed.body, headers: { ...seed.headers } }
        : empty(),
  )
  const [hKey, setHKey] = useState('')
  const [hVal, setHVal] = useState('')
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: (t: FormState) => templatesApi.create(specId, {
      ...t,
      operationId: seed?.operationId,
      sourceExampleId: seed?.sourceExampleId,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates', specId] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormState }) => templatesApi.update(specId, id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates', specId] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  function addHeader() {
    if (!hKey.trim()) return
    setForm(f => ({ ...f, headers: { ...f.headers, [hKey.trim()]: hVal } }))
    setHKey('')
    setHVal('')
  }

  function removeHeader(key: string) {
    setForm(f => { const h = { ...f.headers }; delete h[key]; return { ...f, headers: h } })
  }

  function handleSave() {
    setError('')
    if (!form.name.trim()) { setError('Name is required'); return }
    if (editing) updateMutation.mutate({ id: editing.id, data: form })
    else createMutation.mutate(form)
  }

  const isBusy = createMutation.isPending || updateMutation.isPending
  const operationId = editing?.operationId ?? seed?.operationId
  const operation = operations.find(candidate => candidate.id === operationId)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800">
        <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Template name"
          className="w-56 rounded border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-slate-300 focus:bg-slate-50 focus:outline-none dark:text-slate-100 dark:focus:border-slate-700 dark:focus:bg-slate-800"
        />

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Status</span>
          <input
            type="number"
            value={form.statusCode}
            onChange={e => setForm(f => ({ ...f, statusCode: Number(e.target.value) }))}
            className="w-16 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-xs text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          />
        </div>

        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          operation
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
        }`}>
          {operation ? `${operation.method} ${operation.path}` : 'All operations'}
        </span>

        {error && <span className="text-xs text-red-500">{error}</span>}

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onClose} className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isBusy}
            className="rounded bg-blue-600 px-4 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isBusy ? 'Saving…' : editing ? 'Update' : 'Create'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Monaco */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-8 shrink-0 items-center border-b border-slate-100 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Body · Go template</span>
          </div>
          <div className="flex-1">
            <Editor
              height="100%"
              defaultLanguage="plaintext"
              value={form.body}
              onChange={v => setForm(f => ({ ...f, body: v ?? '' }))}
              theme={isDark ? 'vs-dark' : 'light'}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                padding: { top: 12, bottom: 12 },
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            />
          </div>
        </div>

        {/* Headers panel */}
        <div className="flex w-72 shrink-0 flex-col border-l border-slate-200 dark:border-slate-800">
          <div className="flex h-8 shrink-0 items-center border-b border-slate-100 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Response Headers</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {Object.entries(form.headers).length === 0 ? (
              <p className="px-4 pt-4 text-xs text-slate-400">No headers defined</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(form.headers).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400">{k}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-500 break-all">{v}</div>
                    </div>
                    <button type="button" onClick={() => removeHeader(k)} className="mt-0.5 shrink-0 rounded p-0.5 text-slate-300 hover:text-red-400 dark:text-slate-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-800">
            <div className="space-y-1.5">
              <input
                value={hKey}
                onChange={e => setHKey(e.target.value)}
                placeholder="Header-Name"
                onKeyDown={e => e.key === 'Enter' && addHeader()}
                className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 placeholder-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              />
              <div className="flex gap-1.5">
                <input
                  value={hVal}
                  onChange={e => setHVal(e.target.value)}
                  placeholder="value or {{.key}}"
                  onKeyDown={e => e.key === 'Enter' && addHeader()}
                  className="flex-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 placeholder-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                />
                <button type="button" onClick={addHeader} className="rounded border border-slate-200 bg-white px-2 text-slate-500 hover:bg-slate-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:text-blue-400">
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TemplatesPage() {
  const { specId } = useParams<{ specId: string }>()
  const qc = useQueryClient()
  const [editorOpen, setEditorOpen] = useState(false)
  const [seedModalOpen, setSeedModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [templateSeed, setTemplateSeed] = useState<TemplateSeed | null>(null)

  const { data: spec, isLoading: isSpecLoading, error: specError } = useQuery({
    queryKey: ['specs', specId],
    queryFn: () => specsApi.get(specId!),
    enabled: !!specId,
  })

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates', specId],
    queryFn: () => templatesApi.list(specId!),
    enabled: !!specId,
  })

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) => templatesApi.delete(specId!, templateId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', specId] }),
  })

  function openCreate() {
    setEditingTemplate(null)
    setTemplateSeed(null)
    setSeedModalOpen(true)
  }

  function openEdit(t: Template) {
    setEditingTemplate(t)
    setTemplateSeed(null)
    setEditorOpen(true)
  }

  if (isSpecLoading) return <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
  if (specError || !spec || !specId) return <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load specification.</div>

  const operationByID = new Map(spec.operations.map(operation => [operation.id, operation]))

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Page header */}
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-6 py-3 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Link to="/templates" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
              <ChevronLeft className="h-3.5 w-3.5" /> Templates
            </Link>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <FileCode className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{spec.name}</span>
            {!isLoading && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {templates.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> New Template
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
          ) : templates.length === 0 ? (
            <div className="flex h-60 flex-col items-center justify-center gap-3">
              <FileCode className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500">No templates yet</p>
              <button type="button" onClick={openCreate} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                Create your first template
              </button>
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_64px_120px_auto] items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                <span>Name</span>
                <span>Scope</span>
                <span>Status</span>
                <span>Updated</span>
                <span />
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {templates.map(t => (
                  <div
                    key={t.id}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_64px_120px_auto] items-center gap-4 px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="text-left text-sm font-medium text-slate-800 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-400"
                      >
                        {t.name}
                      </button>
                      {Object.keys(t.headers).length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {Object.entries(t.headers).slice(0, 3).map(([k]) => (
                            <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{k}</span>
                          ))}
                          {Object.keys(t.headers).length > 3 && (
                            <span className="text-[10px] text-slate-400">+{Object.keys(t.headers).length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {t.operationId && operationByID.get(t.operationId) ? (
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-amber-700 dark:text-amber-300">
                          {operationByID.get(t.operationId)!.method} {operationByID.get(t.operationId)!.path}
                        </span>
                        <span className="text-[10px] text-slate-400">Operation only</span>
                      </span>
                    ) : (
                      <span>
                        <span className="block text-xs font-medium text-emerald-700 dark:text-emerald-300">All operations</span>
                        <span className="text-[10px] text-slate-400">Reusable in this spec</span>
                      </span>
                    )}
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-center font-mono text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      {t.statusCode}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(t.updatedAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteMutation.mutate(t.id) }}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {editorOpen && (
        <TemplateEditorPanel
          specId={specId}
          editing={editingTemplate}
          seed={templateSeed}
          operations={spec.operations}
          onClose={() => { setEditorOpen(false); setEditingTemplate(null); setTemplateSeed(null) }}
        />
      )}
      {seedModalOpen && (
        <TemplateSeedModal
          specId={specId}
          operations={spec.operations}
          onSelect={seed => {
            setTemplateSeed(seed)
            setSeedModalOpen(false)
            setEditorOpen(true)
          }}
          onClose={() => setSeedModalOpen(false)}
        />
      )}
    </>
  )
}
