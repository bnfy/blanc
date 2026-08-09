'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');
const rendererSource = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');
const overlaySource = fs.readFileSync(path.join(ROOT, 'src/renderer/overlay.js'), 'utf8');
const railSource = fs.readFileSync(path.join(ROOT, 'src/renderer/vertical-tabs.js'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');

// Both renderers skip rebuilding their DOM when this hand-written signature is
// unchanged. Lifting the shipping functions proves `asleep` actually crosses
// that gate; copying their logic into this test would prove nothing.
const dotsSource = rendererSource.match(/function dotsSignature\(\) \{[\s\S]*?\n  \}/)?.[0];
const railSigSource = railSource.match(/function railSignature\(payload\) \{[\s\S]*?\n  \}/)?.[0];

test('both re-render signature gates could be lifted from source', () => {
  assert.ok(dotsSource, 'dotsSignature not found in renderer.js — update this test with it');
  assert.ok(railSigSource, 'railSignature not found in vertical-tabs.js — update this test with it');
});

function runDotsSignature(shown) {
  const sandbox = {
    state: { activeTabId: 'active-tab' },
    activeGroupMembers: () => ({ shown, hidden: 0 }),
  };
  vm.runInNewContext(`${dotsSource}\nthis.__fn = dotsSignature;`, sandbox);
  return sandbox.__fn();
}

function runRailSignature(payload) {
  const sandbox = {};
  vm.runInNewContext(`${railSigSource}\nthis.__fn = railSignature;`, sandbox);
  return sandbox.__fn(payload);
}

const BACKGROUND_TAB = {
  id: 'background-tab', title: 'Docs', url: 'https://example.com/', favicon: null,
  isLoading: false, private: false, pinned: false, muted: false, audible: false,
  groupId: null, asleep: false,
};

test('the pill dot gate reacts to a tab going quiet', () => {
  const awake = runDotsSignature([{ ...BACKGROUND_TAB }]);
  const quiet = runDotsSignature([{ ...BACKGROUND_TAB, asleep: true }]);
  assert.notEqual(awake, quiet, 'dotsSignature must list asleep, or the dot row never redraws');
});

test('the rail gate reacts to a tab going quiet', () => {
  const payload = { activeTabId: 'active-tab', groups: [], tabs: [{ ...BACKGROUND_TAB }] };
  const awake = runRailSignature(payload);
  const quiet = runRailSignature({ ...payload, tabs: [{ ...BACKGROUND_TAB, asleep: true }] });
  assert.notEqual(awake, quiet, 'railSignature must list asleep, or the rail row never redraws');
});

test('a quiet pill dot shrinks to a core, borrowing neither opacity nor the private treatment', () => {
  assert.match(styles, /\.island-dot\.asleep:not\(\.private\)\s*\{[^}]*background: transparent;/s);
  assert.match(styles, /\.island-dot\.asleep:not\(\.private\)::after\s*\{[^}]*inset: 1\.25px;/s);
  assert.match(styles, /\.island-dot\.asleep:not\(\.private\)::after\s*\{[^}]*background: var\(--border\);/s);
  // ::before is the invisible hit halo; the quiet core must not take it.
  assert.doesNotMatch(styles, /\.island-dot\.asleep[^{]*::before/);
  assert.doesNotMatch(styles, /\.island-dot\.asleep[^{]*\{[^}]*opacity/s);
  assert.doesNotMatch(styles, /--sleep-dim/);
});

test('the pill dot marks quiet in its class and in its accessible name', () => {
  assert.match(rendererSource, /\(t\.asleep \? ' asleep' : ''\)/);
  assert.match(
    rendererSource,
    /aria-label',\s*`Switch to \$\{t\.title \|\| 'New Tab'\}\$\{t\.asleep \? ', quiet' : ''\}`/
  );
});

const panelRowSource = overlaySource.match(/function tabRow\(tab\) \{[\s\S]*?\n  \}/)?.[0];

test('the panel tabRow could be lifted from source', () => {
  assert.ok(panelRowSource, 'tabRow not found in overlay.js — update this test with it');
});

test('a panel tab row is a labelled group with a primary button beside its actions', () => {
  assert.match(panelRowSource, /row\.setAttribute\('role', 'group'\)/);
  assert.match(panelRowSource, /row\.setAttribute\('aria-label', label\)/);
  assert.doesNotMatch(panelRowSource, /'role', '(option|button)'/);
  assert.match(panelRowSource, /primary\.className = 'row-primary'/);
  assert.match(panelRowSource, /primary\.append\(faviconWrap, title\)/);
  assert.match(panelRowSource, /row\.append\(primary\)/);
  assert.match(panelRowSource, /row\.append\(pin\)/);
  assert.match(panelRowSource, /row\.append\(grp\)/);
  assert.match(panelRowSource, /row\.append\(close\)/);
  assert.match(panelRowSource, /if \(e\.target\.closest\('button'\)\) return;/);
});

test('the row primary button carries the row layout', () => {
  assert.match(styles, /\.island-row \.row-primary\s*\{[^}]*display: flex;/s);
  assert.match(styles, /\.island-row \.row-primary\s*\{[^}]*flex: 1 1 auto;/s);
  assert.match(styles, /\.island-row \.row-primary\s*\{[^}]*min-width: 0;/s);
});
