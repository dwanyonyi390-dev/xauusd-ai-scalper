'use strict';

/**
 * News/macro analysis for gold.
 * Input: recent high-impact economic events from economicCalendar.
 * Output: structured bias used only as a *veto-reinforcer* — a bullish
 * news bias never opens a trade on its own; a bearish bias can veto a
 * marginal BUY when the confidence is high enough.
 */

const { chatJson } = require('./openaiClient');
const { SYSTEM_NEWS } = require('./prompts');
const logger = require('../utils/logger');

function _summarizeEvents(events) {
  return events.map((e) => ({
    externalId: e.externalId,
    title: e.title,
    importance: e.importance,
    currency: e.currency,
    scheduledAt: e.scheduledAt,
    actual: e.actual,
    forecast: e.forecast,
    previous: e.previous,
  }));
}

async function analyzeNews({ events }) {
  if (!events || events.length === 0) {
    return { ok: true, bias: 'NEUTRAL', confidence: 0, rationale: 'no_events', key_events: [] };
  }
  const user = `Recent and upcoming US-relevant events:\n${JSON.stringify(_summarizeEvents(events))}\n\nReturn JSON as specified.`;
  try {
    const result = await chatJson({ system: SYSTEM_NEWS, user });
    const bias = ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(result.bias) ? result.bias : 'NEUTRAL';
    const confidence = Number.isFinite(result.confidence)
      ? Math.max(0, Math.min(0.75, result.confidence)) : 0;
    return {
      ok: true,
      bias,
      confidence,
      rationale: typeof result.rationale === 'string' ? result.rationale.slice(0, 400) : '',
      key_events: Array.isArray(result.key_events) ? result.key_events.slice(0, 10) : [],
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'newsAnalysis_ai_failed');
    return { ok: false, error: err.message, bias: 'NEUTRAL', confidence: 0, rationale: 'ai_unavailable', key_events: [] };
  }
}

module.exports = { analyzeNews };