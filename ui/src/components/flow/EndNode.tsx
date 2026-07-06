import { Handle, Position } from '@xyflow/react'

export default function EndNode({ selected }: { selected?: boolean }) {
  return (
    <div
      aria-label="End"
      className={`flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-red-300 bg-transparent p-1.5 shadow-sm dark:border-red-700 ${
        selected ? 'ring-2 ring-primary-300 ring-offset-2 dark:ring-primary-700 dark:ring-offset-slate-950' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-red-400 dark:!border-slate-950 dark:!bg-red-700" />
      <span className="h-full w-full rounded-full bg-red-100 dark:bg-red-900/50" />
    </div>
  )
}
