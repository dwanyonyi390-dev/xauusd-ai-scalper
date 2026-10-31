// backtesting/walkForward.js
'use strict';
/**
 * Walk-forward skeleton (§19). Splits tick data into consecutive windows,
 * runs backtest on each. Real optimization belongs in a separate script;
 * this only reports in-sample vs out-of-sample consistency.
 */
const { runBacktest, loadTicks } = require('./backtest');

function splitWindows(ticks, windows = 4) {
  const size = Math.floor(ticks.length / windows);
  const out = [];
  for (let i = 0; i < windows; i += 1) {
    out.push(ticks.slice(i * size, i === windows - 1 ? ticks.length : (i + 1) * size));
  }
  return out;
}

function runWalkForward({ file, settings, windows = 4 }) {
  const ticks = loadTicks(file);
  const chunks = splitWindows(ticks, windows);
  return chunks.map((c, idx) => ({ window: idx + 1, ...runBacktest({ ticks: c, settings }) }));
}

module.exports = { runWalkForward, splitWindows };