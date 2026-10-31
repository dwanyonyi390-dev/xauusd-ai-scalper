'use strict';

const env = require('../config/env');
const User = require('../database/models/User');

async function ensureAdminUser() {
  if (!env.TELEGRAM_ADMIN_ID) return null;
  const id = String(env.TELEGRAM_ADMIN_ID);
  let user = await User.findOne({ telegramId: id });
  if (!user) {
    user = await User.create({
      telegramId: id,
      role: 'admin',
      authorized: true,
      displayName: 'Admin',
    });
  } else if (!user.authorized || user.role !== 'admin') {
    user.authorized = true;
    user.role = 'admin';
    await user.save();
  }
  return user;
}

async function isAuthorized(ctx) {
  const id = ctx.from?.id;
  if (!id) return false;
  const idStr = String(id);
  if (env.TELEGRAM_ADMIN_ID && idStr === env.TELEGRAM_ADMIN_ID) return true;
  const user = await User.findOne({ telegramId: idStr, authorized: true }).lean();
  return Boolean(user);
}

module.exports = { isAuthorized, ensureAdminUser };