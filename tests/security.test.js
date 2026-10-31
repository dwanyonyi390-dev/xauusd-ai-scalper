'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { sign, verify, canonicalString } = require('../src/mt5/agentAuth');

const SECRET = 'a'.repeat(32);

test('sign and verify round-trip', () => {
  const ts = Date.now();
  const rid = 'req-12345678';
  const body = '{"a":1}';
  const sig = sign(SECRET, ts, rid, body);
  assert.equal(verify(SECRET, ts, rid, body, sig), true);
});

test('verify fails on tampered body', () => {
  const ts = Date.now();
  const rid = 'req-12345678';
  const sig = sign(SECRET, ts, rid, '{"a":1}');
  assert.equal(verify(SECRET, ts, rid, '{"a":2}', sig), false);
});

test('canonical string is deterministic', () => {
  assert.equal(canonicalString(1, 'r', 'b'), '1.r.b');
});