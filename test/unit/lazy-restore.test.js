'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// createTab and the restore loop live in main.js, which cannot be required
// under node --test. Lift shipped source and assert the ordering that matters.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const createTabSource = mainSource.match(/function createTab\(url = newTabUrl\(\)[\s\S]*?\n\}/)?.[0];

test('createTab is still liftable out of main.js', () => {
  assert.ok(createTabSource, 'createTab not found — update this test with it');
});

test('createTab accepts the three lazy-restore options', () => {
  const signature = createTabSource.split('\n')[0];
  for (const opt of ['asleep = false', 'title = null', 'favicon = null']) {
    assert.ok(signature.includes(opt), `${opt} missing from createTab's options`);
  }
});

test('a quiet-born tab gets no view, and returns before anything is wired', () => {
  assert.match(createTabSource, /const bornQuiet = asleep && !adopted;/,
    'an adopted window.open child is already live and can never be born quiet');
  assert.match(createTabSource, /view: bornQuiet \? null : view,/);

  const quietReturn = createTabSource.indexOf('if (bornQuiet) {');
  const wiring = createTabSource.search(/wireTabView\(|installChromeShortcuts\(|view\.webContents/);
  assert.ok(quietReturn > 0, 'no bornQuiet early return');
  assert.ok(wiring > 0, 'no wiring call found — did this move?');
  assert.ok(quietReturn < wiring,
    'the quiet return must come first: a quiet tab has no webContents to wire or navigate');
});

test('a restored title and favicon reach the record', () => {
  assert.match(createTabSource, /title: typeof title === 'string' && title \? title : 'New Tab',/);
  assert.match(createTabSource, /favicon: validFavicon\(favicon\),/);
});

test('session restore builds quiet tabs labelled from the meta column', () => {
  const loop = mainSource.match(/const restoredIds = saved\.urls\.map\([\s\S]*?\n    \}\)\);/)?.[0];
  assert.ok(loop, 'the restore loop moved — update this test with it');
  assert.match(loop, /asleep: true,/, 'restored tabs are born quiet (spec §10)');
  assert.match(loop, /saved\.meta\?\.\[index\]\?\.title/);
  assert.match(loop, /saved\.meta\?\.\[index\]\?\.favicon/);
});

test('the restored active tab is picked without indexing into a hole', () => {
  assert.match(mainSource, /const target = restoreTargetId\(restoredIds, saved\.activeIndex\);/);
  assert.doesNotMatch(
    mainSource,
    /restoredIds\[\s*\n?\s*Math\.min\(Math\.max\(0, saved\.activeIndex\), restoredIds\.length - 1\)/,
    'createTab returns null for a url it refuses; raw indexing activates undefined'
  );
  const activate = mainSource.indexOf('setActiveTab(target, { focusContent: true });');
  const closeStartup = mainSource.indexOf('if (tabs.has(startupTabId)) closeTab(startupTabId);');
  assert.ok(activate > 0 && closeStartup > activate,
    'activate before closing startup, or closeTab wakes an extra restored tab as its replacement');
});
