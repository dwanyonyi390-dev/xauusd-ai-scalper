'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

const PositionSlotSchema = new Schema(
  {
    slot: { type: Number, required: true, min: 0, max: 19 },
    lotSize: { type: Number, required: true, min: 0.01, max: 5 },
    profitTarget: { type: Number, default: null, min: 0.01 },
    riskPercent: { type: Number, default: null, min: 0.01, max: 5 },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const TradingSettingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    subjectId: { type: String, required: true, unique: true, index: true }, // 'agent:<id>' or 'user:<id>'
    symbol: { type: String, required: true, default: 'XAUUSD' },

    // User-editable operational parameters (§7)
    maxPositions: { type: Number, min: 1, max: 20, default: 4 },
    defaultLotSize: { type: Number, min: 0.01, max: 5, default: 0.01 },
    defaultProfitTarget: { type: Number, min: 0.10, max: 500, default: 0.5 },
    riskPercent: { type: Number, min: 0.05, max: 5, default: 0.5 },
    maxDailyLossPercent: { type: Number, min: 0.1, max: 20, default: 2 },
    maxConsecutiveLosses: { type: Number, min: 1, max: 50, default: 3 },
    maxHoldSeconds: { type: Number, min: 5, max: 3600, default: 60 },
    maxSpread: { type: Number, default: null },
    minSignalQuality: { type: Number, min: 0, max: 100, default: 60 },
    newsBlackoutSeconds: { type: Number, min: 0, max: 3600, default: 900 },
    tradingSessions: {
      london: { type: Boolean, default: true },
      newYork: { type: Boolean, default: true },
      asia: { type: Boolean, default: false },
    },
    maxAccountExposurePercent: { type: Number, min: 1, max: 100, default: 30 },

    positionSlots: { type: [PositionSlotSchema], default: [] },

    // Runtime state — not user-editable
    tradingEnabled: { type: Boolean, default: false },
    paused: { type: Boolean, default: false },
    emergency: { type: Boolean, default: false },

    version: { type: Number, default: 1 },
    updatedBy: { type: String, default: null },
  },
  baseOptions('tradingsettings')
);

module.exports = model('TradingSettings', TradingSettingsSchema);