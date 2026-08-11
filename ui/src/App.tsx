import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import Layout from './components/Layout'

const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const SpecificationsPage = lazy(() => import('./pages/SpecificationsPage'))
const SpecificationDetailPage = lazy(() => import('./pages/SpecificationDetailPage'))
const FlowEditorPage = lazy(() => import('./pages/FlowEditorPage'))
const TemplateEditorPage = lazy(() => import('./pages/TemplatesPage').then(module => ({ default: module.TemplateEditorPage })))
const ScriptEditorPage = lazy(() => import('./pages/ScriptsPage').then(module => ({ default: module.ScriptEditorPage })))
const CollectionEditorPage = lazy(() => import('./pages/CollectionsPage').then(module => ({ default: module.CollectionEditorPage })))
const CollectionDocumentsPage = lazy(() => import('./pages/CollectionDocumentsPage'))
const DocumentEditorPage = lazy(() => import('./pages/CollectionDocumentsPage').then(module => ({ default: module.DocumentEditorPage })))
const TestGroundPage = lazy(() => import('./pages/TestGroundPage'))
const SessionsPage = lazy(() => import('./pages/SessionsPage'))
const SessionDetailPage = lazy(() => import('./pages/SessionDetailPage'))
const TracesPage = lazy(() => import('./pages/TracesPage'))
const TraceDetailPage = lazy(() => import('./pages/TraceDetailPage'))
const AssistantPage = lazy(() => import('./pages/AssistantPage'))

function PageFallback() {
  return <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading...</div>
}

function LegacyTemplatesRedirect({ target }: { target: 'list' | 'new' | 'edit' }) {
  const { specId, templateId } = useParams<{ specId: string; templateId?: string }>()
  if (!specId) return <Navigate to="/specifications" replace />
  if (target === 'new') return <Navigate to={`/specifications/${specId}/templates/new`} replace />
  if (target === 'edit' && templateId) return <Navigate to={`/specifications/${specId}/templates/${templateId}/edit`} replace />
  return <Navigate to={`/specifications/${specId}?tab=templates`} replace />
}

function SpecTabRedirect({ tab }: { tab: string }) {
  const { specId } = useParams<{ specId: string }>()
  if (!specId) return <Navigate to="/specifications" replace />
  return <Navigate to={`/specifications/${specId}?tab=${tab}`} replace />
}

function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="specifications" element={<SpecificationsPage />} />
          <Route path="specifications/:id" element={<SpecificationDetailPage />} />
          <Route path="specifications/:id/operations/:opId" element={<FlowEditorPage />} />
          <Route path="specifications/:specId/templates" element={<SpecTabRedirect tab="templates" />} />
          <Route path="specifications/:specId/templates/new" element={<TemplateEditorPage />} />
          <Route path="specifications/:specId/templates/:templateId/edit" element={<TemplateEditorPage />} />
          <Route path="specifications/:specId/scripts" element={<SpecTabRedirect tab="scripts" />} />
          <Route path="specifications/:specId/scripts/new" element={<ScriptEditorPage />} />
          <Route path="specifications/:specId/scripts/:scriptId/edit" element={<ScriptEditorPage />} />
          <Route path="specifications/:specId/collections" element={<SpecTabRedirect tab="collections" />} />
          <Route path="specifications/:specId/collections/new" element={<CollectionEditorPage />} />
          <Route path="specifications/:specId/collections/:collectionId/edit" element={<CollectionEditorPage />} />
          <Route path="specifications/:specId/collections/:collectionId/documents" element={<CollectionDocumentsPage />} />
          <Route path="specifications/:specId/collections/:collectionId/documents/new" element={<DocumentEditorPage />} />
          <Route path="specifications/:specId/collections/:collectionId/documents/:documentId/edit" element={<DocumentEditorPage />} />
          <Route path="templates" element={<Navigate to="/specifications" replace />} />
          <Route path="templates/:specId" element={<LegacyTemplatesRedirect target="list" />} />
          <Route path="templates/:specId/new" element={<LegacyTemplatesRedirect target="new" />} />
          <Route path="templates/:specId/edit/:templateId" element={<LegacyTemplatesRedirect target="edit" />} />
          <Route path="scripts" element={<Navigate to="/specifications" replace />} />
          <Route path="scripts/new" element={<Navigate to="/specifications" replace />} />
          <Route path="scripts/:scriptId/edit" element={<Navigate to="/specifications" replace />} />
          <Route path="collections" element={<Navigate to="/specifications" replace />} />
          <Route path="test-ground" element={<TestGroundPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="sessions/:sessionId" element={<SessionDetailPage />} />
          <Route path="traces" element={<TracesPage />} />
          <Route path="traces/:traceId" element={<TraceDetailPage />} />
          <Route path="assistant" element={<AssistantPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
