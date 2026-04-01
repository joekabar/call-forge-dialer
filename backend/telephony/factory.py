"""
backend/telephony/factory.py
────────────────────────────
Provider factory — the ONLY place in the codebase where provider
classes are referenced by name. Adding a new provider means:
  1. Create providers/new_provider.py implementing TelephonyProvider
  2. Add it to PROVIDER_REGISTRY below
  3. Done — every route, hook, and component works automatically.

Also handles credential encryption/decryption from Supabase.
"""

import json
import logging
from typing import Dict, Type

from cryptography.fernet import Fernet

from .base import TelephonyProvider, TelephonyCredentials
from .twilio_provider import TwilioProvider

logger = logging.getLogger(__name__)


# ── Provider registry ─────────────────────────────────────────
# To add a new provider:
#   from .asterisk_provider import AsteriskProvider
#   PROVIDER_REGISTRY["asterisk"] = AsteriskProvider

PROVIDER_REGISTRY: Dict[str, Type[TelephonyProvider]] = {
    "twilio":    TwilioProvider,
    # "asterisk":  AsteriskProvider,       # ← uncomment when ready
    # "vonage":    VonageProvider,          # ← uncomment when ready
    # "telnyx":    TelnyxProvider,          # ← uncomment when ready
}


# ── Manual mode (no-op provider) ──────────────────────────────
# Used during free trial when agents dial on their own phone.
# Implements the interface but every call-control method is a no-op.

class ManualProvider(TelephonyProvider):
    """
    No-op provider for trial/manual mode.
    Agents use their own phone — SolarFlow Pro only tracks timing/outcomes.
    """

    async def generate_token(self, agent_id, agent_name, ttl=3600):
        return None  # No browser phone in manual mode

    async def make_call(self, to, from_number=None, agent_id=None, metadata=None):
        from .base import CallResult, CallState, CallDirection
        return CallResult(
            call_id=f"manual-{agent_id}",
            state=CallState.IN_PROGRESS,
            direction=CallDirection.OUTBOUND,
            to_number=to,
        )

    async def hangup(self, call_id):
        from .base import CallResult, CallState, CallDirection
        return CallResult(call_id=call_id, state=CallState.COMPLETED, direction=CallDirection.OUTBOUND)

    async def hold(self, call_id):
        from .base import CallResult, CallState, CallDirection
        return CallResult(call_id=call_id, state=CallState.ON_HOLD, direction=CallDirection.OUTBOUND)

    async def unhold(self, call_id):
        from .base import CallResult, CallState, CallDirection
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def mute(self, call_id):
        from .base import CallResult, CallState, CallDirection
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def unmute(self, call_id):
        from .base import CallResult, CallState, CallDirection
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def send_dtmf(self, call_id, digits):
        from .base import CallResult, CallState, CallDirection
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def start_recording(self, call_id):
        from .base import CallResult, CallState, CallDirection
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def stop_recording(self, call_id):
        from .base import CallResult, CallState, CallDirection
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def transfer(self, call_id, to, announce=False):
        from .base import CallResult, CallState, CallDirection
        return CallResult(call_id=call_id, state=CallState.IN_PROGRESS, direction=CallDirection.OUTBOUND)

    async def parse_callback(self, request_body, headers=None):
        from .base import CallbackEvent, CallState, CallDirection
        return CallbackEvent(call_id="manual", state=CallState.COMPLETED, direction=CallDirection.OUTBOUND, raw=request_body)

    async def build_dial_response(self, to, from_number=None, caller_name=None, record=False, timeout=30):
        return ""

    async def list_numbers(self):
        return []

    async def validate_credentials(self):
        return True


PROVIDER_REGISTRY["manual"] = ManualProvider


# ── Credential encryption ─────────────────────────────────────

def _get_fernet(encryption_key: str) -> Fernet:
    """Create a Fernet cipher from the app-level encryption key."""
    if not encryption_key:
        raise ValueError(
            "CREDENTIAL_ENCRYPTION_KEY is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\" "
            "and add it to Railway environment variables."
        )
    try:
        return Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)
    except Exception:
        raise ValueError(
            "CREDENTIAL_ENCRYPTION_KEY is invalid. It must be a 32-byte url-safe base64 string. "
            "Generate a new one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )


def encrypt_credentials(
    credentials: TelephonyCredentials,
    encryption_key: str,
) -> str:
    """
    Serialize + encrypt credentials for safe storage in Supabase.
    Stored in organizations.telephony_credentials_encrypted column.
    """
    data = {
        "provider":         credentials.provider,
        "account_sid":      credentials.account_sid,
        "auth_token":       credentials.auth_token,
        "api_key_sid":      credentials.api_key_sid,
        "api_key_secret":   credentials.api_key_secret,
        "twiml_app_sid":    credentials.twiml_app_sid,
        "phone_number":     credentials.phone_number,
        "sip_domain":       credentials.sip_domain,
        "sip_username":     credentials.sip_username,
        "sip_password":     credentials.sip_password,
        "webhook_base_url": credentials.webhook_base_url,
        "extra":            credentials.extra,
    }
    f = _get_fernet(encryption_key)
    return f.encrypt(json.dumps(data).encode()).decode()


def decrypt_credentials(
    encrypted: str,
    encryption_key: str,
) -> TelephonyCredentials:
    """Decrypt credentials from Supabase back into a TelephonyCredentials object."""
    f = _get_fernet(encryption_key)
    data = json.loads(f.decrypt(encrypted.encode()).decode())
    return TelephonyCredentials(**data)


# ── Factory function ──────────────────────────────────────────

async def get_provider(
    org_id: str,
    db,
    encryption_key: str,
) -> TelephonyProvider:
    """
    Resolve the telephony provider for an organization.

    Reads the org's encrypted credentials from Supabase,
    decrypts them, and returns the matching provider instance.

    Falls back to ManualProvider if no credentials are configured
    (free trial mode).
    """
    # Fetch org record
    result = db.table("organizations").select(
        "telephony_provider, telephony_credentials_encrypted"
    ).eq("id", org_id).single().execute()

    org = result.data if result.data else {}
    provider_name = org.get("telephony_provider", "manual")
    encrypted = org.get("telephony_credentials_encrypted")

    # No credentials → manual mode (trial)
    if not encrypted or provider_name == "manual":
        logger.info(f"Org {org_id}: using ManualProvider (no telephony configured)")
        return ManualProvider(TelephonyCredentials(provider="manual"))

    # Decrypt and instantiate
    credentials = decrypt_credentials(encrypted, encryption_key)

    provider_class = PROVIDER_REGISTRY.get(provider_name)
    if not provider_class:
        logger.error(f"Unknown telephony provider '{provider_name}' for org {org_id}")
        raise ValueError(f"Unknown telephony provider: {provider_name}")

    logger.info(f"Org {org_id}: using {provider_name} provider")
    return provider_class(credentials)


async def get_available_providers() -> list:
    """List all registered providers (for admin UI dropdown)."""
    return [
        {"id": name, "name": name.title(), "available": True}
        for name in PROVIDER_REGISTRY.keys()
    ]
