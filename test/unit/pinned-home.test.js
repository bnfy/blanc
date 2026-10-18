const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const { applyPinnedHomes, pinnedHomeFor } = require('../../src/main/pinned-home');
const { filterRestoredSession } = require('../../src/main/session-restore');
const { isUtilityUrl } = require('../../src/main/utility-pages');

function savedPinned(overrides = {}) {
  return {
    urls: ['https://b.example/'],
    pinned: [true],
    meta: [{ title: 'B', favicon: null, pinnedHomeUrl: 'https://a.example/' }],
    ...overrides,
  };
}

test('https home', () => {
  assert.equal(pinnedHomeFor('https://mail.example/inbox'), 'https://mail.example/inbox');
});

test('error page unwraps', () => {
  assert.equal(
    pinnedHomeFor('blanc://error/?url=https%3A%2F%2Fa.example%2F'),
    'https://a.example/',
  );
});

test('utility and transient pages are refused', () => {
  for (const url of [
    'blanc://settings/',
    'blanc://history/',
    'blanc://error/',
    'chrome-extension://x/',
    'javascript:1',
    'data:text/html,x',
  ]) assert.equal(pinnedHomeFor(url), null, url);
});

test('known start page allowed', () => {
  assert.equal(pinnedHomeFor('blanc://newtab/'), 'blanc://newtab/');
});

test('file needs a local-file tab', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-pinned-home-'));
  const file = path.join(dir, 'home.html');
  try {
    fs.writeFileSync(file, '<title>Home</title>');
    const url = pathToFileURL(fs.realpathSync.native(file)).href;
    assert.equal(pinnedHomeFor(url), null);
    assert.equal(pinnedHomeFor(url, { localFile: true }), url);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('clean start swaps to the home', () => {
  const result = applyPinnedHomes(savedPinned(), { cleanStart: true });
  assert.equal(result.urls[0], 'https://a.example/');
  assert.equal(result.meta[0].title, 'B');
});

test('recovery keeps the last page', () => {
  const result = applyPinnedHomes(savedPinned(), { cleanStart: false });
  assert.equal(result.urls[0], 'https://b.example/');
  assert.equal(result.meta[0].pinnedHomeUrl, 'https://a.example/');
});

test('invalid stored home falls back', () => {
  const result = applyPinnedHomes(savedPinned({
    meta: [{ title: 'B', favicon: null, pinnedHomeUrl: 'blanc://settings/' }],
  }), { cleanStart: true });
  assert.equal(result.urls[0], 'https://b.example/');
  assert.equal(Object.hasOwn(result.meta[0], 'pinnedHomeUrl'), false);
});

test('legacy pinned entry passes through', () => {
  const saved = savedPinned({ meta: [{ title: 'B', favicon: null }] });
  assert.deepEqual(applyPinnedHomes(saved, { cleanStart: true }), saved);
});

test('unpinned entries ignore a stray home', () => {
  const saved = savedPinned({ pinned: [false] });
  assert.deepEqual(applyPinnedHomes(saved, { cleanStart: true }), saved);
});

test('home substitution happens before filtering', () => {
  const result = applyPinnedHomes(savedPinned({ urls: ['blanc://settings/'] }), { cleanStart: true });
  assert.equal(result.urls[0], 'https://a.example/');
  assert.deepEqual(filterRestoredSession(result, isUtilityUrl).urls, ['https://a.example/']);
});

test('file home creates the grant column', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-pinned-home-'));
  const file = path.join(dir, 'home.html');
  try {
    fs.writeFileSync(file, '<title>Home</title>');
    const url = pathToFileURL(fs.realpathSync.native(file)).href;
    const result = applyPinnedHomes(savedPinned({
      meta: [{ title: 'B', favicon: null, pinnedHomeUrl: url }],
    }), { cleanStart: true });
    assert.deepEqual(result.localFiles, [true]);
    assert.equal(result.urls[0], url);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
