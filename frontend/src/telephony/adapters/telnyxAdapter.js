// frontend/src/telephony/adapters/telnyxAdapter.js
// ─────────────────────────────────────────────────────────────
// Telnyx WebRTC browser adapter.
//
// Wraps @telnyx/webrtc into the standard device interface
// expected by useTelephony.js.
//
// Install: npm install @telnyx/webrtc
//
// How it works:
//   1. Backend calls Telnyx API → generates short-lived JWT login token
//   2. Frontend creates TelnyxRTC({ login_token }) → registers as SIP client
//   3. Agent clicks "Bellen" → client.newCall({ destinationNumber })
//   4. Telnyx routes via your Belgian SIP number → PSTN
// ─────────────────────────────────────────────────────────────

import { TelnyxRTC } from '@telnyx/webrtc'

/**
 * Creates a Telnyx WebRTC client and returns a normalized adapter.
 *
 * @param {string} token   - JWT login token from /api/telephony/token
 * @param {object} handlers - Event callbacks from useTelephony
 * @returns {object} - Normalized device adapter
 */
export async function createTelnyxDevice(token, handlers) {
  const { onReady, onError, onIncoming, onConnect, onDisconnect, onCallState } = handlers

  const client = new TelnyxRTC({
    login_token: token,
    // Prefer Opus codec for better voice quality
    audio: true,
    video: false,
  })

  let activeCall = null

  // ── Wire up client events ────────────────────────────────

  client.on('telnyx.ready', () => {
    console.log('[Telnyx] Client registered and ready')
    onReady?.()
  })

  client.on('telnyx.error', (error) => {
    console.error('[Telnyx] Client error:', error)
    onError?.(error?.message || error?.error?.message || 'Telnyx connection error')
  })

  client.on('telnyx.socket.close', () => {
    console.warn('[Telnyx] Socket closed')
    onDisconnect?.()
    onCallState?.('idle')
  })

  client.on('telnyx.notification', (notification) => {
    const call = notification.call

    if (!call) return

    switch (notification.type) {
      case 'callUpdate': {
        const state = call.state

        if (state === 'ringing') {
          // Incoming call
          activeCall = call
          const conn = wrapCall(call, handlers)
          onIncoming?.(conn)
          onCallState?.('ringing')
        } else if (state === 'active') {
          activeCall = call
          const conn = wrapCall(call, handlers)
          onConnect?.(conn)
          onCallState?.('in_progress')
        } else if (state === 'hangup' || state === 'destroy') {
          activeCall = null
          onDisconnect?.()
          onCallState?.('completed')
        } else if (state === 'held') {
          onCallState?.('on_hold')
        }
        break
      }
      default:
        break
    }
  })

  // Connect to Telnyx servers
  client.connect()

  // ── Return normalized adapter ────────────────────────────

  return {
    /**
     * Make an outbound call.
     * @param {string} phoneNumber - E.164 destination number
     * @param {object} params      - Extra metadata (contact_id, campaign_id)
     */
    makeCall: async (phoneNumber, params = {}) => {
      const call = client.newCall({
        destinationNumber: phoneNumber,
        // callerNumber is set server-side via the SIP credential's DID
        audio: true,
        video: false,
        // Pass metadata as custom headers (visible in Telnyx dashboard)
        customHeaders: [
          { name: 'X-Contact-Id',  value: params.contact_id  || '' },
          { name: 'X-Campaign-Id', value: params.campaign_id || '' },
        ],
      })
      activeCall = call
      return wrapCall(call, handlers)
    },

    /**
     * Update the login token before it expires.
     * Telnyx uses long-lived SIP credentials so token refresh is rarely needed,
     * but the hook calls this anyway for safety.
     */
    updateToken: (newToken) => {
      // TelnyxRTC doesn't expose a direct updateToken method —
      // re-connect with the new token if needed
      console.log('[Telnyx] Token refresh — reconnecting')
      client.disconnect()
      client.login_token = newToken
      client.connect()
    },

    /**
     * Clean up on component unmount.
     */
    destroy: () => {
      try {
        if (activeCall) {
          activeCall.hangup()
        }
        client.disconnect()
      } catch (e) {
        // ignore cleanup errors
      }
    },

    _raw: client,
  }
}


/**
 * Wraps a Telnyx Call object into the normalized connection interface.
 */
function wrapCall(call, handlers) {
  const { onConnect, onDisconnect, onCallState } = handlers

  const conn = {
    get callId()     { return call.id || null },
    get parameters() { return { To: call.options?.destinationNumber || '' } },

    accept:     ()           => call.answer(),
    reject:     ()           => call.reject(),
    disconnect: ()           => call.hangup(),
    mute:       (shouldMute) => shouldMute ? call.muteAudio() : call.unmuteAudio(),
    sendDigits: (digits)     => call.dtmf(digits),
    status:     ()           => call.state,
    _raw: call,
  }

  return conn
}
