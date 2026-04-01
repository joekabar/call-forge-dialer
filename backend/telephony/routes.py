"""
backend/telephony/routes.py
───────────────────────────
FastAPI router for all telephony operations.

These endpoints are 100% provider-agnostic. They use the factory to
get the right provider for the requesting org, then call abstract methods.
Swapping Twilio → Asterisk requires ZERO changes to this file.

Integrates with existing SolarFlow Pro patterns:
  - Uses the same auth/role_guard as other routes
  - Logs calls to the same call_logs table
  - Respects the same rate limiter
  - Uses the same org_id from the JWT
"""

import os
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from auth.role_guard import require_role
from db import get_supabase
from .factory import get_provider, get_available_providers, encrypt_credentials
from .base import TelephonyCredentials

logger = logging.getLogger(__name__)
router = APIRouter(tags=["telephony"])

ENCRYPTION_KEY = os.getenv("CREDENTIAL_ENCRYPTION_KEY", "")
if not ENCRYPTION_KEY:
    logger.warning(
        "⚠️  CREDENTIAL_ENCRYPTION_KEY is not set! "
        "Telephony setup will fail. Generate a key with: "
        "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
    )


# ── Dependency: get provider for current user's org ───────────

async def _get_org_provider(
    agent=Depends(require_role("agent", "supervisor", "admin")),
    db=Depends(get_supabase),
):
    """FastAPI dependency — resolves the telephony provider for the current org."""
    provider = await get_provider(agent.org_id, db, ENCRYPTION_KEY)
    return provider, agent, db


# ── Request/Response models ───────────────────────────────────

class TokenResponse(BaseModel):
    token: Optional[str]
    identity: Optional[str]
    ttl: Optional[int]
    provider: str

class MakeCallRequest(BaseModel):
    to: str                                  # E.164 phone number
    contact_id: Optional[str] = None         # Link to contacts table
    campaign_id: Optional[str] = None        # Link to campaigns table
    from_number: Optional[str] = None        # Override caller ID

class CallControlRequest(BaseModel):
    call_id: str

class DtmfRequest(BaseModel):
    call_id: str
    digits: str

class TransferRequest(BaseModel):
    call_id: str
    to: str
    announce: bool = False

class SetupCredentialsRequest(BaseModel):
    provider: str                            # "twilio" | "asterisk" | ...
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None
    api_key_sid: Optional[str] = None
    api_key_secret: Optional[str] = None
    twiml_app_sid: Optional[str] = None
    phone_number: Optional[str] = None
    sip_domain: Optional[str] = None
    sip_username: Optional[str] = None
    sip_password: Optional[str] = None
    webhook_base_url: Optional[str] = None


# ═══════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════


# ── 1. Access token (browser softphone init) ──────────────────

@router.post("/token", response_model=TokenResponse)
async def get_telephony_token(deps=Depends(_get_org_provider)):
    """
    Generate a short-lived token for the browser softphone.
    Called once when PhoneTab mounts, refreshed before expiry.
    """
    provider, agent, db = deps

    result = await provider.generate_token(
        agent_id=agent.id,
        agent_name=getattr(agent, 'full_name', '') or str(agent.id),
    )

    if result is None:
        # Manual mode — no browser phone
        return TokenResponse(
            token=None,
            identity=None,
            ttl=None,
            provider="manual",
        )

    return TokenResponse(
        token=result.token,
        identity=result.identity,
        ttl=result.ttl,
        provider=provider.credentials.provider,
    )


# ── 2. Make call (server-initiated, for power/predictive) ─────

@router.post("/call")
async def make_call(body: MakeCallRequest, deps=Depends(_get_org_provider)):
    """
    Initiate a call from the server (power/progressive/predictive mode).
    For preview mode, the browser initiates the call via the SDK.
    """
    provider, agent, db = deps

    result = await provider.make_call(
        to=body.to,
        from_number=body.from_number,
        agent_id=agent.id,
        metadata={
            "contact_id":  body.contact_id,
            "campaign_id": body.campaign_id,
            "org_id":      agent.org_id,
        },
    )

    # Log to Supabase call_log
    db.table("call_logs").insert({
        "org_id":       agent.org_id,
        "agent_id":     agent.id,
        "contact_id":   body.contact_id,
        "campaign_id":  body.campaign_id,
        "call_sid":     result.call_id,
        "direction":    result.direction.value,
        "from_number":  result.from_number,
        "to_number":    result.to_number,
        "status":       result.state.value,
        "provider":     provider.credentials.provider,
    }).execute()

    return {
        "status":  "ok",
        "call_id": result.call_id,
        "state":   result.state.value,
    }


