'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  setupPermissionPolicy,
  setPermissionPrompter,
  setPermissionDecisionObserver,
  mediaQueryState,
} = require('../../src/main/permissions');

function fakeSession() {
  const session = {};
  session.setPermissionRequestHandler = (fn) => { session.request = fn; };
  session.setPermissionCheckHandler = (fn) => { session.check = fn; };
  session.setDisplayMediaRequestHandler = (fn) => { session.display = fn; };
  return session;
}

const request = (session, details) => new Promise((resolve) =>
  session.request({ id: 7, isDestroyed: () => false }, 'media', resolve, details));

test('site Allow requests native access before exposing a live grant', async (t) => {
  let prompts = 0;
  let nativeState = 'not-determined';
  const nativeRequests = [];
  const observedStates = [];
  setPermissionPrompter(async () => { prompts += 1; return true; });
  t.after(() => {
    setPermissionPrompter(null);
    setPermissionDecisionObserver(null);
  });

  const session = fakeSession();
  setupPermissionPolicy(session, {
    persistDecisions: false,
    nativeMediaAccessState: () => nativeState,
    requestNativeMediaAccess: async (mediaTypes) => {
      nativeRequests.push(mediaTypes);
      nativeState = 'granted';
      return true;
    },
  });
  setPermissionDecisionObserver(() => {
    observedStates.push(mediaQueryState(session, 'https://chatgpt.com/', 'audio'));
  });

  assert.equal(await request(session, {
    requestingUrl: 'https://chatgpt.com/',
    mediaTypes: ['audio'],
  }), true);
  assert.equal(prompts, 1);
  assert.deepEqual(nativeRequests, [['audio']]);
  assert.deepEqual(observedStates, ['prompt', 'granted']);
  assert.equal(mediaQueryState(session, 'https://chatgpt.com/', 'audio'), 'granted');
  assert.equal(
    session.check(null, 'media', 'https://chatgpt.com', { mediaType: 'audio' }),
    true
  );
});

test('an allow saved by an older Blanc build still passes through the native gate', async (t) => {
  let prompts = 0;
  let nativeState = 'granted';
  let nativeRequests = 0;
  setPermissionPrompter(async () => { prompts += 1; return true; });
  t.after(() => setPermissionPrompter(null));

  const session = fakeSession();
  setupPermissionPolicy(session, {
    persistDecisions: false,
    nativeMediaAccessState: () => nativeState,
    requestNativeMediaAccess: async () => {
      nativeRequests += 1;
      nativeState = 'granted';
      return true;
    },
  });
  const details = { requestingUrl: 'https://chatgpt.com/', mediaTypes: ['audio'] };

  assert.equal(await request(session, details), true);
  assert.equal(prompts, 1);
  nativeRequests = 0;
  nativeState = 'not-determined';

  assert.equal(await request(session, details), true);
  assert.equal(prompts, 1, 'the existing site allow must not prompt twice');
  assert.equal(nativeRequests, 1, 'the existing allow must still establish native access');
});

test('native denial blocks capture without discarding the site decision', async (t) => {
  let prompts = 0;
  let nativeState = 'not-determined';
  setPermissionPrompter(async () => { prompts += 1; return true; });
  t.after(() => setPermissionPrompter(null));

  const session = fakeSession();
  setupPermissionPolicy(session, {
    persistDecisions: false,
    nativeMediaAccessState: () => nativeState,
    requestNativeMediaAccess: async () => {
      if (nativeState === 'granted') return true;
      nativeState = 'denied';
      return false;
    },
  });
  const details = { requestingUrl: 'https://chatgpt.com/', mediaTypes: ['audio'] };

  assert.equal(await request(session, details), false);
  assert.equal(mediaQueryState(session, details.requestingUrl, 'audio'), 'denied');
  assert.equal(session.check(null, 'media', 'https://chatgpt.com', { mediaType: 'audio' }), false);

  nativeState = 'granted';
  assert.equal(await request(session, details), true);
  assert.equal(prompts, 1, 'the site allow survives an OS-level denial');
});
