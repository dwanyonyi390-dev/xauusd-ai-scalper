'use strict';

const { Schema, model } = require('mongoose');
const { baseOptions } = require('./_shared');

/**
 * Immutable log of every broker execution event (open, partial, close, reject).
 * Never update a document — append only (§13, §20).
 */
const TradeExecutionSchema = new Schema(
  {
    tradeId: { type: String, required: true, index: true },
    brokerTicket: { type: Number, default: null, index: true },
    agentId: { type: String, required: true, index: true },
    event: {
      type: String,
      enum: ['OPEN_REQUESTED', 'OPEN_FILLED', 'OPEN_REJECTED', 'CLOSE_REQUESTED', 'CLOSE_FILLED', 'CLOSE_FAILED', 'MODIFIED'],
      required: true,
    },
    requestId: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    brokerResponse: { type: Schema.Types.Mixed, default: null },
    occurredAt: { type: Date, required: true, index: true },
  },
  { ...baseOptions('tradeexecutions'), versionKey: false }
);

TradeExecutionSchema.index({ tradeId: 1, occurredAt: 1 });

module.exports = model('TradeExecution', TradeExecutionSchema);