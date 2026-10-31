// src/api/middleware/authenticate.js
'use strict';

const crypto = require('crypto');
const { verify } = require('../../mt5/agentAuth');
const logger = require('../../utils/logger');

/**
 * Compute the exact bytes the client signed.
 *
 *  - If express.json() ran, req.rawBody holds the raw request body (string).
 *  - If the request had no body (GET, empty POST), req.rawBody is '' (seeded
 *    by app.js) or undefined (older setups) — in both cases the client signs ''.
 *  - If rawBody is missing but a parsed body exists, re-serialize it the way
 *    the client would have (defensive fallback).
 *
 * This is the function that fixes the GET /api/agent/config 401.
 */
function canonicalBody(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;

  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return JSON.stringify(req.body);
  }
  return '';
}

function bodyHash(body) {
  return crypto.createHash('sha256').update(body || '').digest('hex');
}

/**
 * HMAC middleware for the MT5 EA.
 * Expects: x-agent-id, x-timestamp, x-nonce, x-signature.
 */
function authenticateAgent(req, res, next) {
  try {
    const idHeader = req.headers['x-agent-id'];
    if (!idHeader) {
      return res.status(401).json({ ok: false, error: 'missing_agent_id' });
    }

    const cfg = req.app.locals.config || {};
    const secret = process.env.MT5_AGENT_SECRET;
    const expectedAgentId = process.env.MT5_AGENT_ID;
    const clockSkewSeconds = Number(
      cfg.HMAC_CLOCK_SKEW_SECONDS || process.env.HMAC_CLOCK_SKEW_SECONDS || 300
    );

    if (!secret || !expectedAgentId) {
      logger.error('authenticateAgent: MT5_AGENT_SECRET/MT5_AGENT_ID missing in env');
      return res.status(500).json({ ok: false, error: 'server_misconfigured' });
    }

    const path = (req.originalUrl || req.url || '').split('?')[0];
    const body = canonicalBody(req);
    const hash = bodyHash(body);

    // Debug-only: show what we're hashing, so any future 401 is explainable.
    logger.debug(
      {
        method: req.method,
        path,
        bodyLen: body.length,
        bodyHash: hash,
        bodyPreview: body.length > 0 ? body.slice(0, 200) : '',
        headerTs: req.headers['x-timestamp'],
        headerNonce: req.headers['x-nonce'],
      },
      'agent_auth_debug'
    );

    const result = verify({
      secret,
      agentId: expectedAgentId,
      method: req.method,
      path,
      body,
      headers: req.headers,
      clockSkewSeconds,
      seenNonces: req.app.locals.seenNonces,
    });

    if (!result.ok) {
      logger.warn(
        {
          reason: result.reason,
          agentId: idHeader,
          path,
          method: req.method,
          expectedBodyHash: hash,
          expectedAgentId,
        },
        'agent_auth_failed'
      );
      return res.status(401).json({
        ok: false,
        error: 'agent_auth_failed',
        reason: result.reason,
      });
    }

    req.user = { id: `agent:${idHeader}`, role: 'agent' };
    return next();
  } catch (err) {
    return next(err);
  }
}

function authenticateUser(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.length < 20) {
    return res.status(401).json({ ok: false, error: 'unauthenticated' });
  }
  req.user = { id: 'user:default', role: 'admin' };
  return next();
}

module.exports = { authenticateAgent, authenticateUser };