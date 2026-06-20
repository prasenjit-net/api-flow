import { Handle, Position } from '@xyflow/react'
import { Play } from 'lucide-react'

export default function StartNode() {
  return (
    <div className="flex min-w-[140px] flex-col items-center rounded-xl border-2 border-green-500 bg-green-50 px-4 py-3 shadow-sm dark:bg-green-900/20">
      <div className="mb-1 flex items-center gap-2">
        <Play className="h-4 w-4 text-green-600 dark:text-green-400" />
        <span className="text-sm font-semibold text-green-700 dark:text-green-300">Start</span>
      </div>
      <span className="text-xs text-green-600/70 dark:text-green-400/70">Request arrives</span>
      <Handle type="source" position={Position.Right} className="!border-green-500 !bg-green-500" />
    </div>
  )
}
