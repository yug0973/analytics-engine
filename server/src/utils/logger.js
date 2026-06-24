// src/utils/logger.js
// ─────────────────────────────────────────────────────────
//  Structured logger using pino.
//
//  Why pino over console.log or winston?
//  Pino is the fastest Node.js logger (~5x faster than winston)
//  because it serialises to JSON synchronously on the calling
//  thread, then hands the I/O off to a worker thread (pino's
//  transport). JSON output is machine-readable — Datadog,
//  CloudWatch, and ELK can parse it without regex.
//
//  Every log line gets a timestamp and level automatically.
//  You add requestId, tenantId, etc. via child loggers.
// ─────────────────────────────────────────────────────────

'use strict';

const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',

  // In development, pretty-print for human readability
  // In production, emit raw JSON (fast, parseable by log aggregators)
  transport: env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,

  // Standard fields on every log line
  base: {
    service: 'analytics-api',
    env: env.NODE_ENV,
  },

  // Redact sensitive fields — these are replaced with '[Redacted]'
  // Critical for compliance: passwords and tokens must never appear in logs
  redact: {
    paths: ['password', 'passwordHash', 'token', 'authorization', 'cookie'],
    censor: '[Redacted]',
  },
});

module.exports = logger;