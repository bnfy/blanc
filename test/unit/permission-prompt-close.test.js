'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { setupPermissionPolicy, setPermissionPrompter } = require('../../src/main/permissions');

// Copy the fake-session shape from private-permissions.test.js — it captures
// each handler so the test can invoke them directly.
function fakeSession() {
  const session = {};
  session.setPermissionRequestHandler = (fn) => { session.request = fn; };
  session.setPermissionCheckHandler = (fn) => { session.check = fn; };
  session.setDisplayMediaRequestHandler = () => {};
  return session;
}

test('an Allow answered after the requesting tab closed grants nothing and persists nothing', async (t) => {
  t.after(() => setPermissionPrompter(null));
  const session = fakeSession();
  // persistDecisions:false doubles as the no-electron canary (see permissions.js).
  setupPermissionPolicy(session, { persistDecisions: false });

  let resolvePrompt;
  setPermissionPrompter(() => new Promise((resolve) => { resolvePrompt = resolve; }));

  const wc = { id: 1, gone: false, isDestroyed() { return this.gone; } };
  let answer = 'unset';
  const inFlight = session.request(wc, 'geolocation', (allow) => { answer = allow; },
    { requestingUrl: 'https://example.test/page' });
  await Promise.resolve(); // let the handler reach the await
  wc.gone = true;          // the tab closes while the prompt hangs
  resolvePrompt(true);     // a late Allow
  await inFlight;
  assert.equal(answer, false);

  // Nothing persisted: the same origin must prompt again, not auto-allow.
  let promptedAgain = false;
  setPermissionPrompter(() => { promptedAgain = true; return Promise.resolve(null); });
  const wc2 = { id: 2, isDestroyed: () => false };
  let answer2 = 'unset';
  await session.request(wc2, 'geolocation', (allow) => { answer2 = allow; },
    { requestingUrl: 'https://example.test/page' });
  assert.equal(promptedAgain, true, 'decision was persisted for a destroyed requester');
  assert.equal(answer2, false);
});

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnStart = mainSource.indexOf('function cancelPermissionPromptsForTab(');
const fnEnd = mainSource.indexOf('\n}', fnStart) + 2;
const cancelSource = fnStart >= 0 ? mainSource.slice(fnStart, fnEnd) : null;

test('cancelPermissionPromptsForTab is liftable from main.js', () => {
  assert.ok(cancelSource, 'cancelPermissionPromptsForTab not found — update this test');
});

test('cancellation resolves only the owning tab prompts with null, and detaches the last view', () => {
  const resolved = [];
  const prompts = new Map([
    [1, { tabId: 'closing', resolve: (v) => resolved.push(['closing-1', v]) }],
    [2, { tabId: 'other', resolve: (v) => resolved.push(['other-2', v]) }],
    [3, { tabId: 'closing', resolve: (v) => resolved.push(['closing-3', v]) }],
  ]);
  let detached = 0;
  const sandbox = {
    rt: () => ({ permissionPrompts: prompts }),
    detachPermissionView: () => { detached += 1; },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${cancelSource}; cancelPermissionPromptsForTab('closing');`, sandbox);
  assert.deepEqual(resolved.sort(), [['closing-1', null], ['closing-3', null]]);
  assert.deepEqual([...prompts.keys()], [2], 'the other tab prompt must survive');
  assert.equal(detached, 0, 'a surviving prompt keeps the view attached');

  vm.runInContext(`cancelPermissionPromptsForTab('other');`, sandbox);
  assert.equal(prompts.size, 0);
  assert.equal(detached, 1, 'the last cancellation detaches the prompt view');
});

const { setHeldRequesterCheck } = require('../../src/main/permissions');

test('a held requester is denied everywhere and nothing persists', async () => {
  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });
  const held = new Set([7]);
  setHeldRequesterCheck((wc) => !!wc && held.has(wc.id));
  try {
    const wc = { id: 7, isDestroyed: () => false };

    // Request path: denied before the stored-decision lookup.
    let answer = 'unset';
    await session.request(wc, 'geolocation', (allow) => { answer = allow; },
      { requestingUrl: 'https://held.test/' });
    assert.equal(answer, false);

    // Check path agrees.
    assert.equal(session.check(wc, 'geolocation', 'https://held.test/', {}), false);

    // Race: park lands during the prompt await — recheck must deny.
    held.delete(7);
    let resolvePrompt;
    setPermissionPrompter(() => new Promise((resolve) => { resolvePrompt = resolve; }));
    let raced = 'unset';
    const inFlight = session.request(wc, 'geolocation', (allow) => { raced = allow; },
      { requestingUrl: 'https://held.test/' });
    await Promise.resolve();
    held.add(7);          // parked while the prompt hung
    resolvePrompt(true);  // late Allow
    await inFlight;
    assert.equal(raced, false);
  } finally {
    setHeldRequesterCheck(null);
  }
});
