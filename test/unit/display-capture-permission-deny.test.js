'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { setupPermissionPolicy, setPermissionPrompter } = require('../../src/main/permissions');

function fakeSession() {
  const session = {};
  session.setPermissionRequestHandler = (fn) => { session.request = fn; };
  session.setPermissionCheckHandler = (fn) => { session.check = fn; };
  session.setDisplayMediaRequestHandler = (fn) => { session.display = fn; };
  return session;
}

const ask = (session, permission, details) => new Promise((resolve) =>
  session.request({ id: 1, isDestroyed: () => false }, permission, resolve, details));

test('display-capture is denied without a prompt', async (t) => {
  let prompts = 0;
  setPermissionPrompter(async () => { prompts += 1; return true; });
  t.after(() => setPermissionPrompter(null));
  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });
  assert.equal(await ask(session, 'display-capture', {
    requestingUrl: 'https://meet.example/',
  }), false);
  assert.equal(prompts, 0);
  assert.equal(session.check(null, 'display-capture', 'https://meet.example', {}), false);
});

test('empty mediaTypes is denied even with a remembered device allow', async (t) => {
  setPermissionPrompter(async () => true);
  t.after(() => setPermissionPrompter(null));
  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });
  assert.equal(await ask(session, 'media', {
    requestingUrl: 'https://meet.example/',
    mediaTypes: ['audio'],
  }), true);
  assert.equal(session.check(null, 'media', 'https://meet.example', { mediaType: 'audio' }), true);
  assert.equal(await ask(session, 'media', {
    requestingUrl: 'https://meet.example/',
    mediaTypes: [],
  }), false);
  assert.equal(session.check(null, 'media', 'https://meet.example', {}), false);
  assert.equal(session.check(null, 'media', 'https://meet.example', { mediaType: 'unknown' }), false);
  assert.equal(session.check(null, 'display-capture', 'https://meet.example', {}), false);
});

test('display media handler still grants no stream', () => {
  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });
  let streams;
  session.display({}, (s) => { streams = s; });
  assert.deepEqual(streams, {});
});
