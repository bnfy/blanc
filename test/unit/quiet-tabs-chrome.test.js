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

test('the pill dots carry no quiet treatment — quiet lives on the row-level dim', () => {
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

test('a quiet panel row is classed, named, and tagged "quiet"', () => {
  assert.match(panelRowSource, /tab\.asleep \? ' quiet' : ''/);
  assert.match(panelRowSource, /tab\.asleep \? 'quiet' : ''/);
  // A WORD, not a pictogram: the tag reads at any density, unlike the row dim.
  assert.match(panelRowSource, /tag\.className = 'row-quiet'/);
  assert.match(panelRowSource, /tag\.textContent = 'quiet'/);
  assert.doesNotMatch(panelRowSource, /QUIET_GLYPH|<svg/);
  // Always visible, like .row-private — never a hover-gated .row-tag.
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

test('a quiet rail row is classed, named, and marked with the word "quiet"', () => {
  assert.match(railRowSource, /\(tab\.asleep \? ' quiet' : ''\)/);
  // The field is `asleep`; the string in the accessible name is 'quiet'.
  assert.match(railRowSource, /tab\.asleep && 'quiet'/);
  assert.match(railRowSource, /quietMarker\.className = 'vertical-tab-quiet'/);
  assert.match(railRowSource, /quietMarker\.textContent = 'quiet'/);
  // A word, never a glyph — no icon entry survives for it.
  assert.doesNotMatch(railSource, /QUIET_GLYPH|ICONS\.quiet/);
});

// ---------------------------------------------------------------------------
// Quick Switcher (overlay.js switcherResults / resultRow)
// ---------------------------------------------------------------------------

test('a switcher result sub is just the domain — quiet is not shown here', () => {
  // Quiet lives only on the row-level dim (panel row and rail). The switcher
  // sub carries the tab's domain and nothing quiet-specific.
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
// The quiet visual: a row-level dim, no glyph (the Zzz was removed 2026-08-12
// — judged too loud, and a sleep pictogram at odds with the "quiet" language)
// ---------------------------------------------------------------------------

test('the quiet glyph is fully deleted — file, serving allowlist, and references', () => {
  assert.ok(!glyphExists, 'src/renderer/quiet-glyph.js must not exist');
  assert.doesNotMatch(indexHtml, /quiet-glyph/);
  assert.doesNotMatch(overlayHtml, /quiet-glyph/);
  assert.doesNotMatch(overlaySource, /QUIET_GLYPH/);
  assert.doesNotMatch(railSource, /QUIET_GLYPH/);
  assert.doesNotMatch(styles, /quiet-glyph/);
  // The chrome scheme's allowlist is exact and fails closed; a stale entry
  // would keep advertising a file that no longer exists.
  const chromeProtocol = fs.readFileSync(path.join(ROOT, 'src/main/chrome-protocol.js'), 'utf8');
  assert.doesNotMatch(chromeProtocol, /quiet-glyph/);
});

// The row dim alone is a RELATIVE signal: restored tabs are born quiet, so
// after a relaunch nearly every row is dim at once and the state stops reading.
// Each surface therefore also carries the word, sharing its "private" block.
test('each surface tags a quiet row with the word, beside "private"', () => {
  assert.match(
    styles,
    /\.island-row \.row-private,\s*\n\s*\.island-row \.row-quiet\s*\{/,
    'panel chips must share one declaration block'
  );
  assert.match(
    styles,
    /\.vertical-tab-private,\s*\n\s*\.vertical-tab-quiet\s*\{/,
    'rail word-markers must share one declaration block'
  );
  // No SECOND, parallel rule may re-declare either one and let them drift. A
  // `doesNotMatch` on the selector cannot express this — it would match the
  // shared block's own second selector line — so count instead: each selector
  // may appear exactly once in the stylesheet, inside the block above.
  const occurrences = (needle) => styles.split(needle).length - 1;
  assert.equal(occurrences('.island-row .row-quiet'), 1, 'one .row-quiet rule only');
  assert.equal(occurrences('.vertical-tab-quiet'), 1, 'one .vertical-tab-quiet rule only');
});

// Extracts the declarations of the first rule whose selector list starts with
// `selector` (comma-joined co-selectors allowed), or fails the calling test.
function cssBlock(selector) {
  const escaped = selector.replace(/[.\\[\]()*+?^$|{}]/g, '\\$&');
  const block = styles.match(new RegExp(`${escaped}[^{}]*\\{([^}]*)\\}`, 's'));
  assert.ok(block, `rule not found: ${selector}`);
  return block[1];
}

test('both surfaces dim the whole quiet row, at the same strength', () => {
  const panel = cssBlock('.island-row.quiet');
  const rail = cssBlock('.vertical-tab-row.quiet');
  const strength = (block) => block.match(/opacity:\s*([\d.]+)/)?.[1];
  assert.equal(strength(panel), '.5', 'panel row must dim to .5');
  assert.equal(strength(rail), strength(panel), 'rail dim must match the panel dim');
  // The dim belongs to the ROW, never a part of it — no per-part quiet dim
  // survives on either surface.
  assert.doesNotMatch(styles, /\.island-row\.quiet \.row-favicon/);
  assert.doesNotMatch(styles, /\.vertical-tab-row\.quiet \.vertical-tab-favicon/);
});

test('a quiet row restores full strength on hover and focus-within', () => {
  for (const row of ['.island-row.quiet', '.vertical-tab-row.quiet']) {
    for (const state of [':hover', ':focus-within']) {
      const block = cssBlock(`${row}${state}`);
      assert.match(block, /opacity:\s*1/, `${row}${state} must restore opacity: 1`);
    }
  }
});

test('the un-dim transition is disabled under prefers-reduced-motion', () => {
  // Scan every reduced-motion block, not just the first. styles.css has more
  // than one (the pill caret has its own), and a non-global match silently
  // asserts against whichever happens to appear earliest in the file.
  const reduced = styles.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? [];
  assert.ok(reduced.length, 'no reduced-motion block found');
  assert.ok(
    reduced.some((block) => (
      /\.island-row\.quiet,\s*\n\s*\.vertical-tab-row\.quiet \{ transition: none; \}/.test(block)
    )),
    'both quiet rows must drop their transition under reduced motion'
  );
});
