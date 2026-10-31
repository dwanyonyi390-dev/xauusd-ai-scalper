'use strict';

/**
 * Volatility metrics: ATR-based, Bollinger bandwidth, spread/volatility ratio.
 * Used by the strategy to reject low-quality or dangerous conditions.
 */

const { atr, bollinger } = require('./technicalIndicators');

/**
 * Normalized volatility: ATR / price. Returns percentage.
 */
function normalizedAtr(atrValue, price) {
  if (!Number.isFinite(atrValue) || !Number.isFinite(price) || price <= 0) return null;
  return (atrValue / price) * 100;
}

/**
 * Spread-to-volatility ratio. If spread is large relative to ATR, the
 * expected edge per tick is poor — a key scalping filter.
 */
function spreadToVolatility(spread, atrValue) {
  if (!Number.isFinite(spread) || !Number.isFinite(atrValue) || atrValue <= 0) return null;
  return spread / atrValue;
}

/**
 * Bollinger bandwidth as a proxy for volatility expansion/contraction.
 */
function bandwidth(closes, period = 20, mult = 2) {
  const bb = bollinger(closes, period, mult);
  if (!bb) return null;
  return bb.bandwidth;
}

/**
 * Detect volatility expansion: current ATR is significantly above the
 * recent average ATR.
 */
function isVolatilityExpanding(highs, lows, closes, period = 14, expansionFactor = 1.5) {
  if (!Array.isArray(closes) || closes.length < period * 2 + 1) return false;
  const recentAtr = atr(highs, lows, closes, period);
  if (recentAtr === null) return false;

  const mid = Math.floor(closes.length / 2);
  const earlierAtr = atr(
    highs.slice(0, mid),
    lows.slice(0, mid),
    closes.slice(0, mid),
    period
  );
  if (earlierAtr === null || earlierAtr === 0) return false;
  return recentAtr > earlierAtr * expansionFactor;
}

/**
 * Volatility regime classification based on NORMALIZED ATR PERCENT.
 * Input is expected to be the output of normalizedAtr() (i.e. a percentage
 * such as 0.5 meaning 0.5% of price).
 *
 * Thresholds (percent of price):
 *   < 0.01%  DEAD     (essentially no movement — do not scalp)
 *   < 0.05%  LOW
 *   < 0.15%  NORMAL
 *   < 0.40%  HIGH     (scalping sweet spot for XAUUSD is roughly here)
 *   >= 0.40% EXTREME  (news-driven; widen stops or stand aside)
 */
function classifyVolatilityRegime(normalizedAtrPct) {
  if (!Number.isFinite(normalizedAtrPct)) return 'UNKNOWN';
  if (normalizedAtrPct < 0.01) return 'DEAD';
  if (normalizedAtrPct < 0.05) return 'LOW';
  if (normalizedAtrPct < 0.15) return 'NORMAL';
  if (normalizedAtrPct < 0.40) return 'HIGH';
  return 'EXTREME';
}

module.exports = {
  normalizedAtr,
  spreadToVolatility,
  bandwidth,
  isVolatilityExpanding,
  classifyVolatilityRegime,
};