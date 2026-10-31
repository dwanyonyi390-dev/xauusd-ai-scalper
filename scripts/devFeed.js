#!/usr/bin/env node
'use strict';

/**
 * Development tick feed.
 *
 * Simulates an MT5 agent that pushes ticks. Signs requests with the same
 * HMAC scheme the real EA uses. Requires these env vars to be set in .env:
 *
 *   MT5_AGENT_ID       (e.g. "dev-agent")
 *   MT5_AGENT_SECRET   (>= 16 chars)
 *   API_BASE           (default http://localhost:10000)
 *
 * Then it:
 *   1. Sends heartbeats every 5s
 *   2. Sends tick summaries every 1s
 *   3. Logs any strategy signals it sees in response headers (future)
 *
 * Run in a second terminal while `npm start` is running:
 *   node scripts/devFeed.js
 *
 * The feed walks bid around BASE_PRICE with a small random step, and quotes
 * ask = bid + simulated spread (random 0.2-0.5, occasionally spiking to test
 * the spread gate).
 */

require('dotenv').config();

const crypto = require('crypto');

const AGENT_ID = process.env.MT5_AGENT_ID;
const AGENT_SECRET = process.env.MT5_AGENT_SECRET;
const API_BASE = process.env.API_BASE || 'http://localhost:10000';

if (!AGENT_ID || !AGENT_SECRET) {
  console.error('❌ MT5_AGENT_ID and MT5_AGENT_SECRET must be set in .env');
  process.exit(1);
}

const sign = (ts, rid, body) =>
  crypto.createHmac('sha256', AGENT_SECRET).update(`${ts}.${rid}.${body}`).digest('hex');

async function post(path, payload) {
  const ts = Date.now();
  const rid = `dev-${ts}-${Math.random().toString(36).slice(2, 8)}`;
  const body = JSON.stringify(payload);
  const sig = sign(ts, rid, body);

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': AGENT_ID,
      'x-timestamp': String(ts),
      'x-request-id': rid,
      'x-signature': sig,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[${path}] ${res.status} ${text}`);
    return null;
  }
  return res.json().catch(() => ({}));
}

// ── Random-walk generator ─────────────────────────────────────────────────
let bid = 2000.00;
const drift = 0.000