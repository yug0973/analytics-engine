// server/src/middleware/authorize.js
// ─────────────────────────────────────────────────────────
//  RBAC role-check middleware.
//
//  Responsibility split (important for interviews):
//  - authenticate.js  → WHO are you?  (verifies JWT, attaches req.user)
//  - authorize.js     → WHAT can you do? (checks req.user.role against
//                        the roles allowed for this route)
//
//  Usage:
//    router.delete('/users/:id',
//      authenticate,
//      authorize('admin'),        // single role
//      controller.deleteUser
//    );
//
//    router.get('/analytics',
//      authenticate,
//      authorize('admin', 'viewer'),  // multiple allowed roles
//      controller.getMetrics
//    );
//
//  Why a factory function and not a flat middleware?
//  Each route needs a different set of allowed roles. A factory
//  (a function that returns middleware) lets you pass those roles
//  at route-definition time and closes over them — clean, no
//  global state, fully testable in isolation.
// ─────────────────────────────────────────────────────────

'use strict';

const logger = require('../utils/logger');

/**
 * authorize(...allowedRoles) → Express middleware
 *
 * Must be placed AFTER authenticate in the middleware chain.
 * authenticate guarantees req.user exists before this runs.
 *
 * @param  {...string} allowedRoles - One or more roles permitted ('admin', 'viewer', 'api_client')
 * @returns {Function} Express middleware (req, res, next)
 */
function authorize(...allowedRoles) {
  if (allowedRoles.length === 0) {
    // Fail loud at startup/route-definition time, not silently at runtime
    throw new Error('authorize() requires at least one role argument');
  }

  return function checkRole(req, res, next) {
    // Guard: authenticate must have run first
    if (!req.user) {
      logger.warn({ reqId: req.id }, 'authorize called without req.user — authenticate middleware missing in chain');
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { role, id: userId } = req.user;

    if (!allowedRoles.includes(role)) {
      logger.warn(
        { reqId: req.id, userId, role, allowedRoles },
        'Authorisation denied — insufficient role'
      );
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    logger.debug(
      { reqId: req.id, userId, role },
      'Authorisation granted'
    );

    next();
  };
}

module.exports = authorize;