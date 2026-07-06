import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileCode, FilePlus2, X } from 'lucide-react'
import { templatesApi } from '../../services/api'
import type { Operation, TemplateExample } from '../../types'

export interface TemplateSeed {
  operationId?: string
  sourceExampleId?: string
  name: string
  statusCode: number
  body: string
  headers: Record<string, string>
}

interface Props {
  specId: string
  operations: Operation[]
  onSelect: (seed: TemplateSeed) => void
  onClose: () => void
}

export default function TemplateSeedModal({ specId, operations, onSelect, onClose }: Props) {
  const [operationId, setOperationId] = useState('')
  const operation = operations.find(candidate => candidate.id === operationId)
  const { data: examples = [], isLoading } = useQuery({
    queryKey: ['template-examples', specId, operationId],
    queryFn: () => templatesApi.examples(specId, operationId),
    enabled: !!operationId,
  })

  function selectExample(example: TemplateExample) {
    onSelect({
      operationId,
      sourceExampleId: example.id,
      name: example.name,
      statusCode: example.statusCode,
      body: example.body,
      headers: { ...example.headers },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Start a template</h2>
            <p className="mt-0.5 text-xs text-slate-500">Create a reusable blank template, or seed one from an operation response.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <button
            type="button"
            onClick={() => onSelect({ name: '', statusCode: 200, body: '', headers: {} })}
            className="flex w-full items-start gap-3 rounded-xl border border-dashed border-primary-300 bg-primary-50/50 p-4 text-left transition-colors hover:bg-primary-50 dark:border-primary-800 dark:bg-primary-950/20 dark:hover:bg-primary-950/30"
          >
            <FilePlus2 className="mt-0.5 h-5 w-5 text-primary-500" />
            <span>
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Custom reusable template</span>
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Start empty. This template can be selected by every operation in this specification.</span>
            </span>
          </button>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Or select an operation</label>
            <select
              value={operationId}
              onChange={event => setOperationId(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">— choose an operation —</option>
              {operations.map(candidate => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.method} {candidate.path}{candidate.summary ? ` — ${candidate.summary}` : ''}
                </option>
              ))}
            </select>
          </div>

          {operation && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Starting data</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">The resulting template will only be available to {operation.method} {operation.path}.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelect({
                  operationId,
                  name: '',
                  statusCode: 200,
                  body: '',
                  headers: {},
                })}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 p-3 text-left hover:border-primary-300 hover:bg-primary-50/40 dark:border-slate-700 dark:hover:border-primary-800 dark:hover:bg-primary-950/20"
              >
                <FileCode className="h-4 w-4 text-slate-400" />
                <span>
                  <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Blank for this operation</span>
                  <span className="block text-xs text-slate-400">No initial response data.</span>
                </span>
              </button>

              {isLoading ? (
                <div className="py-8 text-center text-sm text-slate-400">Loading response examples…</div>
              ) : examples.length === 0 ? (
                <div className="rounded-lg bg-slate-50 px-4 py-5 text-center text-xs text-slate-400 dark:bg-slate-800/50">
                  No explicit response examples were found for this operation.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {examples.map(example => (
                    <button
                      key={example.id}
                      type="button"
                      onClick={() => selectExample(example)}
                      className="min-w-0 rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40 dark:border-slate-700 dark:hover:border-primary-800 dark:hover:bg-primary-950/20"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{example.statusCode}</span>
                        <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{example.name}</span>
                      </div>
                      <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">{example.mediaType}</p>
                      <pre className="mt-1.5 max-h-24 overflow-hidden whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {example.body.slice(0, 240)}{example.body.length > 240 ? '…' : ''}
                      </pre>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
