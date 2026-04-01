"""
backend/dialer/lock_cleanup.py
────────────────────────────────
Background job that releases expired contact locks.

Runs every 5 minutes via APScheduler (configured in main.py).

Why this is needed:
  - Agent's browser crashes mid-call
  - Network drops while form is open
  - Agent closes laptop without logging the outcome
  - Power failure

Without this, locked contacts would be stuck for up to 10 minutes
then auto-release via the lock_expires_at check in get_next_contact.
This job catches them at the exact expiry time instead of waiting.
"""

import logging
from db import get_supabase

logger = logging.getLogger(__name__)


async def release_expired_locks():
    """
    Returns all contacts whose lock has expired back to 'available'.
    Safe to run concurrently — the WHERE clause is atomic.
    """
    db = get_supabase()

    result = db.table("contacts").update({
        "locked_by":       None,
        "locked_at":       None,
        "lock_expires_at": None,
        "status":          "available",
    })\
    .eq("status", "locked")\
    .lt("lock_expires_at", "now()")\
    .execute()

    released = len(result.data) if result.data else 0

    if released > 0:
        logger.info(f"[lock_cleanup] Released {released} expired contact locks")

    return released
