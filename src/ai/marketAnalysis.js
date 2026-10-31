'use strict';

/**
 * Higher-level market analysis via OpenAI.
 * Called on a schedule (e.g. every 60–120s), NEVER per tick.
 *
 * Given a deterministic snapshot from technicalIndicators.computeSnapshot()
 * plus recent price action and current spread/volatility, ask the model
 * for a structured opinion. The output is ADVISORY ONLY — the risk manager
 * and strategy gates still have final say.
 */

const { chatJson } = require('./openaiClient');
const { SYSTEM_MARKET } = require('./prompts');
const logger = require('../utils/logger');

function _compactSnapshot(snapshot, series, spread, spreadAvg) {
  const recent = series.closes.slice(-30);
  return {
    lastPrice: recent[recent.length - 1] ?? null,
    last30Closes: recent,
    spread,
    spreadAvg,
    ema5: snapshot.ema5,
    ema9: snapshot.ema9,
    ema20: snapshot.ema20,
    ema50: snapshot.ema50,
    rsi14: snapshot.rsi14,
    macd: snapshot.macd,
    atr14: snapshot.atr14,
    bollinger: snapshot.bollinger,
    adx: snapshot.adx,
    velocity: snapshot.velocity,
    acceleration: snapshot.acceleration,
    swingLevels: snapshot.swingLevels,
  };
}

async function analyzeMarket({ symbol, snapshot, series, spread, spreadAvg }) {
  const payload = _compactSnapshot(snapshot, series, spread, spreadAvg);
  const user = `Symbol: ${symbol}\nSnapshot:\n${JSON.stringify(payload)}\n\nAnalyse and return JSON as specified.`;

  let result;
  try {
    result = await chatJson({ system: SYSTEM_MARKET, user });
  } catch (err) {
    logger.warn({ err: err.message }, 'marketAnalysis_ai_failed');
    return {
      ok: false,
      error: err.message,
      direction: 'NO_TRADE',
      confidence: 0,
      rejection_reasons: ['AI_UNAVAILABLE'],
    };
  }

  // Sanitise output; never trust the model's schema
  const direction = ['BUY', 'SELL', 'NO_TRADE'].includes(result.direction)
    ? result.direction : 'NO_TRADE';
  const confidence = Number.isFinite(result.confidence)
    ? Math.max(0, Math.min(0.75, result.confidence)) : 0;

  return {
    ok: true,
    direction,
    confidence,
    expected_net_reward_usd: Number.isFinite(result.expected_net_reward_usd) ? result.expected_net_reward_usd : null,
    estimated_cost_usd: Number.isFinite(result.estimated_cost_usd) ? result.estimated_cost_usd : null,
    risk_reward_ratio: Number.isFinite(result.risk_reward_ratio) ? result.risk_reward_ratio : null,
    market_regime: typeof result.market_regime === 'string' ? result.market_regime.slice(0, 64) : null,
    supporting_evidence: Array.isArray(result.supporting_evidence)
      ? result.supporting_evidence.slice(0, 12) : [],
    rejection_reasons: Array.isArray(result.rejection_reasons)
      ? result.rejection_reasons.slice(0, 12).map(String) : [],
    raw: result,
  };
}

module.exports = { analyzeMarket };