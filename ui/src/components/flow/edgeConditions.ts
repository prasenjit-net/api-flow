import type { Condition } from '../../types'

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
