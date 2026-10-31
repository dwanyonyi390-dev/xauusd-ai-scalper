// src/index.js
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Pre-logger safety net — must be the FIRST code in the file.
// Guarantees that a crash during module load is visible on the console,
// even if ./utils/logger itself is the module that's broken.
// ─────────────────────────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('UNCAUGHT (pre-logger):', (err && err.stack) || err);
});
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('UNHANDLED (pre-logger):', reason);
});

// ─────────────────────────────────────────────────────────────────────────────
// Safe module loader — if a require() fails, print the module path and exit.
// Never hides a broken module behind a silent crash.
// ─────────────────────────────────────────────────────────────────────────────
function safeRequire(path) {
  try {
    const mod = require(path);
    // eslint-disable-next-line no-console
    console.log('OK  require', path);
    return mod;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('FAIL require', path, '\n', (err && err.stack) || err);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Module loading
// ─────────────────────────────────────────────────────────────────────────────
const env = safeRequire('./config/env');
const logger = safeRequire('./utils/logger');
const { createApp } = safeRequire('./app');
const db = safeRequire('./database/connection');

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  // ── 1. Database ────────────────────────────────────────────────────────────
  try {
    await db.connect();
    // NOTE: connection.js already logs "[db] connected" internally.
    // Do not log it again here — that was the duplicate in your earlier run.
  } catch (err) {
    logger.fatal({ err: err.message }, 'db_connect_failed_on_startup');
    process.exit(1);
  }

  // ── 2. HTTP server ─────────────────────────────────────────────────────────
  const app = createApp();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(
      { port: env.PORT, mode: env.TRADING_MODE, env: env.NODE_ENV },
      'server_started'
    );
  });

  // ── 3. Telegram ────────────────────────────────────────────────────────────
  logger.info('telegram: boot step 1 - loading bot module');

  let startTelegram;
  try {
    ({ startTelegram } = require('./telegram/bot'));
  } catch (err) {
    logger.error(
      { err: err.message, stack: err.stack },
      'telegram: FAILED TO REQUIRE MODULE'
    );
    startTelegram = null;
  }

  if (typeof startTelegram === 'function') {
    logger.info('telegram: boot step 2 - calling startTelegram()');
    try {
      // bot.js signature: startTelegram() — no args. It reads env internally.
      const bot = await startTelegram();

      // Safe identity read — botInfoSafe is populated by startTelegram().
      // Never throws. Never crashes a log line.
      let info = bot && bot.botInfoSafe;
      if (!info) {
        try {
          info = bot && bot.botInfo ? bot.botInfo : null;
        } catch (_) {
          info = null;
        }
      }

      logger.info(
        {
          botId: info && info.id,
          username: info && info.username,
          polling: true,
        },
        'telegram: started'
      );
    } catch (err) {
      logger.error(
        { message: err.message, stack: err.stack },
        'telegram: FAILED TO START (HTTP still running)'
      );
    }
  } else {
    logger.error('telegram: startTelegram is not a function - bot will NOT run');
  }

  // ── 4. Graceful shutdown ───────────────────────────────────────────────────
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn({ signal }, 'shutdown_initiated');

    // Stop Telegram polling FIRST so restart doesn't hit 409 Conflict.
    try {
      if (
        app.locals &&
        app.locals.bot &&
        typeof app.locals.bot.stop === 'function'
      ) {
        await app.locals.bot.stop();
        logger.info('telegram: stopped');
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'telegram_stop_error');
    }

    // Force-exit if cleanup hangs.
    const forceTimer = setTimeout(() => {
      logger.error('shutdown_forced');
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    server.close(async (err) => {
      if (err) logger.error({ err: err.message }, 'server_close_error');
      try {
        await db.disconnect();
      } catch (_) {
        /* ignore */
      }
      logger.info('shutdown_complete');
      process.exit(err ? 1 : 0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Replace the pre-logger handlers with logger-aware ones now that pino is up.
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
  process.on('uncaughtException', (err) => {
    logger.fatal(
      { err: err.message, stack: err.stack },
      'uncaught_exception'
    );
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason: String(reason) }, 'unhandled_rejection');
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('FATAL:', (err && err.stack) || err);
  process.exit(1);
});