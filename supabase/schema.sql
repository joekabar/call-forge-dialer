-- ============================================================
-- SolarFlow Pro v1 — Supabase Schema
-- Run this in your Supabase SQL editor (Settings → SQL Editor)
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Organizations ────────────────────────────────────────────
-- One row per paying customer / trial account
CREATE TABLE public.organizations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  country              text NOT NULL DEFAULT 'BE'
                         CHECK (country IN ('BE','NL','FR','DE')),
  plan                 text NOT NULL DEFAULT 'trial'
                         CHECK (plan IN ('trial','starter','pro','enterprise')),
  trial_ends_at        timestamptz DEFAULT now() + interval '7 days',
  seat_limit           int  NOT NULL DEFAULT 3,
  is_active            boolean NOT NULL DEFAULT true,
  -- Rate limit: seconds between contacts per agent (default 45s)
  contact_interval_sec int  NOT NULL DEFAULT 45
                         CHECK (contact_interval_sec BETWEEN 10 AND 300),
  created_at           timestamptz DEFAULT now()
);

-- ── User profiles ────────────────────────────────────────────
-- Extends Supabase auth.users with role + org
CREATE TABLE public.user_profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organizations(id),
  role        text NOT NULL DEFAULT 'agent'
                CHECK (role IN ('admin','supervisor','agent','client')),
  full_name   text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ── Campaigns ────────────────────────────────────────────────
CREATE TABLE public.campaigns (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES public.organizations(id),
  name                    text NOT NULL,
  country                 text NOT NULL DEFAULT 'BE',
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','paused','completed')),
  -- Override org-level rate limit per campaign (optional)
  contact_interval_sec    int  CHECK (contact_interval_sec BETWEEN 10 AND 300),
  calling_hours_start     time NOT NULL DEFAULT '09:00',
  calling_hours_end       time NOT NULL DEFAULT '20:00',
  created_at              timestamptz DEFAULT now()
);

-- ── Contacts ─────────────────────────────────────────────────
CREATE TABLE public.contacts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.organizations(id),
  campaign_id           uuid REFERENCES public.campaigns(id),

  -- Basic info (visible to agents)
  first_name            text,
  last_name             text,
  phone                 text NOT NULL,
  email                 text,

  -- Original address from lead import (HIDDEN from agents)
  street_original       text,
  city_original         text,
  postal_code_original  text,

  -- Verified address (entered by agent during call)
  street_verified       text,
  city_verified         text,
  postal_code_verified  text,
  address_verified_at   timestamptz,
  address_verified_by   uuid REFERENCES public.user_profiles(id),

  -- Lead scoring (0-100, computed at import)
  lead_score            int DEFAULT 50 CHECK (lead_score BETWEEN 0 AND 100),

  -- Queue / locking
  status                text NOT NULL DEFAULT 'available'
                          CHECK (status IN
                            ('available','locked','called',
                             'callback','dnc','voicemail')),
  locked_by             uuid REFERENCES public.user_profiles(id),
  locked_at             timestamptz,
  lock_expires_at       timestamptz,

  -- Call tracking
  last_called_at        timestamptz,
  last_outcome          text,
  called_by             uuid REFERENCES public.user_profiles(id),
  callback_at           timestamptz,
  call_count            int NOT NULL DEFAULT 0,

  -- Source
  lead_source           text DEFAULT 'import',   -- 'import' | 'pool'
  imported_at           timestamptz DEFAULT now(),
  created_at            timestamptz DEFAULT now()
);

-- Fast queue index
CREATE INDEX idx_contacts_queue ON public.contacts
  (org_id, campaign_id, status, lead_score DESC, created_at ASC)
  WHERE status = 'available';

CREATE INDEX idx_contacts_callbacks ON public.contacts
  (org_id, status, callback_at)
  WHERE status = 'callback';

-- ── DNC list ─────────────────────────────────────────────────
CREATE TABLE public.dnc_list (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id),
  phone      text NOT NULL,
  reason     text,
  added_by   uuid REFERENCES public.user_profiles(id),
  added_at   timestamptz DEFAULT now(),
  UNIQUE (org_id, phone)
);

