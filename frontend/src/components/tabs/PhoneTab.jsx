// frontend/src/components/tabs/PhoneTab.jsx
// ─────────────────────────────────────────────
// Tab 2: Softphone / manual dialer.
//
// Provider-agnostic: works with Twilio, Asterisk, manual, etc.
// The useTelephony hook handles all provider specifics.
//
// Manual mode (trial):  shows number, agent dials on own phone, tracks timer
// VoIP mode (paid):     browser-based softphone with full call controls
// ─────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useCallStore }     from '../../store/callStore'
import { useCampaignStore } from '../../store/campaignStore'
import { useContacts }      from '../../hooks/useContacts'
import { useTelephony }     from '../../telephony/useTelephony'
import ScriptPrompter       from '../script/ScriptPrompter'

export default function PhoneTab({ onTabChange }) {
  const { contact, callStatus, callDurationSec,
          waitSeconds, setCallStatus, startCall, endCall, resetCall } = useCallStore()
  const { campaign }   = useCampaignStore()
  const { requestNextContact, completeCall, loading } = useContacts()
  const [outcome, setOutcome] = useState('')
  const [showDtmf, setShowDtmf] = useState(false)

  // ── Telephony hook (provider-agnostic) ─────────────────────
  const {
    provider,
    deviceReady,
    callState: telCallState,
    callId,
    isMuted,
    isOnHold,
    isRecording,
    error: telError,
    makeCall,
    hangup,
    hold,
    unhold,
    mute,
    unmute,
    sendDtmf,
    startRecording,
    stopRecording,
  } = useTelephony()

  const isVoip = provider !== 'manual'
  const isCallActive = callStatus === 'active' || telCallState === 'in_progress'

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // Sync telephony state → callStore
  useEffect(() => {
    if (telCallState === 'in_progress' && callStatus !== 'active') {
      startCall()
    }
    if (telCallState === 'completed' && callStatus === 'active') {
      endCall()
    }
  }, [telCallState])

  // ── Handlers ───────────────────────────────────────────────

  async function handleStartCall() {
    const dialNumber = contact?.phone_e164 || contact?.phone
    if (isVoip && dialNumber) {
      // VoIP: browser-initiated call via provider SDK
      await makeCall(dialNumber)
    } else {
      // Manual: agent already dialed on own phone
      startCall()
    }
  }

  async function handleHangup() {
    if (isVoip) {
      await hangup()
    }
    endCall()
  }

  async function handleCompleteCall(selectedOutcome) {
    if (!contact || !campaign) return
    await completeCall({
      contact_id:   contact.id,
      campaign_id:  campaign.id,
      outcome:      selectedOutcome,
      duration_sec: callDurationSec,
      call_id:      callId,
    })
    setOutcome('')
    resetCall()
    onTabChange?.('map')
  }

  function handleDtmf(digit) {
    sendDtmf(digit)
  }

  // ── Styles ─────────────────────────────────────────────────
  const s = {
    wrap:     { height: '100%', padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10, overflowY: 'auto' },
    card:     { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', padding: 14 },
    ct:       { fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 },
    phone:    { fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)', textAlign: 'center', margin: '10px 0 4px', letterSpacing: 1 },
    timer:    { fontSize: 26, fontWeight: 500, textAlign: 'center', margin: '4px 0 2px' },
    tlab:     { fontSize: 10, color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: 10 },
    ctrls:    { display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' },
    btn:      { padding: '6px 12px', borderRadius: 7, border: '0.5px solid var(--color-border-secondary)', cursor: 'pointer', fontSize: 12, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' },
    btnP:     { background: '#1d6fb8', color: '#fff', border: 'none' },
    btnD:     { background: '#c53030', color: '#fff', border: 'none' },
    btnWarn:  { background: '#d69e2e', color: '#fff', border: 'none' },
    btnActive:{ background: '#38a169', color: '#fff', border: 'none' },
    outcomes: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
    ob:       (sel) => ({
      padding: '5px 10px', borderRadius: 7, border: '0.5px solid var(--color-border-secondary)',
      fontSize: 11, cursor: 'pointer',
      background: sel ? 'var(--color-background-success)' : 'var(--color-background-primary)',
      color: sel ? '#fff' : 'var(--color-text-primary)',
    }),
    badge:    { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, letterSpacing: '.04em', marginBottom: 8 },
    dtmfGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxWidth: 160, margin: '8px auto' },
    dtmfBtn:  { padding: '8px', borderRadius: 6, border: '0.5px solid var(--color-border-secondary)', cursor: 'pointer', fontSize: 14, fontWeight: 500, textAlign: 'center', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' },
    error:    { padding: '6px 10px', borderRadius: 6, background: '#fed7d7', color: '#c53030', fontSize: 11, marginBottom: 8 },
  }

  // ── Waiting state ──────────────────────────────────────────
  if (waitSeconds > 0) {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={s.timer}>{fmt(waitSeconds)}</div>
          <div style={s.tlab}>Wachttijd tussen contacten</div>
        </div>
      </div>
    )
  }

  // ── No contact loaded ──────────────────────────────────────
  if (!contact) {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={s.tlab}>Geen contact geladen</div>
          <div style={s.ctrls}>
            <button style={{ ...s.btn, ...s.btnP }} onClick={requestNextContact} disabled={loading}>
              {loading ? 'Laden…' : 'Volgend contact ophalen'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────
  return (
    <div style={s.wrap}>
      <div style={s.card}>
        {/* Provider badge */}
        <div style={{ textAlign: 'center' }}>
          <span style={{
            ...s.badge,
            background: isVoip ? '#ebf8ff' : '#fefcbf',
            color: isVoip ? '#2b6cb0' : '#975a16',
          }}>
            {isVoip ? `☎ ${provider.toUpperCase()} SOFTPHONE` : '📱 HANDMATIG BELLEN'}
          </span>
        </div>

        {/* Error display */}
        {telError && <div style={s.error}>{telError}</div>}

        {/* Contact info */}
        <div style={s.ct}>Huidig contact</div>
        <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {contact.first_name} {contact.last_name}
          </div>
          {contact.lead_score != null && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              Lead score: <span style={{ color: '#38a169', fontWeight: 500 }}>{contact.lead_score}</span>
            </div>
          )}
        </div>

        {/* Phone number */}
        <div style={s.phone}>
          {contact.phone_masked || contact.phone_e164 || contact.phone}
        </div>
        <div style={s.tlab}>
          {!isCallActive && !isVoip && 'Bel dit nummer op je telefoon, klik dan op Start'}
          {!isCallActive && isVoip && (deviceReady ? 'Klik Bellen om via de browser te bellen' : 'Softphone wordt geladen…')}
        </div>

        {/* Pre-call controls */}
        {!isCallActive && (
          <div style={s.ctrls}>
            <button
              style={{ ...s.btn, ...s.btnP }}
              onClick={handleStartCall}
              disabled={isVoip && !deviceReady}
            >
              {isVoip ? '📞 Bellen' : '▶ Gesprek gestart — start timer'}
            </button>
            <button style={s.btn} onClick={requestNextContact} disabled={loading}>
              Overslaan
            </button>
          </div>
        )}

        {/* Active call controls */}
        {isCallActive && (
          <>
            <div style={s.timer}>{fmt(callDurationSec)}</div>
            <div style={s.tlab}>Gesprek actief</div>

            {/* VoIP call controls */}
            {isVoip && (
              <div style={{ ...s.ctrls, marginBottom: 10 }}>
                <button
                  style={{ ...s.btn, ...(isMuted ? s.btnWarn : {}) }}
                  onClick={() => isMuted ? unmute() : mute()}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? '🔇 Mute uit' : '🔇 Mute'}
                </button>

                <button
                  style={{ ...s.btn, ...(isOnHold ? s.btnWarn : {}) }}
                  onClick={() => isOnHold ? unhold() : hold()}
                  title={isOnHold ? 'Uit de wacht halen' : 'In de wacht zetten'}
                >
                  {isOnHold ? '⏸ Wacht uit' : '⏸ Wacht'}
                </button>

                <button
                  style={{ ...s.btn, ...(isRecording ? s.btnActive : {}) }}
                  onClick={() => isRecording ? stopRecording() : startRecording()}
                  title={isRecording ? 'Opname stoppen' : 'Opname starten'}
                >
                  {isRecording ? '⏺ Opname stoppen' : '⏺ Opnemen'}
                </button>

                <button
                  style={{ ...s.btn, ...(showDtmf ? s.btnActive : {}) }}
                  onClick={() => setShowDtmf(!showDtmf)}
                  title="Toetsenbord"
                >
                  ⌨ Toetsen
                </button>

                <button style={{ ...s.btn, ...s.btnD }} onClick={handleHangup}>
                  📵 Ophangen
                </button>
              </div>
            )}

            {/* Manual mode: simple end button */}
            {!isVoip && (
              <div style={{ ...s.ctrls, marginBottom: 10 }}>
                <button style={{ ...s.btn, ...s.btnD }} onClick={handleHangup}>
                  ⏹ Gesprek beëindigd
                </button>
              </div>
            )}

            {/* DTMF keypad (VoIP only) */}
            {isVoip && showDtmf && (
              <div style={s.dtmfGrid}>
                {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
                  <button key={d} style={s.dtmfBtn} onClick={() => handleDtmf(d)}>
                    {d}
                  </button>
                ))}
              </div>
            )}

            {/* Call outcomes */}
            <div style={s.ct}>Resultaat gesprek</div>
            <div style={s.outcomes}>
              {['interested', 'callback', 'not_interested', 'voicemail', 'wrong_number', 'no_answer'].map(o => (
                <button key={o} style={s.ob(outcome === o)} onClick={() => setOutcome(o)}>
                  {o.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
            {outcome && (
              <div style={{ ...s.ctrls, marginTop: 10 }}>
                <button style={{ ...s.btn, ...s.btnP }} onClick={() => handleCompleteCall(outcome)}>
                  Opslaan & volgend contact
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right panel: Script prompter */}
      <div style={s.card}>
        <ScriptPrompter />
      </div>
    </div>
  )
}
