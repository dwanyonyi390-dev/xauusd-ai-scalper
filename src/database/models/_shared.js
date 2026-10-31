'use strict';

const { Schema } = require('mongoose');

/**
 * Common options for all models.
 * - timestamps: createdAt/updatedAt (§13)
 * - strict: reject unknown fields
 * - versionKey: '__v' (Mongoose 8 requires string or false, not `true`)
 */
function baseOptions(collection) {
  return {
    collection,
    timestamps: true,
    strict: true,
    versionKey: '__v',   // Mongoose 8: must be a string, not `true`
  };
}

/**
 * Reject documents that contain obvious secret keys (§13, §15).
 */
const FORBIDDEN_KEYS = [
  'password',
  'apiKey',
  'api_key',
  'secret',
  'token',
  'brokerPassword',
  'openaiKey',
  'telegramToken',
];

function secretGuard(schema) {
  schema.pre('validate', function (next) {
    const obj = this.toObject({ depopulate: true, virtuals: false });
    for (const key of Object.keys(obj)) {
      if (FORBIDDEN_KEYS.includes(key)) {
        return next(new Error(`[model] Forbidden secret key "${key}" cannot be stored.`));
      }
    }
    next();
  });
  return schema;
}

module.exports = { baseOptions, secretGuard, FORBIDDEN_KEYS };