# Shield Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the island pill's passive shield count into a clickable chip that opens a site-scoped protection popover (a fourth overlay mode), per `docs/superpowers/specs/2026-08-07-shield-popover-design.md`.

**Architecture:** Main derives all shield state in a new pure module (`shield-model.js`) and ships it on the existing `tabs:updated` broadcast; the strip renders the chip, the overlay document gains a `'shield'` mode rendered from the same broadcast. Bounds are fixed constants in `chrome-layout.js` (find-capsule pattern). The toggle reuses the existing `chrome:adblock-exempt-active` / `chrome:adblock-toggle` IPC verbatim.

**Tech Stack:** Electron main + two chrome renderer documents (vanilla JS, no framework), `node --test` unit tests.

## Global Constraints

- Working branch: `feat/shield-popover` (already created; spec committed there).
- Internal identifiers stay: `pillShield`, `.shield`, `bookmarks`-style naming rules. Never rename existing IPC channels.
- Copy strings must match the spec's copy inventory **verbatim** (they're repeated in the tasks below — do not paraphrase).
- No new tokens, settings enums, or slash-command copy → `npm run substrate:check` must stay green untouched.
- Chrome documents (`index.html`, `overlay.html`, `styles.css`, both renderers) only load at window creation — relaunch `npm start` to see changes; `Cmd+R` won't.
- All unit tests: `npm run test:unit` (node --test over `test/unit/`).
- Commit after each task with a conventional message; never commit `native/` (untracked experiment).

---

### Task 1: `shield-model.js` — pure chip + popover derivation

**Files:**
- Create: `src/main/shield-model.js`
- Test: `test/unit/shield-model.test.js`

**Interfaces:**
- Consumes: `blockableHostname(url)` from `src/main/adblock-exceptions.js` (returns lowercased, `www.`-stripped hostname for http(s) URLs, else `null`).
- Produces (used by Tasks 3, 5):
  - `shieldChipState({url, blockedCount, excepted, adblockEnabled})` → `{mode: 'hidden'|'quiet'|'count'|'off', count: number, title: string}`
  - `shieldPopoverModel({url, blockedCount, excepted, adblockEnabled})` → `null | {variant: 'site'|'global-off', host: string, on: boolean, countLine: string}`

- [ ] **Step 1: Write the failing test**

```js
// test/unit/shield-model.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shieldChipState, shieldPopoverModel } = require('../../src/main/shield-model');

const HTTP = 'https://www.theverge.com/article';

test('chip is hidden without a blockable host', () => {
  for (const url of ['blanc://newtab/', 'view-source:https://a.com/', '', null, 'devtools://x']) {
    assert.equal(shieldChipState({ url, blockedCount: 5, excepted: false, adblockEnabled: true }).mode, 'hidden');
  }
});

test('chip is quiet at zero blocked while protected', () => {
  const s = shieldChipState({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: true });
  assert.deepEqual(s, { mode: 'quiet', count: 0, title: 'Protected — click for site controls' });
});

test('chip counts while protected, singular at 1', () => {
  const many = shieldChipState({ url: HTTP, blockedCount: 12, excepted: false, adblockEnabled: true });
  assert.equal(many.mode, 'count');
  assert.equal(many.count, 12);
  assert.equal(many.title, 'Blanc blocked 12 ads & trackers on this page — click for site controls');
  const one = shieldChipState({ url: HTTP, blockedCount: 1, excepted: false, adblockEnabled: true });
  assert.equal(one.title, 'Blanc blocked 1 ad or tracker on this page — click for site controls');
});

test('chip is off when the site is excepted — site tooltip wins over global', () => {
  for (const adblockEnabled of [true, false]) {
    const s = shieldChipState({ url: HTTP, blockedCount: 0, excepted: true, adblockEnabled });
    assert.deepEqual(s, { mode: 'off', count: 0, title: 'Ads allowed on this site — click for site controls' });
  }
});

test('chip is off with the global tooltip when blocking is off everywhere', () => {
  const s = shieldChipState({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: false });
  assert.deepEqual(s, { mode: 'off', count: 0, title: 'Ad blocking is off — click for details' });
});

test('popover is null without a blockable host', () => {
  assert.equal(shieldPopoverModel({ url: 'blanc://settings/', blockedCount: 0, excepted: false, adblockEnabled: true }), null);
});

test('popover site variant, protection on, count lines', () => {
  const zero = shieldPopoverModel({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: true });
  assert.deepEqual(zero, { variant: 'site', host: 'theverge.com', on: true, countLine: 'Nothing blocked on this page yet' });
  const one = shieldPopoverModel({ url: HTTP, blockedCount: 1, excepted: false, adblockEnabled: true });
  assert.equal(one.countLine, '1 ad or tracker blocked on this page');
  const many = shieldPopoverModel({ url: HTTP, blockedCount: 12, excepted: false, adblockEnabled: true });
  assert.equal(many.countLine, '12 ads & trackers blocked on this page');
});

test('popover site variant when excepted — even with global blocking off', () => {
  for (const adblockEnabled of [true, false]) {
    const v = shieldPopoverModel({ url: HTTP, blockedCount: 0, excepted: true, adblockEnabled });
    assert.deepEqual(v, { variant: 'site', host: 'theverge.com', on: false, countLine: 'Ads allowed on this site' });
  }
});

test('popover global-off variant when not excepted and blocking is off', () => {
  const v = shieldPopoverModel({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: false });
  assert.deepEqual(v, { variant: 'global-off', host: 'theverge.com', on: false, countLine: 'Ad blocking is off everywhere' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/unit/shield-model.test.js`
