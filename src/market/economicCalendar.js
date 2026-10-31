'use strict';

/**
 * Economic calendar ingestion and blackout windows.
 *
 * Sources: this module is source-agnostic. The worker calls refresh() with
 * whatever adapter is configured (Forex Factory, Trading Economics, etc.).
 * We NEVER invent events — if no adapter is configured, the calendar is
 * empty and the strategy must treat "no data" as "cannot confirm safe".
 */

const logger = require('../utils/logger');
const EconomicEvent = require('../database/models/EconomicEvent');

const IMPORTANCE_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/**
 * Persist a batch of normalized events. Idempotent on (source, externalId).
 * Returns counts.
 */
async function upsertEvents(source, events, fetchedAt = new Date()) {
  if (!Array.isArray(events) || events.length === 0) {
    return { inserted: 0, updated: 0 };
  }
  let inserted = 0;
  let updated = 0;
  for (const e of events) {
    if (!e || !e.externalId || !e.title || !e.scheduledAt) {
      logger.warn({ source, event: e }, 'economicCalendar_skipped_invalid_event');
      continue;
    }
    const doc = {
      source,
      externalId: String(e.externalId),
      title: String(e.title).slice(0, 300),
      country: e.country || 'US',
      importance: IMPORTANCE_ORDER[e.importance] != null ? e.importance : 'MEDIUM',
      scheduledAt: new Date(e.scheduledAt),
      publishedAt: e.publishedAt ? new Date(e.publishedAt) : null,
      actual: e.actual != null ? String(e.actual) : null,
      forecast: e.forecast != null ? String(e.forecast) : null,
      previous: e.previous != null ? String(e.previous) : null,
      currency: e.currency || 'USD',
      notes: e.notes || null,
      fetchedAt,
    };
    try {
      const res = await EconomicEvent.updateOne(
        { source, externalId: doc.externalId },
        { $set: doc },
        { upsert: true }
      );
      if (res.upsertedCount) inserted += 1;
      else if (res.modifiedCount) updated += 1;
    } catch (err) {
      logger.warn({ err: err.message, externalId: doc.externalId }, 'economicCalendar_upsert_failed');
    }
  }
  return { inserted, updated };
}

/**
 * Return upcoming high/medium-impact events in [now - lookback, now + lookahead].
 */
async function getUpcoming({ lookaheadMinutes = 60, lookbackMinutes = 5, minImportance = 'MEDIUM', country = 'US', currency = 'USD' } = {}) {
  const now = Date.now();
  const from = new Date(now - lookbackMinutes * 60_000);
  const to = new Date(now + lookaheadMinutes * 60_000);
  const minImp = IMPORTANCE_ORDER[minImportance] ?? 1;
  const allowedImportance = Object.keys(IMPORTANCE_ORDER).filter((k) => IMPORTANCE_ORDER[k] >= minImp);

  return EconomicEvent.find({
    scheduledAt: { $gte: from, $lte: to },
    importance: { $in: allowedImportance },
    $or: [{ country }, { currency }],
  })
    .sort({ scheduledAt: 1 })
    .lean();
}

/**
 * Core blackout decision.
 *
 * Returns:
 *   { blocked: false }
 *   { blocked: true, reason, event, msUntil, msSince }
 *
 * Semantics: block if an event's scheduledAt is within `beforeMinutes`
 * ahead OR within `afterMinutes` behind (publication shock window).
 */
async function checkBlackout({ beforeMinutes = 15, afterMinutes = 5, minImportance = 'HIGH' } = {}) {
  const now = Date.now();
  const events = await getUpcoming({
    lookaheadMinutes: beforeMinutes,
    lookbackMinutes: afterMinutes,
    minImportance,
  });
  if (events.length === 0) return { blocked: false };

  // Nearest event wins for reporting
  let nearest = null;
  let nearestDelta = Infinity;
  for (const e of events) {
    const delta = Math.abs(new Date(e.scheduledAt).getTime() - now);
    if (delta < nearestDelta) {
      nearestDelta = delta;
      nearest = e;
    }
  }
  if (!nearest) return { blocked: false };

  const scheduled = new Date(nearest.scheduledAt).getTime();
  return {
    blocked: true,
    reason: scheduled >= now ? 'PRE_EVENT_BLACKOUT' : 'POST_EVENT_BLACKOUT',
    event: {
      externalId: nearest.externalId,
      title: nearest.title,
      importance: nearest.importance,
      scheduledAt: nearest.scheduledAt,
      currency: nearest.currency,
    },
    msUntil: scheduled - now,
    msSince: now - scheduled,
  };
}

module.exports = {
  IMPORTANCE_ORDER,
  upsertEvents,
  getUpcoming,
  checkBlackout,
};