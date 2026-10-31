#!/usr/bin/env node
'use strict';

/**
 * Create or promote the Telegram admin user.
 *
 * Usage:
 *   node scripts/createAdmin.js              # uses TELEGRAM_ADMIN_ID from .env
 *   node scripts/createAdmin.js 123456789    # explicit telegram id
 */

require('dotenv').config();

const env = require('../src/config/env');
const db = require('../src/database/connection');
const User = require('../src/database/models/User');
const logger = require('../src/utils/logger');

async function main() {
  const idArg = process.argv[2];
  const telegramId = String(idArg || env.TELEGRAM_ADMIN_ID || '').trim();

  if (!telegramId) {
    console.error('❌ No telegram id provided. Pass as arg or set TELEGRAM_ADMIN_ID.');
    process.exit(1);
  }
  if (!/^\d+$/.test(telegramId)) {
    console.error('❌ Telegram id must be numeric.');
    process.exit(1);
  }

  await db.connect();
  try {
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        role: 'admin',
        authorized: true,
        displayName: 'Admin',
      });
      console.log(`✅ Created admin user telegramId=${telegramId}`);
    } else {
      user.role = 'admin';
      user.authorized = true;
      await user.save();
      console.log(`✅ Promoted existing user telegramId=${telegramId} to admin`);
    }
    console.log(`   _id=${user._id}`);
  } finally {
    await db.disconnect();
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  logger.error({ err: err.stack }, 'createAdmin_failed');
  process.exit(1);
});