Expected: FAIL — `Cannot find module '../../src/main/shield-model'`.

- [ ] **Step 3: Write the implementation**

```js
// src/main/shield-model.js
// Pure derivation for the island's shield chip and its site-protection
// popover (design: docs/superpowers/specs/2026-08-07-shield-popover-design.md).
// Main computes these and ships them on tabs:updated; the chrome renderers
// only render. An excepted site outranks the global switch here for the same
// reason it does in resolveBlockAdsCommand: the exception is what the user
// can see and undo from this site.

const { blockableHostname } = require('./adblock-exceptions');

function countPhrase(blocked) {
  return `${blocked} ${blocked === 1 ? 'ad or tracker' : 'ads & trackers'}`;
}

function shieldChipState({ url, blockedCount, excepted, adblockEnabled }) {
  if (!blockableHostname(url)) return { mode: 'hidden', count: 0, title: '' };
  if (excepted) {
    return { mode: 'off', count: 0, title: 'Ads allowed on this site — click for site controls' };
  }
  if (!adblockEnabled) {
    return { mode: 'off', count: 0, title: 'Ad blocking is off — click for details' };
  }
  const blocked = blockedCount ?? 0;
  if (blocked > 0) {
    return {
      mode: 'count',
      count: blocked,
      title: `Blanc blocked ${countPhrase(blocked)} on this page — click for site controls`,
    };
  }
  return { mode: 'quiet', count: 0, title: 'Protected — click for site controls' };
}

function shieldPopoverModel({ url, blockedCount, excepted, adblockEnabled }) {
  const host = blockableHostname(url);
  if (!host) return null;
  if (excepted) {
    return { variant: 'site', host, on: false, countLine: 'Ads allowed on this site' };
  }
  if (!adblockEnabled) {
    return { variant: 'global-off', host, on: false, countLine: 'Ad blocking is off everywhere' };
  }
  const blocked = blockedCount ?? 0;
  const countLine = blocked === 0
    ? 'Nothing blocked on this page yet'
    : `${countPhrase(blocked)} blocked on this page`;
  return { variant: 'site', host, on: true, countLine };
}

module.exports = { shieldChipState, shieldPopoverModel };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/unit/shield-model.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/shield-model.js test/unit/shield-model.test.js
git commit -m "feat(shield): pure chip-state and popover derivation model"
```

---

### Task 2: `chrome-layout.js` — shield popover bounds

**Files:**
- Modify: `src/main/chrome-layout.js` (add constants + `calculateShieldBounds`, export both)
- Test: `test/unit/chrome-layout.test.js` (append tests; don't touch existing ones)

**Interfaces:**
- Produces (used by Task 6): `calculateShieldBounds({windowWidth, stripHeight, anchorRight})` → `{x, y, width, height}`. `anchorRight` is the chip's right edge in window coordinates (may be `null`/undefined → falls back to centering under the pill's window-center).
- Exported constants: `SHIELD_POPOVER_WIDTH = 320`, `SHIELD_POPOVER_HEIGHT = 232`, `SHIELD_POPOVER_MARGIN = 12`.

