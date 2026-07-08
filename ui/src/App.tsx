import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import OverviewPage from './pages/OverviewPage'
import SpecificationsPage from './pages/SpecificationsPage'
import SpecificationDetailPage from './pages/SpecificationDetailPage'
import FlowEditorPage from './pages/FlowEditorPage'
import TemplatesPage, { TemplateEditorPage } from './pages/TemplatesPage'
import TemplatesIndexPage from './pages/TemplatesIndexPage'
import ScriptsPage, { ScriptEditorPage } from './pages/ScriptsPage'
import CollectionsPage, { CollectionEditorPage } from './pages/CollectionsPage'
import CollectionDocumentsPage, { DocumentEditorPage } from './pages/CollectionDocumentsPage'
import TracesPage from './pages/TracesPage'
import TraceDetailPage from './pages/TraceDetailPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="specifications" element={<SpecificationsPage />} />
        <Route path="specifications/:id" element={<SpecificationDetailPage />} />
        <Route path="specifications/:id/operations/:opId" element={<FlowEditorPage />} />
        <Route path="templates" element={<TemplatesIndexPage />} />
        <Route path="templates/:specId" element={<TemplatesPage />} />
        <Route path="templates/:specId/new" element={<TemplateEditorPage />} />
        <Route path="templates/:specId/edit/:templateId" element={<TemplateEditorPage />} />
        <Route path="scripts" element={<ScriptsPage />} />
        <Route path="scripts/new" element={<ScriptEditorPage />} />
        <Route path="scripts/:scriptId/edit" element={<ScriptEditorPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="collections/new" element={<CollectionEditorPage />} />
        <Route path="collections/:collectionId/edit" element={<CollectionEditorPage />} />
        <Route path="collections/:collectionId/documents" element={<CollectionDocumentsPage />} />
        <Route path="collections/:collectionId/documents/new" element={<DocumentEditorPage />} />
        <Route path="collections/:collectionId/documents/:documentId/edit" element={<DocumentEditorPage />} />
        <Route path="traces" element={<TracesPage />} />
        <Route path="traces/:traceId" element={<TraceDetailPage />} />
      </Route>
    </Routes>
  )
}

export default App
