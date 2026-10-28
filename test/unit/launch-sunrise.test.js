'use strict';

// Play the Sunrise when Blanc opens (#1179).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LAUNCH_SUNRISE_WINDOW_MS, createLaunchSunrise } = require('../../src/main/launch-sunrise');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
const page = { enabled: true, private: false, visible: true };

test('the Sunrise plays for one Start Page per launch, only when turned on', () => {
  const off = createLaunchSunrise({ startedAt: 0 });
  assert.equal(off.take({ ...page, enabled: false, now: 100 }), false);
  assert.equal(off.take({ ...page, now: 200 }), true, 'turning it on before the first page still plays it');

  const sunrise = createLaunchSunrise({ startedAt: 0 });
  assert.equal(sunrise.take({ ...page, now: 1000 }), true);
  assert.equal(sunrise.take({ ...page, now: 2000 }), false, 'never twice in one launch');
});

test('a private or hidden Start Page leaves it for the next one', () => {
  const sunrise = createLaunchSunrise({ startedAt: 0 });
  assert.equal(sunrise.take({ ...page, private: true, now: 100 }), false);
  assert.equal(sunrise.take({ ...page, visible: false, now: 200 }), false);
  assert.equal(sunrise.take({ ...page, now: 300 }), true);
});

test('a Start Page opened after the launch window never plays it', () => {
  const sunrise = createLaunchSunrise({ startedAt: 0 });
  assert.equal(sunrise.take({ ...page, now: LAUNCH_SUNRISE_WINDOW_MS + 1 }), false);
  sunrise.rearm(LAUNCH_SUNRISE_WINDOW_MS * 2);
  assert.equal(sunrise.take({ ...page, now: LAUNCH_SUNRISE_WINDOW_MS * 2 + 10 }), true, 'the test hook starts a fresh launch');
  assert.equal(LAUNCH_SUNRISE_WINDOW_MS, 30_000);
});

test('the setting is device-local, off by default and saved only as a boolean', () => {
  const settings = read('src/main/settings.js');
  assert.match(settings, /\n  launchSunrise: false,\n/);
  assert.match(settings, /if \(typeof partial\.launchSunrise === 'boolean'\) clean\.launchSunrise = partial\.launchSunrise;/);
  const synced = settings.match(/const SYNCED_KEYS = \[([^\]]*)\]/)[1];
  assert.doesNotMatch(synced, /launchSunrise/);
  assert.ok(JSON.parse(read('settings-schema/schema.json')).internalDefaults.includes('launchSunrise'));
});

test('main decides per Start Page, and the page plays it over the drawn layout', () => {
  const main = read('src/main/main.js');
  const pages = read('src/main/pages.js');
  const newtab = read('src/renderer/pages/newtab.js');
  const css = read('src/renderer/pages/pages.css');

  assert.match(main, /const launchSunrise = createLaunchSunrise\(\{ startedAt: Date\.now\(\) \}\);/);
  assert.match(main, /launchSunriseFor: \(wc\) => \{[\s\S]*?enabled: settings\.getSettings\(\)\.launchSunrise === true,\s*private: !!tab\?\.private,\s*visible: startPageViewVisible\(tab\),/);
  assert.match(pages, /launchSunrise: hooks\.startPage\?\.launchSunriseFor\?\.\(event\.sender\) === true,/);

  // After the first layout paint; reduced motion removes it unplayed.
  assert.match(newtab, /applyLayout\(state\.layout\);[\s\S]*?if \(launchSunriseDue\) playLaunchSunrise\(\);\s*else document\.getElementById\('launchSunrise'\)\?\.remove\(\);/);
  assert.match(newtab, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\) \{\s*scene\?\.remove\(\);/);
  // Any key or click ends it; it removes itself when its own fade ends.
  assert.match(newtab, /addEventListener\('keydown', end, true\);\s*addEventListener\('pointerdown', end, true\);/);
  assert.match(newtab, /scene\.addEventListener\('animationend', \(event\) => \{ if \(event\.target === scene\) end\(\); \}\);/);

  // It never takes input, and reduced motion hides it in CSS too.
  assert.match(css, /\.launch-sunrise \{[^}]*position: fixed;[^}]*pointer-events: none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.launch-sunrise \{ display: none; \}/);
  // The sky ends on the page's own background.
  assert.match(css, /@keyframes launch-sunrise-sky \{[^\n]*72%, 100% \{ background-color: var\(--bg\); \}/);
});

test('it is drawn from the app\'s own Sunrise mark, never the website\'s files or font', () => {
  const html = read('src/renderer/pages/newtab.html');
  const scene = html.match(/<div id="launchSunrise"[\s\S]*?\n {2}<\/div>/)[0];
  assert.equal(scene.match(/src="sunrise-mark\.png"/g).length, 4);
  assert.match(scene, /aria-hidden="true" hidden/);
  assert.doesNotMatch(scene + read('src/renderer/pages/pages.css'), /Blubird|lockup\//);
});