# ── 3. Call controls ──────────────────────────────────────────

@router.post("/call/hangup")
async def hangup_call(body: CallControlRequest, deps=Depends(_get_org_provider)):
    provider, agent, db = deps
    result = await provider.hangup(body.call_id)
    return {"status": "ok", "state": result.state.value}


@router.post("/call/hold")
async def hold_call(body: CallControlRequest, deps=Depends(_get_org_provider)):
    provider, agent, db = deps
    result = await provider.hold(body.call_id)
    return {"status": "ok", "state": result.state.value}


@router.post("/call/unhold")
async def unhold_call(body: CallControlRequest, deps=Depends(_get_org_provider)):
    provider, agent, db = deps
    result = await provider.unhold(body.call_id)
    return {"status": "ok", "state": result.state.value}


@router.post("/call/mute")
async def mute_call(body: CallControlRequest, deps=Depends(_get_org_provider)):
    provider, agent, db = deps
    result = await provider.mute(body.call_id)
    return {"status": "ok", "state": result.state.value}


@router.post("/call/unmute")
async def unmute_call(body: CallControlRequest, deps=Depends(_get_org_provider)):
    provider, agent, db = deps
    result = await provider.unmute(body.call_id)
    return {"status": "ok", "state": result.state.value}


@router.post("/call/dtmf")
async def send_dtmf(body: DtmfRequest, deps=Depends(_get_org_provider)):
    provider, agent, db = deps
    await provider.send_dtmf(body.call_id, body.digits)
    return {"status": "ok"}


@router.post("/call/transfer")
async def transfer_call(body: TransferRequest, deps=Depends(_get_org_provider)):
    provider, agent, db = deps
    result = await provider.transfer(body.call_id, body.to, body.announce)
    return {"status": "ok", "state": result.state.value}


# ── 4. Recording ──────────────────────────────────────────────

@router.post("/call/record/start")
async def start_recording(body: CallControlRequest, deps=Depends(_get_org_provider)):
    provider, agent, db = deps
    result = await provider.start_recording(body.call_id)
    return {"status": "ok", "recording_sid": result.extra.get("recording_sid")}


@router.post("/call/record/stop")
async def stop_recording(body: CallControlRequest, deps=Depends(_get_org_provider)):
    provider, agent, db = deps
    await provider.stop_recording(body.call_id)
    return {"status": "ok"}


# ── 5. Webhooks (provider callbacks) ──────────────────────────
# These endpoints receive events FROM the telephony provider.
# They must be publicly accessible (no JWT auth — validated by provider).

@router.post("/webhook/voice")
async def webhook_voice(request: Request, db=Depends(get_supabase)):
    """
    Voice webhook — provider calls this when a call connects.
    Must return voice instructions (TwiML for Twilio, etc.).
    IMPORTANT: This must ALWAYS return valid XML — never JSON.
    Twilio interprets any non-XML response as "application error".
    """
    def _twiml_error(msg: str) -> Response:
        return Response(
            content=f"<Response><Say>{msg}</Say></Response>",
            media_type="application/xml",
        )

    try:
        form = await request.form()
        body = dict(form)

        call_sid   = body.get("CallSid", "")
        from_field = body.get("From", "")
        to_number  = body.get("To", "")

        # Ensure E.164 format (+XXXXXXXXXXX) — stored numbers are digits-only
        if to_number and not to_number.startswith("+") and not to_number.startswith("client:"):
            to_number = f"+{to_number}"

        org_id = None

        # Browser-initiated calls: From = "client:<agent_uuid>"
        # The CallSid is new and not yet in call_logs — look up org via the agent profile.
        if from_field.startswith("client:"):
            agent_id = from_field[len("client:"):]
            profile = db.table("user_profiles").select("org_id").eq("id", agent_id).single().execute()
            if profile.data:
                org_id = profile.data["org_id"]

        # Server-initiated calls: CallSid is already in call_logs
        if not org_id and call_sid:
            call_log = db.table("call_logs").select("org_id").eq("call_sid", call_sid).single().execute()
            if call_log.data:
                org_id = call_log.data["org_id"]

        if not org_id:
            logger.warning(f"webhook_voice: could not resolve org for CallSid={call_sid} From={from_field}")
            return _twiml_error("Call not recognized.")

        # Derive base URL from the request so action URLs are always absolute
        base_url = f"{request.url.scheme}://{request.url.netloc}"

        provider = await get_provider(org_id, db, ENCRYPTION_KEY)
        twiml = await provider.build_dial_response(to=to_number, base_url=base_url)
        return Response(content=twiml, media_type="application/xml")

    except Exception as exc:
        logger.error(f"webhook_voice exception: {exc}", exc_info=exc)
        return _twiml_error("An internal error occurred. Please try again.")


