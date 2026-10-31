// src/database/models/AgentHeartbeat.js
'use strict';

const mongoose = require('mongoose');

const OpenPositionSchema = new mongoose.Schema(
  {
    ticket: String,
    symbol: String,
    type: { type: String, enum: ['BUY', 'SELL', 'buy', 'sell'] },
    volume: Number,
    openPrice: Number,
    profit: Number,
    openTime: Date,
  },
  { _id: false }
);

const AgentHeartbeatSchema = new mongoose.Schema(
  {
    agentId: { type: String, required: true, unique: true, index: true },
    receivedAt: { type: Date, required: true, index: true },
    sentAt: Date,
    balance: Number,
    equity: Number,
    margin: Number,
    freeMargin: Number,
    marginLevel: Number,
    broker: String,
    server: String,
    login: String,
    symbol: String,
    symbolMapped: String,
    terminalBuild: Number,
    pingMs: Number,
    marketOpen: { type: Boolean, default: true },
    openPositions: { type: [OpenPositionSchema], default: [] },
    openPositionsCount: { type: Number, default: 0 },
    eaVersion: String,
  },
  { collection: 'agent_heartbeats', timestamps: false }
);

module.exports =
  mongoose.models.AgentHeartbeat ||
  mongoose.model('AgentHeartbeat', AgentHeartbeatSchema);