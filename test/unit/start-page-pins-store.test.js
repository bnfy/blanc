'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { waitForJson } = require('./support/wait-for-json');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-start-pins-'));
const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => userData, on: () => {} } },
};

delete require.cache[require.resolve('../../src/main/store')];
delete require.cache[require.resolve('../../src/main/start-page-pins')];
const pins = require('../../src/main/start-page-pins');
const { withLocalProfile } = require('../../src/main/local-profile-context');

const clear = () => { for (const pin of pins.listPins()) pins.unpin(pin.url); };

test.after(() => {
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

test('a pin is an http(s) page and its name; anything else is refused', () => {
  assert.deepEqual(pins.sanitizePin({ url: 'https://example.com/a?b=1', title: '  Example  ' }), {
    url: 'https://example.com/a?b=1',
    title: 'Example',
  });
  // A missing name falls back to the host, without "www.".
  assert.deepEqual(pins.sanitizePin({ url: 'https://www.example.com' }), {
    url: 'https://www.example.com/',
    title: 'example.com',
  });
  assert.equal(pins.sanitizePin({ url: 'x', title: 'y'.repeat(500) }), null);
  assert.equal(pins.sanitizePin({ url: 'https://a.test/', title: 'y'.repeat(500) }).title.length, 200);
  for (const url of ['javascript:alert(1)', 'blanc://settings/', 'file:///etc/passwd', 'data:text/html,x', 42, null]) {
    assert.equal(pins.sanitizePin({ url, title: 't' }), null, String(url));
  }
  assert.equal(pins.sanitizePin({ url: `https://a.test/${'x'.repeat(5000)}` }), null);
  assert.equal(pins.sanitizePin(null), null);
});

test('saved pins are re-sanitized, without repeats, up to the cap', () => {
  const saved = [
    { url: 'https://a.test/', title: 'A' },
    { url: 'https://a.test/', title: 'A again' },
    { url: 'javascript:alert(1)', title: 'no' },
    'not an object',
    ...Array.from({ length: 12 }, (_, i) => ({ url: `https://site-${i}.test/`, title: `Site ${i}` })),
  ];
  const result = pins.sanitizePins(saved);
  assert.equal(result.length, pins.MAX_PINS);
  assert.deepEqual(result[0], { url: 'https://a.test/', title: 'A' });
  assert.equal(result[1].url, 'https://site-0.test/');
  assert.deepEqual(pins.sanitizePins({}), []);
});

test('pinning adds a page last, once, and stops at the cap', () => {
  clear();
  let changes = 0;
  pins.onChanged(() => { changes += 1; });
  assert.deepEqual(pins.pin({ url: 'https://b.test/', title: 'B' }), { ok: true });
  assert.deepEqual(pins.pin({ url: 'https://a.test/x', title: 'A' }), { ok: true });
  // Pinning a pinned page changes nothing and says nothing.
  assert.deepEqual(pins.pin({ url: 'https://b.test/', title: 'B again' }), { ok: true });
  assert.equal(changes, 2);
  assert.deepEqual(pins.listPins().map((pin) => pin.title), ['B', 'A']);
  assert.equal(pins.isPinned('https://a.test/x'), true);
  assert.equal(pins.isPinned('https://a.test/'), false);
  assert.equal(pins.isPinned('blanc://newtab/'), false);
  assert.deepEqual(pins.pin({ url: 'blanc://settings/', title: 'S' }), { ok: false, reason: 'invalid' });

  for (let i = 0; i < 6; i++) pins.pin({ url: `https://fill-${i}.test/`, title: `Fill ${i}` });
  assert.equal(pins.isFull(), true);
  assert.deepEqual(pins.pin({ url: 'https://late.test/', title: 'Late' }), { ok: false, reason: 'full' });
  assert.equal(pins.listPins().length, pins.MAX_PINS);

  assert.equal(pins.unpin('https://b.test/'), true);
  assert.equal(pins.unpin('https://b.test/'), false);
  assert.equal(pins.isFull(), false);
  assert.equal(pins.listPins()[0].title, 'A');
});

test('the Personal profile writes start-page-pins.json; a named profile its own', async () => {
  clear();
  pins.pin({ url: 'https://personal.test/', title: 'Personal' });
  pins.flushPins();
  const personal = await waitForJson(path.join(userData, 'start-page-pins.json'),
    (d) => d.pins?.some((pin) => pin.url === 'https://personal.test/'));
  assert.equal(personal.version, 1);

  const id = 'profile_pins';
  await withLocalProfile(id, async () => {
    assert.deepEqual(pins.listPins(), []);
    pins.pin({ url: 'https://work.test/', title: 'Work' });
    pins.flushPins();
  });
  const named = await waitForJson(path.join(userData, 'profiles', id, 'start-page-pins.json'),
    (d) => d.pins?.length === 1);
  assert.equal(named.pins[0].url, 'https://work.test/');
  assert.equal(pins.isPinned('https://work.test/'), false, 'Personal never sees the named profile’s pins');
});
