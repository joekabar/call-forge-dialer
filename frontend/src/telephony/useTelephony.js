// frontend/src/telephony/useTelephony.js
// ────────────────────────────────────────────────────────────────
// Provider-agnostic telephony hook.
//
// This hook talks to /api/telephony/* endpoints. It does NOT import
// any Twilio (or other provider) code directly. The backend decides
// which provider to use; this hook just manages the browser-side
// device lifecycle and call state.
//
// The only provider-specific code is in useTwilioDevice.js, which
// this hook loads dynamically based on the provider name returned
// by the /token endpoint.
//
// Usage in PhoneTab.jsx:
//   const { device, callState, makeCall, hangup, ... } = useTelephony()
// ────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAgentStore }    from '../store/agentStore'
import { useCallStore }     from '../store/callStore'
import { useCampaignStore } from '../store/campaignStore'
import { api }              from '../hooks/api'

// Provider-specific device adapters
import { createTwilioDevice }  from './adapters/twilioAdapter'
import { createTelnyxDevice }  from './adapters/telnyxAdapter'
import { createManualDevice }  from './adapters/manualAdapter'

const ADAPTER_MAP = {
  twilio:  createTwilioDevice,
  telnyx:  createTelnyxDevice,
  manual:  createManualDevice,
}


export function useTelephony() {
  const { user }     = useAgentStore()
  const { contact }  = useCallStore()
  const { campaign } = useCampaignStore()

  // ── State ──────────────────────────────────────────────────
  const [provider,    setProvider]    = useState('manual')
  const [deviceReady, setDeviceReady] = useState(false)
  const [callState,   setCallState]   = useState('idle')
  const [callId,      setCallId]      = useState(null)
  const [isMuted,     setIsMuted]     = useState(false)
  const [isOnHold,    setIsOnHold]    = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [error,       setError]       = useState(null)

  // Ref to the active device adapter (provider-specific)
  const deviceRef = useRef(null)
  // Ref to the active connection/call object
  const connectionRef = useRef(null)
  // Token refresh timer
  const tokenTimerRef = useRef(null)

  // ── Initialize device on mount ─────────────────────────────

  const initDevice = useCallback(async () => {
    try {
      setError(null)

      // 1. Get token from backend (backend resolves the provider)
      const res = await api.post('/telephony/token')

      if (!res.token) {
        // Manual mode — no browser softphone
        setProvider('manual')
        setDeviceReady(true)
        return
      }

      setProvider(res.provider)

      // 2. Load the correct adapter
      const createDevice = ADAPTER_MAP[res.provider]
      if (!createDevice) {
        throw new Error(`No adapter for provider: ${res.provider}`)
      }

      // 3. Create and register the device
      const device = await createDevice(res.token, {
        identity: res.identity,
        // Event handlers — these normalize events across providers
        onReady:        () => setDeviceReady(true),
        onError:        (e) => { setError(e.message || String(e)); setCallState('idle') },
        onIncoming:     (conn) => { connectionRef.current = conn; setCallState('ringing') },
        onConnect:      (conn) => {
          connectionRef.current = conn
          // CallSid may only be available after accept — capture it now
          if (conn?.callId) setCallId(conn.callId)
          setCallState('in_progress')
        },
        onDisconnect:   () => { connectionRef.current = null; setCallState('completed') },
        onCallState:    (state) => setCallState(state),
      })

      deviceRef.current = device
      setDeviceReady(true)

      // 4. Schedule token refresh (5 min before expiry)
      if (tokenTimerRef.current) clearTimeout(tokenTimerRef.current)
      const refreshIn = ((res.ttl || 3600) - 300) * 1000
      tokenTimerRef.current = setTimeout(() => refreshToken(), refreshIn)

    } catch (err) {
      setError(err.message || 'Failed to initialize telephony')
      setDeviceReady(false)
    }
  }, [])

  const refreshToken = useCallback(async () => {
    try {
      const res = await api.post('/telephony/token')
      if (res.token && deviceRef.current?.updateToken) {
        deviceRef.current.updateToken(res.token)
      }
      // Re-schedule
      const refreshIn = ((res.ttl || 3600) - 300) * 1000
      tokenTimerRef.current = setTimeout(() => refreshToken(), refreshIn)
    } catch (err) {
      setError('Token refresh failed — reconnecting...')
      await initDevice()
    }
  }, [initDevice])

  // Init on mount
  useEffect(() => {
    initDevice()
    return () => {
      if (tokenTimerRef.current) clearTimeout(tokenTimerRef.current)
      if (deviceRef.current?.destroy) deviceRef.current.destroy()
    }
  }, [initDevice])

  // ── Call actions (all provider-agnostic) ────────────────────

  const makeCall = useCallback(async (phoneNumber) => {
    setError(null)
    setCallState('initiating')

    if (provider === 'manual') {
      // Manual mode: agent dials on own phone, we just track timing
      setCallState('in_progress')
      setCallId(`manual-${Date.now()}`)
      return
    }

    try {
      if (deviceRef.current?.makeCall) {
        // Browser-initiated call (preview mode via SDK)
        const conn = await deviceRef.current.makeCall(phoneNumber, {
          contact_id:  contact?.id,
          campaign_id: campaign?.id,
        })
        connectionRef.current = conn
        setCallId(conn?.callId || conn?.parameters?.CallSid || null)
      } else {
        // Server-initiated call (power/progressive mode via REST)
        const res = await api.post('/telephony/call', {
          to:          phoneNumber,
          contact_id:  contact?.id,
          campaign_id: campaign?.id,
        })
        setCallId(res.call_id)
        setCallState('ringing')
      }
    } catch (err) {
      setError(err.message || 'Failed to make call')
      setCallState('idle')
    }
  }, [provider, contact, campaign])

  const hangup = useCallback(async () => {
    try {
      if (connectionRef.current?.disconnect) {
        connectionRef.current.disconnect()
      } else if (callId && provider !== 'manual') {
        await api.post('/telephony/call/hangup', { call_id: callId })
      }
      setCallState('completed')
      setCallId(null)
      setIsMuted(false)
      setIsOnHold(false)
    } catch (err) {
      setError(err.message)
    }
  }, [callId, provider])

  const hold = useCallback(async () => {
    try {
      if (callId && provider !== 'manual') {
        await api.post('/telephony/call/hold', { call_id: callId })
      }
      setIsOnHold(true)
    } catch (err) { setError(err.message) }
  }, [callId, provider])

  const unhold = useCallback(async () => {
    try {
      if (callId && provider !== 'manual') {
        await api.post('/telephony/call/unhold', { call_id: callId })
      }
      setIsOnHold(false)
    } catch (err) { setError(err.message) }
  }, [callId, provider])

  const mute = useCallback(async () => {
    try {
      // Mute locally via SDK (instant, no round-trip)
      if (connectionRef.current?.mute) {
        connectionRef.current.mute(true)
      } else if (callId && provider !== 'manual') {
        await api.post('/telephony/call/mute', { call_id: callId })
      }
      setIsMuted(true)
    } catch (err) { setError(err.message) }
  }, [callId, provider])

  const unmute = useCallback(async () => {
    try {
      if (connectionRef.current?.mute) {
        connectionRef.current.mute(false)
      } else if (callId && provider !== 'manual') {
        await api.post('/telephony/call/unmute', { call_id: callId })
      }
      setIsMuted(false)
    } catch (err) { setError(err.message) }
  }, [callId, provider])

  const sendDtmf = useCallback(async (digits) => {
    try {
      if (connectionRef.current?.sendDigits) {
        connectionRef.current.sendDigits(digits)
      } else if (callId && provider !== 'manual') {
        await api.post('/telephony/call/dtmf', { call_id: callId, digits })
      }
    } catch (err) { setError(err.message) }
  }, [callId, provider])

  const startRecording = useCallback(async () => {
    try {
      if (callId && provider !== 'manual') {
        await api.post('/telephony/call/record/start', { call_id: callId })
      }
      setIsRecording(true)
    } catch (err) { setError(err.message) }
  }, [callId, provider])

  const stopRecording = useCallback(async () => {
    try {
      if (callId && provider !== 'manual') {
        await api.post('/telephony/call/record/stop', { call_id: callId })
      }
      setIsRecording(false)
    } catch (err) { setError(err.message) }
  }, [callId, provider])

  const transfer = useCallback(async (to, announce = false) => {
    try {
      if (callId && provider !== 'manual') {
        await api.post('/telephony/call/transfer', { call_id: callId, to, announce })
      }
      setCallState('completed')
      setCallId(null)
    } catch (err) { setError(err.message) }
  }, [callId, provider])

  // ── Return ─────────────────────────────────────────────────

  return {
    // State
    provider,
    deviceReady,
    callState,
    callId,
    isMuted,
    isOnHold,
    isRecording,
    error,

    // Actions
    makeCall,
    hangup,
    hold,
    unhold,
    mute,
    unmute,
    sendDtmf,
    startRecording,
    stopRecording,
    transfer,
    initDevice,
  }
}
