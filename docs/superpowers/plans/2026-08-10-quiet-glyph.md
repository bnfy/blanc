# Quiet Glyph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `quiet` text pill in the Island panel row and the circle-with-core icon in the vertical rail with a shared Zzz glyph, unifying both surfaces on one mark.

**Architecture:** A single `quiet-glyph.js` script exposes `window.QUIET_GLYPH_SVG`, loaded before both chrome renderers. CSS sizing lives in one shared declaration block (the existing rail rules gain a second selector each). The old text-pill CSS is deleted. Both JS files (`overlay.js`, `vertical-tabs.js`) switch to the shared global.

**Tech Stack:** Vanilla JS, CSS, HTML — no new dependencies.

## Global Constraints

- The Quick Switcher subline and pill dots are **unchanged** — only the panel row and vertical rail change.
- Every user-visible and assistive **string** says "quiet", never "asleep" — the Zzz is pixels only.
- No `.quiet-glyph` CSS sizing rule may exist — both surfaces resolve through the shared `.vertical-tab-state` / `.island-row .row-quiet` block.
- No CSP edit is needed — `script-src 'self'` already permits a same-directory script.
- No substrate impact — `substrate:check` does not participate.
- The design-system specimen update lands **in this same change**, not afterwards.

---

### Task 1: Shared glyph, HTML wiring, CSS, and JS changes

**Files:**
- Create: `src/renderer/quiet-glyph.js`
- Modify: `src/renderer/index.html` (add script tag before `vertical-tabs.js`, ~line 96)
- Modify: `src/renderer/overlay.html` (add script tag before `overlay.js`, ~line 99)
- Modify: `src/renderer/styles.css` (extend the two `.vertical-tab-state` rules, ~lines 536/546)
- Modify: `src/renderer/styles.css` (delete old `.row-quiet` pill block ~line 1644, add favicon dim)
- Modify: `src/renderer/overlay.js` (add quiet class to row ~line 248; replace text pill ~lines 297–301)
- Modify: `src/renderer/vertical-tabs.js` (use shared glyph, ~line 22)
- Test: `test/unit/quiet-tabs-chrome.test.js`

**Note on line numbers:** all line numbers here are approximate and drift as
earlier steps in this task edit the same files. Match on the shown code text,
not the line number — the `old_string` in each edit is the source of truth.

**Interfaces:**
- Consumes: nothing (foundation task)
- Produces: `window.QUIET_GLYPH_SVG` global string; `.island-row .row-quiet` as a 14×14 glyph container styled by the shared CSS block; `.island-row.quiet` class on quiet panel rows

- [ ] **Step 1: Write the failing tests for the canonical path and one-definition**

Add file reads and tests to `test/unit/quiet-tabs-chrome.test.js`. Insert after line 13 (below the existing `const styles = ...` line):

```js
const glyphPath = path.join(ROOT, 'src/renderer/quiet-glyph.js');
const glyphExists = fs.existsSync(glyphPath);
const glyphSource = glyphExists ? fs.readFileSync(glyphPath, 'utf8') : '';
const indexHtml = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
const overlayHtml = fs.readFileSync(path.join(ROOT, 'src/renderer/overlay.html'), 'utf8');
```

Then add the new test blocks at the end of the file (after the last existing test):

```js
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

test('the Quick Switcher subline still emits the word quiet', () => {
  assert.match(
    overlaySource,
    /\[tabDomain\(t\), t\.asleep && 'quiet'\]\.filter\(Boolean\)\.join\(' · '\)/
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: at least 7 failures — `quiet-glyph.js must exist`, the HTML assertions, the shared-block selectors, the panel glyph assertions, and the favicon dim assertion. The Quick Switcher test should pass (it guards the unchanged surface).

- [ ] **Step 3: Create `src/renderer/quiet-glyph.js`**

```js
window.QUIET_GLYPH_SVG =
  '<svg class="quiet-glyph" viewBox="0 0 16 16" aria-hidden="true">' +
  '<path d="M1.5 9.75H6.25L1.5 14H6.25M7.75 5.5H11.5L7.75 9H11.5' +
  'M12.75 1.75H15L12.75 4.25H15"/></svg>';
