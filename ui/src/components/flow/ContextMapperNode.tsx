import { Handle, Position, useReactFlow } from '@xyflow/react'
import { Plus, Trash2, ArrowRight } from 'lucide-react'
import type { Mapping } from '../../types'

interface Props {
  id: string
  data: { mappings?: Mapping[] }
}

export default function ContextMapperNode({ id, data }: Props) {
  const { updateNodeData } = useReactFlow()
  const mappings: Mapping[] = data.mappings ?? []

  function updateMappings(next: Mapping[]) {
    updateNodeData(id, { mappings: next })
  }

  function addRow() {
    updateMappings([...mappings, { source: '', key: '' }])
  }

  function removeRow(i: number) {
    updateMappings(mappings.filter((_, idx) => idx !== i))
  }

  function updateRow(i: number, field: keyof Mapping, value: string) {
    updateMappings(mappings.map((m, idx) => idx === i ? { ...m, [field]: value } : m))
  }

  return (
    <div className="min-w-[340px] rounded-xl border-2 border-blue-400 bg-white shadow-md dark:border-blue-500 dark:bg-slate-900">
      <Handle type="target" position={Position.Left} className="!border-blue-400 !bg-blue-400" />

      <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-3 py-2 dark:border-blue-900/40 dark:bg-blue-900/20">
        <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Context Mapper</span>
      </div>

      <div className="p-3">
        {mappings.length === 0 && (
          <p className="mb-2 text-center text-xs text-gray-400">No mappings yet</p>
        )}
        <div className="space-y-2">
          {mappings.map((m, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                value={m.source}
                onChange={e => updateRow(i, 'source', e.target.value)}
                placeholder="body.user.name"
                className="nodrag w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 font-mono text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
              <span className="text-xs text-gray-400">→</span>
              <input
                value={m.key}
                onChange={e => updateRow(i, 'key', e.target.value)}
                placeholder="key"
                className="nodrag w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 font-mono text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
              <button type="button" onClick={() => removeRow(i)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="nodrag mt-2 flex w-full items-center justify-center gap-1 rounded border border-dashed border-blue-300 py-1 text-xs text-blue-500 hover:bg-blue-50 dark:border-blue-700 dark:hover:bg-blue-900/20"
        >
          <Plus className="h-3 w-3" /> Add mapping
        </button>
      </div>

      <Handle type="source" position={Position.Right} className="!border-blue-400 !bg-blue-400" />
    </div>
  )
}
