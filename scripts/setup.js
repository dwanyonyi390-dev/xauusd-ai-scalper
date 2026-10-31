#!/usr/bin/env node
'use strict';

/**
 * One-time bootstrap. Run ONCE per environment after cloning + .env setup.
 *
 * Does NOT trade. Does NOT alter settings. Only:
 *   1. Validates env (same schema as the app).
 *   2. Connects to MongoDB.
 *   3. Ensures model indexes are built.
 *   4. Ensures the Telegram admin user exists.
 *   5. Prints a readiness checklist.
 *
 * Usage: npm run setup
 */

require('dotenv').config();

const env = require('../src/config/env');
const logger = require('../src/utils/logger');
const db = require('../src/database/connection');
const { ensureAdminUser } = require('../src/telegram/authorization');

async function main() {
  console.log('🔧 XAUUSD-AI-SCALPER setup\n');

  console.log('[1/5] Environment validated by src/config/env.js at import time.');

  console.log('[2/5] Connecting to MongoDB…');
  await db.connect();
  console.log('      ✅ connected');

  console.log('[3/5] Building model indexes…');
  const models = require('../src/database/models');
  for (const [name, model] of Object.entries(models)) {
    if (!model || typeof model.init !== 'function') continue;
    try {
      await model.init();
      console.log(`      ✅ ${name}`);
    } catch (err) {
      console.log(`      ⚠️  ${name}: ${err.message}`);
    }
  }

  console.log('[4/5] Ensuring admin user…');
  const admin = await ensureAdminUser();
  if (admin) {
    console.log(`      ✅ admin telegramId=${admin.telegramId}`);
  } else {
    console.log('      ⚠️  TELEGRAM_ADMIN_ID not set — no admin created');
  }

  console.log('[5/5] Readiness checklist:');
  const checks = [
    ['MONGODB_URI', Boolean(env.MONGODB_URI), 'required'],
    ['TELEGRAM_BOT_TOKEN', Boolean(env.TELEGRAM_BOT_TOKEN), 'optional'],
    ['TELEGRAM_ADMIN_ID', Boolean(env.TELEGRAM_ADMIN_ID), 'optional'],
    ['MT5_AGENT_ID', Boolean(env.MT5_AGENT_ID), 'optional (EA auth)'],
    ['MT5_AGENT_SECRET', Boolean(env.MT5_AGENT_SECRET), 'optional (EA auth)'],
    ['OPENAI_API_KEY', Boolean(env.OPENAI_API_KEY), 'optional (AI layer)'],
  ];
  for (const [key, ok, note] of checks) {
    console.log(`      ${ok ? '✅' : '⬜'} ${key} (${note})`);
  }

  await db.disconnect();
  console.log('\n✅ Setup complete. Next: npm start');
}

main().catch((err) => {
  console.error('\n❌ Setup failed:', err.message);
  logger.error({ err: err.stack }, 'setup_failed');
  process.exit(1);
});