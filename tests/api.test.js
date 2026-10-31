'use strict';
const test = require('node:test');
const assert = require('node:assert');

test('api tests require running MongoDB — skipped in CI without MONGODB_URI', (t) => {
  if (!process.env.MONGODB_URI) return t.skip('MONGODB_URI not set');
});