import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import { Code2, Pencil, Plus, Trash2, Wand2, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { scriptsApi } from '../services/api'
import type { Script } from '../types'
import { configureStarlarkEditor, prettifyScriptSource } from '../components/editor/monacoLanguages'

const starterSource = `def run(input):
    # Only explicitly mapped variables are available in input.
    return {
        "value": input.get("value"),
    }
`

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

function ScriptEditor({ specId, editing, onClose }: { specId: string; editing: Script | null; onClose: () => void }) {
  const qc = useQueryClient()
  const isDark = useIsDark()
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [source, setSource] = useState(editing?.source ?? starterSource)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => editing
      ? scriptsApi.update(specId, editing.id, { name, description, source })
      : scriptsApi.create(specId, { name, description, source }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts', specId] })
      onClose()
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900">
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
        <button type="button" onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Script name"
          className="w-56 rounded border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-slate-800 focus:border-slate-300 focus:bg-slate-50 focus:outline-none dark:text-slate-100 dark:focus:border-slate-700 dark:focus:bg-slate-800"
        />
        <input
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder="Optional description"
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-xs text-slate-600 focus:border-slate-300 focus:bg-slate-50 focus:outline-none dark:text-slate-300 dark:focus:border-slate-700 dark:focus:bg-slate-800"
        />
        {error && <span className="max-w-sm truncate text-xs text-red-500">{error}</span>}
        <button
          type="button"
          onClick={() => setSource(current => prettifyScriptSource(current))}
          className="inline-flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-300"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Prettify
        </button>
        <button type="button" onClick={onClose} className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Discard
        </button>
        <button
          type="button"
          onClick={() => {
            setError('')
            mutation.mutate()
          }}
          disabled={!name.trim() || !source.trim() || mutation.isPending}
          className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <Editor
            height="100%"
            defaultLanguage="python"
            language="python"
            value={source}
            onChange={value => setSource(value ?? '')}
            beforeMount={configureStarlarkEditor}
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
        <aside className="w-72 shrink-0 border-l border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Execution contract</h2>
          <div className="mt-3 space-y-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            <p>Define <code className="font-mono text-slate-700 dark:text-slate-200">run(input)</code>.</p>
            <p>Only variables mapped on the flow node appear in <code className="font-mono text-slate-700 dark:text-slate-200">input</code>.</p>
            <p>Return a JSON-compatible value. It is appended to workflow context under the node name.</p>
            <p>Filesystem, network, module loading, environment, and process APIs are unavailable.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

export function ScriptEditorPage() {
  const { specId, scriptId } = useParams<{ specId: string; scriptId?: string }>()
  const navigate = useNavigate()
  const { data: script, isLoading, error } = useQuery({
    queryKey: ['scripts', specId, scriptId],
    queryFn: () => scriptsApi.get(specId!, scriptId!),
    enabled: !!specId && !!scriptId,
  })

  if (!specId) return <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load specification.</div>
  if (scriptId && isLoading) return <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading...</div>
  if (scriptId && (error || !script)) return <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load script.</div>

  return <ScriptEditor specId={specId} editing={scriptId ? script! : null} onClose={() => navigate(`/specifications/${specId}?tab=scripts`)} />
}

export function ScriptsPanel({ specId, showHeader = true }: { specId: string; showHeader?: boolean }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [deleteError, setDeleteError] = useState('')
  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts', specId],
    queryFn: () => scriptsApi.list(specId),
    enabled: !!specId,
  })
  const deleteMutation = useMutation({
    mutationFn: (scriptId: string) => scriptsApi.delete(specId, scriptId),
    onSuccess: () => {
      setDeleteError('')
      qc.invalidateQueries({ queryKey: ['scripts', specId] })
    },
    onError: (error: Error) => setDeleteError(error.message),
  })

  return (
    <div className="flex h-full flex-col">
      {showHeader ? (
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Code2 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Scripts</span>
            {!isLoading && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{scripts.length}</span>}
          </div>
          <button type="button" onClick={() => navigate(`/specifications/${specId}/scripts/new`)} className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> New Script
          </button>
        </div>
      ) : (
        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
          <div className="flex items-center gap-3">
            <Code2 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Scripts</span>
            {!isLoading && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{scripts.length}</span>}
          </div>
          <button type="button" onClick={() => navigate(`/specifications/${specId}/scripts/new`)} className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> New Script
          </button>
        </div>
      )}

      {deleteError && <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{deleteError}</div>}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : scripts.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-3">
            <Code2 className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500">No Starlark scripts yet</p>
            <button type="button" onClick={() => navigate(`/specifications/${specId}/scripts/new`)} className="text-sm text-blue-600 hover:underline dark:text-blue-400">Create your first script</button>
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[1fr_1fr_120px_auto] items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900 md:grid">
              <span>Name</span>
              <span>Description</span>
              <span>Updated</span>
              <span />
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {scripts.map(script => (
                <div key={script.id} className="grid gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 md:grid-cols-[1fr_1fr_120px_auto] md:items-center md:gap-4 md:px-6">
                  <button type="button" onClick={() => navigate(`/specifications/${specId}/scripts/${script.id}/edit`)} className="text-left text-sm font-medium text-slate-800 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-400">{script.name}</button>
                  <span className="text-xs text-slate-500 dark:text-slate-400 md:truncate">{script.description || '-'}</span>
                  <span className="text-xs text-slate-400">{new Date(script.updatedAt).toLocaleDateString()}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => navigate(`/specifications/${specId}/scripts/${script.id}/edit`)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${script.name}"?`)) deleteMutation.mutate(script.id)
                      }}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      title="Delete"
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
  )
}

export default function ScriptsPage() {
  const { specId } = useParams<{ specId: string }>()
  if (!specId) return <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load specification.</div>
  return <ScriptsPanel specId={specId} />
}
