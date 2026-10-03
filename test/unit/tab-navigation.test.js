'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { queueTabNavigation, shouldPresentTabLoadFailure, reloadContents } = require('../../src/main/tab-navigation');
const turn = () => new Promise(resolve => setImmediate(resolve));
function contents() {
  const wc = new EventEmitter();
  Object.assign(wc, { loading: false, stops: 0, destroyed: false,
    isDestroyed: () => wc.destroyed, isLoadingMainFrame: () => wc.loading,
    stop: () => { wc.stops++; wc.loading = false; wc.finish?.(); wc.emit('did-stop-loading'); },
  });
  return wc;
}
const start = async predicate => { for (let i = 0; i < 8 && !predicate(); i++) await turn(); assert.ok(predicate()); };

test('same-turn navigation requests coalesce to the newest destination', async () => {
  const wc = contents(), calls = [];
  const first = queueTabNavigation(wc, { isCurrent: () => true, run: () => calls.push('first') });
  const second = queueTabNavigation(wc, { isCurrent: () => true, run: () => calls.push('second') });
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.deepEqual(calls, ['second']);
});

test('rapid navigation interrupts and settles the first load before the next call', async () => {
  const wc = contents(), calls = [];
  const first = queueTabNavigation(wc, { isCurrent: () => true, run: () => {
    wc.loading = true; calls.push('first');
    return new Promise(resolve => { wc.finish = resolve; });
  } });
  await start(() => calls.length === 1);
  const second = queueTabNavigation(wc, { isCurrent: () => true, run: () => calls.push('second') });
  assert.equal(shouldPresentTabLoadFailure(wc, -2, 'blanc://newtab/'), false, 'superseded native failures do not replace the newest request');
  await Promise.all([first, second]);
  assert.equal(wc.stops, 1);
  assert.deepEqual(calls, ['first', 'second']);
});

test('queued navigation rejects changed identity/ownership and destroyed guests', async () => {
  const wc = contents();
  let current = true, calls = 0;
  const pending = queueTabNavigation(wc, { isCurrent: () => current, run: () => calls++ });
  current = false;
  assert.equal(await pending, false);
  assert.equal(calls, 0);
  wc.destroyed = true;
  assert.equal(await queueTabNavigation(wc, { isCurrent: () => true, run: () => calls++ }), false);
});

test('error presentation excludes cancellation and recursive local errors but keeps network/certificate failures', () => {
  const wc = contents();
  assert.equal(shouldPresentTabLoadFailure(wc, -3, 'https://example.com'), false);
  assert.equal(shouldPresentTabLoadFailure(wc, -2, 'blanc://error/?url=failed'), false);
  assert.equal(shouldPresentTabLoadFailure(wc, -2, 'https://example.com'), true);
  assert.equal(shouldPresentTabLoadFailure(wc, -202, 'https://example.com'), true);
});

test('reload waits for the native lifecycle and preserves an unload objection', async () => {
  for (const event of ['did-stop-loading', 'destroyed', 'will-prevent-unload']) {
    const wc = contents();
    let reloaded = false, settled = false;
    wc.reloadIgnoringCache = () => { reloaded = true; };
    const pending = reloadContents(wc, true).then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(reloaded, true);
    assert.equal(settled, false);
    wc.emit(event, { preventDefault: () => assert.fail('must not override unsaved work') });
    await pending;
    assert.equal(wc.listenerCount('did-stop-loading'), 0);
    assert.equal(wc.listenerCount('will-prevent-unload'), 0);
  }
});


test('a fresh guest starts before activation, while a subsequent navigation stays serialized', async () => {
  const wc = contents(), calls = [];
  const first = queueTabNavigation(wc, { startImmediately: true, isCurrent: () => true, run: () => {
    calls.push('initial'); wc.loading = true;
    return new Promise(resolve => { wc.finish = resolve; });
  } });
  assert.deepEqual(calls, ['initial'], 'initial native navigation starts before focus/UI broadcasts');
  const second = queueTabNavigation(wc, { startImmediately: true, isCurrent: () => true, run: () => calls.push('next') });
  assert.deepEqual(calls, ['initial']);
  await Promise.all([first, second]);
  assert.deepEqual(calls, ['initial', 'next']);
});
