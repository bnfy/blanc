const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../../src/main/sends-model');

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const item = (id, over = {}) => ({ id, to: 'phone', url: `https://example.com/${id}`, title: id, sentAt: NOW - 1000, ...over });
const entry = (over = {}) => ({ name: 'Mac', platform: 'darwin', updatedAt: NOW - 1000, items: [], ...over });

test('rejects non-http urls', () => {
  for (const url of ['ftp://x.test/', 'javascript:alert(1)', 'blanc://newtab/', 'not a url', 'https://' + 'a'.repeat(2048)]) {
    assert.equal(m.sanitizeItem(item('a', { url }), NOW), null, url);
  }
  assert.ok(m.sanitizeItem(item('a', { url: 'http://x.test/' }), NOW));
});

test('truncates title in utf-16 units', () => {
  const title = 'a'.repeat(199) + '😀';
  assert.equal(m.sanitizeItem(item('a', { title }), NOW).title.length, 200);
});

test('keeps the newest 20 items', () => {
  const items = Array.from({ length: 25 }, (_, i) => item(`i${i}`, { sentAt: NOW - (25 - i) * 1000 }));
  const out = m.sanitizeEntry(entry({ items }), NOW).items;
  assert.equal(out.length, 20);
  assert.equal(out[0].id, 'i24');
  assert.equal(out.at(-1).id, 'i5');
});

test('drops items at exactly 7 days', () => {
  assert.equal(m.sanitizeItem(item('a', { sentAt: NOW - 7 * DAY }), NOW), null);
  assert.ok(m.sanitizeItem(item('a', { sentAt: NOW - 7 * DAY + 1 }), NOW));
});

test('prunes other entries at exactly 30 days but never own', () => {
  const stale = entry({ updatedAt: NOW - 30 * DAY });
  const out = m.mergeDevices({ me: stale }, { other: stale, fresh: entry() }, 'me', NOW);
  assert.deepEqual(Object.keys(out).sort(), ['fresh', 'me']);
});

test('heartbeat refreshes once a day', () => {
  const prev = entry({ updatedAt: NOW - DAY + 1 });
  const same = m.ownEntry(prev, { name: 'Mac', platform: 'darwin' }, NOW);
  assert.equal(same.entry.updatedAt, prev.updatedAt);
  assert.equal(same.changed, false);
  const due = m.ownEntry(entry({ updatedAt: NOW - DAY }), { name: 'Mac', platform: 'darwin' }, NOW);
  assert.equal(due.entry.updatedAt, NOW);
  assert.equal(due.changed, true);
  const renamed = m.ownEntry(prev, { name: 'Studio', platform: 'darwin' }, NOW);
  assert.equal(renamed.entry.updatedAt, NOW);
  assert.equal(m.ownEntry(null, { name: 'Mac', platform: 'darwin' }, NOW).changed, true);
});

test('own entry drops expired items without moving the clock', () => {
  const prev = entry({ updatedAt: NOW - 1000, items: [item('old', { sentAt: NOW - 8 * DAY })] });
  const out = m.ownEntry(prev, { name: 'Mac', platform: 'darwin' }, NOW);
  assert.deepEqual(out.entry.items, []);
  assert.equal(out.entry.updatedAt, prev.updatedAt);
  assert.equal(out.changed, true);
});

test('addItem refuses self and invalid urls', () => {
  const makeId = () => 'new';
  assert.deepEqual(m.addItem(entry(), { url: 'https://x.test/', title: '', to: 'me' }, 'me', NOW, makeId), { error: 'self' });
  assert.deepEqual(m.addItem(entry(), { url: 'file:///etc', title: '', to: 'phone' }, 'me', NOW, makeId), { error: 'invalid' });
  const ok = m.addItem(entry({ items: [item('a')] }), { url: 'https://x.test/', title: 'X', to: 'phone' }, 'me', NOW, makeId);
  assert.equal(ok.item.id, 'new');
  assert.equal(ok.entry.updatedAt, NOW);
  assert.deepEqual(ok.entry.items.map((i) => i.id), ['new', 'a']);
});

test('merge tie: own wins, then smaller canonical', () => {
  const a = entry({ name: 'A' });
  const b = entry({ name: 'B' });
  assert.equal(m.mergeDevices({ me: b }, { me: a }, 'me', NOW).me.name, 'B');
  assert.equal(m.mergeDevices({ x: b }, { x: a }, 'me', NOW).x.name, 'A');
  assert.equal(m.mergeDevices({ x: a }, { x: b }, 'me', NOW).x.name, 'A');
  const newer = entry({ name: 'B', updatedAt: NOW });
  assert.equal(m.mergeDevices({ x: a }, { x: newer }, 'me', NOW).x.name, 'B');
});

test('budget drops stalest others first, never own', () => {
  const big = (n, updatedAt) => entry({ updatedAt, items: Array.from({ length: 20 }, (_, i) => item(`${n}${i}`, { title: 'x'.repeat(200) })) });
  const devices = { me: big('m', NOW - 5000), old: big('o', NOW - 4000), mid: big('d', NOW - 3000), new: big('n', NOW - 2000) };
  const out = m.applyBudget(devices, 'me', { maxBytes: 20_000 });
  assert.ok(out.me);
  assert.ok(!out.old);
  assert.ok(out.new);
});

test('inbox excludes dismissed, other recipients and own items', () => {
  const devices = {
    mac: entry({ items: [item('a', { sentAt: NOW - 3000 }), item('b', { to: 'pc' }), item('c', { sentAt: NOW - 2000 })] }),
    phone: entry({ name: 'iPhone', platform: 'ios', items: [item('self')] }),
  };
  const rows = m.inbox(devices, 'phone', { c: NOW }, NOW);
  assert.deepEqual(rows.map((r) => r.id), ['a']);
  assert.equal(rows[0].fromName, 'Mac');
  assert.equal(rows[0].fromId, 'mac');
});

test('targets include presence-only devices', () => {
  const out = m.targets({ phone: entry({ name: 'iPhone', platform: 'ios', updatedAt: NOW }) }, { pc: entry({ name: 'PC', platform: 'win32' }), me: entry() }, 'me', {});
  assert.deepEqual(out.map((t) => t.id), ['phone', 'pc']);
});

test('targets skip retracted tab-sync entries and use synced device names', () => {
  const out = m.targets({}, { pc: entry({ name: 'PC' }), gone: { retracted: true, updatedAt: NOW } }, 'me', { pc: { name: 'Gaming PC', at: 1 } });
  assert.deepEqual(out, [{ id: 'pc', name: 'Gaming PC', platform: 'darwin', updatedAt: NOW - 1000 }]);
});

test('pruneDismissed keeps 8 days', () => {
  assert.deepEqual(m.pruneDismissed({ a: NOW - 8 * DAY, b: NOW - 8 * DAY + 1 }, NOW), { b: NOW - 8 * DAY + 1 });
});

test('a retraction wins over older copies and hides the device', () => {
  const gone = m.retractedEntry(NOW);
  const merged = m.mergeDevices({ mac: entry({ items: [item('a')] }) }, { mac: gone }, 'phone', NOW);
  assert.deepEqual(merged.mac, gone);
  assert.deepEqual(m.inbox(merged, 'phone', {}, NOW), []);
  assert.deepEqual(m.targets(merged, {}, 'phone', {}), []);
  const back = m.ownEntry(gone, { name: 'Mac', platform: 'darwin' }, NOW + 1);
  assert.equal(back.entry.retracted, undefined);
  assert.equal(back.entry.updatedAt, NOW + 1);
});
