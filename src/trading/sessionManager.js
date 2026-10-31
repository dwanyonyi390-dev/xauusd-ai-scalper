'use strict';

/**
 * Trading session gate.
 *
 * Sessions are defined in UTC. Gold trades most cleanly during London and
 * New York, with the London/NY overlap being the highest-liquidity window.
 *
 * Settings exposes { london, newYork, asia } booleans. If a session is
 * disabled, entries are vetoed during that session's active window.
 *
 * IMPORTANT: session detection is a FILTER, not a signal. Being "in session"
 * never causes a trade — it only removes a veto.
 */

// UTC hour windows (end is exclusive, wraps allowed)
const SESSIONS = Object.freeze({
  asia:    { startUtcHour: 0,  endUtcHour: 8  },   // Tokyo
  london:  { startUtcHour: 7,  endUtcHour: 16 },   // London
  newYork: { startUtcHour: 12, endUtcHour: 21 },   // New York
});

function getUtcHour(date = new Date()) {
  return date.getUTCHours() + date.getUTCMinutes() / 60;
}

/**
 * @param {Date} now
 * @param {{london:boolean,newYork:boolean,asia:boolean}} enabled
 * @returns {{active:string[], enabled:string[], allowed:boolean}}
 */
function activeSessions(now, enabled = { london: true, newYork: true, asia: false }) {
  const h = getUtcHour(now);
  const active = [];
  const enabledList = [];

  for (const name of Object.keys(SESSIONS)) {
    const w = SESSIONS[name];
    const inWindow = h >= w.startUtcHour && h < w.endUtcHour;
    if (inWindow) active.push(name);
    if (enabled[name]) enabledList.push(name);
  }

  const allowed = active.some((s) => enabledList.includes(s));
  return { active, enabled: enabledList, allowed };
}

/**
 * Detailed snapshot for logging/audit.
 */
function describe(now = new Date(), enabled = { london: true, newYork: true, asia: false }) {
  const { active, enabled: enabledList, allowed } = activeSessions(now, enabled);
  return {
    utcHour: Number(getUtcHour(now).toFixed(2)),
    utcIso: now.toISOString(),
    activeSessions: active,
    enabledSessions: enabledList,
    allowed,
    windows: SESSIONS,
  };
}

module.exports = { SESSIONS, activeSessions, describe, getUtcHour };