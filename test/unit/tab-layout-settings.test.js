const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsSchema = require('../../settings-schema/schema.json');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    app: {
      getPath: () => activeUserData,
      on: () => {},
    },
  },
};

function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  return require('../../src/main/settings');
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

test('tab layout and rail width default, validate, persist, and stay out of Profile Sync', async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-tab-layout-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));

  let settings = loadSettings(userData);
  assert.deepEqual(settings.TAB_LAYOUTS, ['island', 'vertical']);
  assert.deepEqual(settingsSchema.tabLayouts, settings.TAB_LAYOUTS);
  assert.equal(settingsSchema.internalDefaults.includes('tabLayout'), true);
  assert.equal(settingsSchema.internalDefaults.includes('verticalTabsWidth'), true);
  assert.equal(settings.getSettings().tabLayout, 'island');
  assert.equal(settings.getSettings().verticalTabsWidth, 248);

  let current = settings.setSettings({ tabLayout: 'vertical', verticalTabsWidth: 319.6 });
  assert.equal(current.tabLayout, 'vertical');
  assert.equal(current.verticalTabsWidth, 320);
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'tabLayout'),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'verticalTabsWidth'),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.getSettings()._syncMeta, 'tabLayout'),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.getSettings()._syncMeta, 'verticalTabsWidth'),
    false
  );

  settings.mergeFromSync({
    values: { tabLayout: 'island', verticalTabsWidth: 200 },
    meta: { tabLayout: Date.now() + 10_000, verticalTabsWidth: Date.now() + 10_000 },
  });
  assert.equal(settings.getSettings().tabLayout, 'vertical');
  assert.equal(settings.getSettings().verticalTabsWidth, 320);
  assert.equal(settings.setSettings({ tabLayout: 'diagonal' }).tabLayout, 'vertical');
  assert.equal(settings.setSettings({ verticalTabsWidth: 'wide' }).verticalTabsWidth, 320);
  assert.equal(settings.setSettings({ verticalTabsWidth: 100 }).verticalTabsWidth, 200);
  assert.equal(settings.setSettings({ verticalTabsWidth: 999 }).verticalTabsWidth, 360);
  assert.equal(settings.setSettings({ verticalTabsWidth: 320 }).verticalTabsWidth, 320);

  await new Promise((resolve) => setTimeout(resolve, 300));
  settings = loadSettings(userData);
  assert.equal(settings.getSettings().tabLayout, 'vertical');
  assert.equal(settings.getSettings().verticalTabsWidth, 320);

  fs.writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify({
      onboardingVersion: 1,
      tabLayout: 'diagonal',
      verticalTabsWidth: 'not-a-number',
    })
  );
  settings = loadSettings(userData);
  assert.equal(settings.getSettings().tabLayout, 'island');
  assert.equal(settings.getSettings().verticalTabsWidth, 248);
});

test('settings page presents the two tab layouts as an Appearance choice', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/pages/settings.html'),
    'utf8'
  );
  const renderer = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/pages/settings.js'),
    'utf8'
  );

  assert.match(html, /<span>Tab layout<\/span>/);
  assert.match(html, /<option value="island">Island<\/option>/);
  assert.match(html, /<option value="vertical">Vertical tabs<\/option>/);
  assert.match(html, /search and commands always stay in the Island/);
  assert.match(renderer, /settings\.set\(\{ tabLayout: tabLayout\.value \}\)/);
});

test('expanded Island exposes an accessible canonical tab-layout toggle', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/overlay.html'),
    'utf8'
  );
  const renderer = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/overlay.js'),
    'utf8'
  );
  const preload = fs.readFileSync(
    path.join(__dirname, '../../src/main/preload.js'),
    'utf8'
  );

  assert.match(html, /id="footerTabLayout"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(renderer, /state\.tabLayout === 'vertical'/);
  assert.match(renderer, /window\.browserAPI\.setTabLayout\(nextLayout\)/);
  assert.match(preload, /setTabLayout: \(layout\) => ipcRenderer\.invoke\('chrome:set-tab-layout', layout\)/);
});

test('vertical rail top chrome is reduced to an accessible sidebar toggle', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/index.html'),
    'utf8'
  );
  const styles = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/styles.css'),
    'utf8'
  );
  const renderer = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/vertical-tabs.js'),
    'utf8'
  );

  assert.match(
    html,
    /id="verticalTabsUseIsland"[\s\S]*title="Turn vertical tabs off"[\s\S]*aria-label="Turn vertical tabs off"/
  );
  assert.match(html, /class="vertical-tabs-layout-icon"/);
  assert.doesNotMatch(html, /vertical-tabs-heading|<span>Island<\/span>/);
  assert.match(styles, /\.vertical-tabs-toolbar\s*\{[^}]*justify-content: flex-end;/s);
  assert.doesNotMatch(styles, /\.vertical-tabs-toolbar\s*\{[^}]*border-bottom:/s);
  assert.doesNotMatch(styles, /\.vertical-tabs-group-rule\s*\{/);
  assert.doesNotMatch(renderer, /vertical-tabs-group-rule/);
  assert.match(
    renderer,
    /useIslandButton\.addEventListener\('click'[\s\S]*api\.setTabLayout\('island'\)/
  );
});

