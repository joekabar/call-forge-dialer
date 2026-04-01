"""
backend/dialer/rate_limiter.py
────────────────────────────────
Enforces the minimum wait between contacts per agent.
Set to 0 to disable rate limiting entirely.
"""

from datetime import datetime, timezone
from fastapi import HTTPException


async def get_effective_interval(campaign_id, org_interval, db):
    try:
        r = db.table("campaigns").select("contact_interval_sec").eq("id", campaign_id).execute()
        if r and r.data and len(r.data) > 0:
            val = r.data[0].get("contact_interval_sec")
            if val is not None:
                print(f"[rate_limit] Campaign interval: {val}s")
                return val
    except Exception as e:
        print(f"[rate_limit] Error reading campaign: {e}")
    fallback = org_interval if org_interval is not None else 45
    print(f"[rate_limit] Fallback interval: {fallback}s")
    return fallback


async def check_rate_limit(agent_id, campaign_id, org_interval, db):
    interval = await get_effective_interval(campaign_id, org_interval, db)
    if interval == 0:
        return {"can_proceed": True, "wait_seconds": 0, "interval": 0}
    try:
        r = db.table("contact_view_log").select("viewed_at").eq("agent_id", agent_id).eq("campaign_id", campaign_id).order("viewed_at", desc=True).limit(1).execute()
    except Exception as e:
        print(f"[rate_limit] View log error: {e}")
        return {"can_proceed": True, "wait_seconds": 0, "interval": interval}
    if not r or not r.data:
        return {"can_proceed": True, "wait_seconds": 0, "interval": interval}
    try:
        last = datetime.fromisoformat(r.data[0]["viewed_at"].replace("Z", "+00:00"))
        wait = interval - (datetime.now(timezone.utc) - last).total_seconds()
    except Exception:
        return {"can_proceed": True, "wait_seconds": 0, "interval": interval}
    if wait <= 0:
        return {"can_proceed": True, "wait_seconds": 0, "interval": interval}
    return {"can_proceed": False, "wait_seconds": round(wait, 1), "interval": interval}


async def enforce_rate_limit(agent_id, campaign_id, org_interval, db):
    result = await check_rate_limit(agent_id, campaign_id, org_interval, db)
    if not result["can_proceed"]:
        raise HTTPException(
            status_code=429,
            detail={"error": "rate_limited", "wait_seconds": result["wait_seconds"],
                    "interval_sec": result["interval"],
                    "message": f"Wait {result['wait_seconds']}s."},
            headers={"Retry-After": str(result["wait_seconds"])},
        )
