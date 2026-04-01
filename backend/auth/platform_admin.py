"""
backend/auth/platform_admin.py
────────────────────────────────
Super admin endpoints — manages all orgs, users, trials, branding.
"""

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta

from auth.jwt_validator import get_current_agent, AgentContext
from db import get_supabase

router = APIRouter()


async def require_platform_admin(
    authorization: str = Header(..., description="Bearer <jwt>"),
) -> AgentContext:
    agent = await get_current_agent(authorization)
    db = get_supabase()
    try:
        result = db.table("user_profiles").select("is_platform_admin").eq("id", agent.id).execute()
        if not result.data or not result.data[0].get("is_platform_admin"):
            raise HTTPException(403, "Geen platform admin rechten")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(403, "Geen platform admin rechten")
    return agent


# ── Organizations ────────────────────────────────────────────

class CreateOrgRequest(BaseModel):
    name: str
    country: str = "BE"
    plan: str = "trial"
    display_name: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = "#1d6fb8"
    seat_limit: int = 3
    trial_days: int = 7


@router.get("/platform/organizations")
async def list_organizations(
    admin: AgentContext = Depends(require_platform_admin),
    db=Depends(get_supabase),
):
    try:
        orgs = db.table("organizations").select("*").order("created_at", desc=True).execute()
        result = []
        for org in (orgs.data or []):
            try:
                users = db.table("user_profiles").select("id").eq("org_id", org["id"]).execute()
                user_count = len(users.data) if users.data else 0
            except Exception:
                user_count = 0
            try:
                contacts = db.table("contacts").select("id").eq("org_id", org["id"]).execute()
                contact_count = len(contacts.data) if contacts.data else 0
            except Exception:
                contact_count = 0
            try:
                campaigns = db.table("campaigns").select("id").eq("org_id", org["id"]).execute()
                campaign_count = len(campaigns.data) if campaigns.data else 0
            except Exception:
                campaign_count = 0
            result.append({
                **org,
                "user_count": user_count,
                "contact_count": contact_count,
                "campaign_count": campaign_count,
            })
        return {"organizations": result}
    except Exception as e:
        print(f"[platform_admin] List orgs error: {e}")
        raise HTTPException(500, "Fout bij ophalen organisaties")


