// frontend/src/App.jsx
// NOTE: This file is no longer the app entry point.
// Session restore and routing are handled in main.jsx → <Root>.
// This file is kept as a safe stub in case anything imports it.

import { Navigate } from 'react-router-dom'
import { useAgentStore } from './store/agentStore'

export default function App() {
  const { user } = useAgentStore()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to="/" replace />
}
