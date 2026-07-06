import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import { Code2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { scriptsApi } from '../services/api'
import type { Script } from '../types'

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

function ScriptEditor({ editing, onClose }: { editing: Script | null; onClose: () => void }) {
  const qc = useQueryClient()
  const isDark = useIsDark()
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [source, setSource] = useState(editing?.source ?? starterSource)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => editing
      ? scriptsApi.update(editing.id, { name, description, source })
      : scriptsApi.create({ name, description, source }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts'] })
      onClose()
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900">
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
          {mutation.isPending ? 'Saving…' : editing ? 'Update' : 'Create'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <Editor
            height="100%"
            defaultLanguage="python"
            value={source}
            onChange={value => setSource(value ?? '')}
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

export default function ScriptsPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Script | null | undefined>(undefined)
  const [deleteError, setDeleteError] = useState('')
  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts'],
    queryFn: scriptsApi.list,
  })
  const deleteMutation = useMutation({
    mutationFn: scriptsApi.delete,
    onSuccess: () => {
      setDeleteError('')
      qc.invalidateQueries({ queryKey: ['scripts'] })
    },
    onError: (error: Error) => setDeleteError(error.message),
  })

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Code2 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Scripts</span>
            {!isLoading && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{scripts.length}</span>}
          </div>
          <button type="button" onClick={() => setEditing(null)} className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> New Script
          </button>
        </div>

        {deleteError && <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{deleteError}</div>}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
          ) : scripts.length === 0 ? (
            <div className="flex h-60 flex-col items-center justify-center gap-3">
              <Code2 className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500">No Starlark scripts yet</p>
              <button type="button" onClick={() => setEditing(null)} className="text-sm text-blue-600 hover:underline dark:text-blue-400">Create your first script</button>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-[1fr_1fr_120px_auto] items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                <span>Name</span>
                <span>Description</span>
                <span>Updated</span>
                <span />
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {scripts.map(script => (
                  <div key={script.id} className="grid grid-cols-[1fr_1fr_120px_auto] items-center gap-4 px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <button type="button" onClick={() => setEditing(script)} className="text-left text-sm font-medium text-slate-800 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-400">{script.name}</button>
                    <span className="truncate text-xs text-slate-500 dark:text-slate-400">{script.description || '—'}</span>
                    <span className="text-xs text-slate-400">{new Date(script.updatedAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setEditing(script)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete "${script.name}"?`)) deleteMutation.mutate(script.id)
                        }}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
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

      {editing !== undefined && <ScriptEditor editing={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}
