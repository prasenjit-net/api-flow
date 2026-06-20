import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Upload } from 'lucide-react'
import { specsApi } from '../services/api'

interface Props {
  onClose: () => void
}

export default function UploadSpecModal({ onClose }: Props) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [contextPath, setContextPath] = useState('/')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (fd: FormData) => specsApi.upload(fd),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['specs'] }); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Please select a file'); return }
    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', name)
    fd.append('contextPath', contextPath || '/')
    mutation.mutate(fd)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Upload OpenAPI Spec</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Name <span className="text-slate-400 font-normal">(optional — defaults to spec title)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Context Path</label>
            <input
              type="text"
              value={contextPath}
              onChange={e => setContextPath(e.target.value)}
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-1 text-[11px] text-slate-400">Prefix for all registered routes, e.g. <code className="font-mono">/v1</code></p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Spec File <span className="text-red-400">*</span>
            </label>
            <label className="flex w-full cursor-pointer items-center gap-3 rounded border border-dashed border-slate-300 px-4 py-4 transition hover:border-blue-400 dark:border-slate-700 dark:hover:border-blue-600">
              <Upload className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {fileName || 'Click to select — YAML or JSON'}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".yaml,.yml,.json"
                className="hidden"
                onChange={e => setFileName(e.target.files?.[0]?.name ?? '')}
              />
            </label>
          </div>

          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {mutation.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
