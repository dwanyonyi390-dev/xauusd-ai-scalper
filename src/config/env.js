'use strict';

const { z } = require('zod');
const dotenv = require('dotenv');

// Load .env only in non-production or when explicitly allowed
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
} else {
  dotenv.config({ path: '.env.production' });
}

// Strip empty / whitespace-only env vars BEFORE validation so that
// `.optional()` correctly treats `FOO=` as "unset" rather than "empty string".
for (const key of Object.keys(process.env)) {
  if (typeof process.env[key] === 'string' && process.env[key].trim() === '') {
    delete process.env[key];
  }
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(10000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_ADMIN_ID: z.string().regex(/^\d+$/).optional(),

  MONGODB_URI: z.string().min(1),   // REQUIRED — app cannot start without DB

  MT5_AGENT_ID: z.string().min(1).optional(),
  MT5_AGENT_SECRET: z.string().min(16).optional(),
  MT5_API_SECRET: z.string().min(16).optional(),

  TRADING_SYMBOL: z.string().default('XAUUSD'),
  TRADING_MODE: z.enum(['DEMO', 'LIVE']).default('DEMO'),

  DEFAULT_MAX_POSITIONS: z.coerce.number().int().min(1).max(20).default(4),
  DEFAULT_LOT_SIZE: z.coerce.number().positive().default(0.01),
  DEFAULT_PROFIT_TARGET: z.coerce.number().positive().default(0.5),
  DEFAULT_RISK_PERCENT: z.coerce.number().positive().max(5).default(0.5),
  DEFAULT_MAX_DAILY_LOSS: z.coerce.number().positive().max(20).default(2),
  DEFAULT_MAX_HOLD_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
  DEFAULT_MAX_SPREAD: z.coerce.number().positive().optional(),
  DEFAULT_MAX_CONSECUTIVE_LOSSES: z.coerce.number().int().min(1).default(3),

  NEWS_API_KEY: z.string().optional(),
  ECONOMIC_CALENDAR_API_KEY: z.string().optional(),
});

let parsed;
try {
  parsed = EnvSchema.parse(process.env);
} catch (err) {
  console.error('[env] Invalid environment configuration:');
  if (err.errors) {
    for (const e of err.errors) {
      console.error(`  - ${e.path.join('.')}: ${e.message}`);
    }
  } else {
    console.error(err.message);
  }
  process.exit(1);
}

// Safety: LIVE mode must NEVER be enabled by env alone without explicit marker
if (parsed.TRADING_MODE === 'LIVE' && parsed.NODE_ENV !== 'production') {
  console.error('[env] TRADING_MODE=LIVE is only permitted when NODE_ENV=production.');
  process.exit(1);
}

module.exports = parsed;