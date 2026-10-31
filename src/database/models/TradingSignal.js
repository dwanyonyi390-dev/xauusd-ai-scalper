'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

const EvidenceSchema = new Schema(
  {
    type: { type: String, required: true }, // 'INDICATOR' | 'PRICE_ACTION' | 'NEWS' | 'AI'
    label: { type: String, required: true },
    value: { type: Schema.Types.Mixed, default: null },
    weight: { type: Number, default: 0 }, // 0..1
  },
  { _id: false }
);

const TradingSignalSchema = new Schema(
  {
    signalId: { type: String, required: true, unique: true, index: true },
    symbol: { type: String, required: true, index: true },
    direction: { type: String, enum: ['BUY', 'SELL', 'NO_TRADE'], required: true },
    createdAt: { type: Date, required: true, index: true },

    entryConditions: { type: Schema.Types.Mixed, default: {} },
    entryPrice: { type: Number, default: null },
    stopLoss: { type: Number, default: null },
    takeProfit: { type: Number, default: null },
    expectedRewardUSD: { type: Number, default: null },
    estimatedCostUSD: { type: Number, default: null },
    riskRewardRatio: { type: Number, default: null },

    probability: { type: Number, min: 0, max: 1, default: null },
    marketRegime: { type: String, default: null },
    supportingEvidence: { type: [EvidenceSchema], default: [] },
    rejectionReasons: { type: [String], default: [] },

    strategyVersion: { type: String, required: true },
    aiTraceId: { type: String, default: null },

    executed: { type: Boolean, default: false },
    executedAt: { type: Date, default: null },
  },
  baseOptions('tradingsignals')
);

TradingSignalSchema.index({ symbol: 1, createdAt: -1 });

module.exports = model('TradingSignal', TradingSignalSchema);