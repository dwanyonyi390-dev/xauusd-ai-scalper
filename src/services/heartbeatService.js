// src/services/heartbeatService.js
'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const AgentHeartbeat = require('../database/models/AgentHeartbeat');

// Same TTL rule as your /status handler in commands.js
const CONNECTED_TTL_MS = 30_000;

function getAgentId() {
  return env.MT5_AGENT_ID || 'default';
}

/**
 * Persist an EA heartbeat. Every call:
 *  - upserts by agentId (one document per agent)
 *  - stores account snapshot fields used by /status and /account
 *  - updates in-memory lastBeat for fast isAgentConnected()
 */
async function recordHeartbeat(payload) {
  const agentId = payload.agentId || getAgentId();
  const now = new Date();

  const doc = {
    agentId,
    receivedAt: now,
    sentAt: payload.sentAt ? new Date(payload.sentAt) : null,
    // account
    balance: Number(payload.balance) || 0,
    equity: Number(payload.equity) || 0,
    margin: Number(payload.margin) || 0,
    freeMargin: Number(payload.freeMargin) || 0,
    marginLevel: Number(payload.marginLevel) || 0,
    // broker
    broker: payload.broker || null,
    server: payload.server || null,
    login: payload.login || null,
    // symbol/terminal
    symbol: payload.symbol || env.TRADING_SYMBOL,
    symbolMapped: payload.symbolMapped || null,
    terminalBuild: payload.terminalBuild || null,
    // connection
    pingMs: payload.pingMs != null ? Number(payload.pingMs) : null,
    marketOpen: payload.marketOpen !== false,
    // session counters
    openPositions: Array.isArray(payload.openPositions) ? payload.openPositions : [],
    openPositionsCount:
      Number(payload.openPositionsCount) ||
      (Array.isArray(payload.openPositions) ? payload.openPositions.length : 0),
    // meta
    eaVersion: payload.eaVersion || null,
  };

  await AgentHeartbeat.updateOne({ agentId }, { $set: doc }, { upsert: true });
  logger.info(
    { agentId, balance: doc.balance, equity: doc.equity, open: doc.openPositionsCount, pingMs: doc.pingMs },
    'agent_heartbeat'
  );

  return doc;
}

/**
 * Fast-path check used by any non-DB code. Falls back to DB read on demand.
 */
async function isAgentConnected() {
  const agentId = getAgentId();
  const last = await AgentHeartbeat.findOne({ agentId }).sort({ receivedAt: -1 }).lean();
  if (!last || !last.receivedAt) return false;
  return Date.now() - new Date(last.receivedAt).getTime() < CONNECTED_TTL_MS;
}

/**
 * Return the latest heartbeat snapshot for /status and /account.
 */
async function latest() {
  return AgentHeartbeat.findOne({ agentId: getAgentId() }).sort({ receivedAt: -1 }).lean();
}

/**
 * Called by monitoringWorker every ~15s. Detects silent agents and logs.
 * Returns true if the agent is considered connected after the check.
 */
async function markDisconnectedIfStale() {
  const agentId = getAgentId();
  const last = await AgentHeartbeat.findOne({ agentId }).sort({ receivedAt: -1 }).lean();
  if (!last) {
    logger.warn({ agentId }, 'agent_never_seen');
    return false;
  }
  const ageMs = Date.now() - new Date(last.receivedAt).getTime();
  if (ageMs >= CONNECTED_TTL_MS) {
    logger.warn({ agentId, ageMs }, 'agent_disconnected_stale');
    return false;
  }
  return true;
}

module.exports = {
  recordHeartbeat,
  isAgentConnected,
  latest,
  markDisconnectedIfStale,
  CONNECTED_TTL_MS,
};