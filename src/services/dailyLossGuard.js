// src/services/dailyLossGuard.js
'use strict';

/**
 * Tracks the daily equity baseline per agent (§9).
 *
 * The baseline is captured once per UTC day from the first heartbeat.
 * riskManager enforces the % against it. On breach:
 *   1) tradingEnabled=false, paused=true (via configurationService)
 *   2) RiskEvent CRITICAL
 *   3) Telegram alert (once per day)
 *   4) Requires explicit /starttrading to resume
 */

const Performance = require('../database/models/Performance');
const RiskEvent = require('../database/models/RiskEvent');
const configurationService = require('./configurationService');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function ensureBaseline({ agentId, fallbackEquity }) {
  const dayKey = utcDayKey();
  let perf = await Performance.findOne({ dayKey, agentId });

  if (!perf) {
    perf = await Performance.create({
      dayKey,
      agentId,
      dayStartEquity: Number.isFinite(fallbackEquity) ? fallbackEquity : 0,
      haltTriggered: false,
      computedAt: new Date(),
    });
    logger.info({ agentId, dayKey, dayStartEquity: perf.dayStartEquity }, 'dailyLossGuard_baseline_created');
  } else if (!perf.dayStartEquity && Number.isFinite(fallbackEquity)) {
    perf.dayStartEquity = fallbackEquity;
    await perf.save();
  }

  return perf;
}

async function trip({ agentId, reason, lossPct }) {
  const dayKey = utcDayKey();
  const perf = await Performance.findOne({ dayKey, agentId });
  if (perf?.haltTriggered) return; // already tripped today

  await configurationService.setRuntimeState(
    { tradingEnabled: false, paused: true },
    `dailyLossGuard:${reason}`
  );

  await RiskEvent.create({
    severity: 'CRITICAL',
    code: 'DAILY_LOSS_HALT',
    message: `Daily loss halt: ${reason} (${lossPct.toFixed(2)}%)`,
    context: { agentId, lossPct },
    occurredAt: new Date(),
  });

  await notificationService.systemMessage(
    `🚨 <b>Daily loss halt</b>\nReason: ${reason}\nLoss: ${lossPct.toFixed(2)}%\nTrading disabled — send /starttrading to resume.`
  );

  if (perf) {
    perf.haltTriggered = true;
    perf.haltReason = reason;
    await perf.save();
  }
  logger.warn({ agentId, reason, lossPct }, 'dailyLossGuard_tripped');
}

module.exports = { ensureBaseline, trip, utcDayKey };