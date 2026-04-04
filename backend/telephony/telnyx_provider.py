"""
backend/telephony/telnyx_provider.py
─────────────────────────────────────
Telnyx WebRTC provider.

Architecture:
  - Backend generates a short-lived JWT login token via Telnyx API
  - Browser uses @telnyx/webrtc with that token to register as a softphone
  - Outbound calls: browser initiates via SDK (preview dialing mode)
  - Call control (mute/hold/hangup): via Telnyx Call Control REST API

Required credentials (stored encrypted in Supabase):
  auth_token   → Telnyx API Key  (starts with KEY...)
  api_key_sid  → Telnyx Credential ID  (the SIP credential UUID)
  phone_number → Belgian number in E.164 (e.g. +3225...)

Telnyx dashboard setup:
  1. Voice → SIP Connections → Create "Credential" connection
  2. SIP Credentials → Add credential → note the credential ID (UUID)
  3. Numbers → Buy a Belgian number → assign to the SIP connection
  4. API Keys → Create an API key → store as auth_token
"""

import logging
from typing import Optional, Dict, Any

import httpx

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

TELNYX_API = "https://api.telnyx.com/v2"


class TelnyxProvider(TelephonyProvider):

    def __init__(self, credentials: TelephonyCredentials):
        super().__init__(credentials)

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.credentials.auth_token}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
        }

    # ── Token for browser softphone ───────────────────────────

    async def generate_token(
        self,
        agent_id: str,
        agent_name: str,
        ttl: int = 3600,
    ) -> AccessTokenResult:
        """
        Generate a short-lived JWT login token for @telnyx/webrtc.

        Calls POST /v2/telephony_credentials/{id}/token
        The browser passes this token to TelnyxRTC({ login_token: ... })
        """
        credential_id = self.credentials.api_key_sid
        if not credential_id:
            raise ValueError(
                "Telnyx Credential ID (api_key_sid) is not set. "
                "Go to Telnyx dashboard → Voice → SIP Credentials → copy the UUID."
            )

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{TELNYX_API}/telephony_credentials/{credential_id}/token",
                headers=self._headers(),
            )

        if resp.status_code != 200:
            logger.error(f"Telnyx token error {resp.status_code}: {resp.text}")
            raise ValueError(
                f"Failed to generate Telnyx token: {resp.status_code} — "
                "check your API Key and Credential ID."
            )

        token = resp.json()["data"]["token"]
        return AccessTokenResult(
            token=token,
            identity=agent_id,
            ttl=ttl,
            extra={"phone_number": self.credentials.phone_number or ""},
        )

    # ── Outbound call (server-initiated via Call Control API) ─

    async def make_call(
        self,
        to: str,
        from_number: Optional[str] = None,
        agent_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> CallResult:
        caller_id = from_number or self.credentials.phone_number or ""
        if caller_id and not caller_id.startswith("+"):
            caller_id = f"+{''.join(c for c in caller_id if c.isdigit())}"

        connection_id = self.credentials.account_sid  # SIP connection ID
        if not connection_id:
            raise ValueError("Telnyx SIP Connection ID (account_sid) is not configured.")

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{TELNYX_API}/calls",
                headers=self._headers(),
                json={
                    "connection_id": connection_id,
                    "to":   to,
                    "from": caller_id,
                    "client_state": agent_id or "",
                },
            )

        if resp.status_code not in (200, 201):
            raise ValueError(f"Telnyx make_call failed: {resp.status_code} {resp.text}")

        data = resp.json()["data"]
        return CallResult(
            call_id=data["call_control_id"],
            state=CallState.INITIATING,
            direction=CallDirection.OUTBOUND,
            to_number=to,
            from_number=caller_id,
        )

    # ── Call control ──────────────────────────────────────────

    async def _call_action(self, call_id: str, action: str, body: dict = None) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{TELNYX_API}/calls/{call_id}/actions/{action}",
                headers=self._headers(),
                json=body or {},
            )
        if resp.status_code not in (200, 201):
            logger.warning(f"Telnyx {action} failed: {resp.status_code} {resp.text}")

    async def hangup(self, call_id: str) -> CallResult:
        await self._call_action(call_id, "hangup")
        return CallResult(call_id=call_id, state=CallState.COMPLETED, direction=CallDirection.OUTBOUND)

    async def hold(self, call_id: str) -> CallResult:
        await self._call_action(call_id, "hold", {"audio_url": ""})
        return CallResult(call_id=call_id, state=CallState.ON_HOLD, direction=CallDirection.OUTBOUND)

    async def unhold(self, call_id: str) -> CallResult:
        await self._call_action(call_id, "unhold")
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def mute(self, call_id: str) -> CallResult:
        # Mute is handled client-side by @telnyx/webrtc SDK for browser calls
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def unmute(self, call_id: str) -> CallResult:
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def send_dtmf(self, call_id: str, digits: str) -> CallResult:
        await self._call_action(call_id, "send_dtmf", {"digits": digits, "duration_millis": 500})
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def start_recording(self, call_id: str) -> CallResult:
        await self._call_action(call_id, "record_start", {"format": "mp3", "channels": "dual"})
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def stop_recording(self, call_id: str) -> CallResult:
        await self._call_action(call_id, "record_stop")
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def transfer(self, call_id: str, to: str, announce: bool = False) -> CallResult:
        await self._call_action(call_id, "transfer", {"to": to})
        return CallResult(call_id=call_id, state=CallState.COMPLETED, direction=CallDirection.OUTBOUND)

    # ── Webhook parsing ───────────────────────────────────────

    async def parse_callback(
        self,
        request_body: Dict[str, Any],
        headers: Optional[Dict[str, str]] = None,
    ) -> CallbackEvent:
        data = request_body.get("data", {})
        payload = data.get("payload", {})
        event_type = data.get("event_type", "")

        state_map = {
            "call.initiated":   CallState.RINGING,
            "call.answered":    CallState.IN_PROGRESS,
            "call.hangup":      CallState.COMPLETED,
            "call.bridged":     CallState.IN_PROGRESS,
        }

        return CallbackEvent(
            call_id=payload.get("call_control_id", ""),
            state=state_map.get(event_type, CallState.IN_PROGRESS),
            direction=CallDirection.OUTBOUND,
            from_number=payload.get("from", ""),
            to_number=payload.get("to", ""),
            duration_sec=payload.get("duration_secs"),
            raw=request_body,
        )

    async def build_dial_response(self, to, from_number=None, caller_name=None, record=False, timeout=30) -> str:
        # Telnyx Call Control doesn't use TwiML — no dial response needed
        return ""

    # ── Phone numbers ─────────────────────────────────────────

    async def list_numbers(self) -> list:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{TELNYX_API}/phone_numbers",
                headers=self._headers(),
            )
        if resp.status_code != 200:
            return []
        return [
            {"number": n["phone_number"], "friendly_name": n.get("phone_number")}
            for n in resp.json().get("data", [])
        ]

    # ── Credential validation ─────────────────────────────────

    async def validate_credentials(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{TELNYX_API}/phone_numbers?page[size]=1",
                    headers=self._headers(),
                )
            return resp.status_code == 200
        except Exception as e:
            logger.warning(f"Telnyx validation failed: {e}")
            return False
