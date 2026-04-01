"""
backend/campaigns/campaigns_api.py
────────────────────────────────────
CRUD endpoints for campaign management.
Admin/supervisor can create, update, pause campaigns.
Agents can list active campaigns for their org.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from auth.role_guard import require_role
from auth.jwt_validator import AgentContext
from db import get_supabase

router = APIRouter()


class CampaignCreate(BaseModel):
    name: str
    country: str = "BE"
    contact_interval_sec: Optional[int] = None
    calling_hours_start: str = "09:00"
    calling_hours_end: str = "20:00"


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    contact_interval_sec: Optional[int] = None
    calling_hours_start: Optional[str] = None
    calling_hours_end: Optional[str] = None


@router.get("")
async def list_campaigns(
    agent: AgentContext = Depends(require_role("agent", "supervisor", "admin")),
    db=Depends(get_supabase),
):
    """List all campaigns for this org. All roles can read."""
    result = db.table("campaigns") \
        .select("*") \
        .eq("org_id", agent.org_id) \
        .order("created_at", desc=True) \
        .execute()
    return {"campaigns": result.data or []}


@router.get("/active")
async def list_active_campaigns(
    agent: AgentContext = Depends(require_role("agent", "supervisor", "admin")),
    db=Depends(get_supabase),
):
    """List only active campaigns — used by agent workspace to auto-load."""
    result = db.table("campaigns") \
        .select("*") \
        .eq("org_id", agent.org_id) \
        .eq("status", "active") \
        .order("created_at", desc=True) \
        .execute()
    return {"campaigns": result.data or []}


@router.post("")
async def create_campaign(
    body: CampaignCreate,
    agent: AgentContext = Depends(require_role("admin", "supervisor")),
    db=Depends(get_supabase),
):
    """Create a new campaign. Admin/supervisor only."""
    data = {
        "org_id": agent.org_id,
        "name": body.name,
        "country": body.country,
        "status": "active",
        "calling_hours_start": body.calling_hours_start,
        "calling_hours_end": body.calling_hours_end,
    }
    if body.contact_interval_sec is not None:
        data["contact_interval_sec"] = body.contact_interval_sec

    result = db.table("campaigns").insert(data).execute()

    if not result.data:
        raise HTTPException(500, "Failed to create campaign")

    return {"status": "ok", "campaign": result.data[0]}


@router.put("/{campaign_id}")
async def update_campaign(
    campaign_id: str,
    body: CampaignUpdate,
    agent: AgentContext = Depends(require_role("admin", "supervisor")),
    db=Depends(get_supabase),
):
    """Update a campaign. Admin/supervisor only."""
    existing = db.table("campaigns") \
        .select("id") \
        .eq("id", campaign_id) \
        .eq("org_id", agent.org_id) \
        .maybe_single() \
        .execute()

    if not existing.data:
        raise HTTPException(404, "Campaign not found")

    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    result = db.table("campaigns") \
        .update(updates) \
        .eq("id", campaign_id) \
        .execute()

    return {"status": "ok", "campaign": result.data[0] if result.data else None}


@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    agent: AgentContext = Depends(require_role("admin")),
    db=Depends(get_supabase),
):
    """
    Delete a campaign. Admin only.
    Nulls out campaign_id on contacts, call_logs and appointments
    before deleting to satisfy foreign key constraints.
    """
    existing = db.table("campaigns") \
        .select("id") \
        .eq("id", campaign_id) \
        .eq("org_id", agent.org_id) \
        .maybe_single() \
        .execute()

    if not existing.data:
        raise HTTPException(404, "Campaign not found")

    # Null out FK references before deleting
    db.table("contacts") \
        .update({"campaign_id": None}) \
        .eq("campaign_id", campaign_id) \
        .execute()

    db.table("call_logs") \
        .update({"campaign_id": None}) \
        .eq("campaign_id", campaign_id) \
        .execute()

    db.table("appointments") \
        .update({"campaign_id": None}) \
        .eq("campaign_id", campaign_id) \
        .execute()

    db.table("campaigns") \
        .delete() \
        .eq("id", campaign_id) \
        .execute()

    return {"status": "ok", "deleted": campaign_id}