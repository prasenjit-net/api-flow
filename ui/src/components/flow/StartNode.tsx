import { Handle, Position } from '@xyflow/react'

export default function StartNode() {
  return (
    <div className="flex min-w-[130px] flex-col items-center rounded border border-emerald-200 bg-white px-4 py-2.5 shadow-sm dark:border-emerald-800/60 dark:bg-slate-900">
      <div className="mb-0.5 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-300">Start</span>
      </div>
      <span className="text-[10px] text-slate-400">Request arrives</span>
      <Handle type="source" position={Position.Right} className="!border-emerald-300 !bg-emerald-400" />
    </div>
  )
}
