// src/middleware/validate.js
// ─────────────────────────────────────────────────────────
//  Joi request validation middleware factory.
//
//  Usage:
//    router.post('/events', validate({ body: eventSchema }), handler)
//    router.get('/metrics', validate({ query: metricsQuerySchema }), handler)
//
//  Why validate at the middleware layer?
//  Controllers should receive clean, typed data — not raw strings
//  from req.body. Pushing validation into the middleware layer
//  means every controller can trust its inputs without defensive
//  null checks. It also centralises error formatting.
// ─────────────────────────────────────────────────────────

'use strict';

const Joi = require('joi');

/**
 * @param {object} schemas
 * @param {Joi.Schema} [schemas.body]   - Schema for req.body
 * @param {Joi.Schema} [schemas.query]  - Schema for req.query
 * @param {Joi.Schema} [schemas.params] - Schema for req.params
 */
function validate(schemas) {
  return (req, res, next) => {
    const errors = [];

    for (const [key, schema] of Object.entries(schemas)) {
      const { error, value } = schema.validate(req[key], {
        abortEarly: false,   // collect ALL errors, not just the first
        stripUnknown: true,  // remove fields not defined in schema
        convert: true,       // coerce types (string "42" → number 42)
      });

      if (error) {
        const details = error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message.replace(/['"]/g, ''),
        }));
        errors.push(...details);
      } else {
        // Replace req[key] with the validated (and stripped) value
        req[key] = value;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    next();
  };
}

module.exports = validate;