- [ ] **Step 1: Write the failing tests** (append to `test/unit/chrome-layout.test.js`, matching its existing require/style)

```js
test('shield bounds sit below the strip, right-aligned to the anchor', () => {
  const b = calculateShieldBounds({ windowWidth: 1280, stripHeight: 64, anchorRight: 900 });
  assert.deepEqual(b, { x: 580, y: 64, width: 320, height: 232 });
});

test('shield bounds clamp to the window with a margin on both sides', () => {
  const left = calculateShieldBounds({ windowWidth: 1280, stripHeight: 64, anchorRight: 100 });
  assert.equal(left.x, 12);
  const right = calculateShieldBounds({ windowWidth: 1280, stripHeight: 64, anchorRight: 5000 });
  assert.equal(right.x, 1280 - 320 - 12);
});

test('shield bounds shrink on a window narrower than width + margins', () => {
  const b = calculateShieldBounds({ windowWidth: 300, stripHeight: 64, anchorRight: 200 });
  assert.equal(b.width, 300 - 24);
  assert.equal(b.x, 12);
});

test('shield bounds center under the window without an anchor', () => {
  const b = calculateShieldBounds({ windowWidth: 1000, stripHeight: 64, anchorRight: null });
  assert.equal(b.x, Math.round((1000 - 320) / 2));
});
```

Add `calculateShieldBounds` to the test file's existing `require('../../src/main/chrome-layout')` destructuring.

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/chrome-layout.test.js`
Expected: FAIL — `calculateShieldBounds is not a function`.

- [ ] **Step 3: Implement** (in `chrome-layout.js`, after the find constants near the top, and the function after `calculateChromeLayout`)

```js
// Shield popover (design: 2026-08-07-shield-popover-design.md). Fixed-size
// region like the find capsule: slightly taller than the drawn popover, the
// transparent remainder swallowing clicks is the same accepted trade-off as
// find's 160px band.
const SHIELD_POPOVER_WIDTH = 320;
const SHIELD_POPOVER_HEIGHT = 232;
const SHIELD_POPOVER_MARGIN = 12;
```

```js
/**
 * Bounds for the 'shield' overlay mode: below the strip, right edge aligned
 * to the chip's right edge (window coordinates), clamped inside the window.
 * @param {{windowWidth: number, stripHeight: number, anchorRight?: number|null}} input
 */
function calculateShieldBounds({ windowWidth, stripHeight, anchorRight }) {
  const winWidth = dimension(windowWidth);
  const width = Math.min(SHIELD_POPOVER_WIDTH, Math.max(0, winWidth - SHIELD_POPOVER_MARGIN * 2));
  const right = Number.isFinite(anchorRight)
    ? Math.round(anchorRight)
    : Math.round((winWidth + width) / 2);
  const x = Math.max(
    SHIELD_POPOVER_MARGIN,
    Math.min(right - width, winWidth - width - SHIELD_POPOVER_MARGIN)
  );
  return { x, y: dimension(stripHeight), width, height: SHIELD_POPOVER_HEIGHT };
}
```

Add `SHIELD_POPOVER_WIDTH`, `SHIELD_POPOVER_HEIGHT`, `SHIELD_POPOVER_MARGIN`, `calculateShieldBounds` to `module.exports`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/unit/chrome-layout.test.js`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/chrome-layout.js test/unit/chrome-layout.test.js
git commit -m "feat(shield): fixed popover bounds in the pure chrome-layout module"
```

---

### Task 3: main.js broadcast plumbing

**Files:**
- Modify: `src/main/main.js` — `serializeTabs()` (~line 939), `broadcastTabs()` (~line 1020), `runBlockAdsCommand()` / `runAllowAdsCommand()` (~lines 2384–2417), imports (top of file)

**Interfaces:**
- Consumes: `shieldChipState`, `shieldPopoverModel` from Task 1.
- Produces (used by Tasks 4, 5): the `tabs:updated` payload gains `adblockEnabled: boolean` and `shieldPopover: null | {variant, host, on, countLine}` at top level, and each serialized tab gains `shield: {mode, count, title}`.

- [ ] **Step 1: Import the model**

At the top of `main.js`, next to the existing `require('./adblock-exceptions')` line:

```js
const { shieldChipState, shieldPopoverModel } = require('./shield-model');
```

- [ ] **Step 2: Attach per-tab chip state in `serializeTabs()`**

Read the global flag once at the top of the function, and attach `shield` where `excepted` is already attached:

```js
function serializeTabs() {
  const { adblockEnabled } = settings.getSettings();
  return tabOrder
    .map((id) => tabs.get(id))
    .filter(Boolean)
    .map(({ view, ...rest }) => {
      // (existing excepted derivation comment stays)
      const excepted = isHostnameExcepted(rest.url);
      const shield = shieldChipState({
        url: rest.url,
        blockedCount: rest.blockedCount,
        excepted,
        adblockEnabled,
      });
      if (rest.private && rest.favicon) {
        // (existing private-favicon comment stays)
        return { ...rest, favicon: null, excepted, shield };
      }
      return { ...rest, excepted, shield };
    });
}
```

- [ ] **Step 3: Extend the broadcast payload**

In `broadcastTabs()`, add a helper right above it and two payload fields:

```js
/** The active tab's popover model, or null when it has no blockable host. */
function activeShieldPopover() {
  const tab = activeTabId ? tabs.get(activeTabId) : null;
  if (!tab) return null;
  return shieldPopoverModel({
    url: tab.url,
    blockedCount: tab.blockedCount,
    excepted: isHostnameExcepted(tab.url),
    adblockEnabled: settings.getSettings().adblockEnabled,
  });
}
```

```js
  const payload = {
    tabs: serializeTabs(),
    activeTabId,
    groups,
    tabLayout,
    adblockEnabled: settings.getSettings().adblockEnabled,
    shieldPopover: activeShieldPopover(),
    ...widthMetrics,
  };
