// src/services/events.service.js
// ─────────────────────────────────────────────────────────
//  Event ingestion business logic.
//  Validates the event payload and publishes to Kafka.
// ─────────────────────────────────────────────────────────

'use strict';

const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { publish, publishBatch } = require('../config/kafka');
const env = require('../config/env');
const metrics = require('../utils/metrics');

// ── Joi schemas ───────────────────────────────────────────

const eventSchema = Joi.object({
  eventType: Joi.string()
    .max(100)
    .pattern(/^[a-z_]+$/, 'snake_case')  // enforce naming convention
    .required()
    .messages({ 'string.pattern.name': 'eventType must be snake_case (e.g. page_view)' }),

  userId: Joi.string().max(255).optional(),
  sessionId: Joi.string().max(255).optional(),

  // JSONB column — any object shape is allowed, but we limit depth
  // to prevent deeply nested payloads that are expensive to index
  properties: Joi.object().max(50).optional(),

  // Optional client-side timestamp (if event happened in the past)
  // Must not be in the future, and not older than 24 hours
  timestamp: Joi.date()
    .max('now')
    .min(new Date(Date.now() - 24 * 60 * 60 * 1000))
    .optional(),
});

const batchSchema = Joi.object({
  events: Joi.array()
    .items(eventSchema)
    .min(1)
    .max(500)  // hard cap per batch request
    .required(),
});

// ── Service functions ─────────────────────────────────────

/**
 * Ingest a single event.
 * Returns the event ID immediately (processing is async via Kafka).
 */
async function ingestEvent({ eventType, userId, sessionId, properties, timestamp }, user) {
  const eventId = uuidv4();

  // Enrich the event with server-side metadata
  const enrichedEvent = {
    id: eventId,
    tenantId: user.tenantId || user.id, // tenantId from JWT, fallback to userId
    eventType,
    userId: userId || null,
    sessionId: sessionId || null,
    properties: properties || {},
    timestamp: timestamp || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    // Include metadata for debugging consumer issues
    _meta: {
      apiUserId: user.id,
      apiUserRole: user.role,
    },
  };

  // Partition key = tenantId — all events for one tenant go to the
  // same partition, guaranteeing per-tenant ordering
  await publish(
    env.kafka.topics.rawEvents,
    enrichedEvent.tenantId,
    enrichedEvent
  );

  // Increment Prometheus counter
  metrics.eventsIngested.inc({
    tenant_id: enrichedEvent.tenantId,
    event_type: eventType,
  });
  metrics.kafkaPublished.inc({ topic: env.kafka.topics.rawEvents });

  return { eventId, accepted: true };
}

/**
 * Ingest a batch of events.
 * Validates all events, publishes as a single Kafka batch.
 * Returns counts of accepted/rejected events.
 */
async function ingestBatch({ events }, user) {
  const tenantId = user.tenantId || user.id;

  const enrichedEvents = events.map(event => ({
    id: uuidv4(),
    tenantId,
    eventType: event.eventType,
    userId: event.userId || null,
    sessionId: event.sessionId || null,
    properties: event.properties || {},
    timestamp: event.timestamp || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    _meta: { apiUserId: user.id },
  }));

  // publishBatch sends all messages in one Kafka request — much
  // more efficient than N individual publish() calls
  await publishBatch(
    env.kafka.topics.rawEvents,
    enrichedEvents.map(event => ({
      key: event.tenantId,
      value: event,
    }))
  );

  // Bulk-increment Prometheus counter
  enrichedEvents.forEach(e => {
    metrics.eventsIngested.inc({ tenant_id: tenantId, event_type: e.eventType });
  });
  metrics.kafkaPublished.inc({ topic: env.kafka.topics.rawEvents });

  return {
    accepted: enrichedEvents.length,
    rejected: 0,
  };
}

module.exports = { ingestEvent, ingestBatch, eventSchema, batchSchema };