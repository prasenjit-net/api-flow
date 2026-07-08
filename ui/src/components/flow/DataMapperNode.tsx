import { Handle, Position } from '@xyflow/react'
import { Database } from 'lucide-react'
import type { Collection, DataMapperOperation } from '../../types'

interface Props {
  data: { name?: string; collectionId?: string; operation?: DataMapperOperation; _collections?: Collection[] }
  selected?: boolean
}

const operationLabels: Record<DataMapperOperation, string> = {
  insert: 'Insert',
  findOne: 'Find one',
  findMany: 'Find many',
  update: 'Update',
  upsert: 'Upsert',
  delete: 'Delete',
}

export default function DataMapperNode({ data, selected }: Props) {
  const collection = (data._collections ?? []).find(candidate => candidate.id === data.collectionId)

  return (
    <div className={`w-[232px] rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-emerald-900 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100 ${
      selected ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-900/40' : ''
    }`}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-primary-500 dark:!border-slate-900" />
      <div className="flex items-start gap-2.5">
        <div className="rounded-md bg-emerald-100 p-1.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
          <Database className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-gray-900 dark:text-slate-100">{data.name || 'Data Mapper'}</div>
          <div className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200">
            {data.operation ? operationLabels[data.operation] : 'No operation'}
          </div>
          <p className={`mt-1.5 truncate text-[11px] ${collection ? 'font-medium text-slate-700 dark:text-slate-300' : 'italic text-gray-500 dark:text-slate-400'}`}>
            {collection?.name ?? 'No collection selected'}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-primary-500 dark:!border-slate-900" />
    </div>
  )
}
