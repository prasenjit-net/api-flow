import { useId } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { Mapping } from '../../types'
import { emptyMapping, mappingKeyPattern } from './mappingUtils'
import { comparisonOperators } from './edgeConditions'

export interface MappingSourceHint {
  value: string
  label?: string
  group?: string
}

const mappingTypes: Array<{ value: NonNullable<Mapping['type']>; label: string }> = [
  { value: 'context', label: 'Context' },
  { value: 'constant', label: 'Constant' },
  { value: 'random', label: 'Random' },
  { value: 'fake', label: 'Fake' },
  { value: 'relativeTime', label: 'Time' },
]

const randomGenerators = [
  { value: 'uuid', label: 'UUID' },
  { value: 'alphanumeric', label: 'Text' },
  { value: 'alpha', label: 'Letters' },
  { value: 'hex', label: 'Hex' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
]

const fakeGenerators = [
  { value: 'name.fullName', label: 'Full name' },
  { value: 'name.firstName', label: 'First name' },
  { value: 'name.lastName', label: 'Last name' },
  { value: 'internet.email', label: 'Email' },
  { value: 'internet.user', label: 'Username' },
  { value: 'internet.url', label: 'URL' },
  { value: 'phone.number', label: 'Phone' },
  { value: 'company.name', label: 'Company' },
  { value: 'location.city', label: 'City' },
  { value: 'location.country', label: 'Country' },
  { value: 'location.street', label: 'Street' },
  { value: 'lorem.word', label: 'Word' },
  { value: 'lorem.sentence', label: 'Sentence' },
]

const timeFormats = [
  { value: 'rfc3339', label: 'RFC3339' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'datetime', label: 'Date time' },
  { value: 'unix', label: 'Unix seconds' },
  { value: 'unixMilli', label: 'Unix ms' },
  { value: 'YYYY-MM-DD', label: 'Custom date' },
]

function typeLabel(type: NonNullable<Mapping['type']>) {
  if (type === 'relativeTime') return 'Time'
  return type[0].toUpperCase() + type.slice(1)
}

function typeTone(type: NonNullable<Mapping['type']>) {
  switch (type) {
    case 'constant':
      return {
        card: 'border-violet-200 bg-violet-50/45 dark:border-violet-900/60 dark:bg-violet-950/20',
        badge: 'border-violet-200 bg-white/70 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300',
        control: 'border-violet-200 text-violet-800 focus:border-violet-400 focus:ring-violet-400 dark:border-violet-800 dark:text-violet-200',
      }
    case 'random':
      return {
        card: 'border-emerald-200 bg-emerald-50/45 dark:border-emerald-900/60 dark:bg-emerald-950/20',
        badge: 'border-emerald-200 bg-white/70 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
        control: 'border-emerald-200 text-emerald-800 focus:border-emerald-400 focus:ring-emerald-400 dark:border-emerald-800 dark:text-emerald-200',
      }
    case 'fake':
      return {
        card: 'border-amber-200 bg-amber-50/45 dark:border-amber-900/60 dark:bg-amber-950/20',
        badge: 'border-amber-200 bg-white/70 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
        control: 'border-amber-200 text-amber-800 focus:border-amber-400 focus:ring-amber-400 dark:border-amber-800 dark:text-amber-200',
      }
    case 'relativeTime':
      return {
        card: 'border-cyan-200 bg-cyan-50/45 dark:border-cyan-900/60 dark:bg-cyan-950/20',
        badge: 'border-cyan-200 bg-white/70 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
        control: 'border-cyan-200 text-cyan-800 focus:border-cyan-400 focus:ring-cyan-400 dark:border-cyan-800 dark:text-cyan-200',
      }
    default:
      return {
        card: 'border-sky-200 bg-sky-50/45 dark:border-sky-900/60 dark:bg-sky-950/20',
        badge: 'border-sky-200 bg-white/70 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
        control: 'border-sky-200 text-sky-800 focus:border-sky-400 focus:ring-sky-400 dark:border-sky-800 dark:text-sky-200',
      }
  }
}

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
  sourceHints = [],
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
  sourceHints?: MappingSourceHint[]
}) {
  const rows = mappings.length > 0 ? mappings : [emptyMapping()]
  const hintListId = useId()
  const visibleHints = sourceHints.slice(0, 12)

  function update(index: number, patch: Partial<Mapping>) {
    onChange(rows.map((mapping, i) => {
      if (i !== index) return mapping
      const next = { ...mapping, ...patch }
      if (patch.type === 'context') {
        delete next.value
        delete next.valueType
        delete next.generator
        delete next.format
        delete next.length
        delete next.min
        delete next.max
      }
      if (patch.type === 'constant') {
        next.source = ''
        next.valueType = next.valueType ?? 'string'
        next.value = next.value ?? ''
        delete next.generator
        delete next.format
        delete next.length
        delete next.min
        delete next.max
      }
      if (patch.type === 'random') {
        next.source = ''
        delete next.value
        delete next.valueType
        delete next.format
        next.generator = next.generator ?? 'uuid'
        if (next.generator === 'alphanumeric') next.length = next.length ?? 12
        if (next.generator === 'number') {
          next.min = next.min ?? 0
          next.max = next.max ?? 100
        }
      }
      if (patch.type === 'fake') {
        next.source = ''
        delete next.value
        delete next.valueType
        delete next.format
        delete next.length
        delete next.min
        delete next.max
        next.generator = next.generator ?? 'name.fullName'
      }
      if (patch.type === 'relativeTime') {
        delete next.value
        delete next.valueType
        delete next.generator
        delete next.length
        delete next.min
        delete next.max
        next.source = next.source?.trim() || 'now'
        next.format = next.format ?? 'rfc3339'
      }
      return next
    }))
  }

  return (
    <div>
      {sourceHints.length > 0 && (
        <datalist id={hintListId}>
          {sourceHints.map(hint => (
            <option key={`${hint.group ?? 'source'}:${hint.value}`} value={hint.value}>
              {[hint.group, hint.label].filter(Boolean).join(' · ')}
            </option>
          ))}
        </datalist>
      )}
      <div className="space-y-2">
        {rows.map((mapping, index) => {
          const type = mapping.type ?? 'context'
          const tone = typeTone(type)
          const valueType = mapping.valueType ?? 'string'
          const generator = mapping.generator ?? (type === 'fake' ? 'name.fullName' : 'uuid')
          const keyIsInvalid = mapping.key.trim().length > 0 && !keyPattern.test(mapping.key.trim())
          const isConstant = type === 'constant'
          const isGenerated = type === 'random' || type === 'fake' || type === 'relativeTime'
          return (
            <div
              key={index}
              className={clsx('rounded-lg border p-2.5 transition-colors', tone.card)}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={clsx(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      tone.badge,
                    )}
                  >
                    {typeLabel(type)}
                  </span>
                  <select
                    value={type}
                    onChange={event => update(index, { type: event.target.value as Mapping['type'] })}
                    className={clsx(
                      'w-28 rounded border bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 dark:bg-slate-900',
                      tone.control,
                    )}
                  >
                    {mappingTypes.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
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
                  ) : type === 'random' ? (
                    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(120px,0.8fr)_minmax(0,1fr)]">
                      <select
                        value={generator}
                        onChange={event => {
                          const nextGenerator = event.target.value
                          update(index, {
                            generator: nextGenerator,
                            length: ['alphanumeric', 'alpha', 'hex'].includes(nextGenerator) ? (mapping.length ?? 12) : undefined,
                            min: nextGenerator === 'number' ? (mapping.min ?? 0) : undefined,
                            max: nextGenerator === 'number' ? (mapping.max ?? 100) : undefined,
                          })
                        }}
                        className="min-w-0 rounded border border-emerald-200 bg-white px-2 py-1.5 text-xs text-emerald-800 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200"
                      >
                        {randomGenerators.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      {['alphanumeric', 'alpha', 'hex'].includes(generator) ? (
                        <label className="grid min-w-0 grid-cols-[58px_minmax(0,1fr)] items-center gap-2">
                          <span className="text-[11px] text-slate-500">Length</span>
                          <input
                            type="number"
                            min={1}
                            max={256}
                            value={mapping.length ?? 12}
                            onChange={event => update(index, { length: Number(event.target.value) })}
                            className="min-w-0 rounded border border-emerald-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-emerald-800 dark:bg-slate-900 dark:text-slate-200"
                          />
                        </label>
                      ) : generator === 'number' ? (
                        <div className="grid min-w-0 grid-cols-2 gap-2">
                          <input
                            type="number"
                            value={mapping.min ?? 0}
                            onChange={event => update(index, { min: Number(event.target.value) })}
                            placeholder="Min"
                            className="min-w-0 rounded border border-emerald-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-emerald-800 dark:bg-slate-900 dark:text-slate-200"
                          />
                          <input
                            type="number"
                            value={mapping.max ?? 100}
                            onChange={event => update(index, { max: Number(event.target.value) })}
                            placeholder="Max"
                            className="min-w-0 rounded border border-emerald-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-emerald-800 dark:bg-slate-900 dark:text-slate-200"
                          />
                        </div>
                      ) : (
                        <div className="rounded border border-emerald-200 bg-white px-2.5 py-1.5 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300">
                          Generated per request
                        </div>
                      )}
                    </div>
                  ) : type === 'fake' ? (
                    <select
                      value={generator}
                      onChange={event => update(index, { generator: event.target.value })}
                      className="w-full min-w-0 rounded border border-amber-200 bg-white px-2.5 py-1.5 text-xs text-amber-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
                    >
                      {fakeGenerators.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : type === 'relativeTime' ? (
                    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(120px,0.7fr)]">
                      <input
                        value={mapping.source ?? 'now'}
                        onChange={event => update(index, { source: event.target.value })}
                        placeholder="now+5h or today-3d"
                        className="min-w-0 rounded border border-cyan-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 dark:border-cyan-800 dark:bg-slate-900 dark:text-slate-200"
                      />
                      <select
                        value={mapping.format ?? 'rfc3339'}
                        onChange={event => update(index, { format: event.target.value })}
                        className="min-w-0 rounded border border-cyan-200 bg-white px-2 py-1.5 text-xs text-cyan-800 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 dark:border-cyan-800 dark:bg-slate-900 dark:text-cyan-200"
                      >
                        {timeFormats.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input
                      value={mapping.source ?? ''}
                      onChange={event => update(index, { source: event.target.value })}
                      placeholder={sourcePlaceholder}
                      list={sourceHints.length > 0 ? hintListId : undefined}
                      className="w-full min-w-0 rounded border border-sky-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-200"
                    />
                  )}
                  {!isConstant && !isGenerated && visibleHints.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {visibleHints.map(hint => (
                        <button
                          key={`${hint.group ?? 'source'}:${hint.value}`}
                          type="button"
                          onClick={() => update(index, { source: hint.value })}
                          title={[hint.group, hint.label].filter(Boolean).join(' · ')}
                          className="max-w-full truncate rounded border border-sky-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-sky-700 hover:border-sky-300 hover:bg-sky-50 dark:border-sky-800 dark:bg-slate-900 dark:text-sky-300 dark:hover:border-sky-700 dark:hover:bg-sky-950/30"
                        >
                          {hint.value}
                        </button>
                      ))}
                    </div>
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
