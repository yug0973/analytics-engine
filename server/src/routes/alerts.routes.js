// server/src/routes/alerts.routes.js
// ─────────────────────────────────────────────────────────
//  Alert rule and alert event route definitions.
//
//  All routes require authentication.
//  Rule mutation routes (POST, PATCH, DELETE) require
//  role 'admin' or 'analyst' — viewers can only read.
//
//  Routes:
//    POST   /api/v1/alerts/rules           → create rule
//    GET    /api/v1/alerts/rules           → list rules
//    GET    /api/v1/alerts/rules/:ruleId   → get rule
//    PATCH  /api/v1/alerts/rules/:ruleId   → update rule
//    DELETE /api/v1/alerts/rules/:ruleId   → delete rule
//    GET    /api/v1/alerts/events          → list alert events
// ─────────────────────────────────────────────────────────

'use strict';

const { Router } = require('express');
const Joi = require('joi');
const alertsController = require('../controllers/alerts.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');

const router = Router();

// ── Joi schemas ───────────────────────────────────────────

const createRuleSchema = Joi.object({
  name: Joi.string().max(255).required(),
  metricName: Joi.string()
    .valid('events_per_minute', 'error_rate', 'unique_users')
    .required(),
  operator: Joi.string()
    .valid('gt', 'lt', 'gte', 'lte', 'eq')
    .required(),
  threshold: Joi.number().required(),
  windowSecs: Joi.number().integer().min(60).max(86400).default(300),
  cooldownSecs: Joi.number().integer().min(60).max(86400).default(600),
});

const updateRuleSchema = Joi.object({
  name: Joi.string().max(255),
  metricName: Joi.string().valid('events_per_minute', 'error_rate', 'unique_users'),
  operator: Joi.string().valid('gt', 'lt', 'gte', 'lte', 'eq'),
  threshold: Joi.number(),
  windowSecs: Joi.number().integer().min(60).max(86400),
  cooldownSecs: Joi.number().integer().min(60).max(86400),
  isActive: Joi.boolean(),
}).min(1); // at least one field required for a PATCH

// ── Routes ────────────────────────────────────────────────

// All alerts routes require a valid JWT
router.use(authenticate);

// Create rule — admin/analyst only
router.post(
  '/rules',
  authorize('admin', 'analyst'),
  validate({ body: createRuleSchema }),
  alertsController.createRule
);

// List rules — any authenticated user
router.get(
  '/rules',
  alertsController.listRules
);

// Get single rule — any authenticated user
router.get(
  '/rules/:ruleId',
  alertsController.getRule
);

// Update rule — admin/analyst only
router.patch(
  '/rules/:ruleId',
  authorize('admin', 'analyst'),
  validate({ body: updateRuleSchema }),
  alertsController.updateRule
);

// Delete rule — admin only
router.delete(
  '/rules/:ruleId',
  authorize('admin'),
  alertsController.deleteRule
);

// List alert events — any authenticated user
router.get(
  '/events',
  alertsController.listAlertEvents
);

module.exports = router;