// frontend/src/components/common/StatusBar.jsx
import { useCampaignStore } from '../../store/campaignStore'

export default function StatusBar() {
  const { campaign, callsToday, reachedToday } = useCampaignStore()

  const rate = campaign?.contact_interval_sec === 0
    ? 'Geen limiet'
    : campaign?.contact_interval_sec
      ? `${Math.round(3600 / campaign.contact_interval_sec)}/uur`
      : '80/uur'

  const start = campaign?.calling_hours_start
    ? String(campaign.calling_hours_start).slice(0, 5)
    : '09:00'
  const end = campaign?.calling_hours_end
    ? String(campaign.calling_hours_end).slice(0, 5)
    : '20:00'

  const s = {
    bar: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 30, background: 'var(--color-background-primary)', borderTop: '0.5px solid var(--color-border-tertiary)', flexShrink: 0, fontSize: 10, color: 'var(--color-text-secondary)', overflow: 'hidden' },
    dot: (c) => ({ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }),
  }

  return (
    <div style={s.bar}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={s.dot('#22c55e')} />
        <span>Lead scoring: aan</span>
      </div>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>Campagne: {campaign?.name || 'Geen campagne'}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>Snelheid: {rate}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>Gesprekken: {callsToday} · Bereikt: {reachedToday}</span>
      <div style={{ flex: 1 }} />
      <span>DNC ✓</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>Beluren: {start}–{end} ✓</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>GDPR ✓</span>
    </div>
  )
}
