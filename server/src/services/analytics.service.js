// server/src/services/analytics.service.js
// ─────────────────────────────────────────────────────────
//  Analytics query business logic.
//
//  Every public function follows the cache-aside pattern:
//    1. Check Redis → hit: return immediately (no Postgres touched)
//    2. Miss: query Postgres
//    3. Write result to Redis with TTL
//    4. Return result
// ─────────────────────────────────────────────────────────

'use strict';

const { query } = require('../config/database');
const { redisClient } = require('../config/redis');
const env = require('../config/env');
const metrics = require('../utils/metrics');

// ── Cache helpers ─────────────────────────────────────────

function buildCacheKey(prefix, params) {
  return `${prefix}:${Object.values(params).join(':')}`;
}

async function getCached(key, keyPattern) {
  const value = await redisClient.get(key);
  if (value) {
    metrics.cacheHits.inc({ key_pattern: keyPattern });
    return JSON.parse(value);
  }
  metrics.cacheMisses.inc({ key_pattern: keyPattern });
  return null;
}

async function setCache(key, value, ttlSeconds) {
  await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
}

function getTtl(period) {
  return ['1h', '24h'].includes(period)
    ? env.cache.metricsRealtime    // 30s
    : env.cache.metricsHistorical; // 300s
}

// ── Period → SQL mapping ──────────────────────────────────
//
// `bucket` is the date_trunc unit — must be a string literal
// embedded in the SQL, NOT passed as a parameter.
// date_trunc() is standard PostgreSQL (no extensions needed).
// It accepts: 'microseconds','milliseconds','second','minute',
//             'hour','day','week','month','quarter','year'
//
// Why not pass bucket as $1?
// date_trunc(field, source) requires `field` to be a string
// literal in the query — Postgres does not accept a parameter
// placeholder there. Since `bucket` comes from this constant
// (never from user input), embedding it is safe.

const PERIOD_MAP = {
  '1h':  { interval: '1 hour',   bucket: 'minute' },
  '24h': { interval: '24 hours', bucket: 'hour'   },
  '7d':  { interval: '7 days',   bucket: 'day'    },
  '30d': { interval: '30 days',  bucket: 'day'    },
};

// ── Service functions ─────────────────────────────────────

/**
 * Time-series event count for a tenant.
 * Uses standard PostgreSQL date_trunc() — no extensions required.
 *
 * date_trunc('hour', created_at) truncates a timestamp to the
 * start of its hour. Works on standard PostgreSQL 14+ with no extensions.
 */
async function getTimeSeries({ tenantId, period, eventType }) {
  const cacheKey = buildCacheKey('ts', { tenantId, period, eventType: eventType || 'all' });
  const cached = await getCached(cacheKey, 'time_series');
  if (cached) return cached;

  const { interval, bucket } = PERIOD_MAP[period] || PERIOD_MAP['24h'];

  // `bucket` is a trusted constant from PERIOD_MAP — safe to interpolate.
  // All user-supplied values (tenantId, interval, eventType) remain as $N params.
  let sql, params;
  if (eventType) {
    sql = `
      SELECT
        date_trunc('${bucket}', created_at) AS bucket,
        COUNT(*)::INTEGER                    AS count,
        COUNT(DISTINCT user_id)::INTEGER     AS unique_users
      FROM events
      WHERE tenant_id  = $1::UUID
        AND created_at >= NOW() - $2::INTERVAL
        AND event_type  = $3
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    params = [tenantId, interval, eventType];
  } else {
    sql = `
      SELECT
        date_trunc('${bucket}', created_at) AS bucket,
        COUNT(*)::INTEGER                    AS count,
        COUNT(DISTINCT user_id)::INTEGER     AS unique_users
      FROM events
      WHERE tenant_id  = $1::UUID
        AND created_at >= NOW() - $2::INTERVAL
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    params = [tenantId, interval];
  }

  const result = await query(sql, params);

  const data = {
    period,
    eventType: eventType || 'all',
    bucketSize: bucket,
    dataPoints: result.rows.map(row => ({
      timestamp: row.bucket,
      count: row.count,
      uniqueUsers: row.unique_users,
    })),
  };

  await setCache(cacheKey, data, getTtl(period));
  return data;
}

