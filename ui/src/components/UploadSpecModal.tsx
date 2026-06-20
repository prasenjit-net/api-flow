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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['specs'] })
      onClose()
    },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Upload OpenAPI Spec</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">Name <span className="text-gray-400">(optional)</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Leave blank to use spec title"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">Context Path</label>
            <input
              type="text"
              value={contextPath}
              onChange={e => setContextPath(e.target.value)}
              placeholder="/"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Prefix prepended to all registered routes, e.g. <code>/v1</code></p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">Spec File <span className="text-red-500">*</span></label>
            <label className="flex w-full cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 px-4 py-5 transition hover:border-blue-400 dark:border-slate-600 dark:hover:border-blue-500">
              <Upload className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-slate-400">
                {fileName || 'Click to select YAML or JSON'}
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

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {mutation.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
