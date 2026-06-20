import { Handle, Position } from '@xyflow/react'
import { FileCode } from 'lucide-react'
import type { Template } from '../../types'

interface Props {
  data: { templateId?: string; _templates?: Template[] }
}

export default function TemplateNode({ data }: Props) {
  const templates: Template[] = data._templates ?? []
  const selected = templates.find(t => t.id === data.templateId)

  return (
    <div className="min-w-[210px] rounded border border-violet-200 bg-white shadow-sm dark:border-violet-800/60 dark:bg-slate-900">
      <Handle type="target" position={Position.Left} className="!border-violet-300 !bg-violet-400" />

      <div className="flex items-center gap-2 border-b border-violet-100 bg-violet-50/60 px-3 py-1.5 dark:border-violet-900/40 dark:bg-violet-950/30">
        <FileCode className="h-3.5 w-3.5 text-violet-500" />
        <span className="text-xs font-semibold tracking-wide text-violet-700 dark:text-violet-300">Template</span>
      </div>

      <div className="px-3 py-2">
        {selected ? (
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {selected.statusCode}
            </span>
            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">{selected.name}</span>
          </div>
        ) : (
          <p className="text-[11px] italic text-slate-400">No template selected</p>
        )}
        <p className="mt-2 text-center text-[10px] text-slate-300 dark:text-slate-600">double-click to edit</p>
      </div>

      <Handle type="source" position={Position.Right} className="!border-violet-300 !bg-violet-400" />
    </div>
  )
}
