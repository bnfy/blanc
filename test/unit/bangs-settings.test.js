'use strict';

// Bangs settings: the synced switch and custom list, and the device-local
// recents (spec: docs/superpowers/specs/2026-10-16-bangs-design.md,
// "Settings and storage"). Loads settings.js the way
// search-engine-settings.test.js does, with a stubbed electron.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => activeUserData, on: () => {} } },
};

const loaded = [];
function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  const settings = require('../../src/main/settings');
  loaded.push({ userData, settings });
  return settings;
}

function freshProfile(t, name, stored) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-bangs-${name}-`));
  t.after(() => {
    for (const { userData, settings } of loaded) if (userData === dir) settings.flushSettings();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  if (stored) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ onboardingVersion: 1, ...stored }));
  return loadSettings(dir);
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

const good = (code, extra = {}) => ({ code, name: 'x', template: `https://${code}.example/?q=%s`, ...extra });

test('defaults: bangs on, no custom bangs, no recents', (t) => {
  const s = freshProfile(t, 'defaults');
  const d = s.getSettings();
  assert.equal(d.bangsEnabled, true);
  assert.deepEqual(d.customBangs, []);
  assert.deepEqual(d.recentBangs, []);
});

test('bangsEnabled accepts only booleans', (t) => {
  const s = freshProfile(t, 'switch');
  assert.equal(s.setSettings({ bangsEnabled: 'yes' }).bangsEnabled, true);
  assert.equal(s.setSettings({ bangsEnabled: false }).bangsEnabled, false);
});

test('a stored non-boolean switch reads as the default', (t) => {
  const s = freshProfile(t, 'switch-read', { bangsEnabled: 'off' });
  assert.equal(s.getSettings().bangsEnabled, true);
});

test('custom bangs are normalized on write', (t) => {
  const s = freshProfile(t, 'custom');
  const next = s.setSettings({ customBangs: [{ code: 'YT', name: ' Mine ', template: ' https://m.example/?q=%s ' }] });
  assert.deepEqual(next.customBangs, [{ code: 'yt', name: 'Mine', template: 'https://m.example/?q=%s' }]);
});

test('junk custom bangs are dropped, extra keys stripped, 100 kept, first duplicate wins', (t) => {
  const s = freshProfile(t, 'junk');
  const next = s.setSettings({ customBangs: [
    good('a.b'),
    good('yt q'),
    { code: 'ok', name: '', template: 'https://ok.example/?q=%s' },
    { code: 'ok2', name: 'x', template: 'http://evil.example/?q=%s' },
    { code: 'long', name: 'n'.repeat(61), template: 'https://long.example/?q=%s' },
    'str',
    null,
    good('ok3', { extra: 1 }),
    good('dup', { name: 'first' }),
    good('dup', { name: 'second' }),
  ] });
  assert.deepEqual(next.customBangs, [
    { code: 'ok3', name: 'x', template: 'https://ok3.example/?q=%s' },
    { code: 'dup', name: 'first', template: 'https://dup.example/?q=%s' },
  ]);
  const many = Array.from({ length: 150 }, (_, i) => good(`c${i}`));
  assert.equal(s.setSettings({ customBangs: many }).customBangs.length, 100);
});

test('a non-array custom list is ignored on write and sanitized on read', (t) => {
  const s = freshProfile(t, 'custom-read', { customBangs: [good('ok'), 'junk', good('http', { template: 'http://evil.example/?q=%s' })] });
  assert.deepEqual(s.getSettings().customBangs, [{ code: 'ok', name: 'x', template: 'https://ok.example/?q=%s' }]);
  assert.deepEqual(s.setSettings({ customBangs: 'nope' }).customBangs, [{ code: 'ok', name: 'x', template: 'https://ok.example/?q=%s' }]);
});

test('recordRecentBang keeps ten codes, newest first, without repeats', (t) => {
  const s = freshProfile(t, 'recent');
  s.recordRecentBang('yt');
  s.recordRecentBang('yt');
  s.recordRecentBang('w');
  assert.deepEqual(s.getSettings().recentBangs, ['w', 'yt']);
  for (let i = 0; i < 12; i++) s.recordRecentBang(`c${i}`);
  const recent = s.getSettings().recentBangs;
  assert.equal(recent.length, 10);
  assert.equal(recent[0], 'c11');
  s.recordRecentBang('bad code');
  assert.deepEqual(s.getSettings().recentBangs, recent);
  s.clearRecentBangs();
  assert.deepEqual(s.getSettings().recentBangs, []);
});

test('recents notify their own listeners, never the settings fan-out, and only on a change', (t) => {
  const s = freshProfile(t, 'recent-listen');
  const generic = [];
  const own = [];
  s.onSettingsChanged((d) => generic.push(d.recentBangs));
  s.onRecentBangsChanged((recent) => own.push(recent));
  assert.equal(s.recordRecentBang('gh'), true);
  assert.equal(s.recordRecentBang('gh'), false, 'already first: nothing changed');
  s.clearRecentBangs();
  s.clearRecentBangs();
  assert.deepEqual(own, [['gh'], []]);
  assert.deepEqual(generic, [], 'a bang used is not a settings change: no theme/sync/broadcast fan-out');
});

test('stored recents are sanitized on read', (t) => {
  const s = freshProfile(t, 'recent-read', { recentBangs: ['ok', 'bad code', 3, ...Array.from({ length: 12 }, (_, i) => `r${i}`)] });
  const recent = s.getSettings().recentBangs;
  assert.equal(recent[0], 'ok');
  assert.equal(recent.length, 10);
  assert.ok(!recent.includes('bad code'));
});

test('recentBangs cannot be written through setSettings', (t) => {
  const s = freshProfile(t, 'recent-guard');
  assert.deepEqual(s.setSettings({ recentBangs: ['yt'] }).recentBangs, []);
});

test('sync carries the switch and the custom list, never recents', (t) => {
  const s = freshProfile(t, 'sync');
  s.setSettings({ bangsEnabled: false, customBangs: [good('m')] });
  s.recordRecentBang('m');
  const { values } = s.exportForSync();
  assert.equal(values.bangsEnabled, false);
  assert.deepEqual(values.customBangs, [good('m')]);
  assert.equal('recentBangs' in values, false);
});

test('mergeFromSync sanitizes junk custom bangs without throwing', (t) => {
  const s = freshProfile(t, 'merge');
  const future = Date.now() + 60_000;
  s.mergeFromSync({
    values: { customBangs: [good('ok'), 'junk', { code: 'x y' }] },
    meta: { customBangs: future },
    tieBreakers: {},
  });
  assert.deepEqual(s.getSettings().customBangs, [good('ok')]);
});

test('normalizeCustomBangs is exported for the page lookup', (t) => {
  const s = freshProfile(t, 'export');
  assert.deepEqual(s.normalizeCustomBangs([{ code: 'A', name: 'x', template: 'https://a.example/?q=%s' }]), [good('a')]);
  assert.deepEqual(s.normalizeCustomBangs('junk'), []);
});
