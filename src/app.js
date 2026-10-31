// src/app.js
'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const env = require('./config/env');

/**
 * Safe route loader — names the exact file that failed to load or whose
 * handlers are undefined.
 */
function safeMount(app, mountPath, modulePath, requiredHandlers) {
  let mod;
  try {
    mod = require(modulePath);
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack, modulePath }, 'route_require_failed');
    throw err;
  }

  if (requiredHandlers && typeof requiredHandlers === 'object') {
    for (const name of Object.keys(requiredHandlers)) {
      const fn = requiredHandlers[name];
      if (typeof fn !== 'function') {
        const msg = `[app] ${mountPath}: controller.${name} is ${typeof fn}`;
        logger.error(
          { mountPath, modulePath, name, actualType: typeof fn },
          'route_controller_missing'
        );
        throw new Error(msg);
      }
    }
  }

  app.use(mountPath, mod);
  logger.info({ mountPath }, 'route_mounted');
}

function createApp() {
  const app = express();

  // ── Baselines ─────────────────────────────────────────────────────────────
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: false }));

  // ── Ensure rawBody is always a string (fixes HMAC on GET / no-body) ───────
  // express.json() only fires its verify() when there IS a body. Seeding
  // rawBody = '' here guarantees req.rawBody is always defined, so the
  // middleware hashes '' for GET/empty-body requests — matching the client.
  app.use((req, _res, next) => {
    req.rawBody = '';
    next();
  });

  app.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  // ── Global rate limit ─────────────────────────────────────────────────────
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    })
  );

  // ── Request id + access log ───────────────────────────────────────────────
  app.use((req, res, next) => {
    req.id =
      req.headers['x-request-id'] ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    res.setHeader('x-request-id', req.id);
    const start = Date.now();
    res.on('finish', () => {
      logger.info(
        {
          reqId: req.id,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - start,
        },
        'http'
      );
    });
    next();
  });

  // ── App locals REQUIRED by authenticateAgent ──────────────────────────────
  if (!app.locals.seenNonces) app.locals.seenNonces = new Map();
  if (!app.locals.config) {
    app.locals.config = {
      HMAC_CLOCK_SKEW_SECONDS: Number(process.env.HMAC_CLOCK_SKEW_SECONDS || 300),
    };
  }
  const nonceCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - app.locals.config.HMAC_CLOCK_SKEW_SECONDS * 2 * 1000;
    const map = app.locals.seenNonces;
    if (!map || typeof map.forEach !== 'function') return;
    let removed = 0;
    for (const [k, v] of map) {
      if (typeof v === 'number' && v < cutoff) {
        map.delete(k);
        removed++;
      }
    }
    if (removed) logger.debug({ removed, remaining: map.size }, 'nonce_cleanup');
  }, 60_000);
  nonceCleanupTimer.unref();
  app.locals.nonceCleanupTimer = nonceCleanupTimer;

  // ── Health (top-level /health — Render healthCheckPath compatible) ────────
  const healthHandler = (_req, res) => {
    let db = { connected: false, readyState: 0 };
    try {
      const status = require('./database/connection').status;
      if (typeof status === 'function') db = status();
    } catch (err) {
      db = { connected: false, readyState: -1, error: err.message };
    }
    res.json({
      ok: true,
      service: 'xauusd-ai-scalper',
      env: env.NODE_ENV,
      tradingMode: env.TRADING_MODE,
      db,
      phase: 4,
      time: new Date().toISOString(),
    });
  };
  app.get('/health', healthHandler);

  // ── API routes ────────────────────────────────────────────────────────────
  safeMount(
    app,
    '/api/agent',
    './api/routes/agent',
    require('./api/controllers/agentController')
  );
  safeMount(
    app,
    '/api/settings',
    './api/routes/settings',
    require('./api/controllers/settingsController')
  );
  safeMount(app, '/api/trades', './api/routes/trades');
  safeMount(app, '/api/performance', './api/routes/performance');
  safeMount(app, '/api/signals', './api/routes/signals');

  try {
    app.use('/api/health', require('./api/routes/health'));
    logger.info({ mountPath: '/api/health' }, 'route_mounted');
  } catch (err) {
    logger.warn({ err: err.message }, 'health_route_missing_using_alias');
    app.get('/api/health', healthHandler);
  }

  // ── 404 + error handler ───────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

  const { errorHandler } = require('./api/middleware/errorHandler');
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };