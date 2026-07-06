import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import SpecificationsPage from './pages/SpecificationsPage'
import SpecificationDetailPage from './pages/SpecificationDetailPage'
import FlowEditorPage from './pages/FlowEditorPage'
import TemplatesPage from './pages/TemplatesPage'
import TemplatesIndexPage from './pages/TemplatesIndexPage'
import ScriptsPage from './pages/ScriptsPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/specifications" replace />} />
        <Route path="specifications" element={<SpecificationsPage />} />
        <Route path="specifications/:id" element={<SpecificationDetailPage />} />
        <Route path="specifications/:id/operations/:opId" element={<FlowEditorPage />} />
        <Route path="templates" element={<TemplatesIndexPage />} />
        <Route path="templates/:specId" element={<TemplatesPage />} />
        <Route path="scripts" element={<ScriptsPage />} />
      </Route>
    </Routes>
  )
}

export default App
