import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./prototype/extensions.js', import.meta.url), 'utf8');
function picker() {
  const timers = new Map(); let serial = 0;
  const context = { window: {}, setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(source, context);
  const p = Object.create(context.window.BlancExtensions.prototype);
  Object.assign(p, { searchGeneration: 0, search: { value: 'first' }, panel: { hidden: false }, items: [], render() {}, requests: [] });
  p.request = (method, args) => new Promise((resolve, reject) => p.requests.push({ method, args, resolve, reject }));
  return { p, run() { const fn = [...timers.values()].at(-1); timers.clear(); return fn(); } };
}
test('stale replies never replace current Store results', async () => {
  const { p, run } = picker(); p.searchStore(); const first = run();
  p.search.value = 'second'; p.searchStore(); const second = run();
  p.requests[1].resolve({ items: [{ id: 'b'.repeat(32), name: 'Second' }] }); await second;
  p.requests[0].resolve({ items: [{ id: 'a'.repeat(32), name: 'First' }] }); await first;
  assert.equal(p.storeItems[0].name, 'Second');
});
test('closing the picker invalidates in-flight replies', async () => {
  const { p, run } = picker(); p.searchStore(); const pending = run(); p.hide();
  p.requests[0].resolve({ items: [{ id: 'a'.repeat(32), name: 'Hidden' }] }); await pending;
  assert.equal(p.storeItems.length, 0);
});
test('invalid remote IDs cannot become navigation targets', async () => {
  const { p, run } = picker(); p.searchStore(); const pending = run();
  p.requests[0].resolve({ items: [{ id: 'https://evil.test', name: 'Bad' }, { id: 'a'.repeat(32), name: 'Safe' }] }); await pending;
  assert.equal(p.storeItems.length, 1);
  let opened; p.openPage = async url => { opened = url; };
  await p.activate(p.storeItems[0].id);
  assert.equal(opened, `https://chromewebstore.google.com/detail/${'a'.repeat(32)}`);
});
test('network failures keep an explicit full-search fallback', async () => {
  const { p, run } = picker(); p.searchStore(); const pending = run();
  p.requests[0].reject(new Error('offline')); await pending;
  assert.match(p.storeMessage, /unavailable/);
  assert.equal(p.storeItems.length, 0);
});
test('short queries do not contact Google', () => {
  const { p } = picker(); p.search.value = 'x'; p.searchStore(); assert.equal(p.requests.length, 0);
  assert.match(p.storeMessage, /two characters/);
});
