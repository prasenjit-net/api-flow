import { Handle, Position, useReactFlow } from '@xyflow/react'
import { FileCode } from 'lucide-react'
import type { Template } from '../../types'

interface Props {
  id: string
  data: { templateId?: string; _templates?: Template[] }
}

export default function TemplateNode({ id, data }: Props) {
  const { updateNodeData } = useReactFlow()
  const templates: Template[] = data._templates ?? []
  const selected = templates.find(t => t.id === data.templateId)

  return (
    <div className="min-w-[260px] rounded-xl border-2 border-purple-400 bg-white shadow-md dark:border-purple-500 dark:bg-slate-900">
      <Handle type="target" position={Position.Left} className="!border-purple-400 !bg-purple-400" />

      <div className="flex items-center gap-2 border-b border-purple-100 bg-purple-50 px-3 py-2 dark:border-purple-900/40 dark:bg-purple-900/20">
        <FileCode className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">Template</span>
      </div>

      <div className="p-3">
        <select
          value={data.templateId ?? ''}
          onChange={e => updateNodeData(id, { templateId: e.target.value, _templates: templates })}
          className="nodrag w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="">— select a template —</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        {selected && (
          <div className="mt-2 rounded bg-gray-50 p-2 dark:bg-slate-800">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-mono font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                {selected.statusCode}
              </span>
              <span className="text-xs text-gray-500 dark:text-slate-400">{selected.name}</span>
            </div>
            {selected.body && (
              <pre className="max-h-20 overflow-hidden text-ellipsis whitespace-pre-wrap break-all text-xs text-gray-600 dark:text-slate-400">
                {selected.body.slice(0, 120)}{selected.body.length > 120 ? '…' : ''}
              </pre>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!border-purple-400 !bg-purple-400" />
    </div>
  )
}
