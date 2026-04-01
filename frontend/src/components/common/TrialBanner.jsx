export default function TrialBanner({ daysRemaining }) {
  if (daysRemaining === null || daysRemaining === undefined) return null
  const urgent = daysRemaining <= 2

  return (
    <div style={{
      background: urgent ? 'var(--color-background-warning)' : 'var(--color-background-info)',
      color:      urgent ? 'var(--color-text-warning)'       : 'var(--color-text-info)',
      padding: '6px 16px', fontSize: 12, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: '0.5px solid var(--color-border-tertiary)',
    }}>
      <span>
        Trial: <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining</strong>
        {urgent ? ' — upgrade now to keep your data' : ''}
      </span>
      <a href="/billing" style={{ fontSize: 11, fontWeight: 500, color: 'inherit' }}>
        Upgrade →
      </a>
    </div>
  )
}