@router.post("/platform/organizations")
async def create_organization(
    body: CreateOrgRequest,
    admin: AgentContext = Depends(require_platform_admin),
    db=Depends(get_supabase),
):
    """Create a new organization with branding."""
    try:
        trial_end = (datetime.now(timezone.utc) + timedelta(days=body.trial_days)).isoformat()
        org = db.table("organizations").insert({
            "name": body.name,
            "display_name": body.display_name or body.name,
            "country": body.country,
            "plan": body.plan,
            "trial_ends_at": trial_end if body.plan == "trial" else None,
            "seat_limit": body.seat_limit,
            "logo_url": body.logo_url,
            "primary_color": body.primary_color or "#1d6fb8",
            "is_active": True,
        }).execute()

        if not org.data:
            raise HTTPException(500, "Organisatie aanmaken mislukt")

        return {"status": "ok", "organization": org.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[platform_admin] Create org error: {e}")
        raise HTTPException(500, f"Fout: {e}")


@router.put("/platform/organizations/{org_id}")
async def update_organization(
    org_id: str,
    body: dict,
    admin: AgentContext = Depends(require_platform_admin),
    db=Depends(get_supabase),
):
    allowed_fields = {"plan", "is_active", "trial_ends_at", "seat_limit",
                      "contact_interval_sec", "name", "display_name",
                      "logo_url", "primary_color"}
    updates = {k: v for k, v in body.items() if k in allowed_fields}
    if not updates:
        raise HTTPException(400, "Geen geldige velden")
    try:
        result = db.table("organizations").update(updates).eq("id", org_id).execute()
        return {"status": "ok", "organization": result.data[0] if result.data else None}
    except Exception as e:
        print(f"[platform_admin] Update org error: {e}")
        raise HTTPException(500, "Bijwerken mislukt")


@router.delete("/platform/organizations/{org_id}")
async def delete_organization(
    org_id: str,
    force: bool = Query(default=False, description="Force delete all related data"),
    admin: AgentContext = Depends(require_platform_admin),
    db=Depends(get_supabase),
):
    """
    Delete an org. Platform admin only.
    Use ?force=true to cascade-delete all users, contacts, campaigns, logs.
    Without force, blocks if users still exist.
    """
    try:
        # Check org exists
        org = db.table("organizations").select("id, name").eq("id", org_id).execute()
        if not org.data:
            raise HTTPException(404, "Organisatie niet gevonden")

        users = db.table("user_profiles").select("id").eq("org_id", org_id).execute()
        user_count = len(users.data) if users.data else 0

        if user_count > 0 and not force:
            raise HTTPException(
                400,
                f"Kan niet verwijderen — {user_count} gebruikers zijn nog gekoppeld. "
                f"Gebruik 'Geforceerd verwijderen' om alles te wissen."
            )

        if force:
            # Cascade delete in correct FK order
            print(f"[platform_admin] Force deleting org {org_id} with all data")

            # 1. Null out locks on contacts (agents may hold locks)
            try:
                db.table("contacts").update({
                    "locked_by": None, "locked_at": None, "lock_expires_at": None
                }).eq("org_id", org_id).execute()
            except Exception as e:
                print(f"[platform_admin] Lock release error: {e}")

            # 2. Delete call logs
            try:
                db.table("call_logs").delete().eq("org_id", org_id).execute()
            except Exception as e:
                print(f"[platform_admin] Call logs delete error: {e}")

            # 3. Delete contact view log
            try:
                db.table("contact_view_log").delete().eq("org_id", org_id).execute()
            except Exception as e:
                print(f"[platform_admin] View log delete error: {e}")

            # 4. Delete appointments
            try:
                db.table("appointments").delete().eq("org_id", org_id).execute()
            except Exception as e:
                print(f"[platform_admin] Appointments delete error: {e}")

            # 5. Delete savings pages
            try:
                db.table("savings_pages").delete().eq("org_id", org_id).execute()
            except Exception as e:
                print(f"[platform_admin] Savings pages delete error: {e}")

            # 6. Delete DNC list
            try:
                db.table("dnc_list").delete().eq("org_id", org_id).execute()
            except Exception as e:
                print(f"[platform_admin] DNC delete error: {e}")

            # 7. Delete contacts
            try:
                db.table("contacts").delete().eq("org_id", org_id).execute()
            except Exception as e:
                print(f"[platform_admin] Contacts delete error: {e}")

            # 8. Delete campaigns
            try:
                db.table("campaigns").delete().eq("org_id", org_id).execute()
            except Exception as e:
                print(f"[platform_admin] Campaigns delete error: {e}")

            # 9. Delete scripts
            try:
                db.table("scripts").delete().eq("org_id", org_id).execute()
            except Exception as e:
                print(f"[platform_admin] Scripts delete error: {e}")

            # 10. Delete user profiles (auth users remain in Supabase auth — manual cleanup)
            try:
                db.table("user_profiles").delete().eq("org_id", org_id).execute()
            except Exception as e:
                print(f"[platform_admin] User profiles delete error: {e}")

        # Finally delete the org
        db.table("organizations").delete().eq("id", org_id).execute()
        return {"status": "ok", "deleted": org_id, "forced": force}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[platform_admin] Delete org error: {e}")
        raise HTTPException(500, f"Verwijderen mislukt: {e}")


# ── Users ────────────────────────────────────────────────────

class PlatformInviteRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "admin"
    org_id: str


@router.get("/platform/users")
async def list_all_users(
    admin: AgentContext = Depends(require_platform_admin),
    db=Depends(get_supabase),
):
    try:
        users = db.table("user_profiles") \
            .select("*, organizations(name, plan, display_name, logo_url, primary_color)") \
            .order("created_at", desc=True).execute()
        return {"users": users.data or []}
    except Exception:
        raise HTTPException(500, "Fout bij ophalen gebruikers")


@router.post("/platform/users/invite")
async def platform_invite_user(
    body: PlatformInviteRequest,
    admin: AgentContext = Depends(require_platform_admin),
    db=Depends(get_supabase),
):
    """Invite a user to ANY org. Platform admin only."""
    try:
        org = db.table("organizations").select("id, name").eq("id", body.org_id).execute()
        if not org.data:
            raise HTTPException(404, "Organisatie niet gevonden")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Fout bij controleren organisatie")

    try:
        auth_response = db.auth.sign_up({"email": body.email, "password": body.password})
        user = auth_response.user
        if not user:
            raise HTTPException(400, "Account aanmaken mislukt")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Account aanmaken mislukt: {e}")

    try:
        db.table("user_profiles").insert({
            "id": user.id,
            "org_id": body.org_id,
            "role": body.role,
            "full_name": body.full_name,
            "is_active": True,
        }).execute()
    except Exception as e:
        raise HTTPException(500, f"Profiel aanmaken mislukt: {e}")

    return {
        "status": "ok",
        "message": f"{body.full_name} uitgenodigd bij {org.data[0]['name']}",
        "user": {"id": user.id, "email": body.email, "full_name": body.full_name, "role": body.role},
    }


@router.put("/platform/users/{user_id}")
async def update_any_user(
    user_id: str, body: dict,
    admin: AgentContext = Depends(require_platform_admin),
    db=Depends(get_supabase),
):
    allowed_fields = {"role", "is_active", "is_platform_admin", "full_name", "org_id"}
    updates = {k: v for k, v in body.items() if k in allowed_fields}
    if not updates:
        raise HTTPException(400, "Geen geldige velden")
    try:
        result = db.table("user_profiles").update(updates).eq("id", user_id).execute()
        return {"status": "ok", "user": result.data[0] if result.data else None}
    except Exception:
        raise HTTPException(500, "Bijwerken mislukt")


# ── Trial management ─────────────────────────────────────────

class ExtendTrialRequest(BaseModel):
    days: int = 7

@router.post("/platform/organizations/{org_id}/extend-trial")
async def extend_trial(
    org_id: str, body: ExtendTrialRequest,
    admin: AgentContext = Depends(require_platform_admin),
    db=Depends(get_supabase),
):
    try:
        org = db.table("organizations").select("trial_ends_at, plan").eq("id", org_id).execute()
        if not org.data:
            raise HTTPException(404, "Organisatie niet gevonden")
        current_end = org.data[0].get("trial_ends_at")
        if current_end:
            try:
                end_dt = datetime.fromisoformat(current_end.replace("Z", "+00:00"))
            except Exception:
                end_dt = datetime.now(timezone.utc)
        else:
            end_dt = datetime.now(timezone.utc)
        if end_dt < datetime.now(timezone.utc):
            end_dt = datetime.now(timezone.utc)
        new_end = end_dt + timedelta(days=body.days)
        db.table("organizations").update({
            "trial_ends_at": new_end.isoformat(), "plan": "trial", "is_active": True,
        }).eq("id", org_id).execute()
        return {"status": "ok", "new_trial_ends_at": new_end.isoformat(), "days_added": body.days}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Trial verlengen mislukt")


# ── Platform stats ───────────────────────────────────────────

@router.get("/platform/stats")
async def platform_stats(
    admin: AgentContext = Depends(require_platform_admin),
    db=Depends(get_supabase),
):
    try:
        orgs = db.table("organizations").select("id, plan, is_active").execute()
        users = db.table("user_profiles").select("id, role, is_active").execute()
        contacts = db.table("contacts").select("id, status").execute()
        calls = db.table("call_logs").select("id, outcome").execute()
        org_data = orgs.data or []
        user_data = users.data or []
        contact_data = contacts.data or []
        call_data = calls.data or []
        return {
            "organizations": {
                "total": len(org_data),
                "active": sum(1 for o in org_data if o.get("is_active")),
                "trial": sum(1 for o in org_data if o.get("plan") == "trial"),
                "paid": sum(1 for o in org_data if o.get("plan") in ("starter", "pro", "enterprise")),
            },
            "users": {
                "total": len(user_data),
                "active": sum(1 for u in user_data if u.get("is_active")),
                "agents": sum(1 for u in user_data if u.get("role") == "agent"),
                "admins": sum(1 for u in user_data if u.get("role") == "admin"),
            },
            "contacts": {
                "total": len(contact_data),
                "available": sum(1 for c in contact_data if c.get("status") == "available"),
                "called": sum(1 for c in contact_data if c.get("status") == "called"),
                "callbacks": sum(1 for c in contact_data if c.get("status") == "callback"),
            },
            "calls": {
                "total": len(call_data),
                "interested": sum(1 for c in call_data if c.get("outcome") == "interested"),
                "not_interested": sum(1 for c in call_data if c.get("outcome") == "not_interested"),
                "conversion_rate": round(sum(1 for c in call_data if c.get("outcome") == "interested") / max(len(call_data), 1) * 100, 1),
            },
        }
    except Exception as e:
        print(f"[platform_admin] Stats error: {e}")
        raise HTTPException(500, "Stats ophalen mislukt")
