"""
backend/compliance/dnc.py
──────────────────────────
Do-Not-Call list management.

Every contact's phone number is checked against the DNC list
before it is shown to an agent. This happens automatically
inside next_contact.py — agents never see DNC numbers.

Belgian/Dutch calling rules:
  - Prospect can add themselves to national DNC lists
  - Companies must honour opt-outs immediately
  - Calling a DNC number = GDPR violation + potential fine
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth.role_guard import require_role
from auth.jwt_validator import AgentContext
from db import get_supabase

router = APIRouter()


async def is_on_dnc(phone: str, org_id: str, db) -> bool:
    """
    Returns True if this phone number is on the org's DNC list.
    Called automatically before every contact is shown to an agent.
    Fast — uses a unique index on (org_id, phone).
    """
    # Normalise phone for comparison
    normalised = _normalise_phone(phone)

    result = db.table("dnc_list")\
        .select("id")\
        .eq("org_id", org_id)\
        .eq("phone", normalised)\
        .execute()

    return bool(result.data)


class AddDNCRequest(BaseModel):
    phone:  str
    reason: str | None = None


@router.post("/dnc/add")
async def add_to_dnc(
    body:  AddDNCRequest,
    agent: AgentContext = Depends(require_role("agent", "supervisor", "admin")),
    db=Depends(get_supabase),
):
    """
    Adds a phone number to the DNC list.
    Agents can add during a call (prospect asks to be removed).
    Admins can bulk-manage via admin panel.
    """
    normalised = _normalise_phone(body.phone)

    db.table("dnc_list").upsert({
        "org_id":   agent.org_id,
        "phone":    normalised,
        "reason":   body.reason or "Added by agent",
        "added_by": agent.id,
    }).execute()

    # Also mark any matching contact as DNC
    db.table("contacts").update({"status": "dnc"})\
        .eq("org_id", agent.org_id)\
        .eq("phone", normalised)\
        .execute()

    return {"status": "ok", "phone": normalised}


@router.get("/dnc/list")
async def get_dnc_list(
    agent: AgentContext = Depends(require_role("admin", "supervisor")),
    db=Depends(get_supabase),
):
    """Returns the full DNC list. Admin and supervisor only."""
    result = db.table("dnc_list")\
        .select("phone, reason, added_at, user_profiles(full_name)")\
        .eq("org_id", agent.org_id)\
        .order("added_at", desc=True)\
        .execute()

    return result.data


@router.delete("/dnc/remove/{phone}")
async def remove_from_dnc(
    phone: str,
    agent: AgentContext = Depends(require_role("admin")),
    db=Depends(get_supabase),
):
    """Removes a number from DNC. Admin only."""
    normalised = _normalise_phone(phone)

    db.table("dnc_list")\
        .delete()\
        .eq("org_id", agent.org_id)\
        .eq("phone", normalised)\
        .execute()

    return {"status": "ok", "removed": normalised}


def _normalise_phone(phone: str) -> str:
    """
    Normalise to digits only for consistent DNC matching.
    +32 470 12 34 56, 0470/12.34.56, 32470123456 → 32470123456
    """
    digits = "".join(c for c in phone if c.isdigit())

    # Belgian: 0470... → 32470...
    if digits.startswith("0") and len(digits) == 10:
        digits = "32" + digits[1:]

    return digits
