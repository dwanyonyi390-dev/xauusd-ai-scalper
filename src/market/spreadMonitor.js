'use strict';

/**
 * Spread monitoring. Rejects trades when spread is abnormally wide.
 * Tracks a rolling average for baseline comparison.
 *
 * Used by the strategy layer as a hard gate before any order is emitted
 * to the MT5 agent. The agent ALSO enforces maxSpread locally (defence in
 * depth) — never rely on the cloud alone for a spread guard.
 */

const logger = require('../utils/logger');

class SpreadMonitor {
  constructor(symbol, maxSpread = null, windowSize = 300) {
    this.symbol = symbol;
    this.maxSpread = maxSpread; // hard cap (absolute, in price units)
    this.windowSize = windowSize;
    this.history = [];
    this.recentCount = 0;
    this.recentRejected = 0;
    this.lastSpread = null;
    this.lastUpdatedAt = null;
  }

  /**
   * Record an observed spread. Non-finite or negative values are ignored
   * (broker feed glitches should not pollute the baseline).
   */
  record(spread) {
    if (!Number.isFinite(spread) || spread < 0) {
      logger.debug({ spread, symbol: this.symbol }, 'spreadMonitor_ignored_invalid');
      return;
    }
    this.lastSpread = spread;
    this.lastUpdatedAt = Date.now();
    this.history.push(spread);
    if (this.history.length > this.windowSize) this.history.shift();
    this.recentCount += 1;
  }

  average() {
    if (this.history.length === 0) return null;
    let sum = 0;
    for (const s of this.history) sum += s;
    return sum / this.history.length;
  }

  median() {
    if (this.history.length === 0) return null;
    const sorted = [...this.history].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Decide whether a trade may proceed given the current spread.
   *
   * Returns:
   *   { ok: true,  spread, average, ratio }
   *   { ok: false, reason, spread, ...diagnostics }
   */
  check(spread, { maxRatioToAverage = 3, minSamplesForBaseline = 20 } = {}) {
    if (!Number.isFinite(spread) || spread <= 0) {
      return { ok: false, reason: 'INVALID_SPREAD', spread };
    }

    // 1. Hard absolute cap
    if (Number.isFinite(this.maxSpread) && spread > this.maxSpread) {
      this.recentRejected += 1;
      return {
        ok: false,
        reason: 'SPREAD_EXCEEDS_MAX',
        spread,
        maxSpread: this.maxSpread,
      };
    }

    // 2. Relative-to-baseline cap
    const avg = this.average();
    if (avg !== null && this.history.length >= minSamplesForBaseline && avg > 0) {
      const ratio = spread / avg;
      if (ratio > maxRatioToAverage) {
        this.recentRejected += 1;
        return {
          ok: false,
          reason: 'SPREAD_SPIKE',
          spread,
          average: avg,
          ratio,
          maxRatioToAverage,
        };
      }
      return { ok: true, spread, average: avg, ratio };
    }

    // 3. Insufficient baseline — only the hard cap applies
    return { ok: true, spread, average: avg, ratio: null };
  }

  /**
   * Is the feed stale? Used to avoid trading on a frozen price.
   */
  isStale(maxAgeMs = 10_000) {
    if (this.lastUpdatedAt == null) return true;
    return Date.now() - this.lastUpdatedAt > maxAgeMs;
  }

  snapshot() {
    return {
      symbol: this.symbol,
      lastSpread: this.lastSpread,
      average: this.average(),
      median: this.median(),
      samples: this.history.length,
      windowSize: this.windowSize,
      recentCount: this.recentCount,
      recentRejected: this.recentRejected,
      maxSpread: this.maxSpread,
      lastUpdatedAt: this.lastUpdatedAt,
    };
  }
}

// Singleton registry per symbol (mirrors marketData.js pattern)
const monitors = new Map();

function getSpreadMonitor(symbol, maxSpread = null) {
  if (!monitors.has(symbol)) monitors.set(symbol, new SpreadMonitor(symbol, maxSpread));
  const m = monitors.get(symbol);
  // allow late config of the hard cap
  if (maxSpread != null && m.maxSpread == null) m.maxSpread = maxSpread;
  return m;
}

module.exports = { SpreadMonitor, getSpreadMonitor };