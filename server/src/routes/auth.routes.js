// server/src/routes/auth.routes.js
// ─────────────────────────────────────────────────────────
//  Auth route definitions.
//
//  This file's only job is to declare WHAT endpoints exist
//  and WHICH middleware chain runs for each one.
//  It contains zero business logic — that lives in the
//  controller. Zero database calls — those live in the service.
//
//  Middleware chain per route (left to right = order of execution):
//
//  POST /register   → rateLimiter(auth) → validate({ body: schema }) → controller
//  POST /login      → rateLimiter(auth) → validate({ body: schema }) → controller
//  POST /logout     → authenticate → controller
//  POST /refresh    → validate({ body: schema }) → controller
//  GET  /me         → authenticate → controller
// ─────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
} = require('../validators/auth.validators');

const router = Router();

/**
 * POST /api/v1/auth/register
 *
 * Public. Rate-limited to env.rateLimit.maxAuthRequests per window.
 * Creates a new user account with role 'viewer' by default.
 *
 * Body: { email, password, name }
 * Response 201: { success: true, data: { user, accessToken, refreshToken } }
 */
router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  authController.register
);

/**
 * POST /api/v1/auth/login
 *
 * Public. Rate-limited (same limiter as register — brute-force protection).
 *
 * Body: { email, password }
 * Response 200: { success: true, data: { user, accessToken, refreshToken } }
 */
router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  authController.login
);

/**
 * POST /api/v1/auth/logout
 *
 * Protected. Requires a valid access token.
 * Adds the token's jti to the Redis deny-list (instant revocation).
 *
 * Body: {} (empty — token is read from Authorization header)
 * Response 200: { success: true, message: 'Logged out' }
 */
router.post(
  '/logout',
  authenticate,
  authController.logout
);

/**
 * POST /api/v1/auth/refresh
 *
 * Public (no access token needed — that's the point).
 * Validates the refresh token, issues a new access token.
 *
 * Body: { refreshToken }
 * Response 200: { success: true, data: { accessToken } }
 */
router.post(
  '/refresh',
  validate({ body: refreshSchema }),
  authController.refresh
);

/**
 * GET /api/v1/auth/me
 *
 * Protected. Returns the authenticated user's profile.
 * Useful for the frontend to rehydrate user state on page load.
 *
 * Response 200: { success: true, data: { user } }
 */
router.get(
  '/me',
  authenticate,
  authController.me
);

module.exports = router;