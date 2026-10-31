'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../src/trading/signalValidator');

const settings = { minSignalQuality: 40 };

function goodSignal(overrides = {}) {
  return {
    signalId: 's1',
    symbol: 'XAUUSD',
    direction: 'BUY',
    createdAt: new Date().toISOString(),
    entryPrice: 2000,
    stopLoss: 1995,
    takeProfit: 2005,
    estimatedCostUSD: 1,
    expectedRewardUSD: 50,
    riskRewardRatio: 1.5,
    strategyVersion: 'test',
    entryConditions: { spreadRatioToAvg: 1.2 },
    _meta: { quality: 60, spread: 0.2 },
    ...overrides,
  };
}

test('accepts a valid BUY', () => {
  const r = validate(goodSignal(), settings);
  assert.equal(r.ok, true);
});

test('rejects BUY with SL above entry', () => {
  const r = validate(goodSignal({ stopLoss: 2001 }), settings);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('SL_NOT_BELOW')));
});

test('rejects when quality below min', () => {
  const r = validate(goodSignal({ _meta: { quality: 20, spread: 0.2 } }), settings);
  assert.equal(r.ok, false);
});

test('rejects when cost >= reward', () => {
  const r = validate(goodSignal({ estimatedCostUSD: 60, expectedRewardUSD: 50 }), settings);
  assert.equal(r.ok, false);
});

test('NO_TRADE passes without geometry', () => {
  const r = validate(goodSignal({ direction: 'NO_TRADE', entryPrice: null, stopLoss: null, takeProfit: null }), settings);
  assert.equal(r.ok, true);
});