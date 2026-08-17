'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');
const rendererSource = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');

// Lift the shipping functions rather than copying their logic here — a copy
// would prove only that the copy works. Same technique as
// quiet-tabs-chrome.test.js.
const tabDomainSource = rendererSource.match(/function tabDomain\(tab\) \{[\s\S]*?\n  \}/)?.[0];
const modeSource = rendererSource.match(/function pillLabelMode\(tab\) \{[\s\S]*?\n  \}/)?.[0];
const viewSourceSource = rendererSource.match(/function viewSourceTarget\(url\) \{[\s\S]*?\n  \}/)?.[0];

test('the label functions could be lifted from source', () => {
  assert.ok(tabDomainSource, 'tabDomain not found in renderer.js — update this test with it');
  assert.ok(modeSource, 'pillLabelMode not found in renderer.js — update this test with it');
  assert.ok(viewSourceSource, 'viewSourceTarget not found in renderer.js — update this test with it');
});

function runMode(tab) {
  const sandbox = { URL };
  vm.runInNewContext(
    `${viewSourceSource}\n${tabDomainSource}\n${modeSource}\nthis.__fn = pillLabelMode;`,
    sandbox,
  );
  return sandbox.__fn(tab);
}

const BLANK = { url: 'blanc://newtab/', isLoading: false, private: false };
const BLANK_PRIVATE = { url: 'blanc://newtab/?private=1', isLoading: false, private: true };
const LOADED = { url: 'https://example.com/x', isLoading: false, private: false };
const LOADING = { url: 'https://example.com/x', isLoading: true, private: false };

test('only a blank tab gets the placeholder', () => {
  assert.equal(runMode(BLANK), 'placeholder');
  // A private blank tab has the same problem; #pillPrivateChip already says
  // "private", so dropping the "private tab" string loses nothing.
  assert.equal(runMode(BLANK_PRIVATE), 'placeholder');
  assert.equal(runMode(LOADED), 'domain');
  assert.equal(runMode(LOADING), 'loading');
});

