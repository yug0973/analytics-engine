// server/src/controllers/analytics.controller.js
// ─────────────────────────────────────────────────────────
//  Analytics controller.
//  Pattern: identical to auth.controller.js
//    - read from req.query / req.params (already validated + stripped)
//    - call analytics.service.js
//    - return consistent { success, data } envelope
//    - pass all errors to next(err) → errorHandler
// ─────────────────────────────────────────────────────────

'use strict';

const analyticsService = require('../services/analytics.service');
const logger = require('../utils/logger');

// ─── GET /api/v1/analytics/time-series ───────────────────

/**
 * Time-series event counts bucketed by period.
 * Query (validated): { tenantId, period, eventType? }
 */
async function getTimeSeries(req, res, next) {
  try {
    const { tenantId, period, eventType } = req.query;

    const data = await analyticsService.getTimeSeries({ tenantId, period, eventType });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/v1/analytics/summary ───────────────────────

/**
 * Dashboard summary card: totals, top event types, error rate.
 * Query (validated): { tenantId, period }
 */
async function getSummary(req, res, next) {
  try {
    const { tenantId, period } = req.query;

    const data = await analyticsService.getSummary({ tenantId, period });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/v1/analytics/events ────────────────────────

/**
 * Paginated raw event list.
 * Query (validated): { tenantId, eventType?, startTime?, endTime?, page, limit }
 */
async function getEvents(req, res, next) {
  try {
    const { tenantId, eventType, startTime, endTime, page, limit } = req.query;

    const data = await analyticsService.getEvents({
      tenantId,
      eventType,
      startTime,
      endTime,
      page,
      limit,
    });

    logger.info(
      { reqId: req.requestId, tenantId, page, total: data.meta.total },
      'analytics:events queried'
    );

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/v1/analytics/live ──────────────────────────

/**
 * Live events-per-minute counter from Redis.
 * Zero Postgres cost — reads a sorted set maintained by the consumer.
 * Query (validated): { tenantId }
 */
async function getLiveRate(req, res, next) {
  try {
    const { tenantId } = req.query;

    const data = await analyticsService.getLiveRate(tenantId);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTimeSeries, getSummary, getEvents, getLiveRate };