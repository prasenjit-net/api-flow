import { useState } from 'react'
import { X } from 'lucide-react'
import type { Collection, DataMapperOperation, Mapping } from '../../types'
import MappingRows from './MappingRows'
import { emptyMapping, isCompleteMapping, queryFieldPattern } from './mappingUtils'

interface Props {
  name: string
  collectionId: string
  operation: DataMapperOperation
  queryMappings: Mapping[]
  bodyMappings: Mapping[]
  collections: Collection[]
  onSave: (
    name: string,
    collectionId: string,
    operation: DataMapperOperation,
    queryMappings: Mapping[],
    bodyMappings: Mapping[],
  ) => void
  onClose: () => void
}

const operations: Array<{ value: DataMapperOperation; label: string }> = [
  { value: 'insert', label: 'Insert' },
  { value: 'findOne', label: 'Find one' },
  { value: 'findMany', label: 'Find many' },
  { value: 'update', label: 'Update' },
  { value: 'upsert', label: 'Upsert' },
  { value: 'delete', label: 'Delete' },
]

const needsQuery = (operation: DataMapperOperation) => operation !== 'insert'
const requiresQuery = (operation: DataMapperOperation) => operation !== 'insert' && operation !== 'findMany'
const needsBody = (operation: DataMapperOperation) => operation === 'insert' || operation === 'update' || operation === 'upsert'

export default function DataMapperNodeModal({
  name: initialName,
  collectionId: initialCollectionId,
  operation: initialOperation,
  queryMappings: initialQueryMappings,
  bodyMappings: initialBodyMappings,
  collections,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName)
  const [collectionId, setCollectionId] = useState(initialCollectionId)
  const [operation, setOperation] = useState<DataMapperOperation>(initialOperation)
  const [queryMappings, setQueryMappings] = useState<Mapping[]>(
    initialQueryMappings.length > 0 ? initialQueryMappings : [emptyMapping()],
  )
  const [bodyMappings, setBodyMappings] = useState<Mapping[]>(
    initialBodyMappings.length > 0 ? initialBodyMappings : [emptyMapping()],
  )

  const completeQuery = queryMappings.filter(m => isCompleteMapping(m, queryFieldPattern))
  const completeBody = bodyMappings.filter(m => isCompleteMapping(m))
  const canSave =
    !!name.trim() &&
    !!collectionId &&
    (!requiresQuery(operation) || completeQuery.length > 0) &&
    (!needsBody(operation) || completeBody.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Data Mapper Node</h2>
            <p className="mt-0.5 text-xs text-slate-500">Insert, find, update, upsert or delete documents in a collection.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Node name</label>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="save-user"
                className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
              <p className="mt-1 text-[11px] text-slate-400">Output is stored at nodes.{name || 'node-name'}.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Operation</label>
              <select
                value={operation}
                onChange={event => setOperation(event.target.value as DataMapperOperation)}
                className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {operations.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Collection</label>
            <select
              value={collectionId}
              onChange={event => setCollectionId(event.target.value)}
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">— select a collection —</option>
              {collections.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
            {collections.length === 0 && <p className="mt-1 text-xs text-slate-400">No collections exist yet. Create one from the Collections page.</p>}
          </div>

          {needsQuery(operation) && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                Query{requiresQuery(operation) ? '' : ' (optional — matches every document when empty)'}
              </p>
              <MappingRows
                mappings={queryMappings}
                onChange={setQueryMappings}
                sourceLabel="Compare against"
                sourcePlaceholder="request.body.email"
                keyLabel="Document field"
                keyPlaceholder="email"
                addLabel="Add query filter"
                showOperator
                keyPattern={queryFieldPattern}
                keyHelperText="Use a dotted field path, e.g. profile.age."
              />
            </div>
          )}

          {needsBody(operation) && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">Body</p>
              <MappingRows
                mappings={bodyMappings}
                onChange={setBodyMappings}
                sourceLabel="Source path / value"
                sourcePlaceholder="request.body.email"
                keyLabel="Document field"
                keyPlaceholder="email"
                addLabel="Add field"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <button type="button" onClick={onClose} className="rounded border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">Cancel</button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              onSave(
                name.trim(),
                collectionId,
                operation,
                needsQuery(operation) ? completeQuery : [],
                needsBody(operation) ? completeBody : [],
              )
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
