// frontend/src/pages/SupervisorPanel.jsx
// Live monitoring — Phase 2 feature, stub for now
import { useAgentStore } from '../store/agentStore'

export default function SupervisorPanel() {
  const { user } = useAgentStore()
  return (
    <div style={{ padding: '2rem', color: 'var(--color-text-primary)' }}>
      <h2 style={{ fontWeight: 500, marginBottom: '0.5rem' }}>Supervisor Panel</h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
        Live agent monitoring and whisper coaching — coming in Phase 2.
      </p>
      <p style={{ color: 'var(--color-text-tertiary)', fontSize: 12, marginTop: '1rem' }}>
        Logged in as: {user?.full_name} ({user?.role})
      </p>
    </div>
  )
}
