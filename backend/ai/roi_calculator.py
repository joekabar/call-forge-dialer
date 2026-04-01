"""
backend/ai/roi_calculator.py  [v2 addition]
─────────────────────────────────────────────
Generates a personalised savings calculation and a public
savings page URL the agent can text to the prospect during the call.

The savings page at /savings/{token} is:
  - Public (no login needed — prospect opens it on their phone)
  - Mobile-optimised
  - Branded with the agent's company name
  - Valid for 30 days
  - Tracked (we know when the prospect opened it)
"""

import uuid
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from dataclasses import dataclass, asdict

from auth.role_guard import require_role
from auth.jwt_validator import AgentContext
from db import get_supabase

router = APIRouter()

KWH_PRICE    = {"BE": 0.28, "NL": 0.31, "FR": 0.22, "DE": 0.30}
EFFICIENCY   = 0.80
CO2_PER_KWH  = 0.233    # kg CO2 per kWh on Belgian grid


@dataclass
class ROIResult:
    token:               str
    url:                 str
    panel_count:         int
    system_kwp:          float
    annual_kwh:          int
    annual_savings_eur:  int
    monthly_savings_eur: int
    payback_years:       float
    co2_saved_kg:        int
    trees_equivalent:    int
    install_cost_est:    int


class ROIRequest(BaseModel):
    contact_id:      str
    campaign_id:     str
    panel_count:     int
    system_kwp:      float
    orientation:     str
    monthly_bill_eur: float
    has_ev:          bool = False
    country:         str  = "BE"


@router.post("/roi/calculate")
async def calculate_roi(
    body:  ROIRequest,
    agent: AgentContext = Depends(require_role("agent","supervisor","admin")),
    db=Depends(get_supabase),
):
    """
    Called when agent clicks 'Generate savings page' in the ROI widget.
    Returns a unique public URL the agent can text to the prospect.
    """
    orientation_factor = {
        "South": 1.00, "South-West": 0.97, "South-East": 0.95,
        "West":  0.85, "East":       0.85, "North":      0.65,
    }.get(body.orientation, 0.90)

    sun_hours    = {"BE": 1000, "NL": 950, "FR": 1200, "DE": 1050}.get(body.country, 1000)
    annual_kwh   = int(body.system_kwp * sun_hours * EFFICIENCY * orientation_factor)
    self_cons    = 0.80 if body.has_ev else 0.65
    price        = KWH_PRICE.get(body.country, 0.28)
    annual_sav   = int(annual_kwh * self_cons * price)
    monthly_sav  = annual_sav // 12
    install_cost = int(body.system_kwp * 1400)
    payback      = round(install_cost / max(annual_sav, 1), 1)
    co2          = int(annual_kwh * CO2_PER_KWH)
    trees        = co2 // 21
    token        = uuid.uuid4().hex[:10]
    url          = f"https://app.solarflowpro.com/savings/{token}"

    roi = ROIResult(
        token=token, url=url,
        panel_count=body.panel_count, system_kwp=body.system_kwp,
        annual_kwh=annual_kwh, annual_savings_eur=annual_sav,
        monthly_savings_eur=monthly_sav, payback_years=payback,
        co2_saved_kg=co2, trees_equivalent=trees,
        install_cost_est=install_cost,
    )

    # Load contact for display on the savings page
    contact = db.table("contacts")\
        .select("first_name, street_verified, city_verified, org_id")\
        .eq("id", body.contact_id)\
        .single()\
        .execute()

    c = contact.data or {}
    address_display = ", ".join(filter(None, [
        c.get("street_verified"), c.get("city_verified")
    ])) or "your property"

    # Persist the savings page
    db.table("savings_pages").insert({
        "token":           token,
        "contact_id":      body.contact_id,
        "org_id":          agent.org_id,
        "agent_id":        agent.id,
        "campaign_id":     body.campaign_id,
        "roi_data":        asdict(roi),
        "prospect_name":   c.get("first_name", ""),
        "address_display": address_display,
        "expires_at":      "now() + interval '30 days'",
        "view_count":      0,
    }).execute()

    return {"status": "ok", "token": token, "url": url, "roi": asdict(roi)}


@router.get("/roi/savings/{token}")
async def get_savings_page(token: str, db=Depends(get_supabase)):
    """
    Public endpoint — no auth required.
    Called when the prospect opens the link on their phone.
    Increments view_count and marks as viewed.
    """
    page = db.table("savings_pages")\
        .select("*")\
        .eq("token", token)\
        .gte("expires_at", "now()")\
        .maybe_single()\
        .execute()

    if not page.data:
        return {"error": "This savings page has expired or does not exist."}

    # Track that prospect opened the page
    db.table("savings_pages").update({
        "viewed":     True,
        "last_viewed_at": "now()",
        "view_count": page.data["view_count"] + 1,
    }).eq("token", token).execute()

    return {
        "status":         "ok",
        "prospect_name":  page.data["prospect_name"],
        "address":        page.data["address_display"],
        "roi":            page.data["roi_data"],
    }
