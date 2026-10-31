'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

const EconomicEventSchema = new Schema(
  {
    source: { type: String, required: true, index: true },
    externalId: { type: String, required: true },
    title: { type: String, required: true },
    country: { type: String, default: 'US', index: true },
    importance: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: true, index: true },
    scheduledAt: { type: Date, required: true, index: true },
    publishedAt: { type: Date, default: null },
    actual: { type: String, default: null },
    forecast: { type: String, default: null },
    previous: { type: String, default: null },
    currency: { type: String, default: 'USD' },
    notes: { type: String, default: null },
    fetchedAt: { type: Date, required: true },
  },
  baseOptions('economicevents')
);

EconomicEventSchema.index({ source: 1, externalId: 1 }, { unique: true });
EconomicEventSchema.index({ scheduledAt: 1, importance: 1 });

module.exports = model('EconomicEvent', EconomicEventSchema);