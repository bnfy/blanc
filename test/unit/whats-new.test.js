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
  featureRelease,
  whatsNewPageUrl,
  whatsNewCheckDue,
  whatsNewAfterCheck,
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
  assert.deepEqual(patch, { lastRunVersion: '1.36.0', whatsNewVersion: '1.36.0', whatsNewSince: NOW, whatsNewPageVersion: '' });
  assert.equal(whatsNewOnLaunch({ ...patch }, { version: '1.36.0', now: NOW + DAY, firstRunComplete: true }), null);
});

test('a profile from before this feature counts as updated only once setup is finished', () => {
  assert.deepEqual(
    whatsNewOnLaunch({ lastRunVersion: '' }, { version: '1.36.0', now: NOW, firstRunComplete: true }),
    { lastRunVersion: '1.36.0', whatsNewVersion: '1.36.0', whatsNewSince: NOW, whatsNewPageVersion: '' },
  );
  assert.deepEqual(
    whatsNewOnLaunch({ lastRunVersion: '' }, { version: '1.36.0', now: NOW, firstRunComplete: false }),
    { lastRunVersion: '1.36.0', whatsNewPageVersion: '', whatsNewTabRelease: '1.36' },
    'a fresh install just downloaded this version, so there is nothing new to show',
  );
});

