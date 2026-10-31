'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

const PerformanceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    period: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'ALL_TIME'], required: true },
    periodKey: { type: String, required: true }, // '2026-10-31' | '2026-W44' | '2026-10'

    startBalance: { type: Number, required: true },
    endBalance: { type: Number, default: null },
    equityHigh: { type: Number, default: null },
    equityLow: { type: Number, default: null },

    trades: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    breakEven: { type: Number, default: 0 },
    winRate: { type: Number, default: null },

    realizedPnl: { type: Number, default: 0 },
    avgWinUSD: { type: Number, default: null },
    avgLossUSD: { type: Number, default: null },
    profitFactor: { type: Number, default: null },

    maxDrawdownUSD: { type: Number, default: null },
    maxDrawdownPercent: { type: Number, default: null },

    avgHoldingSeconds: { type: Number, default: null },
    totalCommission: { type: Number, default: 0 },
    totalSwap: { type: Number, default: 0 },
  },
  baseOptions('performances')
);

PerformanceSchema.index({ userId: 1, period: 1, periodKey: 1 }, { unique: true });

module.exports = model('Performance', PerformanceSchema);