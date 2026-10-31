'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

const RiskEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    severity: { type: String, enum: ['INFO', 'WARN', 'CRITICAL'], required: true },
    code: { type: String, required: true, index: true },
    message: { type: String, required: true },
    context: { type: Schema.Types.Mixed, default: {} },
    actionTaken: { type: String, default: null },
    acknowledgedAt: { type: Date, default: null },
    occurredAt: { type: Date, required: true, index: true },
  },
  baseOptions('riskevents')
);

RiskEventSchema.index({ severity: 1, occurredAt: -1 });

module.exports = model('RiskEvent', RiskEventSchema);