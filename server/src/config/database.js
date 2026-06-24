// src/config/database.js
// ─────────────────────────────────────────────────────────
//  PostgreSQL connection pool via node-postgres (pg).
//
//  Why a pool and not a single connection?
//  Each query occupies a connection for its duration. A pool
//  keeps N connections open and queues queries when all are
//  busy. Without a pool, each request opens a new TCP
//  connection to Postgres — ~50ms overhead every time.
// ─────────────────────────────────────────────────────────

'use strict';

const { Pool } = require('pg');
const env = require('./env');
const logger = require('../utils/logger');

const pool = new Pool({
  host: env.postgres.host,
  port: env.postgres.port,
  database: env.postgres.database,
  user: env.postgres.user,
  password: env.postgres.password,
  max: env.postgres.max,
  idleTimeoutMillis: env.postgres.idleTimeoutMillis,
  connectionTimeoutMillis: env.postgres.connectionTimeoutMillis,
});

// Log every query in development for debugging
// Remove or gate behind a flag in production (performance + noise)
if (env.NODE_ENV === 'development') {
  pool.on('connect', () => {
    logger.debug('[postgres] New client connected from pool');
  });
}

pool.on('error', (err) => {
  // This fires when an idle client encounters an unexpected error.
  // We log it but don't crash — the pool will discard the bad client
  // and open a fresh one. If the entire Postgres server is down,
  // queries will fail at the query level with proper error propagation.
  logger.error({ err }, '[postgres] Idle client error');
});

/**
 * Execute a single query with a client from the pool.
 * Use this for simple reads/writes.
 *
 * @param {string} text  - Parameterised SQL (never interpolate user input)
 * @param {Array}  params - Query parameters, matched to $1, $2, ...
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);

  if (env.NODE_ENV === 'development') {
    logger.debug({
      query: text.substring(0, 80),
      durationMs: Date.now() - start,
      rows: result.rowCount,
    }, '[postgres] query executed');
  }

  return result;
}

/**
 * Check out a client for a multi-statement transaction.
 * ALWAYS release the client in a finally block.
 *
 * Usage:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     await client.query('INSERT ...');
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
async function getClient() {
  return pool.connect();
}

/**
 * Health check: verifies Postgres is reachable.
 * Used by GET /health.
 */
async function healthCheck() {
  try {
    await pool.query('SELECT 1');
    return 'ok';
  } catch {
    return 'error';
  }
}

module.exports = { query, getClient, healthCheck, pool };