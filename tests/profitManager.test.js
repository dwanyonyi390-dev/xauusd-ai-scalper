'use strict';
const test = require('node:test');
const assert = require('node:assert');
const profitManager = require('../src/trading/profitManager');

function baseInputs(overrides = {}) {
  return {
    trade: { direction: 'BUY', entryPrice: 2000, lotSize: 0.01, stopLoss: 1990, takeProfit: null },
    market: { bid: 2001, ask: 2001.2, spread: 0.2 },
    account: { commissionPerLot: 7, swapUSD: 0 },
    settings: { defaultProfitTarget: 0.5, maxHoldSeconds: 60 },
    snapshot: {},
    tradeState: { openedAt: Date.now() - 10_000 },
    ...overrides,
  };
}

test('exits at profit target on net profit', () => {
  // 1 point * 0.01 lot * 100 oz = $1 gross, commission $0.07, net $0.93 > $0.5 target
  const r = profitManager.evaluateExit(baseInputs());
  assert.equal(r.exit, true);
  assert.equal(r.reason, 'PROFIT_TARGET');
});

test('does not exit when below net target', () => {
  const r = profitManager.evaluateExit(baseInputs({
    market: { bid: 2000.05, ask: 2000.25, spread: 0.2 },
  }));
  assert.equal(r.exit, false);
});

test('stop loss hit triggers exit', () => {
  const r = profitManager.evaluateExit(baseInputs({
    market: { bid: 1989, ask: 1989.2, spread: 0.2 },
  }));
  assert.equal(r.reason, 'STOP_LOSS');
});

test('max hold triggers exit', () => {
  const r = profitManager.evaluateExit(baseInputs({
    market: { bid: 2000.1, ask: 2000.3, spread: 0.2 },
    tradeState: { openedAt: Date.now() - 120_000 },
  }));
  assert.equal(r.reason, 'MAX_HOLD');
});

test('emergency triggers exit', () => {
  const r = profitManager.evaluateExit(baseInputs({
    settings: { defaultProfitTarget: 1000, maxHoldSeconds: 3600, emergency: true },
  }));
  assert.equal(r.reason, 'EMERGENCY');
});