// server/src/controllers/alerts.controller.js
// ─────────────────────────────────────────────────────────
//  HTTP handlers for alert rules and alert events.
//  Validation is done upstream by validate.js middleware.
// ─────────────────────────────────────────────────────────

'use strict';

const alertsService = require('../services/alerts.service');
const logger = require('../utils/logger');

/**
 * POST /api/v1/alerts/rules
 * Create a new alert rule.
 */
async function createRule(req, res, next) {
  try {
    const tenantId = req.user.tenantId || req.user.id;
    const rule = await alertsService.createRule(
      { ...req.body, tenantId },
      req.user.id
    );
    return res.status(201).json({ success: true, data: rule });
  } catch (err) {
    logger.error({ err, reqId: req.id }, '[alertsController] createRule failed');
    next(err);
  }
}

/**
 * GET /api/v1/alerts/rules
 * List all alert rules for the authenticated tenant.
 */
async function listRules(req, res, next) {
  try {
    const tenantId = req.user.tenantId || req.user.id;
    const rules = await alertsService.listRules(tenantId);
    return res.status(200).json({ success: true, data: rules });
  } catch (err) {
    logger.error({ err, reqId: req.id }, '[alertsController] listRules failed');
    next(err);
  }
}

/**
 * GET /api/v1/alerts/rules/:ruleId
 * Get a single alert rule.
 */
async function getRule(req, res, next) {
  try {
    const tenantId = req.user.tenantId || req.user.id;
    const rule = await alertsService.getRule(req.params.ruleId, tenantId);
    if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
    return res.status(200).json({ success: true, data: rule });
  } catch (err) {
    logger.error({ err, reqId: req.id }, '[alertsController] getRule failed');
    next(err);
  }
}

/**
 * PATCH /api/v1/alerts/rules/:ruleId
 * Update an alert rule.
 */
async function updateRule(req, res, next) {
  try {
    const tenantId = req.user.tenantId || req.user.id;
    const rule = await alertsService.updateRule(req.params.ruleId, tenantId, req.body);
    if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
    return res.status(200).json({ success: true, data: rule });
  } catch (err) {
    logger.error({ err, reqId: req.id }, '[alertsController] updateRule failed');
    next(err);
  }
}

/**
 * DELETE /api/v1/alerts/rules/:ruleId
 * Delete an alert rule.
 */
async function deleteRule(req, res, next) {
  try {
    const tenantId = req.user.tenantId || req.user.id;
    const deleted = await alertsService.deleteRule(req.params.ruleId, tenantId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Rule not found' });
    return res.status(200).json({ success: true, message: 'Rule deleted' });
  } catch (err) {
    logger.error({ err, reqId: req.id }, '[alertsController] deleteRule failed');
    next(err);
  }
}

/**
 * GET /api/v1/alerts/events
 * List recent alert events for the authenticated tenant.
 */
async function listAlertEvents(req, res, next) {
  try {
    const tenantId = req.user.tenantId || req.user.id;
    const limit = parseInt(req.query.limit, 10) || 50;
    const events = await alertsService.listAlertEvents(tenantId, limit);
    return res.status(200).json({ success: true, data: events });
  } catch (err) {
    logger.error({ err, reqId: req.id }, '[alertsController] listAlertEvents failed');
    next(err);
  }
}

module.exports = {
  createRule,
  listRules,
  getRule,
  updateRule,
  deleteRule,
  listAlertEvents,
};