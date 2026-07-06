import { Handle, Position } from '@xyflow/react'
import { SlidersHorizontal } from 'lucide-react'
import type { Mapping } from '../../types'

interface Props {
  data: { name?: string; mappings?: Mapping[] }
  selected?: boolean
}

export default function ContextMapperNode({ data, selected }: Props) {
  const mappings: Mapping[] = data.mappings ?? []

  return (
    <div
      className={`w-[232px] rounded-2xl border border-sky-300 bg-sky-50 px-3 py-2.5 text-sky-900 shadow-sm dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100 ${
        selected ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-900/40' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-primary-500 dark:!border-slate-900" />

      <div className="flex items-start gap-2.5">
        <div className="rounded-md bg-sky-100 p-1.5 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-gray-900 dark:text-slate-100">{data.name || 'Context Mapper'}</div>
          <div className="mt-1 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-900/50 dark:text-sky-200">
            Mapper · {mappings.length === 1 ? '1 input' : `${mappings.length} inputs`}
          </div>
          {mappings.length === 0 ? (
            <p className="mt-1.5 text-[11px] italic text-gray-500 dark:text-slate-400">No mappings configured</p>
          ) : (
            <div className="mt-1.5 space-y-1">
              {mappings.slice(0, 3).map((m, i) => (
                <div key={i} className="flex min-w-0 items-center gap-1.5 text-[11px]">
                  <code className="max-w-[82px] truncate text-slate-500 dark:text-slate-400">
                    {(m.type ?? 'context') === 'constant' ? JSON.stringify(m.value ?? null) : m.source}
                  </code>
                  <span className="text-slate-300 dark:text-slate-600">→</span>
                  <code className="truncate font-medium text-slate-700 dark:text-slate-300">{m.key}</code>
                </div>
              ))}
              {mappings.length > 3 && (
                <p className="text-[10px] text-slate-400">+{mappings.length - 3} more</p>
              )}
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-primary-500 dark:!border-slate-900" />
    </div>
  )
}
