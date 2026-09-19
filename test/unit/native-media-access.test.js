'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createNativeMediaAccessGate } = require('../../src/main/native-media-access');

test('non-mac platforms have no separate native media gate', async () => {
  const gate = createNativeMediaAccessGate({ platform: 'linux' });
  assert.equal(gate.state('audio'), null);
  assert.equal(await gate.request(['audio']), true);
});

test('macOS granted access passes without asking again', async () => {
  let asks = 0;
  const gate = createNativeMediaAccessGate({
    platform: 'darwin',
    systemPreferences: {
      getMediaAccessStatus: (type) => type === 'microphone' ? 'granted' : 'denied',
      askForMediaAccess: async () => { asks += 1; return true; },
    },
  });

  assert.equal(gate.state('audio'), 'granted');
  assert.equal(await gate.request(['audio']), true);
  assert.equal(asks, 0);
});

test('macOS asks once for concurrent undetermined microphone requests', async () => {
  let asks = 0;
  let resolveAsk;
  const answer = new Promise((resolve) => { resolveAsk = resolve; });
  const gate = createNativeMediaAccessGate({
    platform: 'darwin',
    systemPreferences: {
      getMediaAccessStatus: () => 'not-determined',
      askForMediaAccess: async (type) => {
        assert.equal(type, 'microphone');
        asks += 1;
        return answer;
      },
    },
  });

  const first = gate.request(['audio']);
  const second = gate.request(['audio']);
  await Promise.resolve();
  assert.equal(asks, 1);
  resolveAsk(true);
  assert.equal(await first, true);
  assert.equal(await second, true);
});

test('macOS requests microphone and camera for the matching site scopes', async () => {
  const states = { microphone: 'not-determined', camera: 'not-determined' };
  const asked = [];
  const gate = createNativeMediaAccessGate({
    platform: 'darwin',
    systemPreferences: {
      getMediaAccessStatus: (type) => states[type],
      askForMediaAccess: async (type) => {
        asked.push(type);
        states[type] = 'granted';
        return true;
      },
    },
  });

  assert.equal(await gate.request(['video', 'audio', 'audio']), true);
  assert.deepEqual(asked, ['camera', 'microphone']);
  assert.equal(gate.state('video'), 'granted');
});

test('macOS denial and missing native APIs fail closed', async () => {
  let asks = 0;
  const denied = createNativeMediaAccessGate({
    platform: 'darwin',
    systemPreferences: {
      getMediaAccessStatus: () => 'denied',
      askForMediaAccess: async () => { asks += 1; return true; },
    },
  });
  assert.equal(await denied.request(['audio']), false);
  assert.equal(asks, 0);

  const unavailable = createNativeMediaAccessGate({ platform: 'darwin' });
  assert.equal(unavailable.state('audio'), 'unknown');
  assert.equal(await unavailable.request(['audio']), false);
  assert.equal(await unavailable.request([]), false);
});