/**
 * Dashboard summary — totals, top event types, error rate.
 * Three Postgres queries run in parallel via Promise.all.
 */
async function getSummary({ tenantId, period = '24h' }) {
  const cacheKey = buildCacheKey('summary', { tenantId, period });
  const cached = await getCached(cacheKey, 'summary');
  if (cached) return cached;

  const { interval } = PERIOD_MAP[period] || PERIOD_MAP['24h'];

  const [totalsResult, topTypesResult, errorResult] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::INTEGER                   AS total_events,
        COUNT(DISTINCT user_id)::INTEGER    AS unique_users,
        COUNT(DISTINCT session_id)::INTEGER AS unique_sessions
      FROM events
      WHERE tenant_id = $1::UUID
        AND created_at >= NOW() - $2::INTERVAL
    `, [tenantId, interval]),

    query(`
      SELECT event_type, COUNT(*)::INTEGER AS count
      FROM events
      WHERE tenant_id = $1::UUID
        AND created_at >= NOW() - $2::INTERVAL
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 10
    `, [tenantId, interval]),

    query(`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'error')::INTEGER AS error_count,
        COUNT(*)::INTEGER                                      AS total_count
      FROM events
      WHERE tenant_id = $1::UUID
        AND created_at >= NOW() - $2::INTERVAL
    `, [tenantId, interval]),
  ]);

  const totals   = totalsResult.rows[0];
  const errorRow = errorResult.rows[0];
  const errorRate = errorRow.total_count > 0
    ? parseFloat(((errorRow.error_count / errorRow.total_count) * 100).toFixed(2))
    : 0;

  const summary = {
    period,
    totalEvents:    totals.total_events,
    uniqueUsers:    totals.unique_users,
    uniqueSessions: totals.unique_sessions,
    topEventTypes:  topTypesResult.rows,
    errorRate,
    errorCount: errorRow.error_count,
  };

  await setCache(cacheKey, summary, getTtl(period));
  return summary;
}

/**
 * Paginated raw event list — recent events table on the dashboard.
 * Not cached: user expects live data, and per-page cache would explode key count.
 */
async function getEvents({ tenantId, eventType, startTime, endTime, page = 1, limit = 50 }) {
  const offset = (page - 1) * limit;

  const conditions = ['tenant_id = $1::UUID'];
  const params = [tenantId];

  if (eventType) {
    params.push(eventType);
    conditions.push(`event_type = $${params.length}`);
  }
  if (startTime) {
    params.push(startTime);
    conditions.push(`created_at >= $${params.length}::TIMESTAMPTZ`);
  }
  if (endTime) {
    params.push(endTime);
    conditions.push(`created_at <= $${params.length}::TIMESTAMPTZ`);
  }

  const where = conditions.join(' AND ');
  const dataParams  = [...params, limit, offset];
  const countParams = [...params];

  const [eventsResult, countResult] = await Promise.all([
    query(`
      SELECT id, event_type, user_id, session_id, properties, created_at
      FROM events
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `, dataParams),

    query(`
      SELECT COUNT(*)::INTEGER AS total FROM events WHERE ${where}
    `, countParams),
  ]);

  const total = countResult.rows[0].total;
  return {
    events: eventsResult.rows,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  };
}

/**
 * Live events-per-minute from Redis sorted set.
 * Maintained by the analytics consumer — zero Postgres cost.
 */
async function getLiveRate(tenantId) {
  const now       = Date.now();
  const oneMinAgo = now - 60 * 1000;

  const count = await redisClient.zcount(
    `events:live:${tenantId}`,
    oneMinAgo,
    now
  );

  return { eventsPerMinute: count, timestamp: new Date().toISOString() };
}

module.exports = { getTimeSeries, getSummary, getEvents, getLiveRate };