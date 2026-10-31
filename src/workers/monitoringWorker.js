// src/workers/monitoringWorker.js
'use strict';

/**
 * Background worker (Render background service) — §11, §9, §20.
 *
 * Responsibilities:
 *   - Detect disconnected MT5 agents (no heartbeat > STALE_AFTER_MS)
 *   - Enforce daily loss limit (delegates to dailyLossGuard.trip)
 *   - Recompute Performance doc
 *   - Prune old AgentHeartbeat rows
 *
 * NOTE: in-memory state is NOT trusted across restarts. This worker reads
 * ground truth from MongoDB each iteration.
 */

const env = require('../config/env');
const logger = require('../utils/logger');
const AgentHeartbeat = require('../database/models/AgentHeartbeat');
const Trade = require('../database/models/Trade');
const { heartbeatService } = require('../services/heartbeatService');
const dailyLossGuard = require('../services/dailyLossGuard');
const stateService = require('../services/stateService');
const configurationService = require('../services/configurationService');
const notificationService = require('../services/notificationService');

const AGENT_ID = env.MT5_AGENT_ID || 'default';
const TICK_MS = 15_000;
const STALE_MS = 30_000;

let _lastAlertedDisconnect = 0;
let _timer = null;

async function _checkDailyLoss() {
  try {
    const settings = await configurationService.getOrCreate();
    const state = await stateService.buildState({ agentId: AGENT_ID, symbol: settings.symbol });
    if (state.dayStartEquity > 0) {
      const lossPct = ((state.dayStartEquity - state.equity) / state.dayStartEquity) * 100;
      if (lossPct >= settings.maxDailyLossPercent) {
        await dailyLossGuard.trip({
          agentId: AGENT_ID,
          reason: 'MAX_DAILY_LOSS',
          lossPct,
        });
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, 'monitoring_worker_dailyLoss_failed');
  }
}

async function _checkAgentConnection() {
  try {
    const beat = await AgentHeartbeat
      .findOne({ agentId: AGENT_ID })
      .sort({ receivedAt: -1 })
      .lean();
    const stale = !beat || Date.now() - new Date(beat.receivedAt).getTime() > STALE_MS;
    if (stale && Date.now() - _lastAlertedDisconnect > 5 * 60_000) {
      _lastAlertedDisconnect = Date.now();
      await notificationService.systemMessage(
        `⚠️ MT5 agent disconnected.\nLast heartbeat: ${beat?.receivedAt || 'never'}\nLocal EA keeps enforcing SLs; no new entries.`
      );
    }
  } catch (err) {
    logger.error({ err: err.message }, 'monitoring_worker_connection_failed');
  }
}

async function _recomputePerformance() {
  try {
    const { performanceService } = require('../services/performanceService');
    const summary = await performanceService.getSummary();

    // consecutiveLosses recomputation
    const recent = await Trade
      .find({ status: 'CLOSED', netProfit: { $ne: null } })
      .sort({ exitTime: -1 })
      .limit(50)
      .select('netProfit exitTime')
      .lean();

    let streak = 0;
    for (const t of recent) {
      if (t.netProfit < 0) streak += 1;
      else break;
    }

    const dayKey = dailyLossGuard.utcDayKey();
    const Performance = require('../database/models/Performance');
    await Performance.updateOne(
      { dayKey, agentId: AGENT_ID },
      {
        $set: {
          agentId: AGENT_ID,
          dayKey,
          computedAt: new Date(),
          tradesCount: summary.trades,
          wins: summary.wins,
          losses: summary.losses,
          winRate: summary.winRate,
          realizedPnl: summary.realizedPnl,
          profitFactor: summary.profitFactor,
          maxDrawdownUSD: summary.maxDrawdownUSD,
          consecutiveLosses: streak,
          lastTradeClosedAt: recent[0]?.exitTime || null,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    logger.warn({ err: err.message }, 'monitoring_worker_performance_failed');
  }
}

async function _pruneHeartbeats() {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    await AgentHeartbeat.deleteMany({ receivedAt: { $lt: cutoff } });
  } catch (err) {
    logger.warn({ err: err.message }, 'monitoring_worker_prune_failed');
  }
}

async function tick() {
  await _checkAgentConnection();
  await _checkDailyLoss();
  await _recomputePerformance();
  await _pruneHeartbeats();
}

async function start() {
  await heartbeatService.hydrate();
  logger.info({ tickMs: TICK_MS }, 'monitoring_worker_started');
  _timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  tick().catch(() => {});
}

function stop() {
  if (_timer) clearInterval(_timer);
  _timer = null;
  logger.info('monitoring_worker_stopped');
}

module.exports = { start, stop, tick };