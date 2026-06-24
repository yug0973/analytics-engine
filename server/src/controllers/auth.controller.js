// server/src/controllers/auth.controller.js
// ─────────────────────────────────────────────────────────
//  Auth controller.
//
//  Responsibility: handle HTTP request/response only.
//  - Read from req.body / req.user
//  - Call auth.service.js
//  - Send the response
//
//  What does NOT belong here:
//  - Password hashing       → auth.service.js
//  - JWT signing/verifying  → auth.service.js
//  - Database queries       → auth.service.js
//  - Redis deny-list writes → auth.service.js
//
//  If a method here is longer than ~25 lines, business logic
//  has leaked into the controller. Move it to the service.
// ─────────────────────────────────────────────────────────

'use strict';

const authService = require('../services/auth.service');
const logger = require('../utils/logger');

// ─── Register ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/register
 * Body (validated): { email, password, name? }
 */
async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;

    const result = await authService.register({ email, password, name });

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    // Pass to global errorHandler — it maps known error types to status codes
    next(err);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/login
 * Body (validated): { email, password }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const result = await authService.login({ email, password });

    logger.info({ reqId: req.id, userId: result.user.id }, 'User logged in');

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/logout
 * Protected: authenticate middleware attaches req.user and req.token
 *
 * req.user  → { id, email, role }   (decoded JWT payload)
 * req.token → raw JWT string        (needed to extract jti for deny-list)
 */
async function logout(req, res, next) {
  try {
    const jwt = require('jsonwebtoken');
    const { jti } = req.user;
    const decoded = jwt.decode(req.token);        // already verified by authenticate.js
    const expiresAt = decoded ? decoded.exp : 0;

    await authService.logout(jti, expiresAt);     // positional: logout(jti, expiresAt)

    logger.info({ reqId: req.id, userId: req.user.id }, 'User logged out');

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (err) {
    next(err);
  }
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/refresh
 * Body (validated): { refreshToken }
 *
 * Issues a new accessToken without requiring re-login.
 * Does NOT rotate the refresh token (stateless design).
 * If you want refresh token rotation, that logic goes in the service.
 */
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;

    const result = await authService.refresh({ refreshToken });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Me ───────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/auth/me
 * Protected: authenticate middleware attaches req.user
 *
 * Does NOT call the service or hit the DB.
 * req.user is already the decoded, verified token payload —
 * that's sufficient for a "who am I" response.
 * If you need fresh DB data (e.g. updated role), call
 * authService.getUserById(req.user.id) here instead.
 */
async function me(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
}

module.exports = { register, login, logout, refresh, me };