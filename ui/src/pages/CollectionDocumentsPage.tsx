import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import { ChevronLeft, FileJson, Pencil, Plus, Trash2, Wand2, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { collectionsApi, documentsApi } from '../services/api'
import type { CollectionDocument } from '../types'
import { prettifyTemplateBody } from '../components/editor/monacoLanguages'

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

function DocumentEditor({ collectionId, editing, onClose }: { collectionId: string; editing: CollectionDocument | null; onClose: () => void }) {
  const qc = useQueryClient()
  const isDark = useIsDark()
  const [source, setSource] = useState(editing ? JSON.stringify(editing.data, null, 2) : '{\n  \n}')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      let data: Record<string, unknown>
      try {
        data = JSON.parse(source)
      } catch {
        throw new Error('Document body must be valid JSON')
      }
      return editing
        ? documentsApi.update(collectionId, editing.id, data)
        : documentsApi.create(collectionId, data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', collectionId] })
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
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{editing ? `Edit document ${editing.id}` : 'New document'}</span>
        {error && <span className="max-w-sm truncate text-xs text-red-500">{error}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSource(current => prettifyTemplateBody(current))}
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-300"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Format
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
            disabled={mutation.isPending}
            className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : editing ? 'Update' : 'Create'}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          defaultLanguage="json"
          language="json"
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
    </div>
  )
}

export function DocumentEditorPage() {
  const { collectionId, documentId } = useParams<{ collectionId: string; documentId?: string }>()
  const navigate = useNavigate()
  const { data: document, isLoading, error } = useQuery({
    queryKey: ['documents', collectionId, documentId],
    queryFn: () => documentsApi.get(collectionId!, documentId!),
    enabled: !!collectionId && !!documentId,
  })

  if (documentId && isLoading) return <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
  if (documentId && (error || !document)) return <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load document.</div>

  return (
    <DocumentEditor
      collectionId={collectionId!}
      editing={documentId ? document! : null}
      onClose={() => navigate(`/collections/${collectionId}/documents`)}
    />
  )
}

export default function CollectionDocumentsPage() {
  const { collectionId } = useParams<{ collectionId: string }>()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [deleteError, setDeleteError] = useState('')

  const { data: collection } = useQuery({
    queryKey: ['collections', collectionId],
    queryFn: () => collectionsApi.get(collectionId!),
    enabled: !!collectionId,
  })

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', collectionId],
    queryFn: () => documentsApi.list(collectionId!),
    enabled: !!collectionId,
  })

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => documentsApi.delete(collectionId!, documentId),
    onSuccess: () => {
      setDeleteError('')
      qc.invalidateQueries({ queryKey: ['documents', collectionId] })
    },
    onError: (error: Error) => setDeleteError(error.message),
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-14 shrink-0 flex-col gap-2 border-b border-slate-200 px-6 py-3 dark:border-slate-800">
        <Link to="/collections" className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to collections
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileJson className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{collection?.name ?? 'Documents'}</span>
            {!isLoading && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{documents.length}</span>}
          </div>
          <button type="button" onClick={() => navigate(`/collections/${collectionId}/documents/new`)} className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> New Document
          </button>
        </div>
      </div>

      {deleteError && <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{deleteError}</div>}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
        ) : documents.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-3">
            <FileJson className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500">No documents yet</p>
            <button type="button" onClick={() => navigate(`/collections/${collectionId}/documents/new`)} className="text-sm text-blue-600 hover:underline dark:text-blue-400">Create your first document</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {documents.map(document => (
              <div key={document.id} className="flex items-start justify-between gap-4 px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                <button
                  type="button"
                  onClick={() => navigate(`/collections/${collectionId}/documents/${document.id}/edit`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="font-mono text-xs text-slate-400">{document.id}</div>
                  <pre className="mt-1 max-h-16 overflow-hidden truncate text-xs text-slate-700 dark:text-slate-300">
                    {JSON.stringify(document.data)}
                  </pre>
                  <div className="mt-1 text-[11px] text-slate-400">Updated {new Date(document.updatedAt).toLocaleString()}</div>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => navigate(`/collections/${collectionId}/documents/${document.id}/edit`)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Delete this document?')) deleteMutation.mutate(document.id)
                    }}
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
