// server/src/websocket/eventHandlers.js
// ─────────────────────────────────────────────────────────
//  Bridge between Kafka consumers and Socket.io.
//
//  This module is the single place where consumer events
//  get translated into WebSocket pushes. Keeping this
//  separate from socketServer.js means:
//    - socketServer.js owns transport (rooms, auth, emit)
//    - eventHandlers.js owns business logic (what to push, when)
//    - consumers stay transport-agnostic
//
//  Usage (from alertConsumer.js):
//    const { handleAlertTriggered } = require('../websocket/eventHandlers');
//    await handleAlertTriggered(tenantId, triggered);
// ─────────────────────────────────────────────────────────

'use strict';

const { notifyAlert, broadcastLiveRate } = require('./socketServer');
const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Called by alertConsumer when one or more rules are triggered.
 *
 * @param {string} tenantId
 * @param {Array}  triggered  — array of { rule, alertEvent, value }
 */
async function handleAlertTriggered(tenantId, triggered) {
  if (!triggered || triggered.length === 0) return;

  for (const item of triggered) {
    try {
      notifyAlert(tenantId, item);
    } catch (err) {
      logger.error({
        err,
        tenantId,
        ruleId: item.rule?.id,
      }, '[eventHandlers] Failed to push alert notification');
    }
  }
}

/**
 * Called by analyticsConsumer (or a periodic timer) to push
 * live metrics to connected dashboard clients.
 *
 * Reads current events-per-minute from Redis sorted set —
 * the same source as GET /api/v1/analytics/live.
 *
 * @param {string} tenantId
 */
async function handleLiveMetricsUpdate(tenantId) {
  try {
    const now       = Date.now();
    const oneMinAgo = now - 60 * 1000;

    const count = await redisClient.zcount(
      `events:live:${tenantId}`,
      oneMinAgo,
      now
    );

    broadcastLiveRate(tenantId, {
      eventsPerMinute: count,
      tenantId,
    });
  } catch (err) {
    logger.error({ err, tenantId }, '[eventHandlers] Failed to push live metrics');
  }
}

module.exports = { handleAlertTriggered, handleLiveMetricsUpdate };