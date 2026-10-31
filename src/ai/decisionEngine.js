'use strict';

/**
 * Central decision engine (§6).
 *
 * Combines:
 *   1. Deterministic strategy signal (src/trading/strategy.js)
 *   2. AI market analysis (src/ai/marketAnalysis.js) — ADVISORY only
 *   3. AI news bias (src/ai/newsAnalysis.js) — can reinforce a veto
 *   4. Calibrated probability (src/ai/confidenceCalibration.js)
 *
 * Output: a final decision of shape
 *   { action: 'BUY' | 'SELL' | 'NO_TRADE', signal, reasons, probability, evidence }
 *
 * Hard rules (§6, §9):
 *   - The strategy signal has final say over direction, unless it is NO_TRADE.
 *   - AI may NOT flip a strategy BUY into a SELL — it can only:
 *       a) VETO a strategy signal (downgrade to NO_TRADE)
 *       b) Slightly increase/decrease confidence
 *   - If AI is unavailable, strategy signal passes with reduced probability.
 *   - If news bias strongly opposes the strategy direction, VETO.
 *   - Calibrated probability is stamped on the signal for the risk manager.
 */

const strategy = require('../trading/strategy');
const { analyzeMarket } = require('./marketAnalysis');
const { analyzeNews } = require('./newsAnalysis');
const { calibration } = require('./confidenceCalibration');
const economicCalendar = require('../market/economicCalendar');
const logger = require('../utils/logger');

const OPPOSE_VETO_THRESHOLD = 0.6;      // news confidence to veto opposing
const AI_VETO_THRESHOLD = 0.55;         // AI confidence to veto strategy
const MIN_CALIBRATED_PROBABILITY = 0.45;

async function decide({ store, settings, spread, spreadAvg, sessions }) {
  const t0 = Date.now();

  // 1. News blackout check
  const newsBlock = await economicCalendar.checkBlackout({
    beforeMinutes: Math.ceil((settings.newsBlackoutSeconds || 900) / 60),
    afterMinutes: 5,
    minImportance: 'HIGH',
  });

  // 2. Deterministic strategy
  const sig = strategy.evaluate(store, settings, {
    spread, spreadAvg, sessions, newsBlock,
  });

  // If hard reject, short-circuit — never call AI on an already rejected signal
  if (sig.direction === 'NO_TRADE') {
    return {
      action: 'NO_TRADE',
      signal: sig,
      reasons: sig.rejectionReasons,
      probability: 0,
      evidence: sig.supportingEvidence,
      elapsedMs: Date.now() - t0,
    };
  }

  // 3. AI market opinion (advisory)
  const series = store.getSeries(60);
  const snapshot = require('../market/technicalIndicators').computeSnapshot(series);
  let aiMarket = { ok: false };
  try {
    aiMarket = await analyzeMarket({
      symbol: settings.symbol || 'XAUUSD',
      snapshot, series, spread, spreadAvg,
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'decision_ai_market_failed');
  }

  // 4. AI news bias (advisory)
  let aiNews = { ok: false, bias: 'NEUTRAL', confidence: 0 };
  try {
    const events = await economicCalendar.getUpcoming({
      lookaheadMinutes: 180,
      lookbackMinutes: 60,
      minImportance: 'MEDIUM',
    });
    if (events.length > 0) {
      aiNews = await analyzeNews({ events });
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'decision_ai_news_failed');
  }

  // 5. Veto logic
  const reasons = [];
  let vetoed = false;

  // 5a. AI directly disagrees
  if (aiMarket.ok && aiMarket.direction === 'NO_TRADE' &&
      aiMarket.rejection_reasons.length > 0) {
    reasons.push('AI_MARKET_VETO');
    vetoed = true;
  }
  if (aiMarket.ok && aiMarket.direction !== 'NO_TRADE' &&
      aiMarket.direction !== sig.direction &&
      aiMarket.confidence >= AI_VETO_THRESHOLD) {
    reasons.push(`AI_DIRECTION_CONFLICT:${aiMarket.direction}@${aiMarket.confidence}`);
    vetoed = true;
  }

  // 5b. News strongly opposes
  if (aiNews.ok && aiNews.bias !== 'NEUTRAL' && aiNews.confidence >= OPPOSE_VETO_THRESHOLD) {
    const opposes =
      (sig.direction === 'BUY' && aiNews.bias === 'BEARISH') ||
      (sig.direction === 'SELL' && aiNews.bias === 'BULLISH');
    if (opposes) {
      reasons.push(`NEWS_OPPOSES:${aiNews.bias}@${aiNews.confidence}`);
      vetoed = true;
    }
  }

  if (vetoed) {
    sig.direction = 'NO_TRADE';
    sig.rejectionReasons.push(...reasons);
    return {
      action: 'NO_TRADE',
      signal: sig,
      reasons,
      probability: 0,
      evidence: sig.supportingEvidence,
      aiMarket,
      aiNews,
      elapsedMs: Date.now() - t0,
    };
  }

  // 6. Probability estimation
  //    Base = strategy quality (0..1)
  const baseProb = Math.min(0.75, (sig._meta?.quality ?? 0) / 100);
  //    Adjust for AI agreement/disagreement
  let aiAdjust = 0;
  if (aiMarket.ok) {
    if (aiMarket.direction === sig.direction) {
      aiAdjust = aiMarket.confidence * 0.15;
    } else if (aiMarket.direction === 'NO_TRADE') {
      aiAdjust = -0.10;
    }
  }
  //    Adjust for news alignment
  let newsAdjust = 0;
  if (aiNews.ok && aiNews.bias !== 'NEUTRAL') {
    const aligned =
      (sig.direction === 'BUY' && aiNews.bias === 'BULLISH') ||
      (sig.direction === 'SELL' && aiNews.bias === 'BEARISH');
    newsAdjust = aligned ? aiNews.confidence * 0.10 : -aiNews.confidence * 0.10;
  }

  const rawProb = Math.max(0, Math.min(0.75, baseProb + aiAdjust + newsAdjust));
  const calibrated = calibration.calibrate(rawProb);

  sig.probability = Number(calibrated.toFixed(3));
  sig.aiTraceId = null; // could attach OpenAI request id if available

  const finalAction =
    calibrated < MIN_CALIBRATED_PROBABILITY ? 'NO_TRADE' : sig.direction;

  if (finalAction === 'NO_TRADE') {
    sig.direction = 'NO_TRADE';
    sig.rejectionReasons.push(`CALIBRATED_PROBABILITY_LOW:${calibrated.toFixed(2)}`);
  }

  logger.info({
    action: finalAction,
    rawProb: Number(rawProb.toFixed(3)),
    calibrated: Number(calibrated.toFixed(3)),
    quality: sig._meta?.quality,
    elapsedMs: Date.now() - t0,
  }, 'decision_made');

  return {
    action: finalAction,
    signal: sig,
    reasons,
    probability: calibrated,
    evidence: sig.supportingEvidence,
    aiMarket,
    aiNews,
    elapsedMs: Date.now() - t0,
  };
}

module.exports = { decide };