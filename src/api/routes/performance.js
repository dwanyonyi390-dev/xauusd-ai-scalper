'use strict';

const { Router } = require('express');
const { authenticateAgent } = require('../middleware/authenticate');
const { performanceService } = require('../../services/performanceService');

const router = Router();
router.use(authenticateAgent);

router.get('/summary', async (_req, res, next) => {
  try {
    const summary = await performanceService.getSummary();
    res.json({ ok: true, summary });
  } catch (err) { next(err); }
});

router.get('/daily', async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 7, 90);
    const rows = await performanceService.getDaily(days);
    res.json({ ok: true, days, rows });
  } catch (err) { next(err); }
});

router.get('/drawdown', async (_req, res, next) => {
  try {
    const dd = await performanceService.getDrawdown();
    res.json({ ok: true, drawdown: dd });
  } catch (err) { next(err); }
});

module.exports = router;