```

- [ ] **Step 4: Broadcast after the adblock commands**

Both commands change shield-relevant state; today the chrome only catches up on the next incidental broadcast (the deferred reload). Add a deterministic one — in `runBlockAdsCommand()` and `runAllowAdsCommand()`, insert `broadcastTabs();` immediately after their `reloadTabAfterSettingsFanout(tab);` lines.

- [ ] **Step 5: Sanity-run the unit suite**

Run: `npm run test:unit`
Expected: PASS — nothing asserts the broadcast shape today, but this catches require-time typos.

- [ ] **Step 6: Commit**

```bash
git add src/main/main.js
git commit -m "feat(shield): derive chip + popover state in main and ship it on tabs:updated"
```

---

### Task 4: the chip — strip markup, styles, renderer

**Files:**
- Modify: `src/renderer/index.html:41` (the `pillShield` span)
- Modify: `src/renderer/renderer.js` (~lines 20, 148–152, 411–420, and the chip click handler near the pill handlers ~line 447)
- Modify: `src/renderer/styles.css` (~lines 853–873, the `.shield` block)

**Interfaces:**
- Consumes: `tab.shield = {mode, count, title}` from Task 3's broadcast; `window.browserAPI.openShieldPopover(anchor)` from Task 6 (wire the call now; it's a no-op until Task 6 lands — note this in the commit message).

- [ ] **Step 1: Replace the markup** (index.html line 41)

```html
        <button id="pillShield" class="shield" hidden>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l5 1.9v3.8c0 3.1-2.1 5.3-5 6.7-2.9-1.4-5-3.6-5-6.7V3.7z"/><path class="shield-slash" d="M3 3l10 10"/></svg>
          <span id="pillShieldCount"></span>
        </button>
```

- [ ] **Step 2: Restyle the chip** (styles.css — replace the existing `.shield` and `.shield.shield-off` rules; keep the "Ads deliberately allowed" comment but reword its strike-through sentence)

```css
.shield {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 7px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--accent-dim);
  color: var(--accent);
  flex: 0 0 auto;
  cursor: pointer;
}
.shield svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.shield .shield-slash { display: none; }
#pillShieldCount:empty { display: none; }

/* Protected but nothing blocked yet: a quiet landmark, not a badge. */
.shield.shield-quiet {
  background: transparent;
  color: var(--text-dim);
  padding: 1px 4px;
}

/* Ads deliberately allowed here (site exception or global off). The shield
   stays in place but reads as switched off — muted rather than alarming,
   since this is a state the user chose. The slashed glyph (not color alone)
   distinguishes it from the quiet protected state at a glance. */
