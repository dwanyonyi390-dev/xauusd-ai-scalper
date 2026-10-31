'use strict';

const TradingSettings = require('../database/models/TradingSettings');
const RiskEvent = require('../database/models/RiskEvent');
const logger = require('../utils/logger');

function _subjectId(agentId) { return `agent:${agentId}`; }

async function loadSettings(agentId) {
  return TradingSettings.findOne({ subjectId: _subjectId(agentId) });
}

async function requestCloseAll(agentId, { source = 'api', reason = 'manual' } = {}) {
  await RiskEvent.create({
    severity: 'CRITICAL',
    code: 'CLOSE_ALL_REQUESTED',
    message: `Close-all requested (${reason})`,
    context: { agentId, source, reason },
    occurredAt: new Date(),
  });
  logger.warn({ agentId, source, reason }, 'mt5Bridge_close_all_requested');
  return { ok: true };
}

async function setTradingState(agentId, patch = {}) {
  const doc = await loadSettings(agentId);
  if (!doc) return { ok: false, error: 'settings_not_found' };
  if (patch.tradingEnabled !== undefined) doc.tradingEnabled = Boolean(patch.tradingEnabled);
  if (patch.paused !== undefined) doc.paused = Boolean(patch.paused);
  if (patch.emergency !== undefined) doc.emergency = Boolean(patch.emergency);
  doc.version = (doc.version || 0) + 1;
  doc.updatedBy = patch.updatedBy || 'mt5Bridge';
  await doc.save();
  logger.info({ agentId, patch, version: doc.version }, 'mt5Bridge_state_updated');
  return { ok: true, version: doc.version, state: {
    tradingEnabled: doc.tradingEnabled,
    paused: doc.paused,
    emergency: doc.emergency,
  } };
}

module.exports = { loadSettings, requestCloseAll, setTradingState };