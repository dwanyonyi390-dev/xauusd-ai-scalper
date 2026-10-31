'use strict';
const test = require('node:test');
const assert = require('node:assert');
const riskManager = require('../src/trading/riskManager');
const { RiskHaltError } = require('../src/utils/errors');

function baselineSettings(overrides = {}) {
  return {
    tradingEnabled: true,
    paused: false,
    emergency: false,
    maxPositions: 4,
    riskPercent: 0.5,
    maxDailyLossPercent: 2,
    maxConsecutiveLosses: 3,
    maxSpread: 100,
    maxAccountExposurePercent: 20,
    ...overrides,
  };
}
function baselineState(overrides = {}) {
  return {
    equity: 10_000,
    balance: 10_000,
    floatingPnl: 0,
    openPositions: 0,
    openRiskUSD: 0,
    consecutiveLosses: 0,
    dayStartEquity: 10_000,
    ...overrides,
  };
}
function baselineSignal(overrides = {}) {
  return {
    signalId: 'sig-1',
    direction: 'BUY',
    entryPrice: 2000,
    stopLoss: 1995,
    takeProfit: 2005,
    ...overrides,
  };
}

test('approve passes under normal conditions', () => {
  const r = riskManager.approve({
    signal: baselineSignal(),
    settings: baselineSettings(),
    state: baselineState(),
    spread: 0.2,
  });
  assert.equal(r.approved, true);
  assert.ok(r.lotSize > 0);
});

test('rejects when trading disabled', () => {
  assert.throws(() => riskManager.approve({
    signal: baselineSignal(),
    settings: baselineSettings({ tradingEnabled: false }),
    state: baselineState(),
    spread: 0.2,
  }), RiskHaltError);
});

test('rejects when daily loss breached', () => {
  assert.throws(() => riskManager.approve({
    signal: baselineSignal(),
    settings: baselineSettings(),
    state: baselineState({ equity: 9700 }), // -3%
    spread: 0.2,
  }), /DAILY_LOSS_LIMIT_REACHED/);
});

test('rejects when consecutive losses reached', () => {
  assert.throws(() => riskManager.approve({
    signal: baselineSignal(),
    settings: baselineSettings(),
    state: baselineState({ consecutiveLosses: 3 }),
    spread: 0.2,
  }), /MAX_CONSECUTIVE_LOSSES/);
});

test('rejects when max positions reached', () => {
  assert.throws(() => riskManager.approve({
    signal: baselineSignal(),
    settings: baselineSettings(),
    state: baselineState({ openPositions: 4 }),
    spread: 0.2,
  }), /MAX_POSITIONS_REACHED/);
});

test('rejects spread over max', () => {
  assert.throws(() => riskManager.approve({
    signal: baselineSignal(),
    settings: baselineSettings({ maxSpread: 0.5 }),
    state: baselineState(),
    spread: 2.0,
  }), /SPREAD_EXCEEDS_MAX/);
});

test('rejects exposure breach', () => {
  assert.throws(() => riskManager.approve({
    signal: baselineSignal(),
    settings: baselineSettings({ maxAccountExposurePercent: 1 }),
    state: baselineState({ openRiskUSD: 500 }),
    spread: 0.2,
  }), /MAX_ACCOUNT_EXPOSURE/);
});

test('sizePosition respects risk and SL distance', () => {
  const r = riskManager.sizePosition({ equity: 10_000, riskPercent: 0.5, entry: 2000, stopLoss: 1995 });
  // risk = $50, sl dist = 5, contract = 100 -> lots = 0.1
  assert.equal(r.lotSize, 0.1);
  assert.equal(r.riskUSD, 50);
});