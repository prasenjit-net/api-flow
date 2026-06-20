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
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Specifications</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Manage your OpenAPI 3 specs</p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Upload Spec
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : specs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center dark:border-slate-700">
          <FileJson className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">No specs uploaded yet</p>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="mt-3 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            Upload your first spec
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-slate-400">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-slate-400">Context Path</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-slate-400">Uploaded</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {specs.map(spec => (
                <tr key={spec.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/specifications/${spec.id}`}
                      className="flex items-center gap-2 font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {spec.name}
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-600 dark:text-slate-400">{spec.contextPath}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400">
                    {new Date(spec.uploadedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${spec.name}"?`)) deleteMutation.mutate(spec.id)
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && <UploadSpecModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}
