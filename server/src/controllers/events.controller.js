// server/src/controllers/events.controller.js
// ─────────────────────────────────────────────────────────
//  Handles POST /api/v1/events and POST /api/v1/events/batch
//
//  Validation is done upstream by validate.js middleware —
//  by the time these handlers run, req.body is clean and typed.
// ─────────────────────────────────────────────────────────

'use strict';

const { ingestEvent, ingestBatch } = require('../services/events.service');
const logger = require('../utils/logger');

/**
 * POST /api/v1/events
 * Ingest a single event.
 */
async function ingestEventHandler(req, res, next) {
  try {
    const result = await ingestEvent(req.body, req.user);

    return res.status(202).json({
      success: true,
      data: result,
    });
  } catch (err) {
    logger.error({ err, reqId: req.id }, '[eventsController] Failed to ingest event');
    next(err);
  }
}

/**
 * POST /api/v1/events/batch
 * Ingest a batch of events (up to 500).
 */
async function ingestBatchHandler(req, res, next) {
  try {
    const result = await ingestBatch(req.body, req.user);

    return res.status(202).json({
      success: true,
      data: result,
    });
  } catch (err) {
    logger.error({ err, reqId: req.id }, '[eventsController] Failed to ingest batch');
    next(err);
  }
}

module.exports = {
  ingestEvent: ingestEventHandler,
  ingestBatch: ingestBatchHandler,
};