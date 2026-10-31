'use strict';

/**
 * Performance aggregation service.
 *
 * Reads closed trades from MongoDB and computes metrics on demand.
 * Deliberately does NOT trust cached Performance docs — those are written
 * by the reporting worker but recomputed here from raw Trade records so a
 * stale cache can never inflate reported results (§14).
 *
 * Conventions:
 *   - Only trades with status === 'CLOSED' and netProfit != null are counted.
 *   - winRate is wins / (wins + losses); break-even trades are excluded from
 *     the denominator so a flat trade doesn't drag the ratio toward zero.
 *   - Drawdown is measured on realized equity curve (closed trades only).
 *     Floating drawdown belongs to the live risk layer, not this report.
 */

const Trade = require('../database/models/Trade');
const logger = require('../utils/logger');

function _stats(trades) {
  let wins = 0;
  let losses = 0;
  let breakEven = 0;
  let realizedPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalCommission = 0;
  let totalSwap = 0;
  let holdSum = 0;
  let holdCount = 0;

  for (const t of trades) {
    const net = Number.isFinite(t.netProfit) ? t.netProfit : 0;
    realizedPnl += net;
    if (net > 0) {
      wins += 1;
      grossProfit += net;
    } else if (net < 0) {
      losses += 1;
      grossLoss += Math.abs(net);
    } else {
      breakEven += 1;
    }
    if (Number.isFinite(t.commission)) totalCommission += t.commission;
    if (Number.isFinite(t.swap)) totalSwap += t.swap;
    if (Number.isFinite(t.holdingDurationSec) && t.holdingDurationSec >= 0) {
      holdSum += t.holdingDurationSec;
      holdCount += 1;
    }
  }

  const decisive = wins + losses;
  const winRate = decisive > 0 ? wins / decisive : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null);
  const avgWinUSD = wins > 0 ? grossProfit / wins : null;
  const avgLossUSD = losses > 0 ? grossLoss / losses : null;
  const avgHoldingSeconds = holdCount > 0 ? holdSum / holdCount : null;

  return {
    trades: trades.length,
    wins,
    losses,
    breakEven,
    winRate,
    realizedPnl,
    grossProfit,
    grossLoss,
    profitFactor: profitFactor === Infinity ? null : profitFactor,
    avgWinUSD,
    avgLossUSD,
    avgHoldingSeconds,
    totalCommission,
    totalSwap,
  };
}

function _drawdownFromEquityCurve(trades) {
  // trades must be sorted ascending by exitTime
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  let maxDDPct = 0;
  for (const t of trades) {
    equity += Number.isFinite(t.netProfit) ? t.netProfit : 0;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
    if (peak > 0) {
      const ddPct = (dd / peak) * 100;
      if (ddPct > maxDDPct) maxDDPct = ddPct;
    }
  }
  return { maxDrawdownUSD: maxDD, maxDrawdownPercent: maxDDPct };
}

async function getSummary({ symbol = null, since = null } = {}) {
  try {
    const q = { status: 'CLOSED', netProfit: { $ne: null } };
    if (symbol) q.symbol = symbol;
    if (since) q.exitTime = { $gte: since };

    const trades = await Trade.find(q)
      .sort({ exitTime: 1 })
      .select('netProfit commission swap holdingDurationSec exitTime symbol')
      .lean();

    const stats = _stats(trades);
    const dd = _drawdownFromEquityCurve(trades);

    return {
      ...stats,
      ...dd,
      symbol: symbol || 'ALL',
      computedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.error({ err: err.message }, 'performanceService_getSummary_failed');
    // Return a neutral shape rather than throwing — Telegram must still reply.
    return {
      trades: 0, wins: 0, losses: 0, breakEven: 0, winRate: 0,
      realizedPnl: 0, grossProfit: 0, grossLoss: 0,
      profitFactor: null, avgWinUSD: null, avgLossUSD: null,
      avgHoldingSeconds: null, totalCommission: 0, totalSwap: 0,
      maxDrawdownUSD: 0, maxDrawdownPercent: 0,
      symbol: symbol || 'ALL',
      computedAt: new Date().toISOString(),
      error: 'summary_unavailable',
    };
  }
}

async function getDaily(days = 7, { symbol = null } = {}) {
  const safeDays = Math.max(1, Math.min(Number(days) || 7, 365));
  const since = new Date(Date.now() - safeDays * 24 * 3600 * 1000);

  const q = { status: 'CLOSED', netProfit: { $ne: null }, exitTime: { $gte: since } };
  if (symbol) q.symbol = symbol;

  const trades = await Trade.find(q)
    .sort({ exitTime: 1 })
    .select('netProfit commission swap holdingDurationSec exitTime')
    .lean();

  // Bucket by UTC date (YYYY-MM-DD)
  const buckets = new Map();
  for (const t of trades) {
    if (!t.exitTime) continue;
    const key = new Date(t.exitTime).toISOString().slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }

  const rows = [];
  for (const [dateKey, dayTrades] of [...buckets.entries()].sort()) {
    const s = _stats(dayTrades);
    const dd = _drawdownFromEquityCurve(dayTrades);
    rows.push({
      date: dateKey,
      trades: s.trades,
      wins: s.wins,
      losses: s.losses,
      winRate: s.winRate,
      realizedPnl: s.realizedPnl,
      profitFactor: s.profitFactor,
      avgHoldingSeconds: s.avgHoldingSeconds,
      maxDrawdownUSD: dd.maxDrawdownUSD,
    });
  }
  return rows;
}

async function getDrawdown({ symbol = null } = {}) {
  const q = { status: 'CLOSED', netProfit: { $ne: null } };
  if (symbol) q.symbol = symbol;
  const trades = await Trade.find(q)
    .sort({ exitTime: 1 })
    .select('netProfit exitTime')
    .lean();
  const dd = _drawdownFromEquityCurve(trades);
  return {
    ...dd,
    sampleSize: trades.length,
    computedAt: new Date().toISOString(),
  };
}

const performanceService = { getSummary, getDaily, getDrawdown };

module.exports = { performanceService, getSummary, getDaily, getDrawdown };