// src/middleware/errorHandler.js
// ─────────────────────────────────────────────────────────
//  Global Express error handling middleware.
//
//  Express identifies error-handling middleware by its 4-argument
//  signature: (err, req, res, next). It must be registered LAST,
//  after all routes.
//
//  This catches:
//  1. Errors passed via next(err) from any middleware or route
//  2. Sync errors thrown inside route handlers (Express wraps these)
//
//  Note: async errors need explicit try/catch + next(err), OR
//  you can use express-async-errors which patches Express to
//  catch rejected promises automatically.
// ─────────────────────────────────────────────────────────

'use strict';

const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Determine status code
  // If the error object has a statusCode, use it (e.g. custom AppError class)
  // Otherwise default to 500
  const statusCode = err.statusCode || err.status || 500;
  const isOperational = err.isOperational === true; // expected business errors

  // Log every error with full context
  const logData = {
    requestId: req.requestId,
    userId: req.user?.id,
    method: req.method,
    url: req.originalUrl,
    statusCode,
    err: {
      message: err.message,
      stack: err.stack,
    },
  };

  if (statusCode >= 500) {
    logger.error(logData, '[errorHandler] Unhandled server error');
  } else {
    logger.warn(logData, '[errorHandler] Client error');
  }

  // Never expose stack traces or internal details in production
  const message = (process.env.NODE_ENV === 'production' && !isOperational)
    ? 'An internal server error occurred.'
    : err.message || 'Something went wrong.';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * Custom application error class.
 * Use this for expected business errors (e.g. "email already exists")
 * so the error handler can distinguish them from unexpected crashes.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { errorHandler, AppError };