import { Handle, Position } from '@xyflow/react'
import { FileCode } from 'lucide-react'
import type { Template } from '../../types'

interface Props {
  data: { name?: string; templateId?: string; _templates?: Template[] }
  selected?: boolean
}

export default function TemplateNode({ data, selected: isSelected }: Props) {
  const templates: Template[] = data._templates ?? []
  const selected = templates.find(t => t.id === data.templateId)

  return (
    <div
      className={`w-[232px] rounded-2xl border border-violet-300 bg-violet-50 px-3 py-2.5 text-violet-900 shadow-sm dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100 ${
        isSelected ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-900/40' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-primary-500 dark:!border-slate-900" />

      <div className="flex items-start gap-2.5">
        <div className="rounded-md bg-violet-100 p-1.5 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
          <FileCode className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-gray-900 dark:text-slate-100">{data.name || 'Template'}</div>
          <div className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-900/50 dark:text-violet-200">
            Response
          </div>
          {selected ? (
            <div className="mt-1.5 flex min-w-0 items-center gap-2">
              <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 shadow-sm dark:bg-slate-900/60 dark:text-slate-300">
                {selected.statusCode}
              </span>
              <span className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-300">{selected.name}</span>
            </div>
          ) : (
            <p className="mt-1.5 text-[11px] italic text-gray-500 dark:text-slate-400">No template selected</p>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-primary-500 dark:!border-slate-900" />
    </div>
  )
}
