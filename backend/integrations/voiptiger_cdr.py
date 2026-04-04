"""
backend/integrations/voiptiger_cdr.py
──────────────────────────────────────
VoIPTiger CDR (Call Detail Records) API integration.

Used purely for importing call history from VoIPTiger into the
reports dashboard. The actual browser calling goes via Telnyx.

VoIPTiger API:
  Base URL:  https://vtapi.voiptiger.com/api
  Auth:      Basic Auth (username:password) + header apiKey
  Endpoints:
    GET /CDRfixed   — fixed-line CDR records
    GET /CDRmobile  — mobile CDR records (if available)

VoIPTiger credentials are stored in the organization's settings table
(not in telephony_credentials_encrypted — those are for call providers).
"""

import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.role_guard import require_role
from db import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations/voiptiger", tags=["voiptiger"])

VOIPTIGER_BASE = "https://vtapi.voiptiger.com/api"


# ── Request models ────────────────────────────────────────────

class VoipTigerCredentials(BaseModel):
    username: str
    password: str
    api_key:  str


# ── Helper ────────────────────────────────────────────────────

async def _fetch_cdr(creds: VoipTigerCredentials, endpoint: str = "CDRfixed") -> list:
    """
    Fetch CDR records from VoIPTiger API.
    Returns a list of record dicts.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{VOIPTIGER_BASE}/{endpoint}",
            auth=(creds.username, creds.password),
            headers={"apiKey": creds.api_key},
        )

    if resp.status_code == 401:
        raise HTTPException(401, "VoIPTiger: ongeldige inloggegevens of API-sleutel")
    if resp.status_code == 403:
        raise HTTPException(403, "VoIPTiger: geen toegang — controleer uw API-sleutel")
    if resp.status_code != 200:
        raise HTTPException(502, f"VoIPTiger API fout: {resp.status_code}")

    data = resp.json()
    # VoIPTiger returns either a list or { "records": [...] }
    if isinstance(data, list):
        return data
    return data.get("records", data.get("data", []))


# ── Endpoints ─────────────────────────────────────────────────

@router.post("/cdr-test")
async def test_voiptiger_connection(
    creds: VoipTigerCredentials,
    agent=Depends(require_role("admin", "superadmin")),
):
    """
    Test VoIPTiger credentials and return a preview of CDR records.
    Called by the admin TelephonySettingsTab.
    """
    records = await _fetch_cdr(creds, endpoint="CDRfixed")
    return {
        "ok":      True,
        "count":   len(records),
        "records": records[:20],  # return max 20 for preview
    }


@router.post("/save")
async def save_voiptiger_credentials(
    creds: VoipTigerCredentials,
    agent=Depends(require_role("admin", "superadmin")),
    db=Depends(get_supabase),
):
    """
    Save VoIPTiger credentials to org settings.
    Stored in organizations.voiptiger_credentials (JSON column).
    """
    payload = {
        "voiptiger_username": creds.username,
        "voiptiger_password": creds.password,
        "voiptiger_api_key":  creds.api_key,
    }

    result = db.table("organizations").update(payload).eq("id", agent.org_id).execute()
    if not result.data:
        raise HTTPException(500, "Kon VoIPTiger-instellingen niet opslaan")

    return {"ok": True, "message": "VoIPTiger CDR-instellingen opgeslagen"}


@router.get("/cdr")
async def get_cdr_records(
    endpoint: str = "CDRfixed",
    agent=Depends(require_role("admin", "supervisor", "superadmin")),
    db=Depends(get_supabase),
):
    """
    Fetch CDR records for the org using stored credentials.
    Used by the reports dashboard.
    """
    org = db.table("organizations").select(
        "voiptiger_username, voiptiger_password, voiptiger_api_key"
    ).eq("id", agent.org_id).single().execute()

    if not org.data or not org.data.get("voiptiger_username"):
        raise HTTPException(404, "VoIPTiger is niet geconfigureerd voor deze organisatie")

    creds = VoipTigerCredentials(
        username=org.data["voiptiger_username"],
        password=org.data["voiptiger_password"],
        api_key= org.data["voiptiger_api_key"],
    )

    records = await _fetch_cdr(creds, endpoint=endpoint)
    return {"ok": True, "count": len(records), "records": records}
