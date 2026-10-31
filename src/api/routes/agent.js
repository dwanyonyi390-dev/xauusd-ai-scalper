// src/api/routes/agent.js
'use strict';

const express = require('express');
const makeRateLimit = require('../middleware/rateLimit');
const { authenticateAgent } = require('../middleware/authenticate');
const agentController = require('../controllers/agentController');

const router = express.Router();

// Startup guard — names the failing handler, never silently 404s.
for (const name of ['postHeartbeat', 'getConfig', 'postTradeReport']) {
  if (typeof agentController[name] !== 'function') {
    throw new Error(
      `[agent route] agentController.${name} is ${typeof agentController[name]}. Check exports of src/api/controllers/agentController.js`
    );
  }
}
if (typeof makeRateLimit !== 'function') throw new Error('[agent route] makeRateLimit is not a function');

// ─── LOCAL DEV BYPASS ───────────────────────────────────────────────────────
// We are currently testing with raw HTTP from MT5 (no HMAC signing in MQL5 yet).
// We bypass authenticateAgent and mock the user so the request passes through.
//
// NOTE: Uncomment the authenticateAgent line when you move to production/Render.
// router.use(authenticateAgent);

router.use((req, res, next) => {
  // Mock the agent auth object that the controller expects
  req.user = { id: 'agent:agent-01', role: 'agent' };
  next();
});
// ────────────────────────────────────────────────────────────────────────────

// EA-friendly rate limits: heartbeat every 5–15s. 240/min leaves margin.
router.use(makeRateLimit({ 
  windowMs: 60_000, 
  max: 240, 
  keyGenerator: (req) => (req.user && req.user.id) || req.ip 
}));

router.post('/heartbeat', agentController.postHeartbeat);
router.get('/config', agentController.getConfig);
router.post('/trade-report', agentController.postTradeReport);

module.exports = router;