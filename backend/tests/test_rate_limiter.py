"""
backend/tests/test_rate_limiter.py
────────────────────────────────────
Basic tests for the rate limiter.
Run with: cd backend && pytest tests/ -v
"""

import pytest
from unittest.mock import MagicMock
from datetime import datetime, timezone, timedelta


# ── Helpers ──────────────────────────────────────────────────

def make_db_mock(last_viewed_at=None, campaign_interval=None):
    """Build a mock Supabase client for testing."""
    db = MagicMock()

    # Mock campaign query
    campaign_data = {"contact_interval_sec": campaign_interval} if campaign_interval else None
    db.table.return_value.select.return_value.eq.return_value \
        .maybe_single.return_value.execute.return_value.data = campaign_data

    # Mock contact_view_log query
    if last_viewed_at:
        log_data = [{"viewed_at": last_viewed_at.isoformat()}]
    else:
        log_data = []

    # Second call to db.table is the view log
    db.table.return_value.select.return_value.eq.return_value \
        .order.return_value.limit.return_value.execute.return_value.data = log_data

    return db


# ── Tests ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_first_call_always_proceeds():
    """Agent with no previous calls should always be allowed through."""
    from dialer.rate_limiter import check_rate_limit

    db = MagicMock()
    # No previous view log
    db.table.return_value.select.return_value \
        .eq.return_value.maybe_single.return_value \
        .execute.return_value.data = None
    db.table.return_value.select.return_value \
        .eq.return_value.order.return_value \
        .limit.return_value.execute.return_value.data = []

    result = await check_rate_limit("agent-1", "campaign-1", 45, db)
    assert result["can_proceed"] is True
    assert result["wait_seconds"] == 0


@pytest.mark.asyncio
async def test_blocked_within_interval():
    """Agent who just got a contact 10s ago should be blocked (45s interval)."""
    from dialer.rate_limiter import check_rate_limit

    db = MagicMock()
    db.table.return_value.select.return_value \
        .eq.return_value.maybe_single.return_value \
        .execute.return_value.data = None  # no campaign override

    recent = datetime.now(timezone.utc) - timedelta(seconds=10)
    db.table.return_value.select.return_value \
        .eq.return_value.order.return_value \
        .limit.return_value.execute.return_value.data = [
            {"viewed_at": recent.isoformat()}
        ]

    result = await check_rate_limit("agent-1", "campaign-1", 45, db)
    assert result["can_proceed"] is False
    assert result["wait_seconds"] > 30   # ~35s remaining


@pytest.mark.asyncio
async def test_allowed_after_interval():
    """Agent who last got a contact 50s ago should be allowed (45s interval)."""
    from dialer.rate_limiter import check_rate_limit

    db = MagicMock()
    db.table.return_value.select.return_value \
        .eq.return_value.maybe_single.return_value \
        .execute.return_value.data = None

    old = datetime.now(timezone.utc) - timedelta(seconds=50)
    db.table.return_value.select.return_value \
        .eq.return_value.order.return_value \
        .limit.return_value.execute.return_value.data = [
            {"viewed_at": old.isoformat()}
        ]

    result = await check_rate_limit("agent-1", "campaign-1", 45, db)
    assert result["can_proceed"] is True
    assert result["wait_seconds"] == 0


def test_phone_masking():
    """Phone masking should hide middle digits."""
    from contacts.serializer import _mask_phone

    assert _mask_phone("+32470123456") == "+32470 ** 56"
    assert _mask_phone("0470123456")   == "047012 ** 56"


def test_phone_normalisation():
    """Belgian phone numbers should normalise to E.164 digits."""
    from compliance.dnc import _normalise_phone

    assert _normalise_phone("+32 470 12 34 56") == "32470123456"
    assert _normalise_phone("0470/12.34.56")     == "32470123456"
    assert _normalise_phone("32470123456")        == "32470123456"
