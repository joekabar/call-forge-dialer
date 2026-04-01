"""
backend/contacts/import_csv.py
────────────────────────────────
Imports contacts from a CSV or Excel file.
Also provides a reset endpoint to mark all contacts in a campaign
back to 'available' without deleting them.
"""

import io
import csv
import traceback
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from auth.role_guard import require_role
from auth.jwt_validator import AgentContext
from compliance.dnc import _normalise_phone
from db import get_supabase

router = APIRouter()

COLUMN_MAP = {
    "first_name": ["first_name", "firstname", "voornaam", "prénom", "vorname"],
    "last_name":  ["last_name",  "lastname",  "naam",  "achternaam", "nom", "nachname"],
    "phone":      ["phone", "tel", "telefoon", "telephone", "mobile", "gsm", "nummer"],
    "email":      ["email", "e-mail", "mail"],
    "street":     ["street", "straat", "adres", "address", "rue", "strasse"],
    "city":       ["city", "stad", "gemeente", "ville", "ort"],
    "postal_code":["postal_code", "postcode", "zip", "plz"],
    "lead_score": ["lead_score", "score", "prioriteit"],
}


class ResetCampaignRequest(BaseModel):
    campaign_id: str


@router.delete("/clear-campaign/{campaign_id}")
async def clear_campaign_contacts(
    campaign_id: str,
    agent: AgentContext = Depends(require_role("admin", "supervisor")),
    db=Depends(get_supabase),
):
    """
    Delete ALL contacts in a campaign permanently.
    This allows re-importing contacts into a campaign from scratch.
    Admin/supervisor only.
    """
    campaign = db.table("campaigns") \
        .select("id, name") \
        .eq("id", campaign_id) \
        .eq("org_id", agent.org_id) \
        .maybe_single() \
        .execute()

    if not campaign.data:
        raise HTTPException(404, "Campagne niet gevonden")

    try:
        result = db.table("contacts") \
            .delete() \
            .eq("campaign_id", campaign_id) \
            .eq("org_id", agent.org_id) \
            .execute()

        deleted_count = len(result.data) if result.data else 0

        return {
            "status": "ok",
            "campaign_id": campaign_id,
            "campaign_name": campaign.data["name"],
            "deleted_count": deleted_count,
        }
    except Exception as e:
        print(f"[clear_campaign] Error: {e}")
        raise HTTPException(500, f"Verwijderen mislukt: {e}")


@router.post("/reset-campaign")
async def reset_campaign_contacts(
    body: ResetCampaignRequest,
    agent: AgentContext = Depends(require_role("admin", "supervisor")),
    db=Depends(get_supabase),
):
    """
    Reset all contacts in a campaign back to 'available'.
    Clears locks, call status fields, and resets status.
    Does NOT delete contacts or call logs.
    Admin/supervisor only.
    """
    # Verify campaign belongs to this org
    campaign = db.table("campaigns") \
        .select("id, name") \
        .eq("id", body.campaign_id) \
        .eq("org_id", agent.org_id) \
        .maybe_single() \
        .execute()

    if not campaign.data:
        raise HTTPException(404, "Campagne niet gevonden")

    try:
        result = db.table("contacts").update({
            "status":          "available",
            "locked_by":       None,
            "locked_at":       None,
            "lock_expires_at": None,
        }).eq("campaign_id", body.campaign_id) \
          .eq("org_id", agent.org_id) \
          .neq("status", "dnc") \
          .execute()

        reset_count = len(result.data) if result.data else 0

        return {
            "status": "ok",
            "campaign_id": body.campaign_id,
            "campaign_name": campaign.data["name"],
            "reset_count": reset_count,
        }
    except Exception as e:
        print(f"[reset_campaign] Error: {e}")
        raise HTTPException(500, f"Reset mislukt: {e}")


