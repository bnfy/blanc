import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./prototype/extensions.js', import.meta.url), 'utf8');
function picker() {
  const timers = new Map(); let serial = 0;
  const context = { URL, window: {}, setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id) };
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

test('Store icon URLs accept only the exact HTTPS image host', () => {
  const { p } = picker();
  const validate = p.constructor.storeIconUrl;
  assert.equal(validate('https://lh3.googleusercontent.com/icon=s72'), 'https://lh3.googleusercontent.com/icon=s72');
  for (const url of ['http://lh3.googleusercontent.com/icon', 'https://lh3.googleusercontent.com.evil.test/icon', 'https://user@lh3.googleusercontent.com/icon', 'https://lh3.googleusercontent.com:444/icon', 'data:image/svg+xml,evil', 'javascript:alert(1)', undefined]) assert.equal(validate(url), '');
});

test('installed unavailable actions remain manageable without opening their popup', async () => {
  const context = { window: {}, requestAnimationFrame: fn => fn() };
  vm.runInNewContext(source, context);
  const p = Object.create(context.window.BlancExtensions.prototype);
  const calls = [];
  Object.assign(p, { items: [{ id: 'a'.repeat(32), enabled: false }], storeItems: [], tabId: 7,
    close: async () => calls.push('close'), request: async (method, args) => calls.push([method, ...args]) });
  await p.activate('a'.repeat(32)); assert.equal(calls.length, 0);
  await p.activate('a'.repeat(32), true);
  assert.deepEqual(calls, ['close', ['extensionContextMenu', 'a'.repeat(32), 7]]);
  calls.length = 0;
  await p.activate('b'.repeat(32), true); assert.equal(calls.length, 0);
});

test('keyboard context menus apply only to installed extensions', () => {
  const { p } = picker(); let opened = null; let prevented = false;
  p.items = [{ id: 'a'.repeat(32) }]; p.selected = 'store-search';
  p.activate = (id, context) => { opened = [id, context]; };
  p.keydown({ key: 'F10', shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(opened, null);
  p.selected = p.items[0].id;
  p.keydown({ key: 'F10', shiftKey: true, preventDefault() { prevented = true; } });
  assert.deepEqual(opened, [p.selected, true]); assert.equal(prevented, true);
});
