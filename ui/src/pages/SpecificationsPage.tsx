import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, Trash2, ChevronRight, FileJson } from 'lucide-react'
import { specsApi } from '../services/api'
import UploadSpecModal from '../components/UploadSpecModal'
import type { SpecMeta } from '../types'

function DeleteSpecModal({
  spec,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  spec: SpecMeta | null
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!spec) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-50 p-2 text-red-500 dark:bg-red-950/40">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Delete {spec.name}?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              This removes the specification, release history, flows, templates, and collections from the local store. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isDeleting} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {isDeleting ? 'Deleting...' : 'Delete specification'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SpecificationsPage() {
  const [showUpload, setShowUpload] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SpecMeta | null>(null)
  const qc = useQueryClient()

  const { data: specs = [], isLoading } = useQuery({
    queryKey: ['specs'],
    queryFn: specsApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: specsApi.delete,
    onSuccess: () => {
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['specs'] })
    },
  })

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
          <div className="flex items-center gap-3">
            <FileJson className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Specifications</span>
            {!isLoading && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {specs.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> Upload Spec
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading…</div>
          ) : specs.length === 0 ? (
            <div className="flex h-60 flex-col items-center justify-center gap-3">
              <FileJson className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500">No specifications uploaded yet</p>
              <button type="button" onClick={() => setShowUpload(true)} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                Upload your first spec
              </button>
            </div>
          ) : (
            <div>
              <div className="hidden grid-cols-[1fr_140px_110px_120px_40px] items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900 md:grid">
                <span>Name</span>
                <span>Context Path</span>
                <span>Published</span>
                <span>Uploaded</span>
                <span />
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {specs.map(spec => (
                  <div
                    key={spec.id}
                    className="grid gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 md:grid-cols-[1fr_140px_110px_120px_40px] md:items-center md:gap-4 md:px-6"
                  >
                    <Link
                      to={`/specifications/${spec.id}`}
                      className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-800 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-400"
                    >
                      <span className="truncate">{spec.name}</span>
                      {spec.draftDirty && (
                        <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                          dirty
                        </span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                    </Link>
                    <code className="break-all font-mono text-xs text-slate-500 dark:text-slate-400">{spec.contextPath}</code>
                    <div className="flex flex-wrap items-center gap-2 md:block">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {spec.publishedSnapshot ? 'SNAPSHOT' : spec.publishedVersion > 0 ? `v${spec.publishedVersion}` : 'none'}
                      </span>
                      {spec.draftDirty && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 md:hidden">
                          needs release
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(spec.uploadedAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(spec)}
                      className="w-fit rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400 md:justify-self-end"
                      title="Delete specification"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showUpload && <UploadSpecModal onClose={() => setShowUpload(false)} />}
      <DeleteSpecModal
        spec={deleteTarget}
        isDeleting={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
      />
    </>
  )
}
