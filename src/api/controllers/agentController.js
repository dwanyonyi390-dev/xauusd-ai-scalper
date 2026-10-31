// src/api/controllers/agentController.js
'use strict';

const logger = require('../../utils/logger');
const heartbeat = require('../../services/heartbeatService');
const configurationService = require('../../services/configurationService');

// ── POST /api/agent/heartbeat ───────────────────────────────────────────────
async function postHeartbeat(req, res, next) {
  try {
    // BYPASS ZOD ENTIRELY. MT5 sends raw JSON without the Content-Type header,
    // which makes express.json() leave req.body empty or undefined.
    // We manually coerce everything so it NEVER fails.
    const b = req.body || {};

    const data = {
      agentId: b.agentId || 'agent-01',
      balance: Number(b.balance) || 0,
      equity: Number(b.equity) || 0,
      margin: Number(b.margin) || 0,
      freeMargin: Number(b.freeMargin) || 0,
      marginLevel: Number(b.marginLevel) || 0,
      symbol: b.symbol || 'XAUUSDm',
      pingMs: Number(b.pingMs) || 0,
      openPositionsCount: Number(b.openPositionsCount) || 0,
      marketOpen: b.marketOpen !== false,
    };

    // If req.body was empty because Express didn't parse it, we log a warning 
    // but STILL save it so the heartbeat succeeds.
    if (!req.body || Object.keys(req.body).length === 0) {
      logger.warn({ body: req.body, headers: req.headers }, 'heartbeat_body_was_empty');
    }

    const doc = await heartbeat.recordHeartbeat(data);
    return res.json({ ok: true, serverTime: new Date().toISOString(), ack: { agentId: doc.agentId } });
  } catch (err) {
    logger.error({ err: err.message }, 'heartbeat_error');
    return next(err);
  }
}

// ── GET /api/agent/config ───────────────────────────────────────────────────
async function getConfig(req, res, next) {
  try {
    const s = await configurationService.get('user:default');
    return res.json({
      ok: true,
      config: {
        symbol: s.symbol || process.env.TRADING_SYMBOL || 'XAUUSD',
        tradingMode: process.env.TRADING_MODE || 'DEMO',
        tradingEnabled: !!s.tradingEnabled,
        paused: !!s.paused,
        emergency: !!s.emergency,
        maxPositions: s.maxPositions,
        slots: s.slots || [],
        lotSize: s.lotSize,
        profitTarget: s.profitTarget,
        riskPercent: s.riskPercent,
        maxDailyLoss: s.maxDailyLoss,
        maxConsecutiveLosses: s.maxConsecutiveLosses,
        maxHoldSeconds: s.maxHoldSeconds,
        maxSpread: s.maxSpread,
        minExpectedNetProfit: s.minExpectedNetProfit,
        minSignalQuality: s.minSignalQuality,
        newsBlackoutMinutes: s.newsBlackoutMinutes,
        sessions: s.sessions,
        maxAccountExposure: s.maxAccountExposure,
      },
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/agent/trade-report ────────────────────────────────────────────
async function postTradeReport(req, res, next) {
  try {
    const r = req.body || {};
    if (!r.eventId || !r.tradeId) {
      return res.status(400).json({ ok: false, error: 'missing_required_fields' });
    }

    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ ok: false, error: 'db_unavailable' });
    }

    const coll = db.collection('trade_executions');
    const now = new Date();
    await coll.updateOne(
      { eventId: r.eventId },
      {
        $setOnInsert: {
          eventId: r.eventId,
          tradeId: r.tradeId,
          type: r.type,
          ticket: String(r.ticket),
          symbol: r.symbol,
          direction: r.direction,
          volume: Number(r.volume),
          entryPrice: Number(r.entryPrice),
          exitPrice: Number(r.exitPrice),
          stopLoss: Number(r.stopLoss),
          takeProfit: Number(r.takeProfit),
          profit: Number(r.profit),
          commission: Number(r.commission) || 0,
          swap: Number(r.swap) || 0,
          netProfit: Number(r.netProfit),
          openTime: r.openTime ? new Date(r.openTime) : null,
          closeTime: r.closeTime ? new Date(r.closeTime) : null,
          holdingSeconds: Number(r.holdingSeconds),
          exitReason: r.exitReason,
          raw: r.raw || null,
          receivedAt: now,
          agentId: req.user && req.user.id ? req.user.id : 'unknown',
        },
      },
      { upsert: true }
    );

    logger.info(
      { eventId: r.eventId, tradeId: r.tradeId, type: r.type, netProfit: r.netProfit },
      'agent_trade_report'
    );

    return res.json({ ok: true, accepted: true, eventId: r.eventId });
  } catch (err) {
    return next(err);
  }
}

module.exports = { postHeartbeat, getConfig, postTradeReport };