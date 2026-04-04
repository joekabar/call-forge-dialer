// frontend/src/components/admin/TelephonySettingsTab.jsx
// ────────────────────────────────────────────────────────
// Telephony setup for admins.
//
// Primary provider: Telnyx (browser WebRTC softphone)
// CDR supplement:   VoIPTiger API (call log import)
// ────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { api } from '../../hooks/api'

// ── Telnyx credential fields ──────────────────────────────────
const TELNYX_FIELDS = {
  auth_token:   { label: 'Telnyx API Key',       hint: 'KEY…  (Dashboard → API Keys → Create)',          required: true, secret: true },
  api_key_sid:  { label: 'Credential ID',         hint: 'UUID  (Dashboard → Voice → SIP Credentials)',   required: true },
  phone_number: { label: 'Belgisch nummer (DID)', hint: '+32…  outbound caller ID (E.164)',              required: true },
  account_sid:  { label: 'SIP Connection ID',     hint: 'UUID  (Dashboard → Voice → SIP Connections) — optioneel voor server-initiated calls', required: false },
}

const EMPTY_TELNYX = Object.fromEntries(Object.keys(TELNYX_FIELDS).map(k => [k, '']))
const EMPTY_VOIPTIGER = { username: '', password: '', api_key: '' }

export default function TelephonySettingsTab() {
  const [status,      setStatus]      = useState(null)
  const [form,        setForm]        = useState(EMPTY_TELNYX)
  const [vtForm,      setVtForm]      = useState(EMPTY_VOIPTIGER)
  const [loading,     setLoading]     = useState(false)
  const [validating,  setValidating]  = useState(false)
  const [vtLoading,   setVtLoading]   = useState(false)
  const [msg,         setMsg]         = useState(null)
  const [vtMsg,       setVtMsg]       = useState(null)
  const [showSecrets, setShowSecrets] = useState(false)
  const [cdrPreview,  setCdrPreview]  = useState(null)

  useEffect(() => {
    api.post('/telephony/token')
      .then(res => setStatus(res))
      .catch(() => setStatus(null))
  }, [])

  function set(field, val)   { setForm(f  => ({ ...f, [field]: val })); setMsg(null) }
  function setVt(field, val) { setVtForm(f => ({ ...f, [field]: val })); setVtMsg(null) }

  async function handleValidate() {
    setValidating(true); setMsg(null)
    try {
      const res = await api.post('/telephony/setup/validate', { provider: 'telnyx', ...form })
      setMsg(res.valid
        ? { type: 'ok',    text: 'Telnyx credentials zijn geldig!' }
        : { type: 'error', text: 'Validatie mislukt. Controleer uw API Key en Credential ID.' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Validatie mislukt' })
    } finally { setValidating(false) }
  }

  async function handleSave() {
    setLoading(true); setMsg(null)
    try {
      const res = await api.post('/telephony/setup', { provider: 'telnyx', ...form })
      setMsg({ type: 'ok', text: res.message || 'Telnyx geconfigureerd!' })
      const tok = await api.post('/telephony/token').catch(() => null)
      if (tok) setStatus(tok)
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Opslaan mislukt' })
    } finally { setLoading(false) }
  }

  async function handleVtTest() {
    setVtLoading(true); setVtMsg(null); setCdrPreview(null)
    try {
      const res = await api.post('/integrations/voiptiger/cdr-test', vtForm)
      setCdrPreview(res.records || [])
      setVtMsg({ type: 'ok', text: `Verbonden! ${res.count ?? ''} gespreksrecords gevonden.` })
    } catch (err) {
      setVtMsg({ type: 'error', text: err.message || 'VoIPTiger verbinding mislukt' })
    } finally { setVtLoading(false) }
  }

  async function handleVtSave() {
    setVtLoading(true); setVtMsg(null)
    try {
      await api.post('/integrations/voiptiger/save', vtForm)
      setVtMsg({ type: 'ok', text: 'VoIPTiger CDR-instellingen opgeslagen!' })
    } catch (err) {
      setVtMsg({ type: 'error', text: err.message || 'Opslaan mislukt' })
    } finally { setVtLoading(false) }
  }

  const isFormFilled = ['auth_token', 'api_key_sid', 'phone_number'].every(k => form[k]?.trim())
  const isVtFilled   = Object.values(vtForm).every(v => v.trim())
  const isActive     = status?.provider === 'telnyx' && !!status?.token

  const s = {
    wrap:      { maxWidth: 700 },
    section:   { background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, padding: 20, marginBottom: 16 },
    h2:        { fontSize: 13, fontWeight: 600, marginBottom: 14, color: '#1a1a1a' },
    h3:        { fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 },
    statusRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 },
    dot:       (active) => ({ width: 8, height: 8, borderRadius: '50%', background: active ? '#38a169' : '#e53e3e', flexShrink: 0 }),
    label:     { fontSize: 11, color: '#666', marginBottom: 3, display: 'block' },
    hint:      { fontSize: 10, color: '#aaa', marginTop: 2 },
    input:     { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '0.5px solid #d0d0c8', borderRadius: 7, fontSize: 12, background: '#fafaf8', color: '#1a1a1a', fontFamily: 'monospace' },
    row:       { marginBottom: 12 },
    btns:      { display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' },
    btn:       { padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
    btnP:      { background: '#1d6fb8', color: '#fff' },
    btnS:      { background: '#f0f0ea', color: '#555', border: '0.5px solid #d0d0c8' },
    msg:       (type) => ({ padding: '8px 12px', borderRadius: 7, fontSize: 12, marginTop: 12, background: type === 'ok' ? '#f0fff4' : '#fff5f5', color: type === 'ok' ? '#276749' : '#c53030', border: `0.5px solid ${type === 'ok' ? '#9ae6b4' : '#feb2b2'}` }),
    guide:     { background: '#f0f7ff', border: '0.5px solid #bee3f8', borderRadius: 10, padding: 16, marginBottom: 16, fontSize: 12, lineHeight: 1.7 },
    guideTitle:{ fontWeight: 600, marginBottom: 8, color: '#2b6cb0' },
    step:      { color: '#2c5282', marginBottom: 3 },
    code:      { fontFamily: 'monospace', background: '#ebf8ff', padding: '1px 5px', borderRadius: 3, fontSize: 11 },
    divider:   { border: 'none', borderTop: '0.5px solid #e5e5e0', margin: '16px 0' },
    badge:     (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: color + '22', color: color, marginRight: 6, verticalAlign: 'middle' }),
    table:     { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 10 },
    th:        { background: '#f5f5f0', padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#555' },
    td:        { padding: '5px 10px', borderBottom: '0.5px solid #f0f0ea', color: '#1a1a1a' },
  }

  return (
    <div style={s.wrap}>

      {/* ── Status ─────────────────────────────────────────── */}
      <div style={s.section}>
        <div style={s.h2}>Huidige telefonie status</div>
        <div style={s.statusRow}>
          <div style={s.dot(isActive)} />
          <span>
            Provider: <strong>{status?.provider || 'manual'}</strong>
            {' — '}
            {isActive ? 'Browser softphone actief (Telnyx WebRTC)' : 'Handmatig bellen (geen VoIP geconfigureerd)'}
          </span>
        </div>
      </div>

      {/* ── Telnyx setup guide ──────────────────────────────── */}
      <div style={s.guide}>
        <div style={s.guideTitle}>Telnyx instellen — stap voor stap</div>
        <div style={s.step}>1. Maak een account aan op <strong>telnyx.com</strong></div>
        <div style={s.step}>2. Koop een Belgisch nummer: <strong>Numbers → Search &amp; Buy</strong> → zoek op +32</div>
        <div style={s.step}>3. Maak een SIP-verbinding: <strong>Voice → SIP Connections → + Add</strong> → type "Credentials"</div>
        <div style={s.step}>4. Voeg een SIP-credential toe: <strong>Voice → SIP Credentials → + Add</strong> → koppel aan de verbinding → kopieer de <code style={s.code}>Credential ID</code> (UUID)</div>
        <div style={s.step}>5. Wijs het Belgisch nummer toe aan de SIP-verbinding</div>
        <div style={s.step}>6. Maak een API-sleutel: <strong>API Keys → Create Key</strong> → kopieer de sleutel</div>
        <div style={s.step}>7. Vul hieronder in → Valideer → Opslaan</div>
      </div>

      {/* ── Telnyx credentials form ──────────────────────────── */}
      <div style={s.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={s.h2}>
            <span style={s.badge('#1d6fb8')}>TELNYX</span>
            Browser softphone gegevens
          </div>
          <button style={{ ...s.btn, ...s.btnS, fontSize: 11 }} onClick={() => setShowSecrets(v => !v)}>
            {showSecrets ? '🙈 Verberg' : '👁 Toon'} geheimen
          </button>
        </div>

        {Object.entries(TELNYX_FIELDS).map(([field, meta]) => (
          <div key={field} style={s.row}>
            <label style={s.label}>
              {meta.label}
              {meta.required && <span style={{ color: '#e53e3e' }}> *</span>}
            </label>
            <input
              style={s.input}
              type={meta.secret && !showSecrets ? 'password' : 'text'}
              placeholder={meta.hint}
              value={form[field]}
              onChange={e => set(field, e.target.value)}
              autoComplete="off"
            />
            <div style={s.hint}>{meta.hint}</div>
          </div>
        ))}

        {msg && <div style={s.msg(msg.type)}>{msg.text}</div>}

        <div style={s.btns}>
          <button style={{ ...s.btn, ...s.btnS }} onClick={handleValidate} disabled={validating || !isFormFilled}>
            {validating ? 'Valideren…' : '✓ Valideer eerst'}
          </button>
          <button style={{ ...s.btn, ...s.btnP }} onClick={handleSave} disabled={loading || !isFormFilled}>
            {loading ? 'Opslaan…' : 'Opslaan & activeren'}
          </button>
        </div>
      </div>

      {/* ── What changes ────────────────────────────────────── */}
      <div style={s.section}>
        <div style={s.h2}>Wat verandert er na opslaan?</div>
        <div style={{ fontSize: 12, color: '#555', lineHeight: 1.8 }}>
          <div>• Agenten zien automatisch een <strong>browser softphone</strong> in de Phone-tab</div>
          <div>• Bellen gaat rechtstreeks via de browser (WebRTC) zonder plugin</div>
          <div>• Outbound caller ID = uw Belgisch Telnyx-nummer</div>
          <div>• Kosten via Telnyx: ~€0.01–0.02/minuut naar Belgische nummers</div>
          <div>• Handmatige modus blijft beschikbaar als fallback</div>
        </div>
      </div>

      <hr style={s.divider} />

      {/* ── VoIPTiger CDR section ────────────────────────────── */}
      <div style={s.section}>
        <div style={s.h2}>
          <span style={s.badge('#e07b00')}>VOIPTIGER</span>
          CDR import (gespreksgeschiedenis)
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 14, lineHeight: 1.6 }}>
          Optioneel: verbind uw VoIPTiger-account om historische gespreksrecords (CDR) te importeren in de rapporten.
          Het bellen zelf verloopt via Telnyx — VoIPTiger wordt alleen gebruikt voor aanvullende gespreksdata.
        </div>

        <div style={s.row}>
          <label style={s.label}>VoIPTiger gebruikersnaam <span style={{ color: '#e53e3e' }}>*</span></label>
          <input style={s.input} placeholder="uw VoIPTiger login" value={vtForm.username}
            onChange={e => setVt('username', e.target.value)} autoComplete="off" />
        </div>
        <div style={s.row}>
          <label style={s.label}>VoIPTiger wachtwoord <span style={{ color: '#e53e3e' }}>*</span></label>
          <input style={s.input} type={showSecrets ? 'text' : 'password'} placeholder="••••••••"
            value={vtForm.password} onChange={e => setVt('password', e.target.value)} autoComplete="off" />
        </div>
        <div style={s.row}>
          <label style={s.label}>VoIPTiger API Key <span style={{ color: '#e53e3e' }}>*</span></label>
          <input style={s.input} type={showSecrets ? 'text' : 'password'} placeholder="testapikey"
            value={vtForm.api_key} onChange={e => setVt('api_key', e.target.value)} autoComplete="off" />
          <div style={s.hint}>Gevonden in uw VoIPTiger-dashboard onder API-toegang</div>
        </div>

        {vtMsg && <div style={s.msg(vtMsg.type)}>{vtMsg.text}</div>}

        <div style={s.btns}>
          <button style={{ ...s.btn, ...s.btnS }} onClick={handleVtTest} disabled={vtLoading || !isVtFilled}>
            {vtLoading ? 'Testen…' : '✓ Test verbinding'}
          </button>
          <button style={{ ...s.btn, ...s.btnP }} onClick={handleVtSave} disabled={vtLoading || !isVtFilled}>
            {vtLoading ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>

        {cdrPreview && cdrPreview.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={s.h3}>Laatste gespreksrecords (preview)</div>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Datum', 'Van', 'Naar', 'Duur', 'Kosten'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cdrPreview.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td style={s.td}>{r.date || r.calldate || '—'}</td>
                    <td style={s.td}>{r.src  || r.from     || '—'}</td>
                    <td style={s.td}>{r.dst  || r.to       || '—'}</td>
                    <td style={s.td}>{r.duration ? `${r.duration}s` : '—'}</td>
                    <td style={s.td}>{r.cost != null ? `€${Number(r.cost).toFixed(4)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
