import { Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { Mapping } from '../../types'
import { emptyMapping, mappingKeyPattern } from './mappingUtils'
import { comparisonOperators } from './edgeConditions'

function parseConstantValue(value: string, valueType: Mapping['valueType']) {
  switch (valueType) {
    case 'number': {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : value
    }
    case 'boolean':
      return value === 'true'
    case 'null':
      return null
    default:
      return value
  }
}

function valueToInput(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return String(value)
}

export default function MappingRows({
  mappings,
  onChange,
  sourceLabel = 'Source',
  keyLabel = 'Input variable',
  sourcePlaceholder = 'request.body.user.name',
  keyPlaceholder = 'user_name',
  addLabel = 'Add mapping',
  showOperator = false,
  keyPattern = mappingKeyPattern,
  keyHelperText = "Use lowercase letters, numbers, - or _. Start with a letter or number.",
}: {
  mappings: Mapping[]
  onChange: (mappings: Mapping[]) => void
  sourceLabel?: string
  keyLabel?: string
  sourcePlaceholder?: string
  keyPlaceholder?: string
  addLabel?: string
  showOperator?: boolean
  keyPattern?: RegExp
  keyHelperText?: string
}) {
  const rows = mappings.length > 0 ? mappings : [emptyMapping()]

  function update(index: number, patch: Partial<Mapping>) {
    onChange(rows.map((mapping, i) => {
      if (i !== index) return mapping
      const next = { ...mapping, ...patch }
      if (patch.type === 'context') {
        delete next.value
        delete next.valueType
      }
      if (patch.type === 'constant') {
        next.source = ''
        next.valueType = next.valueType ?? 'string'
        next.value = next.value ?? ''
      }
      return next
    }))
  }

  return (
    <div>
      <div className="space-y-2">
        {rows.map((mapping, index) => {
          const type = mapping.type ?? 'context'
          const valueType = mapping.valueType ?? 'string'
          const keyIsInvalid = mapping.key.trim().length > 0 && !keyPattern.test(mapping.key.trim())
          const isConstant = type === 'constant'
          return (
            <div
              key={index}
              className={clsx(
                'rounded-lg border p-2.5 transition-colors',
                isConstant
                  ? 'border-violet-200 bg-violet-50/45 dark:border-violet-900/60 dark:bg-violet-950/20'
                  : 'border-sky-200 bg-sky-50/45 dark:border-sky-900/60 dark:bg-sky-950/20',
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={clsx(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      isConstant
                        ? 'border-violet-200 bg-white/70 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300'
                        : 'border-sky-200 bg-white/70 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
                    )}
                  >
                    {isConstant ? 'Constant' : 'Context'}
                  </span>
                  <select
                    value={type}
                    onChange={event => update(index, { type: event.target.value as Mapping['type'] })}
                    className={clsx(
                      'w-28 rounded border bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 dark:bg-slate-900',
                      isConstant
                        ? 'border-violet-200 text-violet-800 focus:border-violet-400 focus:ring-violet-400 dark:border-violet-800 dark:text-violet-200'
                        : 'border-sky-200 text-sky-800 focus:border-sky-400 focus:ring-sky-400 dark:border-sky-800 dark:text-sky-200',
                    )}
                  >
                    <option value="context">Context</option>
                    <option value="constant">Constant</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-400 dark:text-slate-600 dark:hover:bg-red-900/20"
                  aria-label="Remove mapping"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_24px_minmax(150px,0.7fr)] sm:items-start">
                <label className="min-w-0">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500">{sourceLabel}</span>
                  {type === 'constant' ? (
                    <div className="grid min-w-0 grid-cols-[86px_minmax(0,1fr)] gap-2">
                      <select
                        value={valueType}
                        onChange={event => {
                          const nextType = event.target.value as Mapping['valueType']
                          update(index, {
                            valueType: nextType,
                            value: parseConstantValue(valueToInput(mapping.value), nextType),
                          })
                        }}
                        className="min-w-0 rounded border border-violet-200 bg-white px-2 py-1.5 text-xs text-violet-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-200"
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="null">Null</option>
                      </select>
                      {valueType === 'boolean' ? (
                        <select
                          value={mapping.value === true ? 'true' : 'false'}
                          onChange={event => update(index, { value: event.target.value === 'true' })}
                          className="min-w-0 rounded border border-violet-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-violet-800 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : valueType === 'null' ? (
                        <input
                          value="null"
                          disabled
                          className="min-w-0 rounded border border-violet-200 bg-violet-50 px-2.5 py-1.5 font-mono text-xs text-violet-400 dark:border-violet-800 dark:bg-violet-950/20"
                        />
                      ) : (
                        <input
                          value={valueToInput(mapping.value)}
                          onChange={event => update(index, { value: parseConstantValue(event.target.value, valueType) })}
                          placeholder={valueType === 'number' ? '42' : 'user name'}
                          className="min-w-0 rounded border border-violet-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-violet-800 dark:bg-slate-900 dark:text-slate-200"
                        />
                      )}
                    </div>
                  ) : (
                    <input
                      value={mapping.source ?? ''}
                      onChange={event => update(index, { source: event.target.value })}
                      placeholder={sourcePlaceholder}
                      className="w-full min-w-0 rounded border border-sky-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-200"
                    />
                  )}
                </label>

                <span className="hidden pt-6 text-center text-xs text-slate-300 sm:block dark:text-slate-600">→</span>

                <label className="min-w-0">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500">{keyLabel}</span>
                  <input
                    value={mapping.key}
                    onChange={event => update(index, { key: event.target.value })}
                    placeholder={keyPlaceholder}
                    className={`w-full min-w-0 rounded border bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 dark:bg-slate-900 dark:text-slate-200 ${
                      keyIsInvalid
                        ? 'border-red-300 focus:border-red-400 focus:ring-red-400 dark:border-red-800'
                        : 'border-slate-200 focus:border-blue-400 focus:ring-blue-400 dark:border-slate-700'
                    }`}
                  />
                  {keyIsInvalid && (
                    <span className="mt-1 block text-[10px] text-red-500">
                      {keyHelperText}
                    </span>
                  )}
                </label>

                {showOperator && (
                  <label className="min-w-0 sm:col-span-3">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500">Operator</span>
                    <select
                      value={mapping.operator ?? 'equals'}
                      onChange={event => update(index, { operator: event.target.value as Mapping['operator'] })}
                      className="w-full min-w-0 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {comparisonOperators.map(operator => (
                        <option key={operator.value} value={operator.value}>{operator.label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => onChange([...rows, emptyMapping()])}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-slate-300 py-1.5 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-500 dark:border-slate-700 dark:hover:border-blue-700"
      >
        <Plus className="h-3 w-3" /> {addLabel}
      </button>
    </div>
  )
}
