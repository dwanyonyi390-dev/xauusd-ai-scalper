'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const TelegramCommand = require('../database/models/TelegramCommand');
const TradingSettings = require('../database/models/TradingSettings');
const Trade = require('../database/models/Trade');
const AgentHeartbeat = require('../database/models/AgentHeartbeat');
const RiskEvent = require('../database/models/RiskEvent');
const { performanceService } = require('../services/performanceService');
const { confirmCloseAllKeyboard, emergencyKeyboard, settingsKeyboard } = require('./keyboards');
const { isAuthorized } = require('./authorization');

const SUBJECT = `agent:${env.MT5_AGENT_ID || 'default'}`;

async function loadSettings() {
  let doc = await TradingSettings.findOne({ subjectId: SUBJECT });
  if (!doc) {
    doc = await TradingSettings.create({
      subjectId: SUBJECT,
      symbol: env.TRADING_SYMBOL,
      maxPositions: env.DEFAULT_MAX_POSITIONS,
      defaultLotSize: env.DEFAULT_LOT_SIZE,
      defaultProfitTarget: env.DEFAULT_PROFIT_TARGET,
      riskPercent: env.DEFAULT_RISK_PERCENT,
      maxDailyLossPercent: env.DEFAULT_MAX_DAILY_LOSS,
      maxConsecutiveLosses: env.DEFAULT_MAX_CONSECUTIVE_LOSSES,
      maxHoldSeconds: env.DEFAULT_MAX_HOLD_SECONDS,
    });
  }
  return doc;
}

