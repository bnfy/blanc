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
const glyphPath = path.join(ROOT, 'src/renderer/quiet-glyph.js');
const glyphExists = fs.existsSync(glyphPath);
const glyphSource = glyphExists ? fs.readFileSync(glyphPath, 'utf8') : '';
const indexHtml = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
const overlayHtml = fs.readFileSync(path.join(ROOT, 'src/renderer/overlay.html'), 'utf8');

// Both renderers skip rebuilding their DOM when this hand-written signature is
// unchanged. Lifting the shipping functions proves `asleep` actually crosses
// that gate; copying their logic into this test would prove nothing.
const dotsSource = rendererSource.match(/function dotsSignature\(\) \{[\s\S]*?\n  \}/)?.[0];
const railSigSource = railSource.match(/function railSignature\(payload\) \{[\s\S]*?\n  \}/)?.[0];

test('both re-render signature gates could be lifted from source', () => {
  assert.ok(dotsSource, 'dotsSignature not found in renderer.js — update this test with it');
  assert.ok(railSigSource, 'railSignature not found in vertical-tabs.js — update this test with it');
});

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

test('the rail gate reacts to a tab going quiet', () => {
  const payload = { activeTabId: 'active-tab', groups: [], tabs: [{ ...BACKGROUND_TAB }] };
  const awake = runRailSignature(payload);
  const quiet = runRailSignature({ ...payload, tabs: [{ ...BACKGROUND_TAB, asleep: true }] });
  assert.notEqual(awake, quiet, 'railSignature must list asleep, or the rail row never redraws');
});

