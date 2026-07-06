import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import type { Mapping } from '../../types'

interface Props {
  name: string
  mappings: Mapping[]
  onSave: (name: string, mappings: Mapping[]) => void
  onClose: () => void
}

export default function ContextMapperModal({ name: initialName, mappings: initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initialName)
  const [rows, setRows] = useState<Mapping[]>(initial.length > 0 ? initial : [{ source: '', key: '' }])

  function addRow() {
    setRows(r => [...r, { source: '', key: '' }])
  }

  function removeRow(i: number) {
    setRows(r => r.filter((_, idx) => idx !== i))
  }

  function updateRow(i: number, field: keyof Mapping, value: string) {
    setRows(r => r.map((m, idx) => idx === i ? { ...m, [field]: value } : m))
  }

  function handleSave() {
    onSave(name.trim(), rows.filter(r => r.source.trim() && r.key.trim()))
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

          <div className="mb-2 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 px-1">
            <span className="text-xs font-medium text-slate-500">Source path</span>
            <span />
            <span className="text-xs font-medium text-slate-500">Input variable</span>
            <span />
          </div>

          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                <input
                  value={row.source}
                  onChange={e => updateRow(i, 'source', e.target.value)}
                  placeholder="request.body.user.name"
                  className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
                <span className="text-xs text-slate-300 dark:text-slate-600">→</span>
                <input
                  value={row.key}
                  onChange={e => updateRow(i, 'key', e.target.value)}
                  placeholder="user_name"
                  className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
                <button type="button" onClick={() => removeRow(i)} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-400 dark:text-slate-600 dark:hover:bg-red-900/20">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-slate-300 py-1.5 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-500 dark:border-slate-700 dark:hover:border-blue-700"
          >
            <Plus className="h-3 w-3" /> Add mapping
          </button>

          <div className="mt-4 rounded bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            Sources begin with <code className="font-mono">request.</code> or <code className="font-mono">nodes.</code>, for example <code className="font-mono">request.body.user.id</code> or <code className="font-mono">nodes.lookup-user.id</code>.
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
