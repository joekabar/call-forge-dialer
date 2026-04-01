"""
backend/telephony/asterisk_provider.py
──────────────────────────────────────
Asterisk/SIP provider stub — demonstrates the extensibility pattern.

To activate:
  1. Implement the abstract methods below
  2. In factory.py, uncomment: PROVIDER_REGISTRY["asterisk"] = AsteriskProvider
  3. Done — the admin can select "asterisk" in the setup UI

This would use SIP.js on the frontend (via a new asteriskAdapter.js)
and communicate with an Asterisk server via ARI (Asterisk REST Interface)
or AMI (Asterisk Manager Interface).

Dependencies (when implementing):
  pip install ari-py  # or panoramisk for asyncio AMI
"""

import logging

from .base import (
    TelephonyProvider,
    TelephonyCredentials,
    AccessTokenResult,
)

logger = logging.getLogger(__name__)


class AsteriskProvider(TelephonyProvider):
    """
    Asterisk integration via ARI (Asterisk REST Interface).

    Required credentials:
      - sip_domain       (pbx.yourcompany.com)
      - sip_username     (ARI username)
      - sip_password     (ARI password)
      - phone_number     (outbound caller ID)
      - webhook_base_url (for Stasis app events)

    Frontend adapter: asteriskAdapter.js (uses SIP.js for WebRTC)
    """

    def __init__(self, credentials: TelephonyCredentials):
        super().__init__(credentials)
        self._ari_client = None

    # ── Token generation ──────────────────────────────────────
    # For Asterisk + SIP.js, the "token" is actually the SIP
    # registration credentials (domain, username, password).
    # The frontend asteriskAdapter.js uses these to register
    # a SIP.js UserAgent with the Asterisk server.

    async def generate_token(self, agent_id, agent_name, ttl=3600):
        """
        Return SIP registration info for the browser.
        SIP.js will use this to register with Asterisk via WebSocket.
        """
        creds = self.credentials
        return AccessTokenResult(
            token=f"sip:{agent_id}@{creds.sip_domain}",
            identity=agent_id,
            ttl=ttl,
            extra={
                "sip_domain":   creds.sip_domain,
                "sip_username": f"{agent_id}",
                "sip_password": creds.sip_password,  # In production, generate per-agent
                "ws_url":       f"wss://{creds.sip_domain}:8089/ws",
            },
        )

    # ── Outbound calls ────────────────────────────────────────

    async def make_call(self, to, from_number=None, agent_id=None, metadata=None):
        """
        Originate a call via ARI.
        TODO: implement with ari-py or panoramisk
        """
        raise NotImplementedError("Asterisk make_call not yet implemented")

    # ── In-call controls ──────────────────────────────────────

    async def hangup(self, call_id):
        raise NotImplementedError("Asterisk hangup not yet implemented")

    async def hold(self, call_id):
        raise NotImplementedError("Asterisk hold not yet implemented")

    async def unhold(self, call_id):
        raise NotImplementedError("Asterisk unhold not yet implemented")

    async def mute(self, call_id):
        raise NotImplementedError("Asterisk mute not yet implemented")

    async def unmute(self, call_id):
        raise NotImplementedError("Asterisk unmute not yet implemented")

    async def send_dtmf(self, call_id, digits):
        raise NotImplementedError("Asterisk send_dtmf not yet implemented")

    # ── Recording ─────────────────────────────────────────────

    async def start_recording(self, call_id):
        raise NotImplementedError("Asterisk start_recording not yet implemented")

    async def stop_recording(self, call_id):
        raise NotImplementedError("Asterisk stop_recording not yet implemented")

    # ── Transfer ──────────────────────────────────────────────

    async def transfer(self, call_id, to, announce=False):
        raise NotImplementedError("Asterisk transfer not yet implemented")

    # ── Webhook parsing ───────────────────────────────────────

    async def parse_callback(self, request_body, headers=None):
        """Parse ARI Stasis events into normalized CallbackEvent."""
        raise NotImplementedError("Asterisk parse_callback not yet implemented")

    # ── Voice response ────────────────────────────────────────

    async def build_dial_response(self, to, from_number=None, caller_name=None, record=False, timeout=30):
        """
        For Asterisk, this would return an ARI channel originate command
        or a dialplan context reference, not TwiML.
        """
        raise NotImplementedError("Asterisk build_dial_response not yet implemented")

    # ── Phone number management ───────────────────────────────

    async def list_numbers(self):
        """List SIP trunks / DIDs from Asterisk config."""
        raise NotImplementedError("Asterisk list_numbers not yet implemented")

    async def validate_credentials(self):
        """Ping Asterisk ARI to verify connectivity."""
        try:
            # TODO: implement ARI ping
            # import ari
            # client = ari.connect(f"http://{self.credentials.sip_domain}:8088", ...)
            # client.asterisk.getInfo()
            return False  # Return False until implemented
        except Exception as e:
            logger.warning(f"Asterisk validation failed: {e}")
            return False
