"""
backend/dialer/complete_call.py
─────────────────────────────────
Completes a call, logs the outcome, and handles:
  - "interested" → creates appointment + Google Calendar event
  - "callback"   → saves callback date, auto-queued for follow-up
  - other        → logs and moves to next contact
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from auth.role_guard import require_role
from auth.jwt_validator import AgentContext
from db import get_supabase

router = APIRouter()


class CompleteCallRequest(BaseModel):
    contact_id: str
    campaign_id: str
    outcome: str
    duration_sec: Optional[int] = None
    notes: Optional[str] = None
    callback_at: Optional[str] = None
    appointment_at: Optional[str] = None
    appointment_duration_min: Optional[int] = 60
    script_path: Optional[list] = None
    street_verified: Optional[str] = None
    city_verified: Optional[str] = None
    postal_code_verified: Optional[str] = None


VALID_OUTCOMES = {
    "interested", "callback", "not_interested",
    "voicemail", "wrong_number", "dnc", "no_answer",
}

OUTCOME_STATUS = {
    "interested":      "called",
    "not_interested":  "called",
    "wrong_number":    "called",
    "no_answer":       "available",
    "voicemail":       "available",
    "callback":        "callback",
    "dnc":             "dnc",
}


@router.post("/complete-call")
async def complete_call(
    body: CompleteCallRequest,
    agent: AgentContext = Depends(require_role("agent", "supervisor", "admin")),
    db=Depends(get_supabase),
):
    if body.outcome not in VALID_OUTCOMES:
        raise HTTPException(400, f"Invalid outcome: {body.outcome}")

    # Validate required fields per outcome
    if body.outcome == "interested":
        if not body.street_verified or not body.city_verified:
            raise HTTPException(400, "Adres is verplicht bij een afspraak")
        if not body.appointment_at:
            raise HTTPException(400, "Datum/tijd is verplicht bij een afspraak")

    if body.outcome == "callback":
        if not body.callback_at:
            raise HTTPException(400, "Terugbeldatum is verplicht")

    # Verify contact exists and belongs to this org
    row = db.table("contacts") \
        .select("locked_by, phone, first_name, last_name, org_id, call_count, last_outcome") \
        .eq("id", body.contact_id) \
        .eq("org_id", agent.org_id) \
        .single() \
        .execute()

    if not row.data:
        raise HTTPException(404, "Contact not found")

    locked_by = row.data.get("locked_by")
    if locked_by and locked_by != agent.id:
        # Another agent actively holds the lock — block unless already completed
        if row.data.get("last_outcome"):
            raise HTTPException(409, "Contact was already completed by another agent")
        raise HTTPException(403, "Lock held by another agent")
    # locked_by is None (lock expired during a long call) or held by this agent → allow

    contact = row.data
    new_status = OUTCOME_STATUS.get(body.outcome, "called")
    current_call_count = contact.get("call_count", 0) or 0
    now_iso = datetime.now(timezone.utc).isoformat()

    # Build contact update
    upd = {
        "locked_by":       None,
        "locked_at":       None,
        "lock_expires_at": None,
        "status":          new_status,
        "last_called_at":  now_iso,
        "last_outcome":    body.outcome,
        "called_by":       agent.id,
        "call_count":      current_call_count + 1,
        "callback_at":     body.callback_at if body.outcome == "callback" else None,
    }

    if body.street_verified:
        upd.update({
            "street_verified":      body.street_verified,
            "city_verified":        body.city_verified,
            "postal_code_verified": body.postal_code_verified,
            "address_verified_at":  now_iso,
            "address_verified_by":  agent.id,
        })

    db.table("contacts").update(upd).eq("id", body.contact_id).execute()

    # ── Handle "interested" → Create appointment + Calendar event ──
    appointment_result = None
    if body.outcome == "interested" and body.appointment_at:
        try:
            address = ", ".join(filter(None, [
                body.street_verified, body.city_verified, body.postal_code_verified
            ]))
            contact_name = f"{contact.get('first_name', '')} {contact.get('last_name', '')}".strip()

            # Save appointment to database
            appt = db.table("appointments").insert({
                "org_id":        agent.org_id,
                "contact_id":    body.contact_id,
                "agent_id":      agent.id,
                "title":         f"Zonnepanelen huisbezoek — {contact_name}",
                "scheduled_at":  body.appointment_at,
                "duration_min":  body.appointment_duration_min or 60,
                "address":       address,
                "notes":         body.notes,
                "status":        "scheduled",
            }).execute()

            # Create Google Calendar event
            try:
                from integrations.google_calendar import create_appointment_event
                gcal = await create_appointment_event(
                    contact_name=contact_name,
                    address=address,
                    appointment_datetime=body.appointment_at,
                    duration_min=body.appointment_duration_min or 60,
                    agent_name=agent.full_name,
                    notes=body.notes or "",
                )

                # Update appointment with calendar event ID
                if gcal.get("success") and gcal.get("event_id") and appt.data:
                    db.table("appointments").update({
                        "gcal_event_id": gcal["event_id"],
                    }).eq("id", appt.data[0]["id"]).execute()

                appointment_result = {
                    "created": True,
                    "calendar": gcal,
                }
            except Exception as e:
                print(f"[complete-call] Google Calendar error: {e}")
                appointment_result = {
                    "created": True,
                    "calendar": {"success": False, "reason": str(e)},
                }

        except Exception as e:
            print(f"[complete-call] Appointment creation error: {e}")
            appointment_result = {"created": False, "error": str(e)}

    # ── Handle "dnc" → Add to DNC list ──
    if body.outcome == "dnc":
        try:
            db.table("dnc_list").upsert({
                "org_id":   agent.org_id,
                "phone":    contact["phone"],
                "reason":   "Agent marked",
                "added_by": agent.id,
            }).execute()
        except Exception as e:
            print(f"[complete-call] DNC error: {e}")

    # ── Log the call ──
    try:
        db.table("call_logs").insert({
            "org_id":       agent.org_id,
            "contact_id":   body.contact_id,
            "agent_id":     agent.id,
            "campaign_id":  body.campaign_id,
            "outcome":      body.outcome,
            "duration_sec": body.duration_sec,
            "notes":        body.notes,
            "script_path":  body.script_path,
            "ended_at":     now_iso,
        }).execute()
    except Exception as e:
        print(f"[complete-call] Call log error: {e}")

    return {
        "status":         "ok",
        "outcome":        body.outcome,
        "new_status":     new_status,
        "address_saved":  bool(body.street_verified),
        "appointment":    appointment_result,
    }
