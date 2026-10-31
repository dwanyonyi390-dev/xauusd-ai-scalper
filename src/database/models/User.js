'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions, secretGuard } = require('./_shared');

const UserSchema = new Schema(
  {
    telegramId: { type: String, required: true, index: true, unique: true },
    displayName: { type: String, default: null },
    role: { type: String, enum: ['admin', 'viewer'], default: 'admin' },
    authorized: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: null },
  },
  baseOptions('users')
);

secretGuard(UserSchema);

module.exports = model('User', UserSchema);