// src/telegram/bot.js
'use strict';

const { Bot, GrammyError, HttpError } = require('grammy');
const env = require('../config/env');
const logger = require('../utils/logger');
const { ensureAdminUser } = require('./authorization');
const cmd = require('./commands');
const notifications = require('./notifications');

let bot = null;

function parseArg(ctx) {
  const text = ctx.message?.text || '';
  const parts = text.trim().split(/\s+/);
  return parts[1];
}

/**
 * Guard wrapper — makes a plain handler safe even if cmd.guard is missing.
 * If cmd.guard exists, it runs first; if not, the handler still runs.
 */
function withGuard(handler) {
  return async (ctx, next) => {
    try {
      if (typeof cmd.guard === 'function') {
        // cmd.guard is expected to call next() on success or ctx.reply on failure
        let passed = false;
        await cmd.guard(ctx, () => { passed = true; });
        if (!passed) return; // guard denied
      }
      if (typeof handler === 'function') return handler(ctx, next);
      if (typeof next === 'function') return next();
    } catch (err) {
      logger.error({ err: err.message, stack: err.stack }, 'telegram: handler_error');
      try { await ctx.reply(`Error: ${err.message}`); } catch (_) {}
    }
  };
}

async function startTelegram() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn('telegram_disabled_no_token');
    return null;
  }

  bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // Attach error handler FIRST so every later error is captured
  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) {
      logger.error(
        { description: e.description, method: err.ctx?.updateType },
        'telegram: GrammyError'
      );
    } else if (e instanceof HttpError) {
      logger.error({ error: String(e) }, 'telegram: HttpError (network)');
    } else {
      logger.error({ err: e?.message || String(e), stack: e?.stack }, 'telegram: unhandled_bot_error');
    }
  });

  // One-time DB seed of the authorized admin (non-fatal if it fails)
  try {
    await ensureAdminUser();
    logger.info('telegram: admin user ensured');
  } catch (err) {
    logger.warn({ err: err.message }, 'telegram: ensureAdminUser failed (continuing)');
  }

  // Wire notifications module
  notifications.setBot(bot);

  // Global auth guard — only TELEGRAM_ADMIN_ID may interact
  bot.use(async (ctx, next) => {
    const fromId = ctx.from?.id;
    const adminId = env.TELEGRAM_ADMIN_ID;
    if (!fromId) return next();
    if (String(fromId) !== String(adminId)) {
      logger.warn({ fromId, adminId }, 'telegram: unauthorized message ignored');
      return; // silent — do not reply
    }
    return next();
  });

  // Register every command. Each handler is wrapped so a broken
  // cmd.* (undefined) is surfaced as a log line instead of a silent crash.
  const commands = {
    start: cmd.start,
    help: cmd.help,
    status: cmd.status,
    account: cmd.account,
    balance: cmd.account,
    equity: cmd.account,
    trades: cmd.trades,
    history: cmd.history,
    performance: cmd.performance,
    starttrading: cmd.startTrading,
    stoptrading: cmd.stopTrading,
    pause: cmd.pause,
    resume: cmd.resume,
    emergency: cmd.emergency,
    closeall: cmd.closeAll,
    settings: cmd.settings,
  };
  for (const [name, handler] of Object.entries(commands)) {
    if (typeof handler !== 'function') {
      logger.error({ command: name }, 'telegram: handler missing — command will 404');
      continue;
    }
    bot.command(name, withGuard(handler));
  }

  const argCommands = {
    settrades: (ctx, a) => cmd.setMaxPositions(ctx, a),
    setlot: (ctx, a) => cmd.setLot(ctx, a),
    setprofit: (ctx, a) => cmd.setProfit(ctx, a),
    setrisk: (ctx, a) => cmd.setRisk(ctx, a),
    setholdtime: (ctx, a) => cmd.setHoldTime(ctx, a),
    setmaxloss: (ctx, a) => cmd.setMaxLoss(ctx, a),
    setspread: (ctx, a) => cmd.setSpread(ctx, a),
    setnewsfilter: (ctx, a) => cmd.setNewsFilter(ctx, a),
  };
  for (const [name, factory] of Object.entries(argCommands)) {
    bot.command(name, withGuard((ctx) => factory(ctx, parseArg(ctx))));
  }

  if (typeof cmd.handleCallback === 'function') {
    bot.on('callback_query:data', withGuard((ctx) => cmd.handleCallback(ctx, ctx.callbackQuery.data)));
  } else {
    logger.warn('telegram: cmd.handleCallback missing — inline buttons will not work');
  }

  // Built-in health command, always available regardless of cmd.*
  bot.command('ping', (ctx) => ctx.reply('pong'));

  // Validate token BEFORE returning so callers can safely read bot.botInfo
  logger.info('telegram: calling getMe()…');
  const me = await bot.api.getMe();
  logger.info({ id: me.id, username: me.username, isBot: me.is_bot }, 'telegram: getMe OK');

  // bot.start() calls bot.init() internally and blocks forever — do NOT await.
  bot.start({
    onStart: (info) => logger.info({ username: info.username }, 'telegram_bot_started'),
    drop_pending_updates: false,
  }).catch((err) => logger.error({ err: err.message, stack: err.stack }, 'telegram_start_failed'));

  // Wait for Grammy to have initialized botInfo before returning to index.js.
  // This is what makes bot.botInfo safe to read immediately after `await startTelegram()`.
  try {
    await bot.init();
  } catch (_) {
    // init() may already be running via start(); if not yet, this is fine —
    // bot.botInfo will still be populated by the time we return.
  }

  // Expose an always-safe snapshot for callers that don't want to touch bot.botInfo
  bot.botInfoSafe = { id: me.id, username: me.username, is_bot: me.is_bot };

  logger.info('telegram: startTelegram() returned');
  return bot;
}

function getBot() { return bot; }

module.exports = { startTelegram, getBot };