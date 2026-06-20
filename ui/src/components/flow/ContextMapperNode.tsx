import { Handle, Position } from '@xyflow/react'
import { SlidersHorizontal } from 'lucide-react'
import type { Mapping } from '../../types'

interface Props {
  data: { mappings?: Mapping[] }
}

export default function ContextMapperNode({ data }: Props) {
  const mappings: Mapping[] = data.mappings ?? []

  return (
    <div className="min-w-[210px] rounded border border-blue-200 bg-white shadow-sm dark:border-blue-800/60 dark:bg-slate-900">
      <Handle type="target" position={Position.Left} className="!border-blue-300 !bg-blue-400" />

      <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50/60 px-3 py-1.5 dark:border-blue-900/40 dark:bg-blue-950/30">
        <SlidersHorizontal className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-xs font-semibold tracking-wide text-blue-700 dark:text-blue-300">Context Mapper</span>
      </div>

      <div className="px-3 py-2">
        {mappings.length === 0 ? (
          <p className="text-[11px] italic text-slate-400">No mappings configured</p>
        ) : (
          <div className="space-y-1">
            {mappings.slice(0, 4).map((m, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px]">
                <code className="max-w-[90px] truncate text-slate-500 dark:text-slate-400">{m.source}</code>
                <span className="text-slate-300 dark:text-slate-600">→</span>
                <code className="font-medium text-slate-700 dark:text-slate-300">{m.key}</code>
              </div>
            ))}
            {mappings.length > 4 && (
              <p className="text-[10px] text-slate-400">+{mappings.length - 4} more</p>
            )}
          </div>
        )}
        <p className="mt-2 text-center text-[10px] text-slate-300 dark:text-slate-600">double-click to edit</p>
      </div>

      <Handle type="source" position={Position.Right} className="!border-blue-300 !bg-blue-400" />
    </div>
  )
}
