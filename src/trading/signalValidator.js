'use strict';

/**
 * Validates a signal produced by strategy.evaluate() before it is persisted
 * or forwarded to the risk manager.
 *
 * Responsibilities:
 *   1. Schema check via SignalSchema (utils/validation.js).
 *   2. Semantic checks that the schema cannot express:
 *      - SL must be on the losing side of entry
 *      - TP must be on the winning side of entry
 *      - quality must be >= settings.minSignalQuality
 *      - SL distance must exceed 2 * spread
 *      - estimated cost must be less than expected reward
 *
 * Returns:
 *   { ok: true, signal }
 *   { ok: false, reasons: [...], signal }
 *
 * NEVER mutates the input. NEVER throws for business rejections — only for
 * programmer errors (e.g., missing settings).
 */

const { SignalSchema } = require('../utils/validation');
const { ValidationError } = require('../utils/errors');

function validate(signal, settings) {
  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('signalValidator: settings object required');
  }
  const reasons = [];

  // 1. Schema
  const parsed = SignalSchema.safeParse({
    ...signal,
    // strip internal-only fields the schema doesn't know about
    createdAt: signal.createdAt ?? new Date().toISOString(),
  });
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      reasons.push(`SCHEMA:${i.path.join('.') || '(root)'}:${i.message}`);
    }
    return { ok: false, reasons, signal };
  }

  // NO_TRADE passes schema validation; nothing further to check
  if (parsed.data.direction === 'NO_TRADE') {
    return { ok: true, signal: parsed.data };
  }

  const s = parsed.data;

  // 2. Entry/SL/TP geometry
  if (s.entryPrice == null || s.stopLoss == null || s.takeProfit == null) {
    reasons.push('MISSING_GEOMETRY');
  } else if (s.direction === 'BUY') {
    if (!(s.stopLoss < s.entryPrice)) reasons.push('BUY_SL_NOT_BELOW_ENTRY');
    if (!(s.takeProfit > s.entryPrice)) reasons.push('BUY_TP_NOT_ABOVE_ENTRY');
  } else if (s.direction === 'SELL') {
    if (!(s.stopLoss > s.entryPrice)) reasons.push('SELL_SL_NOT_ABOVE_ENTRY');
    if (!(s.takeProfit < s.entryPrice)) reasons.push('SELL_TP_NOT_BELOW_ENTRY');
  }

  // 3. Quality threshold
  const quality = signal._meta?.quality ?? 0;
  if (Number.isFinite(settings.minSignalQuality) && quality < settings.minSignalQuality) {
    reasons.push(`QUALITY_BELOW_MIN:${quality}<${settings.minSignalQuality}`);
  }

  // 4. SL vs spread (SL must be wider than execution noise)
  const spread = signal.entryConditions?.spreadRatioToAvg ?? null;
  if (s.entryPrice != null && s.stopLoss != null && Number.isFinite(signal._meta?.spread)) {
    const slDist = Math.abs(s.entryPrice - s.stopLoss);
    if (slDist <= signal._meta.spread * 2) {
      reasons.push('SL_TOO_TIGHT_VS_SPREAD');
    }
  }

  // 5. Cost < reward
  if (Number.isFinite(s.estimatedCostUSD) && Number.isFinite(s.expectedRewardUSD)) {
    if (s.estimatedCostUSD >= s.expectedRewardUSD) {
      reasons.push('COST_EXCEEDS_REWARD');
    }
  }

  if (reasons.length) return { ok: false, reasons, signal: parsed.data };
  return { ok: true, signal: parsed.data };
}

module.exports = { validate };