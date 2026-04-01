// frontend/src/components/admin/CampaignsTab.jsx
// ──────────────────────────────────────────────────
// Campaign management for admin panel.
// Create, edit, pause, and delete campaigns.
// Rate limit UI with intuitive presets.

import { useState, useEffect } from 'react'
import { api } from '../../hooks/api'

const COUNTRIES = [
  { value: 'BE', label: 'België' },
  { value: 'NL', label: 'Nederland' },
  { value: 'FR', label: 'Frankrijk' },
  { value: 'DE', label: 'Duitsland' },
]

const RATE_PRESETS = [
  { label: 'Geen limiet',        value: 0,    desc: 'Onbeperkt contacten ophalen' },
  { label: '120 per uur',        value: 30,   desc: '1 contact per 30 seconden' },
  { label: '80 per uur',         value: 45,   desc: '1 contact per 45 sec (standaard)' },
  { label: '60 per uur',         value: 60,   desc: '1 contact per minuut' },
  { label: '30 per uur',         value: 120,  desc: '1 contact per 2 minuten' },
  { label: '20 per uur',         value: 180,  desc: '1 contact per 3 minuten' },
  { label: '10 per uur',         value: 360,  desc: '1 contact per 6 minuten' },
  { label: 'Aangepast',          value: -1,   desc: 'Zelf aantal seconden instellen' },
]

const STATUS_COLORS = {
  active:    { bg: 'var(--color-background-success)', color: 'var(--color-text-success)', border: 'var(--color-border-success)' },
  paused:    { bg: 'var(--color-background-warning)', color: 'var(--color-text-warning)', border: 'var(--color-border-warning)' },
  completed: { bg: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)', border: 'var(--color-border-tertiary)' },
}

function formatRate(sec) {
  if (sec === null || sec === undefined) return '80/uur (standaard)'
  if (sec === 0) return 'Geen limiet'
  if (sec < 60) return `${Math.round(3600 / sec)}/uur (${sec}s interval)`
  if (sec === 60) return '60/uur (1 min interval)'
  return `${Math.round(3600 / sec)}/uur (${sec}s interval)`
}

