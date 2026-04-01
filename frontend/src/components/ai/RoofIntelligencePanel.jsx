// frontend/src/components/ai/RoofIntelligencePanel.jsx  [v2 addition]
// ─────────────────────────────────────────────────────────────────────
// Displays the AI roof analysis when a contact loads.
// Shown in the Map tab below the Bing map embed.

import { useState, useEffect } from 'react'
import { useCallStore } from '../../store/callStore'
import { useAgentStore } from '../../store/agentStore'
import { api } from '../../hooks/api'

export default function RoofIntelligencePanel({ onOpenROI }) {
  const { contact } = useCallStore()
  const { user }    = useAgentStore()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!contact?.id) { setData(null); return }
    // Only analyse if address is verified
    const addr = [contact.street_verified, contact.city_verified, contact.postal_code_verified]
      .filter(Boolean).join(', ')
    if (!addr) return

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await api.post('/ai/roof/analyse', {
          contact_id: contact.id,
          address:    addr,
          country:    user?.country || 'BE',
        })
        setData(res.analysis)
      } catch (e) {
        setError('Roof analysis unavailable')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [contact?.id, contact?.city_verified])

  const s = {
    wrap:   { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 8, overflow: 'hidden', marginTop: 8 },
    hdr:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' },
    htitle: { fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' },
    badge:  (c) => ({ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: `var(--color-background-${c})`, color: `var(--color-text-${c})` }),
    grid:   { display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', borderBottom: '0.5px solid var(--color-border-tertiary)' },
    metric: { padding: '10px 8px', textAlign: 'center', borderRight: '0.5px solid var(--color-border-tertiary)' },
    mval:   { fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.1 },
    munit:  { fontSize: 9,  color: 'var(--color-text-secondary)', marginTop: 1 },
    mlbl:   { fontSize: 9,  color: 'var(--color-text-secondary)', marginTop: 4 },
    detail: { display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap', borderBottom: '0.5px solid var(--color-border-tertiary)' },
    dtag:   { padding: '3px 8px', borderRadius: 5, fontSize: 10, background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' },
    suggestion: { padding: '8px 12px', borderLeft: '3px solid #3b82f6', background: 'var(--color-background-info)', margin: 8, borderRadius: '0 7px 7px 0', fontSize: 11, color: 'var(--color-text-info)', lineHeight: 1.5 },
    footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px' },
    fsrc:   { fontSize: 10, color: 'var(--color-text-tertiary)' },
    btn:    { padding: '4px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-secondary)', background: '#1d6fb8', color: '#fff', fontSize: 11, cursor: 'pointer' },
    bar:    { padding: '6px 12px', borderTop: '0.5px solid var(--color-border-tertiary)' },
    blbl:   { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 4 },
    btrack: { height: 5, background: 'var(--color-background-secondary)', borderRadius: 3, overflow: 'hidden' },
    bfill:  (pct) => ({ height: '100%', width: `${pct}%`, background: '#22c55e', borderRadius: 3, transition: 'width 1s ease' }),
  }

  if (!contact) return null
  if (loading) return (
    <div style={{ ...s.wrap, padding: '12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
      Analysing roof…
    </div>
  )
  if (error || !data) return null

  return (
    <div style={s.wrap}>
      <div style={s.hdr}>
        <div style={s.htitle}>AI Roof Intelligence</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={s.badge('success')}>{data.confidence} confidence</span>
          <span style={s.badge('info')}>{data.data_source}</span>
        </div>
      </div>

      <div style={s.grid}>
        <div style={s.metric}>
          <div style={{ ...s.mval, color: '#22c55e' }}>{data.panel_count}</div>
          <div style={s.munit}>panels</div>
          <div style={s.mlbl}>Estimated fit</div>
        </div>
        <div style={s.metric}>
          <div style={s.mval}>{data.system_kwp}</div>
          <div style={s.munit}>kWp</div>
          <div style={s.mlbl}>System size</div>
        </div>
        <div style={s.metric}>
          <div style={s.mval}>{data.annual_kwh.toLocaleString()}</div>
          <div style={s.munit}>kWh/yr</div>
          <div style={s.mlbl}>Annual output</div>
        </div>
        <div style={{ ...s.metric, borderRight: 'none' }}>
          <div style={{ ...s.mval, color: '#22c55e' }}>€{data.monthly_savings_eur}</div>
          <div style={s.munit}>per month</div>
          <div style={s.mlbl}>Est. savings</div>
        </div>
      </div>

      <div style={s.detail}>
        <span style={s.dtag}><strong>Roof:</strong> {data.roof_area_m2}m²</span>
        <span style={s.dtag}><strong>Usable:</strong> {data.usable_area_m2}m²</span>
        <span style={s.dtag}><strong>Orientation:</strong> {data.orientation}</span>
        <span style={s.dtag}><strong>Tilt:</strong> {data.tilt_degrees}°</span>
        <span style={s.dtag}><strong>Payback:</strong> {data.payback_years} yrs</span>
        <span style={s.dtag}><strong>CO₂ saved:</strong> {data.co2_saved_kg}kg/yr</span>
      </div>

      <div style={s.bar}>
        <div style={s.blbl}><span>Solar suitability</span><span>{data.solar_score} / 100</span></div>
        <div style={s.btrack}><div style={s.bfill(data.solar_score)}/></div>
      </div>

      <div style={s.suggestion}>
        <strong>Opening line:</strong> {data.opening_line_nl}
      </div>

      <div style={s.footer}>
        <div style={s.fsrc}>Source: {data.data_source} · cached</div>
        <button style={s.btn} onClick={() => onOpenROI?.(data)}>
          Open ROI calculator →
        </button>
      </div>
    </div>
  )
}
