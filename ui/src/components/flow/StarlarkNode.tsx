import { Handle, Position } from '@xyflow/react'
import { Code2 } from 'lucide-react'
import type { Mapping, Script } from '../../types'

interface Props {
  data: { name?: string; scriptId?: string; mappings?: Mapping[]; _scripts?: Script[] }
  selected?: boolean
}

export default function StarlarkNode({ data, selected }: Props) {
  const mappings = data.mappings ?? []
  const script = (data._scripts ?? []).find(candidate => candidate.id === data.scriptId)

  return (
    <div className={`w-[232px] rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 ${
      selected ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-900/40' : ''
    }`}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-primary-500 dark:!border-slate-900" />
      <div className="flex items-start gap-2.5">
        <div className="rounded-md bg-amber-100 p-1.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
          <Code2 className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-gray-900 dark:text-slate-100">{data.name || 'Starlark'}</div>
          <div className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/50 dark:text-amber-200">
            Script · {mappings.length === 1 ? '1 input' : `${mappings.length} inputs`}
          </div>
          <p className={`mt-1.5 truncate text-[11px] ${script ? 'font-medium text-slate-700 dark:text-slate-300' : 'italic text-gray-500 dark:text-slate-400'}`}>
            {script?.name ?? 'No script selected'}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-primary-500 dark:!border-slate-900" />
    </div>
  )
}
