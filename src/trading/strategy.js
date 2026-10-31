'use strict';

/**
 * Deterministic scalping strategy.
 *
 * Inputs (pure, no side effects):
 *   - store:     MarketDataStore  (src/market/marketData.js)
 *   - settings:  plain object     (subset of TradingSettings)
 *   - spread:    number | null    (current spread, price units)
 *   - sessions:  { allowed, active } (from sessionManager.describe)
 *   - newsBlock: { blocked, reason, event } (from economicCalendar.checkBlackout)
 *
 * Output: a signal object compatible with SignalSchema (utils/validation.js).
 *         When direction === 'NO_TRADE', `rejectionReasons` explains why.
 *
 * Design (§3, §4, §6):
 *   - 1-second buckets are primary; higher TFs (when available) veto only.
 *   - Multiple indicators must agree; no single indicator is a signal.
 *   - Hard rejects short-circuit to NO_TRADE.
 *   - Quality score (0-100) is compared against settings.minSignalQuality
 *     by signalValidator, not here — the strategy reports raw quality.
 *
 * STRATEGY_VERSION is stamped on every signal for reproducibility (§13).
 */

const { randomUUID } = require('crypto');
const indicators = require('../market/technicalIndicators');
const priceAction = require('../market/priceAction');
const volatility = require('../market/volatility');
const logger = require('../utils/logger');

const STRATEGY_VERSION = '0.6.0-phase6';

const DEFAULTS = Object.freeze({
  lookbackSeconds: 60,       // how many 1s buckets feed indicators
  minSeriesLength: 20,       // below this -> not enough data
  slAtrMultiple: 1.5,        // SL = entry ± ATR * 1.5
  tpAtrMultiple: 2.5,        // TP = entry ± ATR * 2.5  (RR ≈ 1.67)
  maxSpreadToAtr: 0.25,      // spread > 25% of ATR -> reject
  minRR: 1.2,
});

// ── Helpers ────────────────────────────────────────────────────────────────

function nowIso() { return new Date().toISOString(); }

function baseSignal(partial) {
  return {
    signalId: randomUUID(),
    symbol: 'XAUUSD',
    direction: 'NO_TRADE',
    createdAt: nowIso(),
    entryConditions: {},
    entryPrice: null,
    stopLoss: null,
    takeProfit: null,
    expectedRewardUSD: null,
    estimatedCostUSD: null,
    riskRewardRatio: null,
    probability: null,
    marketRegime: null,
    supportingEvidence: [],
    rejectionReasons: [],
    strategyVersion: STRATEGY_VERSION,
    aiTraceId: null,
    // internal (not persisted on SignalSchema, but useful to caller)
    _meta: { quality: 0, warnings: [], hardRejects: [] },
    ...partial,
  };
}

function hardReject(sig, reason) {
  sig.direction = 'NO_TRADE';
  sig.rejectionReasons.push(reason);
  sig._meta.hardRejects.push(reason);
  return sig;
}

function evidence(sig, type, label, value, weight = 0) {
  sig.supportingEvidence.push({ type, label, value, weight: Math.max(0, Math.min(1, weight)) });
}

// ── Hard gates (checked first; any failure -> NO_TRADE) ────────────────────

