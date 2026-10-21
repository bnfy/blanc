'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A What's New highlight can be for some platforms only (Sunrise Gold is a
// macOS icon). The page shows each visitor only the highlights for their
// platform, and every platform sees at least one of a page's own.
const ROOT = path.join(__dirname, '../..');
const platformLib = () => import('../../site/src/lib/visitor-platform.mjs');
const lib = () => import('../../site/src/lib/whats-new.mjs');
const releases = [{ version: '1.38.0', humanDate: 'October 18, 2026', anchor: 'v1-38-0' }];
const media = (n) => ({ kind: 'image', src: `/feature-captures/${['tab-group-colors-v1.38.0.webp', 'island-hover-v1.38.0.webp', 'start-page-color-rose-solid-v1.38.0.webp'][n]}`, width: 1440, height: 900, alt: 'Alt.' });
const hl = (id, n, extra = {}) => ({ id, tile: id, title: id, body: 'Body.', media: media(n), ...extra });
const data = (highlights) => ({ firstRelease: '1.38', noPage: [], pages: [{ release: '1.38', highlights }] });
const opts = { publicDir: path.join(ROOT, 'site/public') };

test('the visitor platform comes from the browser, or from ?platform= for checking', async () => {
  const { visitorPlatform } = await platformLib();
  assert.equal(visitorPlatform({ userAgentData: { platform: 'macOS' } }), 'mac');
  assert.equal(visitorPlatform({ userAgentData: { platform: 'Windows' } }), 'windows');
  assert.equal(visitorPlatform({ userAgentData: { platform: 'Linux' } }), 'linux');
  assert.equal(visitorPlatform({ platform: 'MacIntel' }), 'mac');
  assert.equal(visitorPlatform({ platform: 'Win32' }), 'windows');
  assert.equal(visitorPlatform({ platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), 'linux');
  assert.equal(visitorPlatform({ platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 14)' }), null, 'a phone sees everything');
  assert.equal(visitorPlatform({ platform: 'iPhone' }), null);
  assert.equal(visitorPlatform({}), null);
  assert.equal(visitorPlatform({ search: '?platform=windows', platform: 'MacIntel' }), 'windows');
  assert.equal(visitorPlatform({ search: '?platform=bogus', platform: 'MacIntel' }), 'mac');
});

test('platforms is an optional list of mac, windows and linux', async () => {
  const { validateWhatsNew } = await lib();
  assert.deepEqual(validateWhatsNew(data([hl('a', 0), hl('b', 1, { platforms: ['mac'] })]), releases, opts), []);
  for (const platforms of [[], ['ios'], ['mac', 'mac'], 'mac']) {
    const errors = validateWhatsNew(data([hl('a', 0), hl('b', 1, { platforms })]), releases, opts);
    assert.ok(errors.some((e) => /platforms/.test(e)), JSON.stringify(platforms));
  }
});

test('every platform sees at least one of a page\'s own highlights', async () => {
  const { validateWhatsNew } = await lib();
  const errors = validateWhatsNew(data([hl('a', 0, { platforms: ['mac'] }), hl('b', 1, { platforms: ['mac', 'windows'] })]), releases, opts);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /linux/);
});

test('the page marks each highlight and tile with its platforms and filters them in the browser', () => {
  const component = fs.readFileSync(path.join(ROOT, 'site/src/components/WhatsNewHighlight.astro'), 'utf8');
  const route = fs.readFileSync(path.join(ROOT, 'site/src/pages/whats-new/[release].astro'), 'utf8');
  const script = fs.readFileSync(path.join(ROOT, 'site/src/scripts/whats-new.js'), 'utf8');
  assert.match(component, /data-platforms=/);
  assert.match(route, /data-platforms=/);
  assert.match(script, /visitorPlatform/);
});

test('Sunrise Gold is announced to Mac users only', () => {
  const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/src/data/whats-new.json'), 'utf8')).pages;
  const gold = pages.flatMap((p) => p.highlights).find((h) => h.id === 'sunrise-gold');
  assert.deepEqual(gold.platforms, ['mac']);
});
