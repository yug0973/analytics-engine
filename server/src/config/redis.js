// src/config/redis.js
// ─────────────────────────────────────────────────────────
//  Redis client via ioredis.
//
//  We create TWO separate client instances:
//
//  1. redisClient  — general purpose (cache, rate limit, deny-list)
//  2. redisSub     — dedicated subscriber for pub/sub
//
//  Why two? Redis protocol requires that a client in SUBSCRIBE
//  mode can ONLY receive messages — it cannot issue regular
//  commands (GET, SET, etc.) on the same connection. So the
//  subscriber must be a separate client.
// ─────────────────────────────────────────────────────────

'use strict';

const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

const redisConfig = {
  host: env.redis.host,
  port: env.redis.port,
  maxRetriesPerRequest: env.redis.maxRetriesPerRequest,
  // Reconnect strategy: wait 50ms * attempt, max 2 seconds
  retryStrategy: (times) => {
    if (times > 20) {
      logger.error('[redis] Too many reconnect attempts. Giving up.');
      return null; // stop retrying
    }
    return Math.min(times * 50, 2000);
  },
  lazyConnect: true, // don't connect until first command
};

// General-purpose client
const redisClient = new Redis(redisConfig);

// Dedicated subscriber (separate TCP connection)
const redisSub = new Redis(redisConfig);

redisClient.on('connect', () => logger.info('[redis] Client connected'));
redisClient.on('error', (err) => logger.error({ err }, '[redis] Client error'));

redisSub.on('connect', () => logger.info('[redis] Subscriber connected'));
redisSub.on('error', (err) => logger.error({ err }, '[redis] Subscriber error'));

/**
 * Health check — verifies Redis is reachable.
 */
async function healthCheck() {
  try {
    await redisClient.ping();
    return 'ok';
  } catch {
    return 'error';
  }
}

/**
 * Connect both clients.
 * Called once at app startup.
 */
async function connect() {
  await redisClient.connect();
  await redisSub.connect();
}

module.exports = { redisClient, redisSub, healthCheck, connect };