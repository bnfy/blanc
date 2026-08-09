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

test('a quiet panel row is tagged "quiet" and named "quiet"', () => {
  assert.match(panelRowSource, /quiet\.className = 'row-quiet'/);
  assert.match(panelRowSource, /quiet\.textContent = 'quiet'/);
  assert.match(panelRowSource, /row\.append\(quiet\)/);
  assert.match(panelRowSource, /tab\.asleep \? 'quiet' : ''/);

  // Modelled on .row-private (always visible), never on .row-tag — which is
  // opacity:0 until hover/focus inside .tab-row.
  assert.match(styles, /\.island-row \.row-quiet\s*\{[^}]*color: var\(--text-dim\);/s);
  assert.match(styles, /\.island-row \.row-quiet\s*\{[^}]*border: 1px solid var\(--border\);/s);
  assert.doesNotMatch(styles, /\.island-row\.tab-row \.row-quiet/);
});

test('no chrome surface ever says "asleep" to a user or a screen reader', () => {
  // The field is `asleep`; every string a person receives says "quiet". The
  // single permitted literal is the pill dot's CSS class fragment.
  const ALLOWED = new Set([`' asleep'`]);
  for (const [name, source] of [
    ['renderer.js', rendererSource],
    ['overlay.js', overlaySource],
    ['vertical-tabs.js', railSource],
  ]) {
    // A template interpolation is CODE, not string content — `${t.asleep ?
    // ', quiet' : ''}` reads the field without ever showing it to anyone.
    // Strip interpolations before scanning, or this guard fires on the pill
    // dot's own accessible name.
    const prose = source.replace(/\$\{[^{}]*\}/g, '');
    const literals = prose.match(
      /'[^'\n]*asleep[^'\n]*'|`[^`\n]*asleep[^`\n]*`|"[^"\n]*asleep[^"\n]*"/g
    ) ?? [];
    assert.deepEqual(
      literals.filter((literal) => !ALLOWED.has(literal)),
      [],
      `${name} must not put "asleep" into a string`
    );
  }
});

// ---------------------------------------------------------------------------
// Rail row (vertical-tabs.js tabRow)
// ---------------------------------------------------------------------------

const railRowSource = railSource.match(
  /function tabRow\(tab, bucketTabs, activeTabId\) \{[\s\S]*?\n  \}/
)?.[0];

test('the rail tabRow could be lifted from source', () => {
  assert.ok(railRowSource, 'tabRow not found in vertical-tabs.js — update this test with it');
});

test('a quiet rail row is classed, named, and marked — and dims the favicon, not the title', () => {
  assert.match(railRowSource, /\(tab\.asleep \? ' quiet' : ''\)/);
  // The field is `asleep`; the string in the accessible name is 'quiet'.
  assert.match(railRowSource, /tab\.asleep && 'quiet'/);
  assert.match(
    railRowSource,
    /makeMarker\('vertical-tab-state vertical-tab-quiet', ICONS\.quiet, 'Quiet'\)/
  );
  assert.match(railSource, /quiet: '<svg viewBox="0 0 16 16" aria-hidden="true">/);

  assert.match(styles, /\.vertical-tab-row\.quiet \.vertical-tab-favicon\s*\{[^}]*opacity: \.45;/s);
  // Not the title: .vertical-tab-row.loading already dims it, and the title
  // span is aria-hidden — the favicon is the primary scan target.
  assert.doesNotMatch(styles, /\.vertical-tab-row\.quiet \.vertical-tab-title\s*\{/);
});

// ---------------------------------------------------------------------------
// Quick Switcher (overlay.js switcherResults / resultRow)
// ---------------------------------------------------------------------------

test('a quiet tab result says so in its sub, which switcher rows show at rest', () => {
  assert.match(
    overlaySource,
    /\[tabDomain\(t\), t\.asleep && 'quiet'\]\.filter\(Boolean\)\.join\(' · '\)/
  );
  // Switcher rows are not .tab-row, so .row-sub is not the hover-gated
  // .row-tag — that is precisely why quiet lives in the sub here.
  assert.doesNotMatch(styles, /\.island-row \.row-sub\s*\{[^}]*opacity: 0;/s);
});

test('the switcher does not add a second wake path from the renderer', () => {
  // Picking a tab result goes through switchTab -> main's setActiveTab, which
  // is the single wake choke point. There is no renderer-side wake API.
  assert.doesNotMatch(overlaySource, /wakeTab/);
  assert.match(overlaySource, /result\.kind === 'tab'\) window\.browserAPI\.switchTab\(result\.tab\.id\)/);
});
