'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');

function harness({ persistDecisions = false, profileId = 'personal', decisions = {}, displayCapture = null } = {}) {
  const filename = path.resolve(__dirname, '../../src/main/permissions.js');
  const realRequire = createRequire(filename);
  const writes = [];
  class JsonStore {
    constructor() { this.data = { decisions: { ...decisions } }; }
    update(fn) { writes.push(true); fn(this.data); }
  }
  const sandbox = { URL, module: { exports: {} }, require: (name) =>
    name === './store' ? { JsonStore } : realRequire(name) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  const policy = sandbox.module.exports;
  const session = {
    setPermissionRequestHandler(fn) { this.request = fn; },
    setPermissionCheckHandler(fn) { this.check = fn; },
    setDisplayMediaRequestHandler(fn) { this.display = fn; },
  };
  let prompts = 0;
  let nativeCalls = 0;
  const grants = [];
  policy.setPermissionPrompter(async () => { prompts++; return true; });
  policy.setCaptureGrantObserver((grant) => grants.push(grant));
  policy.setupPermissionPolicy(session, {
    persistDecisions, profileId, displayCapture,
    nativeMediaAccessState: () => 'granted',
    requestNativeMediaAccess: async () => { nativeCalls++; return true; },
  });
  return {
    session, writes, grants,
    request: (mediaTypes, extra = {}) => new Promise((resolve) => session.request({ id: 1, session }, 'media', resolve, {
      requestingUrl: 'https://meeting.example/room', mediaTypes, ...extra,
    })),
    counts: () => ({ prompts, nativeCalls }),
  };
}

for (const persistDecisions of [false, true]) {
  test(`unscoped display/legacy requests cannot prompt or reuse broad grants (${persistDecisions ? 'stored' : 'private'})`, async () => {
    const h = harness({ persistDecisions, decisions: { 'https://meeting.example|media': 'allow' } });
    for (const mediaTypes of [[], undefined, ['unknown'], ['audio', 'unknown']]) {
      assert.equal(await h.request(mediaTypes), false);
    }
    assert.deepEqual(h.counts(), { prompts: 0, nativeCalls: 0 });
    assert.equal(h.writes.length, 0);
    assert.equal(h.grants.length, 0);
    for (const mediaType of [undefined, 'unknown', 'display']) {
      assert.equal(h.session.check(null, 'media', 'https://meeting.example', { mediaType }), false);
    }
    assert.equal(h.session.check(null, 'display-capture', 'https://meeting.example', {}), false);
    const streams = await new Promise((resolve) => h.session.display({}, resolve));
    assert.equal(Object.keys(streams).length, 0);
  });
}

test('explicit microphone/camera requests still prompt, remember per-device, and notify capture', async () => {
  const h = harness();
  assert.equal(await h.request(['audio']), true);
  assert.equal(await h.request(['video']), true);
  assert.equal(await h.request(['audio', 'video']), true);
  assert.equal(h.counts().prompts, 2);
  assert.equal(h.counts().nativeCalls, 3);
  assert.equal(h.grants.length, 3);
  assert.equal(await h.request([]), false);
  assert.equal(h.session.check(null, 'media', 'https://meeting.example', { mediaType: 'audio' }), true);
  assert.equal(h.session.check(null, 'media', 'https://meeting.example', { mediaType: 'video' }), true);
});


test('patched display requests bypass remembered device grants; mixed legacy capture always denies', async () => {
  let displayRequests = 0;
  const h = harness({ persistDecisions: true, decisions: { 'https://meeting.example|media': 'allow' },
    displayCapture: { requestPermission: async () => { displayRequests++; return true; }, select() {} } });
  assert.equal(await h.request([], { captureApi: 'get-display-media' }), true);
  for (const mediaTypes of [[], ['audio'], ['video'], ['audio', 'video']]) {
    assert.equal(await h.request(mediaTypes, { captureApi: 'legacy-display' }), false);
  }
  assert.equal(await h.request(['audio'], { captureApi: 'future-unknown' }), false);
  assert.equal(displayRequests, 1);
  assert.deepEqual(h.counts(), { prompts: 0, nativeCalls: 0 });
  assert.equal(h.writes.length, 0);
});