// The caret this replaced was a child ELEMENT, so rebuilding it on every
// tabs:updated restarted its animation and a guard was needed. The wash is a
// CSS animation on #pillDomain itself, which is never recreated — writing
// textContent does not touch it. Keeping the guard would have preserved a
// mechanism whose reason had gone.
test('the label render carries no stale rebuild guard', () => {
  const fn = rendererSource.match(/function renderPillLabel\(tab\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(fn, 'renderPillLabel not found in renderer.js — update this test with it');
  assert.doesNotMatch(fn, /labelMode/, 'the caret-era transition guard should be gone');
  assert.doesNotMatch(fn, /createElement/, 'the placeholder is text, not a child element');
  assert.match(fn, /classList\.toggle\('placeholder'/);
});

test('nothing of the caret survives', () => {
  assert.doesNotMatch(styles, /pill-caret/, '.pill-caret rules must be removed');
  assert.doesNotMatch(rendererSource, /pill-caret/, 'renderer must not build a caret');
  assert.doesNotMatch(indexHtml, /pill-caret/);
});

test('the placeholder washes left to right, forever', () => {
  const rule = styles.match(/#pillDomain\.placeholder \{[\s\S]*?\n\}/)?.[0];
  assert.ok(rule, '#pillDomain.placeholder rule not found in styles.css');
  // Loops rather than running a bounded count: a new tab's first seconds are
  // spent looking down at the favorites, and a sweep that ends before the eye
  // comes back up teaches nothing.
  assert.match(rule, /animation:\s*pill-placeholder-wash[^;]*infinite;/);
  // The band is painted into the glyphs, not behind them.
  assert.match(rule, /background-clip:\s*text/);
  assert.match(rule, /-webkit-text-fill-color:\s*transparent/);

  // Direction. background-position DECREASES across the keyframes, which
  // slides the oversized gradient rightward and carries the bright band
  // left→right over the text. An increasing range would run right→left.
  const frames = styles.match(/@keyframes pill-placeholder-wash \{[\s\S]*?\n\}/)?.[0];
  assert.ok(frames, '@keyframes pill-placeholder-wash not found');
  const from = Number(frames.match(/from \{ background-position: (-?[\d.]+)%/)[1]);
  const to = Number(frames.match(/to \{ background-position: (-?[\d.]+)%/)[1]);
  assert.ok(from > to, `wash must run left→right (from ${from}% down to ${to}%)`);
});

test('reduced motion stops the wash and leaves a stronger resting ink', () => {
  const reduced = styles.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? [];
  const block = reduced.find((b) => /#pillDomain\.placeholder/.test(b));
  assert.ok(block, 'no prefers-reduced-motion rule for the placeholder');
  assert.match(block, /animation:\s*none/);
  // With the caret gone, falling back to plain --text-dim would restore the
  // flat label this whole change exists to get away from.
  assert.match(block, /color:\s*color-mix\(/, 'must rest at a stronger ink than --text-dim');
  assert.doesNotMatch(block, /color:\s*var\(--text-dim\)\s*;/);
});

test('pill children counter-scale against the pill zoom', () => {
  // #islandPill sets zoom: var(--pill-zoom); a raw px value renders 1.15x.
  for (const rule of ['.pill-slash']) {
    const block = styles.match(new RegExp(`\\${rule} \\{[\\s\\S]*?\\}`))?.[0];
    assert.ok(block, `${rule} rule not found in styles.css`);
    assert.match(block, /var\(--pill-zoom\)/, `${rule} must counter-scale its px values`);
  }
});

// The pill already had a keydown listener with Enter/Space activation. A
// second listener on the same element would not misbehave — Space is caught
// by the whitespace gate and Enter by the code-point gate — but the pill's
// activation semantics belong in one place, and writing the gates twice on
// one element invites the two copies to drift.
test('the pill has exactly one keydown listener, extended in place', () => {
  const listeners = rendererSource.match(/islandPill\.addEventListener\('keydown'/g) ?? [];
  assert.equal(listeners.length, 1, 'extend the existing pill keydown, do not add a second');

  const handler = rendererSource.match(
    /islandPill\.addEventListener\('keydown',[\s\S]*?\n  \}\);/,
  )?.[0];
  assert.ok(handler, 'pill keydown handler not found in renderer.js');

  // Unchanged: a focused child (tab dot, group capsule) keeps its own keys.
  assert.match(handler, /e\.target !== islandPill/);
  // Unchanged, and it must return before the type-to-open branch is reached.
  const enterBranch = handler.indexOf("e.key === 'Enter'");
  const typingBranch = handler.indexOf('isTypeToOpenKey');
  assert.ok(enterBranch !== -1, 'Enter/Space activation must survive');
  assert.ok(typingBranch !== -1, 'pill keydown must consult the shared gate');
  assert.ok(enterBranch < typingBranch, 'Enter/Space must be handled before type-to-open');
  assert.match(
    handler.slice(enterBranch, typingBranch),
    /return;/,
    'the Enter/Space branch must return, so those keys never reach the gate',
  );
});

test('the chip opens the command list and does not also open the plain panel', () => {
  const wiring = rendererSource.match(
    /pillSlash\.addEventListener\('click',[\s\S]*?\n  \}\);/,
  )?.[0];
  assert.ok(wiring, 'pillSlash click wiring not found in renderer.js');
  // Without stopPropagation the click also bubbles to the pill, which opens
  // the panel with no prefill — the chip would appear to do nothing.
  assert.match(wiring, /stopPropagation/);
  assert.match(wiring, /openIslandCommands/);
  // preventDefault on mousedown keeps a stray focus ring out of the resting
  // pill, matching pillButton.
  assert.match(rendererSource, /pillSlash\.addEventListener\('mousedown'/);
});

test('the markup carries the chip and loads the shared gate', () => {
  assert.match(indexHtml, /id="pillSlash"/);
  assert.match(indexHtml, /<script src="pages\/type-to-open\.js"><\/script>/);
  // The accessible name must contain the visible label "/" — an aria-label
  // overrides the text, so "Commands" alone would make the button
  // unreachable by speech control.
  assert.match(indexHtml, /aria-label="Commands \(\/\)"/);
});
