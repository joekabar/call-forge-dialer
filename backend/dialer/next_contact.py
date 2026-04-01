"""
backend/dialer/next_contact.py
────────────────────────────────
The core dialer endpoint. Returns exactly one contact to the agent.
All maybe_single() calls replaced with safe .execute() + .data[0] pattern.
Calling hours use Europe/Brussels timezone.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime
from zoneinfo import ZoneInfo

from auth.role_guard import require_role
from auth.jwt_validator import AgentContext
from contacts.serializer import serialize_contact
from dialer.rate_limiter import enforce_rate_limit
from db import get_supabase

router = APIRouter()

BRUSSELS_TZ = ZoneInfo("Europe/Brussels")


class NextContactRequest(BaseModel):
    campaign_id: str


@router.post("/next-contact")
async def get_next_contact(
    body:  NextContactRequest,
    agent: AgentContext = Depends(require_role("agent", "supervisor", "admin")),
    db=Depends(get_supabase),
):
    # 1. Rate limit check
    await enforce_rate_limit(
        agent_id=agent.id,
        campaign_id=body.campaign_id,
        org_interval=agent.org_interval_sec,
        db=db,
    )

    # 2. Calling hours check (Belgian timezone)
    _check_calling_hours(body.campaign_id, db)

    # 3. Release stale lock from this agent
    _release_agent_lock(agent.id, db)

    # 4. Atomic lock — FOR UPDATE SKIP LOCKED
    try:
        result = db.rpc("get_next_contact", {
            "p_org_id":      agent.org_id,
            "p_agent_id":    agent.id,
            "p_campaign_id": body.campaign_id,
        }).execute()
    except Exception as e:
        print(f"[next_contact] RPC error: {e}")
        return {"status": "queue_empty", "contact": None, "message": "Fout bij ophalen contact."}

    if not result or not result.data:
        return {
            "status":  "queue_empty",
            "contact": None,
            "message": "Geen contacten beschikbaar in deze campagne.",
        }

    contact = result.data[0]

    # 5. DNC auto-skip
    max_dnc_skips = 10
    skips = 0
    while skips < max_dnc_skips:
        if not _is_on_dnc(contact["phone"], agent.org_id, db):
            break
        # Mark as DNC and get next
        try:
            db.table("contacts").update({
                "status": "dnc", "locked_by": None,
                "locked_at": None, "lock_expires_at": None,
            }).eq("id", contact["id"]).execute()
        except Exception as e:
            print(f"[next_contact] DNC update error: {e}")

        try:
            result = db.rpc("get_next_contact", {
                "p_org_id":      agent.org_id,
                "p_agent_id":    agent.id,
                "p_campaign_id": body.campaign_id,
            }).execute()
        except Exception as e:
            print(f"[next_contact] RPC error during DNC skip: {e}")
            return {"status": "queue_empty", "contact": None}

        if not result or not result.data:
            return {"status": "queue_empty", "contact": None}

        contact = result.data[0]
        skips += 1

    # 6. Audit log
    try:
        db.table("contact_view_log").insert({
            "org_id":      agent.org_id,
            "contact_id":  contact["id"],
            "agent_id":    agent.id,
            "campaign_id": body.campaign_id,
        }).execute()
    except Exception as e:
        print(f"[next_contact] Audit log error: {e}")

    # 7. Serialize (strip address for agents)
    return {
        "status":  "ok",
        "contact": serialize_contact(contact, agent),
    }


def _check_calling_hours(campaign_id: str, db) -> None:
    """Check calling hours using Europe/Brussels timezone."""
    try:
        result = db.table("campaigns") \
            .select("calling_hours_start, calling_hours_end, country") \
            .eq("id", campaign_id) \
            .execute()

        if not result or not result.data:
            return  # No campaign found — let it through

        campaign_data = result.data[0]
    except Exception as e:
        print(f"[calling_hours] Error reading campaign: {e}")
        return

    now_brussels = datetime.now(BRUSSELS_TZ)
    now_time = now_brussels.strftime("%H:%M")

    start = campaign_data.get("calling_hours_start", "09:00")
    end = campaign_data.get("calling_hours_end", "20:00")

    # Handle time format with seconds (09:00:00 → 09:00)
    if start and len(str(start)) > 5:
        start = str(start)[:5]
    if end and len(str(end)) > 5:
        end = str(end)[:5]

    if not (start <= now_time <= end):
        raise HTTPException(
            403,
            {
                "error": "outside_calling_hours",
                "message": f"Bellen is alleen toegestaan tussen {start} en {end}. Het is nu {now_time} in België.",
                "current_time": now_time,
            }
        )


def _release_agent_lock(agent_id: str, db) -> None:
    """Release any stale locks held by this agent."""
    try:
        db.table("contacts").update({
            "locked_by":       None,
            "locked_at":       None,
            "lock_expires_at": None,
            "status":          "available",
        }).eq("locked_by", agent_id).eq("status", "locked").execute()
    except Exception as e:
        print(f"[release_lock] Error: {e}")


def _is_on_dnc(phone: str, org_id: str, db) -> bool:
    """Check DNC list — safe version without maybe_single()."""
    try:
        from compliance.dnc import _normalise_phone
        normalised = _normalise_phone(phone)
        result = db.table("dnc_list") \
            .select("id") \
            .eq("org_id", org_id) \
            .eq("phone", normalised) \
            .execute()
        return bool(result and result.data)
    except Exception as e:
        print(f"[dnc_check] Error: {e}")
        return False
