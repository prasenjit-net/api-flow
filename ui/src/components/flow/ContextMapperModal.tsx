import { useState } from 'react'
import { X } from 'lucide-react'
import type { Mapping } from '../../types'
import MappingRows from './MappingRows'
import { emptyMapping, isCompleteMapping } from './mappingUtils'

interface Props {
  name: string
  mappings: Mapping[]
  onSave: (name: string, mappings: Mapping[]) => void
  onClose: () => void
}

export default function ContextMapperModal({ name: initialName, mappings: initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initialName)
  const [rows, setRows] = useState<Mapping[]>(initial.length > 0 ? initial : [emptyMapping()])

  function handleSave() {
    onSave(name.trim(), rows.filter(isCompleteMapping))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-[2px]">
      <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Context Mapper</h2>
            <p className="mt-0.5 text-xs text-slate-500">Build this node's scoped input and append it to context as output</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Node name</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="normalize-user"
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <span className="mt-1 block text-[11px] text-slate-400">Lowercase letters, numbers, hyphens, and underscores only.</span>
          </label>

          <MappingRows mappings={rows} onChange={setRows} sourceLabel="Source path / value" />

          <div className="mt-4 rounded bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            Context sources begin with <code className="font-mono">request.</code> or <code className="font-mono">nodes.</code>. Constant mappings inject a literal value directly into the node input.
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <button type="button" onClick={onClose} className="rounded border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!name.trim()} className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
