"""
backend/db.py
─────────────
Single Supabase client shared across all modules.
Reads credentials from environment variables — never hardcode these.

Required .env variables:
  SUPABASE_URL      = https://xxxx.supabase.co
  SUPABASE_KEY      = your-service-role-key   (server side only)
  SUPABASE_ANON_KEY = your-anon-key           (used for JWT validation)
"""

import os
from supabase import create_client, Client
from functools import lru_cache

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")   # service role — server only

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Missing SUPABASE_URL or SUPABASE_KEY environment variables.\n"
        "Copy .env.example to .env and fill in your Supabase credentials."
    )


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """
    Returns a cached Supabase client.
    FastAPI dependency injection: use Depends(get_supabase) in routes.

    The service role key bypasses RLS — we enforce permissions
    manually in each endpoint via role_guard.py.
    This gives us full control over what each role can do.
    """
    return create_client(SUPABASE_URL, SUPABASE_KEY)
