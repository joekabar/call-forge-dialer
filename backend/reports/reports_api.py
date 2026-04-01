"""
backend/reports/reports_api.py
──────────────────────────────
Daily / period reporting for operators.

GET /api/reports/calls?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
    Returns JSON list of call outcomes for the period (agent own data,
    or org-wide for supervisor/admin).

GET /api/reports/export?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
    Streams a UTF-8 CSV with two sections:
      1. Gesprekken  — every call log entry
      2. Afspraken   — every appointment
"""

import csv
import io
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from auth.role_guard import require_role
from auth.jwt_validator import AgentContext
from db import get_supabase

router = APIRouter()

OUTCOME_LABELS = {
    "interested":     "Afspraak",
    "callback":       "Terugbellen",
    "not_interested": "Niet geïnteresseerd",
    "voicemail":      "Voicemail",
    "wrong_number":   "Fout nummer",
    "dnc":            "DNC",
    "no_answer":      "Niet opgenomen",
}


def _fmt(iso: str | None, fmt: str) -> str:
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime(fmt)
    except Exception:
        return iso or ""


def _build_log_query(db, org_id: str, agent_id: str, role: str, from_iso: str, to_iso: str):
    q = (
        db.table("call_logs")
        .select("id, ended_at, outcome, duration_sec, notes, contacts(first_name, last_name, phone)")
        .eq("org_id", org_id)
        .gte("ended_at", from_iso)
        .lte("ended_at", to_iso)
        .order("ended_at", desc=False)
    )
    if role == "agent":
        q = q.eq("agent_id", agent_id)
    return q


def _build_appt_query(db, org_id: str, agent_id: str, role: str, from_iso: str, to_iso: str):
    q = (
        db.table("appointments")
        .select("id, scheduled_at, title, address, duration_min, status, notes, contacts(first_name, last_name, phone)")
        .eq("org_id", org_id)
        .gte("scheduled_at", from_iso)
        .lte("scheduled_at", to_iso)
        .order("scheduled_at", desc=False)
    )
    if role == "agent":
        q = q.eq("agent_id", agent_id)
    return q


@router.get("/calls")
async def get_calls(
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date:   str = Query(..., description="YYYY-MM-DD"),
    agent: AgentContext = Depends(require_role("agent", "supervisor", "admin")),
    db=Depends(get_supabase),
):
    """Return call logs as JSON for UI display."""
    from_iso = f"{from_date}T00:00:00+00:00"
    to_iso   = f"{to_date}T23:59:59+00:00"

    logs = _build_log_query(db, agent.org_id, agent.id, agent.role, from_iso, to_iso).execute().data or []

    result = []
    for log in logs:
        c = log.get("contacts") or {}
        result.append({
            "id":           log.get("id"),
            "ended_at":     log.get("ended_at"),
            "outcome":      log.get("outcome"),
            "outcome_label": OUTCOME_LABELS.get(log.get("outcome", ""), log.get("outcome", "")),
            "duration_sec": log.get("duration_sec"),
            "notes":        log.get("notes"),
            "contact_name": f"{c.get('first_name', '')} {c.get('last_name', '')}".strip(),
            "phone":        c.get("phone", ""),
        })

    # Outcome summary counts
    summary = {}
    for log in result:
        key = log["outcome"] or "unknown"
        summary[key] = summary.get(key, 0) + 1

    return {"calls": result, "summary": summary, "total": len(result)}


@router.get("/export")
async def export_report(
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date:   str = Query(..., description="YYYY-MM-DD"),
    agent: AgentContext = Depends(require_role("agent", "supervisor", "admin")),
    db=Depends(get_supabase),
):
    """Stream a CSV report of calls + appointments for the given date range."""
    from_iso = f"{from_date}T00:00:00+00:00"
    to_iso   = f"{to_date}T23:59:59+00:00"

    logs  = _build_log_query(db, agent.org_id, agent.id, agent.role, from_iso, to_iso).execute().data or []
    appts = _build_appt_query(db, agent.org_id, agent.id, agent.role, from_iso, to_iso).execute().data or []

    output = io.StringIO()
    # BOM so Excel opens UTF-8 correctly
    output.write("\ufeff")
    writer = csv.writer(output, delimiter=";")

    # ── Call logs section ──────────────────────────────────────
    writer.writerow([f"Gesprekken — {from_date} t/m {to_date}"])
    writer.writerow(["Datum", "Tijd", "Naam", "Telefoon", "Uitkomst", "Duur (min)", "Notities"])
    for log in logs:
        c = log.get("contacts") or {}
        name     = f"{c.get('first_name', '')} {c.get('last_name', '')}".strip()
        duration = round(log["duration_sec"] / 60, 1) if log.get("duration_sec") else ""
        writer.writerow([
            _fmt(log.get("ended_at"), "%d/%m/%Y"),
            _fmt(log.get("ended_at"), "%H:%M"),
            name,
            c.get("phone", ""),
            OUTCOME_LABELS.get(log.get("outcome", ""), log.get("outcome", "")),
            duration,
            log.get("notes", ""),
        ])

    # Outcome totals
    writer.writerow([])
    summary: dict[str, int] = {}
    for log in logs:
        k = log.get("outcome", "unknown")
        summary[k] = summary.get(k, 0) + 1
    writer.writerow(["Totalen"])
    for outcome, count in summary.items():
        writer.writerow([OUTCOME_LABELS.get(outcome, outcome), count])

    writer.writerow([])
    writer.writerow([])

    # ── Appointments section ───────────────────────────────────
    writer.writerow([f"Afspraken — {from_date} t/m {to_date}"])
    writer.writerow(["Datum", "Tijd", "Naam", "Adres", "Duur (min)", "Status", "Notities"])
    for a in appts:
        c = a.get("contacts") or {}
        name = f"{c.get('first_name', '')} {c.get('last_name', '')}".strip()
        writer.writerow([
            _fmt(a.get("scheduled_at"), "%d/%m/%Y"),
            _fmt(a.get("scheduled_at"), "%H:%M"),
            name,
            a.get("address", ""),
            a.get("duration_min", ""),
            a.get("status", ""),
            a.get("notes", ""),
        ])

    output.seek(0)
    filename = f"solarflow_{from_date}_{to_date}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
