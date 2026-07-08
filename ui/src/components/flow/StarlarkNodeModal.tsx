import { useState } from 'react'
import { X } from 'lucide-react'
import type { Mapping, Script } from '../../types'
import MappingRows from './MappingRows'
import { emptyMapping, isCompleteMapping } from './mappingUtils'

interface Props {
  name: string
  scriptId: string
  mappings: Mapping[]
  scripts: Script[]
  onSave: (name: string, scriptId: string, mappings: Mapping[]) => void
  onClose: () => void
}

export default function StarlarkNodeModal({
  name: initialName,
  scriptId: initialScriptId,
  mappings: initialMappings,
  scripts,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName)
  const [scriptId, setScriptId] = useState(initialScriptId)
  const [mappings, setMappings] = useState<Mapping[]>(initialMappings.length > 0 ? initialMappings : [emptyMapping()])
  const script = scripts.find(candidate => candidate.id === scriptId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Starlark Node</h2>
            <p className="mt-0.5 text-xs text-slate-500">Execute a global script with only the mapped input variables.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Node name</label>
            <input value={name} onChange={event => setName(event.target.value)} placeholder="calculate-risk" className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
            <p className="mt-1 text-[11px] text-slate-400">Output is stored at nodes.{name || 'node-name'}.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Script</label>
            <select value={scriptId} onChange={event => setScriptId(event.target.value)} className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <option value="">— select a script —</option>
              {scripts.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">Mapped inputs</p>
            <MappingRows mappings={mappings} onChange={setMappings} sourceLabel="Source path / value" sourcePlaceholder="request.body.amount" keyPlaceholder="amount" addLabel="Add input" />
          </div>

          {script && <pre className="max-h-40 overflow-hidden rounded border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">{script.source.slice(0, 600)}{script.source.length > 600 ? '…' : ''}</pre>}
          {scripts.length === 0 && <p className="text-xs text-slate-400">No scripts exist yet. Create one from the Scripts page.</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <button type="button" onClick={onClose} className="rounded border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">Cancel</button>
          <button
            type="button"
            disabled={!name.trim() || !scriptId}
            onClick={() => {
              onSave(name.trim(), scriptId, mappings.filter(m => isCompleteMapping(m)))
              onClose()
            }}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
