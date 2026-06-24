// server/src/consumers/alertConsumer.js
'use strict';

const { createConsumer } = require('../config/kafka');
const { evaluateRulesForTenant } = require('../services/alerts.service');
const { handleAlertTriggered } = require('../websocket/eventHandlers');
const env = require('../config/env');
const logger = require('../utils/logger');

const consumer = createConsumer(env.kafka.groupId.alerts);

const EVAL_DEBOUNCE_MS = 5000;
const lastEvalTime = new Map();

function shouldEvaluate(tenantId) {
  const last = lastEvalTime.get(tenantId) || 0;
  return Date.now() - last >= EVAL_DEBOUNCE_MS;
}

function parseMessage(message) {
  try {
    const value = JSON.parse(message.value.toString());
    if (!value.id || !value.tenantId || !value.eventType) {
      logger.warn({ value }, '[alertConsumer] Skipping malformed message');
      return null;
    }
    return value;
  } catch (err) {
    logger.error({ err, raw: message.value?.toString() }, '[alertConsumer] Failed to parse message');
    return null;
  }
}

async function start() {
  await consumer.connect();
  logger.info('[alertConsumer] Connected');

  await consumer.subscribe({
    topic: env.kafka.topics.rawEvents,
    fromBeginning: false,
  });

  await consumer.run({
    autoCommit: false,

    eachMessage: async ({ topic, partition, message }) => {
      const event = parseMessage(message);

      if (!event) {
        await consumer.commitOffsets([{
          topic,
          partition,
          offset: (BigInt(message.offset) + 1n).toString(),
        }]);
        return;
      }

      try {
        if (shouldEvaluate(event.tenantId)) {
          lastEvalTime.set(event.tenantId, Date.now());

          const triggered = await evaluateRulesForTenant(event.tenantId);

          if (triggered.length > 0) {
            logger.info({
              tenantId: event.tenantId,
              count: triggered.length,
              rules: triggered.map(t => ({ id: t.rule.id, name: t.rule.name, value: t.value })),
            }, '[alertConsumer] Alert(s) triggered');

            // Push to connected WebSocket clients
            await handleAlertTriggered(event.tenantId, triggered);
          }
        }

        await consumer.commitOffsets([{
          topic,
          partition,
          offset: (BigInt(message.offset) + 1n).toString(),
        }]);

      } catch (err) {
        logger.error({
          err,
          eventId:   event.id,
          partition,
          offset:    message.offset,
        }, '[alertConsumer] Failed to evaluate rules — offset not committed');
      }
    },
  });
}

async function stop() {
  await consumer.disconnect();
  logger.info('[alertConsumer] Disconnected');
}

module.exports = { start, stop };