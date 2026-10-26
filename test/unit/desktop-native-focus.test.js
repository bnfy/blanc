'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { useNativeFocus } = require('../desktop/support/native-focus');

function fixture(send) {
  const frame = {};
  const page = new EventEmitter();
  page.closed = false;
  page.isClosed = () => page.closed;
  page.mainFrame = () => frame;
  const context = new EventEmitter();
  context.pages = () => [page];
  context.newCDPSession = async () => ({ send });
  return { page, frame, context, app: { context: () => context } };
}

test('native focus settles existing, new, and replaced main-frame targets', async () => {
  let calls = 0;
  let release;
  const f = fixture(async (method, params) => {
    assert.equal(method, 'Emulation.setFocusEmulationEnabled');
    assert.deepEqual(params, { enabled: false });
    calls++;
    if (calls === 2) await new Promise((resolve) => { release = resolve; });
  });
  const settled = await useNativeFocus(f.app);
  f.page.emit('framenavigated', {}); // Subframes do not change page focus.
  assert.equal(calls, 1);
  f.page.emit('framenavigated', f.frame);
  let complete = false;
  const waiting = settled().then(() => { complete = true; });
  await new Promise(setImmediate);
  assert.equal(complete, false, 'setup must wait for the protocol override');
  release();
  await waiting;
  assert.equal(calls, 2);
  const second = new EventEmitter();
  second.isClosed = () => false;
  second.mainFrame = () => ({});
  f.context.emit('page', second);
  await settled();
  assert.equal(calls, 3);
});

test('unexpected focus protocol failures remain fatal after navigation', async () => {
  let fail = false;
  const problem = new Error('renderer target crashed');
  const f = fixture(async () => { if (fail) throw problem; });
  const settled = await useNativeFocus(f.app);
  fail = true;
  f.page.emit('framenavigated', f.frame);
  await assert.rejects(settled(), (error) => error === problem);
  await assert.rejects(settled(), (error) => error === problem, 'a later scenario cannot clear a protocol failure');
});

test('a page closed while its override is pending does not poison later scenarios', async () => {
  const f = fixture(async () => {
    f.page.closed = true;
    throw new Error('target closed');
  });
  const settled = await useNativeFocus(f.app);
  await settled();
});
