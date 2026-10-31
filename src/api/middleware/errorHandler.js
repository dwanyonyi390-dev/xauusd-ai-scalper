'use strict';

const logger = require('../../utils/logger');

/**
 * Central error handler — mounted last in app.js.
 * Never leaks stack traces or secret values to clients (§15).
 */
function errorHandler(err, req, res, _next) {
  const status = err.statusCode || 500;
  const code = err.code || 'internal_error';

  if (status >= 500) {
    logger.error({ reqId: req.id, code, err: err.message, meta: err.meta }, 'request_failed');
  } else {
    logger.warn({ reqId: req.id, code, err: err.message }, 'request_rejected');
  }

  const body = {
    ok: false,
    error: code,
    reqId: req.id,
  };

  if (status < 500) body.message = err.message;
  if (err.meta && status < 500) body.meta = err.meta;

  res.status(status).json(body);
}

module.exports = { errorHandler };