function hardGates(ctx, sig) {
  const { spread, settings, sessions, newsBlock, series, atr } = ctx;

  // 1. Session must be allowed
  if (sessions && sessions.allowed === false) {
    return hardReject(sig, 'SESSION_CLOSED');
  }

  // 2. News blackout
  if (newsBlock && newsBlock.blocked) {
    sig.rejectionReasons.push(`NEWS_BLACKOUT:${newsBlock.reason}`);
    sig._meta.hardRejects.push('NEWS_BLACKOUT');
    if (newsBlock.event) {
      sig.entryConditions.newsBlockEvent = newsBlock.event;
    }
    sig.direction = 'NO_TRADE';
    return sig;
  }

  // 3. Enough data
  if (!series || series.closes.length < DEFAULTS.minSeriesLength) {
    return hardReject(sig, 'INSUFFICIENT_DATA');
  }

  // 4. Valid spread
  if (!Number.isFinite(spread) || spread <= 0) {
    return hardReject(sig, 'INVALID_SPREAD');
  }

  // 5. Max spread vs settings
  if (Number.isFinite(settings.maxSpread) && spread > settings.maxSpread) {
    return hardReject(sig, 'SPREAD_EXCEEDS_MAX');
  }

  // 6. Spread vs ATR
  if (atr && atr > 0) {
    const ratio = spread / atr;
    sig.entryConditions.spreadToAtr = Number(ratio.toFixed(4));
    if (ratio > DEFAULTS.maxSpreadToAtr) {
      return hardReject(sig, 'SPREAD_TOO_WIDE_FOR_ATR');
    }
  }

  // 7. Volatility regime
  if (!atr || atr <= 0) {
    return hardReject(sig, 'NO_ATR');
  }
  const lastPrice = series.closes[series.closes.length - 1];
  const normAtr = volatility.normalizedAtr(atr, lastPrice);
  const regime = volatility.classifyVolatilityRegime(normAtr);
  sig.marketRegime = regime;
  sig.entryConditions.normalizedAtrPct = Number.isFinite(normAtr) ? Number(normAtr.toFixed(4)) : null;

  if (regime === 'DEAD' || regime === 'EXTREME') {
    return hardReject(sig, `VOLATILITY_REGIME_${regime}`);
  }

  return sig; // pass
}

// ── Direction discovery (returns 'BUY' | 'SELL' | null) ────────────────────

function discoverDirection(series) {
  const { closes, highs, lows, timestampsMs } = series;

  const ema5 = indicators.ema(closes, 5);
  const ema9 = indicators.ema(closes, 9);
  const ema20 = indicators.ema(closes, 20);
  if (ema5 === null || ema9 === null || ema20 === null) return null;

  const structure = priceAction.classifyStructure(
    closes.map((c, i) => ({ open: closes[i - 1] ?? c, high: highs[i], low: lows[i], close: c })),
    3
  );

  // Rule: EMA stack AND structure must agree
  const bullStack = ema5 > ema9 && ema9 > ema20;
  const bearStack = ema5 < ema9 && ema9 < ema20;

  if (bullStack && (structure === 'UPTREND' || structure === 'RANGE')) return 'BUY';
  if (bearStack && (structure === 'DOWNTREND' || structure === 'RANGE')) return 'SELL';

  // Fallback: breakout-based direction
  const candles = closes.map((c, i) => ({
    open: closes[i - 1] ?? c, high: highs[i], low: lows[i], close: c,
  }));
  const breakout = priceAction.detectBreakout(candles, 10, 0.0001);
  if (breakout) return breakout.type === 'BULLISH' ? 'BUY' : 'SELL';

  // Last resort: velocity sign
  const v = indicators.velocity(closes, timestampsMs);
  if (v !== null && Math.abs(v) > 0) return v > 0 ? 'BUY' : 'SELL';

  return null;
}

// ── Quality scoring (0-100) ────────────────────────────────────────────────

