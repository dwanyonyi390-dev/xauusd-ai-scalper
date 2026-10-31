'use strict';

const { Router } = require('express');
const { authenticateAgent } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { SignalSchema } = require('../../utils/validation');
const TradingSignal = require('../../database/models/TradingSignal');

const router = Router();
router.use(authenticateAgent);

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const signals = await TradingSignal.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ ok: true, count: signals.length, signals });
  } catch (err) { next(err); }
});

router.post('/', validate({ body: SignalSchema }), async (req, res, next) => {
  try {
    const s = req.body;
    const created = await TradingSignal.create({
      ...s,
      createdAt: new Date(s.createdAt),
    });
    res.status(201).json({ ok: true, signalId: created.signalId });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'duplicate_signal_id' });
    }
    next(err);
  }
});

module.exports = router;