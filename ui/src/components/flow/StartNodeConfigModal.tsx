import { useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import type { Operation, SchemaValidationConfig } from '../../types'

interface Props {
  schemaValidation?: SchemaValidationConfig
  operation?: Operation
  onSave: (schemaValidation: SchemaValidationConfig | undefined) => void
  onClose: () => void
}

export default function StartNodeConfigModal({ schemaValidation, operation, onSave, onClose }: Props) {
  const [enabled, setEnabled] = useState(schemaValidation?.enabled ?? false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Start node</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Configure request handling before the flow branches.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {operation && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                  {operation.method}
                </span>
                <code className="text-xs text-slate-600 dark:text-slate-300">{operation.path}</code>
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <input
              type="checkbox"
              checked={enabled}
              onChange={event => setEnabled(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                <ShieldCheck className="h-4 w-4 text-primary-600 dark:text-primary-300" />
                Validate request body schema
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                Validation results are written to validation.schema so branches and templates can render custom responses.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(enabled ? { enabled: true } : undefined)
              onClose()
            }}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Apply config
          </button>
        </div>
      </div>
    </div>
  )
}
