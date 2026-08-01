const assert = require('node:assert/strict');
const test = require('node:test');

const {
  setupPermissionPolicy,
  setDisplayMediaPrompter,
} = require('../../src/main/permissions');

function fakeSession() {
  const session = {};
  session.setPermissionRequestHandler = (fn) => { session.request = fn; };
  session.setPermissionCheckHandler = (fn) => { session.check = fn; };
  session.setDisplayMediaRequestHandler = (fn) => { session.display = fn; };
  return session;
}

function displayRequest(session, overrides = {}) {
  const frame = overrides.frame ?? { isDestroyed: () => false };
  const request = {
    securityOrigin: 'https://meet.example',
    frame,
    videoRequested: true,
    audioRequested: false,
    userGesture: true,
    ...overrides,
  };
  return new Promise((resolve) => session.display(request, resolve));
}

test('display capture delegates one valid user-initiated request without persisting it', async (t) => {
  const source = { id: 'screen:1' };
  const seen = [];
  setDisplayMediaPrompter(async (request) => {
    seen.push(request);
    return { video: source };
  });
  t.after(() => setDisplayMediaPrompter(null));

  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });

  assert.deepEqual(await displayRequest(session), { video: source });
  assert.deepEqual(await displayRequest(session), { video: source });
  assert.equal(seen.length, 2, 'display approval is per-request, never remembered');
  assert.equal(seen[0].origin, 'https://meet.example');
  assert.equal(seen[0].videoRequested, true);
  assert.equal(
    await new Promise((resolve) => session.request(
      null,
      'display-capture',
      resolve,
      { requestingUrl: 'https://meet.example/room' }
    )),
    true,
    'the permission gate reaches the one-shot display handler'
  );
  assert.equal(
    await new Promise((resolve) => session.request(
      null,
      'media',
      resolve,
      { requestingUrl: 'https://meet.example/room', mediaTypes: [] }
    )),
    true,
    'Electron 43 empty-media gate reaches the display handler without a camera/mic prompt'
  );
  assert.equal(
    session.check(null, 'display-capture', 'https://meet.example', {}),
    true
  );
});

test('ordinary camera and microphone requests still use the persisted prompt policy', async (t) => {
  let seen;
  const session = fakeSession();
  setDisplayMediaPrompter(null);
  const { setPermissionPrompter } = require('../../src/main/permissions');
  setPermissionPrompter(async (request) => {
    seen = request;
    return false;
  });
  t.after(() => setPermissionPrompter(null));
  setupPermissionPolicy(session, { persistDecisions: false });

  assert.equal(await new Promise((resolve) => session.request(
    null,
    'media',
    resolve,
    { requestingUrl: 'https://camera.example/', mediaTypes: ['video'] }
  )), false);
  assert.deepEqual(seen, {
    origin: 'https://camera.example',
    permission: 'media',
    mediaTypes: ['video'],
  });
});

test('display capture denies opaque origins, dead frames, and missing user gestures', async (t) => {
  let prompts = 0;
  setDisplayMediaPrompter(async () => {
    prompts += 1;
    return { video: { id: 'screen:1' } };
  });
  t.after(() => setDisplayMediaPrompter(null));

  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });

  assert.deepEqual(await displayRequest(session, {
    securityOrigin: 'file:///tmp/share.html',
  }), {});
  assert.deepEqual(await displayRequest(session, {
    frame: { isDestroyed: () => true },
  }), {});
  assert.deepEqual(await displayRequest(session, { userGesture: false }), {});
  assert.deepEqual(await displayRequest(session, { videoRequested: false }), {});
  assert.equal(prompts, 0);
});

test('display capture fails closed when the chooser errors or returns no video', async (t) => {
  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });
  t.after(() => setDisplayMediaPrompter(null));

  setDisplayMediaPrompter(async () => null);
  assert.deepEqual(await displayRequest(session), {});

  setDisplayMediaPrompter(async () => {
    throw new Error('source enumeration failed');
  });
  assert.deepEqual(await displayRequest(session), {});
});
