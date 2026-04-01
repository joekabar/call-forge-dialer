// frontend/src/components/ai/ROICalculator.jsx  [v2 addition]
// ──────────────────────────────────────────────────────────────
// Live ROI calculator the agent fills in during the call.
// Pre-filled with roof data from RoofIntelligencePanel.
// Generates a unique URL the agent can text to the prospect.

import { useState } from 'react'
import { useCallStore }  from '../../store/callStore'
import { useCampaignStore } from '../../store/campaignStore'
import { useAgentStore } from '../../store/agentStore'
import { api } from '../../hooks/api'

export default function ROICalculator({ roofData, onClose }) {
  const { contact }  = useCallStore()
  const { campaign } = useCampaignStore()
  const { user }     = useAgentStore()

  const [form, setForm] = useState({
    monthly_bill: '',
    has_ev:       false,
    orientation:  roofData?.orientation || 'South',
    panel_count:  roofData?.panel_count || 16,
    system_kwp:   roofData?.system_kwp  || 6.4,
  })

  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied,  setCopied]  = useState(false)

  const set = (k) => (e) => setForm(f => ({
    ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }))

  async function generate() {
    if (!contact || !campaign) return
    setLoading(true)
    try {
      const res = await api.post('/ai/roi/calculate', {
        contact_id:       contact.id,
        campaign_id:      campaign.id,
        panel_count:      Number(form.panel_count),
        system_kwp:       Number(form.system_kwp),
        orientation:      form.orientation,
        monthly_bill_eur: Number(form.monthly_bill) || 150,
        has_ev:           form.has_ev,
        country:          user?.country || 'BE',
      })
      setResult(res.roi)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function copyLink() {
    if (!result) return
    navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const s = {
    overlay: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modal:   { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', padding: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' },
    title:   { fontSize: 14, fontWeight: 500, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    close:   { cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 18, lineHeight: 1, background: 'none', border: 'none' },
    grid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 },
    fg:      { display: 'flex', flexDirection: 'column', gap: 3 },
    fl:      { fontSize: 11, color: 'var(--color-text-secondary)' },
    fi:      { padding: '6px 8px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 7, fontSize: 12, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', width: '100%' },
    btnP:    { width: '100%', padding: '8px', borderRadius: 7, background: '#1d6fb8', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', marginBottom: 12 },
    result:  { background: 'var(--color-background-secondary)', borderRadius: 8, padding: 12, marginBottom: 12 },
    metric:  { display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' },
    mkey:    { color: 'var(--color-text-secondary)' },
    mval:    { fontWeight: 500, color: 'var(--color-text-primary)' },
    url:     { background: 'var(--color-background-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 7, padding: '8px 10px', fontSize: 11, color: 'var(--color-text-info)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
    copyBtn: { padding: '4px 10px', borderRadius: 6, background: '#1d6fb8', color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer', flexShrink: 0 },
  }

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={s.modal}>
        <div style={s.title}>
          Live ROI Calculator
          <button style={s.close} onClick={onClose}>×</button>
        </div>

        <div style={s.grid}>
          <div style={s.fg}>
            <div style={s.fl}>Monthly energy bill (€)</div>
            <input style={s.fi} type="number" value={form.monthly_bill} onChange={set('monthly_bill')} placeholder="180"/>
          </div>
          <div style={s.fg}>
            <div style={s.fl}>Roof orientation</div>
            <select style={s.fi} value={form.orientation} onChange={set('orientation')}>
              {['South','South-West','South-East','West','East','North'].map(o =>
                <option key={o}>{o}</option>
              )}
            </select>
          </div>
          <div style={s.fg}>
            <div style={s.fl}>Panel count</div>
            <input style={s.fi} type="number" value={form.panel_count} onChange={set('panel_count')}/>
          </div>
          <div style={s.fg}>
            <div style={s.fl}>System size (kWp)</div>
            <input style={s.fi} type="number" step="0.1" value={form.system_kwp} onChange={set('system_kwp')}/>
          </div>
          <div style={{ ...s.fg, gridColumn: '1/-1', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="ev" checked={form.has_ev} onChange={set('has_ev')} style={{ width: 14, height: 14 }}/>
            <label htmlFor="ev" style={{ fontSize: 12, color: 'var(--color-text-primary)', cursor: 'pointer' }}>
              Prospect has an electric vehicle (higher self-consumption)
            </label>
          </div>
        </div>

        <button style={s.btnP} onClick={generate} disabled={loading}>
          {loading ? 'Calculating…' : 'Generate savings page →'}
        </button>

        {result && (
          <>
            <div style={s.result}>
              {[
                ['Annual savings',   `€${result.annual_savings_eur.toLocaleString()}`],
                ['Monthly savings',  `€${result.monthly_savings_eur}`],
                ['System size',      `${result.system_kwp} kWp`],
                ['Annual output',    `${result.annual_kwh.toLocaleString()} kWh`],
                ['Payback',          `${result.payback_years} years`],
                ['Est. install cost',`€${result.install_cost_est.toLocaleString()}`],
                ['CO₂ saved',        `${result.co2_saved_kg} kg/year`],
                ['Trees equivalent', `${result.trees_equivalent} trees`],
              ].map(([k, v]) => (
                <div key={k} style={s.metric}>
                  <span style={s.mkey}>{k}</span>
                  <span style={s.mval}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              Text this link to the prospect — they can open it on their phone right now:
            </div>
            <div style={s.url}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {result.url}
              </span>
              <button style={s.copyBtn} onClick={copyLink}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
