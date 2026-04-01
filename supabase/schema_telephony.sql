-- supabase/schema_telephony.sql
-- ────────────────────────────────────────────────────────────────────
-- Telephony integration — provider-agnostic schema additions.
-- Run AFTER schema.sql and schema_v2_additions.sql
-- ────────────────────────────────────────────────────────────────────


-- ── 1. Add telephony fields to organizations ─────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS telephony_provider TEXT DEFAULT 'manual'
    CHECK (telephony_provider IN ('manual', 'twilio', 'asterisk', 'vonage', 'telnyx')),
  ADD COLUMN IF NOT EXISTS telephony_credentials_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS telephony_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS telephony_configured_at TIMESTAMPTZ;

COMMENT ON COLUMN organizations.telephony_provider IS
  'Active telephony provider: manual (trial), twilio, asterisk, vonage, telnyx';
COMMENT ON COLUMN organizations.telephony_credentials_encrypted IS
  'Fernet-encrypted JSON blob with provider credentials (account SID, auth token, etc.)';
COMMENT ON COLUMN organizations.telephony_phone_number IS
  'Default outbound caller ID in E.164 format (+32470123456)';


-- ── 2. Call log table (tracks every call across all providers) ───

CREATE TABLE IF NOT EXISTS call_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id       UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  campaign_id    UUID REFERENCES campaigns(id) ON DELETE SET NULL,

  -- Provider info
  provider       TEXT NOT NULL DEFAULT 'manual',
  call_sid       TEXT,                  -- Provider-specific call ID (Twilio CallSid, etc.)

  -- Call details
  direction      TEXT NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound')),
  from_number    TEXT,                  -- Caller ID used (E.164)
  to_number      TEXT,                  -- Destination (E.164)
  status         TEXT NOT NULL DEFAULT 'initiating'
    CHECK (status IN (
      'idle', 'initiating', 'ringing', 'in_progress',
      'on_hold', 'completed', 'failed', 'busy',
      'no_answer', 'cancelled'
    )),
  duration_sec   INTEGER,              -- Final call duration
  recording_url  TEXT,                 -- Recording URL if recorded

  -- Dialing mode used
  dialing_mode   TEXT DEFAULT 'preview'
    CHECK (dialing_mode IN ('preview', 'power', 'progressive', 'predictive', 'manual')),

  -- AMD (Answering Machine Detection) result
  amd_result     TEXT
    CHECK (amd_result IS NULL OR amd_result IN ('human', 'machine', 'unknown')),

  -- Timestamps
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  answered_at    TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,

  -- Metadata
  metadata       JSONB DEFAULT '{}'::jsonb
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_call_log_org      ON call_log(org_id);
CREATE INDEX IF NOT EXISTS idx_call_log_agent    ON call_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_log_contact  ON call_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_call_log_campaign ON call_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_call_log_sid      ON call_log(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_log_started  ON call_log(started_at DESC);

-- RLS: agents see only their org's calls
ALTER TABLE call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_log_org_isolation" ON call_log
  FOR ALL USING (
    org_id = (
      SELECT org_id FROM agents
      WHERE agents.id = auth.uid()
    )
  );


-- ── 3. Add dialing_mode to campaigns table ───────────────────────

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS dialing_mode TEXT DEFAULT 'preview'
    CHECK (dialing_mode IN ('preview', 'power', 'progressive', 'predictive', 'manual'));

COMMENT ON COLUMN campaigns.dialing_mode IS
  'Default dialing mode for this campaign. manual = agent uses own phone (trial mode).';


-- ── 4. Agent telephony state (for predictive dialing) ────────────
-- Tracks whether an agent is available, on a call, or in wrap-up.
-- Used by the predictive dialer algorithm to decide when to over-dial.

CREATE TABLE IF NOT EXISTS agent_telephony_state (
  agent_id       UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  state          TEXT NOT NULL DEFAULT 'offline'
    CHECK (state IN ('offline', 'available', 'on_call', 'wrapup', 'break')),
  current_call_id UUID REFERENCES call_log(id),
  last_call_ended TIMESTAMPTZ,
  avg_call_duration_sec INTEGER DEFAULT 120,  -- rolling average for predictive algo
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tel_state_org ON agent_telephony_state(org_id, state);


-- ── 5. Grant the service role access ─────────────────────────────

GRANT ALL ON call_log TO service_role;
GRANT ALL ON agent_telephony_state TO service_role;
