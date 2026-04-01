"""
backend/auth/user_management.py
─────────────────────────────────
User management endpoints for admins.
Invite agents to the org, change roles, deactivate users.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional

from auth.role_guard import require_role
from auth.jwt_validator import AgentContext
from db import get_supabase

router = APIRouter()


class InviteRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "agent"


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None


@router.get("/users")
async def list_users(
    agent: AgentContext = Depends(require_role("admin", "supervisor")),
    db=Depends(get_supabase),
):
    """List all users in this org. Admin/supervisor only."""
    try:
        result = db.table("user_profiles") \
            .select("id, org_id, role, full_name, is_active, created_at") \
            .eq("org_id", agent.org_id) \
            .order("created_at", desc=False) \
            .execute()
        return {"users": result.data or []}
    except Exception as e:
        print(f"[users] List error: {e}")
        raise HTTPException(500, "Failed to load users")


@router.post("/users/invite")
async def invite_user(
    body: InviteRequest,
    agent: AgentContext = Depends(require_role("admin")),
    db=Depends(get_supabase),
):
    """
    Invite a new user to the admin's org.
    Creates a Supabase auth account + user_profile in the same org.
    Admin only.
    """
    # Validate role
    valid_roles = ["agent", "supervisor", "admin"]
    if body.role not in valid_roles:
        raise HTTPException(400, f"Ongeldige rol. Kies uit: {', '.join(valid_roles)}")

    # We can't check email in user_profiles (no email column);
    # Supabase auth will reject duplicate emails at creation time.

    # Create auth user in Supabase
    try:
        auth_response = db.auth.sign_up({
            "email": body.email,
            "password": body.password,
        })
        user = auth_response.user
        if not user:
            raise HTTPException(400, "Account aanmaken mislukt")
    except Exception as e:
        error_msg = str(e)
        if "already registered" in error_msg.lower() or "duplicate" in error_msg.lower():
            raise HTTPException(400, "Dit e-mailadres is al geregistreerd")
        raise HTTPException(400, f"Account aanmaken mislukt: {error_msg}")

    # Create user profile in the SAME org as the admin
    try:
        db.table("user_profiles").insert({
            "id": user.id,
            "org_id": agent.org_id,
            "role": body.role,
            "full_name": body.full_name,
            "is_active": True,
        }).execute()
    except Exception as e:
        print(f"[users] Profile creation error: {e}")
        raise HTTPException(500, "Account aangemaakt maar profiel mislukt. Neem contact op met support.")

    return {
        "status": "ok",
        "message": f"{body.full_name} is uitgenodigd als {body.role}.",
        "user": {
            "id": user.id,
            "email": body.email,
            "full_name": body.full_name,
            "role": body.role,
        },
    }


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    agent: AgentContext = Depends(require_role("admin")),
    db=Depends(get_supabase),
):
    """Update a user's role or active status. Admin only."""
    # Verify user belongs to this org
    try:
        existing = db.table("user_profiles") \
            .select("id, role") \
            .eq("id", user_id) \
            .eq("org_id", agent.org_id) \
            .execute()

        if not existing.data:
            raise HTTPException(404, "Gebruiker niet gevonden")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Fout bij ophalen gebruiker: {e}")

    # Prevent admin from deactivating themselves
    if user_id == agent.id and body.is_active is False:
        raise HTTPException(400, "Je kunt jezelf niet deactiveren")

    # Prevent admin from removing their own admin role
    if user_id == agent.id and body.role and body.role != "admin":
        raise HTTPException(400, "Je kunt je eigen admin-rol niet verwijderen")

    # Validate role if provided
    if body.role:
        valid_roles = ["agent", "supervisor", "admin"]
        if body.role not in valid_roles:
            raise HTTPException(400, f"Ongeldige rol. Kies uit: {', '.join(valid_roles)}")

    # Build update
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "Geen wijzigingen opgegeven")

    try:
        result = db.table("user_profiles") \
            .update(updates) \
            .eq("id", user_id) \
            .eq("org_id", agent.org_id) \
            .execute()

        return {"status": "ok", "user": result.data[0] if result.data else None}
    except Exception as e:
        print(f"[users] Update error: {e}")
        raise HTTPException(500, "Bijwerken mislukt")