function scoreQuality(ctx, sig, direction) {
  const { series, atr, spread, snapshot, candles } = ctx;
  const s = { trend: 0, momentum: 0, priceAction: 0, breakout: 0, volRegime: 0, spreadQ: 0, rr: 0, sl: 0 };

  // 1. Trend alignment (15)
  if (snapshot.ema5 && snapshot.ema9 && snapshot.ema20) {
    if (direction === 'BUY' && snapshot.ema5 > snapshot.ema9 && snapshot.ema9 > snapshot.ema20) s.trend = 15;
    else if (direction === 'SELL' && snapshot.ema5 < snapshot.ema9 && snapshot.ema9 < snapshot.ema20) s.trend = 15;
    else s.trend = 5; // partial
  }

  // 2. Momentum (15): RSI not in dead zone + MACD sign agrees
  if (snapshot.rsi14 !== null && snapshot.macd) {
    const rsiAligned = direction === 'BUY' ? snapshot.rsi14 > 55 : snapshot.rsi14 < 45;
    const macdAligned = direction === 'BUY'
      ? snapshot.macd.histogram > 0
      : snapshot.macd.histogram < 0;
    if (rsiAligned && macdAligned) s.momentum = 15;
    else if (rsiAligned || macdAligned) s.momentum = 7;
  }

  // 3. Price action pattern (20)
  if (candles && candles.length >= 2) {
    const pat = priceAction.detectPattern(candles);
    const bullish = ['BULLISH_ENGULFING', 'HAMMER'];
    const bearish = ['BEARISH_ENGULFING', 'SHOOTING_STAR'];
    if (direction === 'BUY' && bullish.includes(pat)) s.priceAction = 20;
    else if (direction === 'SELL' && bearish.includes(pat)) s.priceAction = 20;
    else if (pat) s.priceAction = 5; // pattern present but opposite direction
    sig.entryConditions.detectedPattern = pat;
  }

  // 4. Breakout confirmation (15)
  if (candles && candles.length >= 11) {
    const bo = priceAction.detectBreakout(candles, 10, 0.0001);
    if (bo && ((direction === 'BUY' && bo.type === 'BULLISH') || (direction === 'SELL' && bo.type === 'BEARISH'))) {
      s.breakout = 15;
      sig.entryConditions.breakoutLevel = bo.level;
    }
  }

  // 5. Volatility regime (10)
  if (sig.marketRegime === 'NORMAL') s.volRegime = 10;
  else if (sig.marketRegime === 'HIGH') s.volRegime = 5;   // tradable, but riskier

  // 6. Spread vs average (10)
  const spreadRatio = ctx.spreadAvg && ctx.spreadAvg > 0 ? spread / ctx.spreadAvg : null;
  if (spreadRatio !== null) {
    if (spreadRatio < 1.5) s.spreadQ = 10;
    else if (spreadRatio < 2.0) s.spreadQ = 5;
    sig.entryConditions.spreadRatioToAvg = Number(spreadRatio.toFixed(2));
  }

  // 7. Reward/Risk (5)
  const rr = sig.riskRewardRatio;
  if (rr !== null && rr >= 1.5) s.rr = 5;
  else if (rr !== null && rr >= 1.2) s.rr = 2;

  // 8. SL feasibility vs spread (5)
  if (atr && spread > 0) {
    const slDist = atr * DEFAULTS.slAtrMultiple;
    if (slDist > spread * 10) s.sl = 5;
    else if (slDist > spread * 4) s.sl = 2;
  }

  const total = Object.values(s).reduce((a, b) => a + b, 0);
  sig.entryConditions.qualityBreakdown = s;
  sig._meta.quality = total;
  return total;
}

// ── Build trade geometry (entry, SL, TP, RR) ──────────────────────────────

function buildGeometry(sig, direction, lastPrice, atr, spread) {
  const entry = direction === 'BUY' ? lastPrice + spread : lastPrice; // pay the spread
  const slDist = atr * DEFAULTS.slAtrMultiple;
  const tpDist = atr * DEFAULTS.tpAtrMultiple;

  const sl = direction === 'BUY' ? entry - slDist : entry + slDist;
  const tp = direction === 'BUY' ? entry + tpDist : entry - tpDist;

  const rr = slDist > 0 ? tpDist / slDist : null;

  sig.entryPrice = Number(entry.toFixed(5));
  sig.stopLoss = Number(sl.toFixed(5));
  sig.takeProfit = Number(tp.toFixed(5));
  sig.riskRewardRatio = rr !== null ? Number(rr.toFixed(3)) : null;

  // estimated cost = spread * contract_units (for XAUUSD 1 lot = 100 oz)
  // We report cost-per-lot in USD using 100 oz assumption; agent reconciles.
  const contractOz = 100;
  sig.estimatedCostUSD = Number((spread * contractOz).toFixed(2));

  // expected reward for 1 lot
  sig.expectedRewardUSD = Number((tpDist * contractOz).toFixed(2));
}

