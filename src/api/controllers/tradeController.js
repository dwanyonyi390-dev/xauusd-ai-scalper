'use strict';

const Trade = require('../../database/models/Trade');
const TradeExecution = require('../../database/models/TradeExecution');
const logger = require('../../utils/logger');

async function listOpen(req, res, next) {
  try {
    const rows = await Trade.find({ status: { $in: ['OPEN', 'CLOSING'] } })
      .sort({ entryTime: -1 })
      .limit(100)
      .lean();
    res.json({ ok: true, trades: rows });
  } catch (err) {
    next(err);
  }
}

async function listHistory(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const rows = await Trade.find({ status: 'CLOSED' })
      .sort({ exitTime: -1 })
      .limit(limit)
      .lean();
    res.json({ ok: true, trades: rows });
  } catch (err) {
    next(err);
  }
}

async function getTrade(req, res, next) {
  try {
    const trade = await Trade.findOne({ tradeId: req.params.tradeId }).lean();
    if (!trade) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    const executions = await TradeExecution.find({ tradeId: trade.tradeId })
      .sort({ occurredAt: 1 })
      .lean();
    res.json({ ok: true, trade, executions });
  } catch (err) {
    next(err);
  }
}

module.exports = { listOpen, listHistory, getTrade };