test('a downgrade or pre-release records the version and clears a stale pill', () => {
  assert.deepEqual(
    whatsNewOnLaunch({ lastRunVersion: '1.36.0', whatsNewVersion: '1.36.0' }, { version: '1.35.0', now: NOW, firstRunComplete: true }),
    { lastRunVersion: '1.35.0', whatsNewVersion: '', whatsNewPageVersion: '' },
  );
  assert.deepEqual(
    whatsNewOnLaunch({ lastRunVersion: '1.35.0' }, { version: '1.36.0-beta.1', now: NOW, firstRunComplete: true }),
    { lastRunVersion: '1.36.0-beta.1', whatsNewPageVersion: '' },
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

test('featureRelease and the page URL use major.minor', () => {
  assert.equal(featureRelease('1.39.2'), '1.39');
  assert.equal(featureRelease('1.39.0-beta.1'), null);
  assert.equal(whatsNewPageUrl('1.39.2'), 'https://blanc.day/whats-new/1.39');
});

test('a feature update owes a tab; a bug-fix update and a fresh install do not', () => {
  const feature = whatsNewOnLaunch({ lastRunVersion: '1.38.2', whatsNewTabRelease: '1.38' }, { version: '1.39.0', now: NOW, firstRunComplete: true });
  assert.equal('whatsNewTabRelease' in feature, false, 'left as 1.38, so 1.39 is owed');
  const bugFix = whatsNewOnLaunch({ lastRunVersion: '1.39.0', whatsNewTabRelease: '' }, { version: '1.39.1', now: NOW, firstRunComplete: true });
  assert.equal(bugFix.whatsNewTabRelease, '1.39', 'a bug-fix update never opens the tab, even one never shown');
  assert.equal(bugFix.whatsNewVersion, '1.39.1', 'it still shows the pill');
  const fresh = whatsNewOnLaunch({ lastRunVersion: '' }, { version: '1.39.0', now: NOW, firstRunComplete: false });
  assert.equal(fresh.whatsNewTabRelease, '1.39');
  const legacy = whatsNewOnLaunch({ lastRunVersion: '' }, { version: '1.39.0', now: NOW, firstRunComplete: true });
  assert.equal('whatsNewTabRelease' in legacy, false, 'a profile from before the pill counts as a feature update');
});

test('the page check runs only while the pill is live and the page is not yet found', () => {
  const live = { whatsNewVersion: '1.39.0', whatsNewSince: NOW, whatsNewPageVersion: '' };
  assert.equal(whatsNewCheckDue(live, { version: '1.39.0', now: NOW + DAY }), true);
  assert.equal(whatsNewCheckDue(live, { version: '1.39.0', now: NOW + WHATS_NEW_WINDOW_MS }), false, 'after seven days');
  assert.equal(whatsNewCheckDue({ ...live, whatsNewVersion: '' }, { version: '1.39.0', now: NOW }), false, 'pill closed');
  assert.equal(whatsNewCheckDue({ ...live, whatsNewPageVersion: '1.39.0' }, { version: '1.39.0', now: NOW }), false, 'already found');
});

test('a found page opens the tab once and points the pill at it', () => {
  assert.deepEqual(
    whatsNewAfterCheck({ whatsNewTabRelease: '1.38' }, { version: '1.39.0', found: true, canOpen: true }),
    { patch: { whatsNewPageVersion: '1.39.0', whatsNewTabRelease: '1.39', whatsNewVersion: '' }, openUrl: 'https://blanc.day/whats-new/1.39' },
  );
  assert.deepEqual(
    whatsNewAfterCheck({ whatsNewTabRelease: '1.39' }, { version: '1.39.1', found: true, canOpen: true }),
    { patch: { whatsNewPageVersion: '1.39.1' }, openUrl: null },
  );
});

test('with no window the tab stays owed', () => {
  assert.deepEqual(
    whatsNewAfterCheck({ whatsNewTabRelease: '1.38' }, { version: '1.39.0', found: true, canOpen: false }),
    { patch: { whatsNewPageVersion: '1.39.0' }, openUrl: null },
  );
});

test('a missing page changes nothing', () => {
  assert.deepEqual(whatsNewAfterCheck({ whatsNewTabRelease: '1.38' }, { version: '1.39.0', found: false, canOpen: true }), { patch: null, openUrl: null });
});

test('the pill links to the page once it is found', () => {
  const state = whatsNewState({ whatsNewVersion: '1.39.1', whatsNewSince: NOW, whatsNewPageVersion: '1.39.1' }, { version: '1.39.1', now: NOW });
  assert.equal(state.url, 'https://blanc.day/whats-new/1.39');
});

test('the page URL matches the site route', () => {
  const data = JSON.parse(read('site/src/data/whats-new.json'));
  const release = data.pages[0].release;
  assert.equal(whatsNewPageUrl(`${release}.0`), `https://blanc.day/whats-new/${release}`);
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
  assert.match(main, /maybeSendLaunchPing\(\);\s*maybeOpenWhatsNew\(\)\.catch\(/, 'checks once session restore is done');
  assert.match(main, /if \(!app\.isPackaged \|\| whatsNewCheckStarted\) return;/, 'packaged builds, once per launch');
  assert.match(main, /checkWhatsNewPage\(url, \{ fetch: net\.fetch \}\)/);
  assert.match(main, /bananifyServiceAllowed\(url\)/, 'a renamed build never asks blanc.day');
  assert.match(main, /canOpen: !isQuitting && hasLiveWindow\(\)/);
  assert.match(main, /setActiveTab\(createTab\(openUrl\), \{ focusContent: true \}\)/, 'an ordinary, active tab; never private');
  assert.match(main, /dismissWhatsNew: \(\) => \{\s*settings\.setSettings\(\{ whatsNewVersion: '' \}\);\s*return true;/);
  assert.match(pages, /handle\('pages:start:whats-new-dismiss', 'newtab', \(\) => hooks\.startPage\?\.dismissWhatsNew\?\.\(\) === true\)/);
  assert.match(preload, /dismissWhatsNew: \(\) => invoke\('pages:start:whats-new-dismiss'\)/);
  for (const key of ['lastRunVersion', 'whatsNewVersion', 'whatsNewSince', 'whatsNewPageVersion', 'whatsNewTabRelease']) {
    assert.ok(schema.internalDefaults.includes(key), key);
    assert.match(settings, new RegExp(`\\b${key}: `), key);
  }
  assert.doesNotMatch(settings.match(/const SYNCED_KEYS = \[[^\]]*\]/)[0], /lastRunVersion|whatsNew/, 'never Profile Synced');
  assert.match(html, /<span id="whatsNew" class="whats-new-pill js-whats-new" hidden>/);
  assert.match(js, /const show = !isPrivate && /, 'private tabs never show it');
  assert.match(js, /\|\| !whatsNewEl\.hidden;/, 'the Patron pill steps aside while it shows');
});
