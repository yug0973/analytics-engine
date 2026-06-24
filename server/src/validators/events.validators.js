// server/src/validators/events.validators.js
// ─────────────────────────────────────────────────────────
//  Joi validation schemas for event ingest endpoints.
//
//  POST /api/v1/events          → single event
//  POST /api/v1/events/batch    → array of events (up to 100)
//
//  Why strict validation matters especially here:
//  These are the highest-throughput endpoints in the system.
//  Malformed events that pass validation and reach Kafka are
//  expensive to deal with — consumers fail, dead-letter queues
//  fill up, analytics are corrupted. Reject bad data at the
//  edge, before it touches any infrastructure.
// ─────────────────────────────────────────────────────────

'use strict';

const Joi = require('joi');

// ─── Reusable field definitions ───────────────────────────────────────────────

/**
 * event_type: the primary dimension events are grouped by.
 * Restricted to a known enum — free-form strings would make
 * analytics aggregations meaningless and pollute the DB.
 *
 * Extend this list as your product grows. When you do, add a
 * migration to update the CHECK constraint in 002_events.sql
 * to match.
 */
const eventTypeField = Joi
  .string()
  .valid(
    'page_view',
    'click',
    'form_submit',
    'api_call',
    'error',
    'purchase',
    'signup',
    'login',
    'logout',
    'custom'
  )
  .required()
  .messages({
    'any.only':     'event_type must be one of the allowed values',
    'any.required': 'event_type is required',
  });

/**
 * properties: arbitrary key-value metadata attached to an event.
 * Max 50 keys, each value a primitive — no nested objects.
 *
 * Why limit nesting? Deeply nested JSON stored in Postgres JSONB
 * is queryable but slow to index. Flat properties are fast to
 * filter and aggregate. If consumers need nested data, they
 * can reconstruct it from multiple flat events.
 */
const propertiesField = Joi
  .object()
  .max(50)
  .pattern(
    Joi.string().max(64),   // key constraint
    Joi.alternatives().try( // value constraint: primitives only
      Joi.string().max(512),
      Joi.number(),
      Joi.boolean(),
      Joi.valid(null)
    )
  )
  .optional()
  .default({})
  .messages({
    'object.max': 'properties must not exceed 50 keys',
  });

/**
 * session_id: ties multiple events to a single user session.
 * Optional — not all event types have a meaningful session context
 * (e.g. background API calls).
 */
const sessionIdField = Joi
  .string()
  .uuid({ version: 'uuidv4' })
  .optional()
  .allow(null)
  .messages({
    'string.guid': 'session_id must be a valid UUID v4',
  });

/**
 * timestamp: client-supplied event time.
 * Optional — if omitted, the server sets it in events.service.js.
 *
 * Why allow client timestamps at all? Mobile clients can buffer
 * events offline and send them later. Server time would record
 * when the event was received, not when it happened — useless
 * for accurate analytics.
 *
 * Constraint: must not be more than 24h in the past or 1 minute
 * in the future (clock skew tolerance). Events older than 24h
 * are likely bugs or replays, not legitimate offline buffering.
 */
const timestampField = Joi
  .date()
  .iso()
  .max(new Date(Date.now() + 60 * 1000))           // max: 1 minute in the future
  .min(new Date(Date.now() - 24 * 60 * 60 * 1000)) // min: 24 hours ago
  .optional()
  .allow(null)
  .messages({
    'date.base':  'timestamp must be a valid ISO 8601 date string',
    'date.max':   'timestamp must not be in the future',
    'date.min':   'timestamp must not be older than 24 hours',
  });

// ─── Schemas ──────────────────────────────────────────────────────────────────

/**
 * Single event schema.
 * Used by: POST /api/v1/events
 *
 * tenant_id is NOT accepted from the body — it is read from
 * req.user.tenantId (set by authenticate.js). A client must
 * never be able to post events to another tenant's namespace.
 */
const eventSchema = Joi.object({
  event_type:  eventTypeField,
  session_id:  sessionIdField,
  properties:  propertiesField,
  timestamp:   timestampField,
}).options({ allowUnknown: false });

/**
 * Batch event schema.
 * Used by: POST /api/v1/events/batch
 *
 * Array of 1–100 events. Each item is validated against
 * eventSchema. The outer object wrapper (rather than a bare
 * array) is intentional — it leaves room to add batch-level
 * metadata (e.g. source, batch_id) without a breaking change.
 */
const batchEventSchema = Joi.object({
  events: Joi
    .array()
    .items(eventSchema)
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.min':     'events array must contain at least 1 event',
      'array.max':     'events array must not exceed 100 events per batch',
      'any.required':  'events array is required',
    }),
}).options({ allowUnknown: false });

module.exports = { eventSchema, batchEventSchema };