const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const packageJson = require('../../package.json');

const {
  ABOUT_APPLICATION_NAME,
  ABOUT_COPYRIGHT,
  ABOUT_WEBSITE,
  aboutPanelOptions,
  chromiumLine,
  showAboutPanel,
} = require('../../src/main/about-panel');
const { englishT: t } = require('../support/english-t');

const VERSIONS = { chrome: '152.0.7977.167', electron: '44.8.0' };

test('about panel names the running Chromium version', () => {
  assert.equal(chromiumLine({ t, versions: VERSIONS }), 'Chromium 152.0.7977.167');
});

test('macOS keeps its bundle name, version (build) and copyright and adds only the engine line', () => {
  const options = aboutPanelOptions({ app: { getVersion: () => '1.35.0' }, t, platform: 'darwin', versions: VERSIONS });

  // Absent keys fall back to Info.plist, which renders "Version 1.35.0 (1350)".
  assert.deepEqual(options, { credits: 'Chromium 152.0.7977.167' });
});

test('Windows about panel metadata comes from the running Blanc build', () => {
  const options = aboutPanelOptions({ app: { getVersion: () => '1.0.2-dev.3' }, t, platform: 'win32', versions: VERSIONS });

  assert.deepEqual(options, {
    applicationName: ABOUT_APPLICATION_NAME,
    applicationVersion: '1.0.2-dev.3',
    copyright: ABOUT_COPYRIGHT,
    credits: 'Independent browser by Bananify.\nChromium 152.0.7977.167',
    authors: ['Bananify'],
    website: ABOUT_WEBSITE,
    iconPath: path.join(__dirname, '../../src/renderer/pages/icon-sunrise.png'),
  });
});

test('Linux puts the engine line under the version, since GTK has no credits field', () => {
  const options = aboutPanelOptions({ app: { getVersion: () => '1.35.0' }, t, platform: 'linux', versions: VERSIONS });

  assert.equal(options.applicationVersion, '1.35.0\nChromium 152.0.7977.167');
  assert.equal(options.credits, 'Independent browser by Bananify.');
  assert.equal(options.website, ABOUT_WEBSITE);
});

test('showAboutPanel configures metadata before opening the native dialog', () => {
  const calls = [];
  const app = {
    getVersion: () => '1.0.2',
    setAboutPanelOptions: (options) => calls.push(['options', options]),
    showAboutPanel: () => calls.push(['show']),
  };

  showAboutPanel({ app, iconPath: '/tmp/blanc-about.png', t, platform: 'win32', versions: VERSIONS });

  assert.equal(calls[0][0], 'options');
  assert.equal(calls[0][1].applicationVersion, '1.0.2');
  assert.equal(calls[0][1].iconPath, '/tmp/blanc-about.png');
  assert.match(calls[0][1].credits, /Chromium 152\.0\.7977\.167$/);
  assert.deepEqual(calls[1], ['show']);
});

test('every platform opens About through showAboutPanel so the engine line is always set', () => {
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  // A bare `role: 'about'` on macOS would open the panel without these options.
  assert.doesNotMatch(main, /role: 'about'/);
  assert.equal((main.match(/label: t\('menu\.app\.about', \{ app: app\.name \}\), click: bound\(\(\) => showAboutPanel\(\{ app, t \}\)\)/g) ?? []).length, 2);
});

test('the macOS bundle build number is distinct from the user-facing version', () => {
  const bundleVersion = packageJson.build?.mac?.bundleVersion;
  assert.match(bundleVersion, /^\d+(?:\.\d+){0,2}$/);
  assert.notEqual(bundleVersion, packageJson.version);
});
