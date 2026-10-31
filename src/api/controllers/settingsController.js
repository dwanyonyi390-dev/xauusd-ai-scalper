'use strict';

const logger = require('../../utils/logger');

// In production these come from a real service + Mongo model.
// The in-memory fallback below keeps the app bootable while you wire the DB.
function getService(req) {
  return (
    req.app.locals.settingsService ||
    require('../../services/configurationService')
  );
}

async function getSettings(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    const settings = await getService(req).get(userId);
    return res.json({ ok: true, settings });
  } catch (err) {
    return next(err);
  }
}

async function replaceSettings(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    const settings = await getService(req).replace(userId, req.body);
    return res.json({ ok: true, settings });
  } catch (err) {
    return next(err);
  }
}

async function patchSettings(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    const settings = await getService(req).update(userId, req.body);
    return res.json({ ok: true, settings });
  } catch (err) {
    return next(err);
  }
}

async function updateSlot(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index > 9) {
      return res.status(400).json({ ok: false, error: 'invalid_slot_index' });
    }
    const settings = await getService(req).updateSlot(userId, index, req.body);
    return res.json({ ok: true, settings });
  } catch (err) {
    return next(err);
  }
}

async function resetSettings(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    const settings = await getService(req).reset(userId);
    return res.json({ ok: true, settings });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSettings,
  replaceSettings,
  patchSettings,
  updateSlot,
  resetSettings,
};