export default function CampaignsTab() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [error, setError]         = useState('')
  const [ratePreset, setRatePreset] = useState(45)
  const [customRate, setCustomRate] = useState('')
  const [form, setForm] = useState({
    name: '', country: 'BE',
    contact_interval_sec: 45,
    calling_hours_start: '09:00',
    calling_hours_end: '20:00',
  })

  useEffect(() => { loadCampaigns() }, [])

  async function loadCampaigns() {
    setLoading(true)
    try {
      const res = await api.get('/campaigns')
      setCampaigns(res.campaigns || [])
    } catch (e) {
      setError(e.message || 'Kan campagnes niet laden')
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', country: 'BE', contact_interval_sec: 45, calling_hours_start: '09:00', calling_hours_end: '20:00' })
    setRatePreset(45)
    setCustomRate('')
    setShowForm(true)
    setError('')
  }

  function openEdit(c) {
    setEditing(c)
    const interval = c.contact_interval_sec || 45
    setForm({
      name: c.name,
      country: c.country,
      contact_interval_sec: interval,
      calling_hours_start: c.calling_hours_start || '09:00',
      calling_hours_end: c.calling_hours_end || '20:00',
    })
    // Check if interval matches a preset
    const preset = RATE_PRESETS.find(p => p.value === interval)
    if (preset) {
      setRatePreset(interval)
      setCustomRate('')
    } else {
      setRatePreset(-1)
      setCustomRate(String(interval))
    }
    setShowForm(true)
    setError('')
  }

  function handleRateChange(val) {
    const v = Number(val)
    setRatePreset(v)
    if (v >= 0) {
      setForm(f => ({ ...f, contact_interval_sec: v }))
      setCustomRate('')
    }
  }

  function handleCustomRateChange(val) {
    setCustomRate(val)
    const num = Number(val)
    if (!isNaN(num) && num >= 0 && num <= 3600) {
      setForm(f => ({ ...f, contact_interval_sec: num }))
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Campagnenaam is verplicht'); return }
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        country: form.country,
        calling_hours_start: form.calling_hours_start,
        calling_hours_end: form.calling_hours_end,
        contact_interval_sec: form.contact_interval_sec,
      }

      if (editing) {
        await api.put(`/campaigns/${editing.id}`, payload)
      } else {
        await api.post('/campaigns', payload)
      }
      setShowForm(false)
      setEditing(null)
      await loadCampaigns()
    } catch (e) {
      setError(e.message || 'Opslaan mislukt')
    }
  }

  async function handleToggleStatus(c) {
    const newStatus = c.status === 'active' ? 'paused' : 'active'
    try {
      await api.put(`/campaigns/${c.id}`, { status: newStatus })
      await loadCampaigns()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(c) {
    if (!confirm(`Campagne "${c.name}" verwijderen? Contacten worden niet verwijderd.`)) return
    try {
      await api.delete(`/campaigns/${c.id}`)
      await loadCampaigns()
    } catch (e) {
      setError(e.message)
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const s = {
    card:  { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' },
    hdr:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)' },
    title: { fontSize: 16, fontWeight: 500 },
    btnP:  { padding: '7px 14px', borderRadius: 7, background: '#1d6fb8', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
    btn:   { padding: '5px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontSize: 11, cursor: 'pointer' },
    btnD:  { padding: '5px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-danger)', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', fontSize: 11, cursor: 'pointer' },
    row:   { display: 'grid', gridTemplateColumns: '1fr 80px 120px 100px 120px 150px', alignItems: 'center', padding: '12px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)', gap: 12 },
    rowH:  { display: 'grid', gridTemplateColumns: '1fr 80px 120px 100px 120px 150px', padding: '8px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)', gap: 12, background: 'var(--color-background-secondary)' },
    th:    { fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em' },
    name:  { fontSize: 13, fontWeight: 500 },
    sub:   { fontSize: 11, color: 'var(--color-text-secondary)' },
    badge: (status) => {
      const c = STATUS_COLORS[status] || STATUS_COLORS.completed
      return { display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: c.bg, color: c.color, border: `0.5px solid ${c.border}` }
    },
    actions: { display: 'flex', gap: 4 },
    empty: { padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 },
    err:   { background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', borderRadius: 7, padding: '8px 12px', fontSize: 12, margin: '0 20px 12px' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modal:   { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', padding: 24, width: '100%', maxWidth: 480 },
    mTitle:  { fontSize: 15, fontWeight: 500, marginBottom: 16 },
    fg:      { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
    fl:      { fontSize: 11, color: 'var(--color-text-secondary)' },
    fi:      { padding: '7px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 7, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', width: '100%' },
    frow:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    ffoot:   { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 },
    rateGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 },
    rateOpt: (sel) => ({
      padding: '8px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer', textAlign: 'center',
      border: sel ? '1.5px solid #1d6fb8' : '0.5px solid var(--color-border-secondary)',
      background: sel ? 'var(--color-background-info)' : 'var(--color-background-primary)',
      color: sel ? 'var(--color-text-info)' : 'var(--color-text-primary)',
      fontWeight: sel ? 500 : 400,
    }),
    rateDesc: { fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 },
  }

  return (
    <>
      <div style={s.card}>
        <div style={s.hdr}>
          <div style={s.title}>Campagnes</div>
          <button style={s.btnP} onClick={openCreate}>+ Nieuwe campagne</button>
        </div>

        {error && <div style={s.err}>{error}</div>}

        {campaigns.length > 0 && (
          <div style={s.rowH}>
            <div style={s.th}>Naam</div>
            <div style={s.th}>Land</div>
            <div style={s.th}>Snelheid</div>
            <div style={s.th}>Status</div>
            <div style={s.th}>Beluren</div>
            <div style={s.th}>Acties</div>
          </div>
        )}

        {loading ? (
          <div style={s.empty}>Laden…</div>
        ) : campaigns.length === 0 ? (
          <div style={s.empty}>
            Nog geen campagnes. Klik op "+ Nieuwe campagne" om te beginnen.
          </div>
        ) : (
          campaigns.map(c => (
            <div key={c.id} style={s.row}>
              <div style={s.name}>{c.name}</div>
              <div style={s.sub}>{COUNTRIES.find(x => x.value === c.country)?.label || c.country}</div>
              <div style={s.sub}>{formatRate(c.contact_interval_sec)}</div>
              <div><span style={s.badge(c.status)}>{c.status}</span></div>
              <div style={s.sub}>{c.calling_hours_start} – {c.calling_hours_end}</div>
              <div style={s.actions}>
                <button style={s.btn} onClick={() => openEdit(c)}>Bewerk</button>
                <button style={s.btn} onClick={() => handleToggleStatus(c)}>
                  {c.status === 'active' ? 'Pauze' : 'Activeer'}
                </button>
                <button style={s.btnD} onClick={() => handleDelete(c)}>×</button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div style={s.modal}>
            <div style={s.mTitle}>
              {editing ? `Campagne bewerken: ${editing.name}` : 'Nieuwe campagne'}
            </div>

            <div style={s.fg}>
              <div style={s.fl}>Campagnenaam *</div>
              <input style={s.fi} value={form.name} onChange={set('name')} placeholder="bv. Zonnepanelen Antwerpen" autoFocus />
            </div>

            <div style={s.frow}>
              <div style={s.fg}>
                <div style={s.fl}>Land</div>
                <select style={s.fi} value={form.country} onChange={set('country')}>
                  {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div style={s.fg}>
                <div style={s.fl}>Beluren</div>
                <div style={s.frow}>
                  <input style={s.fi} type="time" value={form.calling_hours_start} onChange={set('calling_hours_start')} />
                  <input style={s.fi} type="time" value={form.calling_hours_end} onChange={set('calling_hours_end')} />
                </div>
              </div>
            </div>

            <div style={s.fg}>
              <div style={s.fl}>Belsnelheid — contacten per uur</div>
              <div style={s.rateGrid}>
                {RATE_PRESETS.map(p => (
                  <div
                    key={p.value}
                    style={s.rateOpt(ratePreset === p.value)}
                    onClick={() => handleRateChange(p.value)}
                  >
                    <div>{p.label}</div>
                    <div style={s.rateDesc}>{p.desc}</div>
                  </div>
                ))}
              </div>

              {ratePreset === -1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    style={{ ...s.fi, width: 100 }}
                    type="number"
                    min="0"
                    max="3600"
                    value={customRate}
                    onChange={(e) => handleCustomRateChange(e.target.value)}
                    placeholder="seconden"
                  />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    seconden tussen contacten
                    {customRate && Number(customRate) > 0 && (
                      <> — ≈ {Math.round(3600 / Number(customRate))} contacten/uur</>
                    )}
                    {customRate === '0' && <> — geen limiet</>}
                  </span>
                </div>
              )}
            </div>

            {error && <div style={{ ...s.err, margin: '12px 0 0' }}>{error}</div>}

            <div style={s.ffoot}>
              <button style={s.btn} onClick={() => setShowForm(false)}>Annuleren</button>
              <button style={s.btnP} onClick={handleSave}>
                {editing ? 'Opslaan' : 'Campagne aanmaken'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
