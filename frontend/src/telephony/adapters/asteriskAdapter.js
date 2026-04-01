// frontend/src/telephony/adapters/asteriskAdapter.js
// ─────────────────────────────────────────────────────────────
// Asterisk/SIP.js browser adapter STUB.
//
// When implementing Asterisk support:
//   1. npm install sip.js
//   2. Fill in the functions below
//   3. Add to ADAPTER_MAP in useTelephony.js:
//      import { createAsteriskDevice } from './adapters/asteriskAdapter'
//      ADAPTER_MAP["asterisk"] = createAsteriskDevice
//
// SIP.js docs: https://sipjs.com/
// ─────────────────────────────────────────────────────────────

// import { UserAgent, Registerer, Inviter, SessionState } from 'sip.js'

/**
 * Creates a SIP.js UserAgent and returns a normalized adapter.
 *
 * @param {string} token - SIP URI from /api/telephony/token
 * @param {object} handlers - Event callbacks from useTelephony
 * @returns {object} - Normalized device adapter
 */
export async function createAsteriskDevice(token, handlers) {
  const { onReady, onError, onIncoming, onConnect, onDisconnect, onCallState } = handlers

  // The "token" for Asterisk is a JSON-stringified SIP config
  // returned by AsteriskProvider.generate_token() → extra field
  //
  // Example:
  // {
  //   sip_domain: "pbx.company.com",
  //   sip_username: "agent-123",
  //   sip_password: "secret",
  //   ws_url: "wss://pbx.company.com:8089/ws"
  // }

  // TODO: Implement when Asterisk support is needed
  //
  // const config = JSON.parse(token.extra || '{}')
  // const uri = UserAgent.makeURI(`sip:${config.sip_username}@${config.sip_domain}`)
  // const ua = new UserAgent({
  //   uri,
  //   transportOptions: { server: config.ws_url },
  //   authorizationUsername: config.sip_username,
  //   authorizationPassword: config.sip_password,
  // })
  //
  // const registerer = new Registerer(ua)
  // await ua.start()
  // await registerer.register()
  // onReady?.()

  console.warn('[Asterisk] Adapter not yet implemented — falling back to manual mode')
  onReady?.()

  return {
    makeCall: async (phoneNumber, params = {}) => {
      // TODO: const session = new Inviter(ua, targetURI)
      // await session.invite()
      console.warn('[Asterisk] makeCall not implemented')
      return {
        callId: `asterisk-${Date.now()}`,
        accept: () => {},
        reject: () => {},
        disconnect: () => {},
        mute: () => {},
        sendDigits: () => {},
        status: () => 'closed',
        parameters: { To: phoneNumber },
      }
    },

    updateToken: () => {
      // SIP.js doesn't use tokens — re-register instead
    },

    destroy: () => {
      // TODO: registerer.unregister(); ua.stop()
    },

    _raw: null,
  }
}
