// server/src/consumers/analyticsConsumer.js
'use strict';

const { createConsumer } = require('../config/kafka');
const { redisClient } = require('../config/redis');
const { handleLiveMetricsUpdate } = require('../websocket/eventHandlers');
const env = require('../config/env');
const logger = require('../utils/logger');

const consumer = createConsumer(env.kafka.groupId.analytics);

const LIVE_WINDOW_MS = 5 * 60 * 1000;
const KEY_TTL_SECONDS = 31 * 24 * 60 * 60;

// Debounce WebSocket broadcasts — at most once per 2 seconds per tenant
const BROADCAST_DEBOUNCE_MS = 2000;
const lastBroadcastTime = new Map();

function shouldBroadcast(tenantId) {
  const last = lastBroadcastTime.get(tenantId) || 0;
  return Date.now() - last >= BROADCAST_DEBOUNCE_MS;
}

function parseMessage(message) {
  try {
    const value = JSON.parse(message.value.toString());
    if (!value.id || !value.tenantId || !value.eventType) {
      logger.warn({ value }, '[analyticsConsumer] Skipping malformed message');
      return null;
    }
    return value;
  } catch (err) {
    logger.error({ err, raw: message.value?.toString() }, '[analyticsConsumer] Failed to parse message');
    return null;
  }
}

async function updateAggregates(event) {
  const { id, tenantId, eventType } = event;
  const now = Date.now();
  const pruneOlderThan = now - LIVE_WINDOW_MS;

  const liveKey  = `events:live:${tenantId}`;
  const countKey = `events:count:${tenantId}`;
  const typesKey = `events:types:${tenantId}`;

  const pipeline = redisClient.pipeline();

  pipeline.zadd(liveKey, now, id);
  pipeline.zremrangebyscore(liveKey, '-inf', pruneOlderThan);
  pipeline.expire(liveKey, KEY_TTL_SECONDS);

  pipeline.incr(countKey);
  pipeline.expire(countKey, KEY_TTL_SECONDS);

  pipeline.hincrby(typesKey, eventType, 1);
  pipeline.expire(typesKey, KEY_TTL_SECONDS);

  await pipeline.exec();
}

async function start() {
  await consumer.connect();
  logger.info('[analyticsConsumer] Connected');

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
        await updateAggregates(event);

        // Broadcast live metrics update to WebSocket clients (debounced)
        if (shouldBroadcast(event.tenantId)) {
          lastBroadcastTime.set(event.tenantId, Date.now());
          await handleLiveMetricsUpdate(event.tenantId);
        }

        await consumer.commitOffsets([{
          topic,
          partition,
          offset: (BigInt(message.offset) + 1n).toString(),
        }]);

        logger.debug({
          eventId:   event.id,
          eventType: event.eventType,
          tenantId:  event.tenantId,
          partition,
          offset:    message.offset,
        }, '[analyticsConsumer] Aggregates updated');

      } catch (err) {
        logger.error({
          err,
          eventId:   event.id,
          partition,
          offset:    message.offset,
        }, '[analyticsConsumer] Failed to update aggregates — offset not committed');
      }
    },
  });
}

async function stop() {
  await consumer.disconnect();
  logger.info('[analyticsConsumer] Disconnected');
}

module.exports = { start, stop };