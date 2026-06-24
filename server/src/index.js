// server/src/index.js
'use strict';

const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');

const env = require('./config/env');
const { pool, healthCheck: dbHealth } = require('./config/database');
const { connect: connectRedis, redisClient, redisSub, healthCheck: redisHealth } = require('./config/redis');
const { connectProducer, disconnectProducer, healthCheck: kafkaHealth } = require('./config/kafka');
const persistenceConsumer = require('./consumers/persistenceConsumer');
const analyticsConsumer = require('./consumers/analyticsConsumer');
const alertConsumer = require('./consumers/alertConsumer');
const socketServer = require('./websocket/socketServer');
const migrate = require('./database/migrate');
const logger = require('./utils/logger');
const { httpDuration } = require('./utils/metrics');

const requestId = require('./middleware/requestId');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: env.corsOrigin,
  credentials: true,
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Request tracing ──────────────────────────────────────────────────────────
app.use(requestId);

// ─── HTTP metrics instrumentation ─────────────────────────────────────────────
app.use((req, res, next) => {
  const end = httpDuration.startTimer({
    method: req.method,
    route: req.path,
  });
  res.on('finish', () => {
    end({ status_code: res.statusCode });
  });
  next();
});

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info({ reqId: req.id, method: req.method, url: req.url }, 'incoming request');
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const [postgres, redis, kafka] = await Promise.all([
    dbHealth(),
    redisHealth(),
    kafkaHealth(),
  ]);

  const checks = { postgres, redis, kafka };
  const overall = Object.values(checks).every(v => v === 'ok') ? 'ok' : 'degraded';

  res.status(overall === 'ok' ? 200 : 503).json({ status: overall, ...checks });
});

// ─── Prometheus metrics scrape endpoint ──────────────────────────────────────
app.get('/metrics', async (_req, res) => {
  const { register } = require('prom-client');
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ─── API routes ───────────────────────────────────────────────────────────────

// Phase 2 — Auth
const authRoutes = require('./routes/auth.routes');
app.use('/api/v1/auth', authRoutes);

// Phase 3 — Event ingest
const eventsRoutes = require('./routes/events.routes');
app.use('/api/v1/events', eventsRoutes);

// Phase 4 — Analytics query
const analyticsRoutes = require('./routes/analytics.routes');
app.use('/api/v1/analytics', analyticsRoutes);

// Phase 6 — Alerts
const alertsRoutes = require('./routes/alerts.routes');
app.use('/api/v1/alerts', alertsRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global error boundary ────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Startup sequence ─────────────────────────────────────────────────────────
async function start() {
  try {
    logger.info('Starting analytics engine...');

    // 1. Verify Postgres is reachable
    await pool.query('SELECT 1');
    logger.info('PostgreSQL connected');

    // 2. Run pending migrations
    await migrate();
    logger.info('Database migrations complete');

    // 3. Connect Redis (lazyConnect: true — must call explicitly)
    await connectRedis();
    logger.info('Redis connected');

    // 4. Connect Kafka producer
    await connectProducer();
    logger.info('Kafka producer connected');

    // 5. Start Kafka consumers
    await persistenceConsumer.start();
    logger.info('Persistence consumer started');

    await analyticsConsumer.start();
    logger.info('Analytics consumer started');

    await alertConsumer.start();
    logger.info('Alert consumer started');

    // 6. Initialise Socket.io (must be before server.listen)
    socketServer.init(server);
    logger.info('WebSocket server initialised');

    // 7. Bind HTTP server
    server.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, 'Server listening');
    });
  } catch (err) {
    logger.fatal({ err }, 'Startup failed — shutting down');
    process.exit(1);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received');

  server.close(async () => {
    try {
      await disconnectProducer();
      await persistenceConsumer.stop();
      await analyticsConsumer.stop();
      await alertConsumer.stop();
      logger.info('Kafka producer and consumers disconnected');

      await redisClient.quit();
      await redisSub.quit();
      logger.info('Redis disconnected');

      await pool.end();
      logger.info('PostgreSQL pool closed');

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection — shutting down');
  process.exit(1);
});

start();

module.exports = { app, server };