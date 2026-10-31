#!/usr/bin/env node
'use strict';

/**
 * Validates the process environment against the same Zod schema the app uses.
 * Exits 0 if valid, 1 if invalid.
 *
 * IMPORTANT: empty strings in .env (e.g. `TELEGRAM_BOT_TOKEN=`) are treated
 * as UNSET, not as empty strings. This is what makes `.optional()` work.
 */

require('dotenv').config();

const { z } = require('zod');

// Strip empty / whitespace-only env vars so `.optional()` applies to them.
for (const key of Object.keys(process.env)) {
  if (typeof process.env[key] === 'string' && process.env[key].trim() === '') {
    delete process.env[key];
  }
}

const OPTIONAL_BUT_RECOMMENDED = [
  ['TELEGRAM_BOT_TOKEN', 'Telegram commands will be disabled'],
  ['TELEGRAM_ADMIN_ID', 'No admin will be able to authorize commands'],
  ['MT5_AGENT_ID', 'MT5 agent authentication disabled'],
  ['MT5_AGENT_SECRET', 'MT5 agent authentication disabled'],
  ['OPENAI_API_KEY', 'AI decision layer disabled'],
];

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(10000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_ADMIN_ID: z.string().regex(/^\d+$/).optional(),
  MONGODB_URI: z.string().min(1),               // REQUIRED
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

function main() {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Environment validation failed:\n');
    for (const issue of result.error.issues) {
      console.error(`   - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    console.error('\nFix the above and re-run. See .env.example for the canonical list.');
    process.exit(1);
  }

  if (result.data.TRADING_MODE === 'LIVE' && result.data.NODE_ENV !== 'production') {
    console.error('❌ TRADING_MODE=LIVE is only permitted when NODE_ENV=production.');
    process.exit(1);
  }

  console.log('✅ Environment is valid.');
  console.log(`   NODE_ENV=${result.data.NODE_ENV}`);
  console.log(`   TRADING_MODE=${result.data.TRADING_MODE}`);
  console.log(`   TRADING_SYMBOL=${result.data.TRADING_SYMBOL}`);

  const missing = OPTIONAL_BUT_RECOMMENDED.filter(([k]) => !result.data[k]);
  if (missing.length) {
    console.log('\n⚠️  Optional but recommended (unset):');
    for (const [k, why] of missing) console.log(`   - ${k}: ${why}`);
  }

  if (result.data.TRADING_MODE === 'LIVE') {
    console.log('\n🚨 LIVE MODE IS ENABLED. Confirm demo testing is complete before proceeding.');
  }
  process.exit(0);
}

main();