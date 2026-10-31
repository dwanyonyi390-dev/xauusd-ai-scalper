// src/mt5/agentAuth.js
'use strict';

const crypto = require('crypto');

/**
 * Canonical string that gets signed. This MUST match the MQL5 side byte-for-byte.
 *
 *   METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256_HEX(BODY)
 *
 * - METHOD is uppercase (GET, POST, …)
 * - PATH is the URL path only (no query string, no host)
 * - TIMESTAMP is milliseconds since epoch as a decimal string
 * - NONCE is a hex string, min 16 bytes
 * - BODY is the SHA-256 hex of the raw request body (empty string hashed if no body)
 */
function canonicalString({ method, path, timestamp, nonce, body }) {
  const bodyHash = crypto.createHash('sha256').update(body || '').digest('hex');
  return [String(method).toUpperCase(), path, String(timestamp), nonce, bodyHash].join('\n');
}

function sign({ secret, method, path, body, timestamp, nonce }) {
  const cs = canonicalString({ method, path, timestamp, nonce, body });
  return crypto.createHmac('sha256', secret).update(cs).digest('hex');
}

function timingSafeEqual(a, b) {
  const A = Buffer.from(a || '');
  const B = Buffer.from(b || '');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

/**
 * Build the full header set to send with an outgoing agent request.
 * Usage:
 *   const body = JSON.stringify(payload);
 *   const headers = buildAuthHeaders({ agentId, secret, method: 'POST', path: '/api/agent/heartbeat', body });
 *   fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body });
 */
function buildAuthHeaders({ agentId, secret, method, path, body, timestamp, nonce }) {
  const ts = timestamp || Date.now();
  const n = nonce || crypto.randomBytes(16).toString('hex');
  const sig = sign({ secret, method, path, body, timestamp: ts, nonce: n });
  return {
    'x-agent-id': agentId,
    'x-timestamp': String(ts),
    'x-nonce': n,
    'x-signature': sig,
  };
}

/**
 * Verify an incoming agent request.
 *
 * seenNonces: a Map<string, number(ts)> used for replay protection.
 * clockSkewSeconds: reject requests whose timestamp is further than this from now.
 */
function verify({
  secret,
  agentId,
  method,
  path,
  body,
  headers,
  clockSkewSeconds = 300,
  seenNonces,
}) {
  const ts = Number(headers['x-timestamp']);
  const nonce = headers['x-nonce'];
  const sig = headers['x-signature'];
  const id = headers['x-agent-id'];

  if (!ts || !nonce || !sig || !id) return { ok: false, reason: 'missing_headers' };
  if (id !== agentId) return { ok: false, reason: 'agent_mismatch' };
  if (Math.abs(Date.now() - ts) > clockSkewSeconds * 1000) return { ok: false, reason: 'stale_timestamp' };
  if (seenNonces && seenNonces.has(nonce)) return { ok: false, reason: 'replay' };

  const expected = sign({ secret, method, path, body, timestamp: ts, nonce });
  if (!timingSafeEqual(expected, sig)) return { ok: false, reason: 'bad_signature' };

  if (seenNonces) {
    seenNonces.set(nonce, ts);
    // Opportunistic cleanup: drop entries older than 2 * clockSkewSeconds
    if (seenNonces.size > 5000) {
      const cutoff = Date.now() - clockSkewSeconds * 2000;
      for (const [k, v] of seenNonces) if (v < cutoff) seenNonces.delete(k);
    }
  }
  return { ok: true };
}

module.exports = {
  canonicalString,
  sign,
  verify,
  buildAuthHeaders,
  timingSafeEqual,
};