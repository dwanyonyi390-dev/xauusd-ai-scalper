'use strict';

/**
 * Price-action analysis: candlestick patterns, market structure, micro
 * breakouts/pullbacks. Deterministic — no ML here. The AI layer consumes
 * these structured observations but does not replace them.
 */

function body(candle) {
  return Math.abs(candle.close - candle.open);
}

function range(candle) {
  return candle.high - candle.low;
}

function upperWick(candle) {
  return candle.high - Math.max(candle.open, candle.close);
}

function lowerWick(candle) {
  return Math.min(candle.open, candle.close) - candle.low;
}

function isBullish(candle) {
  return candle.close > candle.open;
}

function isBearish(candle) {
  return candle.close < candle.open;
}

// ============================================================================
// CANDLE PATTERNS
// ============================================================================

function isDoji(candle, bodyRatio = 0.1) {
  const r = range(candle);
  if (r <= 0) return false;
  return body(candle) / r <= bodyRatio;
}

function isHammer(candle) {
  const r = range(candle);
  if (r <= 0) return false;
  const lw = lowerWick(candle);
  const uw = upperWick(candle);
  return lw >= 2 * body(candle) && uw <= body(candle) * 0.5;
}

function isShootingStar(candle) {
  const r = range(candle);
  if (r <= 0) return false;
  const lw = lowerWick(candle);
  const uw = upperWick(candle);
  return uw >= 2 * body(candle) && lw <= body(candle) * 0.5;
}

function isBullishEngulfing(prev, curr) {
  return (
    isBearish(prev) &&
    isBullish(curr) &&
    curr.close > prev.open &&
    curr.open < prev.close
  );
}

function isBearishEngulfing(prev, curr) {
  return (
    isBullish(prev) &&
    isBearish(curr) &&
    curr.close < prev.open &&
    curr.open > prev.close
  );
}

function isInsideBar(prev, curr) {
  return curr.high <= prev.high && curr.low >= prev.low;
}

function detectPattern(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return null;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  if (isBullishEngulfing(prev, curr)) return 'BULLISH_ENGULFING';
  if (isBearishEngulfing(prev, curr)) return 'BEARISH_ENGULFING';
  if (isHammer(curr)) return 'HAMMER';
  if (isShootingStar(curr)) return 'SHOOTING_STAR';
  if (isDoji(curr)) return 'DOJI';
  if (isInsideBar(prev, curr)) return 'INSIDE_BAR';
  return null;
}

// ============================================================================
// MARKET STRUCTURE
// ============================================================================

/**
 * Classify market structure using recent swing highs/lows.
 * Returns: 'UPTREND' | 'DOWNTREND' | 'RANGE' | 'CHOP'
 */
function classifyStructure(candles, lookback = 5) {
  if (!Array.isArray(candles) || candles.length < lookback * 2) return null;

  const highs = [];
  const lows = [];
  for (let i = lookback; i < candles.length - lookback; i += 1) {
    let isH = true;
    let isL = true;
    for (let j = 1; j <= lookback; j += 1) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isH = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isL = false;
    }
    if (isH) highs.push(candles[i].high);
    if (isL) lows.push(candles[i].low);
  }

  if (highs.length < 2 || lows.length < 2) return 'CHOP';

  const higherHighs = highs[highs.length - 1] > highs[highs.length - 2];
  const higherLows = lows[lows.length - 1] > lows[lows.length - 2];
  const lowerHighs = highs[highs.length - 1] < highs[highs.length - 2];
  const lowerLows = lows[lows.length - 1] < lows[lows.length - 2];

  if (higherHighs && higherLows) return 'UPTREND';
  if (lowerHighs && lowerLows) return 'DOWNTREND';
  return 'RANGE';
}

// ============================================================================
// MICRO BREAKOUT / PULLBACK
// ============================================================================

/**
 * Detect a micro breakout: close beyond the recent range.
 * Returns { type: 'BULLISH'|'BEARISH', level } or null.
 */
function detectBreakout(candles, lookback = 10, bufferTicks = 0.0001) {
  if (!Array.isArray(candles) || candles.length < lookback + 1) return null;
  const recent = candles.slice(-lookback - 1, -1);
  const curr = candles[candles.length - 1];
  const recentHigh = Math.max(...recent.map((c) => c.high));
  const recentLow = Math.min(...recent.map((c) => c.low));

  if (curr.close > recentHigh + bufferTicks) {
    return { type: 'BULLISH', level: recentHigh };
  }
  if (curr.close < recentLow - bufferTicks) {
    return { type: 'BEARISH', level: recentLow };
  }
  return null;
}

/**
 * Detect a pullback within a trend: a retrace against the dominant direction
 * followed by a potential resumption candle.
 */
function detectPullback(candles, trend, lookback = 5) {
  if (!Array.isArray(candles) || candles.length < lookback + 2) return null;
  const recent = candles.slice(-lookback - 1, -1);
  const curr = candles[candles.length - 1];

  if (trend === 'UPTREND') {
    const pullback = recent.some((c) => isBearish(c));
    if (pullback && isBullish(curr) && curr.close > recent[recent.length - 1].high) {
      return { type: 'BUY_PULLBACK' };
    }
  } else if (trend === 'DOWNTREND') {
    const pullback = recent.some((c) => isBullish(c));
    if (pullback && isBearish(curr) && curr.close < recent[recent.length - 1].low) {
      return { type: 'SELL_PULLBACK' };
    }
  }
  return null;
}

// ============================================================================
// REVERSAL DETECTION
// ============================================================================

/**
 * Detect exhaustion / reversal: a strong candle followed by rejection.
 */
function detectReversal(candles) {
  if (!Array.isArray(candles) || candles.length < 3) return null;
  const [a, b, c] = candles.slice(-3);

  // Bullish exhaustion → potential bearish reversal
  if (isBullish(a) && isBullish(b) && isShootingStar(c)) {
    return { type: 'BEARISH_REVERSAL', strength: 'MEDIUM' };
  }
  // Bearish exhaustion → potential bullish reversal
  if (isBearish(a) && isBearish(b) && isHammer(c)) {
    return { type: 'BULLISH_REVERSAL', strength: 'MEDIUM' };
  }
  // Engulfing at the end
  if (isBullishEngulfing(b, c)) return { type: 'BULLISH_REVERSAL', strength: 'STRONG' };
  if (isBearishEngulfing(b, c)) return { type: 'BEARISH_REVERSAL', strength: 'STRONG' };
  return null;
}

module.exports = {
  body,
  range,
  upperWick,
  lowerWick,
  isBullish,
  isBearish,
  isDoji,
  isHammer,
  isShootingStar,
  isBullishEngulfing,
  isBearishEngulfing,
  isInsideBar,
  detectPattern,
  classifyStructure,
  detectBreakout,
  detectPullback,
  detectReversal,
};