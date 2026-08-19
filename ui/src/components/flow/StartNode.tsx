import { Handle, Position } from '@xyflow/react'
import { ShieldCheck } from 'lucide-react'

export default function StartNode({ selected, data }: { selected?: boolean; data?: { schemaValidation?: { enabled?: boolean } } }) {
  const validationEnabled = data?.schemaValidation?.enabled
  return (
    <div
      aria-label="Start"
      className={`relative flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-emerald-300 bg-transparent p-1.5 shadow-sm dark:border-emerald-700 ${
        selected ? 'ring-2 ring-primary-300 ring-offset-2 dark:ring-primary-700 dark:ring-offset-slate-950' : ''
      }`}
    >
      <span className="h-full w-full rounded-full bg-emerald-100 dark:bg-emerald-900/50" />
      {validationEnabled && (
        <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-primary-600 text-white shadow-sm dark:border-slate-950">
          <ShieldCheck className="h-3.5 w-3.5" />
        </span>
      )}
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-emerald-400 dark:!border-slate-950 dark:!bg-emerald-700" />
    </div>
  )
}
