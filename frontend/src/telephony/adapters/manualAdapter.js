// frontend/src/telephony/adapters/manualAdapter.js
// ─────────────────────────────────────────────────────────────
// Manual mode adapter (trial / no telephony provider configured).
//
// Agents dial on their own phone. SolarFlow Pro only tracks
// call timing and outcomes. No browser audio, no SDK.
//
// This file exists so useTelephony.js doesn't need if/else
// branches for manual mode — it just calls the same interface.
// ─────────────────────────────────────────────────────────────

/**
 * Creates a no-op device adapter for manual dialing mode.
 */
export async function createManualDevice(token, handlers) {
  const { onReady } = handlers

  // Immediately ready — nothing to initialize
  onReady?.()

  return {
    makeCall: async (phoneNumber, params = {}) => {
      // No actual call placed — agent dials on their own phone
      return {
        callId:     `manual-${Date.now()}`,
        accept:     () => {},
        reject:     () => {},
        disconnect: () => {},
        mute:       () => {},
        sendDigits: () => {},
        status:     () => 'open',
        parameters: { To: phoneNumber },
      }
    },

    updateToken: () => {},
    destroy:     () => {},
    _raw:        null,
  }
}