-- ── Call logs ────────────────────────────────────────────────
-- Immutable audit trail — never updated, only inserted
CREATE TABLE public.call_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id),
  contact_id   uuid NOT NULL REFERENCES public.contacts(id),
  agent_id     uuid NOT NULL REFERENCES public.user_profiles(id),
  campaign_id  uuid REFERENCES public.campaigns(id),
  outcome      text,
  duration_sec int,
  notes        text,
  script_path  jsonb,   -- array of branch choices made
  started_at   timestamptz DEFAULT now(),
  ended_at     timestamptz
);

-- ── Contact view log (anti-scraping audit) ───────────────────
CREATE TABLE public.contact_view_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  contact_id   uuid NOT NULL,
  agent_id     uuid NOT NULL,
  campaign_id  uuid,
  viewed_at    timestamptz DEFAULT now()
);

-- ── Scripts ──────────────────────────────────────────────────
CREATE TABLE public.scripts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id),
  campaign_id uuid REFERENCES public.campaigns(id),
  name        text NOT NULL,
  language    text NOT NULL DEFAULT 'nl',
  content     jsonb NOT NULL,   -- branching tree JSON
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ── Appointments ─────────────────────────────────────────────
CREATE TABLE public.appointments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id),
  contact_id      uuid REFERENCES public.contacts(id),
  agent_id        uuid NOT NULL REFERENCES public.user_profiles(id),
  gcal_event_id   text,
  title           text,
  scheduled_at    timestamptz NOT NULL,
  duration_min    int DEFAULT 60,
  address         text,
  notes           text,
  status          text DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','completed','cancelled')),
  created_at      timestamptz DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dnc_list         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_view_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments     ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's org_id
CREATE OR REPLACE FUNCTION auth_org_id() RETURNS uuid AS $$
  SELECT org_id FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION auth_role() RETURNS text AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Organizations: users see only their own org
CREATE POLICY "org_own" ON public.organizations
  FOR ALL USING (id = auth_org_id());

-- User profiles: users see profiles in their org
CREATE POLICY "profiles_own_org" ON public.user_profiles
  FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "profiles_admin_write" ON public.user_profiles
  FOR ALL USING (auth_role() IN ('admin'));

-- Campaigns: all roles can read own org; only admin/supervisor write
CREATE POLICY "campaigns_read" ON public.campaigns
  FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "campaigns_write" ON public.campaigns
  FOR ALL USING (
    org_id = auth_org_id()
    AND auth_role() IN ('admin','supervisor')
  );

-- Contacts: AGENTS see ONLY their currently locked contact
CREATE POLICY "contacts_agent" ON public.contacts
  FOR SELECT USING (
    org_id = auth_org_id()
    AND (
      auth_role() IN ('admin','supervisor','client')
      OR locked_by = auth.uid()
    )
  );
CREATE POLICY "contacts_write" ON public.contacts
  FOR UPDATE USING (org_id = auth_org_id());

-- DNC: admin + supervisor manage; agents can add
CREATE POLICY "dnc_read" ON public.dnc_list
  FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "dnc_write" ON public.dnc_list
  FOR INSERT WITH CHECK (org_id = auth_org_id());
CREATE POLICY "dnc_admin_delete" ON public.dnc_list
  FOR DELETE USING (
    org_id = auth_org_id()
    AND auth_role() IN ('admin','supervisor')
  );

-- Call logs: all roles read own org; agents insert
CREATE POLICY "call_logs_read" ON public.call_logs
  FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "call_logs_insert" ON public.call_logs
  FOR INSERT WITH CHECK (org_id = auth_org_id());

-- Contact view log: insert only (audit trail)
CREATE POLICY "view_log_insert" ON public.contact_view_log
  FOR INSERT WITH CHECK (org_id = auth_org_id());
CREATE POLICY "view_log_admin" ON public.contact_view_log
  FOR SELECT USING (
    org_id = auth_org_id()
    AND auth_role() IN ('admin','supervisor')
  );

