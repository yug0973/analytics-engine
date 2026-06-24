// server/src/validators/analytics.validators.js
// ─────────────────────────────────────────────────────────
//  Joi schemas for the analytics query layer.
//  Kept separate from the service (unlike events) because these
//  are pure HTTP contract definitions — query string shapes.
//  The service has no Joi dependency.
// ─────────────────────────────────────────────────────────

'use strict';

const Joi = require('joi');

const VALID_PERIODS     = ['1h', '24h', '7d', '30d'];
const UUID_PATTERN      = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── /analytics/time-series ────────────────────────────────

const timeSeriesSchema = Joi.object({
  tenantId: Joi.string().pattern(UUID_PATTERN).required()
    .messages({ 'string.pattern.base': 'tenantId must be a valid UUID' }),

  period: Joi.string().valid(...VALID_PERIODS).default('24h'),

  // Optional — if omitted, query returns all event types aggregated
  eventType: Joi.string().max(100).pattern(/^[a-z_]+$/).optional()
    .messages({ 'string.pattern.base': 'eventType must be snake_case' }),
});

// ── /analytics/summary ───────────────────────────────────

const summarySchema = Joi.object({
  tenantId: Joi.string().pattern(UUID_PATTERN).required(),
  period:   Joi.string().valid(...VALID_PERIODS).default('24h'),
});

// ── /analytics/events ────────────────────────────────────

const eventsQuerySchema = Joi.object({
  tenantId:  Joi.string().pattern(UUID_PATTERN).required(),
  eventType: Joi.string().max(100).optional(),
  startTime: Joi.date().iso().optional(),
  endTime:   Joi.date().iso().min(Joi.ref('startTime')).optional()
    .messages({ 'date.min': 'endTime must be after startTime' }),
  page:  Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
});

// ── /analytics/live ──────────────────────────────────────

const liveRateSchema = Joi.object({
  tenantId: Joi.string().pattern(UUID_PATTERN).required(),
});

module.exports = { timeSeriesSchema, summarySchema, eventsQuerySchema, liveRateSchema };