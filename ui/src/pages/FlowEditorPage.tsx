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
  type Connection,
  type Node,
  type Edge,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronLeft, Save, Plus } from 'lucide-react'

import { flowsApi, templatesApi, specsApi } from '../services/api'
import type { Flow } from '../types'
import StartNode from '../components/flow/StartNode'
import EndNode from '../components/flow/EndNode'
import ContextMapperNode from '../components/flow/ContextMapperNode'
import TemplateNode from '../components/flow/TemplateNode'

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  contextMapper: ContextMapperNode,
  template: TemplateNode,
}

function FlowEditor() {
  const { id: specId, opId } = useParams<{ id: string; opId: string }>()
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)

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
    const hasNodes = flowData.nodes && flowData.nodes.length > 0
    if (!hasNodes) return

    const enriched = flowData.nodes.map(n => {
      if (n.type === 'template') {
        return { ...n, data: { ...n.data, _templates: templates } }
      }
      return n
    })
    setNodes(enriched as Node[])
    setEdges((flowData.edges ?? []) as Edge[])
  }, [flowData, templates, setNodes, setEdges])

  // Keep template nodes up-to-date when templates change
  useEffect(() => {
    setNodes(ns =>
      ns.map(n =>
        n.type === 'template' ? { ...n, data: { ...n.data, _templates: templates } } : n,
      ),
    )
  }, [templates, setNodes])

  const onConnect = useCallback(
    (connection: Connection) => setEdges(eds => addEdge(connection, eds)),
    [setEdges],
  )

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
        const { _templates: _, ...data } = n.data as Record<string, unknown>
        return { ...n, data } as Flow['nodes'][number]
      }),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    }
    saveMutation.mutate(flow)
  }

  function addContextMapper() {
    const newId = `mapper-${Date.now()}`
    setNodes(ns => [
      ...ns,
      {
        id: newId,
        type: 'contextMapper',
        position: { x: 280, y: 180 + ns.length * 20 },
        data: { mappings: [] },
      },
    ])
  }

  function addTemplateNode() {
    const already = nodes.some(n => n.type === 'template')
    if (already) return
    const newId = `template-${Date.now()}`
    setNodes(ns => [
      ...ns,
      {
        id: newId,
        type: 'template',
        position: { x: 460, y: 180 },
        data: { templateId: '', _templates: templates },
      },
    ])
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Link
            to={`/specifications/${specId}`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
          {operation && (
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {operation.method}
              </span>
              <code className="font-mono text-gray-700 dark:text-slate-300">{operation.path}</code>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addContextMapper}
            className="flex items-center gap-1.5 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            <Plus className="h-3.5 w-3.5" /> Context Mapper
          </button>
          <button
            type="button"
            onClick={addTemplateNode}
            disabled={nodes.some(n => n.type === 'template')}
            className="flex items-center gap-1.5 rounded-lg border border-purple-300 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-40 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-900/20"
          >
            <Plus className="h-3.5 w-3.5" /> Template
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saved ? 'Saved!' : saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
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
