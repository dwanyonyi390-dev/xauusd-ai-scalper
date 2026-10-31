'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');

let botApi = null;

function setBot(bot) { botApi = bot; }

async function notifyAdmin(text, extra = {}) {
  if (!botApi || !env.TELEGRAM_ADMIN_ID) {
    logger.warn({ text }, 'telegram_notification_skipped_no_bot');
    return;
  }
  try {
    await botApi.api.sendMessage(env.TELEGRAM_ADMIN_ID, text, {
      parse_mode: 'HTML',
      ...extra,
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'telegram_notify_failed');
  }
}

async function notifyTradeOpened(trade) {
  await notifyAdmin(
    `🟢 <b>Trade opened</b>\n` +
    `ID: <code>${trade.tradeId}</code>\n` +
    `Symbol: ${trade.symbol} ${trade.direction}\n` +
    `Lot: ${trade.lotSize}\n` +
    `Entry: ${trade.entryPrice}\n` +
    `SL: ${trade.stopLoss ?? '—'} | TP: ${trade.takeProfit ?? '—'}`
  );
}

async function notifyTradeClosed(trade) {
  const emoji = (trade.netProfit || 0) >= 0 ? '🟢' : '🔴';
  await notifyAdmin(
    `${emoji} <b>Trade closed</b>\n` +
    `ID: <code>${trade.tradeId}</code>\n` +
    `Net: <b>${(trade.netProfit ?? 0).toFixed(2)} USD</b>\n` +
    `Reason: ${trade.exitReason || 'unknown'}\n` +
    `Holding: ${trade.holdingDurationSec ?? '?'}s`
  );
}

async function notifyRiskEvent(event) {
  const emoji = event.severity === 'CRITICAL' ? '🚨' : event.severity === 'WARN' ? '⚠️' : 'ℹ️';
  await notifyAdmin(
    `${emoji} <b>Risk event</b> [${event.severity}]\n` +
    `Code: <code>${event.code}</code>\n` +
    `${event.message}`
  );
}

module.exports = { setBot, notifyAdmin, notifyTradeOpened, notifyTradeClosed, notifyRiskEvent };