.shield.shield-off {
  background: transparent;
  color: var(--text-dim);
  border-color: var(--border);
  padding: 1px 6px;
}
.shield.shield-off .shield-slash { display: block; }
```

- [ ] **Step 3: Render from the broadcast** (renderer.js)

Add next to the existing element lookups (~line 20):

```js
  const pillShieldCount = document.getElementById('pillShieldCount');
```

Delete `shieldTooltip()` and `EXCEPTED_SHIELD_TITLE` (~lines 148–152) — copy now lives in `shield-model.js`. Replace the shield block inside the pill-update function (~lines 411–420, keeping the comment but updating it):

```js
    // Shield chip: state fully derived in main (shield-model.js) and shipped
    // on the broadcast — the strip only renders. Always present on a page
    // with a blockable host, so the popover entry point never vanishes.
    const shield = tab?.shield ?? { mode: 'hidden', count: 0, title: '' };
    pillShield.hidden = shield.mode === 'hidden';
    pillShield.classList.toggle('shield-off', shield.mode === 'off');
    pillShield.classList.toggle('shield-quiet', shield.mode === 'quiet');
    pillShieldCount.textContent = shield.mode === 'count' ? String(shield.count) : '';
    pillShield.title = shield.title;
    pillShield.setAttribute('aria-label', shield.title);
```

- [ ] **Step 4: Wire the click** (next to the `pillPrivateChip`/`pillSourceChip` handlers, ~line 445)

```js
  // The chip toggles the site-protection popover; stopPropagation keeps the
  // pill's own click (open panel) out of it. Enter/Space come free — it's a
  // real <button>, and islandPill's keydown guard ignores focused children.
  pillShield.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = pillShield.getBoundingClientRect();
    window.browserAPI.openShieldPopover({ right: r.right });
  });
```

- [ ] **Step 5: Verify statically**

Run: `npm run test:unit && npm run substrate:check`
Expected: both PASS (the tokens checker parses `styles.css` with line-anchored regexes — this confirms the restructure didn't break it).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/renderer.js src/renderer/styles.css
git commit -m "feat(shield): render the chip as a button with quiet/count/off states

openShieldPopover is wired but inert until the main-process handler lands."
```

---

### Task 5: the popover — overlay markup, styles, renderer

**Files:**
- Modify: `src/renderer/overlay.html` (add `#shieldPop` after `#findBar`, ~line 83)
- Modify: `src/renderer/overlay.js` (element lookups ~line 22, `applyMode` ~line 986, `onOverlayHide` ~line 1050, the `tabs:updated` re-render ~line 1253)
- Modify: `src/renderer/styles.css` (popover styles near the `#findBar` block, ~line 1544)

