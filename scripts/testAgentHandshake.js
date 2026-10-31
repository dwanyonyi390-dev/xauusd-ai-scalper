// scripts/testAgentHandshake.js
'use strict';

require('dotenv').config();
const { buildAuthHeaders } = require('../src/mt5/agentAuth');

const BASE = process.env.AGENT_TEST_BASE || `http://localhost:${process.env.PORT || 10000}`;
const agentId = process.env.MT5_AGENT_ID;
const secret = process.env.MT5_AGENT_SECRET;

if (!agentId || !secret) {
  console.error('Missing MT5_AGENT_ID or MT5_AGENT_SECRET in .env');
  process.exit(1);
}

async function sendSigned({ method, path, body }) {
  const bodyForSign = body == null ? '' : body;   // GET → ''
  const headers = buildAuthHeaders({
    agentId, secret, method, path, body: bodyForSign,
  });
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(bodyForSign ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: bodyForSign || undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

async function main() {
  let failures = 0;

  // 1. Heartbeat
  const heartbeatPayload = {
    sentAt: new Date().toISOString(),
    balance: 10000.0,
    equity: 10012.34,
    margin: 0,
    freeMargin: 10012.34,
    marginLevel: 0,
    broker: 'LocalTest',
    server: 'LocalTest',
    login: 12345678,
    symbol: 'XAUUSD',
    symbolMapped: 'XAUUSD',
    terminalBuild: 4620,
    pingMs: 1,
    marketOpen: true,
    openPositions: [],
    openPositionsCount: 0,
    eaVersion: 'handshake-test',
  };
  console.log(`-> POST ${BASE}/api/agent/heartbeat`);
  const hb = await sendSigned({
    method: 'POST',
    path: '/api/agent/heartbeat',
    body: JSON.stringify(heartbeatPayload),
  });
  console.log('   status:', hb.status, 'body:', JSON.stringify(hb.body));
  if (hb.status !== 200 || hb.body.ok !== true) failures++;

  // 2. Config (GET, no body)
  console.log(`-> GET  ${BASE}/api/agent/config`);
  const cfg = await sendSigned({ method: 'GET', path: '/api/agent/config', body: '' });
  const cfgInfo = cfg.body && cfg.body.config;
  console.log(
    '   status:', cfg.status,
    'symbol:', cfgInfo && cfgInfo.symbol,
    'mode:', cfgInfo && cfgInfo.tradingMode
  );
  if (cfg.status !== 200 || cfg.body.ok !== true) failures++;

  // 3. Trade report (OPEN)
  const tradeId = `test-${Date.now()}`;
  const openReport = {
    eventId: `open-${tradeId}`,
    type: 'OPEN',
    tradeId,
    ticket: 999999,
    symbol: 'XAUUSD',
    direction: 'BUY',
    volume: 0.01,
    entryPrice: 2000.0,
    stopLoss: 1999.8,
    takeProfit: 2000.4,
    openTime: new Date().toISOString(),
  };
  console.log(`-> POST ${BASE}/api/agent/trade-report (OPEN)`);
  const tr = await sendSigned({
    method: 'POST',
    path: '/api/agent/trade-report',
    body: JSON.stringify(openReport),
  });
  console.log('   status:', tr.status, 'body:', JSON.stringify(tr.body));
  if (tr.status !== 200 || tr.body.ok !== true) failures++;

  console.log('');
  if (failures > 0) {
    console.log(`FAILED: ${failures} step(s) returned non-200`);
    return failures;
  }
  console.log('OK. Handshake OK. Now check /status in Telegram - Agent should show connected.');
  return 0;
}

main()
  .then((code) => {
    // Let undici sockets close naturally before exiting (avoids libuv assertion on Windows).
    setTimeout(() => process.exit(code), 100);
  })
  .catch((err) => {
    console.error('FATAL:', (err && err.stack) || err);
    setTimeout(() => process.exit(1), 100);
  });