@router.post("/webhook/dial-complete")
async def webhook_dial_complete(request: Request):
    """
    Called by Twilio when the <Dial> leg ends (callee hangs up).
    We just hang up the caller's leg too.
    """
    return Response(
        content="<Response><Hangup/></Response>",
        media_type="application/xml",
    )


@router.post("/webhook/status")
async def webhook_status(request: Request, db=Depends(get_supabase)):
    """
    Status callback — provider sends call state changes here.
    Updates the call_log in Supabase.
    """
    form = await request.form()
    body = dict(form)
    call_sid = body.get("CallSid", "")

    # Look up org for this call
    call_log = db.table("call_logs").select("org_id, id").eq(
        "call_sid", call_sid
    ).single().execute()

    if not call_log.data:
        logger.warning(f"Status callback for unknown call: {call_sid}")
        return {"status": "ignored"}

    org_id = call_log.data["org_id"]
    provider = await get_provider(org_id, db, ENCRYPTION_KEY)
    event = await provider.parse_callback(body)

    # Update call log
    update = {"status": event.state.value}
    if event.duration_sec is not None:
        update["duration_sec"] = event.duration_sec
    if event.recording_url:
        update["recording_url"] = event.recording_url

    db.table("call_logs").update(update).eq("id", call_log.data["id"]).execute()

    logger.info(f"Call {call_sid}: status → {event.state.value}")
    return {"status": "ok"}


@router.post("/webhook/hold")
async def webhook_hold(request: Request, db=Depends(get_supabase)):
    """Serve hold music TwiML."""
    form = await request.form()
    body = dict(form)
    call_sid = body.get("CallSid", "")

    call_log = db.table("call_logs").select("org_id").eq(
        "call_sid", call_sid
    ).single().execute()

    if call_log.data:
        org_id = call_log.data["org_id"]
        provider = await get_provider(org_id, db, ENCRYPTION_KEY)
        if hasattr(provider, "build_hold_response"):
            twiml = await provider.build_hold_response()
            return Response(content=twiml, media_type="application/xml")

    # Fallback
    return Response(
        content="<Response><Play loop='10'>http://com.twilio.music.classical.s3.amazonaws.com/BusssoffRondo.mp3</Play></Response>",
        media_type="application/xml",
    )


@router.post("/webhook/recording")
async def webhook_recording(request: Request, db=Depends(get_supabase)):
    """Handle recording completion callbacks."""
    form = await request.form()
    body = dict(form)
    call_sid = body.get("CallSid", "")
    recording_url = body.get("RecordingUrl", "")

    if call_sid and recording_url:
        db.table("call_logs").update(
            {"recording_url": recording_url}
        ).eq("call_sid", call_sid).execute()

    return {"status": "ok"}




# ── 6. Admin: setup & manage telephony ────────────────────────

@router.get("/providers")
async def list_providers(agent=Depends(require_role("admin"))):
    """List all available telephony providers."""
    return await get_available_providers()


