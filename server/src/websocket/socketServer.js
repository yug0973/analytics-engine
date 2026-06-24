// server/src/websocket/socketServer.js
// ─────────────────────────────────────────────────────────
//  Socket.io server — real-time push to connected clients.
//
//  Architecture:
//    - Each tenant gets its own Socket.io room: "tenant:{tenantId}"
//    - Clients join their room on connect (after JWT verification)
//    - alertConsumer calls notifyTenant() to push alert events
//    - analyticsConsumer can call broadcastLiveRate() for live tickers
//
//  Auth flow:
//    Client connects with: { auth: { token: "<JWT>" } }
//    Middleware verifies JWT → attaches user to socket
//    Socket joins room "tenant:{user.tenantId}"
//
//  Why rooms and not namespaces?
//    Rooms are dynamic and require no server-side setup.
//    Namespaces are better for completely separate applications.
//    For per-tenant isolation within one app, rooms are correct.
// ─────────────────────────────────────────────────────────

'use strict';

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../utils/logger');

let io = null;

/**
 * Initialise Socket.io server attached to an existing HTTP server.
 * Call this once from index.js after creating the HTTP server.
 *
 * @param {http.Server} httpServer
 * @returns {Server} io instance
 */
function init(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Ping every 25s, disconnect after 2 missed pings (60s)
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  // ── JWT authentication middleware ─────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication required — provide token in handshake.auth'));
    }

    try {
      const payload = jwt.verify(token, env.jwt.secret);
      // Attach user info to socket for use in event handlers
      socket.user = {
        id:       payload.sub,
        email:    payload.email,
        role:     payload.role,
        tenantId: payload.tenantId || payload.sub,
      };
      next();
    } catch (err) {
      logger.warn({ err: err.message }, '[socketServer] Invalid JWT on connect');
      next(new Error('Invalid or expired token'));
    }
  });

  // ── Connection handler ────────────────────────────────
  io.on('connection', (socket) => {
    const { id: userId, tenantId, role } = socket.user;
    const room = `tenant:${tenantId}`;

    // Join tenant room — all events for this tenant go here
    socket.join(room);

    logger.info({
      socketId: socket.id,
      userId,
      tenantId,
      role,
      room,
    }, '[socketServer] Client connected');

    // Confirm successful connection to client
    socket.emit('connected', {
      socketId: socket.id,
      tenantId,
      room,
      timestamp: new Date().toISOString(),
    });

    // ── Client-initiated events ───────────────────────
    // Clients can request a live rate snapshot at any time
    socket.on('request:live_rate', () => {
      logger.debug({ socketId: socket.id }, '[socketServer] live_rate requested');
      // The actual data comes from the analytics service via HTTP.
      // WebSocket is push-only for server-initiated events.
      socket.emit('info', { message: 'Use GET /api/v1/analytics/live for live rate' });
    });

    socket.on('disconnect', (reason) => {
      logger.info({
        socketId: socket.id,
        userId,
        tenantId,
        reason,
      }, '[socketServer] Client disconnected');
    });

    socket.on('error', (err) => {
      logger.error({
        err,
        socketId: socket.id,
        userId,
      }, '[socketServer] Socket error');
    });
  });

  logger.info('[socketServer] Initialised');
  return io;
}

/**
 * Push an alert event to all clients in a tenant room.
 * Called by alertConsumer when a rule is triggered.
 *
 * @param {string} tenantId
 * @param {object} rule       — the alert_rules row
 * @param {object} alertEvent — the alert_events row
 * @param {number} value      — metric value at trigger time
 */
function notifyAlert(tenantId, { rule, alertEvent, value }) {
  if (!io) {
    logger.warn('[socketServer] notifyAlert called before init()');
    return;
  }

  const room = `tenant:${tenantId}`;
  const payload = {
    type:        'alert:triggered',
    ruleId:      rule.id,
    ruleName:    rule.name,
    metricName:  rule.metric_name,
    operator:    rule.operator,
    threshold:   rule.threshold,
    value,
    alertEventId: alertEvent.id,
    triggeredAt:  alertEvent.triggered_at,
    timestamp:    new Date().toISOString(),
  };

  io.to(room).emit('alert:triggered', payload);

  logger.debug({
    room,
    ruleId:   rule.id,
    ruleName: rule.name,
    value,
  }, '[socketServer] Alert pushed to room');
}

/**
 * Push a live metrics update to all clients in a tenant room.
 * Can be called periodically or after each event batch.
 *
 * @param {string} tenantId
 * @param {object} metrics  — { eventsPerMinute, timestamp }
 */
function broadcastLiveRate(tenantId, metrics) {
  if (!io) return;

  const room = `tenant:${tenantId}`;
  io.to(room).emit('metrics:live', {
    type: 'metrics:live',
    ...metrics,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get the Socket.io instance (for use in other modules).
 */
function getIO() {
  return io;
}

module.exports = { init, notifyAlert, broadcastLiveRate, getIO };