// src/api/controllers/agentController.js
'use strict';

const { z } = require('zod');
const logger = require('../../utils/logger');
const heartbeat = require('../../services/heartbeatService');
const configurationService = require('../../services/configurationService');

// ── Schema ──────────────────────────────────────────────────────────────────
const HeartbeatSchema = z.object({
  agentId: z.string().min(1).optional(),
  sentAt: z.string().datetime().optional(),

  balance: z.number().nonnegative(),
  equity: z.number().nonnegative(),
  margin: z.number().nonnegative().optional().default(0),
  freeMargin: z.number().nonnegative().optional().default(0),
  marginLevel: z.number().nonnegative().optional().default(0),

  broker: z.string().optional(),
  server: z.string().optional(),
  login: z.union([z.string(), z.number()]).optional(),

  symbol: z.string().optional(),
  symbolMapped: z.string().optional(),
  terminalBuild: z.number().int().optional(),

  pingMs: z.number().int().nonnegative().optional(),
  marketOpen: z.boolean().optional(),

  openPositions: z.array(z.any()).optional(),
  openPositionsCount: z.number().int().nonnegative().optional(),
  eaVersion: z.string().optional(),
});

// ── POST /api/agent/heartbeat ───────────────────────────────────────────────
async function postHeartbeat(req, res, next) {
  try {
    const parsed = HeartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_heartbeat',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const doc = await heartbeat.recordHeartbeat(parsed.data);
    return res.json({ ok: true, serverTime: new Date().toISOString(), ack: { agentId: doc.agentId } });
  } catch (err) {
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
const TradeReportSchema = z.object({
  eventId: z.string().min(8), // idempotency key, unique per event
  type: z.enum(['OPEN', 'CLOSE', 'SL_HIT', 'TP_HIT', 'MANUAL_CLOSE', 'REJECTED']),
  tradeId: z.string().min(1),
  ticket: z.union([z.string(), z.number()]),
  symbol: z.string(),
  direction: z.enum(['BUY', 'SELL']),
  volume: z.number().positive(),
  entryPrice: z.number().positive().optional(),
  exitPrice: z.number().positive().optional(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
  profit: z.number().optional(),
  commission: z.number().optional().default(0),
  swap: z.number().optional().default(0),
  netProfit: z.number().optional(),
  openTime: z.string().datetime().optional(),
  closeTime: z.string().datetime().optional(),
  holdingSeconds: z.number().int().nonnegative().optional(),
  exitReason: z.string().optional(),
  raw: z.any().optional(),
});

async function postTradeReport(req, res, next) {
  try {
    const parsed = TradeReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_trade_report',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const r = parsed.data;

    // Idempotent upsert in a general "trade_executions" collection.
    // The Trade model update is intentionally left to tradeManager (Phase 8),
    // so the EA can report executions even before the trade manager exists.
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
          volume: r.volume,
          entryPrice: r.entryPrice,
          exitPrice: r.exitPrice,
          stopLoss: r.stopLoss,
          takeProfit: r.takeProfit,
          profit: r.profit,
          commission: r.commission,
          swap: r.swap,
          netProfit: r.netProfit,
          openTime: r.openTime ? new Date(r.openTime) : null,
          closeTime: r.closeTime ? new Date(r.closeTime) : null,
          holdingSeconds: r.holdingSeconds,
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