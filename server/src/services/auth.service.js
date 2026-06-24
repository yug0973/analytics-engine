// src/services/auth.service.js
// ─────────────────────────────────────────────────────────
//  Authentication business logic.
//  Controllers call these functions — no HTTP knowledge here.
// ─────────────────────────────────────────────────────────

'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { redisClient } = require('../config/redis');
const env = require('../config/env');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

// bcrypt cost factor = 12
// Higher = slower (more CPU) = harder to brute-force.
// 12 takes ~300ms on a modern CPU — acceptable for a login,
// not acceptable for a per-request operation.
const BCRYPT_ROUNDS = 12;

/**
 * Register a new user.
 * Returns the created user (without password_hash).
 */
async function register({ email, password, role = 'viewer' }) {
  // Check uniqueness before hashing (fast path)
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    throw new AppError('An account with this email already exists.', 409);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const result = await query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING id, email, role, created_at`,
    [email.toLowerCase().trim(), passwordHash, role]
  );

  return result.rows[0];
}

/**
 * Verify email/password and issue a JWT.
 */
async function login({ email, password }) {
  const result = await query(
    'SELECT id, email, password_hash, role, is_active FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  const user = result.rows[0];

  // IMPORTANT: always run bcrypt.compare even if user doesn't exist.
  // This prevents timing attacks where an attacker can tell from
  // response time whether an email is registered.
  const dummyHash = '$2a$12$invalidhashfortimingnormalization00000000000000000000000';
  const valid = user
    ? await bcrypt.compare(password, user.password_hash)
    : await bcrypt.compare(password, dummyHash);

  if (!user || !valid) {
    throw new AppError('Invalid email or password.', 401);
  }

  if (!user.is_active) {
    throw new AppError('This account has been deactivated.', 403);
  }

  const token = issueToken(user);
  const refreshToken = issueRefreshToken(user);
  return { token, refreshToken, user: { id: user.id, email: user.email, role: user.role } };
}

/**
 * Revoke a JWT by adding its JTI to the Redis deny-list.
 * TTL = remaining token lifetime (so the key auto-expires).
 */
async function logout(jti, expiresAt) {
  if (!jti) return; // token without jti claim — nothing to do

  const remainingSeconds = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  if (remainingSeconds > 0) {
    await redisClient.setex(`jwt:denied:${jti}`, remainingSeconds, '1');
  }
}

/**
 * Issue a signed JWT.
 * jti = unique token ID used for the deny-list.
 * sub = user ID (standard JWT claim for the subject).
 */
function issueToken(user) {
  const jti = uuidv4();
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    jti,
  };

  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
    issuer: 'analytics-engine',
  });
}

/**
 * Issue a long-lived refresh token.
 *
 * Carries only sub (user id) and a unique jti.
 * Role and email are intentionally excluded — on refresh we do a
 * fresh DB lookup so the new access token always has up-to-date claims.
 *
 * Signed with a separate secret (base secret + ':refresh') so a
 * compromised access token secret does not also compromise refresh tokens.
 */
function issueRefreshToken(user) {
  const payload = {
    sub: user.id,
    jti: uuidv4(),
  };

  return jwt.sign(payload, env.jwt.secret + ':refresh', {
    expiresIn: env.jwt.refreshExpiresIn, // '7d'
    issuer: 'analytics-engine',
  });
}

/**
 * Verify a refresh token and issue a new access token.
 * Performs a fresh DB lookup so role changes take effect immediately.
 *
 * @param {{ refreshToken: string }} params
 * @returns {{ token: string }}
 */
async function refresh({ refreshToken }) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.jwt.secret + ':refresh', {
      issuer: 'analytics-engine',
    });
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Refresh token has expired. Please log in again.'
      : 'Invalid refresh token.';
    throw new AppError(message, 401);
  }

  // Fresh DB lookup — never re-use stale claims from the token payload
  const result = await query(
    'SELECT id, email, role, is_active FROM users WHERE id = $1',
    [decoded.sub]
  );

  const user = result.rows[0];

  if (!user) {
    throw new AppError('User not found.', 401);
  }

  if (!user.is_active) {
    throw new AppError('This account has been deactivated.', 403);
  }

  const token = issueToken(user);

  logger.info({ userId: user.id }, '[auth] Access token refreshed');

  return { token };
}

module.exports = { register, login, logout, refresh };