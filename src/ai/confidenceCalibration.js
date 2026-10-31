'use strict';

/**
 * Calibrates raw AI / strategy confidence against historical outcomes.
 *
 * The class is deliberately simple: it maintains bucketed hit rates in
 * memory and applies a shrinkage toward 0.5 with sample-size weighting.
 * This prevents a strategy that produced 3 wins from claiming 100%
 * confidence (§6: "Do not manufacture 90% confidence").
 *
 * Persistent calibration belongs in a later phase; for now the buckets
 * are rebuilt from Trade history by `hydrate()`.
 */

const Trade = require('../database/models/Trade');
const logger = require('../utils/logger');

const BUCKETS = 10;
const PRIOR_WEIGHT = 20; // shrinkage strength

class ConfidenceCalibration {
  constructor() {
    this.wins = new Array(BUCKETS).fill(0);
    this.losses = new Array(BUCKETS).fill(0);
    this.ready = false;
  }

  _bucket(p) {
    const clamped = Math.max(0, Math.min(0.999, p));
    return Math.floor(clamped * BUCKETS);
  }

  record(rawProbability, won) {
    const b = this._bucket(rawProbability);
    if (won) this.wins[b] += 1;
    else this.losses[b] += 1;
  }

  /**
   * Return a calibrated probability for a raw model confidence.
   * Applies Laplace-style shrinkage: (wins + a) / (n + a + b)
   * with a = b = PRIOR_WEIGHT/2 so small samples stay near 0.5.
   */
  calibrate(rawProbability) {
    if (!Number.isFinite(rawProbability)) return 0.5;
    const b = this._bucket(rawProbability);
    const w = this.wins[b];
    const l = this.losses[b];
    const n = w + l;
    if (n === 0) return Math.min(0.75, rawProbability * 0.7); // conservative prior
    const a = PRIOR_WEIGHT / 2;
    return Math.min(0.75, (w + a) / (n + PRIOR_WEIGHT));
  }

  async hydrate() {
    try {
      const trades = await Trade.find({
        status: 'CLOSED',
        netProfit: { $ne: null },
      }).select('netProfit signalProbability').lean();
      // signalProbability stored in Trade.executionResult.signalProbability
      // (already normalised). Fall back to 0.5 if absent.
      for (const t of trades) {
        const p = Number.isFinite(t.executionResult?.signalProbability)
          ? t.executionResult.signalProbability : 0.5;
        this.record(p, t.netProfit > 0);
      }
      this.ready = true;
      logger.info({ trades: trades.length }, 'calibration_hydrated');
    } catch (err) {
      logger.warn({ err: err.message }, 'calibration_hydrate_failed');
    }
  }

  snapshot() {
    return { wins: this.wins, losses: this.losses, ready: this.ready };
  }
}

const calibration = new ConfidenceCalibration();
module.exports = { calibration, ConfidenceCalibration };