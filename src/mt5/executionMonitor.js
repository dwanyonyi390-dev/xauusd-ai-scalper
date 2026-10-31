'use strict';

/**
 * Execution reconciliation helpers. Queries the immutable TradeExecution
 * log to reconstruct what happened to a trade, which the EA and the API
 * use after a reconnect (§20: "reconcile broker state before retrying").
 */

const TradeExecution = require('../database/models/TradeExecution');
const Trade = require('../database/models/Trade');

async function executionsForTrade(tradeId) {
  return TradeExecution.find({ tradeId }).sort({ occurredAt: 1 }).lean();
}

async function lastEvent(tradeId) {
  const rows = await TradeExecution.find({ tradeId }).sort({ occurredAt: -1 }).limit(1).lean();
  return rows[0] || null;
}

/**
 * A trade is "in doubt" if it was opened but we never saw a fill/reject,
 * or if close was requested but never confirmed.
 */
async function findInDoubt({ limit = 100 } = {}) {
  const trades = await Trade.find({
    status: { $in: ['OPEN', 'CLOSING'] },
  }).sort({ entryTime: -1 }).limit(limit).lean();

  const out = [];
  for (const t of trades) {
    const last = await lastEvent(t.tradeId);
    if (!last) {
      out.push({ trade: t, reason: 'NO_EXECUTION_EVENTS' });
      continue;
    }
    if (t.status === 'OPEN' && !['OPEN_FILLED', 'OPEN_REJECTED'].includes(last.event)) {
      out.push({ trade: t, reason: 'OPEN_UNCONFIRMED', last });
    }
    if (t.status === 'CLOSING' && !['CLOSE_FILLED', 'CLOSE_FAILED'].includes(last.event)) {
      out.push({ trade: t, reason: 'CLOSE_UNCONFIRMED', last });
    }
  }
  return out;
}

module.exports = { executionsForTrade, lastEvent, findInDoubt };