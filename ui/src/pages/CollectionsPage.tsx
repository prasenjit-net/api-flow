import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, FolderOpen, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { collectionsApi } from '../services/api'
import type { Collection } from '../types'

function CollectionEditor({ editing, onClose }: { editing: Collection | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => editing
      ? collectionsApi.update(editing.id, { name, description })
      : collectionsApi.create({ name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] })
      onClose()
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{editing ? 'Edit collection' : 'New collection'}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Name</label>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="users"
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Description</label>
            <input
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="Optional description"
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <button type="button" onClick={onClose} className="rounded border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">Cancel</button>
          <button
            type="button"
            disabled={!name.trim() || mutation.isPending}
            onClick={() => {
              setError('')
              mutation.mutate()
            }}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : editing ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CollectionEditorPage() {
  const { collectionId } = useParams<{ collectionId?: string }>()
  const navigate = useNavigate()
  const { data: collection, isLoading, error } = useQuery({
    queryKey: ['collections', collectionId],
    queryFn: () => collectionsApi.get(collectionId!),
    enabled: !!collectionId,
  })

  if (collectionId && isLoading) return <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
  if (collectionId && (error || !collection)) return <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load collection.</div>

  return <CollectionEditor editing={collectionId ? collection! : null} onClose={() => navigate('/collections')} />
}

export default function CollectionsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<Collection | null | undefined>(undefined)
  const [deleteError, setDeleteError] = useState('')
  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: collectionsApi.list,
  })
  const deleteMutation = useMutation({
    mutationFn: collectionsApi.delete,
    onSuccess: () => {
      setDeleteError('')
      qc.invalidateQueries({ queryKey: ['collections'] })
    },
    onError: (error: Error) => setDeleteError(error.message),
  })

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Database className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Collections</span>
            {!isLoading && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{collections.length}</span>}
          </div>
          <button type="button" onClick={() => setEditing(null)} className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> New Collection
          </button>
        </div>

        {deleteError && <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{deleteError}</div>}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
          ) : collections.length === 0 ? (
            <div className="flex h-60 flex-col items-center justify-center gap-3">
              <Database className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500">No collections yet</p>
              <button type="button" onClick={() => setEditing(null)} className="text-sm text-blue-600 hover:underline dark:text-blue-400">Create your first collection</button>
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
                {collections.map(collection => (
                  <div key={collection.id} className="grid grid-cols-[1fr_1fr_120px_auto] items-center gap-4 px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <button type="button" onClick={() => navigate(`/collections/${collection.id}/documents`)} className="text-left text-sm font-medium text-slate-800 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-400">{collection.name}</button>
                    <span className="truncate text-xs text-slate-500 dark:text-slate-400">{collection.description || '—'}</span>
                    <span className="text-xs text-slate-400">{new Date(collection.updatedAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => navigate(`/collections/${collection.id}/documents`)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" title="View documents">
                        <FolderOpen className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditing(collection)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete "${collection.name}"?`)) deleteMutation.mutate(collection.id)
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

      {editing !== undefined && <CollectionEditor editing={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}
