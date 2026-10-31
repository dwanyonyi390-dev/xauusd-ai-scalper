'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

const MarketAnalysisSchema = new Schema(
  {
    symbol: { type: String, required: true, index: true },
    analyzedAt: { type: Date, required: true, index: true },
    timeframe: { type: String, enum: ['TICK', 'S1', 'M1', 'M5', 'M15', 'H1'], required: true },

    ema5: Number,
    ema9: Number,
    ema20: Number,
    ema50: Number,
    rsi: Number,
    macd: Number,
    macdSignal: Number,
    atr: Number,
    bbUpper: Number,
    bbMiddle: Number,
    bbLower: Number,
    adx: Number,
    vwap: Number,

    spread: Number,
    volatility: Number,
    trendStrength: Number,
    momentum: Number,
    priceVelocity: Number,

    regime: { type: String, default: null }, // e.g. TREND_UP, RANGE, CHOP
    notes: { type: String, default: null },
  },
  baseOptions('marketanalyses')
);

MarketAnalysisSchema.index({ symbol: 1, timeframe: 1, analyzedAt: -1 });

module.exports = model('MarketAnalysis', MarketAnalysisSchema);