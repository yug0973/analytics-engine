// src/middleware/requestId.js
// ─────────────────────────────────────────────────────────
//  Attaches a unique ID to every request.
//
//  Why this matters: when debugging production issues, you need
//  to trace one specific request through logs from multiple
//  functions (controller → service → database → Kafka). Without
//  a requestId, you're pattern-matching on timestamps — unreliable
//  at high concurrency.
//
//  Respects X-Request-ID if the client sends one (e.g. from an
//  upstream proxy or during end-to-end testing). Otherwise generates
//  a UUID. The ID is echoed back in the response header so the
//  client can reference it in support tickets.
// ─────────────────────────────────────────────────────────

'use strict';

const { v4: uuidv4 } = require('uuid');

function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

module.exports = requestId;