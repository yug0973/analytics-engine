// src/middleware/rateLimiter.js
// ─────────────────────────────────────────────────────────
//  Redis-backed rate limiter using sliding window counters.
//
//  Why Redis and not express-rate-limit's memory store?
//  Memory store is per-process — if you have 3 Node instances
//  behind a load balancer, each has its own counter. A client
//  can hit 3x the limit by round-robining across instances.
//  Redis is shared across all instances — accurate regardless
//  of horizontal scale.
//
//  Algorithm: fixed window (1 minute).
//  Key: ratelimit:<identifier>:<window_start_unix_minute>
//  On each request: INCR the key, set EXPIRE on first increment.
//  If count > limit: return 429.
//
//  This is intentionally simple. For production, consider a
//  sliding window (using Redis sorted sets) to prevent the
//  boundary-spike problem.
// ─────────────────────────────────────────────────────────

'use strict';

const { redisClient } = require('../config/redis');

/**
 * Creates a rate limiter middleware.
 *
 * @param {object} options
 * @param {number} options.max         - Max requests per window
 * @param {number} options.windowMs    - Window size in milliseconds
 * @param {Function} options.keyFn     - Returns the rate limit key for a request
 *                                       Default: IP address
 */
function createRateLimiter({ max = 100, windowMs = 60000, keyFn } = {}) {
  const windowSecs = Math.floor(windowMs / 1000);

  return async (req, res, next) => {
    const identifier = keyFn ? keyFn(req) : (req.ip || 'unknown');
    const windowKey = Math.floor(Date.now() / windowMs);
    const redisKey = `ratelimit:${identifier}:${windowKey}`;

    try {
      // INCR is atomic — safe under concurrent requests
      const count = await redisClient.incr(redisKey);

      // Set expiry only on first increment (count === 1)
      // If we set it every time, the window resets on each request
      if (count === 1) {
        await redisClient.expire(redisKey, windowSecs + 1);
      }

      // Set rate limit info headers (standard, used by API clients)
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));

      if (count > max) {
        res.setHeader('Retry-After', windowSecs);
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please slow down.',
          retryAfterSeconds: windowSecs,
        });
      }

      next();
    } catch (err) {
      // If Redis is down, fail open (allow the request)
      // Failing closed would take down your API when Redis hiccups
      // In production you'd alert on this metric
      next();
    }
  };
}

// Pre-configured limiters for different route sensitivities

// General API routes: 100 req/min per IP
const generalLimiter = createRateLimiter({ max: 100, windowMs: 60000 });

// Auth routes: 10 req/min per IP (brute-force protection)
const authLimiter = createRateLimiter({
  max: 10,
  windowMs: 60000,
  keyFn: (req) => `auth:${req.ip}`,
});

// Event ingest: 1000 req/min per tenant (high-volume SDK usage)
const ingestLimiter = createRateLimiter({
  max: 1000,
  windowMs: 60000,
  keyFn: (req) => `ingest:${req.user?.tenantId || req.ip}`,
});

module.exports = { generalLimiter, authLimiter, ingestLimiter, createRateLimiter };