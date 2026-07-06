import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, FileCode, FileJson } from 'lucide-react'
import { specsApi } from '../services/api'

export default function TemplatesIndexPage() {
  const { data: specs = [], isLoading, error } = useQuery({
    queryKey: ['specs'],
    queryFn: specsApi.list,
  })

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <FileCode className="h-5 w-5 text-slate-400" />
          <div>
            <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">Templates</h1>
            <p className="mt-0.5 text-xs text-slate-500">Choose a specification to manage its response templates.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading specifications…</div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load specifications.</div>
        ) : specs.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-3">
            <FileJson className="h-9 w-9 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500">Upload a specification before creating templates.</p>
            <Link to="/specifications" className="text-sm text-primary-600 hover:underline dark:text-primary-400">Go to specifications</Link>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900">
              <span>Specification</span>
              <span>Context path</span>
              <span />
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {specs.map(spec => (
                <Link
                  key={spec.id}
                  to={`/templates/${spec.id}`}
                  className="grid grid-cols-[1fr_1fr_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="rounded-lg bg-primary-50 p-2 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                      <FileJson className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{spec.name}</span>
                  </span>
                  <code className="truncate text-xs text-slate-500 dark:text-slate-400">{spec.contextPath}</code>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
