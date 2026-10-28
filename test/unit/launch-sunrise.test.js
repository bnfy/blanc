'use strict';

// Play the Sunrise when Blanc opens (#1179).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LAUNCH_SUNRISE_WINDOW_MS, createLaunchSunrise } = require('../../src/main/launch-sunrise');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
const page = { enabled: true, private: false, visible: true };
const as = (overrides = {}) => () => ({ ...page, ...overrides });

test('the Sunrise plays for one Start Page per launch, only when turned on', () => {
  const off = createLaunchSunrise({ startedAt: 0 });
  assert.equal(off.take(100, as({ enabled: false })), false);
  assert.equal(off.take(200, as()), true, 'turning it on before the first page still plays it');

  const sunrise = createLaunchSunrise({ startedAt: 0 });
  assert.equal(sunrise.take(1000, as()), true);
  assert.equal(sunrise.take(2000, as()), false, 'never twice in one launch');
});

test('a private or hidden Start Page leaves it for the next one', () => {
  const sunrise = createLaunchSunrise({ startedAt: 0 });
  assert.equal(sunrise.take(100, as({ private: true })), false);
  assert.equal(sunrise.take(200, as({ visible: false })), false);
  assert.equal(sunrise.take(300, as()), true);
});

test('once spent, or after the launch window, it never describes the page again', () => {
  let described = 0;
  const counting = () => { described += 1; return page; };
  const sunrise = createLaunchSunrise({ startedAt: 0 });
  assert.equal(sunrise.take(100, counting), true);
  assert.equal(sunrise.take(200, counting), false);
  assert.equal(described, 1, 'later Start Pages cost nothing');

  const late = createLaunchSunrise({ startedAt: 0 });
  assert.equal(late.take(LAUNCH_SUNRISE_WINDOW_MS + 1, counting), false);
  assert.equal(described, 1);
  late.rearm(LAUNCH_SUNRISE_WINDOW_MS * 2);
  assert.equal(late.take(LAUNCH_SUNRISE_WINDOW_MS * 2 + 10, as()), true, 'the test hook starts a fresh launch');
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
  // Only a page's first data request may take it, so a refresh (the clock's
  // retry) can't spend it without playing.
  assert.match(main, /launchSunriseFor: \(wc\) => \{\s*if \(launchSunriseAsked\.has\(wc\.id\)\) return false;\s*launchSunriseAsked\.add\(wc\.id\);\s*return launchSunrise\.take\(Date\.now\(\), \(\) => \(\{\s*enabled: settings\.getSettings\(\)\.launchSunrise === true,\s*private: startPageSenderIsPrivate\(wc\),\s*visible: startPageViewVisible\(/);
  assert.match(pages, /launchSunrise: hooks\.startPage\?\.launchSunriseFor\?\.\(event\.sender\) === true,/);

  // After the first layout paint; reduced motion removes it unplayed.
  assert.match(newtab, /applyLayout\(state\.layout\);[\s\S]*?requestAnimationFrame\(\(\) => \{\s*document\.body\.classList\.add\('layout-ready'\);\s*if \(launchSunriseDue\) playLaunchSunrise\(\);\s*else document\.getElementById\('launchSunrise'\)\?\.remove\(\);/);
  assert.match(newtab, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\) \{\s*scene\?\.remove\(\);/);
  // Any key or click ends it; it removes itself when its own fade ends.
  assert.match(newtab, /addEventListener\('keydown', end, true\);\s*addEventListener\('pointerdown', end, true\);/);
  assert.match(newtab, /scene\.addEventListener\('animationend', \(event\) => \{ if \(event\.target === scene\) end\(\); \}\);/);

  // It never takes input, and reduced motion hides it in CSS too.
  assert.match(css, /\.launch-sunrise \{[^}]*position: fixed;[^}]*pointer-events: none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.launch-sunrise \{ display: none; \}/);
  // The sky opens and ends transparent, on the page itself, wallpaper
  // included; the mark has faded before it clears.
  assert.match(css, /@keyframes launch-sunrise-sky \{ 0% \{ background-color: rgb\(11 10 9 \/ 0\); \}[^\n]*100% \{ background-color: rgb\(248 242 232 \/ 0\); \} \}/);
  assert.match(css, /@keyframes launch-sunrise-mark \{[^\n]*90%, 100% \{ transform: none; opacity: 0; \} \}/);
});

test('it is drawn from the app\'s own Sunrise mark, never the website\'s files or font', () => {
  const html = read('src/renderer/pages/newtab.html');
  const scene = html.match(/<div id="launchSunrise"[\s\S]*?\n {2}<\/div>/)[0];
  assert.equal(scene.match(/src="sunrise-mark\.png"/g).length, 4);
  assert.match(scene, /aria-hidden="true" hidden/);
  assert.doesNotMatch(scene + read('src/renderer/pages/pages.css'), /Blubird|lockup\//);
});
