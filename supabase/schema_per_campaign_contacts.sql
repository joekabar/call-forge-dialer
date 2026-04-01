-- ============================================================
-- SolarFlow Pro — Per-Campaign Contact Uniqueness Fix
-- Run this in your Supabase SQL Editor (Settings → SQL Editor)
-- ============================================================
--
-- Problem: contacts were being flagged as duplicates across campaigns.
-- Fix: ensure uniqueness is scoped to (org_id, campaign_id, phone)
-- so the same phone number CAN exist in different campaigns.
-- ============================================================

-- 1. Remove any cross-org unique constraint on (org_id, phone) if it exists
--    (this would prevent the same phone from appearing in multiple campaigns)
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_org_id_phone_key;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_phone_org_id_key;

-- 2. Add per-campaign unique constraint:
--    same phone can appear in different campaigns, but NOT twice in the same campaign
--    Using IF NOT EXISTS to make this safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contacts_org_campaign_phone_unique'
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_org_campaign_phone_unique
      UNIQUE (org_id, campaign_id, phone);
  END IF;
END;
$$;

-- 3. Grant DELETE permission on contacts for authenticated users
--    (needed for the clear-campaign endpoint which uses service role — already works,
--     but this is here for completeness if you ever use anon key)
-- No change needed — service role already has full access.