-- Scripts: all read; admin/supervisor write
CREATE POLICY "scripts_read" ON public.scripts
  FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "scripts_write" ON public.scripts
  FOR ALL USING (
    org_id = auth_org_id()
    AND auth_role() IN ('admin','supervisor')
  );

-- Appointments: own org
CREATE POLICY "appointments_own_org" ON public.appointments
  FOR ALL USING (org_id = auth_org_id());

-- ============================================================
-- ATOMIC LOCK FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION get_next_contact(
  p_org_id      uuid,
  p_agent_id    uuid,
  p_campaign_id uuid
)
RETURNS SETOF public.contacts
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.contacts
  SET
    locked_by       = p_agent_id,
    locked_at       = now(),
    lock_expires_at = now() + interval '10 minutes',
    status          = 'locked'
  WHERE id = (
    SELECT id FROM public.contacts
    WHERE
      org_id      = p_org_id
      AND campaign_id = p_campaign_id
      AND (
        status = 'available'
        OR (status = 'callback' AND callback_at <= now())
      )
      AND (
        locked_by IS NULL
        OR lock_expires_at < now()
      )
    ORDER BY lead_score DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ============================================================
-- SEED: default script for Dutch solar calls
-- ============================================================

-- Insert after creating your first org + campaign via the app
-- Example script structure (insert manually or via API):
/*
INSERT INTO public.scripts (org_id, campaign_id, name, language, content)
VALUES (
  '<your-org-id>',
  '<your-campaign-id>',
  'Standaard zonnepanelen script',
  'nl',
  '{
    "steps": [
      {
        "id": "intro",
        "text": "Goedemiddag, spreek ik met {first_name}? Ik bel namens {company} over zonnepanelen voor uw woning.",
        "branches": [
          {"label": "Geïnteresseerd", "next": "qualify"},
          {"label": "Niet geïnteresseerd", "next": "objection"},
          {"label": "Terugbellen", "next": "callback"},
          {"label": "Verkeerd nummer", "outcome": "wrong_number"}
        ]
      },
      {
        "id": "qualify",
        "text": "Geweldig! Mag ik u een paar korte vragen stellen? Bent u de eigenaar van uw woning?",
        "branches": [
          {"label": "Ja, eigenaar", "next": "roof"},
          {"label": "Nee, huurder", "outcome": "not_qualified"}
        ]
      },
      {
        "id": "roof",
        "text": "En heeft u een schuin of plat dak? Weet u ruwweg in welke richting het dak ligt?",
        "branches": [
          {"label": "Schuin, zuiden", "next": "close"},
          {"label": "Schuin, andere richting", "next": "close"},
          {"label": "Plat dak", "next": "close"}
        ]
      },
      {
        "id": "close",
        "text": "Uitstekend! Ik zou graag een afspraak maken voor een vrijblijvende offerte aan huis. Wanneer schikt het u?",
        "branches": [
          {"label": "Afspraak maken", "outcome": "interested"},
          {"label": "Eerst nadenken", "next": "callback"}
        ]
      },
      {
        "id": "objection",
        "text": "Dat begrijp ik. Mag ik vragen waarom niet? Misschien kan ik u meer informatie geven.",
        "branches": [
          {"label": "Te duur", "next": "cost_objection"},
          {"label": "Al zonnepanelen", "outcome": "not_interested"},
          {"label": "Geen interesse", "outcome": "not_interested"}
        ]
      },
      {
        "id": "cost_objection",
        "text": "Wist u dat er momenteel premies beschikbaar zijn die de kostprijs flink verlagen? En de panelen verdienen zichzelf terug in 5 à 6 jaar.",
        "branches": [
          {"label": "Toch geïnteresseerd", "next": "close"},
          {"label": "Nog steeds niet", "outcome": "not_interested"}
        ]
      },
      {
        "id": "callback",
        "text": "Geen probleem! Wanneer kan ik u beter terugbellen?",
        "branches": [
          {"label": "Morgen ochtend", "outcome": "callback"},
          {"label": "Morgen namiddag", "outcome": "callback"},
          {"label": "Volgende week", "outcome": "callback"}
        ]
      }
    ]
  }'
);
*/
