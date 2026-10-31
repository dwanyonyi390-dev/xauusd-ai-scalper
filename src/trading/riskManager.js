'use strict';

/**
 * Risk manager — HIGHEST AUTHORITY in the system (§9).
 *
 * Called BEFORE any trade is sent to the MT5 agent. If any check fails,
 * a RiskHaltError is thrown; the caller must persist a RiskEvent and refuse
 * to open the position.
 *
 * Inputs:
 *   - settings: TradingSettings document (Mongoose)
 *   - state:    { equity, balance, floatingPnl, openPositions, closedToday,
 *                 consecutiveLosses, dayStartEquity, lastTradeClosedAt }
 *   - signal:   validated signal from signalValidator
 *   - spread:   current spread (price units)
 *   - atr:      current ATR (price units) for position sizing
 *
 * Output:
 *   { approved: true, lotSize, riskUSD, exposureAfterUSD }
 *
 * Throws RiskHaltError on any breach.
 */

const { RiskHaltError } = require('../utils/errors');
const logger = require('../utils/logger');

// XAUUSD: 1 standard lot = 100 oz. Adjust if your broker differs.
const CONTRACT_OZ = 100;

function halt(reason, meta = {}) {
  logger.warn({ reason, ...meta }, 'risk_halt');
  throw new RiskHaltError(reason, meta);
}

/**
 * Daily loss check. Per §9, this counts realized AND floating.
 *
 * dayStartEquity is the baseline captured at session start (00:00 UTC).
 * We treat any equity drop below dayStartEquity * (1 - maxLoss%) as a halt.
 */
function checkDailyLoss(state, settings) {
  if (!Number.isFinite(state.dayStartEquity) || state.dayStartEquity <= 0) {
    halt('DAILY_LOSS_BASELINE_MISSING');
  }
  const lossPct = ((state.dayStartEquity - state.equity) / state.dayStartEquity) * 100;
  if (lossPct >= settings.maxDailyLossPercent) {
    halt('DAILY_LOSS_LIMIT_REACHED', {
      lossPct: Number(lossPct.toFixed(2)),
      max: settings.maxDailyLossPercent,
    });
  }
}

function checkConsecutiveLosses(state, settings) {
  if (state.consecutiveLosses >= settings.maxConsecutiveLosses) {
    halt('MAX_CONSECUTIVE_LOSSES', {
      consecutive: state.consecutiveLosses,
      max: settings.maxConsecutiveLosses,
    });
  }
}

function checkMaxPositions(state, settings) {
  if (state.openPositions >= settings.maxPositions) {
    halt('MAX_POSITIONS_REACHED', {
      open: state.openPositions,
      max: settings.maxPositions,
    });
  }
}

function checkEmergency(settings) {
  if (settings.emergency) halt('EMERGENCY_ACTIVE');
  if (settings.paused) halt('STRATEGY_PAUSED');
  if (!settings.tradingEnabled) halt('TRADING_DISABLED');
}

function checkAccountExposure(state, settings, proposedRiskUSD) {
  if (!Number.isFinite(state.equity) || state.equity <= 0) {
    halt('INVALID_EQUITY');
  }
  // floatingPnl already included in equity; exposure = sum of open risk + proposed
  const openRiskUSD = state.openRiskUSD ?? 0;
  const totalRisk = openRiskUSD + proposedRiskUSD;
  const exposurePct = (totalRisk / state.equity) * 100;
  if (exposurePct > settings.maxAccountExposurePercent) {
    halt('MAX_ACCOUNT_EXPOSURE', {
      exposurePct: Number(exposurePct.toFixed(2)),
      max: settings.maxAccountExposurePercent,
    });
  }
  return exposurePct;
}

function checkSpread(spread, settings) {
  if (!Number.isFinite(spread) || spread <= 0) halt('INVALID_SPREAD');
  if (Number.isFinite(settings.maxSpread) && spread > settings.maxSpread) {
    halt('SPREAD_EXCEEDS_MAX', { spread, max: settings.maxSpread });
  }
}

// ── Position sizing ───────────────────────────────────────────────────────
// Risk a fixed % of equity, sized so that (SL distance) * lot * contract = risk.
function sizePosition({ equity, riskPercent, entry, stopLoss }) {
  if (!Number.isFinite(equity) || equity <= 0) halt('INVALID_EQUITY');
  if (!Number.isFinite(entry) || !Number.isFinite(stopLoss)) halt('INVALID_GEOMETRY');
  const slDist = Math.abs(entry - stopLoss);
  if (slDist <= 0) halt('ZERO_SL_DISTANCE');

  const riskUSD = (equity * riskPercent) / 100;
  const lots = riskUSD / (slDist * CONTRACT_OZ);

  // Clamp to broker-safe bounds
  const lot = Math.max(0.01, Math.min(5, Number(lots.toFixed(2))));

  return {
    lotSize: lot,
    riskUSD: Number((lot * slDist * CONTRACT_OZ).toFixed(2)),
    slDistance: Number(slDist.toFixed(5)),
  };
}

// ── Main gate ─────────────────────────────────────────────────────────────

function approve({ signal, settings, state, spread }) {
  // 1. Global state flags
  checkEmergency(settings);

  // 2. Daily loss (uses equity, includes floating)
  checkDailyLoss(state, settings);

  // 3. Consecutive losses
  checkConsecutiveLosses(state, settings);

  // 4. Position count
  checkMaxPositions(state, settings);

  // 5. Spread
  checkSpread(spread, settings);

  // 6. Sizing
  const sizing = sizePosition({
    equity: state.equity,
    riskPercent: signal._meta?.riskPercentOverride ?? settings.riskPercent,
    entry: signal.entryPrice,
    stopLoss: signal.stopLoss,
  });

  // 7. Account exposure
  const exposurePct = checkAccountExposure(state, settings, sizing.riskUSD);

  logger.info({
    signalId: signal.signalId,
    direction: signal.direction,
    lot: sizing.lotSize,
    riskUSD: sizing.riskUSD,
    exposurePct: Number(exposurePct.toFixed(2)),
  }, 'risk_approved');

  return {
    approved: true,
    lotSize: sizing.lotSize,
    riskUSD: sizing.riskUSD,
    slDistance: sizing.slDistance,
    exposurePct: Number(exposurePct.toFixed(2)),
    checks: {
      dailyLoss: 'ok',
      consecutiveLosses: 'ok',
      maxPositions: 'ok',
      spread: 'ok',
      exposure: 'ok',
    },
  };
}

module.exports = { approve, sizePosition, CONTRACT_OZ };