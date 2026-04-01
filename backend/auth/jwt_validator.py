"""
backend/auth/jwt_validator.py
──────────────────────────────
Validates every incoming request's JWT token issued by Supabase Auth.
Extracts user identity and loads their profile (role, org_id).

Every protected route uses:
    agent = Depends(get_current_agent)
"""

import os
from dataclasses import dataclass
from fastapi import HTTPException, Header
from supabase import create_client

SUPABASE_URL      = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")


@dataclass
class AgentContext:
    """
    Everything we know about the authenticated user.
    Passed into every route handler via dependency injection.
    """
    id:                    str
    email:                 str
    org_id:                str
    role:                  str    # admin | supervisor | agent | client
    full_name:             str
    org_plan:              str    # trial | starter | pro | enterprise
    org_is_active:         bool
    trial_ends_at:         str | None
    org_interval_sec:      int    # default rate limit for this org
    trial_days_remaining:  int | None = None


async def get_current_agent(
    authorization: str = Header(..., description="Bearer <jwt>")
) -> AgentContext:
    """
    FastAPI dependency. Validates the JWT and returns AgentContext.
    Raises HTTP 401 if token is missing or invalid.
    Raises HTTP 403 if user profile not found.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authorization header must be 'Bearer <token>'")

    token = authorization.split(" ", 1)[1]

    # Use anon key client to validate the user's JWT
    # This does NOT bypass RLS — it validates the token only
    anon_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

    try:
        user_response = anon_client.auth.get_user(token)
        user = user_response.user
        if not user:
            raise HTTPException(401, "Invalid or expired token")
    except Exception:
        raise HTTPException(401, "Invalid or expired token")

    # Load profile + org in one joined query using service role client
    from db import get_supabase
    db = get_supabase()

    profile = db.table("user_profiles")\
        .select("*, organizations(*)")\
        .eq("id", user.id)\
        .single()\
        .execute()

    if not profile.data:
        raise HTTPException(403, "User profile not found")

    p   = profile.data
    org = p["organizations"]

    return AgentContext(
        id=p["id"],
        email=user.email,
        org_id=p["org_id"],
        role=p["role"],
        full_name=p.get("full_name", ""),
        org_plan=org["plan"],
        org_is_active=org["is_active"],
        trial_ends_at=org.get("trial_ends_at"),
        org_interval_sec=org.get("contact_interval_sec", 45),
    )
