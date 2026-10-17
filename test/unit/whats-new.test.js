'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  WHATS_NEW_WINDOW_MS,
  isNewerRelease,
  whatsNewOnLaunch,
  whatsNewState,
} = require('../../src/main/whats-new');

const ROOT = path.join(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NOW = Date.parse('2026-10-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

test('isNewerRelease compares release numbers, not strings', () => {
  assert.equal(isNewerRelease('1.36.0', '1.35.0'), true);
  assert.equal(isNewerRelease('1.100.0', '1.99.3'), true);
  assert.equal(isNewerRelease('2.0.0', '1.35.9'), true);
  assert.equal(isNewerRelease('1.35.0', '1.35.0'), false);
  assert.equal(isNewerRelease('1.34.0', '1.35.0'), false);
  assert.equal(isNewerRelease('1.36.0-beta.1', '1.35.0'), false, 'a pre-release never counts');
  assert.equal(isNewerRelease('1.36.0', ''), false);
});

test('an update starts the pill, and the same version again changes nothing', () => {
  const patch = whatsNewOnLaunch({ lastRunVersion: '1.35.0' }, { version: '1.36.0', now: NOW, firstRunComplete: true });
  assert.deepEqual(patch, { lastRunVersion: '1.36.0', whatsNewVersion: '1.36.0', whatsNewSince: NOW });
  assert.equal(whatsNewOnLaunch({ ...patch }, { version: '1.36.0', now: NOW + DAY, firstRunComplete: true }), null);
});

test('a profile from before this feature counts as updated only once setup is finished', () => {
  assert.deepEqual(
    whatsNewOnLaunch({ lastRunVersion: '' }, { version: '1.36.0', now: NOW, firstRunComplete: true }),
    { lastRunVersion: '1.36.0', whatsNewVersion: '1.36.0', whatsNewSince: NOW },
  );
  assert.deepEqual(
    whatsNewOnLaunch({ lastRunVersion: '' }, { version: '1.36.0', now: NOW, firstRunComplete: false }),
    { lastRunVersion: '1.36.0' },
    'a fresh install just downloaded this version, so there is nothing new to show',
  );
});

test('a downgrade or pre-release records the version and clears a stale pill', () => {
  assert.deepEqual(
    whatsNewOnLaunch({ lastRunVersion: '1.36.0', whatsNewVersion: '1.36.0' }, { version: '1.35.0', now: NOW, firstRunComplete: true }),
    { lastRunVersion: '1.35.0', whatsNewVersion: '' },
  );
  assert.deepEqual(
    whatsNewOnLaunch({ lastRunVersion: '1.35.0' }, { version: '1.36.0-beta.1', now: NOW, firstRunComplete: true }),
    { lastRunVersion: '1.36.0-beta.1' },
  );
});

test('the pill shows for seven days and links to that release on the changelog', () => {
  const settings = { whatsNewVersion: '1.36.0', whatsNewSince: NOW };
  assert.deepEqual(whatsNewState(settings, { version: '1.36.0', now: NOW + DAY }), {
    version: '1.36.0',
    url: 'https://blanc.day/changelog#v1-36-0',
  });
  assert.equal(whatsNewState(settings, { version: '1.36.0', now: NOW + WHATS_NEW_WINDOW_MS }), null);
  assert.equal(whatsNewState(settings, { version: '1.37.0', now: NOW + DAY }), null, 'only for the running version');
  assert.equal(whatsNewState({ ...settings, whatsNewVersion: '' }, { version: '1.36.0', now: NOW }), null, 'closed');
  assert.equal(whatsNewState({ ...settings, whatsNewSince: NOW + 30 * DAY }, { version: '1.36.0', now: NOW }), null, 'corrupt future time');
  assert.equal(whatsNewState({ ...settings, whatsNewSince: 0 }, { version: '1.36.0', now: NOW }), null);
});

test('the changelog anchor matches the site', () => {
  const releases = JSON.parse(read('site/src/data/releases.json'));
  const latest = releases[0];
  assert.equal(whatsNewState({ whatsNewVersion: latest.version, whatsNewSince: NOW }, { version: latest.version, now: NOW }).url,
    `https://blanc.day/changelog#${latest.anchor}`);
});

test('main, the bridge and the start page are wired together', () => {
  const main = read('src/main/main.js');
  const pages = read('src/main/pages.js');
  const preload = read('src/main/tab-preload.js');
  const settings = read('src/main/settings.js');
  const html = read('src/renderer/pages/newtab.html');
  const js = read('src/renderer/pages/newtab.js');
  const schema = JSON.parse(read('settings-schema/schema.json'));
  assert.match(main, /const whatsNewPatch = app\.isPackaged && whatsNewOnLaunch\(settings\.getSettings\(\), \{\s*version: app\.getVersion\(\),/);
  assert.match(main, /whatsNew: whatsNewState\(current, \{ version: app\.getVersion\(\), now: Date\.now\(\) \}\),/);
  assert.match(main, /dismissWhatsNew: \(\) => \{\s*settings\.setSettings\(\{ whatsNewVersion: '' \}\);\s*return true;/);
  assert.match(pages, /handle\('pages:start:whats-new-dismiss', 'newtab', \(\) => hooks\.startPage\?\.dismissWhatsNew\?\.\(\) === true\)/);
  assert.match(preload, /dismissWhatsNew: \(\) => invoke\('pages:start:whats-new-dismiss'\)/);
  for (const key of ['lastRunVersion', 'whatsNewVersion', 'whatsNewSince']) {
    assert.ok(schema.internalDefaults.includes(key), key);
    assert.match(settings, new RegExp(`\\b${key}: `), key);
  }
  assert.doesNotMatch(settings.match(/const SYNCED_KEYS = \[[^\]]*\]/)[0], /lastRunVersion|whatsNew/, 'never Profile Synced');
  assert.match(html, /<span id="whatsNew" class="whats-new-pill js-whats-new" hidden>/);
  assert.match(js, /const show = !isPrivate && /, 'private tabs never show it');
  assert.match(js, /\|\| !whatsNewEl\.hidden;/, 'the Patron pill steps aside while it shows');
});
