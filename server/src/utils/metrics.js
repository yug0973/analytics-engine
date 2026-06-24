// src/utils/metrics.js
// ─────────────────────────────────────────────────────────
//  Prometheus metrics via prom-client.
//
//  Prometheus follows a pull model: your app exposes /metrics,
//  the Prometheus server scrapes it every 15s.
//
//  Metric types used here:
//  - Counter:   monotonically increasing (total events, total errors)
//  - Gauge:     can go up or down (active WS connections, cache size)
//  - Histogram: distribution of values (request latency buckets)
// ─────────────────────────────────────────────────────────

'use strict';

const client = require('prom-client');

// Collect default Node.js metrics (heap usage, event loop lag, GC, etc.)
client.collectDefaultMetrics({ prefix: 'analytics_' });

// ── Custom application metrics ────────────────────────────

/**
 * Total events ingested via the HTTP API.
 * Labels: tenant_id, event_type
 *
 * Usage in code:
 *   metrics.eventsIngested.inc({ tenant_id: 'abc', event_type: 'page_view' });
 */
const eventsIngested = new client.Counter({
  name: 'analytics_events_ingested_total',
  help: 'Total number of events received by the ingest endpoint',
  labelNames: ['tenant_id', 'event_type'],
});

/**
 * Total Kafka messages published (per topic).
 */
const kafkaPublished = new client.Counter({
  name: 'analytics_kafka_published_total',
  help: 'Total Kafka messages published',
  labelNames: ['topic'],
});

/**
 * Total Kafka messages consumed (per topic, per consumer group).
 */
const kafkaConsumed = new client.Counter({
  name: 'analytics_kafka_consumed_total',
  help: 'Total Kafka messages consumed',
  labelNames: ['topic', 'consumer_group'],
});

/**
 * Current active WebSocket connections.
 */
const wsConnections = new client.Gauge({
  name: 'analytics_websocket_connections_active',
  help: 'Number of active WebSocket connections',
});

/**
 * Redis cache hits vs misses.
 * Derive hit rate: hits / (hits + misses)
 */
const cacheHits = new client.Counter({
  name: 'analytics_cache_hits_total',
  help: 'Total Redis cache hits',
  labelNames: ['key_pattern'],
});

const cacheMisses = new client.Counter({
  name: 'analytics_cache_misses_total',
  help: 'Total Redis cache misses',
  labelNames: ['key_pattern'],
});

/**
 * HTTP request duration histogram.
 * Buckets chosen to match P50/P95/P99 latency goals.
 * Labels: method, route, status_code
 */
const httpDuration = new client.Histogram({
  name: 'analytics_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

/**
 * Alert rules evaluated per second.
 */
const alertsEvaluated = new client.Counter({
  name: 'analytics_alerts_evaluated_total',
  help: 'Total alert rule evaluations',
  labelNames: ['triggered'],
});

module.exports = {
  register: client.register,
  eventsIngested,
  kafkaPublished,
  kafkaConsumed,
  wsConnections,
  cacheHits,
  cacheMisses,
  httpDuration,
  alertsEvaluated,
};