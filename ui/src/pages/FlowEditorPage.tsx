import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
  MarkerType,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertCircle, ChevronLeft, Save, Plus, CheckCircle2 } from 'lucide-react'

import { ApiError, flowsApi, scriptsApi, templatesApi, specsApi } from '../services/api'
import type { Condition, Flow, FlowEdge, FlowValidationError, Mapping } from '../types'
import StartNode from '../components/flow/StartNode'
import EndNode from '../components/flow/EndNode'
import ContextMapperNode from '../components/flow/ContextMapperNode'
import TemplateNode from '../components/flow/TemplateNode'
import ContextMapperModal from '../components/flow/ContextMapperModal'
import TemplateNodeModal from '../components/flow/TemplateNodeModal'
import StarlarkNode from '../components/flow/StarlarkNode'
import StarlarkNodeModal from '../components/flow/StarlarkNodeModal'
import EdgeConditionModal from '../components/flow/EdgeConditionModal'
import { summarizeCondition } from '../components/flow/edgeConditions'

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  contextMapper: ContextMapperNode,
  starlark: StarlarkNode,
  template: TemplateNode,
}

type EditingNode =
  | { type: 'contextMapper'; id: string; name: string; mappings: Mapping[] }
  | { type: 'starlark'; id: string; name: string; scriptId: string; mappings: Mapping[] }
  | { type: 'template'; id: string; name: string; templateId: string; mappings: Mapping[] }

type FlowEdgeData = Record<string, unknown> & {
  condition?: Condition
  priority?: number
}

type EditingEdge = {
  id: string
  condition?: Condition
  priority: number
}

function editorEdge(edge: FlowEdge): Edge<FlowEdgeData> {
  const summary = summarizeCondition(edge.condition)
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data: { condition: edge.condition, priority: edge.priority ?? 0 },
    label: summary.length > 80 ? `${summary.slice(0, 77)}…` : summary,
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 5,
    labelBgStyle: { fill: edge.condition ? '#f8fafc' : '#ecfdf5', fillOpacity: 0.95 },
    labelStyle: { fill: '#475569', fontSize: 10, fontWeight: 600 },
    markerEnd: { type: MarkerType.ArrowClosed },
    style: edge.condition ? { strokeDasharray: '6 4' } : undefined,
  }
}

