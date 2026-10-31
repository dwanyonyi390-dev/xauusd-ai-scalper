'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

const SystemLogSchema = new Schema(
  {
    level: { type: String, enum: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'], required: true, index: true },
    source: { type: String, required: true, index: true },
    message: { type: String, required: true },
    context: { type: Schema.Types.Mixed, default: {} },
    reqId: { type: String, default: null, index: true },
    occurredAt: { type: Date, required: true },     // ← removed index: true (TTL index below covers it)
  },
  { ...baseOptions('systemlogs'), versionKey: false }
);

SystemLogSchema.index({ level: 1, occurredAt: -1 });
SystemLogSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 14 * 24 * 3600 });

module.exports = model('SystemLog', SystemLogSchema);