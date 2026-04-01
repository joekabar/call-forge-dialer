-- ============================================================
-- SolarFlow Pro — Admin Fix Migration
-- Run this in your Supabase SQL Editor (Settings → SQL Editor)
-- ============================================================

-- 1. Add is_platform_admin flag to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- 2. Add branding columns to organizations (used by login + platform admin)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#1d6fb8';

-- ============================================================
-- 3. Extend trial / activate your demo org (run if trial expired!)
--    The default trial is only 7 days. This sets it to 30 days from now
--    and marks the org as active so all API calls work again.
-- ============================================================
UPDATE public.organizations
  SET trial_ends_at = now() + interval '30 days',
      is_active     = true
  WHERE id IN (SELECT org_id FROM public.user_profiles LIMIT 1);

-- ============================================================
-- 4. Promote your superadmin user.
--    Replace <your-user-uuid> with the UUID from Supabase → Auth → Users
-- ============================================================
-- UPDATE public.user_profiles
--   SET is_platform_admin = true
--   WHERE id = '<your-user-uuid>';