function FlowEditor() {
  const { id: specId, opId } = useParams<{ id: string; opId: string }>()
  const qc = useQueryClient()
  const { updateNodeData } = useReactFlow()
  const [saved, setSaved] = useState(false)
  const [editingNode, setEditingNode] = useState<EditingNode | null>(null)
  const [editingEdge, setEditingEdge] = useState<EditingEdge | null>(null)
  const [saveErrors, setSaveErrors] = useState<FlowValidationError[]>([])
  const [saveErrorMessage, setSaveErrorMessage] = useState('')

  const { data: flowData } = useQuery({
    queryKey: ['flow', specId, opId],
    queryFn: () => flowsApi.get(specId!, opId!),
    enabled: !!specId && !!opId,
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', specId, opId],
    queryFn: () => templatesApi.list(specId!, opId!),
    enabled: !!specId && !!opId,
  })

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts'],
    queryFn: scriptsApi.list,
  })

  const { data: spec } = useQuery({
    queryKey: ['specs', specId],
    queryFn: () => specsApi.get(specId!),
    enabled: !!specId,
  })

  const operation = spec?.operations.find(o => o.id === opId)

  const defaultNodes: Node[] = useMemo(() => [
    { id: 'start', type: 'start', position: { x: 80, y: 200 }, data: { name: 'start' } },
    { id: 'end', type: 'end', position: { x: 600, y: 200 }, data: { name: 'end' } },
  ], [])

  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<FlowEdgeData>>([])

  useEffect(() => {
    if (!flowData) return
    if (!flowData.nodes || flowData.nodes.length === 0) return
    const enriched = flowData.nodes.map(n => {
      if (n.type === 'template') return { ...n, data: { ...n.data, _templates: templates } }
      if (n.type === 'starlark') return { ...n, data: { ...n.data, _scripts: scripts } }
      return n
    })
    setNodes(enriched as Node[])
    setEdges((flowData.edges ?? []).map(editorEdge))
  }, [flowData, scripts, templates, setNodes, setEdges])

  useEffect(() => {
    setNodes(ns =>
      ns.map(n => n.type === 'template' ? { ...n, data: { ...n.data, _templates: templates } } : n),
    )
  }, [templates, setNodes])

  useEffect(() => {
    setNodes(current =>
      current.map(node => node.type === 'starlark' ? { ...node, data: { ...node.data, _scripts: scripts } } : node),
    )
  }, [scripts, setNodes])

  const onConnect = useCallback(
    (connection: Connection) => setEdges(eds => {
      const id = `edge-${Date.now()}`
      return addEdge(editorEdge({
        id,
        source: connection.source!,
        target: connection.target!,
        priority: eds.filter(edge => edge.source === connection.source && edge.data?.condition).length,
      }), eds)
    }),
    [setEdges],
  )

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'contextMapper') {
      const data = node.data as { name?: string; mappings?: Mapping[] }
      setEditingNode({ type: 'contextMapper', id: node.id, name: data.name ?? '', mappings: data.mappings ?? [] })
    } else if (node.type === 'starlark') {
      const data = node.data as { name?: string; scriptId?: string; mappings?: Mapping[] }
      setEditingNode({
        type: 'starlark',
        id: node.id,
        name: data.name ?? '',
        scriptId: data.scriptId ?? '',
        mappings: data.mappings ?? [],
      })
    } else if (node.type === 'template') {
      const data = node.data as { name?: string; templateId?: string; mappings?: Mapping[] }
      setEditingNode({
        type: 'template',
        id: node.id,
        name: data.name ?? '',
        templateId: data.templateId ?? '',
        mappings: data.mappings ?? [],
      })
    }
  }, [])

  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge<FlowEdgeData>) => {
    setEditingEdge({
      id: edge.id,
      condition: edge.data?.condition,
      priority: edge.data?.priority ?? 0,
    })
  }, [])

  const saveMutation = useMutation({
    mutationFn: (flow: Flow) => flowsApi.save(specId!, opId!, flow),
    onMutate: () => {
      setSaveErrors([])
      setSaveErrorMessage('')
    },
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      qc.invalidateQueries({ queryKey: ['specs', specId] })
    },
    onError: error => {
      if (error instanceof ApiError) {
        setSaveErrorMessage(error.message)
        setSaveErrors(error.details)
      } else {
        setSaveErrorMessage(error instanceof Error ? error.message : 'Unable to save workflow')
      }
    },
  })

  function handleSave() {
    const flow: Flow = {
      version: 3,
      specId: specId!,
      operationId: opId!,
      nodes: nodes.map(n => {
        const rest = { ...n.data } as Record<string, unknown>
        delete rest._templates
        delete rest._scripts
        return {
          id: n.id,
          type: n.type as Flow['nodes'][number]['type'],
          position: n.position,
          data: rest as unknown as Flow['nodes'][number]['data'],
        }
      }),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        priority: e.data?.priority ?? 0,
        condition: e.data?.condition,
      })),
    }
    saveMutation.mutate(flow)
  }

  function addContextMapper() {
    const id = `mapper-${Date.now()}`
    const name = nextNodeName('mapper', nodes)
    setNodes(ns => [...ns, { id, type: 'contextMapper', position: { x: 280, y: 160 + ns.length * 15 }, data: { name, mappings: [] } }])
  }

  function addTemplateNode() {
    const id = `template-${Date.now()}`
    const name = nextNodeName('template', nodes)
    setNodes(ns => [...ns, { id, type: 'template', position: { x: 460, y: 180 + ns.length * 15 }, data: { name, templateId: '', mappings: [], _templates: templates } }])
  }

  function addStarlarkNode() {
    const id = `starlark-${Date.now()}`
    const name = nextNodeName('script', nodes)
    setNodes(current => [...current, {
      id,
      type: 'starlark',
      position: { x: 380, y: 170 + current.length * 15 },
      data: { name, scriptId: '', mappings: [], _scripts: scripts },
    }])
  }

  function updateEdgeCondition(id: string, condition: Condition | undefined, priority: number) {
    const summary = summarizeCondition(condition)
    setEdges(current => current.map(edge => edge.id === id ? {
      ...edge,
      data: { ...edge.data, condition, priority },
      label: summary.length > 80 ? `${summary.slice(0, 77)}…` : summary,
      labelBgStyle: { fill: condition ? '#f8fafc' : '#ecfdf5', fillOpacity: 0.95 },
      style: condition ? { ...edge.style, strokeDasharray: '6 4' } : { ...edge.style, strokeDasharray: undefined },
    } : edge))
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-slate-950">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
          <Link
            to={`/specifications/${specId}`}
              className="inline-flex items-center gap-2 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
              <ChevronLeft className="h-4 w-4" />
              Back to specification
          </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Flow editor</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                {operation ? (
                  <>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {operation.method}
                    </span>
                    <code className="text-xs text-gray-600 dark:text-slate-300">{operation.path}</code>
                  </>
                ) : (
                  <span>Loading operation details…</span>
                )}
                {saved ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Saved
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addContextMapper}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50 dark:border-sky-900/40 dark:text-sky-300 dark:hover:bg-sky-950/20"
          >
              <Plus className="h-4 w-4" />
              Context mapper
          </button>
          <button
            type="button"
            onClick={addTemplateNode}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50 dark:border-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-950/20"
          >
              <Plus className="h-4 w-4" />
              Template
          </button>
          <button
            type="button"
            onClick={addStarlarkNode}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-950/20"
          >
            <Plus className="h-4 w-4" />
            Starlark
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? 'Saving…' : 'Save flow'}
          </button>
          </div>
        </div>
      </div>

      {saveErrorMessage && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="text-xs font-semibold">{saveErrorMessage}</p>
              {saveErrors.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
                  {saveErrors.slice(0, 6).map((error, index) => (
                    <li key={`${error.code}-${error.nodeId ?? error.edgeId ?? index}`}>
                      {error.message}
                      {error.nodeId ? ` (node: ${error.nodeId})` : ''}
                      {error.edgeId ? ` (edge: ${error.edgeId})` : ''}
                    </li>
                  ))}
                  {saveErrors.length > 6 && <li>+{saveErrors.length - 6} more validation errors</li>}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
          className="bg-gray-100 dark:bg-slate-950 [&_.react-flow__edge-path]:stroke-slate-300 [&_.react-flow__edge-path]:stroke-2 [&_.react-flow__edge-path]:dark:stroke-slate-600"
        >
          <Background color="#cbd5e1" gap={18} size={1} className="dark:[&>svg>pattern>rect]:fill-slate-900" />
          <Controls showInteractive={false} className="[&>button]:border-slate-200 [&>button]:bg-white [&>button]:dark:border-slate-700 [&>button]:dark:bg-slate-900" />
          <MiniMap pannable zoomable className="!border-slate-200 !bg-white dark:!border-slate-700 dark:!bg-slate-900" />
        </ReactFlow>
      </div>

      {editingNode?.type === 'contextMapper' && (
        <ContextMapperModal
          name={editingNode.name}
          mappings={editingNode.mappings}
          onSave={(name, mappings) => { updateNodeData(editingNode.id, { name, mappings }); setEditingNode(null) }}
          onClose={() => setEditingNode(null)}
        />
      )}
      {editingNode?.type === 'template' && (
        <TemplateNodeModal
          name={editingNode.name}
          templateId={editingNode.templateId}
          mappings={editingNode.mappings}
          templates={templates}
          onSave={(name, templateId, mappings) => {
            updateNodeData(editingNode.id, { name, templateId, mappings, _templates: templates })
            setEditingNode(null)
          }}
          onClose={() => setEditingNode(null)}
        />
      )}
      {editingNode?.type === 'starlark' && (
        <StarlarkNodeModal
          name={editingNode.name}
          scriptId={editingNode.scriptId}
          mappings={editingNode.mappings}
          scripts={scripts}
          onSave={(name, scriptId, mappings) => {
            updateNodeData(editingNode.id, { name, scriptId, mappings, _scripts: scripts })
            setEditingNode(null)
          }}
          onClose={() => setEditingNode(null)}
        />
      )}
      {editingEdge && (
        <EdgeConditionModal
          condition={editingEdge.condition}
          priority={editingEdge.priority}
          onSave={(condition, priority) => updateEdgeCondition(editingEdge.id, condition, priority)}
          onClose={() => setEditingEdge(null)}
        />
      )}
    </div>
  )
}

function nextNodeName(prefix: string, nodes: Node[]): string {
  const names = new Set(nodes.map(node => (node.data as { name?: string }).name))
  let suffix = 1
  while (names.has(`${prefix}-${suffix}`)) suffix++
  return `${prefix}-${suffix}`
}

export default function FlowEditorPage() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  )
}
