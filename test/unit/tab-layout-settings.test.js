const assert = require('node:assert/strict');
const { withoutInterfaceKeys } = require('../support/without-interface-keys');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { waitForJson } = require('./support/wait-for-json');

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

  await waitForJson(path.join(userData, 'settings.json'), (json) => json.tabLayout === 'vertical' && json.verticalTabsWidth === 320);
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

test('vertical tab text size validates, persists, and stays local', async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-tab-text-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  let settings = loadSettings(userData);
  assert.equal(settings.getSettings().verticalTabsTextSize, 'default');
  assert.equal(settingsSchema.internalDefaults.includes('verticalTabsTextSize'), true);
  for (const size of ['large', 'extra-large', 'default', 'extra-large']) {
    assert.equal(settings.setSettings({ verticalTabsTextSize: size }).verticalTabsTextSize, size);
  }
  for (const invalid of ['huge', '', null, 18, {}, ['large']]) {
    assert.equal(settings.setSettings({ verticalTabsTextSize: invalid }).verticalTabsTextSize, 'extra-large');
  }
  assert.equal(Object.hasOwn(settings.exportForSync().values, 'verticalTabsTextSize'), false);
  assert.equal(Object.hasOwn(settings.getSettings()._syncMeta, 'verticalTabsTextSize'), false);
  settings.mergeFromSync({
    values: { verticalTabsTextSize: 'large' },
    meta: { verticalTabsTextSize: Date.now() + 10_000 },
  });
  assert.equal(settings.getSettings().verticalTabsTextSize, 'extra-large');
  await waitForJson(path.join(userData, 'settings.json'), (json) => json.verticalTabsTextSize === 'extra-large');
  settings = loadSettings(userData);
  assert.equal(settings.getSettings().verticalTabsTextSize, 'extra-large');
  const saved = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
  saved.verticalTabsTextSize = 'invalid';
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify(saved));
  assert.equal(loadSettings(userData).getSettings().verticalTabsTextSize, 'default');
});

test('settings page presents the two tab layouts as an Appearance choice', () => {
  const html = withoutInterfaceKeys(fs.readFileSync(
    path.join(__dirname, '../../src/renderer/pages/settings.html'),
    'utf8'
  ));
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
    /id="verticalTabsUseIsland"[\s\S]*data-tooltip="Turn vertical tabs off"[\s\S]*aria-label="Turn vertical tabs off"/
  );
  assert.match(html, /class="vertical-tabs-layout-icon"/);
  assert.doesNotMatch(html, /vertical-tabs-heading|<span>Island<\/span>/);
  // The toggle keeps the row's far end; the Space mark (and on Windows and
  // Linux the main-menu button) lead it.
  assert.match(styles, /\.vertical-tabs-toolbar \.vertical-tabs-layout-button \{ margin-left: auto; \}/);
  assert.doesNotMatch(styles, /\.vertical-tabs-toolbar\s*\{[^}]*border-bottom:/s);
  assert.doesNotMatch(styles, /\.vertical-tabs-group-rule\s*\{/);
  assert.doesNotMatch(renderer, /vertical-tabs-group-rule/);
  assert.match(
    renderer,
    /useIslandButton\.addEventListener\('click'[\s\S]*api\.setTabLayout\('island'\)/
  );
});

test('vertical rail text uses the UI copy face without JetBrains Mono overrides', () => {
  const styles = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/styles.css'),
    'utf8'
  );
  const railStart = styles.indexOf('.vertical-tabs-rail {');
  const railEnd = styles.indexOf('.sr-only {', railStart);
  assert.ok(railStart >= 0 && railEnd > railStart, 'vertical rail CSS range must exist');
  const railStyles = styles.slice(railStart, railEnd);

  assert.match(railStyles, /\.vertical-tabs-rail\s*\{[^}]*font-family: var\(--font-text\);/s);
  assert.doesNotMatch(railStyles, /font-family:\s*var\(--font-mono\)/);
});

