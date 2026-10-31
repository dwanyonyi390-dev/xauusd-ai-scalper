'use strict';

const defaults = {
  maxPositions: Number(process.env.DEFAULT_MAX_POSITIONS || 4),
  lotSize: Number(process.env.DEFAULT_LOT_SIZE || 0.01),
  profitTarget: Number(process.env.DEFAULT_PROFIT_TARGET || 0.5),
  riskPercent: Number(process.env.DEFAULT_RISK_PERCENT || 0.5),
  maxDailyLoss: Number(process.env.DEFAULT_MAX_DAILY_LOSS || 2),
  maxConsecutiveLosses: Number(process.env.DEFAULT_MAX_CONSECUTIVE_LOSSES || 3),
  maxHoldSeconds: Number(process.env.DEFAULT_MAX_HOLD_SECONDS || 60),
  maxSpread: Number(process.env.DEFAULT_MAX_SPREAD || 0.5),
  minExpectedNetProfit: 0.1,
  minSignalQuality: 0.6,
  newsBlackoutMinutes: 15,
  sessions: ['london', 'newyork'],
  maxAccountExposure: 0.3,
  slots: [
    { lotSize: 0.01, profitTarget: 0.5, enabled: true },
    { lotSize: 0.01, profitTarget: 0.5, enabled: true },
    { lotSize: 0.02, profitTarget: 0.5, enabled: true },
    { lotSize: 0.02, profitTarget: 0.5, enabled: true },
  ],
};

const store = new Map();
const k = (userId) => `settings:${userId}`;

async function get(userId) {
  return store.get(k(userId)) || { userId, ...structuredClone(defaults) };
}

async function replace(userId, body) {
  const fresh = { userId, ...defaults, ...body };
  // keep slots from body if provided, otherwise preserve defaults
  if (!body.slots) fresh.slots = structuredClone(defaults.slots);
  store.set(k(userId), fresh);
  return fresh;
}

async function update(userId, patch) {
  const current = await get(userId);
  const next = { ...current, ...patch };
  store.set(k(userId), next);
  return next;
}

async function updateSlot(userId, slotIndex, patch) {
  const current = await get(userId);
  const slots = Array.isArray(current.slots) ? [...current.slots] : [...defaults.slots];
  slots[slotIndex] = { ...(slots[slotIndex] || {}), ...patch };
  const next = { ...current, slots };
  store.set(k(userId), next);
  return next;
}

async function reset(userId) {
  const fresh = { userId, ...structuredClone(defaults) };
  store.set(k(userId), fresh);
  return fresh;
}

module.exports = { get, replace, update, updateSlot, reset, defaults };