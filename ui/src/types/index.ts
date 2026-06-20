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
  name: string
  statusCode: number
  body: string
  headers: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface Mapping {
  source: string
  key: string
}

export interface NodeData {
  mappings?: Mapping[]
  templateId?: string
}

export type NodeType = 'start' | 'contextMapper' | 'template' | 'end'

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
}

export interface Flow {
  specId: string
  operationId: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export interface MetaResponse {
  name: string
  description: string
  environment: string
  url: string
  uiProxy: string
  version: { version: string; commit: string; buildDate: string }
}
