import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { Condition, ConditionOperator, LogicalOperator } from '../../types'

interface Props {
  condition?: Condition
  priority?: number
  onSave: (condition: Condition | undefined, priority: number) => void
  onClose: () => void
}

const comparisonOperators: Array<{ value: ConditionOperator; label: string }> = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'does not equal' },
  { value: 'greaterThan', label: 'is greater than' },
  { value: 'greaterThanOrEqual', label: 'is greater than or equal' },
  { value: 'lessThan', label: 'is less than' },
  { value: 'lessThanOrEqual', label: 'is less than or equal' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'in', label: 'is in' },
  { value: 'exists', label: 'exists' },
  { value: 'notExists', label: 'does not exist' },
]

function newRule(): Condition {
  return {
    type: 'rule',
    source: 'request.body.',
    operator: 'equals',
    value: '',
    valueType: 'string',
  }
}

function newGroup(): Condition {
  return { type: 'group', operator: 'and', children: [newRule()] }
}

export default function EdgeConditionModal({ condition: initial, priority: initialPriority = 0, onSave, onClose }: Props) {
  const [unconditional, setUnconditional] = useState(!initial)
  const [condition, setCondition] = useState<Condition>(initial ?? newGroup())
  const [priority, setPriority] = useState(initialPriority)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Branch condition</h2>
            <p className="mt-0.5 text-xs text-slate-500">Conditions read from the request and outputs of upstream nodes.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <input
              type="checkbox"
              checked={unconditional}
              onChange={event => setUnconditional(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Unconditional fallback</span>
              <span className="mt-0.5 block text-xs text-slate-500">This branch runs only when no conditional sibling matches.</span>
            </span>
          </label>

          {!unconditional && (
            <>
              <label className="block max-w-40">
                <span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Priority</span>
                <input
                  type="number"
                  min={0}
                  value={priority}
                  onChange={event => setPriority(Number(event.target.value))}
                  className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
                <span className="mt-1 block text-[11px] text-slate-400">Lower priorities are evaluated first.</span>
              </label>

              <ConditionEditor condition={condition} onChange={setCondition} root />
            </>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(unconditional ? undefined : condition, priority)
              onClose()
            }}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Apply condition
          </button>
        </div>
      </div>
    </div>
  )
}

interface ConditionEditorProps {
  condition: Condition
  onChange: (condition: Condition) => void
  onRemove?: () => void
  root?: boolean
}

function ConditionEditor({ condition, onChange, onRemove, root = false }: ConditionEditorProps) {
  if (condition.type === 'rule') {
    const needsValue = condition.operator !== 'exists' && condition.operator !== 'notExists'
    const valueType = condition.valueType ?? 'string'
    return (
      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_110px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
        <input
          value={condition.source}
          onChange={event => onChange({ ...condition, source: event.target.value })}
          placeholder="request.body.status"
          className="min-w-0 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-800 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
        <select
          value={condition.operator}
          onChange={event => onChange({ ...condition, operator: event.target.value as ConditionOperator })}
          className="min-w-0 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 focus:border-primary-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {comparisonOperators.map(operator => (
            <option key={operator.value} value={operator.value}>{operator.label}</option>
          ))}
        </select>
        {needsValue ? (
          <select
            value={valueType}
            onChange={event => {
              const nextType = event.target.value as NonNullable<Extract<Condition, { type: 'rule' }>['valueType']>
              onChange({ ...condition, valueType: nextType, value: defaultValue(nextType) })
            }}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700 focus:border-primary-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="string">String</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="null">Null</option>
          </select>
        ) : <span />}
        {needsValue ? (
          <ConditionValueInput condition={condition} onChange={onChange} />
        ) : <span className="text-xs italic text-slate-400">No value</span>}
        <button type="button" onClick={onRemove} disabled={!onRemove} className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:invisible dark:text-slate-600 dark:hover:bg-red-900/20">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }
  const group = condition

  function setOperator(operator: LogicalOperator) {
    const children = operator === 'not' ? group.children.slice(0, 1) : group.children
    onChange({ ...group, operator, children: children.length > 0 ? children : [newRule()] })
  }

  function updateChild(index: number, child: Condition) {
    onChange({ ...group, children: group.children.map((existing, i) => i === index ? child : existing) })
  }

  function removeChild(index: number) {
    onChange({ ...group, children: group.children.filter((_, i) => i !== index) })
  }

  const canAdd = group.operator !== 'not' || group.children.length === 0
  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40 ${root ? '' : 'ml-3'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Group</span>
          <select
            value={group.operator}
            onChange={event => setOperator(event.target.value as LogicalOperator)}
            className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold uppercase text-slate-700 focus:border-primary-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="and">AND</option>
            <option value="or">OR</option>
            <option value="not">NOT</option>
          </select>
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-900/20">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {group.children.map((child, index) => (
          <ConditionEditor
            key={index}
            condition={child}
            onChange={next => updateChild(index, next)}
            onRemove={() => removeChild(index)}
          />
        ))}
      </div>

      {canAdd && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onChange({ ...group, children: [...group.children, newRule()] })} className="inline-flex items-center gap-1 rounded border border-dashed border-slate-300 px-2.5 py-1.5 text-xs text-slate-500 hover:border-primary-300 hover:text-primary-600 dark:border-slate-600">
            <Plus className="h-3 w-3" /> Rule
          </button>
          <button type="button" onClick={() => onChange({ ...group, children: [...group.children, newGroup()] })} className="inline-flex items-center gap-1 rounded border border-dashed border-slate-300 px-2.5 py-1.5 text-xs text-slate-500 hover:border-primary-300 hover:text-primary-600 dark:border-slate-600">
            <Plus className="h-3 w-3" /> Group
          </button>
        </div>
      )}
    </div>
  )
}

function ConditionValueInput({
  condition,
  onChange,
}: {
  condition: Extract<Condition, { type: 'rule' }>
  onChange: (condition: Condition) => void
}) {
  const valueType = condition.valueType ?? 'string'
  if (valueType === 'boolean') {
    return (
      <select
        value={String(condition.value ?? false)}
        onChange={event => onChange({ ...condition, value: event.target.value === 'true' })}
        className="min-w-0 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 focus:border-primary-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    )
  }
  if (valueType === 'null') {
    return <span className="font-mono text-xs text-slate-400">null</span>
  }
  return (
    <input
      type={valueType === 'number' ? 'number' : 'text'}
      value={condition.value == null ? '' : String(condition.value)}
      onChange={event => onChange({
        ...condition,
        value: valueType === 'number' ? Number(event.target.value) : event.target.value,
      })}
      placeholder={condition.operator === 'in' ? 'one, two, three' : 'value'}
      className="min-w-0 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-800 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
    />
  )
}

function defaultValue(valueType: NonNullable<Extract<Condition, { type: 'rule' }>['valueType']>): unknown {
  switch (valueType) {
  case 'number':
    return 0
  case 'boolean':
    return false
  case 'null':
    return null
  default:
    return ''
  }
}