test('native menu binds a mnemonic vertical-tabs toggle without taking paste shortcuts', () => {
  const main = fs.readFileSync(
    path.join(__dirname, '../../src/main/main.js'),
    'utf8'
  );

  assert.match(main, /label: t\('menu\.toggleVerticalTabs'\),\s+accelerator: 'CmdOrCtrl\+Alt\+V'/);
  assert.match(main, /tabLayout === 'vertical' \? 'island' : 'vertical'/);
  assert.doesNotMatch(main, /menu\.toggleVerticalTabs'\)[^}]+CmdOrCtrl\+(?:Shift\+)?V'/s);
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

test('the rail\'s first row holds the Space mark and its footer starts a new group (#1178)', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
  const html = read('src/renderer/index.html');
  const rail = read('src/renderer/vertical-tabs.js');
  const renderer = read('src/renderer/renderer.js');
  const styles = read('src/renderer/styles.css');
  const main = read('src/main/main.js');

  // The Island's own mark moves (one copy, one set of handlers), on every path
  // that sets the layout, ahead of the layout toggle; it goes back where it was.
  assert.match(rail, /function placeSpaceMark\(layout\) \{[\s\S]*?const moved = layout === 'vertical'\s*\? moveKeepingFocus\(spaceMark, useIslandButton\.parentElement, useIslandButton\)\s*: moveKeepingFocus\(spaceMark, spaceMarkHome\.parent,[\s\S]*?if \(moved\) window\.blancSpaceMark\?\.placed\(\);/);
  assert.equal(rail.match(/placeSpaceMark\((?:'island'|layout)\);/g)?.length, 2);
  // Hidden with no Spaces, and the Island's has-space look, apply only on the Island.
  assert.match(renderer, /pillSpace\.hidden = state === 'none' && spaceMarkOnIsland\(\);\s*islandPill\.classList\.toggle\('has-space', state === 'space' && spaceMarkOnIsland\(\)\);/);
  assert.match(renderer, /if \(spaceMarkOnIsland\(\)\) \{[\s\S]*?pillDots/);
  // The Spaces menu hangs below both the mark and the Island, never over it.
  assert.match(renderer, /const bottom = Math\.max\(stageRect\(pillSpace\)\.bottom, stageRect\(islandPill\)\.bottom\);/);
  // With no Spaces yet the rail shows the Spaces glyph, like the neutral mark,
  // and a right-click on the rail's mark opens its menu.
  assert.match(styles, /\.space-mark:is\(\[data-state="neutral"\], \.vertical-tabs-toolbar \[data-state="none"\]\) \{/);
  assert.match(styles, /\.vertical-tabs-toolbar #pillSpace:focus-visible \{[^}]*outline: 2px solid var\(--accent\);/);
  assert.match(renderer, /const railSpaceMark = e\.target\.closest\('\.vertical-tabs-toolbar #pillSpace'\);\s*if \(railSpaceMark\) \{\s*e\.preventDefault\(\);\s*railSpaceMark\.click\(\);\s*return;\s*\}/);

  // New group sits beside New tab, named and described for screen readers.
  assert.match(html, /id="verticalTabsNew"[\s\S]*?<\/button>\s*<button\s+id="verticalTabsNewGroup"[\s\S]*?data-i18n-aria-label="rail\.newGroup"/);
  assert.match(rail, /newGroupButton\?\.addEventListener\('click', \(\) => \{\s*invokeLeavingRail\('start a new group', \(\) => api\.beginNewGroup\(\)\);/);
  // It runs the tab menu's New Group… behind one gate (newGroupTarget): the
  // selection when several tabs are selected and batchCanPlace allows (the
  // tab menu's canPlace and the batch actions use the same helper), else the
  // active tab; never while the window closes or switches Space.
  assert.match(main, /function batchCanPlace\(owner, ids\) \{\s*return ids\.every\(id => canMoveTabToSpace\(tabs\.get\(id\), owner, true\)\);/);
  assert.match(main, /function newGroupTarget\(runtime\) \{\s*if \(runtime\.closing \|\| runtime\.workspaceTransition\) return null;[\s\S]*?if \(ids\.length > 1\) return batchCanPlace\(runtime, ids\)/);
  assert.match(main, /const place = batchCanPlace\(source, ids\);/);
  assert.match(main, /canPlace: batchCanPlace\(owner, ids\),/);
  // The click prunes the selection; one that changed under it is shown first
  // instead of acted on.
  assert.match(main, /chromeOn\('chrome:new-group', \(\) => \{\s*const runtime = rt\(\);\s*const before = runtime\.selectedTabIds \?\? \[\];\s*Object\.assign\(runtime, pruneSelection\(runtime, tabLayoutList\(runtime\)\)\);[\s\S]*?if \(before\.length > 1 && JSON\.stringify\(before\) !== JSON\.stringify\(runtime\.selectedTabIds \?\? \[\]\)\) \{\s*broadcastTabs\(\);\s*return;\s*\}\s*const target = newGroupTarget\(runtime\);\s*if \(target\?\.ids\) \{\s*runTabsAction\('batch-group-new', \{\}, target\.ids\)\s*\.catch\(/);
  // Both tab payloads carry the gate's answer, from a pruned selection.
  assert.equal(main.match(/canStartGroup: !!newGroupTarget\((?:runtime|rt\(\))\),/g)?.length, 2, 'both tab payloads carry the gate');
  assert.match(main, /chromeHandle\('tabs:get-all', \(\) => \(syncTabLayout\(rt\(\)\),\s*Object\.assign\(rt\(\), pruneSelection\(rt\(\), tabLayoutList\(rt\(\)\)\)\), \{/);
  // Its label names what it acts on; unavailable is display only (the click
  // always asks main) and attributes are written only when they change.
  assert.match(rail, /blancI18n\.t\(\(payload\.selectedTabIds\?\.length \?\? 0\) > 1 \? 'rail\.newGroupSelection' : 'rail\.newGroup'\)/);
  assert.match(rail, /if \(newGroupButton\.dataset\.tooltip !== label\) newGroupButton\.dataset\.tooltip = label;/);
  assert.match(rail, /if \(newGroupButton\.getAttribute\('aria-disabled'\) !== unavailable\) newGroupButton\.setAttribute\('aria-disabled', unavailable\);/);
  assert.doesNotMatch(rail, /getAttribute\('aria-disabled'\) === 'true'\) return/);
  assert.doesNotMatch(rail, /newGroupButton\.disabled/);
  // The drag-deferral comment stays on render().
  assert.match(rail, /rendered exactly once when the drag ends\.\n  function render\(payload = \{\}\) \{/);
});
