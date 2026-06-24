// server/src/validators/auth.validators.js
// ─────────────────────────────────────────────────────────
//  Joi validation schemas for all auth endpoints.
//
//  Why validate at this layer and not in the controller?
//  The controller's job is to orchestrate: call the service,
//  handle the response, send the reply. If it also validates
//  input, it has two reasons to change (new business rule OR
//  new validation rule) — that violates single responsibility.
//  The validate() middleware runs these schemas BEFORE the
//  controller is ever called, so the controller can trust that
//  req.body is exactly the shape it expects.
//
//  Why Joi specifically?
//  Joi gives you a schema object you can inspect, compose, and
//  reuse. The alternative (manual if-checks in the controller)
//  doesn't scale past 3 fields and produces inconsistent error
//  messages. Zod is a valid modern alternative if you prefer
//  TypeScript-first — same concept, different API.
// ─────────────────────────────────────────────────────────

'use strict';

const Joi = require('joi');

// ─── Reusable field definitions ───────────────────────────────────────────────
//
// Defined once here so register and login share the exact same
// email/password rules. If the password policy changes, it changes
// in one place.

const emailField = Joi
  .string()
  .email({ tlds: { allow: false } }) // don't validate TLDs — .dev, .io etc. are valid
  .max(255)
  .lowercase()   // normalise to lowercase before it reaches the DB
  .trim()
  .required()
  .messages({
    'string.email':    'Must be a valid email address',
    'string.max':      'Email must not exceed 255 characters',
    'any.required':    'Email is required',
  });

const passwordField = Joi
  .string()
  .min(8)
  .max(72)       // bcrypt silently truncates at 72 bytes — enforce the limit explicitly
  .pattern(/[A-Z]/, 'uppercase')
  .pattern(/[a-z]/, 'lowercase')
  .pattern(/[0-9]/, 'digit')
  .required()
  .messages({
    'string.min':          'Password must be at least 8 characters',
    'string.max':          'Password must not exceed 72 characters',
    'string.pattern.name': 'Password must contain at least one {#name} character',
    'any.required':        'Password is required',
  });

// ─── Schemas ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/register
 *
 * allowUnknown: false (default) — any extra field in the body
 * is rejected with a 400. This prevents parameter pollution
 * where a client sneaks in a `role: 'admin'` field hoping it
 * gets written to the DB.
 *
 * stripUnknown is NOT used here — we want to be strict and
 * reject unknown keys rather than silently drop them, so
 * the caller knows exactly what shape is expected.
 */
const registerSchema = Joi.object({
  email:    emailField,
  password: passwordField,
  name: Joi
    .string()
    .min(1)
    .max(100)
    .trim()
    .optional()
    .messages({
      'string.min': 'Name must not be empty',
      'string.max': 'Name must not exceed 100 characters',
    }),
}).options({ allowUnknown: false });

/**
 * POST /api/v1/auth/login
 *
 * Password validation is intentionally LOOSER than register.
 * Login does NOT enforce the complexity rules — if a user
 * registered before password rules were tightened, they must
 * still be able to log in. The complexity rules only apply
 * at the point of creation.
 */
const loginSchema = Joi.object({
  email: emailField,
  password: Joi
    .string()
    .min(1)
    .max(72)
    .required()
    .messages({
      'string.min':   'Password is required',
      'any.required': 'Password is required',
    }),
}).options({ allowUnknown: false });

/**
 * POST /api/v1/auth/refresh
 *
 * Only needs the refresh token string.
 * Access token is NOT sent here — the whole point of this
 * endpoint is that the access token has already expired.
 */
const refreshSchema = Joi.object({
  refreshToken: Joi
    .string()
    .trim()
    .required()
    .messages({
      'any.required': 'Refresh token is required',
      'string.empty': 'Refresh token must not be empty',
    }),
}).options({ allowUnknown: false });

module.exports = { registerSchema, loginSchema, refreshSchema };