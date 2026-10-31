'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

const MarketTickSummarySchema = new Schema(
  {
    symbol: { type: String, required: true, index: true },
    bucketStart: { type: Date, required: true, index: true },
    bucketMs: { type: Number, required: true },
    bidOpen: Number,
    bidHigh: Number,
    bidLow: Number,
    bidClose: Number,
    askOpen: Number,
    askHigh: Number,
    askLow: Number,
    askClose: Number,
    tickCount: { type: Number, default: 0 },
    avgSpread: { type: Number, default: null },
    maxSpread: { type: Number, default: null },
    velocity: { type: Number, default: null }, // price change / time
  },
  baseOptions('markettick_summaries')
);

MarketTickSummarySchema.index({ symbol: 1, bucketStart: -1 }, { unique: true });

// Auto-expire raw tick summaries after 7 days (configurable later)
MarketTickSummarySchema.index({ bucketStart: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

module.exports = model('MarketTickSummary', MarketTickSummarySchema);