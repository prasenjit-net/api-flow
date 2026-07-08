import type { Condition, ConditionOperator } from '../../types'

export const comparisonOperators: Array<{ value: ConditionOperator; label: string }> = [
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

const operatorLabels: Record<string, string> = {
  equals: 'equals',
  notEquals: 'does not equal',
  greaterThan: 'is greater than',
  greaterThanOrEqual: 'is greater than or equal',
  lessThan: 'is less than',
  lessThanOrEqual: 'is less than or equal',
  contains: 'contains',
  startsWith: 'starts with',
  endsWith: 'ends with',
  in: 'is in',
  exists: 'exists',
  notExists: 'does not exist',
}

export function summarizeCondition(condition?: Condition): string {
  if (!condition) return 'Fallback'
  if (condition.type === 'rule') {
    const label = operatorLabels[condition.operator] ?? condition.operator
    if (condition.operator === 'exists' || condition.operator === 'notExists') {
      return `${condition.source} ${label}`
    }
    return `${condition.source} ${label} ${JSON.stringify(condition.value)}`
  }
  const children = condition.children.map(summarizeCondition)
  if (condition.operator === 'not') return `NOT (${children[0] ?? ''})`
  return `(${children.join(` ${condition.operator.toUpperCase()} `)})`
}
