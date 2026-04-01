-- schema_telephony_v2.sql
-- ────────────────────────────────────────────────────────────────
-- Corrected telephony migration — matches actual Supabase schema.
-- Tables: user_profiles (not agents), call_logs (not call_log), etc.
--
-- organizations already has telephony_* columns — skip those.
-- call_logs already exists — ALTER to add new columns.
-- ────────────────────────────────────────────────────────────────


-- ── 1. Add telephony columns to existing call_logs table ─────

ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS provider       TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS call_sid       TEXT,
  ADD COLUMN IF NOT EXISTS direction      TEXT DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS from_number    TEXT,
  ADD COLUMN IF NOT EXISTS to_number      TEXT,
  ADD COLUMN IF NOT EXISTS status         TEXT DEFAULT 'initiating',
  ADD COLUMN IF NOT EXISTS recording_url  TEXT,
  ADD COLUMN IF NOT EXISTS dialing_mode   TEXT DEFAULT 'preview',
  ADD COLUMN IF NOT EXISTS amd_result     TEXT,
  ADD COLUMN IF NOT EXISTS answered_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata       JSONB DEFAULT '{}'::jsonb;

-- Indexes for telephony queries
CREATE INDEX IF NOT EXISTS idx_call_logs_sid     ON call_logs(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_logs_status  ON call_logs(status);
CREATE INDEX IF NOT EXISTS idx_call_logs_started ON call_logs(started_at DESC);

COMMENT ON COLUMN call_logs.provider      IS 'Telephony provider used: manual, twilio, asterisk, vonage';
COMMENT ON COLUMN call_logs.call_sid      IS 'Provider-specific call ID (e.g. Twilio CallSid)';
COMMENT ON COLUMN call_logs.direction     IS 'outbound or inbound';
COMMENT ON COLUMN call_logs.from_number   IS 'Caller ID used (E.164)';
COMMENT ON COLUMN call_logs.to_number     IS 'Destination number (E.164)';
COMMENT ON COLUMN call_logs.status        IS 'Call state: idle, initiating, ringing, in_progress, completed, failed, busy, no_answer, cancelled';
COMMENT ON COLUMN call_logs.recording_url IS 'URL to call recording (if recorded)';
COMMENT ON COLUMN call_logs.dialing_mode  IS 'Dialing mode: preview, power, progressive, predictive, manual';
COMMENT ON COLUMN call_logs.amd_result    IS 'Answering machine detection result: human, machine, unknown';


-- ── 2. Add dialing_mode to campaigns ─────────────────────────

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS dialing_mode TEXT DEFAULT 'preview';

COMMENT ON COLUMN campaigns.dialing_mode IS
  'Default dialing mode for this campaign: manual, preview, power, progressive, predictive';


-- ── 3. Agent telephony state (for predictive dialing) ────────
-- Tracks real-time agent availability for the dialer algorithm.

CREATE TABLE IF NOT EXISTS agent_telephony_state (
  agent_id              UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  state                 TEXT NOT NULL DEFAULT 'offline'
    CHECK (state IN ('offline', 'available', 'on_call', 'wrapup', 'break')),
  current_call_id       UUID REFERENCES call_logs(id),
  last_call_ended       TIMESTAMPTZ,
  avg_call_duration_sec INTEGER DEFAULT 120,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tel_state_org
  ON agent_telephony_state(org_id, state);

COMMENT ON TABLE agent_telephony_state IS
  'Real-time agent state for predictive dialing algorithm';


-- ── 4. RLS policies ──────────────────────────────────────────

ALTER TABLE agent_telephony_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_tel_state_org_isolation" ON agent_telephony_state
  FOR ALL USING (
    org_id = (
      SELECT org_id FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  );


-- ── 5. Grant service role access ─────────────────────────────

GRANT ALL ON agent_telephony_state TO service_role;
