"""
backend/telephony/twilio_provider.py
────────────────────────────────────
Twilio implementation of TelephonyProvider.

Uses:
  - Twilio Voice JS SDK tokens (for browser WebRTC calling)
  - Twilio REST API (for call control, recording, transfer)
  - TwiML (for webhook responses)

Swap this out for AsteriskProvider, VonageProvider, etc. without
changing any other file in the codebase.
"""

import logging
from typing import Optional, Dict, Any

from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import VoiceResponse

from .base import (
    TelephonyProvider,
    TelephonyCredentials,
    AccessTokenResult,
    CallResult,
    CallbackEvent,
    CallState,
    CallDirection,
)

logger = logging.getLogger(__name__)


# ── Map Twilio status strings → our CallState enum ───────────
_TWILIO_STATE_MAP: Dict[str, CallState] = {
    "queued":      CallState.INITIATING,
    "initiated":   CallState.INITIATING,
    "ringing":     CallState.RINGING,
    "in-progress": CallState.IN_PROGRESS,
    "completed":   CallState.COMPLETED,
    "busy":        CallState.BUSY,
    "no-answer":   CallState.NO_ANSWER,
    "canceled":    CallState.CANCELLED,
    "failed":      CallState.FAILED,
}


class TwilioProvider(TelephonyProvider):
    """
    Twilio Programmable Voice integration.

    Required credentials:
      - account_sid      (ACxxxxxxx)
      - auth_token
      - api_key_sid      (SKxxxxxxx)   — for generating access tokens
      - api_key_secret
      - twiml_app_sid    (APxxxxxxx)   — TwiML App for voice webhooks
      - phone_number     (+32xxxxxxxxx) — default outbound caller ID
      - webhook_base_url (https://api.solarflowpro.com)
    """

    def __init__(self, credentials: TelephonyCredentials):
        super().__init__(credentials)
        self._client: Optional[TwilioClient] = None

    @property
    def client(self) -> TwilioClient:
        """Lazy-init the Twilio REST client."""
        if self._client is None:
            self._client = TwilioClient(
                self.credentials.account_sid,
                self.credentials.auth_token,
            )
        return self._client

    # ── Token generation (browser WebRTC) ─────────────────────

    async def generate_token(
        self,
        agent_id: str,
        agent_name: str,
        ttl: int = 3600,
    ) -> AccessTokenResult:
        """
        Generate a Twilio Access Token with a VoiceGrant.
        The React frontend passes this to @twilio/voice-sdk Device.
        """
        creds = self.credentials

        token = AccessToken(
            creds.account_sid,
            creds.api_key_sid,
            creds.api_key_secret,
            identity=agent_id,
            ttl=ttl,
        )

        voice_grant = VoiceGrant(
            outgoing_application_sid=creds.twiml_app_sid,
            incoming_allow=True,  # allow inbound calls to this agent
        )
        token.add_grant(voice_grant)

        jwt_token = token.to_jwt()

        logger.info(f"Generated Twilio token for agent {agent_id} ({agent_name})")

        return AccessTokenResult(
            token=jwt_token,
            identity=agent_id,
            ttl=ttl,
        )

    # ── Outbound calls ────────────────────────────────────────

    async def make_call(
        self,
        to: str,
        from_number: Optional[str] = None,
        agent_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> CallResult:
        """
        Initiate an outbound call via Twilio REST API.
        Used for power/progressive/predictive modes where the server
        initiates the call (as opposed to browser-initiated preview calls).
        """
        creds = self.credentials
        caller_id = from_number or creds.phone_number
        webhook_url = f"{creds.webhook_base_url}/api/telephony/webhook/voice"
        status_url  = f"{creds.webhook_base_url}/api/telephony/webhook/status"

        call = self.client.calls.create(
            to=to,
            from_=caller_id,
            url=webhook_url,
            status_callback=status_url,
            status_callback_event=["initiated", "ringing", "answered", "completed"],
            status_callback_method="POST",
            machine_detection="Enable",   # AMD — detect voicemail
            machine_detection_timeout=5,
        )

        logger.info(f"Twilio call initiated: {call.sid} → {to}")

        return CallResult(
            call_id=call.sid,
            state=_TWILIO_STATE_MAP.get(call.status, CallState.INITIATING),
            direction=CallDirection.OUTBOUND,
            from_number=caller_id,
            to_number=to,
            extra={"twilio_sid": call.sid},
        )

    # ── In-call controls ──────────────────────────────────────

    async def hangup(self, call_id: str) -> CallResult:
        call = self.client.calls(call_id).update(status="completed")
        return self._call_to_result(call)

    async def hold(self, call_id: str) -> CallResult:
        """Redirect the call to a TwiML that plays hold music."""
        hold_url = f"{self.credentials.webhook_base_url}/api/telephony/webhook/hold"
        self.client.calls(call_id).update(url=hold_url, method="POST")
        return CallResult(
            call_id=call_id,
            state=CallState.ON_HOLD,
            direction=CallDirection.OUTBOUND,
        )

    async def unhold(self, call_id: str) -> CallResult:
        """Redirect back to the normal voice webhook."""
        voice_url = f"{self.credentials.webhook_base_url}/api/telephony/webhook/voice"
        self.client.calls(call_id).update(url=voice_url, method="POST")
        return CallResult(
            call_id=call_id,
            state=CallState.IN_PROGRESS,
            direction=CallDirection.OUTBOUND,
        )

    async def mute(self, call_id: str) -> CallResult:
        """
        Mute the agent leg. In Twilio's model, muting is done via
        conference participants or by updating the call in a conference.
        For direct calls, we use the call update API.
        """
        # Note: Direct call muting requires the call to be in a conference.
        # For the browser SDK, muting is handled client-side by the SDK.
        # This server-side method is for power/predictive modes.
        return CallResult(
            call_id=call_id,
            state=CallState.IN_PROGRESS,
            direction=CallDirection.OUTBOUND,
            extra={"muted": True, "note": "Browser SDK handles mute client-side"},
        )

    async def unmute(self, call_id: str) -> CallResult:
        return CallResult(
            call_id=call_id,
            state=CallState.IN_PROGRESS,
            direction=CallDirection.OUTBOUND,
            extra={"muted": False},
        )

    async def send_dtmf(self, call_id: str, digits: str) -> CallResult:
        """Send DTMF tones via TwiML <Play> digits."""
        twiml = VoiceResponse()
        twiml.play("", digits=digits)
        self.client.calls(call_id).update(twiml=str(twiml))
        return CallResult(
            call_id=call_id,
            state=CallState.IN_PROGRESS,
            direction=CallDirection.OUTBOUND,
            extra={"dtmf_sent": digits},
        )

    # ── Recording ─────────────────────────────────────────────

    async def start_recording(self, call_id: str) -> CallResult:
        recording = self.client.calls(call_id).recordings.create(
            recording_status_callback=(
                f"{self.credentials.webhook_base_url}/api/telephony/webhook/recording"
            ),
        )
        return CallResult(
            call_id=call_id,
            state=CallState.IN_PROGRESS,
            direction=CallDirection.OUTBOUND,
            extra={"recording_sid": recording.sid},
        )

    async def stop_recording(self, call_id: str) -> CallResult:
        # Stop the most recent recording on this call
        recordings = self.client.calls(call_id).recordings.list(limit=1)
        for rec in recordings:
            self.client.calls(call_id).recordings(rec.sid).update(
                status="stopped"
            )
        return CallResult(
            call_id=call_id,
            state=CallState.IN_PROGRESS,
            direction=CallDirection.OUTBOUND,
        )

    # ── Transfer ──────────────────────────────────────────────

    async def transfer(
        self,
        call_id: str,
        to: str,
        announce: bool = False,
    ) -> CallResult:
        """
        Cold transfer: redirect the call to a new TwiML that <Dial>s the target.
        Warm transfer: would use a conference bridge (future enhancement).
        """
        twiml = VoiceResponse()
        twiml.dial(to, caller_id=self.credentials.phone_number)
        self.client.calls(call_id).update(twiml=str(twiml))

        return CallResult(
            call_id=call_id,
            state=CallState.IN_PROGRESS,
            direction=CallDirection.OUTBOUND,
            extra={"transferred_to": to, "warm": announce},
        )

    # ── Webhook parsing ───────────────────────────────────────

    async def parse_callback(
        self,
        request_body: Dict[str, Any],
        headers: Optional[Dict[str, str]] = None,
    ) -> CallbackEvent:
        """
        Parse Twilio's webhook POST body into a normalized CallbackEvent.
        Twilio sends form-encoded data with keys like CallSid, CallStatus, etc.
        """
        status = request_body.get("CallStatus", "").lower()
        duration = request_body.get("CallDuration")
        recording = request_body.get("RecordingUrl")

        return CallbackEvent(
            call_id=request_body.get("CallSid", ""),
            state=_TWILIO_STATE_MAP.get(status, CallState.FAILED),
            direction=(
                CallDirection.INBOUND
                if request_body.get("Direction") == "inbound"
                else CallDirection.OUTBOUND
            ),
            from_number=request_body.get("From"),
            to_number=request_body.get("To"),
            duration_sec=int(duration) if duration else None,
            recording_url=recording,
            timestamp=request_body.get("Timestamp"),
            raw=request_body,
        )

    # ── Voice response builders ───────────────────────────────

    async def build_dial_response(
        self,
        to: str,
        from_number: Optional[str] = None,
        caller_name: Optional[str] = None,
        record: bool = False,
        timeout: int = 30,
        base_url: Optional[str] = None,
    ) -> str:
        """Build TwiML for dialing a phone number."""
        raw_caller = from_number or self.credentials.phone_number or ""
        # Ensure caller_id is E.164 (+XXXXXXXXXXX)
        if raw_caller and not raw_caller.startswith("+"):
            raw_caller = f"+{''.join(c for c in raw_caller if c.isdigit())}"

        # Build action URL from request base_url (reliable) or fall back to stored value
        _base = (base_url or self.credentials.webhook_base_url or "").rstrip("/")
        action_url = f"{_base}/api/telephony/webhook/dial-complete" if _base else None

        response = VoiceResponse()
        dial = response.dial(
            caller_id=raw_caller,
            timeout=timeout,
            record="record-from-answer-dual" if record else "do-not-record",
            **({"action": action_url} if action_url else {}),
        )
        dial.number(to)
        return str(response)

    async def build_hold_response(self) -> str:
        """Build TwiML for hold music."""
        response = VoiceResponse()
        response.say(
            "Een moment alstublieft, u wordt in de wacht gezet.",
            language="nl-NL",
        )
        response.play(
            "http://com.twilio.music.classical.s3.amazonaws.com/BusssoffRondo.mp3",
            loop=10,
        )
        return str(response)

    async def build_voicemail_response(self, message: str = "") -> str:
        """Build TwiML for voicemail drop."""
        response = VoiceResponse()
        if message:
            response.say(message, language="nl-NL")
        response.hangup()
        return str(response)

    # ── Phone number management ───────────────────────────────

    async def list_numbers(self) -> list:
        numbers = self.client.incoming_phone_numbers.list()
        return [
            {
                "sid":           n.sid,
                "phone_number":  n.phone_number,
                "friendly_name": n.friendly_name,
                "capabilities":  {
                    "voice": n.capabilities.get("voice", False),
                    "sms":   n.capabilities.get("sms", False),
                },
            }
            for n in numbers
        ]

    async def validate_credentials(self) -> bool:
        """Ping Twilio API to verify the credentials work."""
        try:
            account = self.client.api.accounts(
                self.credentials.account_sid
            ).fetch()
            return account.status == "active"
        except Exception as e:
            logger.warning(f"Twilio credential validation failed: {e}")
            return False

    # ── Conference (for predictive dialing) ───────────────────

    async def create_conference(self, name: str, **kwargs) -> Dict[str, Any]:
        """
        Conferences in Twilio are created implicitly when the first
        participant joins via TwiML <Dial><Conference>. We just return
        the name — the actual conference is created by the webhook.
        """
        return {"conference_name": name, "provider": "twilio"}

    async def add_to_conference(
        self, conference_id: str, call_id: str, **kwargs
    ) -> Dict[str, Any]:
        """Add a call to a Twilio conference."""
        participant = (
            self.client.conferences(conference_id)
            .participants.create(
                from_=self.credentials.phone_number,
                to=call_id,
                early_media=True,
            )
        )
        return {"participant_sid": participant.sid}

    # ── Internal helpers ──────────────────────────────────────

    def _call_to_result(self, call) -> CallResult:
        """Convert a Twilio Call resource to our CallResult."""
        return CallResult(
            call_id=call.sid,
            state=_TWILIO_STATE_MAP.get(call.status, CallState.FAILED),
            direction=(
                CallDirection.INBOUND
                if call.direction == "inbound"
                else CallDirection.OUTBOUND
            ),
            from_number=call.from_formatted,
            to_number=call.to_formatted,
            duration_sec=int(call.duration) if call.duration else None,
            extra={"twilio_sid": call.sid},
        )
