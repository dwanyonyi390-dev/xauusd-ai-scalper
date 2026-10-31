'use strict';

const nowMs = () => Date.now();
const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * Reject stale timestamps. Used for HMAC replay protection (§15).
 * @param {number} tsMs epoch ms
 * @param {number} toleranceSec allowed skew
 */
function isFreshTimestamp(tsMs, toleranceSec = 300) {
  if (!Number.isFinite(tsMs)) return false;
  const delta = Math.abs(Date.now() - tsMs);
  return delta <= toleranceSec * 1000;
}

function utcDateKey(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
}

module.exports = { nowMs, nowSec, isFreshTimestamp, utcDateKey };