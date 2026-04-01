// frontend/src/pages/ClientPortal.jsx
// Read-only dashboard for paying customers — Phase 4

import { useAgentStore } from '../store/agentStore'

export default function ClientPortal() {
  const { user } = useAgentStore()
  return (
    <div style={{ padding: '2rem', color: 'var(--color-text-primary)' }}>
      <h2 style={{ fontWeight: 500, marginBottom: '0.5rem' }}>Client Portal</h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
        Campaign performance dashboard, conversion rates, and call logs — coming in Phase 4.
      </p>
      <p style={{ color: 'var(--color-text-tertiary)', fontSize: 12, marginTop: '1rem' }}>
        Logged in as: {user?.full_name} ({user?.role})
      </p>
    </div>
  )
}
