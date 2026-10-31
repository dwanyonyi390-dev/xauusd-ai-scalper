'use strict';

const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

function makeRateLimit({ windowMs = 60_000, max = 60, keyGenerator } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator:
      keyGenerator ||
      ((req) => (req.user && req.user.id) || req.ip),
    handler: (req, res) => {
      logger.warn({ ip: req.ip, path: req.path }, 'rate limit exceeded');
      res.status(429).json({ ok: false, error: 'rate_limited' });
    },
  });
}

module.exports = makeRateLimit;
module.exports.makeRateLimit = makeRateLimit;
module.exports.default = makeRateLimit;