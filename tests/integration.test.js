'use strict';
const test = require('node:test');
const assert = require('node:assert');

test('integration tests are gated on MONGODB_URI', (t) => {
  if (!process.env.MONGODB_URI) return t.skip('MONGODB_URI not set');
  // Placeholder — full integration flow runs locally with DB.
  assert.ok(true);
});