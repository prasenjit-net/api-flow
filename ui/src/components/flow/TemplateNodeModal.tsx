import { useState } from 'react'
import { X } from 'lucide-react'
import type { Mapping, Template } from '../../types'
import MappingRows from './MappingRows'
import { emptyMapping, isCompleteMapping } from './mappingUtils'

interface Props {
  name: string
  templateId: string
  mappings: Mapping[]
  templates: Template[]
  onSave: (name: string, templateId: string, mappings: Mapping[]) => void
  onClose: () => void
}

export default function TemplateNodeModal({
  name: initialName,
  templateId: initialTemplateId,
  mappings: initialMappings,
  templates,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName)
  const [templateId, setTemplateId] = useState(initialTemplateId)
  const [mappings, setMappings] = useState<Mapping[]>(
    initialMappings.length > 0 ? initialMappings : [emptyMapping()],
  )
  const selected = templates.find(t => t.id === templateId)

  function handleSave() {
    onSave(name.trim(), templateId, mappings.filter(isCompleteMapping))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Template Node</h2>
            <p className="mt-0.5 text-xs text-slate-500">Templates receive the complete request and accumulated node context.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Node name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="success-response"
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <p className="mt-1 text-[11px] text-slate-400">Lowercase letters, numbers, hyphens, and underscores only.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Template</label>
            <select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">— select a template —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.statusCode})</option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Optional root aliases</p>
                <p className="mt-0.5 text-[11px] text-slate-400">Mappings add convenience variables; full request and nodes context is always available.</p>
              </div>
            </div>
            <MappingRows mappings={mappings} onChange={setMappings} sourceLabel="Source path / value" sourcePlaceholder="nodes.normalize-user.user_id" keyPlaceholder="user_id" addLabel="Add alias" />
          </div>

          {selected && (
            <div className="rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 shadow-sm dark:bg-slate-700 dark:text-slate-300">{selected.statusCode}</span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{selected.name}</span>
              </div>
              {Object.keys(selected.headers).length > 0 && (
                <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                  {Object.entries(selected.headers).map(([k, v]) => (
                    <div key={k} className="font-mono text-[11px]">
                      <span className="text-slate-500">{k}:</span>{' '}
                      <span className="text-slate-600 dark:text-slate-400">{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {selected.body && (
                <pre className="max-h-32 overflow-hidden px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {selected.body.slice(0, 300)}{selected.body.length > 300 ? '…' : ''}
                </pre>
              )}
            </div>
          )}

          {templates.length === 0 && (
            <p className="text-xs text-slate-400">No templates yet. Create one on the Templates page first.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <button type="button" onClick={onClose} className="rounded border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!name.trim() || !templateId} className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
