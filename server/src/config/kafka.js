// src/config/kafka.js
// ─────────────────────────────────────────────────────────
//  KafkaJS client, producer, and consumer factory.
//
//  Why KafkaJS over node-rdkafka?
//  KafkaJS is pure JavaScript (no native bindings) — easier
//  to run in Docker, no build tool requirements. node-rdkafka
//  is faster for extreme throughput (millions/sec) but the
//  overhead of native compilation isn't worth it at our scale.
// ─────────────────────────────────────────────────────────

'use strict';

const { Kafka, CompressionTypes, logLevel } = require('kafkajs');
const env = require('./env');
const logger = require('../utils/logger');

// KafkaJS uses its own log levels — map to pino
const kafkaLogger = () => ({ namespace, level, label, log }) => {
  const { message, ...extra } = log;
  const pinoLevel = {
    [logLevel.ERROR]: 'error',
    [logLevel.WARN]: 'warn',
    [logLevel.INFO]: 'info',
    [logLevel.DEBUG]: 'debug',
  }[level] || 'info';

  logger[pinoLevel]({ namespace, ...extra }, `[kafka] ${message}`);
};

const kafka = new Kafka({
  clientId: env.kafka.clientId,
  brokers: env.kafka.brokers,
  logCreator: kafkaLogger,
  // Connection retry: critical for startup ordering
  // (Kafka takes longer to start than Node does)
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

// ── Producer ──────────────────────────────────────────────
//
// acks: -1 (all) → leader + all ISR replicas must acknowledge.
// This is the strongest durability guarantee. The tradeoff is
// slightly higher latency per batch (~2-5ms). Correct choice
// for financial/analytics data where loss is unacceptable.
//
// Batching config:
// - linger.ms = 10ms: wait up to 10ms to accumulate more records
//   in a batch before sending. Dramatically improves throughput.
// - batch.size = 100 records: flush immediately if batch hits 100.
// Either condition (time OR size) triggers the send.
//
// compression: Snappy — fastest codec with good ratio. Better
// than gzip for high-throughput hot paths.

const producer = kafka.producer({
  allowAutoTopicCreation: false, // we create topics explicitly
  compression: CompressionTypes.SNAPPY,
  idempotent: true, // exactly-once per producer session (requires acks: all)
  maxInFlightRequests: 5,
});

/**
 * Create a consumer for a given consumer group.
 * Each consumer group reads ALL topic messages independently.
 * Different groups = different logical applications reading the same topic.
 */
function createConsumer(groupId) {
  return kafka.consumer({
    groupId,
    // If no committed offset exists for a partition, start from the
    // earliest available offset (replay all events). 'latest' would
    // skip events that arrived while the consumer was down.
    fromBeginning: true,
    // Commit offsets manually (after successful processing).
    // autoCommit: false is set when subscribing, not here.
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });
}

/**
 * Publish a single message to a Kafka topic.
 *
 * @param {string} topic  - Target topic name
 * @param {string} key    - Partition key (use tenantId for ordering guarantee)
 * @param {object} value  - Message payload (will be JSON serialised)
 */
async function publish(topic, key, value) {
  await producer.send({
    topic,
    messages: [
      {
        key: String(key),
        value: JSON.stringify(value),
        timestamp: String(Date.now()),
      },
    ],
  });
}

/**
 * Publish multiple messages in a single batch.
 * Use for the /events/batch endpoint.
 *
 * @param {string} topic
 * @param {Array<{key, value}>} messages
 */
async function publishBatch(topic, messages) {
  await producer.send({
    topic,
    messages: messages.map(({ key, value }) => ({
      key: String(key),
      value: JSON.stringify(value),
      timestamp: String(Date.now()),
    })),
  });
}

/**
 * Health check — verifies Kafka is reachable.
 * Lists topics; if the broker is down, this throws.
 */
async function healthCheck() {
  try {
    const admin = kafka.admin();
    await admin.connect();
    await admin.listTopics();
    await admin.disconnect();
    return 'ok';
  } catch {
    return 'error';
  }
}

async function connectProducer() {
  await producer.connect();
  logger.info('[kafka] Producer connected');
}

async function disconnectProducer() {
  await producer.disconnect();
}

module.exports = {
  kafka,
  producer,
  createConsumer,
  publish,
  publishBatch,
  healthCheck,
  connectProducer,
  disconnectProducer,
};