test('the pill dots carry no quiet treatment — quiet lives on the Zzz + dimmed favicon', () => {
  // Removed deliberately: the dot is a switch target, not a status field.
  assert.doesNotMatch(styles, /\.island-dot\.asleep/);
  assert.doesNotMatch(rendererSource, /' asleep'/);
  // The dot's accessible name is just the switch target; no quiet mention.
  assert.match(rendererSource, /aria-label',\s*`Switch to \$\{t\.title \|\| 'New Tab'\}`/);
  assert.doesNotMatch(rendererSource, /Switch to[^`]*quiet/);
  // dotsSignature no longer tracks asleep, so the dot row never redraws for it.
  assert.doesNotMatch(dotsSource, /asleep/);
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

test('a quiet panel row carries the glyph and is named "quiet"', () => {
  assert.match(panelRowSource, /quiet\.className = 'row-quiet'/);
  assert.match(panelRowSource, /quiet\.innerHTML = window\.QUIET_GLYPH_SVG/);
  assert.match(panelRowSource, /row\.append\(quiet\)/);
  assert.match(panelRowSource, /tab\.asleep \? 'quiet' : ''/);

  // Modelled on .row-private (always visible), never on .row-tag — which is
  // opacity:0 until hover/focus inside .tab-row.
  assert.doesNotMatch(styles, /\.island-row\.tab-row \.row-quiet/);
});

test('no chrome surface ever says "asleep" to a user or a screen reader', () => {
  // The field is `asleep`; every string a person receives says "quiet". Now that
  // the pill dot's `' asleep'` class fragment is gone, NO literal is permitted.
  const ALLOWED = new Set();
  for (const [name, source] of [
    ['renderer.js', rendererSource],
    ['overlay.js', overlaySource],
    ['vertical-tabs.js', railSource],
  ]) {
    // A template interpolation is CODE, not string content — `${tab.asleep ?
    // ' quiet' : ''}` reads the field without ever showing it to anyone.
    // Strip interpolations before scanning so the guard sees only string prose.
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
  assert.match(railSource, /quiet:\s*window\.QUIET_GLYPH_SVG/);

  assert.match(styles, /\.vertical-tab-row\.quiet \.vertical-tab-favicon\s*\{[^}]*opacity: \.45;/s);
  // Not the title: .vertical-tab-row.loading already dims it, and the title
  // span is aria-hidden — the favicon is the primary scan target.
  assert.doesNotMatch(styles, /\.vertical-tab-row\.quiet \.vertical-tab-title\s*\{/);
});

// ---------------------------------------------------------------------------
// Quick Switcher (overlay.js switcherResults / resultRow)
// ---------------------------------------------------------------------------

test('a switcher result sub is just the domain — quiet is not shown here', () => {
  // Quiet lives only on the Zzz glyph + dimmed favicon (panel row and rail).
  // The switcher sub carries the tab's domain and nothing quiet-specific.
  assert.match(overlaySource, /const sub = tabDomain\(t\);/);
  assert.doesNotMatch(overlaySource, /t\.asleep && 'quiet'/);
});

test('the switcher does not add a second wake path from the renderer', () => {
  // Picking a tab result goes through switchTab -> main's setActiveTab, which
  // is the single wake choke point. There is no renderer-side wake API.
  assert.doesNotMatch(overlaySource, /wakeTab/);
  assert.match(overlaySource, /result\.kind === 'tab'\) window\.browserAPI\.switchTab\(result\.tab\.id\)/);
});

// ---------------------------------------------------------------------------
// serializeTabs (main.js) — the connection claim on a quiet row
// ---------------------------------------------------------------------------

const { connectionFor, committedUrlOf, shieldChipState } = require('../../src/main/shield-model');
const mainSource = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
const serializeSource = mainSource.match(/function serializeTabs\(\) \{[\s\S]*?\n\}/)?.[0];

test('serializeTabs could be lifted from main.js', () => {
  assert.ok(serializeSource, 'serializeTabs not found in main.js — update this test with it');
});

function runSerializeTabs(tabList) {
  const sandbox = {
    settings: { getSettings: () => ({ adblockEnabled: true, adblockExceptions: [] }) },
    rt: () => ({ tabOrder: tabList.map((tab) => tab.id) }),
    tabs: new Map(tabList.map((tab) => [tab.id, tab])),
    isHostnameExcepted: () => false, shieldChipState, connectionFor, committedUrlOf,
  };
  vm.runInNewContext(`${serializeSource}\nthis.__fn = serializeTabs;`, sandbox);
  return sandbox.__fn();
}

const AWAKE_HTTPS = {
  id: 'connection-tab', url: 'https://example.com/', isLoading: false,
  blockedCount: 0, asleep: false,
  view: { webContents: { isDestroyed: () => false, getURL: () => 'https://example.com/' } },
};

test('an awake row still reads its connection claim from the committed view', () => {
  const [row] = runSerializeTabs([{ ...AWAKE_HTTPS }]);
  assert.equal(row.connection, 'https');
});

test('a quiet row falls back to its stored url, which it has by construction', () => {
  const [secure] = runSerializeTabs([{ ...AWAKE_HTTPS, asleep: true, view: null }]);
  assert.equal(secure.connection, 'https');
  const [insecure] = runSerializeTabs([
    { ...AWAKE_HTTPS, url: 'http://example.com/', asleep: true, view: null },
  ]);
  assert.equal(insecure.connection, 'http');
});

// ---------------------------------------------------------------------------
// /sleep must leave the panel showing the rows it just changed
// ---------------------------------------------------------------------------

const runCommandSource = overlaySource.match(/function runCommand\(command\) \{[\s\S]*?\n  \}/)?.[0];

test('runCommand could be lifted from source', () => {
  assert.ok(runCommandSource, 'runCommand not found in overlay.js — update this test with it');
});

test('/sleep clears the input so the list falls back to the tab switcher', () => {
  // The panel renders slash commands whenever the input starts with "/". A
  // command that stays open and leaves "/sleep" typed therefore shows the
  // command list, never the rows it just quieted — the dimming is real but
  // unreachable. Clearing the input is what makes the receipt visible.
  const sleepEntry = overlaySource.match(/\{ cmd: '\/sleep',[^\n]*\}/)?.[0] ?? '';
  assert.match(sleepEntry, /keepOverlay: true/);
  assert.match(sleepEntry, /clearInput: true/);

  assert.match(runCommandSource, /command\.clearInput/);
  assert.match(runCommandSource, /addressInput\.value = ''/);
  // A programmatic value change does not fire the input listener, so the
  // re-render has to be explicit or the stale command list stays on screen.
  assert.match(runCommandSource, /renderList\(\)/);
});

test('/find keeps its typed query — clearing is opt-in, not blanket', () => {
  const findEntry = overlaySource.match(/\{ cmd: '\/find',[^\n]*\}/)?.[0] ?? '';
  assert.match(findEntry, /keepOverlay: true/);
  assert.doesNotMatch(findEntry, /clearInput/);
});

test('/sleep explains an empty result instead of looking broken', () => {
  const sleepEntry = overlaySource.match(/\{ cmd: '\/sleep',[^\n]*\}/)?.[0] ?? '';
  assert.match(sleepEntry, /resultNotice:/);
  assert.match(sleepEntry, /No background tabs can be quieted right now\./);
  assert.match(runCommandSource, /command\.resultNotice/);
  assert.match(overlaySource, /commandNotice/);
  assert.match(overlaySource, /setAttribute\('role', 'status'\)/);
});

// ---------------------------------------------------------------------------
// Quiet glyph: shared definition, single rule, canonical path
// ---------------------------------------------------------------------------

test('quiet-glyph.js contains the canonical path data', () => {
  assert.ok(glyphExists, 'src/renderer/quiet-glyph.js must exist');
  assert.ok(
    glyphSource.includes(
      'M1.5 9.75H6.25L1.5 14H6.25M7.75 5.5H11.5L7.75 9H11.5M12.75 1.75H15L12.75 4.25H15'
    ),
    'canonical path data must match the spec exactly'
  );
});

test('one definition: both documents load the glyph before their renderer scripts', () => {
  assert.match(indexHtml, /quiet-glyph\.js/);
  assert.match(overlayHtml, /quiet-glyph\.js/);

  const idxBefore = indexHtml.indexOf('quiet-glyph.js') < indexHtml.indexOf('vertical-tabs.js');
  const olBefore = overlayHtml.indexOf('quiet-glyph.js') < overlayHtml.indexOf('overlay.js');
  assert.ok(idxBefore, 'quiet-glyph.js must load before vertical-tabs.js in index.html');
  assert.ok(olBefore, 'quiet-glyph.js must load before overlay.js in overlay.html');

  assert.match(overlaySource, /QUIET_GLYPH_SVG/);
  assert.match(railSource, /QUIET_GLYPH_SVG/);
  assert.doesNotMatch(railSource, /quiet:\s*'<svg/);
});

test('one rule, both surfaces: container and svg share a declaration block', () => {
  assert.match(
    styles,
    /\.vertical-tab-state,\s*\n\s*\.island-row \.row-quiet\s*\{/,
    'container block must list both selectors'
  );
  assert.match(
    styles,
    /\.vertical-tab-state svg,\s*\n\s*\.island-row \.row-quiet svg\s*\{/,
    'svg block must list both selectors'
  );
  assert.doesNotMatch(styles, /\.quiet-glyph\s*\{/, 'no .quiet-glyph sizing rule may exist');
  // Guard against a SECOND, parallel rule re-declaring the sizing — the failure
  // the shared block exists to prevent. The rail selector must appear only in
  // comma-joined form (`.vertical-tab-state,`) or descendant form
  // (`.vertical-tab-state svg`), never standalone with its own brace — which is
  // what forces its declarations into the shared block. (A standalone
  // `.island-row .row-quiet {` cannot be regex-guarded here without matching
  // the shared block's own second selector line; the cross-surface width
  // equality assertion in the Task 3 perceivability test closes that gap.)
  assert.doesNotMatch(styles, /\.vertical-tab-state\s*\{/, 'no standalone .vertical-tab-state rule');
});

test('the shared blocks lock the glyph rendering at 13x13 in a 14x14 container', () => {
  const containerBlock = styles.match(
    /\.vertical-tab-state,\s*\n\s*\.island-row \.row-quiet\s*\{([^}]*)\}/s
  );
  assert.ok(containerBlock, 'shared container block not found');
  assert.match(containerBlock[1], /width: 14px/);
  assert.match(containerBlock[1], /height: 14px/);

  const svgBlock = styles.match(
    /\.vertical-tab-state svg,\s*\n\s*\.island-row \.row-quiet svg\s*\{([^}]*)\}/s
  );
  assert.ok(svgBlock, 'shared svg block not found');
  assert.match(svgBlock[1], /width: 13px/);
  assert.match(svgBlock[1], /height: 13px/);
  assert.match(svgBlock[1], /stroke-width: 1\.35/);
  assert.match(svgBlock[1], /stroke-linecap: round/);
  assert.match(svgBlock[1], /stroke-linejoin: round/);
  assert.match(svgBlock[1], /fill: none/);
});

test('the old quiet pill styling is gone', () => {
  const allRowQuietBlocks = styles.match(/\.island-row \.row-quiet[^{]*\{([^}]*)\}/gs) ?? [];
  for (const block of allRowQuietBlocks) {
    assert.doesNotMatch(block, /\bborder\s*:/, 'no .row-quiet rule may set border');
    assert.doesNotMatch(block, /\bborder-radius\s*:/, 'no .row-quiet rule may set border-radius');
    assert.doesNotMatch(block, /\bpadding\s*:/, 'no .row-quiet rule may set padding');
    assert.doesNotMatch(block, /\bfont-family\s*:/, 'no .row-quiet rule may set font-family');
  }
});

test('the panel glyph carries title="Quiet" and the row name includes quiet', () => {
  assert.match(panelRowSource, /quiet\.innerHTML = window\.QUIET_GLYPH_SVG/);
  assert.match(panelRowSource, /quiet\.title = 'Quiet'/);
  assert.match(glyphSource, /aria-hidden="true"/);
  assert.match(panelRowSource, /tab\.asleep \? 'quiet' : ''/);
});

test('a quiet panel row dims its favicon wrapper via a row-level class', () => {
  assert.match(panelRowSource, /tab\.asleep \? ' quiet' : ''/);
  assert.match(styles, /\.island-row\.quiet \.row-favicon-wrap\s*\{[^}]*opacity: \.45;/s);
});
