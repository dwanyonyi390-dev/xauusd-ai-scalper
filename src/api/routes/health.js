'use strict';

const { Router } = require('express');
const env = require('../../config/env');
const db = require('../../database/connection');

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'xauusd-ai-scalper',
    env: env.NODE_ENV,
    tradingMode: env.TRADING_MODE,
    phase: 2,
    db: db.status(),
    time: new Date().toISOString(),
  });
});

module.exports = router;