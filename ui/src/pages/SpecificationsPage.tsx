import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ChevronRight, FileJson } from 'lucide-react'
import { specsApi } from '../services/api'
import UploadSpecModal from '../components/UploadSpecModal'

export default function SpecificationsPage() {
  const [showUpload, setShowUpload] = useState(false)
  const qc = useQueryClient()

  const { data: specs = [], isLoading } = useQuery({
    queryKey: ['specs'],
    queryFn: specsApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: specsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specs'] }),
  })

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-800">
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
              <div className="grid grid-cols-[1fr_140px_120px_40px] items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                <span>Name</span>
                <span>Context Path</span>
                <span>Uploaded</span>
                <span />
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {specs.map(spec => (
                  <div
                    key={spec.id}
                    className="grid grid-cols-[1fr_140px_120px_40px] items-center gap-4 px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                  >
                    <Link
                      to={`/specifications/${spec.id}`}
                      className="flex items-center gap-1.5 text-sm font-medium text-slate-800 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-400"
                    >
                      {spec.name}
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                    </Link>
                    <code className="font-mono text-xs text-slate-500 dark:text-slate-400">{spec.contextPath}</code>
                    <span className="text-xs text-slate-400">
                      {new Date(spec.uploadedAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => { if (confirm(`Delete "${spec.name}"?`)) deleteMutation.mutate(spec.id) }}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
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
    </>
  )
}
