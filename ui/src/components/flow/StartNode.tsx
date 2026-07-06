import { Handle, Position } from '@xyflow/react'

export default function StartNode({ selected }: { selected?: boolean }) {
  return (
    <div
      aria-label="Start"
      className={`flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-emerald-300 bg-transparent p-1.5 shadow-sm dark:border-emerald-700 ${
        selected ? 'ring-2 ring-primary-300 ring-offset-2 dark:ring-primary-700 dark:ring-offset-slate-950' : ''
      }`}
    >
      <span className="h-full w-full rounded-full bg-emerald-100 dark:bg-emerald-900/50" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-emerald-400 dark:!border-slate-950 dark:!bg-emerald-700" />
    </div>
  )
}
