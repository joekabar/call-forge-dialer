// frontend/src/components/tabs/AgendaTab.jsx
// ──────────────────────────────────────────────
// Shows appointments + call results for a selected date range.
// Operators can export everything as a CSV.

import { useState, useEffect } from 'react'
import { api } from '../../hooks/api'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

const OUTCOME_COLOR = {
  interested:     { bg: 'var(--color-background-success)', color: 'var(--color-text-success)' },
  callback:       { bg: 'var(--color-background-info)',    color: 'var(--color-text-info)' },
  not_interested: { bg: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' },
  voicemail:      { bg: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' },
  wrong_number:   { bg: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)' },
  dnc:            { bg: '#fee2e2', color: '#dc2626' },
  no_answer:      { bg: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' },
}

const OUTCOME_LABEL = {
  interested:     'Afspraak',
  callback:       'Terugbellen',
  not_interested: 'Niet geïnteresseerd',
  voicemail:      'Voicemail',
  wrong_number:   'Fout nummer',
  dnc:            'DNC',
  no_answer:      'Niet opgenomen',
}

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function today() {
  return toDateStr(new Date())
}

export default function AgendaTab() {
  const [fromDate, setFromDate]       = useState(today())
  const [toDate, setToDate]           = useState(today())
  const [appointments, setAppointments] = useState([])
  const [calls, setCalls]             = useState([])
  const [summary, setSummary]         = useState({})
  const [loading, setLoading]         = useState(true)
  const [exporting, setExporting]     = useState(false)

  useEffect(() => { loadData() }, [fromDate, toDate])

  async function loadData() {
    setLoading(true)
    try {
      const [apptRes, callRes] = await Promise.all([
        api.get(`/appointments`),
        api.get(`/reports/calls?from_date=${fromDate}&to_date=${toDate}`),
      ])
      // Filter appointments client-side by selected range
      const from = new Date(fromDate + 'T00:00:00')
      const to   = new Date(toDate   + 'T23:59:59')
      const filtered = (apptRes.appointments || []).filter(a => {
        const d = new Date(a.scheduled_at)
        return d >= from && d <= to
      })
      setAppointments(filtered)
      setCalls(callRes.calls || [])
      setSummary(callRes.summary || {})
    } catch (e) {
      console.error('Failed to load report data:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const raw = localStorage.getItem('sfp_session')
      const token = raw ? JSON.parse(raw)?.access_token : null
      const res = await fetch(
        `${BASE_URL}/reports/export?from_date=${fromDate}&to_date=${toDate}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      )
      if (!res.ok) throw new Error('Export mislukt')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `solarflow_${fromDate}_${toDate}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export error:', e)
    } finally {
      setExporting(false)
    }
  }

  const s = {
    wrap:    { height: '100%', padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
    toolbar: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' },
    label:   { fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' },
    input:   { padding: '5px 8px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 7, fontSize: 12, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' },
    btn:     { padding: '6px 14px', borderRadius: 7, border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
    btnPrimary: { padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' },
    card:    { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' },
    hdr:     { padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    count:   { fontSize: 10, color: 'var(--color-text-secondary)', background: 'var(--color-background-secondary)', padding: '2px 8px', borderRadius: 20 },
    empty:   { padding: '20px 14px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 12 },
    appt:    { padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 10, alignItems: 'flex-start' },
    callRow: { padding: '8px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 10, alignItems: 'center' },
    time:    { fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 48, lineHeight: 1.2 },
    info:    { flex: 1 },
    title:   { fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 2 },
    sub:     { fontSize: 11, color: 'var(--color-text-secondary)' },
    summaryGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px' },
    summaryChip: (outcome) => ({
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
      borderRadius: 20, fontSize: 11,
      background: (OUTCOME_COLOR[outcome] || OUTCOME_COLOR.no_answer).bg,
      color:      (OUTCOME_COLOR[outcome] || OUTCOME_COLOR.no_answer).color,
    }),
  }

  function badge(outcome) {
    const c = OUTCOME_COLOR[outcome] || OUTCOME_COLOR.no_answer
    return {
      display: 'inline-block', padding: '2px 7px', borderRadius: 20,
      fontSize: 9, fontWeight: 500, background: c.bg, color: c.color,
    }
  }

  function fmt(iso, type = 'time') {
    if (!iso) return ''
    const d = new Date(iso)
    if (type === 'time') return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    if (type === 'date') return d.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })
    return ''
  }

  const isRange = fromDate !== toDate

  if (loading) return (
    <div style={s.wrap}>
      <div style={{ ...s.card, padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 12 }}>Laden…</div>
    </div>
  )

  return (
    <div style={s.wrap}>

      {/* ── Date range toolbar ── */}
      <div style={s.toolbar}>
        <span style={s.label}>Van</span>
        <input type="date" style={s.input} value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <span style={s.label}>t/m</span>
        <input type="date" style={s.input} value={toDate}   onChange={e => setToDate(e.target.value)} min={fromDate} />
        <button style={s.btn} onClick={() => { setFromDate(today()); setToDate(today()) }}>Vandaag</button>
        <div style={{ flex: 1 }} />
        <button
          style={{ ...s.btnPrimary, opacity: exporting ? 0.6 : 1 }}
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? 'Exporteren…' : 'Export CSV'}
        </button>
      </div>

      {/* ── Outcome summary chips ── */}
      {Object.keys(summary).length > 0 && (
        <div style={s.card}>
          <div style={s.hdr}>
            <span>Resultaten overzicht</span>
            <span style={s.count}>{calls.length} gesprekken</span>
          </div>
          <div style={s.summaryGrid}>
            {Object.entries(summary).map(([outcome, count]) => (
              <div key={outcome} style={s.summaryChip(outcome)}>
                <strong>{count}</strong>
                {OUTCOME_LABEL[outcome] || outcome}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Appointments ── */}
      <div style={s.card}>
        <div style={s.hdr}>
          <span>{isRange ? `Afspraken (${fromDate} – ${toDate})` : 'Afspraken vandaag'}</span>
          <span style={s.count}>{appointments.length}</span>
        </div>
        {appointments.length === 0
          ? <div style={s.empty}>Geen afspraken in deze periode</div>
          : appointments.map(a => (
            <div key={a.id} style={s.appt}>
              <div style={s.time}>{fmt(a.scheduled_at, 'time')}</div>
              <div style={s.info}>
                <div style={s.title}>{a.title || 'Afspraak'}</div>
                {isRange && <div style={{ ...s.sub, marginBottom: 2 }}>{fmt(a.scheduled_at, 'date')}</div>}
                {a.address && <div style={s.sub}>{a.address}</div>}
                {a.notes   && <div style={{ ...s.sub, fontStyle: 'italic', marginTop: 2 }}>{a.notes}</div>}
              </div>
              <span style={badge(a.status === 'scheduled' ? 'callback' : 'interested')}>{a.status}</span>
            </div>
          ))
        }
      </div>

      {/* ── Call log ── */}
      <div style={s.card}>
        <div style={s.hdr}>
          <span>{isRange ? `Gesprekken (${fromDate} – ${toDate})` : 'Gesprekken vandaag'}</span>
          <span style={s.count}>{calls.length}</span>
        </div>
        {calls.length === 0
          ? <div style={s.empty}>Geen gesprekken in deze periode</div>
          : calls.map(c => (
            <div key={c.id} style={s.callRow}>
              <div style={{ ...s.time, fontSize: 12, minWidth: 40 }}>{fmt(c.ended_at, 'time')}</div>
              <div style={s.info}>
                <div style={{ ...s.title, fontSize: 12 }}>{c.contact_name || c.phone}</div>
                {c.notes && <div style={s.sub}>{c.notes}</div>}
              </div>
              {c.duration_sec > 0 && (
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginRight: 6 }}>
                  {Math.round(c.duration_sec / 60)}m
                </span>
              )}
              <span style={badge(c.outcome)}>{OUTCOME_LABEL[c.outcome] || c.outcome}</span>
            </div>
          ))
        }
      </div>

    </div>
  )
}
