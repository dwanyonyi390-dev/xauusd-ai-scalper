'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

const TradingSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    startEquity: { type: Number, required: true },
    endEquity: { type: Number, default: null },
    tradesOpened: { type: Number, default: 0 },
    tradesClosed: { type: Number, default: 0 },
    realizedPnl: { type: Number, default: 0 },
    exitReason: { type: String, default: null },
    strategyVersion: { type: String, required: true },
  },
  baseOptions('tradingsessions')
);

TradingSessionSchema.index({ userId: 1, startedAt: -1 });

module.exports = model('TradingSession', TradingSessionSchema);