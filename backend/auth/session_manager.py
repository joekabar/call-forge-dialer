"""
backend/auth/session_manager.py
─────────────────────────────────
Login, logout, and token refresh. Returns branding on login.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from db import get_supabase

router = APIRouter()


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login")
async def login(body: LoginRequest, db=Depends(get_supabase)):
    try:
        response = db.auth.sign_in_with_password({
            "email":    body.email,
            "password": body.password,
        })
    except Exception:
        raise HTTPException(401, "Ongeldig e-mailadres of wachtwoord")

    user    = response.user
    session = response.session

    try:
        profile = db.table("user_profiles") \
            .select("role, full_name, org_id, is_platform_admin, organizations(name, display_name, plan, trial_ends_at, contact_interval_sec, logo_url, primary_color)") \
            .eq("id", user.id) \
            .single() \
            .execute()
    except Exception as e:
        print(f"[login] Profile load error: {e}")
        raise HTTPException(403, "Account niet volledig ingesteld — neem contact op met support")

    if not profile.data:
        raise HTTPException(403, "Account niet volledig ingesteld — neem contact op met support")

    p   = profile.data
    org = p["organizations"]

    return {
        "access_token":  session.access_token,
        "refresh_token": session.refresh_token,
        "user": {
            "id":                   user.id,
            "email":                user.email,
            "full_name":            p["full_name"],
            "role":                 p["role"],
            "org_id":               p["org_id"],
            "org_name":             org["name"],
            "plan":                 org["plan"],
            "trial_ends_at":        org.get("trial_ends_at"),
            "contact_interval_sec": org.get("contact_interval_sec", 45),
            "is_platform_admin":    p.get("is_platform_admin", False),
            "branding": {
                "display_name":  org.get("display_name") or org["name"],
                "logo_url":      org.get("logo_url"),
                "primary_color": org.get("primary_color", "#1d6fb8"),
            },
        }
    }


@router.post("/refresh")
async def refresh_token(body: RefreshRequest, db=Depends(get_supabase)):
    try:
        response = db.auth.refresh_session(body.refresh_token)
        return {
            "access_token":  response.session.access_token,
            "refresh_token": response.session.refresh_token,
        }
    except Exception:
        raise HTTPException(401, "Vernieuw-token ongeldig of verlopen — log opnieuw in")


@router.post("/logout")
async def logout(db=Depends(get_supabase)):
    try:
        db.auth.sign_out()
    except Exception:
        pass
    return {"message": "Uitgelogd"}
