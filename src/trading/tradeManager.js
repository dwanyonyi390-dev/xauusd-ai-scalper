'use strict';

/**
 * Orchestrates the full trade lifecycle:
 *   signal → validate → risk approve → persist → dispatch to MT5 agent
 *
 * This module NEVER talks to the broker directly. It writes a Trade in
 * status OPEN with `executionResult.state = 'PENDING_AGENT'` and lets the
 * MT5 agent pull it, execute it, and report back via /api/agent/execution.
 *
 * Guarantees:
 *   - Duplicate signals (same signalId) never create duplicate trades.
 *   - A risk-halt signal is persisted as TradingSignal with NO_TRADE and
 *     is never turned into a Trade.
 *   - Every state transition is auditable via TradeExecution events (§13).
 */

const { randomUUID } = require('crypto');
const Trade = require('../database/models/Trade');
const TradeExecution = require('../database/models/TradeExecution');
const TradingSignal = require('../database/models/TradingSignal');
const RiskEvent = require('../database/models/RiskEvent');
const riskManager = require('./riskManager');
const signalValidator = require('./signalValidator');
const logger = require('../utils/logger');
const { RiskHaltError } = require('../utils/errors');

function _agentId(settings) {
  return (settings.subjectId || '').replace(/^agent:/, '') || 'default';
}

/**
 * @param {object} params
 * @param {object} params.signal          raw signal from strategy.evaluate()
 * @param {object} params.settings        TradingSettings document
 * @param {object} params.state           { equity, balance, floatingPnl, openPositions,
 *                                          consecutiveLosses, dayStartEquity, openRiskUSD }
 * @param {number} params.spread          current spread (price units)
 */
async function processSignal({ signal, settings, state, spread }) {
  const agentId = _agentId(settings);

  // 1. Schema + semantic validation
  const v = signalValidator.validate(signal, settings);
  if (!v.ok) {
    logger.info({ signalId: signal.signalId, reasons: v.reasons }, 'signal_rejected_by_validator');
    await _persistSignal(signal, { executed: false });
    return { status: 'REJECTED', reasons: v.reasons };
  }

  const validSignal = v.signal;

  if (validSignal.direction === 'NO_TRADE') {
    await _persistSignal(validSignal, { executed: false });
    return { status: 'NO_TRADE', reasons: validSignal.rejectionReasons };
  }

  // 2. Duplicate guard — same signalId must not create two trades
  const existing = await Trade.findOne({ signalId: validSignal.signalId }).lean();
  if (existing) {
    logger.warn({ signalId: validSignal.signalId }, 'duplicate_signal_rejected');
    return { status: 'DUPLICATE', tradeId: existing.tradeId };
  }

  // 3. Risk gate — highest authority
  let riskResult;
  try {
    riskResult = riskManager.approve({ signal: validSignal, settings, state, spread });
  } catch (err) {
    if (err instanceof RiskHaltError) {
      await RiskEvent.create({
        severity: 'WARN',
        code: err.code || 'RISK_HALT',
        message: err.message,
        context: { signalId: validSignal.signalId, ...(err.meta || {}) },
        occurredAt: new Date(),
      });
      await _persistSignal(validSignal, { executed: false });
      return { status: 'RISK_HALT', reason: err.message };
    }
    throw err;
  }

  // 4. Resolve lot size (slot override → risk override → default)
  const lotSize = _resolveLotSize(validSignal, settings, riskResult.lotSize);

  // 5. Persist Trade as PENDING_AGENT
  const tradeId = randomUUID();
  const trade = await Trade.create({
    tradeId,
    signalId: validSignal.signalId,
    brokerTicket: null,
    symbol: validSignal.symbol,
    direction: validSignal.direction,
    lotSize,
    entryPrice: validSignal.entryPrice,
    stopLoss: validSignal.stopLoss,
    takeProfit: validSignal.takeProfit,
    entryTime: new Date(),
    exitPrice: null,
    exitTime: null,
    grossProfit: null,
    commission: null,
    swap: null,
    netProfit: null,
    holdingDurationSec: null,
    strategyVersion: validSignal.strategyVersion,
    exitReason: null,
    status: 'OPEN',
    executionResult: {
      state: 'PENDING_AGENT',
      requestedAt: new Date().toISOString(),
      agentId,
      riskUSD: riskResult.riskUSD,
      exposurePct: riskResult.exposurePct,
    },
  });

  await TradeExecution.create({
    tradeId,
    brokerTicket: null,
    agentId,
    event: 'OPEN_REQUESTED',
    requestId: randomUUID(),
    payload: {
      direction: validSignal.direction,
      lotSize,
      entryPrice: validSignal.entryPrice,
      stopLoss: validSignal.stopLoss,
      takeProfit: validSignal.takeProfit,
      signalId: validSignal.signalId,
    },
    brokerResponse: null,
    occurredAt: new Date(),
  });

  await _persistSignal(validSignal, { executed: true });

  logger.info({ tradeId, direction: validSignal.direction, lot: lotSize }, 'trade_queued_for_agent');
  return { status: 'QUEUED', tradeId };
}

/**
 * Resolve lot size: explicit slot override > risk-derived > settings default.
 * NEVER auto-scales upward after losses (§9).
 */
function _resolveLotSize(signal, settings, riskLot) {
  const slotIdx = signal._meta?.slotIndex;
  if (Number.isInteger(slotIdx) && Array.isArray(settings.positionSlots)) {
    const slot = settings.positionSlots.find((s) => s.slot === slotIdx && s.enabled);
    if (slot && Number.isFinite(slot.lotSize)) return slot.lotSize;
  }
  if (signal._meta?.lotSizeOverride && Number.isFinite(signal._meta.lotSizeOverride)) {
    return signal._meta.lotSizeOverride;
  }
  if (Number.isFinite(riskLot) && riskLot > 0) return riskLot;
  return settings.defaultLotSize;
}

async function _persistSignal(signal, { executed }) {
  try {
    await TradingSignal.create({
      signalId: signal.signalId,
      symbol: signal.symbol,
      direction: signal.direction,
      createdAt: new Date(signal.createdAt),
      entryConditions: signal.entryConditions || {},
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      expectedRewardUSD: signal.expectedRewardUSD,
      estimatedCostUSD: signal.estimatedCostUSD,
      riskRewardRatio: signal.riskRewardRatio,
      probability: signal.probability,
      marketRegime: signal.marketRegime,
      supportingEvidence: signal.supportingEvidence || [],
      rejectionReasons: signal.rejectionReasons || [],
      strategyVersion: signal.strategyVersion,
      aiTraceId: signal.aiTraceId || null,
      executed,
      executedAt: executed ? new Date() : null,
    });
  } catch (err) {
    // Duplicate signalId is acceptable — log and continue
    if (err.code === 11000) return;
    logger.warn({ err: err.message }, 'persist_signal_failed');
  }
}

module.exports = { processSignal, _resolveLotSize };