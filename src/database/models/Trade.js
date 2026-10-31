'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

const TradeSchema = new Schema(
  {
    tradeId: { type: String, required: true, unique: true, index: true },
    signalId: { type: String, default: null, index: true },
    brokerTicket: { type: Number, default: null, index: true },
    symbol: { type: String, required: true, index: true },
    direction: { type: String, enum: ['BUY', 'SELL'], required: true },
    lotSize: { type: Number, required: true },

    entryPrice: { type: Number, required: true },
    exitPrice: { type: Number, default: null },
    entryTime: { type: Date, required: true, index: true },
    exitTime: { type: Date, default: null },

    grossProfit: { type: Number, default: null },
    commission: { type: Number, default: null },
    swap: { type: Number, default: null },
    netProfit: { type: Number, default: null },

    stopLoss: { type: Number, default: null },
    takeProfit: { type: Number, default: null },
    holdingDurationSec: { type: Number, default: null },

    strategyVersion: { type: String, required: true },
    exitReason: {
      type: String,
      enum: [
        'PROFIT_TARGET',
        'STOP_LOSS',
        'BASKET_PROFIT',
        'TRAILING',
        'MOMENTUM_FADE',
        'REVERSAL',
        'MAX_HOLD',
        'EMERGENCY',
        'MANUAL',
        null,
      ],
      default: null,
    },

    status: {
      type: String,
      enum: ['OPEN', 'CLOSING', 'CLOSED', 'FAILED'],
      default: 'OPEN',
      index: true,
    },

    executionResult: { type: Schema.Types.Mixed, default: null },
  },
  baseOptions('trades')
);

TradeSchema.index({ symbol: 1, status: 1, entryTime: -1 });

module.exports = model('Trade', TradeSchema);