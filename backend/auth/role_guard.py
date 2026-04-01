"""
backend/auth/role_guard.py
───────────────────────────
Decorator factory for role-based access control.
Combines JWT validation + trial check + role check in one dependency.

Usage in any route:
    @router.post("/some-endpoint")
    async def my_route(agent=Depends(require_role("admin","supervisor"))):
        ...

    # Agent-only route:
    @router.post("/next-contact")
    async def next_contact(agent=Depends(require_role("agent","supervisor","admin"))):
        ...
"""

from fastapi import HTTPException, Depends
from datetime import datetime, timezone
from .jwt_validator import get_current_agent, AgentContext


def require_role(*allowed_roles: str):
    """
    Returns a FastAPI dependency that:
    1. Validates the JWT (via get_current_agent)
    2. Checks the trial / subscription is still active
    3. Checks the user's role is in allowed_roles

    Raises:
        HTTP 401 — no/invalid token
        HTTP 402 — trial expired (payment required)
        HTTP 403 — wrong role
        HTTP 403 — account inactive
    """
    async def dependency(
        agent: AgentContext = Depends(get_current_agent)
    ) -> AgentContext:

        # 1. Account must be active
        if not agent.org_is_active:
            raise HTTPException(403, "Account is inactive")

        # 2. Trial expiry check
        if agent.org_plan == "trial" and agent.trial_ends_at:
            trial_end = datetime.fromisoformat(
                agent.trial_ends_at.replace("Z", "+00:00")
            )
            now = datetime.now(timezone.utc)

            if now > trial_end:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "error":       "trial_expired",
                        "message":     "Your 7-day free trial has ended.",
                        "upgrade_url": "https://app.solarflowpro.com/billing",
                    }
                )

            # Inject days remaining so frontend can show countdown banner
            agent.trial_days_remaining = max(0, (trial_end - now).days)

        # 3. Role check
        if agent.role not in allowed_roles:
            raise HTTPException(
                403,
                f"Access denied. Required role: {' or '.join(allowed_roles)}"
            )

        return agent

    return dependency
