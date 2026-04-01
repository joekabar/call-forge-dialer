import { Routes, Route, Navigate } from 'react-router-dom'
import { useAgentStore } from './store/agentStore'
import AgentWorkspace  from './pages/AgentWorkspace'
import SupervisorPanel from './pages/SupervisorPanel'
import AdminPanel      from './pages/AdminPanel'
import ClientPortal    from './pages/ClientPortal'
import PlatformAdmin   from './pages/PlatformAdmin'
import LoginPage from './pages/LoginPage'

function RoleGuard({ children, allowed }) {
  const { user } = useAgentStore()
  if (!user) return <Navigate to="/login" replace />
  if (!allowed.includes(user.role) && !user.is_platform_admin) return <Navigate to="/unauthorized" replace />
  return children
}

function PlatformGuard({ children }) {
  const { user } = useAgentStore()
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_platform_admin) return <Navigate to="/unauthorized" replace />
  return children
}

function RoleRedirect() {
  const { user } = useAgentStore()
  if (!user)                        return <Navigate to="/login" replace />
  if (user.is_platform_admin)       return <Navigate to="/platform" replace />
  if (user.role === 'admin')        return <Navigate to="/admin" replace />
  if (user.role === 'supervisor')   return <Navigate to="/supervisor" replace />
  if (user.role === 'client')       return <Navigate to="/portal" replace />
  return <Navigate to="/workspace" replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/platform/*"
        element={
          <PlatformGuard>
            <PlatformAdmin />
          </PlatformGuard>
        }
        
      />
      <Route
        path="/workspace"
        element={
          <RoleGuard allowed={['agent', 'supervisor', 'admin']}>
            <AgentWorkspace />
          </RoleGuard>
        }
      />
      <Route
        path="/supervisor"
        element={
          <RoleGuard allowed={['supervisor', 'admin']}>
            <SupervisorPanel />
          </RoleGuard>
        }
      />
      <Route
        path="/admin/*"
        element={
          <RoleGuard allowed={['admin']}>
            <AdminPanel />
          </RoleGuard>
        }
      />
      <Route
        path="/portal"
        element={
          <RoleGuard allowed={['client', 'admin']}>
            <ClientPortal />
          </RoleGuard>
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/"            element={<RoleRedirect />} />
      <Route path="/unauthorized" element={
        <div style={{ padding: '2rem', color: 'var(--color-text-primary)' }}>
          Je hebt geen toegang tot deze pagina.
        </div>
      }/>
    </Routes>
  )
}
