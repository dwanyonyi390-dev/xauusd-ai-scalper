'use strict';

const express = require('express');
const makeRateLimit = require('../middleware/rateLimit');
const { authenticateAgent } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const settingsController = require('../controllers/settingsController');
const {
  SettingsUpdateSchema,
  SettingsPatchSchema,
  PositionSlotSchema,
  PositionSlotParamsSchema,
} = require('../../utils/validation');

const router = express.Router();

// ── Startup guard ──────────────────────────────────────────────────────────
// Fail at require-time with a precise message if a controller handler is
// missing, instead of crashing inside Express at request-registration time.
const REQUIRED_HANDLERS = [
  'getSettings',
  'replaceSettings',
  'patchSettings',
  'updateSlot',
  'resetSettings',
];
for (const name of REQUIRED_HANDLERS) {
  if (typeof settingsController[name] !== 'function') {
    throw new Error(
      `[settings route] settingsController.${name} is ${typeof settingsController[name]}. ` +
      `Check exports of src/api/controllers/settingsController.js`
    );
  }
}
if (typeof authenticateAgent !== 'function') {
  throw new Error('[settings route] authenticateAgent is not a function. Check src/api/middleware/authenticate.js');
}
if (typeof makeRateLimit !== 'function') {
  throw new Error('[settings route] makeRateLimit is not a function. Check src/api/middleware/rateLimit.js');
}
if (typeof validate !== 'function') {
  throw new Error('[settings route] validate is not a function. Check src/api/middleware/validate.js');
}
for (const [name, schema] of Object.entries({
  SettingsUpdateSchema,
  SettingsPatchSchema,
  PositionSlotSchema,
  PositionSlotParamsSchema,
})) {
  if (!schema || typeof schema.safeParse !== 'function') {
    throw new Error(`[settings route] ${name} is not a Zod schema. Check src/utils/validation.js`);
  }
}
// ───────────────────────────────────────────────────────────────────────────

router.use(authenticateAgent);
router.use(makeRateLimit({ windowMs: 60_000, max: 30 }));

router.get('/', settingsController.getSettings);

router.put(
  '/',
  validate({ body: SettingsUpdateSchema }),
  settingsController.replaceSettings
);

router.patch(
  '/',
  validate({ body: SettingsPatchSchema }),
  settingsController.patchSettings
);

router.post(
  '/slots/:index',
  validate({ params: PositionSlotParamsSchema, body: PositionSlotSchema }),
  settingsController.updateSlot
);

router.post('/reset', settingsController.resetSettings);

module.exports = router;