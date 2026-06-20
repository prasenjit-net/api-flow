import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, GitBranch, CheckCircle2 } from 'lucide-react'
import { specsApi } from '../services/api'
import MethodBadge from '../components/MethodBadge'

export default function SpecificationDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: spec, isLoading, error } = useQuery({
    queryKey: ['specs', id],
    queryFn: () => specsApi.get(id!),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6 text-sm text-gray-400">Loading…</div>
  if (error || !spec) return <div className="p-6 text-sm text-red-500">Failed to load spec.</div>

  return (
    <div className="p-6">
      <Link
        to="/specifications"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ChevronLeft className="h-4 w-4" /> Specifications
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{spec.name}</h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-slate-400">
          <span>Context path: <code className="font-mono">{spec.contextPath}</code></span>
          <span>•</span>
          <span>{spec.operations.length} operation{spec.operations.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {spec.operations.length === 0 ? (
        <p className="text-sm text-gray-400">No operations found in this spec.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-slate-400">Method</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-slate-400">Path</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-slate-400">Summary</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-slate-400">Flow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {spec.operations.map(op => (
                <tr key={op.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <MethodBadge method={op.method} />
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-800 dark:text-slate-200">{op.path}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{op.summary || '—'}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/specifications/${id}/operations/${op.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
                    >
                      {op.hasFlow ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          Edit flow
                        </>
                      ) : (
                        <>
                          <GitBranch className="h-3.5 w-3.5" />
                          Create flow
                        </>
                      )}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
