// frontend/src/components/admin/TelephonySettingsTab.jsx
// ────────────────────────────────────────────────────────
// Twilio (and future providers) setup for admins.
// Saves encrypted credentials via POST /api/telephony/setup.
// ────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { api } from '../../hooks/api'

const FIELD_LABELS = {
  account_sid:    { label: 'Account SID',     hint: 'AC…  (Twilio Console → Account Info)', required: true },
  auth_token:     { label: 'Auth Token',       hint: 'Twilio Console → Account Info',       required: true, secret: true },
  api_key_sid:    { label: 'API Key SID',      hint: 'SK…  (Console → API Keys)',            required: true },
  api_key_secret: { label: 'API Key Secret',   hint: 'Created with the API Key',            required: true, secret: true },
  twiml_app_sid:  { label: 'TwiML App SID',   hint: 'AP…  (Console → TwiML Apps)',          required: true },
  phone_number:   { label: 'Phone Number',     hint: '+32…  outbound caller ID',             required: true },
  webhook_base_url:{ label: 'Webhook Base URL',hint: 'https://your-api.up.railway.app',      required: true },
}

const EMPTY = Object.fromEntries(Object.keys(FIELD_LABELS).map(k => [k, '']))

export default function TelephonySettingsTab() {
  const [status,    setStatus]    = useState(null)   // current provider info
  const [form,      setForm]      = useState(EMPTY)
  const [provider,  setProvider]  = useState('twilio')
  const [loading,   setLoading]   = useState(false)
  const [validating,setValidating]= useState(false)
  const [msg,       setMsg]       = useState(null)   // { type: 'ok'|'error', text }
  const [showSecrets, setShowSecrets] = useState(false)

  // Load current provider status
  useEffect(() => {
    api.post('/telephony/token')
      .then(res => setStatus(res))
      .catch(() => setStatus(null))
  }, [])

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }))
    setMsg(null)
  }

  async function handleValidate() {
    setValidating(true)
    setMsg(null)
    try {
      const res = await api.post('/telephony/setup/validate', { provider, ...form })
      if (res.valid) {
        setMsg({ type: 'ok', text: 'Credentials validated successfully!' })
      } else {
        setMsg({ type: 'error', text: 'Validation failed. Check your credentials.' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Validation failed' })
    } finally {
      setValidating(false)
    }
  }

  async function handleSave() {
    setLoading(true)
    setMsg(null)
    try {
      const res = await api.post('/telephony/setup', { provider, ...form })
      setMsg({ type: 'ok', text: res.message || 'Telephony configured!' })
      // Refresh status
      const tok = await api.post('/telephony/token').catch(() => null)
      if (tok) setStatus(tok)
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Save failed' })
    } finally {
      setLoading(false)
    }
  }

  const isFormFilled = Object.values(form).every(v => v.trim())

  const s = {
    wrap:      { maxWidth: 680 },
    section:   { background: '#fff', border: '0.5px solid #e5e5e0', borderRadius: 10, padding: 20, marginBottom: 16 },
    h2:        { fontSize: 13, fontWeight: 600, marginBottom: 14, color: '#1a1a1a' },
    statusRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 },
    dot:       (active) => ({ width: 8, height: 8, borderRadius: '50%', background: active ? '#38a169' : '#e53e3e' }),
    label:     { fontSize: 11, color: '#666', marginBottom: 3, display: 'block' },
    hint:      { fontSize: 10, color: '#aaa', marginTop: 2 },
    input:     { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '0.5px solid #d0d0c8', borderRadius: 7, fontSize: 12, background: '#fafaf8', color: '#1a1a1a', fontFamily: 'monospace' },
    row:       { marginBottom: 12 },
    btns:      { display: 'flex', gap: 8, marginTop: 16 },
    btn:       { padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
    btnP:      { background: '#1d6fb8', color: '#fff' },
    btnS:      { background: '#f0f0ea', color: '#555', border: '0.5px solid #d0d0c8' },
    msg:       (type) => ({ padding: '8px 12px', borderRadius: 7, fontSize: 12, marginTop: 12, background: type === 'ok' ? '#f0fff4' : '#fff5f5', color: type === 'ok' ? '#276749' : '#c53030', border: `0.5px solid ${type === 'ok' ? '#9ae6b4' : '#feb2b2'}` }),
    guide:     { background: '#fffbeb', border: '0.5px solid #f6e05e', borderRadius: 10, padding: 16, marginBottom: 16, fontSize: 12, lineHeight: 1.6 },
    guideTitle:{ fontWeight: 600, marginBottom: 8, color: '#744210' },
    step:      { color: '#92400e', marginBottom: 4 },
    code:      { fontFamily: 'monospace', background: '#fef3c7', padding: '1px 5px', borderRadius: 3, fontSize: 11 },
  }

  return (
    <div style={s.wrap}>
      {/* Current status */}
      <div style={s.section}>
        <div style={s.h2}>Huidige telefonie status</div>
        <div style={s.statusRow}>
          <div style={s.dot(status?.token || status?.provider === 'twilio')} />
          {status
            ? <span>Provider: <strong>{status.provider || 'manual'}</strong> — {status.token ? 'Browser softphone actief' : 'Handmatig bellen (geen VoIP)'}</span>
            : <span style={{ color: '#aaa' }}>Laden…</span>
          }
        </div>
        {status?.provider === 'manual' && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
            Vul hieronder uw Twilio-gegevens in om browser-bellen te activeren.
          </div>
        )}
      </div>

      {/* Setup guide */}
      <div style={s.guide}>
        <div style={s.guideTitle}>Twilio instellen — stap voor stap</div>
        <div style={s.step}>1. Maak een account aan op <strong>console.twilio.com</strong></div>
        <div style={s.step}>2. Kopieer <code style={s.code}>Account SID</code> en <code style={s.code}>Auth Token</code> uit Account Info</div>
        <div style={s.step}>3. Ga naar <strong>API Keys</strong> → maak een Standard-sleutel aan → kopieer SID + Secret</div>
        <div style={s.step}>4. Ga naar <strong>TwiML Apps</strong> → maak een app aan → zet Voice Request URL op <code style={s.code}>{`{uw-API-url}/api/telephony/webhook/voice`}</code></div>
        <div style={s.step}>5. Koop een <strong>telefoonnummer</strong> met Voice-capaciteit</div>
        <div style={s.step}>6. Vul alle velden in en klik <strong>Opslaan</strong></div>
      </div>

      {/* Credentials form */}
      <div style={s.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={s.h2}>Twilio gegevens</div>
          <button style={{ ...s.btn, ...s.btnS, fontSize: 11 }} onClick={() => setShowSecrets(v => !v)}>
            {showSecrets ? '🙈 Verberg' : '👁 Toon'} geheimen
          </button>
        </div>

        {Object.entries(FIELD_LABELS).map(([field, meta]) => (
          <div key={field} style={s.row}>
            <label style={s.label}>
              {meta.label} {meta.required && <span style={{ color: '#e53e3e' }}>*</span>}
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
          <button
            style={{ ...s.btn, ...s.btnS }}
            onClick={handleValidate}
            disabled={validating || !isFormFilled}
          >
            {validating ? 'Valideren…' : '✓ Valideer eerst'}
          </button>
          <button
            style={{ ...s.btn, ...s.btnP }}
            onClick={handleSave}
            disabled={loading || !isFormFilled}
          >
            {loading ? 'Opslaan…' : 'Opslaan & activeren'}
          </button>
        </div>
      </div>

      {/* What happens after save */}
      <div style={s.section}>
        <div style={s.h2}>Wat verandert er na opslaan?</div>
        <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7 }}>
          <div>• Agenten zien automatisch een <strong>browser softphone</strong> in de Phone-tab</div>
          <div>• Nummers worden direct gekozen vanuit de browser (WebRTC)</div>
          <div>• Gesprekken worden gelogd inclusief duur en opname</div>
          <div>• Handmatige modus blijft beschikbaar als fallback</div>
        </div>
      </div>
    </div>
  )
}
