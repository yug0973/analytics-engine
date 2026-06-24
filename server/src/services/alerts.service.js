// server/src/services/alerts.service.js
// ─────────────────────────────────────────────────────────
//  Alert rules CRUD + trigger evaluation logic.
//
//  Alert rules define conditions on metrics:
//    "if error_rate > 5% over the last 5 minutes → fire"
//
//  Supported metric_name values (evaluated by alertConsumer):
//    events_per_minute  — rolling event rate for tenant
//    error_rate         — % of events with event_type = 'error'
//    unique_users       — distinct user_ids in window
//
//  Cooldown is enforced via Redis:
//    Key:  alert:cooldown:{ruleId}
//    TTL:  rule.cooldown_secs
//  If key exists → rule is in cooldown → skip triggering.
// ─────────────────────────────────────────────────────────

'use strict';

const { query } = require('../config/database');
const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');

// ── CRUD ─────────────────────────────────────────────────

/**
 * Create a new alert rule for a tenant.
 */
async function createRule({ tenantId, name, metricName, operator, threshold, windowSecs, cooldownSecs }, userId) {
  const result = await query(
    `INSERT INTO alert_rules
       (tenant_id, name, metric_name, operator, threshold, window_secs, cooldown_secs, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [tenantId, name, metricName, operator, threshold, windowSecs ?? 300, cooldownSecs ?? 600, userId]
  );
  return result.rows[0];
}

/**
 * List all active alert rules for a tenant.
 */
async function listRules(tenantId) {
  const result = await query(
    `SELECT * FROM alert_rules
     WHERE tenant_id = $1::UUID
     ORDER BY created_at DESC`,
    [tenantId]
  );
  return result.rows;
}

/**
 * Get a single rule by ID, scoped to tenant.
 */
async function getRule(ruleId, tenantId) {
  const result = await query(
    `SELECT * FROM alert_rules
     WHERE id = $1::UUID AND tenant_id = $2::UUID`,
    [ruleId, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Update a rule. Only the fields provided are changed.
 */
async function updateRule(ruleId, tenantId, updates) {
  const allowed = ['name', 'metric_name', 'operator', 'threshold', 'window_secs', 'cooldown_secs', 'is_active'];
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    // Convert camelCase to snake_case for DB columns
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (!allowed.includes(col)) continue;
    fields.push(`${col} = $${values.length + 1}`);
    values.push(value);
  }

  if (fields.length === 0) return getRule(ruleId, tenantId);

  values.push(ruleId, tenantId);
  const result = await query(
    `UPDATE alert_rules
     SET ${fields.join(', ')}
     WHERE id = $${values.length - 1}::UUID AND tenant_id = $${values.length}::UUID
     RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete a rule (hard delete — alert_events cascade).
 */
async function deleteRule(ruleId, tenantId) {
  const result = await query(
    `DELETE FROM alert_rules
     WHERE id = $1::UUID AND tenant_id = $2::UUID
     RETURNING id`,
    [ruleId, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * List recent alert events for a tenant.
 */
async function listAlertEvents(tenantId, limit = 50) {
  const result = await query(
    `SELECT ae.*, ar.name AS rule_name, ar.metric_name, ar.operator, ar.threshold
     FROM alert_events ae
     JOIN alert_rules ar ON ar.id = ae.rule_id
     WHERE ar.tenant_id = $1::UUID
     ORDER BY ae.triggered_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );
  return result.rows;
}

// ── Metric evaluation ─────────────────────────────────────

/**
 * Compute the current value of a metric for a tenant
 * over the rule's window_secs.
 *
 * Returns a number, or null if the metric is unknown.
 */
async function computeMetric(rule) {
  const { tenant_id: tenantId, metric_name: metricName, window_secs: windowSecs } = rule;
  const interval = `${windowSecs} seconds`;

  switch (metricName) {
    case 'events_per_minute': {
      const res = await query(
        `SELECT COUNT(*)::FLOAT / ($2::INTERVAL / INTERVAL '1 minute') AS value
         FROM events
         WHERE tenant_id = $1::UUID
           AND created_at >= NOW() - $2::INTERVAL`,
        [tenantId, interval]
      );
      return parseFloat(res.rows[0].value) || 0;
    }

    case 'error_rate': {
      const res = await query(
        `SELECT
           COUNT(*) FILTER (WHERE event_type = 'error')::FLOAT
           / NULLIF(COUNT(*), 0) * 100 AS value
         FROM events
         WHERE tenant_id = $1::UUID
           AND created_at >= NOW() - $2::INTERVAL`,
        [tenantId, interval]
      );
      return parseFloat(res.rows[0].value) || 0;
    }

    case 'unique_users': {
      const res = await query(
        `SELECT COUNT(DISTINCT user_id)::FLOAT AS value
         FROM events
         WHERE tenant_id = $1::UUID
           AND created_at >= NOW() - $2::INTERVAL`,
        [tenantId, interval]
      );
      return parseFloat(res.rows[0].value) || 0;
    }

    default:
      logger.warn({ metricName }, '[alerts.service] Unknown metric_name — skipping');
      return null;
  }
}

/**
 * Evaluate a threshold condition.
 */
function evaluateCondition(value, operator, threshold) {
  switch (operator) {
    case 'gt':  return value >  threshold;
    case 'lt':  return value <  threshold;
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    case 'eq':  return value === threshold;
    default:    return false;
  }
}

/**
 * Check if a rule is in cooldown.
 */
async function isInCooldown(ruleId) {
  const key = `alert:cooldown:${ruleId}`;
  const exists = await redisClient.exists(key);
  return exists === 1;
}

/**
 * Set cooldown for a rule.
 */
async function setCooldown(ruleId, cooldownSecs) {
  const key = `alert:cooldown:${ruleId}`;
  await redisClient.setex(key, cooldownSecs, '1');
}

/**
 * Record a triggered alert event in Postgres.
 */
async function recordAlertEvent(rule, value) {
  const snapshot = {
    name:        rule.name,
    metric_name: rule.metric_name,
    operator:    rule.operator,
    threshold:   rule.threshold,
    window_secs: rule.window_secs,
  };

  const result = await query(
    `INSERT INTO alert_events (rule_id, value_at_trigger, rule_snapshot)
     VALUES ($1::UUID, $2, $3)
     RETURNING *`,
    [rule.id, value, JSON.stringify(snapshot)]
  );
  return result.rows[0];
}

/**
 * Evaluate all active rules for a given tenant.
 * Called by alertConsumer on every incoming event.
 *
 * Returns array of triggered alert events (usually empty).
 */
async function evaluateRulesForTenant(tenantId) {
  const rulesResult = await query(
    `SELECT * FROM alert_rules
     WHERE tenant_id = $1::UUID AND is_active = true`,
    [tenantId]
  );

  const triggered = [];

  for (const rule of rulesResult.rows) {
    try {
      // Skip if in cooldown
      if (await isInCooldown(rule.id)) continue;

      const value = await computeMetric(rule);
      if (value === null) continue;

      const breached = evaluateCondition(value, rule.operator, parseFloat(rule.threshold));
      if (!breached) continue;

      // Record the alert event
      const alertEvent = await recordAlertEvent(rule, value);

      // Set cooldown to prevent alert storm
      await setCooldown(rule.id, rule.cooldown_secs);

      logger.info({
        ruleId:    rule.id,
        ruleName:  rule.name,
        metric:    rule.metric_name,
        value,
        threshold: rule.threshold,
        operator:  rule.operator,
      }, '[alerts.service] Alert triggered');

      triggered.push({ rule, alertEvent, value });

    } catch (err) {
      logger.error({ err, ruleId: rule.id }, '[alerts.service] Error evaluating rule');
    }
  }

  return triggered;
}

module.exports = {
  createRule,
  listRules,
  getRule,
  updateRule,
  deleteRule,
  listAlertEvents,
  evaluateRulesForTenant,
};