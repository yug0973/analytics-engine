-- Migration 003: Alert rules and alert event log
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  name          VARCHAR(255) NOT NULL,
  metric_name   VARCHAR(100) NOT NULL,   -- must match a known metric_name
  operator      VARCHAR(5) NOT NULL
                  CHECK (operator IN ('gt', 'lt', 'gte', 'lte', 'eq')),
  threshold     NUMERIC(20, 4) NOT NULL,
  -- window_secs: the rolling window over which the metric is evaluated
  -- e.g. 300 = "error_rate over last 5 minutes"
  window_secs   INTEGER NOT NULL DEFAULT 300,
  -- cooldown_secs: min time between repeated triggers for the same rule
  -- prevents alert storms when a threshold is breached continuously
  cooldown_secs INTEGER NOT NULL DEFAULT 600,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alert_rules_tenant_idx
  ON alert_rules(tenant_id)
  WHERE is_active = true;

CREATE TRIGGER set_alert_rules_updated_at
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Log of every time an alert rule was triggered
CREATE TABLE IF NOT EXISTS alert_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id          UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  triggered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,           -- NULL = still active
  value_at_trigger NUMERIC(20, 4) NOT NULL,
  -- Snapshot of rule at trigger time (rules can change)
  rule_snapshot    JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS alert_events_rule_idx
  ON alert_events(rule_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS alert_events_tenant_time_idx
  ON alert_events(triggered_at DESC);