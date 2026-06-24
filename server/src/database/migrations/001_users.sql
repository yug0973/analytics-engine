-- Migration 001: Users and API Keys
-- ─────────────────────────────────────────────────────────

-- Users table: internal team members who access dashboards
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('admin', 'viewer', 'api_client')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by email (login flow)
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- API keys: for SDK clients that send events programmatically
-- The raw key is shown once; only the SHA-256 hash is stored here
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash      VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(100),
  last_used_at  TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ       -- NULL = never expires
);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx  ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);

-- Function: auto-update updated_at on users
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();