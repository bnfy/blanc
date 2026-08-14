'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

// Like private-permissions.test.js, this file runs the persistDecisions:false
// path only, so loading it under plain `node --test` doubles as the canary
// that mediaQueryState never touches the electron-backed store.
const {
  setupPermissionPolicy,
  setPermissionPrompter,
  mediaQueryState,
} = require('../../src/main/permissions');

function fakeSession() {
  const session = {};
  session.setPermissionRequestHandler = (fn) => { session.request = fn; };
  session.setPermissionCheckHandler = (fn) => { session.check = fn; };
  session.setDisplayMediaRequestHandler = (fn) => { session.display = fn; };
  return session;
}

const request = (session, permission, details) =>
  new Promise((resolve) => session.request(null, permission, resolve, details));

test('mediaQueryState reports the truthful three-state without touching Electron authorization', async (t) => {
  setPermissionPrompter(async ({ mediaTypes }) => mediaTypes.includes('audio'));
  t.after(() => setPermissionPrompter(null));

  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });

  // Undecided must read as 'prompt' — this is the whole point of the shim:
  // the strict check handler maps the same state to false, and preflighting
  // sites then claim the mic is blocked before ever asking.
  assert.equal(mediaQueryState(session, 'https://example.com/app', 'audio'), 'prompt');
  assert.equal(mediaQueryState(session, 'https://example.com/app', 'video'), 'prompt');
  assert.equal(session.check(null, 'media', 'https://example.com', { mediaType: 'audio' }), false,
    'the strict Electron check stays denied for undecided — the shim never loosens it');

  // A stored allow reads granted — for that device only.
  assert.equal(await request(session, 'media', {
    requestingUrl: 'https://example.com/app',
    mediaTypes: ['audio'],
  }), true);
  assert.equal(mediaQueryState(session, 'https://example.com/app', 'audio'), 'granted');
  assert.equal(mediaQueryState(session, 'https://example.com/app', 'video'), 'prompt',
    'a microphone grant must not report the camera as granted');

  // A stored deny reads denied.
  assert.equal(await request(session, 'media', {
    requestingUrl: 'https://example.com/app',
    mediaTypes: ['video'],
  }), false);
  assert.equal(mediaQueryState(session, 'https://example.com/app', 'video'), 'denied');
});

test('mediaQueryState refuses everything outside its narrow contract', () => {
  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });

  // Origins that can never be prompted are truthfully denied, not 'prompt'.
  assert.equal(mediaQueryState(session, 'file:///tmp/page.html', 'audio'), 'denied');
  assert.equal(mediaQueryState(session, 'blanc://newtab/', 'audio'), 'denied');
  assert.equal(mediaQueryState(session, 'not a url', 'audio'), 'denied');

  // Unknown media types and unregistered sessions answer null — the caller
  // falls back to the real (strict) query rather than inventing a state.
  assert.equal(mediaQueryState(session, 'https://example.com/', 'screen'), null);
  assert.equal(mediaQueryState({}, 'https://example.com/', 'audio'), null);
  assert.equal(mediaQueryState(null, 'https://example.com/', 'audio'), null);
});

test('mediaQueryState is per session: private decisions never leak across', async (t) => {
  setPermissionPrompter(async () => true);
  t.after(() => setPermissionPrompter(null));

  const regular = fakeSession();
  const priv = fakeSession();
  setupPermissionPolicy(regular, { persistDecisions: false });
  setupPermissionPolicy(priv, { persistDecisions: false });

  assert.equal(await request(priv, 'media', {
    requestingUrl: 'https://example.com/',
    mediaTypes: ['audio'],
  }), true);
  assert.equal(mediaQueryState(priv, 'https://example.com/', 'audio'), 'granted');
  assert.equal(mediaQueryState(regular, 'https://example.com/', 'audio'), 'prompt',
    'a private-session grant must not read granted in the regular session');
});