```

- [ ] **Step 4: Wire both HTML documents**

In `src/renderer/index.html`, change line 96 from:

```html
  <script src="vertical-tabs.js"></script>
```

to:

```html
  <script src="quiet-glyph.js"></script>
  <script src="vertical-tabs.js"></script>
```

In `src/renderer/overlay.html`, change line 99 from:

```html
  <script src="overlay.js"></script>
```

to:

```html
  <script src="quiet-glyph.js"></script>
  <script src="overlay.js"></script>
```

- [ ] **Step 5: Extend the two CSS rail rules with panel selectors**

In `src/renderer/styles.css`, change line 536 from:

```css
.vertical-tab-state {
```

to:

```css
.vertical-tab-state,
.island-row .row-quiet {
```

Change line 546 (which will now be line 547 after the insertion above) from:

```css
.vertical-tab-state svg {
```

to:

```css
.vertical-tab-state svg,
.island-row .row-quiet svg {
```

- [ ] **Step 6: Delete the old pill block and add the favicon dim rule**

In `src/renderer/styles.css`, delete the comment and rule at lines 1642–1652:

```css
/* "quiet" tag on a quiet tab in the switcher list. Same pill as .row-private
   and, like it, visible at rest — .row-tag is hover-only inside .tab-row. */
.island-row .row-quiet {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 6px;
  flex: 0 0 auto;
}
```

Replace with:

```css
.island-row.quiet .row-favicon-wrap { opacity: .45; }
```

- [ ] **Step 7: Update `overlay.js` — add quiet class to row and replace text pill with glyph**

In `src/renderer/overlay.js`, change line 248 from:

```js
    row.className = 'island-row tab-row' + (tab.id === state.activeTabId ? ' active' : '');
```

to:

```js
    row.className = 'island-row tab-row' + (tab.id === state.activeTabId ? ' active' : '') + (tab.asleep ? ' quiet' : '');
```

Change the asleep block at lines 297–301 from:

```js
    if (tab.asleep) {
      const quiet = document.createElement('span');
      quiet.className = 'row-quiet';
      quiet.textContent = 'quiet';
      row.append(quiet);
    }
```

to:

```js
    if (tab.asleep) {
      const quiet = document.createElement('span');
      quiet.className = 'row-quiet';
      quiet.innerHTML = window.QUIET_GLYPH_SVG;
      quiet.title = 'Quiet';
      row.append(quiet);
    }
```

- [ ] **Step 8: Update `vertical-tabs.js` — use shared glyph**

In `src/renderer/vertical-tabs.js`, change line 22 from:

```js
    quiet: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.25"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg>',
```

to:

```js
    quiet: window.QUIET_GLYPH_SVG,
```

- [ ] **Step 9: Update the existing test assertions**

In `test/unit/quiet-tabs-chrome.test.js`, update the test at line 103 (`a quiet panel row is tagged "quiet" and named "quiet"`). Replace the entire test body:

```js
test('a quiet panel row carries the glyph and is named "quiet"', () => {
  assert.match(panelRowSource, /quiet\.className = 'row-quiet'/);
  assert.match(panelRowSource, /quiet\.innerHTML = window\.QUIET_GLYPH_SVG/);
  assert.match(panelRowSource, /row\.append\(quiet\)/);
  assert.match(panelRowSource, /tab\.asleep \? 'quiet' : ''/);

  // Modelled on .row-private (always visible), never on .row-tag — which is
  // opacity:0 until hover/focus inside .tab-row.
  assert.doesNotMatch(styles, /\.island-row\.tab-row \.row-quiet/);
});
```

Update the rail test at line 153 (`a quiet rail row is classed, named, and marked`). Change the inline-SVG assertion from:

```js
  assert.match(railSource, /quiet: '<svg viewBox="0 0 16 16" aria-hidden="true">/);
```

to:

```js
  assert.match(railSource, /quiet:\s*window\.QUIET_GLYPH_SVG/);
```

- [ ] **Step 10: Run all tests to verify they pass**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: all tests pass.

- [ ] **Step 11: Run the full unit suite as a regression check**

Run: `npm run test:unit`

Expected: all tests pass.

- [ ] **Step 12: Commit**

```bash
git add src/renderer/quiet-glyph.js src/renderer/index.html src/renderer/overlay.html \
  src/renderer/styles.css src/renderer/overlay.js src/renderer/vertical-tabs.js \
  test/unit/quiet-tabs-chrome.test.js
git commit -m "Replace the quiet text pill and circle-with-core with a shared Zzz glyph

Both the Island panel row and the vertical rail now render the same
three-Z glyph from a single definition in quiet-glyph.js. CSS sizing
lives in one shared declaration block (the existing rail rules gain a
second selector each). The old bordered pill block is deleted; the
panel row dims its favicon wrapper through a row-level .quiet class,
mirroring the rail."
```

---

### Task 2: Design-system specimen update

**Files:**
- Modify: `design-system/components/quiet-tabs/index.html:102-104` (panel row specimens)
- Modify: `design-system/components/quiet-tabs/index.html:112-113` (rail row CSS + specimens)
- Modify: `design-system/components/quiet-tabs/index.html:137` (surface count)
- Modify: `design-system/components/quiet-tabs/index.html:230-237` (values table)
- Modify: `design-system/components/quiet-tabs/index.html:255` (/sleep claim)
- Modify: `design-system/components/quiet-tabs/index.html:138` (provenance line)

**Interfaces:**
- Consumes: the canonical glyph path from Task 1's `quiet-glyph.js`
- Produces: updated specimen sheet (no code interface — human-readable documentation)

- [ ] **Step 1: Update the panel row CSS and specimens**

In `design-system/components/quiet-tabs/index.html`, replace lines 102–104:

```css
.row-quiet, .row-private {
  font-family: var(--font-mono); font-size: 10px; color: var(--text-dim);
  border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; flex: 0 0 auto;
}
```

with:

```css
.row-private {
  font-family: var(--font-mono); font-size: 10px; color: var(--text-dim);
  border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; flex: 0 0 auto;
}
.row-quiet {
  width: 14px; height: 14px; display: inline-flex; align-items: center;
  justify-content: center; color: var(--text-dim); flex: 0 0 auto;
}
.row-quiet svg {
  width: 13px; height: 13px; fill: none; stroke: currentColor;
  stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round;
}
.row-favicon-wrap { position: relative; display: flex; flex: 0 0 auto; }
.island-row.quiet .row-favicon-wrap { opacity: .45; }
```

Replace the panel row HTML specimens (lines 180–191). In both the light and dark grounds, replace the quiet row from:

```html
<div class="island-row"><span class="row-favicon"></span><span class="row-title">MDN Web Docs</span><span class="row-quiet">quiet</span></div>
```

to:

```html
<div class="island-row quiet"><span class="row-favicon-wrap"><span class="row-favicon"></span></span><span class="row-title">MDN Web Docs</span><span class="row-quiet"><svg class="quiet-glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 9.75H6.25L1.5 14H6.25M7.75 5.5H11.5L7.75 9H11.5M12.75 1.75H15L12.75 4.25H15"/></svg></span></div>
```

Also wrap the non-quiet rows' favicons in `.row-favicon-wrap` for consistent structure:

```html
<div class="island-row"><span class="row-favicon-wrap"><span class="row-favicon"></span></span><span class="row-title">Electron Documentation</span></div>
```

And the private row:

```html
<div class="island-row"><span class="row-favicon-wrap"><span class="row-favicon"></span></span><span class="row-title">New Tab</span><span class="row-private">private</span></div>
```

- [ ] **Step 2: Update the rail row CSS and specimens**

Replace the rail row CSS (lines 112–113):

```css
.vertical-tab-quiet { color: var(--text-dim); display: inline-flex; flex: 0 0 auto; }
.vertical-tab-quiet svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.25; }
```

with (matching the shipping CSS exactly):

```css
.vertical-tab-quiet { width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; color: var(--text-dim); flex: 0 0 auto; }
.vertical-tab-quiet svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round; }
```

Replace the rail row quiet specimens (lines 202–203 and 207–208) — both grounds. Change the SVG inside `.vertical-tab-quiet` from the circle-with-core:

```html
<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.25"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg>
```

to the Zzz glyph:

```html
<svg class="quiet-glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 9.75H6.25L1.5 14H6.25M7.75 5.5H11.5L7.75 9H11.5M12.75 1.75H15L12.75 4.25H15"/></svg>
```

- [ ] **Step 3: Fix the lede and provenance**

Change line 137 from:

```html
<p class="lede">A tab left idle has its renderer discarded to reclaim memory, and rebuilt when you return to it. Three surfaces carry that state. The word a person sees is always <b>quiet</b> — <code>asleep</code> is the internal field name only.</p>
```

to:

```html
<p class="lede">A tab left idle has its renderer discarded to reclaim memory, and rebuilt when you return to it. Four surfaces carry that state: the panel row and vertical rail share a Zzz glyph with a dimmed favicon; pill dots use a shrunk core; the Quick Switcher subline prints the word. The word a person sees or hears is always <b>quiet</b> — <code>asleep</code> is the internal field name only; the Zzz is a pictogram, not a string.</p>
```

Update the provenance line (line 138) to reflect the new source ranges:

```html
<div class="provenance">specimen built from src/renderer/styles.css · dots 841–886 · glyph + rail 536–556 · rail dim 568–570 · panel dim 1644 · quiet-glyph.js</div>
```

(Exact line numbers may shift after CSS edits — verify against the committed file before finalizing.)

- [ ] **Step 4: Fix the /sleep claim**

Change line 255 from:

```html
<p>Every visible and assistive string says quiet. The tab record's field is <code>asleep</code> and the command is <code>/sleep</code>, both internal-facing — the same split as Favorites and <code>bookmarks</code>. A test fails the build if <code>asleep</code> reaches a user-facing string.</p>
```

to:

```html
<p>Every visible and assistive string says quiet. The tab record's field is <code>asleep</code> (internal only); the command is <code>/sleep</code>, the one deliberate place where the internal word is shown to users — the opposite of the <code>bookmarks</code> split, where an identifier no user ever sees. A test fails the build if <code>asleep</code> reaches a user-facing string.</p>
```

- [ ] **Step 5: Update the values table**

Replace the values table body (lines 232–238) to reflect the new state:

```html
<tbody>
  <tr><td>Pill dot</td><td class="code">.island-dot.asleep:not(.private)</td><td class="code">background: transparent</td></tr>
  <tr><td>Pill dot core</td><td class="code">…asleep:not(.private)::after</td><td class="code">inset: 1.25px; background: var(--border)</td></tr>
  <tr><td>Panel + rail container</td><td class="code">.vertical-tab-state, .island-row .row-quiet</td><td class="code">14×14, inline-flex, var(--text-dim)</td></tr>
  <tr><td>Panel + rail svg</td><td class="code">…svg</td><td class="code">13×13, stroke 1.35 round, fill: none</td></tr>
  <tr><td>Panel favicon</td><td class="code">.island-row.quiet .row-favicon-wrap</td><td class="code">opacity: .45</td></tr>
  <tr><td>Rail favicon</td><td class="code">.vertical-tab-row.quiet .vertical-tab-favicon</td><td class="code">opacity: .45</td></tr>
</tbody>
```

- [ ] **Step 6: Commit**

```bash
git add design-system/components/quiet-tabs/index.html
git commit -m "Update quiet-tabs specimen for the Zzz glyph

Panel row: Zzz glyph replaces the text pill, favicon dims via wrapper.
Rail row: Zzz glyph replaces the circle-with-core. Values table and
CSS reflect the shared declaration block. Fix /sleep claim (it is
user-facing, not internal-facing) and surface count (four, not three)."
```

---

### Task 3: Perceivability acceptance test

**Files:**
- Modify: `spec/acceptance/quiet-tabs.feature` (add scenario after `@F31-5`)
- Modify: `test/desktop/steps/quiet-tabs.steps.js` (add step definition)
- Modify: `src/main/test-hook.js` (add `quietGlyphComputedStyles` method to the test surface)

**Interfaces:**
- Consumes: quiet tab state from existing acceptance infrastructure; `quietChromeState` test hook from `test-hook.js`
- Produces: new `@F31-5` scenario asserting live perceivability of the glyph on both surfaces

- [ ] **Step 1: Add the acceptance scenario**

In `spec/acceptance/quiet-tabs.feature`, add after the existing `@F31-5` scenario (after the `Then the pill, panel, and rail expose a distinct quiet state` line):

```gherkin
  @F31-5 @F31 @desktop @D8
  Scenario: The panel and rail glyphs are perceivable at rest and render identically
    Given a background tab on a quietable page
    When I quiet that background tab
    And I show the vertical tab rail and panel
    Then both quiet glyphs are visible at rest and render identically
```

- [ ] **Step 2: Add the test hook method**

In `src/main/test-hook.js`, add a `quietGlyphComputedStyles` method to the test surface. Place it directly after the existing `quietChromeState` method (~line 628, after its closing `},`). It reads computed styles from the two live chrome documents — the panel from the overlay web contents, the rail from the chrome web contents — matching each row by `data-tab-id`, exactly as `quietChromeState` does for the rail. `getOverlayWebContents` and `getChromeWebContents` are already in scope (destructured at the top of the install function, ~lines 72–73):

```js
    async quietGlyphComputedStyles(id) {
      const overlay = getOverlayWebContents();
      const chrome = getChromeWebContents();
      if (!overlay || !chrome) {
        return { panel: { error: 'no web contents' }, rail: { error: 'no web contents' } };
      }
      const idJson = JSON.stringify(String(id));

      const panel = await overlay.executeJavaScript(`(() => {
        const row = document.querySelector(
          '#islandList .island-row[data-tab-id="' + CSS.escape(${idJson}) + '"]'
        );
        if (!row) return { error: 'quiet panel row not found' };
        const glyph = row.querySelector('.row-quiet');
        if (!glyph) return { error: 'no .row-quiet in panel row' };
        const svg = glyph.querySelector('svg');
        if (!svg) return { error: 'no svg in .row-quiet' };

        // Step 1: at-rest state
        const hovered = row.matches(':hover');
        const focused = row.matches(':focus-within');

        // Step 2: rendered (display/visibility chain up to the row)
        let el = glyph;
        while (el && el !== document.documentElement) {
          const s = getComputedStyle(el);
          if (s.display === 'none') return { error: 'display:none on ' + (el.className || el.tagName) };
          if (s.visibility === 'hidden') return { error: 'visibility:hidden on ' + (el.className || el.tagName) };
          el = el.parentElement;
        }

        // Step 3: cumulative opacity
        let opacity = 1;
        el = glyph;
        while (el && el !== document.documentElement) {
          opacity *= parseFloat(getComputedStyle(el).opacity);
          el = el.parentElement;
        }

        // Step 4: the real laid-out box (getBoundingClientRect, not computed
        // width — an unlaid-out SVG can compute "auto"). Step 5: computed values.
        const rect = svg.getBoundingClientRect();
        const gs = getComputedStyle(svg);
        return {
          hovered, focused, opacity,
          rectWidth: rect.width, rectHeight: rect.height,
          width: gs.width, strokeWidth: gs.strokeWidth,
          strokeLinecap: gs.strokeLinecap, fill: gs.fill,
        };
      })()`);

      const rail = await chrome.executeJavaScript(`(() => {
        const row = document.querySelector(
          '.vertical-tab-row[data-tab-id="' + CSS.escape(${idJson}) + '"]'
        );
        if (!row) return { error: 'quiet rail row not found' };
        const marker = row.querySelector('.vertical-tab-quiet');
        if (!marker) return { error: 'no quiet marker in rail row' };
        const svg = marker.querySelector('svg');
        if (!svg) return { error: 'no svg in rail marker' };
        const rect = svg.getBoundingClientRect();
        const gs = getComputedStyle(svg);
        return {
          rectWidth: rect.width, rectHeight: rect.height,
          width: gs.width, strokeWidth: gs.strokeWidth,
          strokeLinecap: gs.strokeLinecap, fill: gs.fill,
        };
      })()`);

      return { panel, rail };
    },
```

- [ ] **Step 3: Add the step definition**

In `test/desktop/steps/quiet-tabs.steps.js`, add after the existing `@F31-5` step definition (`Then('the pill, panel, and rail expose a distinct quiet state', …)`). Pass `this.quietCandidateId` — the hook matches rows by `data-tab-id`, and that id is set by the `Given`/`When` steps earlier in the scenario:

```js
Then('both quiet glyphs are visible at rest and render identically', async function () {
  const result = await this.call('quietGlyphComputedStyles', this.quietCandidateId);

  // Steps 2–3 return an { error } object if a display:none, visibility:hidden,
  // or missing element was found while walking the ancestor chain.
  assert.ok(!result.panel.error, `panel glyph: ${result.panel.error}`);
  assert.ok(!result.rail.error, `rail glyph: ${result.rail.error}`);

  // Step 1: at rest. The desktop harness drives through executeJavaScript and
  // never positions the OS pointer over the overlay, so the panel row is
  // unhovered by construction; opening the panel focuses the address input in
  // .panel-row, not a tab row, so :focus-within is false. These assert the
  // at-rest precondition holds and guard against a regression that reveals the
  // glyph only on hover/focus.
  assert.equal(result.panel.hovered, false, 'panel row must not be hovered');
  assert.equal(result.panel.focused, false, 'panel row must not be focused');

  // Step 3: not transparent — cumulative ancestor opacity, not the glyph's own.
  assert.ok(result.panel.opacity > 0, 'panel glyph cumulative opacity must be > 0');

  // Step 4: both have a real laid-out box.
  assert.ok(result.panel.rectWidth > 0 && result.panel.rectHeight > 0, 'panel glyph must have a non-zero box');
  assert.ok(result.rail.rectWidth > 0 && result.rail.rectHeight > 0, 'rail glyph must have a non-zero box');

  // Step 5: they agree — the only assertion that survives a future stylesheet
  // edit no static test anticipated.
  assert.equal(result.panel.width, result.rail.width, 'widths must match');
  assert.equal(result.panel.strokeWidth, result.rail.strokeWidth, 'stroke-widths must match');
  assert.equal(result.panel.strokeLinecap, result.rail.strokeLinecap, 'stroke-linecaps must match');
  assert.equal(result.panel.fill, result.rail.fill, 'fills must match');
});
```

- [ ] **Step 4: Verify the step definitions parse**

Run: `npm run test:acceptance:dry`

Expected: 0 undefined steps, 0 errors.

- [ ] **Step 5: Run the perceivability scenario**

Run: `npm run test:acceptance:desktop -- --name "The panel and rail glyphs are perceivable"`

Expected: scenario passes — both glyphs are visible at rest and render identically.

- [ ] **Step 6: Run the full acceptance suite as a regression check**

Run: `npm run test:acceptance:desktop`

Expected: all scenarios pass (retry: 1 absorbs known flakes).

- [ ] **Step 7: Commit**

```bash
git add spec/acceptance/quiet-tabs.feature test/desktop/steps/quiet-tabs.steps.js \
  src/main/test-hook.js
git commit -m "Add perceivability acceptance test for both quiet glyphs

Asserts at-rest visibility (no hover/focus), rendered status
(display/visibility chain), cumulative opacity > 0, non-zero box,
and cross-surface agreement (width, stroke-width, stroke-linecap,
fill) between the panel and rail glyphs."
```