@router.post("/import")
async def import_contacts(
    campaign_id: str = Form(...),
    file: UploadFile = File(...),
    agent: AgentContext = Depends(require_role("admin", "supervisor")),
    db=Depends(get_supabase),
):
    """
    Accepts a CSV or Excel file and imports contacts into a campaign.
    Returns a summary: imported, skipped_dnc, skipped_duplicate, errors.
    """
    if not file.filename.endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(400, "File must be .csv, .xlsx, or .xls")

    content = await file.read()
    print(f"[import] File: {file.filename}, size: {len(content)} bytes")

    if file.filename.endswith(".csv"):
        rows = _parse_csv(content)
    else:
        rows = _parse_excel(content)

    if not rows:
        raise HTTPException(400, "File is empty or could not be parsed")

    print(f"[import] Parsed {len(rows)} rows")
    col_map = _detect_columns(rows[0].keys())
    print(f"[import] Column mapping: {col_map}")

    stats = {
        "imported":           0,
        "skipped_dnc":        0,
        "skipped_duplicate":  0,
        "skipped_no_phone":   0,
        "errors":             0,
        "total_rows":         len(rows),
    }

    try:
        # Duplicate check is per-campaign: same phone can exist in different campaigns
        existing_result = db.table("contacts").select("phone") \
            .eq("org_id", agent.org_id) \
            .eq("campaign_id", campaign_id) \
            .execute()
        existing_phones = {_normalise_phone(r["phone"]) for r in (existing_result.data or [])}
    except Exception as e:
        print(f"[import] Failed to load existing phones: {e}")
        existing_phones = set()

    try:
        dnc_result = db.table("dnc_list").select("phone").eq("org_id", agent.org_id).execute()
        dnc_phones = {_normalise_phone(r["phone"]) for r in (dnc_result.data or [])}
    except Exception as e:
        print(f"[import] Failed to load DNC list: {e}")
        dnc_phones = set()

    batch = []

    for i, row in enumerate(rows):
        try:
            phone_col = col_map.get("phone", "phone")
            raw_phone = str(row.get(phone_col, "")).strip()
            if not raw_phone:
                stats["skipped_no_phone"] += 1
                continue

            phone = _normalise_phone(raw_phone)

            if phone in existing_phones:
                stats["skipped_duplicate"] += 1
                continue

            if phone in dnc_phones:
                stats["skipped_dnc"] += 1
                continue

            contact = {
                "org_id":               agent.org_id,
                "campaign_id":          campaign_id,
                "phone":                phone,
                "first_name":           _get_field(row, col_map, "first_name"),
                "last_name":            _get_field(row, col_map, "last_name"),
                "email":                _get_field(row, col_map, "email"),
                "street_original":      _get_field(row, col_map, "street"),
                "city_original":        _get_field(row, col_map, "city"),
                "postal_code_original": _get_field(row, col_map, "postal_code"),
                "lead_score":           _safe_int(row.get(col_map.get("lead_score", ""), "50"), 50),
                "status":               "available",
                "lead_source":          "import",
            }

            batch.append(contact)
            existing_phones.add(phone)

            if len(batch) >= 100:
                print(f"[import] Inserting batch of {len(batch)}")
                db.table("contacts").insert(batch).execute()
                stats["imported"] += len(batch)
                batch = []

        except Exception as e:
            stats["errors"] += 1
            print(f"[import] Row {i} error: {e}")
            traceback.print_exc()

    if batch:
        try:
            print(f"[import] Inserting final batch of {len(batch)}")
            db.table("contacts").insert(batch).execute()
            stats["imported"] += len(batch)
        except Exception as e:
            print(f"[import] Final batch insert error: {e}")
            stats["errors"] += len(batch)

    print(f"[import] Done: {stats}")

    return {
        "status": "ok",
        "stats":  stats,
        "message": (
            f"Import complete: {stats['imported']} contacts imported, "
            f"{stats['skipped_duplicate']} duplicates skipped, "
            f"{stats['skipped_dnc']} DNC skipped."
        ),
    }


def _get_field(row, col_map, field):
    col_name = col_map.get(field, "")
    if not col_name:
        return None
    val = row.get(col_name, "")
    if val is None:
        return None
    return str(val).strip() or None


def _parse_csv(content):
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def _parse_excel(content):
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(h).strip().lower() if h else "" for h in rows[0]]
        return [
            {headers[i]: (str(v).strip() if v is not None else "") for i, v in enumerate(row)}
            for row in rows[1:]
        ]
    except ImportError:
        raise HTTPException(500, "openpyxl not installed — CSV import still works")


def _detect_columns(headers):
    headers_lower = {h.lower().strip(): h for h in headers}
    result = {}
    for canonical, variants in COLUMN_MAP.items():
        for variant in variants:
            if variant.lower() in headers_lower:
                result[canonical] = headers_lower[variant.lower()]
                break
    return result


def _safe_int(value, default):
    try:
        v = int(float(str(value).strip()))
        return max(0, min(100, v))
    except (ValueError, TypeError):
        return default
