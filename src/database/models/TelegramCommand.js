'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

const TelegramCommandSchema = new Schema(
  {
    telegramId: { type: String, required: true, index: true },
    command: { type: String, required: true, index: true },
    args: { type: [String], default: [] },
    authorized: { type: Boolean, required: true },
    resultStatus: { type: String, enum: ['OK', 'REJECTED', 'ERROR', 'PENDING_CONFIRM'], required: true },
    resultMessage: { type: String, default: null },
    requestId: { type: String, default: null, index: true },
    occurredAt: { type: Date, required: true, index: true },
  },
  baseOptions('telegramcommands')
);

TelegramCommandSchema.index({ telegramId: 1, occurredAt: -1 });

module.exports = model('TelegramCommand', TelegramCommandSchema);