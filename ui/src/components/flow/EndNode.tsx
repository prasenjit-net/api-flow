import { Handle, Position } from '@xyflow/react'
import { Square } from 'lucide-react'

export default function EndNode() {
  return (
    <div className="flex min-w-[140px] flex-col items-center rounded-xl border-2 border-slate-500 bg-slate-50 px-4 py-3 shadow-sm dark:bg-slate-800">
      <Handle type="target" position={Position.Left} className="!border-slate-500 !bg-slate-500" />
      <div className="mb-1 flex items-center gap-2">
        <Square className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">End</span>
      </div>
      <span className="text-xs text-slate-500">Response sent</span>
    </div>
  )
}