**Interfaces:**
- Consumes: `state.shieldPopover` from Task 3's broadcast (already carries the global-off distinction via `variant`); existing `window.browserAPI.allowAdsOnActiveSite()`, `.toggleAdblock()`, `.openPage(name)`, `.closeOverlay()`.
- Produces: renders overlay mode `'shield'` (shown/hidden by Task 6's `overlay:show`/`overlay:hide`).

- [ ] **Step 1: Markup** (overlay.html, after the `#findBar` div)

```html
  <div id="shieldPop" hidden>
    <div class="shield-pop-head">
      <div class="shield-pop-id">
        <div id="shieldPopHost"></div>
        <div class="shield-pop-state">Protection <strong id="shieldPopOnOff">on</strong></div>
      </div>
      <button id="shieldPopToggle" role="switch" aria-checked="true" aria-label="Ad &amp; tracker protection for this site"><span class="knob"></span></button>
    </div>
    <div id="shieldPopCount"></div>
    <div id="shieldPopNote" class="shield-pop-note">Changing this reloads the page.</div>
    <button id="shieldPopSettings" class="shield-pop-footer">blocking settings →</button>
  </div>
```

- [ ] **Step 2: Styles** (styles.css, after the find-bar rules; shared tokens only, so light/dark/private come free)

```css
/* Site-protection popover ('shield' overlay mode). The overlay view's bounds
   are the fixed SHIELD_POPOVER_* region from chrome-layout.js; the drawn card
   is inset from its top-right corner. */
#shieldPop {
  position: absolute;
  top: 10px;
  left: 12px;
  right: 12px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-popover);
  padding: 14px 16px;
  font-size: 12.5px;
  color: var(--text);
}
#shieldPop[hidden] { display: none; }
.shield-pop-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
#shieldPopHost {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shield-pop-id { min-width: 0; }
.shield-pop-state { margin-top: 2px; }
#shieldPopCount { color: var(--text-dim); font-size: 11.5px; margin-top: 6px; }
.shield-pop-note { color: var(--text-dim); font-size: 11.5px; margin-top: 4px; }
.shield-pop-note[hidden] { display: none; }
#shieldPopToggle {
  appearance: none;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  position: relative;
  flex: 0 0 auto;
  cursor: pointer;
  padding: 0;
}
#shieldPopToggle[hidden] { display: none; }
#shieldPopToggle .knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: left 120ms ease, background 120ms ease;
}
#shieldPopToggle.on { background: var(--accent); border-color: var(--accent); }
#shieldPopToggle.on .knob { left: 16px; background: var(--bg); }
.shield-pop-footer {
  appearance: none;
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  font: inherit;
  font-size: 11.5px;
  margin-top: 10px;
  padding: 8px 0 0;
  cursor: pointer;
}
.shield-pop-footer:hover { color: var(--text); }
```

- [ ] **Step 3: Renderer wiring** (overlay.js)

Element lookups next to `findBar` (~line 22):

```js
  const shieldPop = document.getElementById('shieldPop');
  const shieldPopHost = document.getElementById('shieldPopHost');
  const shieldPopOnOff = document.getElementById('shieldPopOnOff');
  const shieldPopToggle = document.getElementById('shieldPopToggle');
  const shieldPopCount = document.getElementById('shieldPopCount');
  const shieldPopNote = document.getElementById('shieldPopNote');
  const shieldPopSettings = document.getElementById('shieldPopSettings');
```

Render function (near `resetFind`):

```js
  // Renders from the last tabs:updated broadcast — main recomputes
  // state.shieldPopover on every broadcast, so a toggle flip or a load's
  // climbing block count re-renders live while the popover is open.
  function renderShieldPop() {
    const v = state.shieldPopover;
    if (!v) { window.browserAPI.closeOverlay(); return; }
    shieldPopHost.textContent = v.host;
    shieldPopOnOff.textContent = v.on ? 'on' : 'off';
    shieldPopToggle.hidden = v.variant !== 'site';
    shieldPopToggle.classList.toggle('on', v.on);
    shieldPopToggle.setAttribute('aria-checked', String(v.on));
    shieldPopCount.textContent = v.countLine;
    shieldPopNote.hidden = v.variant !== 'site';
  }
```

In `applyMode`, alongside `findBar.hidden = next !== 'find';` add:

```js
    shieldPop.hidden = next !== 'shield';
```

and extend the mode branch chain:

```js
    } else if (next === 'shield') {
      renderShieldPop();
      (shieldPopToggle.hidden ? shieldPopSettings : shieldPopToggle).focus();
    }
```

In the `onOverlayHide` handler add `shieldPop.hidden = true;` next to `findBar.hidden = true;`.

In the `onTabsUpdated` handler, next to the existing `if (mode === 'panel' || mode === 'palette') renderList();` (~line 1253) add:

```js
    if (mode === 'shield') renderShieldPop();
```

Click handlers (after the render function):

```js
  shieldPopToggle.addEventListener('click', () => {
    // on → allow ads here; off (excepted) → re-block here. The popover only
    // shows this switch in the 'site' variant, so toggleAdblock can never
    // reach its global branch from the pill.
    if (state.shieldPopover?.on) window.browserAPI.allowAdsOnActiveSite();
    else window.browserAPI.toggleAdblock();
  });
  shieldPopSettings.addEventListener('click', () => {
    window.browserAPI.closeOverlay();
    window.browserAPI.openPage('settings');
  });
```

- [ ] **Step 4: Sanity checks**

Run: `npm run test:unit && npm run substrate:check`
Expected: PASS (copy checker parses `overlay.js` — confirms the additions didn't trip its regexes).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/overlay.html src/renderer/overlay.js src/renderer/styles.css
git commit -m "feat(shield): site-protection popover markup, styles, and overlay rendering"
```

---

### Task 6: main-process wiring — mode, bounds, open/close, dismissals

**Files:**
- Modify: `src/main/main.js` — overlayMode JSDoc (~line 628), `overlayBounds()` (~line 662), `hideOverlay()` (~line 785), the `chrome:open-find` handler area (~line 2508), `focusAddressBar()` (~line 2277), the find-dismissal in tab switching (~line 1976), `did-start-navigation` (~line 1733)
- Modify: `src/main/preload.js` — one bridge method (~line 54)

**Interfaces:**
- Consumes: `calculateShieldBounds` + constants (Task 2), `activeShieldPopover()` (Task 3), overlay `'shield'` rendering (Task 5).
- Produces: `browserAPI.openShieldPopover({right})` (consumed by Task 4's chip click).

- [ ] **Step 1: Preload bridge** (preload.js, next to `openFindBar`)

```js
  openShieldPopover: (anchor) => ipcRenderer.send('chrome:open-shield', anchor),
```

- [ ] **Step 2: Mode + bounds** (main.js)

Update the JSDoc at ~line 628: `/** @type {null | 'panel' | 'palette' | 'find' | 'shield'} */`

Add state next to `overlayPrefill`:

```js
/** Chip right edge (window coords) captured when the shield popover opens;
 * reused if bounds recompute (e.g. window resize) while it's up. */
let shieldAnchorRight = null;
```

Extend `overlayBounds()`:

```js
function overlayBounds() {
  const layout = currentChromeLayout();
  if (overlayMode === 'find') return layout.findBounds;
  if (overlayMode === 'palette') return layout.paletteBounds;
  if (overlayMode === 'shield') {
    return calculateShieldBounds({
      windowWidth: win.getContentBounds().width,
      stripHeight: chromeHeight,
      anchorRight: shieldAnchorRight,
    });
  }
  return layout.panelBounds;
}
```

Add `calculateShieldBounds` to the existing `require('./chrome-layout')` destructuring at the top of main.js.

- [ ] **Step 3: Open/toggle handler** (next to `chromeOn('chrome:open-find', ...)`)

```js
  chromeOn('chrome:open-shield', (_e, anchor) => {
    // Chip re-click closes — the chip is a toggle for the popover itself.
    if (overlayMode === 'shield') return hideOverlay({ refocusContent: false });
    if (!activeShieldPopover()) return; // no blockable host — nothing to show
    shieldAnchorRight = Number.isFinite(anchor?.right) ? anchor.right : null;
    broadcastTabs(); // fresh state.shieldPopover before the overlay renders
    showOverlay('shield');
  });
```

- [ ] **Step 4: Dismissals**

1. **Tab switch:** at ~line 1976 the existing `if (overlayMode === 'find') hideOverlay({ refocusContent: false });` becomes:

```js
  if (overlayMode === 'find' || overlayMode === 'shield') hideOverlay({ refocusContent: false });
```

(Verify the surrounding function is the tab-activation path before editing; if find is dismissed in more than one call site, extend only the tab-switch one.)

2. **Site-changing navigation:** in the `did-start-navigation` listener at ~line 1733 (the one bumping `navEpoch`), add after the epoch bump:

```js
    // The popover describes one site's protection. Same-site navigations —
    // including the reload its own toggle triggers — keep it open, live-
    // updating; leaving the site (or losing the host) closes it.
    if (
      isMainFrame
      && overlayMode === 'shield'
      && id === activeTabId
      && blockableHostname(url) !== activeShieldPopover()?.host
    ) {
      hideOverlay({ refocusContent: false });
    }
```

Note: this listener's current signature is `(_e, _url, _isInPlace, isMainFrame)` — rename the unused params (`_e, url, _isInPlace, isMainFrame`) and use the tab's `id` from the enclosing closure (`createTab`'s `wc` listeners close over `id`; confirm and adapt to the actual closure variable).

3. **Blur and Escape:** no change needed — the existing blur handler dismisses every mode except `'find'`, and Escape dismisses any mode. Confirm by reading `createOverlay()`; don't add duplicate handlers.

- [ ] **Step 5: Fix `focusAddressBar` mode leak** (~line 2277)

The blank-tab focus reclaim must never re-show a shield popover as "the island". Replace:

```js
  showOverlay(overlayMode && overlayMode !== 'find' ? overlayMode : 'panel');
```

with:

```js
  // Reasserts must not downgrade an already-summoned palette to a panel —
  // nor promote a non-island mode (find, shield) into staying up.
  showOverlay(overlayMode === 'palette' ? 'palette' : 'panel');
```

- [ ] **Step 6: Clear the anchor on hide** (in `hideOverlay`, next to `overlayMode = null;`)

```js
  shieldAnchorRight = null;
```

Guard the ordering: `overlayBounds()` is never called after this point in `hideOverlay`, so clearing is safe.

- [ ] **Step 7: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/main.js src/main/preload.js
git commit -m "feat(shield): 'shield' overlay mode — open/toggle IPC, bounds, dismissal rules"
```

---

### Task 7: docs — CLAUDE.md, spec features & parity matrix

**Files:**
- Modify: `CLAUDE.md` (the overlay-modes sentence in the Architecture section)
- Modify: `spec/features.md` (F12)
- Modify: `spec/parity-matrix.md` (F1 and F12 notes)

- [ ] **Step 1: CLAUDE.md** — in the paragraph beginning "**The island's expanded states live in a separate always-on-top overlay**", extend the mode list sentence with:

```
; `'shield'` — the site-protection popover opened from the pill's shield chip (fixed `calculateShieldBounds` region below the strip, right-aligned to the chip; site-scoped toggle reusing the /allow-ads//block-ads command paths; dismissed like panel/palette plus on tab switch and site-changing navigation)
```

- [ ] **Step 2: spec/features.md F12** — read the current F12 wording first, then append a requirement bullet in its established numbering style:

```
The pill's shield chip is a clickable control: always present on pages with a blockable host (quiet glyph at zero, live count while blocking, slashed when off), opening a site-protection popover with a single site-scoped toggle (allow ads here / re-block here), the blocked count in plain language, a reload notice, and a link to blocking settings. Global blocking is deliberately not togglable from the pill. (Desktop SHIPPED; mobile PLANNED. Count line follows D13 on iOS: binary protected/paused, no number.)
```

- [ ] **Step 3: spec/parity-matrix.md** — in the F1 row's notes, after "shield count", add `(clickable → site-protection popover on desktop)`. In the F12 row's notes, after "per-site allow and re-block from the same command", add `; shield chip opens a site-protection popover (desktop)`.

- [ ] **Step 4: Verify guards**

Run: `npm run test:unit && npm run substrate:check`
Expected: PASS — `public-truth.test.js` and the parity guards must not object; if a guard test pins spec wording, update it in this same commit (memory rule: guard test and policy change land together).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md spec/features.md spec/parity-matrix.md
git commit -m "docs(shield): record the shield popover in CLAUDE.md, F12, and the parity matrix"
```

---

### Task 8: full verification in the running app

**Files:** none (verification only; fix-forward anything found, committing fixes to the tasks' files)

- [ ] **Step 1: Static gates**

Run: `npm run test:unit && npm run substrate:check && npm run test:acceptance:dry`
Expected: all PASS.

- [ ] **Step 2: Relaunch the dev app**

Kill any running dev instance, then `npm start` (chrome documents only load at window creation). Leave this instance open at the end of the session (user's standing rule).

- [ ] **Step 3: Manual/Playwright checklist** (Playwright-first per the user's workflow; the dev instance steals focus — expected)

- Quiet page (e.g. `example.org`): dim glyph, no number; tooltip "Protected — click for site controls".
- Ad-heavy page (e.g. `theverge.com`): accent chip with climbing count.
- Click chip → popover below the strip, right-aligned to the chip; host mono + ellipsis on a long hostname; count line matches the chip.
- Flip toggle off → page reloads with ads, chip slashes, popover stays open showing "Protection **off**" / "Ads allowed on this site".
- Flip back on → re-blocks, reloads, popover updates.
- Turn blocking off globally in Settings → chip slashed everywhere; popover shows "Ad blocking is off everywhere", no toggle, footer focused on open.
- Dismissals: Esc; click into the page (blur); chip re-click; tab switch; navigating to a different site closes it, same-site navigation keeps it open.
- ⌘L while popover open → palette replaces it; Esc closes palette cleanly.
- New blank tab (⌘T) while popover open → island panel focused, no stuck shield mode (the `focusAddressBar` fix).
- Private tab on a web page: chip present, popover works, private theme applied.
- Dark mode: popover/chips legible (cycle via `/theme`).
- `blanc://` pages and `view-source:` tabs: no chip.

- [ ] **Step 4: Commit any fixes, then hand off**

Follow `superpowers:finishing-a-development-branch` — the user decides on PR/merge (every PR is squash-merged in this repo).