@router.get("/setup")
async def get_telephony_setup(
    agent=Depends(require_role("admin")),
    db=Depends(get_supabase),
):
    """
    Return masked credential summary for the admin UI.
    Sensitive fields are partially masked — never returns raw secrets.
    """
    result = db.table("organizations").select(
        "telephony_provider, telephony_credentials_encrypted"
    ).eq("id", agent.org_id).single().execute()

    org = result.data if result.data else {}
    provider_name = org.get("telephony_provider", "manual")
    encrypted = org.get("telephony_credentials_encrypted")

    if not encrypted or provider_name == "manual":
        return {"provider": "manual", "configured": False}

    try:
        from .factory import decrypt_credentials
        creds = decrypt_credentials(encrypted, ENCRYPTION_KEY)
    except Exception as e:
        return {"provider": provider_name, "configured": True, "error": f"Decryption failed: {e}"}

    def mask(val: str | None, show: int = 6) -> str | None:
        if not val:
            return None
        return val[:show] + "***" if len(val) > show else val

    return {
        "provider":         provider_name,
        "configured":       True,
        "account_sid":      mask(creds.account_sid),
        "api_key_sid":      mask(creds.api_key_sid),
        "twiml_app_sid":    creds.twiml_app_sid,   # shown in full — not a secret
        "phone_number":     creds.phone_number,
        "webhook_base_url": creds.webhook_base_url,
    }


@router.get("/numbers")
async def list_phone_numbers(deps=Depends(_get_org_provider)):
    """List phone numbers on the org's telephony account."""
    provider, agent, db = deps
    return await provider.list_numbers()


@router.post("/setup")
async def setup_telephony(
    body: SetupCredentialsRequest,
    agent=Depends(require_role("admin")),
    db=Depends(get_supabase),
):
    """
    Save telephony credentials for the org.
    Admin-only. Encrypts and stores in the organizations table.
    """
    credentials = TelephonyCredentials(
        provider=body.provider,
        account_sid=body.account_sid,
        auth_token=body.auth_token,
        api_key_sid=body.api_key_sid,
        api_key_secret=body.api_key_secret,
        twiml_app_sid=body.twiml_app_sid,
        phone_number=body.phone_number,
        sip_domain=body.sip_domain,
        sip_username=body.sip_username,
        sip_password=body.sip_password,
        webhook_base_url=body.webhook_base_url,
    )

    # Validate TwiML App SID format (must be APxxxxxxxx, not a URL)
    if body.provider == "twilio" and body.twiml_app_sid:
        if not body.twiml_app_sid.startswith("AP"):
            raise HTTPException(
                400,
                "TwiML App SID must start with 'AP' (e.g. APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx). "
                "Find it in Twilio Console → Voice → TwiML Apps. "
                "Do not paste the webhook URL here — that goes in the 'Webhook Base URL' field."
            )

    # Validate before saving
    from .factory import PROVIDER_REGISTRY
    provider_class = PROVIDER_REGISTRY.get(body.provider)
    if not provider_class:
        raise HTTPException(400, f"Unknown provider: {body.provider}")

    provider = provider_class(credentials)
    valid = await provider.validate_credentials()
    if not valid:
        raise HTTPException(400, "Could not validate credentials with the provider. Check your Account SID and Auth Token.")

    # Encrypt and store
    try:
        encrypted = encrypt_credentials(credentials, ENCRYPTION_KEY)
    except ValueError as e:
        logger.error(f"Encryption key error: {e}")
        raise HTTPException(500, "Server is missing CREDENTIAL_ENCRYPTION_KEY. Set it in Railway environment variables and redeploy.")

    db.table("organizations").update({
        "telephony_provider":              body.provider,
        "telephony_credentials_encrypted": encrypted,
    }).eq("id", agent.org_id).execute()

    return {
        "status":   "ok",
        "provider": body.provider,
        "message":  f"Telephony configured with {body.provider.title()}. Browser softphone is now active.",
    }


@router.post("/setup/validate")
async def validate_credentials(
    body: SetupCredentialsRequest,
    agent=Depends(require_role("admin")),
):
    """Validate credentials without saving them."""
    credentials = TelephonyCredentials(
        provider=body.provider,
        account_sid=body.account_sid,
        auth_token=body.auth_token,
        api_key_sid=body.api_key_sid,
        api_key_secret=body.api_key_secret,
        twiml_app_sid=body.twiml_app_sid,
        phone_number=body.phone_number,
    )

    from .factory import PROVIDER_REGISTRY
    provider_class = PROVIDER_REGISTRY.get(body.provider)
    if not provider_class:
        raise HTTPException(400, f"Unknown provider: {body.provider}")

    provider = provider_class(credentials)
    valid = await provider.validate_credentials()

    return {"valid": valid}
