// server/src/routes/analytics.routes.js
// ─────────────────────────────────────────────────────────
//  Analytics query route definitions.
//
//  All routes:
//    - require authentication (JWT)
//    - allow admin + viewer roles (no api_client — SDKs send
//      events, they don't read dashboards)
//    - validate query params via validate({ query: schema })
//
//  No rate limiter on reads — these are dashboard queries by
//  authenticated users. If you add a public-facing embed later,
//  add a separate read limiter at that point.
// ─────────────────────────────────────────────────────────

'use strict';

const { Router } = require('express');
const analyticsController = require('../controllers/analytics.controller');
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const validate     = require('../middleware/validate');
const {
  timeSeriesSchema,
  summarySchema,
  eventsQuerySchema,
  liveRateSchema,
} = require('../validators/analytics.validators');

const router = Router();

// All analytics routes require a valid JWT
router.use(authenticate);

// All analytics routes are readable by admin and viewer
// api_client role is for SDKs that ingest events — not dashboard reads
const canRead = authorize('admin', 'viewer');

/**
 * GET /api/v1/analytics/time-series
 *
 * Time-series event counts bucketed by period.
 * Response: { dataPoints: [{timestamp, count, uniqueUsers}] }
 *
 * Example:
 *   GET /api/v1/analytics/time-series?tenantId=<uuid>&period=24h&eventType=page_view
 */
router.get(
  '/time-series',
  canRead,
  validate({ query: timeSeriesSchema }),
  analyticsController.getTimeSeries
);

/**
 * GET /api/v1/analytics/summary
 *
 * Dashboard summary card.
 * Response: { totalEvents, uniqueUsers, uniqueSessions, topEventTypes, errorRate }
 *
 * Example:
 *   GET /api/v1/analytics/summary?tenantId=<uuid>&period=24h
 */
router.get(
  '/summary',
  canRead,
  validate({ query: summarySchema }),
  analyticsController.getSummary
);

/**
 * GET /api/v1/analytics/events
 *
 * Paginated raw event list for the recent-events table.
 * Response: { events: [...], meta: { total, page, limit, pages } }
 *
 * Example:
 *   GET /api/v1/analytics/events?tenantId=<uuid>&eventType=error&page=1&limit=50
 */
router.get(
  '/events',
  canRead,
  validate({ query: eventsQuerySchema }),
  analyticsController.getEvents
);

/**
 * GET /api/v1/analytics/live
 *
 * Live events-per-minute from Redis sorted set.
 * Reads in-memory counter — zero Postgres cost, sub-millisecond response.
 * Poll this endpoint every 5s from the dashboard ticker.
 *
 * Example:
 *   GET /api/v1/analytics/live?tenantId=<uuid>
 */
router.get(
  '/live',
  canRead,
  validate({ query: liveRateSchema }),
  analyticsController.getLiveRate
);

module.exports = router;