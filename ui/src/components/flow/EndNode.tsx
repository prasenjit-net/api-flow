import { Handle, Position } from '@xyflow/react'

export default function EndNode() {
  return (
    <div className="flex min-w-[130px] flex-col items-center rounded border border-slate-300 bg-white px-4 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <Handle type="target" position={Position.Left} className="!border-slate-400 !bg-slate-500" />
      <div className="mb-0.5 flex items-center gap-2">
        <span className="h-2 w-2 rounded bg-slate-500" />
        <span className="text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-400">End</span>
      </div>
      <span className="text-[10px] text-slate-400">Response sent</span>
    </div>
  )
}
