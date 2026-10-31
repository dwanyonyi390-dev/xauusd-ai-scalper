// src/services/stateService.js
'use strict';

/**
 * Builds the runtime `state` object consumed by riskManager.approve().
 *
 * Sources:
 *   - AgentHeartbeat (latest) for equity/balance
 *   - Trade collection for open positions and open risk
 *   - Performance doc for consecutiveLosses
 *   - DailyLossGuard for dayStartEquity
 */

const AgentHeartbeat = require('../database/models/AgentHeartbeat');
const Trade = require('../database/models/Trade');
const Performance = require('../database/models/Performance');
const dailyLossGuard = require('./dailyLossGuard');
const logger = require('../utils/logger');

async function buildState({ agentId, symbol = 'XAUUSD' }) {
  const beat = await AgentHeartbeat
    .findOne({ agentId })
    .sort({ receivedAt: -1 })
    .lean();

  const openTrades = await Trade.find({ status: 'OPEN', symbol }).lean();
  const openPositions = openTrades.length;

  const openRiskUSD = openTrades.reduce(
    (sum, t) => sum + (Number.isFinite(t.executionResult?.riskUSD) ? t.executionResult.riskUSD : 0),
    0
  );

  const perf = await Performance.findOne({}).sort({ computedAt: -1 }).lean();
  const consecutiveLosses = perf?.consecutiveLosses ?? 0;

  const { dayStartEquity } = await dailyLossGuard.ensureBaseline({
    agentId,
    fallbackEquity: beat?.equity ?? 0,
  });

  const state = {
    equity: beat?.equity ?? 0,
    balance: beat?.balance ?? 0,
    floatingPnl: (beat?.equity ?? 0) - (beat?.balance ?? 0),
    openPositions,
    openRiskUSD,
    consecutiveLosses,
    dayStartEquity,
    lastTradeClosedAt: perf?.lastTradeClosedAt ?? null,
  };

  logger.debug({ state }, 'stateService_built');
  return state;
}

module.exports = { buildState };