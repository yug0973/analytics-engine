// src/middleware/authenticate.js
// ─────────────────────────────────────────────────────────
//  JWT authentication middleware.
//
//  Flow:
//  1. Extract token from Authorization header (Bearer scheme)
//  2. Verify signature using JWT_SECRET
//  3. Check deny-list in Redis (handles logout revocation)
//  4. Attach decoded user payload to req.user
//  5. Call next() — route handler runs
//
//  On any failure: return 401 immediately, never call next().
// ─────────────────────────────────────────────────────────

'use strict';

const jwt = require('jsonwebtoken');
const { redisClient } = require('../config/redis');
const env = require('../config/env');
const logger = require('../utils/logger');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Provide a Bearer token.',
      });
    }

    const token = authHeader.slice(7); // Remove "Bearer "
    req.token = token;                 // Attach raw token for logout deny-list revocation

    // Verify signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(token, env.jwt.secret);
    } catch (err) {
      const message = err.name === 'TokenExpiredError'
        ? 'Token has expired. Please log in again.'
        : 'Invalid token.';
      return res.status(401).json({ success: false, error: message });
    }

    // Check deny-list: was this token explicitly revoked (logout)?
    // Key format: jwt:denied:<jti>
    // jti (JWT ID) is a unique claim we set when issuing tokens.
    if (decoded.jti) {
      const isDenied = await redisClient.get(`jwt:denied:${decoded.jti}`);
      if (isDenied) {
        return res.status(401).json({
          success: false,
          error: 'Token has been revoked. Please log in again.',
        });
      }
    }

    // Attach user context to request — available in all subsequent middleware/controllers
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      tenantId: decoded.tenantId,
      jti: decoded.jti,
    };

    next();
  } catch (err) {
    logger.error({ err, requestId: req.requestId }, '[authenticate] Unexpected error');
    res.status(500).json({ success: false, error: 'Authentication service error.' });
  }
}

module.exports = authenticate;