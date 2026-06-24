// server/src/routes/events.routes.js
'use strict';

const { Router } = require('express');
const { eventSchema, batchSchema } = require('../services/events.service');
const eventsController = require('../controllers/events.controller');
const authenticate = require('../middleware/authenticate');
const { ingestLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const router = Router();

// POST /api/v1/events
// validate({ body: schema }) — wrapping in object is required by validate.js
// which iterates Object.entries(schemas) keyed by 'body'|'query'|'params'
router.post(
  '/',
  ingestLimiter,
  authenticate,
  validate({ body: eventSchema }),
  eventsController.ingestEvent
);

// POST /api/v1/events/batch
router.post(
  '/batch',
  ingestLimiter,
  authenticate,
  validate({ body: batchSchema }),
  eventsController.ingestBatch
);

module.exports = router;