test('native menu binds a mnemonic vertical-tabs toggle without taking paste shortcuts', () => {
  const main = fs.readFileSync(
    path.join(__dirname, '../../src/main/main.js'),
    'utf8'
  );

  assert.match(main, /label: 'Toggle Vertical Tabs',\s+accelerator: 'CmdOrCtrl\+Alt\+V'/);
  assert.match(main, /tabLayout === 'vertical' \? 'island' : 'vertical'/);
  assert.doesNotMatch(main, /Toggle Vertical Tabs'[^}]+CmdOrCtrl\+(?:Shift\+)?V'/s);
});

test('vertical rail depth fade is inset, theme-aware, and cannot intercept page input', () => {
  const styles = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/styles.css'),
    'utf8'
  );

  assert.match(styles, /\.vertical-tabs-rail\s*\{[^}]*border-right: none;/s);
  assert.match(styles, /\.vertical-tabs-rail::after\s*\{[^}]*width: 20px;/s);
  assert.match(styles, /\.vertical-tabs-rail::after\s*\{[^}]*pointer-events: none;/s);
  assert.match(styles, /rgba\(0, 0, 0, 0\.058\) 100%/);
  assert.match(styles, /prefers-color-scheme: dark[\s\S]*rgba\(0, 0, 0, 0\.22\) 100%/);
  assert.match(styles, /data-theme="private"[\s\S]*rgba\(0, 0, 0, 0\.28\) 100%/);
});

test('vertical rail exposes a constrained, accessible, persisted resize handle', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/index.html'),
    'utf8'
  );
  const styles = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/styles.css'),
    'utf8'
  );
  const renderer = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/vertical-tabs.js'),
    'utf8'
  );
  const preload = fs.readFileSync(
    path.join(__dirname, '../../src/main/preload.js'),
    'utf8'
  );
  const main = fs.readFileSync(
    path.join(__dirname, '../../src/main/main.js'),
    'utf8'
  );

  assert.match(html, /id="verticalTabsResizeHandle"[\s\S]*role="separator"/);
  assert.match(html, /aria-orientation="vertical"/);
  assert.match(html, /aria-valuemin="200"[\s\S]*aria-valuemax="360"[\s\S]*aria-valuenow="248"/);
  assert.match(styles, /\.vertical-tabs-resize-handle\s*\{[^}]*width: 8px;[^}]*cursor: col-resize;[^}]*touch-action: none;/s);
  assert.match(renderer, /setPointerCapture\(event\.pointerId\)/);
  assert.match(renderer, /requestAnimationFrame\(\(\) => \{[\s\S]*previewVerticalTabsWidth\(queued\)/);
  assert.match(renderer, /setVerticalTabsWidth\(width\)/);
  assert.match(renderer, /addEventListener\('dblclick'/);
  assert.match(renderer, /event\.key === 'ArrowLeft'/);
  assert.match(renderer, /event\.key === 'ArrowRight'/);
  assert.match(renderer, /event\.key === 'Home'/);
  assert.match(renderer, /event\.key === 'End'/);
  assert.match(preload, /chrome:preview-vertical-tabs-width/);
  assert.match(preload, /chrome:set-vertical-tabs-width/);
  assert.match(preload, /chrome:vertical-tabs-width/);
  assert.match(main, /settings\.setSettings\(\{ verticalTabsWidth: next \}\)/);
});

test('vertical rail scrolls only measured-overflow titles on direct hover', () => {
  const styles = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/styles.css'),
    'utf8'
  );
  const renderer = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/vertical-tabs.js'),
    'utf8'
  );

  assert.match(renderer, /titleText\.className = 'vertical-tab-title-text'/);
  assert.match(renderer, /text\.scrollWidth - viewport\.clientWidth/);
  assert.match(renderer, /if \(overflow <= 1\) return/);
  assert.match(renderer, /titleEl\.addEventListener\('pointerenter'/);
  assert.match(renderer, /titleEl\.addEventListener\('pointerleave'/);
  assert.match(renderer, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.vertical-tab-title\.scrolling \.vertical-tab-title-text\s*\{[\s\S]*transform: translateX\(var\(--vertical-tab-title-offset\)\);/);
  assert.match(styles, /pointer-events: none;[\s\S]*text-overflow: ellipsis;/);
  assert.match(styles, /transform var\(--vertical-tab-title-duration\) linear 600ms/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*\.vertical-tab-title\.scrolling \.vertical-tab-title-text[\s\S]*text-overflow: ellipsis;[\s\S]*transition: none;/);
});
