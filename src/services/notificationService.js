'use strict';

/**
 * Unified notification bus. Routes events to configured channels.
 * Currently: Telegram only. Future: email, webhooks.
 *
 * The `telegram/notifications.js` module remains the transport layer;
 * this service is the semantic layer (what to send, whether to send).
 */

const logger = require('../utils/logger');
const telegram = require('../telegram/notifications');

const DEDUPE_WINDOW_MS = 60_000;
const _recent = new Map(); // key -> lastSentAt

function _dedupe(key) {
  const now = Date.now();
  const last = _recent.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  _recent.set(key, now);
  // opportunistic sweep
  if (_recent.size > 200) {
    for (const [k, ts] of _recent) {
      if (now - ts > DEDUPE_WINDOW_MS) _recent.delete(k);
    }
  }
  return true;
}

async function tradeOpened(trade) {
  if (!_dedupe(`trade_opened:${trade.tradeId}`)) return;
  await telegram.notifyTradeOpened(trade);
}

async function tradeClosed(trade) {
  if (!_dedupe(`trade_closed:${trade.tradeId}`)) return;
  await telegram.notifyTradeClosed(trade);
}

async function riskEvent(event) {
  const key = `risk:${event.code}:${Math.floor(Date.now() / DEDUPE_WINDOW_MS)}`;
  if (!_dedupe(key)) return;
  await telegram.notifyRiskEvent(event);
}

async function systemMessage(text, extra = {}) {
  await telegram.notifyAdmin(text, extra);
}

async function dailyReport(summary) {
  const lines = [
    '📊 <b>Daily report</b>',
    `Trades: ${summary.trades}`,
    `Wins: ${summary.wins} | Losses: ${summary.losses}`,
    `Win rate: ${(summary.winRate * 100).toFixed(1)}%`,
    `Realized: $${(summary.realizedPnl || 0).toFixed(2)}`,
    `Profit factor: ${summary.profitFactor != null ? summary.profitFactor.toFixed(2) : '—'}`,
    `Max DD: $${(summary.maxDrawdownUSD || 0).toFixed(2)}`,
  ];
  await telegram.notifyAdmin(lines.join('\n'));
}

module.exports = {
  tradeOpened,
  tradeClosed,
  riskEvent,
  systemMessage,
  dailyReport,
};