export interface SpecMeta {
  id: string
  name: string
  contextPath: string
  uploadedAt: string
}

export interface Operation {
  id: string
  method: string
  path: string
  summary: string
  description: string
  hasFlow: boolean
}

export interface SpecDetail extends SpecMeta {
  operations: Operation[]
}

export interface Template {
  id: string
  specId: string
  operationId?: string
  sourceExampleId?: string
  name: string
  statusCode: number
  body: string
  headers: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface TemplateExample {
  id: string
  name: string
  operationId: string
  statusCode: number
  mediaType: string
  body: string
  headers: Record<string, string>
}

export interface Script {
  id: string
  name: string
  description: string
  source: string
  createdAt: string
  updatedAt: string
}

export interface Mapping {
  source: string
  key: string
}

export interface NodeData {
  name: string
  mappings?: Mapping[]
  templateId?: string
  scriptId?: string
}

export type LogicalOperator = 'and' | 'or' | 'not'

export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'exists'
  | 'notExists'

export type Condition =
  | {
      type: 'group'
      operator: LogicalOperator
      children: Condition[]
    }
  | {
      type: 'rule'
      source: string
      operator: ConditionOperator
      value?: unknown
      valueType?: 'string' | 'number' | 'boolean' | 'null'
    }

export type NodeType = 'start' | 'contextMapper' | 'starlark' | 'template' | 'end'

export interface FlowNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: NodeData
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  priority?: number
  condition?: Condition
}

export interface Flow {
  version: number
  specId: string
  operationId: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  viewport: { x: number; y: number; zoom: number }
}

export interface FlowValidationError {
  code: string
  message: string
  nodeId?: string
  edgeId?: string
  field?: string
}

export interface MetaResponse {
  name: string
  description: string
  environment: string
  url: string
  uiProxy: string
  version: { version: string; commit: string; buildDate: string }
}
