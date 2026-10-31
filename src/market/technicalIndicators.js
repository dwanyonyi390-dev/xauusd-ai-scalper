'use strict';

/**
 * Deterministic indicator math. No external library — these are well-known
 * algorithms implemented carefully to avoid division-by-zero and NaN.
 *
 * All functions return `null` when there is insufficient data rather than
 * throwing, so callers can treat "no signal" uniformly.
 */

// ============================================================================
// BASIC MOVING AVERAGES
// ============================================================================

function sma(values, period) {
  if (!Array.isArray(values) || values.length < period || period < 1) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i += 1) sum += values[i];
  return sum / period;
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period || period < 1) return null;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i += 1) prev += values[i];
  prev /= period;
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

// ============================================================================
// RSI
// ============================================================================

function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ============================================================================
// MACD
// ============================================================================

function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  if (!Array.isArray(values) || values.length < slow + signalPeriod) return null;
  const macdLine = [];
  for (let i = slow; i <= values.length; i += 1) {
    const slice = values.slice(0, i);
    const f = ema(slice, fast);
    const s = ema(slice, slow);
    if (f === null || s === null) continue;
    macdLine.push(f - s);
  }
  if (macdLine.length < signalPeriod) return null;
  const signalLine = ema(macdLine, signalPeriod);
  const macdVal = macdLine[macdLine.length - 1];
  return {
    macd: macdVal,
    signal: signalLine,
    histogram: macdVal - (signalLine ?? 0),
  };
}

// ============================================================================
// ATR
// ============================================================================

function atr(highs, lows, closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i += 1) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trs.push(Math.max(hl, hc, lc));
  }
  return ema(trs, period);
}

// ============================================================================
// BOLLINGER BANDS
// ============================================================================

function bollinger(values, period = 20, mult = 2) {
  if (!Array.isArray(values) || values.length < period) return null;
  const slice = values.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  let variance = 0;
  for (const v of slice) variance += (v - mean) ** 2;
  variance /= period;
  const sd = Math.sqrt(variance);
  return {
    upper: mean + mult * sd,
    middle: mean,
    lower: mean - mult * sd,
    bandwidth: sd > 0 ? (2 * mult * sd) / mean : 0,
  };
}

// ============================================================================
// ADX
// ============================================================================

function adx(highs, lows, closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period * 2 + 1) return null;

  const plusDM = [];
  const minusDM = [];
  const trs = [];

  for (let i = 1; i < closes.length; i += 1) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    trs.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
    );
  }

  const smoothPlus = ema(plusDM, period);
  const smoothMinus = ema(minusDM, period);
  const smoothTR = ema(trs, period);

  if (!smoothTR || smoothTR === 0) return null;

  const plusDI = (smoothPlus / smoothTR) * 100;
  const minusDI = (smoothMinus / smoothTR) * 100;
  const denom = plusDI + minusDI;
  if (denom === 0) return null;

  const dx = (Math.abs(plusDI - minusDI) / denom) * 100;

  // ADX is EMA of DX. We approximate with single DX if insufficient history.
  return {
    adx: dx,
    plusDI,
    minusDI,
  };
}

// ============================================================================
// VWAP (session-based; needs cumulative volume)
// ============================================================================

function vwap(prices, volumes) {
  if (!Array.isArray(prices) || !Array.isArray(volumes)) return null;
  if (prices.length !== volumes.length || prices.length === 0) return null;
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < prices.length; i += 1) {
    pv += prices[i] * volumes[i];
    vol += volumes[i];
  }
  if (vol === 0) return null;
  return pv / vol;
}

// ============================================================================
// SUPPORT / RESISTANCE (pivot-based, deterministic)
// ============================================================================

function pivotPoints(high, low, close) {
  const pivot = (high + low + close) / 3;
  return {
    pivot,
    r1: 2 * pivot - low,
    s1: 2 * pivot - high,
    r2: pivot + (high - low),
    s2: pivot - (high - low),
    r3: high + 2 * (pivot - low),
    s3: low - 2 * (high - pivot),
  };
}

/**
 * Detect local support/resistance from a series of highs/lows using
 * simple swing-point detection. Returns the last N levels.
 */
function swingLevels(highs, lows, lookback = 3, maxLevels = 6) {
  const levels = [];
  const n = Math.min(highs.length, lows.length);
  if (n < lookback * 2 + 1) return levels;

  for (let i = lookback; i < n - lookback; i += 1) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j += 1) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
    }
    if (isHigh) levels.push({ type: 'RESISTANCE', price: highs[i], index: i });
    if (isLow) levels.push({ type: 'SUPPORT', price: lows[i], index: i });
  }
  return levels.slice(-maxLevels);
}

// ============================================================================
// PRICE VELOCITY / MOMENTUM
// ============================================================================

/**
 * Rate of change over the last `period` samples.
 * Returns percent change per second if timestamps are provided.
 */
function velocity(prices, timestampsMs) {
  if (!Array.isArray(prices) || prices.length < 2) return null;
  if (Array.isArray(timestampsMs) && timestampsMs.length === prices.length) {
    const dtSec = (timestampsMs[timestampsMs.length - 1] - timestampsMs[0]) / 1000;
    if (dtSec <= 0) return null;
    return (prices[prices.length - 1] - prices[0]) / dtSec;
  }
  return prices[prices.length - 1] - prices[0];
}

/**
 * Simple acceleration: change in velocity.
 */
function acceleration(prices, timestampsMs) {
  if (!Array.isArray(prices) || prices.length < 3) return null;
  const mid = Math.floor(prices.length / 2);
  const firstHalf = prices.slice(0, mid);
  const secondHalf = prices.slice(mid);
  const t1 = Array.isArray(timestampsMs) ? timestampsMs.slice(0, mid) : undefined;
  const t2 = Array.isArray(timestampsMs) ? timestampsMs.slice(mid) : undefined;
  const v1 = velocity(firstHalf, t1);
  const v2 = velocity(secondHalf, t2);
  if (v1 === null || v2 === null) return null;
  return v2 - v1;
}

// ============================================================================
// COMPOSITE ANALYSIS (convenience)
// ============================================================================

/**
 * Compute a full indicator snapshot from OHLC arrays.
 * Returns null for any indicator lacking data.
 */
function computeSnapshot({ highs, lows, closes, volumes, timestampsMs }) {
  const snapshot = {
    ema5: ema(closes, 5),
    ema9: ema(closes, 9),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    atr14: atr(highs, lows, closes, 14),
    bollinger: bollinger(closes, 20, 2),
    adx: adx(highs, lows, closes, 14),
    vwap: volumes ? vwap(closes, volumes) : null,
    velocity: velocity(closes, timestampsMs),
    acceleration: acceleration(closes, timestampsMs),
    swingLevels: swingLevels(highs, lows, 3, 6),
  };
  return snapshot;
}

module.exports = {
  sma,
  ema,
  rsi,
  macd,
  atr,
  bollinger,
  adx,
  vwap,
  pivotPoints,
  swingLevels,
  velocity,
  acceleration,
  computeSnapshot,
};