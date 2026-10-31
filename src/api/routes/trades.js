'use strict';

const { Router } = require('express');
const { authenticateAgent } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { z } = require('zod');
const Trade = require('../../database/models/Trade');
const TradeExecution = require('../../database/models/TradeExecution');

const router = Router();
router.use(authenticateAgent);

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['OPEN', 'CLOSING', 'CLOSED', 'FAILED']).optional(),
  symbol: z.string().max(32).optional(),
});

router.get('/', validate({ query: QuerySchema }), async (req, res, next) => {
  try {
    const { limit, status, symbol } = req.validatedQuery;
    const q = {};
    if (status) q.status = status;
    if (symbol) q.symbol = symbol;

    const trades = await Trade.find(q).sort({ entryTime: -1 }).limit(limit).lean();
    res.json({ ok: true, count: trades.length, trades });
  } catch (err) { next(err); }
});

router.get('/open', async (_req, res, next) => {
  try {
    const trades = await Trade.find({ status: 'OPEN' }).sort({ entryTime: -1 }).lean();
    res.json({ ok: true, count: trades.length, trades });
  } catch (err) { next(err); }
});

router.get('/:tradeId', async (req, res, next) => {
  try {
    const trade = await Trade.findOne({ tradeId: req.params.tradeId }).lean();
    if (!trade) return res.status(404).json({ ok: false, error: 'trade_not_found' });

    const executions = await TradeExecution
      .find({ tradeId: trade.tradeId })
      .sort({ occurredAt: 1 })
      .lean();

    res.json({ ok: true, trade, executions });
  } catch (err) { next(err); }
});

module.exports = router;