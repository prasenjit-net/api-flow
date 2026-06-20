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
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronLeft, Save, Plus } from 'lucide-react'

import { flowsApi, templatesApi, specsApi } from '../services/api'
import type { Flow, Mapping } from '../types'
import StartNode from '../components/flow/StartNode'
import EndNode from '../components/flow/EndNode'
import ContextMapperNode from '../components/flow/ContextMapperNode'
import TemplateNode from '../components/flow/TemplateNode'
import ContextMapperModal from '../components/flow/ContextMapperModal'
import TemplateNodeModal from '../components/flow/TemplateNodeModal'

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  contextMapper: ContextMapperNode,
  template: TemplateNode,
}

type EditingNode =
  | { type: 'contextMapper'; id: string; mappings: Mapping[] }
  | { type: 'template'; id: string; templateId: string }

function FlowEditor() {
  const { id: specId, opId } = useParams<{ id: string; opId: string }>()
  const qc = useQueryClient()
  const { updateNodeData } = useReactFlow()
  const [saved, setSaved] = useState(false)
  const [editingNode, setEditingNode] = useState<EditingNode | null>(null)

  const { data: flowData } = useQuery({
    queryKey: ['flow', specId, opId],
    queryFn: () => flowsApi.get(specId!, opId!),
    enabled: !!specId && !!opId,
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.list,
  })

  const { data: spec } = useQuery({
    queryKey: ['specs', specId],
    queryFn: () => specsApi.get(specId!),
    enabled: !!specId,
  })

  const operation = spec?.operations.find(o => o.id === opId)

  const defaultNodes: Node[] = useMemo(() => [
    { id: 'start', type: 'start', position: { x: 80, y: 200 }, data: {} },
    { id: 'end', type: 'end', position: { x: 600, y: 200 }, data: {} },
  ], [])

  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    if (!flowData) return
    if (!flowData.nodes || flowData.nodes.length === 0) return
    const enriched = flowData.nodes.map(n =>
      n.type === 'template' ? { ...n, data: { ...n.data, _templates: templates } } : n,
    )
    setNodes(enriched as Node[])
    setEdges((flowData.edges ?? []) as Edge[])
  }, [flowData, templates, setNodes, setEdges])

  useEffect(() => {
    setNodes(ns =>
      ns.map(n => n.type === 'template' ? { ...n, data: { ...n.data, _templates: templates } } : n),
    )
  }, [templates, setNodes])

  const onConnect = useCallback(
    (connection: Connection) => setEdges(eds => addEdge(connection, eds)),
    [setEdges],
  )

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'contextMapper') {
      setEditingNode({ type: 'contextMapper', id: node.id, mappings: (node.data as { mappings?: Mapping[] }).mappings ?? [] })
    } else if (node.type === 'template') {
      setEditingNode({ type: 'template', id: node.id, templateId: (node.data as { templateId?: string }).templateId ?? '' })
    }
  }, [])

  const saveMutation = useMutation({
    mutationFn: (flow: Flow) => flowsApi.save(specId!, opId!, flow),
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      qc.invalidateQueries({ queryKey: ['specs', specId] })
    },
  })

  function handleSave() {
    const flow: Flow = {
      specId: specId!,
      operationId: opId!,
      nodes: nodes.map(n => {
        const { _templates: _t, ...rest } = n.data as Record<string, unknown>
        return { ...n, data: rest } as Flow['nodes'][number]
      }),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    }
    saveMutation.mutate(flow)
  }

  function addContextMapper() {
    const id = `mapper-${Date.now()}`
    setNodes(ns => [...ns, { id, type: 'contextMapper', position: { x: 280, y: 160 + ns.length * 15 }, data: { mappings: [] } }])
  }

  function addTemplateNode() {
    if (nodes.some(n => n.type === 'template')) return
    const id = `template-${Date.now()}`
    setNodes(ns => [...ns, { id, type: 'template', position: { x: 460, y: 180 }, data: { templateId: '', _templates: templates } }])
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Link
            to={`/specifications/${specId}`}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </Link>
          {operation && (
            <>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {operation.method}
                </span>
                <code className="text-sm text-slate-700 dark:text-slate-300">{operation.path}</code>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addContextMapper}
            className="flex items-center gap-1.5 rounded border border-blue-200 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30"
          >
            <Plus className="h-3 w-3" /> Context Mapper
          </button>
          <button
            type="button"
            onClick={addTemplateNode}
            disabled={nodes.some(n => n.type === 'template')}
            className="flex items-center gap-1.5 rounded border border-violet-200 px-3 py-1 text-xs font-medium text-violet-600 hover:bg-violet-50 disabled:opacity-40 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/30"
          >
            <Plus className="h-3 w-3" /> Template
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            {saved ? 'Saved' : saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 bg-slate-50 dark:bg-slate-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          className="[&_.react-flow__edge-path]:stroke-slate-300 [&_.react-flow__edge-path]:dark:stroke-slate-600"
        >
          <Background color="#cbd5e1" gap={20} size={1} className="dark:[&>svg>pattern>rect]:fill-slate-900" />
          <Controls className="[&>button]:border-slate-200 [&>button]:bg-white [&>button]:dark:border-slate-700 [&>button]:dark:bg-slate-900" />
          <MiniMap className="!border-slate-200 !bg-white dark:!border-slate-700 dark:!bg-slate-900" />
        </ReactFlow>
      </div>

      {/* Node edit modals */}
      {editingNode?.type === 'contextMapper' && (
        <ContextMapperModal
          mappings={editingNode.mappings}
          onSave={mappings => { updateNodeData(editingNode.id, { mappings }); setEditingNode(null) }}
          onClose={() => setEditingNode(null)}
        />
      )}
      {editingNode?.type === 'template' && (
        <TemplateNodeModal
          templateId={editingNode.templateId}
          templates={templates}
          onSave={templateId => { updateNodeData(editingNode.id, { templateId, _templates: templates }); setEditingNode(null) }}
          onClose={() => setEditingNode(null)}
        />
      )}
    </div>
  )
}

export default function FlowEditorPage() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  )
}
