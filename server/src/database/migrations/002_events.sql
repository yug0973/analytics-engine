-- Migration 002: Events (TimescaleDB hypertable) and analytics snapshots
-- ─────────────────────────────────────────────────────────

-- ── TimescaleDB: enable extension ────────────────────────
-- Must run before create_hypertable — the function doesn't
-- exist until the extension is loaded.
-- IF NOT EXISTS makes this idempotent (safe to re-run).
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- The core fact table. This will grow to hundreds of millions of rows.
-- Designed as a TimescaleDB hypertable partitioned by created_at (daily chunks).
CREATE TABLE IF NOT EXISTS events (
  -- Compound PK: TimescaleDB requires the partition column in the primary key
  id            UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  tenant_id     UUID NOT NULL,
  event_type    VARCHAR(100) NOT NULL,
  user_id       VARCHAR(255),       -- the end user (not our internal user)
  session_id    VARCHAR(255),
  properties    JSONB,              -- arbitrary event payload
  ip_address    INET,
  user_agent    TEXT,

  -- Kafka metadata — useful for debugging / replay tracking
  kafka_topic     VARCHAR(100),
  kafka_partition INTEGER,
  kafka_offset    BIGINT,

  PRIMARY KEY (id, created_at)
);

-- ── TimescaleDB: convert to hypertable ──────────────────
-- Each daily chunk is a separate physical table — queries scoped
-- to a time range skip irrelevant chunks entirely.
SELECT create_hypertable(
  'events',
  'created_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- ── Indexes ──────────────────────────────────────────────

-- Primary query pattern: "events for tenant X, type Y, in time range Z"
CREATE INDEX IF NOT EXISTS events_tenant_type_time
  ON events(tenant_id, event_type, created_at DESC);

-- Secondary: "events for a specific user in time range"
CREATE INDEX IF NOT EXISTS events_tenant_user_time
  ON events(tenant_id, user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- BRIN index on created_at:
-- Block Range index stores only min/max per page block.
-- Perfect for append-only time-series data (new rows always go to the
-- latest block). Takes ~100x less space than a BTREE on the same column.
CREATE INDEX IF NOT EXISTS events_created_at_brin
  ON events USING BRIN(created_at);

-- GIN index on properties JSONB — enables fast queries like:
-- WHERE properties @> '{"page": "/dashboard"}'
CREATE INDEX IF NOT EXISTS events_properties_gin
  ON events USING GIN(properties);

-- ── Pre-computed aggregates ───────────────────────────────
-- The analytics consumer writes rolled-up metrics here so that
-- dashboard queries read pre-computed rows, not raw events.
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  metric_name   VARCHAR(100) NOT NULL,
  dimensions    JSONB,                   -- e.g. {event_type: 'click'}
  value         NUMERIC(20, 4) NOT NULL,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  granularity   VARCHAR(10) NOT NULL
                  CHECK (granularity IN ('minute', 'hour', 'day')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS snapshots_lookup
  ON analytics_snapshots(tenant_id, metric_name, period_start DESC, granularity);