async function logCmd(ctx, status, message = null) {
  try {
    await TelegramCommand.create({
      telegramId: String(ctx.from?.id || 'unknown'),
      command: (ctx.message?.text || ctx.callbackQuery?.data || '').slice(0, 200),
      args: [],
      authorized: true,
      resultStatus: status,
      resultMessage: message,
      occurredAt: new Date(),
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'telegram_log_failed');
  }
}

async function guard(ctx, next) {
  if (!(await isAuthorized(ctx))) {
    await ctx.reply('⛔ Unauthorized.');
    await logCmd(ctx, 'REJECTED', 'unauthorized');
    return;
  }
  return next();
}

function parseNumber(arg) {
  if (arg === undefined) return NaN;
  const n = Number(String(arg).trim());
  return Number.isFinite(n) ? n : NaN;
}

async function start(ctx) {
  await logCmd(ctx, 'OK');
  await ctx.reply(
    '🤖 <b>XAUUSD-AI-SCALPER</b>\n\n' +
    'Commands:\n' +
    '/status — system status\n' +
    '/account — account info\n' +
    '/trades — open trades\n' +
    '/history — recent closed\n' +
    '/performance — stats\n' +
    '/starttrading — enable new trades\n' +
    '/stoptrading — disable new trades\n' +
    '/pause — pause strategy\n' +
    '/resume — resume strategy\n' +
    '/emergency — emergency stop (confirm)\n' +
    '/closeall — close all (confirm)\n' +
    '/settings — view/change settings\n' +
    '/setlot 0.01\n/setprofit 0.50\n/setrisk 0.5\n/setholdtime 45\n/setmaxloss 2\n/setspread 30\n/settrades 4\n' +
    '/help',
    { parse_mode: 'HTML' }
  );
}

async function status(ctx) {
  await logCmd(ctx, 'OK');
  const settings = await loadSettings();
  const lastBeat = await AgentHeartbeat
    .findOne({ agentId: env.MT5_AGENT_ID || 'default' })
    .sort({ receivedAt: -1 })
    .lean();
  const connected = lastBeat && (Date.now() - new Date(lastBeat.receivedAt)) < 30_000;
  const openTrades = await Trade.countDocuments({ status: 'OPEN' });

  await ctx.reply(
    `📊 <b>System status</b>\n` +
    `Mode: <b>${env.TRADING_MODE}</b>\n` +
    `Symbol: ${settings.symbol}\n` +
    `Agent: ${connected ? '🟢 connected' : '🔴 disconnected'}\n` +
    `Trading enabled: ${settings.tradingEnabled ? '✅' : '❌'}\n` +
    `Paused: ${settings.paused ? '⏸' : '▶️'}\n` +
    `Emergency: ${settings.emergency ? '🚨' : '✅'}\n` +
    `Open trades: ${openTrades}/${settings.maxPositions}\n` +
    (lastBeat
      ? `Balance: $${lastBeat.balance.toFixed(2)} | Equity: $${lastBeat.equity.toFixed(2)}\n`
      : ''),
    { parse_mode: 'HTML' }
  );
}

async function account(ctx) {
  await logCmd(ctx, 'OK');
  const lastBeat = await AgentHeartbeat
    .findOne({ agentId: env.MT5_AGENT_ID || 'default' })
    .sort({ receivedAt: -1 })
    .lean();
  if (!lastBeat) return ctx.reply('No agent heartbeat yet.');
  await ctx.reply(
    `💼 <b>Account</b>\n` +
    `Balance: $${lastBeat.balance.toFixed(2)}\n` +
    `Equity: $${lastBeat.equity.toFixed(2)}\n` +
    `Margin free: $${lastBeat.marginFree.toFixed(2)}\n` +
    `Open tickets: ${lastBeat.ticketCount}\n` +
    `Spread: ${lastBeat.spread ?? '—'}`,
    { parse_mode: 'HTML' }
  );
}

async function trades(ctx) {
  await logCmd(ctx, 'OK');
  const rows = await Trade.find({ status: 'OPEN' }).sort({ entryTime: -1 }).limit(20).lean();
  if (!rows.length) return ctx.reply('No open trades.');
  const lines = rows.map(
    (t) => `${t.direction} ${t.lotSize} @ ${t.entryPrice} (ticket ${t.brokerTicket || '—'})`
  );
  await ctx.reply(`📋 <b>Open trades (${rows.length})</b>\n` + lines.join('\n'), { parse_mode: 'HTML' });
}

async function history(ctx) {
  await logCmd(ctx, 'OK');
  const rows = await Trade.find({ status: 'CLOSED' }).sort({ exitTime: -1 }).limit(10).lean();
  if (!rows.length) return ctx.reply('No closed trades yet.');
  const lines = rows.map(
    (t) => `${(t.netProfit ?? 0) >= 0 ? '🟢' : '🔴'} ${t.direction} ${t.lotSize} → $${(t.netProfit ?? 0).toFixed(2)} (${t.exitReason || '—'})`
  );
  await ctx.reply(`📜 <b>Recent closes</b>\n` + lines.join('\n'), { parse_mode: 'HTML' });
}

async function performance(ctx) {
  await logCmd(ctx, 'OK');
  const s = await performanceService.getSummary();
  await ctx.reply(
    `📈 <b>Performance</b>\n` +
    `Trades: ${s.trades}\n` +
    `Wins: ${s.wins} | Losses: ${s.losses}\n` +
    `Win rate: ${(s.winRate * 100).toFixed(1)}%\n` +
    `Realized P/L: $${s.realizedPnl.toFixed(2)}\n` +
    `Profit factor: ${s.profitFactor ?? '—'}\n` +
    `Avg hold: ${s.avgHoldingSeconds?.toFixed(1) ?? '—'}s`,
    { parse_mode: 'HTML' }
  );
}

async function startTrading(ctx) {
  await logCmd(ctx, 'OK');
  const s = await loadSettings();
  s.tradingEnabled = true;
  s.paused = false;
  s.emergency = false;
  s.version += 1;
  await s.save();
  await ctx.reply('✅ Trading enabled. New entries allowed once risk checks pass.');
}

async function stopTrading(ctx) {
  await logCmd(ctx, 'OK');
  const s = await loadSettings();
  s.tradingEnabled = false;
  s.version += 1;
  await s.save();
  await ctx.reply('⛔ Trading disabled. No new entries.');
}

async function pause(ctx) {
  await logCmd(ctx, 'OK');
  const s = await loadSettings();
  s.paused = true;
  s.version += 1;
  await s.save();
  await ctx.reply('⏸ Strategy paused.');
}

async function resume(ctx) {
  await logCmd(ctx, 'OK');
  const s = await loadSettings();
  s.paused = false;
  s.version += 1;
  await s.save();
  await ctx.reply('▶️ Strategy resumed.');
}

async function emergency(ctx) {
  await ctx.reply(
    '🚨 <b>EMERGENCY STOP</b>\nThis will disable trading, pause the strategy and flag the account for emergency management.\n\nConfirm?',
    { parse_mode: 'HTML', reply_markup: emergencyKeyboard() }
  );
}

async function closeAll(ctx) {
  const open = await Trade.countDocuments({ status: 'OPEN' });
  await ctx.reply(
    `⚠️ <b>Close all</b>\nOpen positions: <b>${open}</b>\nConfirm closing all positions?`,
    { parse_mode: 'HTML', reply_markup: confirmCloseAllKeyboard() }
  );
}

async function settings(ctx) {
  const s = await loadSettings();
  await ctx.reply(
    `⚙️ <b>Settings</b>\n` +
    `maxPositions: ${s.maxPositions}\n` +
    `defaultLotSize: ${s.defaultLotSize}\n` +
    `defaultProfitTarget: ${s.defaultProfitTarget}\n` +
    `riskPercent: ${s.riskPercent}\n` +
    `maxDailyLossPercent: ${s.maxDailyLossPercent}\n` +
    `maxHoldSeconds: ${s.maxHoldSeconds}\n` +
    `maxConsecutiveLosses: ${s.maxConsecutiveLosses}\n` +
    `maxSpread: ${s.maxSpread ?? '—'}\n` +
    `version: ${s.version}`,
    { parse_mode: 'HTML', reply_markup: settingsKeyboard() }
  );
}

function makeSetter(field, parser, label, validator) {
  return async (ctx, arg) => {
    const v = parser(arg);
    if (Number.isNaN(v)) return ctx.reply(`Usage: /${label} <number>`);
    if (validator && !validator(v)) return ctx.reply(`Invalid value for ${label}.`);
    const s = await loadSettings();
    s[field] = v;
    s.version += 1;
    await s.save();
    await logCmd(ctx, 'OK', `${field}=${v}`);
    await ctx.reply(`✅ ${field} set to ${v}`);
  };
}

async function help(ctx) {
  await start(ctx);
}

async function handleCallback(ctx, action) {
  if (!(await isAuthorized(ctx))) {
    return ctx.answerCallbackQuery({ text: 'Unauthorized', show_alert: true });
  }
  await ctx.answerCallbackQuery();
  if (action === 'cancel:closeall' || action === 'cancel:emergency') {
    return ctx.editMessageText('Cancelled.');
  }
  if (action === 'confirm:closeall') {
    await ctx.editMessageText(
      '🛑 Close-all requested. The MT5 agent will execute the next time it polls.\n' +
      'This command is queued in RiskEvents for audit.'
    );
    await RiskEvent.create({
      severity: 'CRITICAL',
      code: 'CLOSE_ALL_REQUESTED',
      message: 'User requested close-all via Telegram',
      context: { source: 'telegram' },
      occurredAt: new Date(),
    });
    return;
  }
  if (action === 'confirm:emergency') {
    const s = await loadSettings();
    s.tradingEnabled = false;
    s.paused = true;
    s.emergency = true;
    s.version += 1;
    await s.save();
    await RiskEvent.create({
      severity: 'CRITICAL',
      code: 'EMERGENCY_TRIGGERED',
      message: 'User triggered emergency stop via Telegram',
      context: { source: 'telegram' },
      occurredAt: new Date(),
    });
    await ctx.editMessageText('🚨 Emergency stop engaged. Trading disabled, strategy paused.');
  }
}

module.exports = {
  guard,
  start, status, account, trades, history, performance,
  startTrading, stopTrading, pause, resume, emergency, closeAll,
  settings, help,
  setMaxPositions: makeSetter('maxPositions', parseNumber, 'settrades', (v) => Number.isInteger(v) && v >= 1 && v <= 20),
  setLot: makeSetter('defaultLotSize', parseNumber, 'setlot', (v) => v >= 0.01 && v <= 5),
  setProfit: makeSetter('defaultProfitTarget', parseNumber, 'setprofit', (v) => v >= 0.1 && v <= 500),
  setRisk: makeSetter('riskPercent', parseNumber, 'setrisk', (v) => v >= 0.05 && v <= 5),
  setHoldTime: makeSetter('maxHoldSeconds', parseNumber, 'setholdtime', (v) => Number.isInteger(v) && v >= 5 && v <= 3600),
  setMaxLoss: makeSetter('maxDailyLossPercent', parseNumber, 'setmaxloss', (v) => v >= 0.1 && v <= 20),
  setSpread: makeSetter('maxSpread', parseNumber, 'setspread', (v) => v >= 0 && v <= 10000),
  setNewsFilter: makeSetter('newsBlackoutSeconds', parseNumber, 'setnewsfilter', (v) => Number.isInteger(v) && v >= 0 && v <= 3600),
  handleCallback,
};