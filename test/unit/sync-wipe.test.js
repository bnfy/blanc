const assert = require('node:assert/strict');
const test = require('node:test');

const { wipeDecision, responseCode } = require('../../src/main/sync-wipe');
const { syncErrorText } = require('../../src/main/sync-messages');
const { englishT: t } = require('../support/english-t');

test('a failed remote wipe never clears the credentials needed to retry', () => {
  // Regression pin (2026-07-11 audit): disable({wipeRemote:true}) used to
  // report success and erase accountId/key even when the DELETE failed,
  // stranding unreachable ciphertext on the server.
  for (const outcome of [{ error: true }, { status: 500 }, { status: 429 }, { status: 403 }, { status: 404 }]) {
    const decision = wipeDecision(outcome);
    assert.equal(decision.clearCredentials, false, JSON.stringify(outcome));
    assert.equal(decision.ok, false, JSON.stringify(outcome));
    assert.ok(syncErrorText(decision.error, t), 'failure must carry a user-facing reason');
  }
});

test('rate limiting gets its own actionable message', () => {
  assert.match(syncErrorText(wipeDecision({ status: 429 }).error, t), /try again in a minute/i);
});

test('only a confirmed 2xx clears the local record', () => {
  for (const status of [200, 204]) {
    const decision = wipeDecision({ status });
    assert.equal(decision.clearCredentials, true);
    assert.equal(decision.ok, true);
    assert.equal(decision.error, null);
  }
});

test('only the explicit erasure signal maps to the actionable pending code', () => {
 assert.equal(responseCode(503, '{"error":"quota erasure pending"}'), 'erasure-pending');
 assert.equal(responseCode(503, '{"error":"quota unavailable"}'), 'http-503');
 assert.equal(responseCode(503, 'bad json'), 'http-503');
 const decision=wipeDecision({status:503,code:'erasure-pending'});
 assert.equal(decision.clearCredentials,false);
 assert.match(syncErrorText(decision.error,t),/server copy is still being erased/);
});
