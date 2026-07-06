import type { Mapping } from '../../types'

export const emptyMapping = (): Mapping => ({ type: 'context', source: '', key: '' })

export const mappingKeyPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/

export function isCompleteMapping(mapping: Mapping) {
  if (!mappingKeyPattern.test(mapping.key.trim())) return false
  const type = mapping.type ?? 'context'
  return type === 'constant' || !!mapping.source?.trim()
}
