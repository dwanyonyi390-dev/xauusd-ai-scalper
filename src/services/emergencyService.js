// src/services/emergencyService.js
'use strict';

/**
 * Single authoritative path for emergency actions (§9, §12, §20).
 *
 * Telegram / API never talk to the broker directly. They call this service,
 * which:
 *   1) flips runtime flags in TradingSettings (tradingEnabled=false, paused=true, emergency=true)
 *   2) writes RiskEvent (CLOSE_ALL_REQUESTED / EMERGENCY_TRIGGERED) so the EA
 *      picks it up on its next /api/agent/pending-commands poll
 *   3) returns a descriptive result so callers can reply to the user
 */

const RiskEvent = require('../database/models/RiskEvent');
const configurationService = require('./configurationService');
const logger = require('../utils/logger');

async function engageEmergency({ source = 'unknown', reason = 'manual' }) {
  await configurationService.setRuntimeState(
    { tradingEnabled: false, paused: true, emergency: true },
    `emergency:${source}`
  );
  const ev = await RiskEvent.create({
    severity: 'CRITICAL',
    code: 'EMERGENCY_TRIGGERED',
    message: `Emergency engaged (${reason})`,
    context: { source, reason },
    occurredAt: new Date(),
  });
  logger.warn({ source, reason }, 'emergency_engaged');
  return { ok: true, eventId: String(ev._id) };
}

async function requestCloseAll({ source = 'unknown', reason = 'manual' }) {
  const ev = await RiskEvent.create({
    severity: 'CRITICAL',
    code: 'CLOSE_ALL_REQUESTED',
    message: `Close-all requested (${reason})`,
    context: { source, reason },
    occurredAt: new Date(),
  });
  logger.warn({ source, reason }, 'close_all_requested');
  return { ok: true, eventId: String(ev._id) };
}

async function clearEmergency({ source = 'unknown' }) {
  await configurationService.setRuntimeState(
    { emergency: false },
    `emergency_cleared:${source}`
  );
  logger.info({ source }, 'emergency_cleared');
  return { ok: true };
}

module.exports = { engageEmergency, requestCloseAll, clearEmergency };