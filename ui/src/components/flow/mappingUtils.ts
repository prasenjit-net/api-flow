import type { Mapping } from '../../types'

export const emptyMapping = (): Mapping => ({ type: 'context', source: '', key: '' })

export const mappingKeyPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/

// Query mapping keys address a field inside a schemaless document (e.g.
// "profile.age"), so dotted paths are allowed unlike other mapping keys.
export const queryFieldPattern = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*$/

export function isCompleteMapping(mapping: Mapping, keyPattern: RegExp = mappingKeyPattern) {
  if (!keyPattern.test(mapping.key.trim())) return false
  const type = mapping.type ?? 'context'
  return type === 'constant' || !!mapping.source?.trim()
}
