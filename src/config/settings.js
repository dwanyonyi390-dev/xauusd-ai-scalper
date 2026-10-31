'use strict';

const env = require('./env');

/**
 * Application-level defaults derived from the spec (§9, §17).
 * These are INITIAL TEST PARAMETERS, not proven optimal values.
 * User overrides live in the database (TradingSettings model, later phase).
 */
const DEFAULTS = Object.freeze({
  symbol: env.TRADING_SYMBOL,
  tradingMode: env.TRADING_MODE,

  maxSimultaneousPositions: env.DEFAULT_MAX_POSITIONS,
  lotSize: env.DEFAULT_LOT_SIZE,
  profitTargetUSD: env.DEFAULT_PROFIT_TARGET,
  riskPercentPerPosition: env.DEFAULT_RISK_PERCENT,
  maxDailyLossPercent: env.DEFAULT_MAX_DAILY_LOSS,
  maxHoldSeconds: env.DEFAULT_MAX_HOLD_SECONDS,
  maxSpread: env.DEFAULT_MAX_SPREAD ?? null,
  maxConsecutiveLosses: env.DEFAULT_MAX_CONSECUTIVE_LOSSES,

  // Per-slot lot sizes (§7 example: 0.01, 0.01, 0.02, 0.02)
  positionSlots: [
    { slot: 1, lotSize: env.DEFAULT_LOT_SIZE, enabled: true },
    { slot: 2, lotSize: env.DEFAULT_LOT_SIZE, enabled: true },
    { slot: 3, lotSize: env.DEFAULT_LOT_SIZE * 2, enabled: false },
    { slot: 4, lotSize: env.DEFAULT_LOT_SIZE * 2, enabled: false },
  ],

  newsBlackoutMinutes: 15,
  tradingSessions: ['LONDON', 'NEW_YORK'],
  strategyVersion: '0.1.0-phase1',
});

function snapshot() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

module.exports = { DEFAULTS, snapshot };