// ── Main entry point ──────────────────────────────────────────────────────

/**
 * @param {object} store   MarketDataStore instance
 * @param {object} settings  subset of TradingSettings (fields actually used)
 * @param {object} context   { spread, sessions, newsBlock, spreadAvg }
 * @returns {object} signal (SignalSchema-compatible)
 */
function evaluate(store, settings, context = {}) {
  const t0 = Date.now();

  // Snapshot the market
  const series = store.getSeries(DEFAULTS.lookbackSeconds);
  const snapshot = indicators.computeSnapshot(series);

  // Build candle view (1s buckets -> candles)
  const candles = series.closes.map((c, i) => ({
    open: series.opens[i] ?? c,
    high: series.highs[i],
    low: series.lows[i],
    close: c,
  }));

  const ctx = {
    store,
    settings,
    spread: context.spread,
    spreadAvg: context.spreadAvg ?? null,
    sessions: context.sessions ?? null,
    newsBlock: context.newsBlock ?? null,
    series,
    snapshot,
    candles,
    atr: snapshot.atr14,
  };

  const sig = baseSignal({ symbol: settings.symbol || 'XAUUSD' });
  sig.entryConditions.strategyVersion = STRATEGY_VERSION;

  // Hard gates first
  hardGates(ctx, sig);
  if (sig.direction === 'NO_TRADE') {
    sig._meta.elapsedMs = Date.now() - t0;
    return sig;
  }

  // Direction discovery
  const direction = discoverDirection(series);
  if (!direction) {
    hardReject(sig, 'NO_DIRECTION');
    sig._meta.elapsedMs = Date.now() - t0;
    return sig;
  }
  sig.direction = direction;

  // Geometry
  const lastPrice = series.closes[series.closes.length - 1];
  buildGeometry(sig, direction, lastPrice, ctx.atr, ctx.spread);

  // RR hard check
  if (sig.riskRewardRatio === null || sig.riskRewardRatio < DEFAULTS.minRR) {
    hardReject(sig, `RR_TOO_LOW:${sig.riskRewardRatio}`);
    sig.direction = 'NO_TRADE';
    sig._meta.elapsedMs = Date.now() - t0;
    return sig;
  }

  // Quality scoring
  scoreQuality(ctx, sig, direction);

  // Populate evidence
  evidence(sig, 'INDICATOR', 'ema_stack', {
    ema5: snapshot.ema5, ema9: snapshot.ema9, ema20: snapshot.ema20,
  }, 0.3);
  evidence(sig, 'INDICATOR', 'rsi14', snapshot.rsi14, 0.2);
  evidence(sig, 'INDICATOR', 'macd_histogram', snapshot.macd?.histogram ?? null, 0.2);
  evidence(sig, 'INDICATOR', 'atr14', snapshot.atr14, 0.2);
  evidence(sig, 'PRICE_ACTION', 'market_structure', sig.entryConditions.detectedPattern || null, 0.2);

  sig._meta.elapsedMs = Date.now() - t0;

  // Log every evaluated signal for auditability (§15)
  logger.info({
    signalId: sig.signalId,
    symbol: sig.symbol,
    direction: sig.direction,
    quality: sig._meta.quality,
    regime: sig.marketRegime,
    rr: sig.riskRewardRatio,
    rejects: sig._meta.hardRejects,
    elapsedMs: sig._meta.elapsedMs,
  }, 'strategy_evaluated');

  return sig;
}

module.exports = { evaluate, STRATEGY_VERSION, DEFAULTS };