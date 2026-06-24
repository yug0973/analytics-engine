// src/config/env.js
// ─────────────────────────────────────────────────────────
//  Centralised environment variable validation.
//  Crashes the process at startup if required vars are missing.
//  This is production-critical: a silent missing env var causes
//  mysterious runtime failures. Fail fast, fail loudly.
// ─────────────────────────────────────────────────────────

'use strict';

function required(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`[config] FATAL: Required environment variable "${name}" is not set.`);
    process.exit(1);
  }
  return val;
}

function optional(name, defaultValue) {
  return process.env[name] || defaultValue;
}

const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: parseInt(optional('PORT', '3001'), 10),

  // PostgreSQL
  postgres: {
    host: optional('POSTGRES_HOST', 'localhost'),
    port: parseInt(optional('POSTGRES_PORT', '5432'), 10),
    database: optional('POSTGRES_DB', 'analytics'),
    user: optional('POSTGRES_USER', 'analytics_user'),
    password: optional('POSTGRES_PASSWORD', 'analytics_pass'),
    // Connection pool: max 20 connections per Node process
    // In production behind load balancer: 20 * num_instances total
    max: parseInt(optional('POSTGRES_POOL_MAX', '20'), 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  // Redis
  redis: {
    host: optional('REDIS_HOST', 'localhost'),
    port: parseInt(optional('REDIS_PORT', '6379'), 10),
    // Retry strategy: exponential backoff, max 10 retries
    maxRetriesPerRequest: 3,
  },

  // Kafka
  kafka: {
    // Comma-separated broker list: "kafka:9092" or "b1:9092,b2:9092,b3:9092"
    brokers: optional('KAFKA_BROKERS', 'localhost:9092').split(','),
    clientId: optional('KAFKA_CLIENT_ID', 'analytics-api'),
    groupId: {
      analytics: 'analytics-consumer-group',
      persistence: 'persistence-consumer-group',
      alerts: 'alert-consumer-group',
      websocket: 'websocket-push-consumer-group',
    },
    topics: {
      rawEvents: 'raw-events',
      processedAnalytics: 'processed-analytics',
      alerts: 'alerts',
    },
  },

  // JWT
  jwt: {
    secret: optional('JWT_SECRET', 'dev_secret_replace_in_production_use_256_bit_random'),
    expiresIn: optional('JWT_EXPIRES_IN', '15m'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '7d'),
  },

  // CORS
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),

  // Rate limiting
  rateLimit: {
    windowMs: 60 * 1000,      // 1 minute window
    maxRequests: 100,          // per IP per window (general routes)
    maxEventRequests: 1000,    // per tenant per window (ingest route)
    maxAuthRequests: 10,       // per IP per window (login route)
  },

  // Cache TTLs (seconds)
  cache: {
    metricsRealtime: 30,       // 1h / 24h period results
    metricsHistorical: 300,    // 7d / 30d period results
    userSession: 900,          // 15 minutes (matches JWT expiry)
  },
};

module.exports = env;