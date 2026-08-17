# Blank-Tab Pill Affordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the resting island legible as a place to type when the active tab is blank — a caret, dim prompt text, and a clickable `/` chip — and make typing on a blank tab actually open the island with that character.

**Architecture:** One pure, shared keyboard-gate module served to both the chrome strip and the start page; one pure main-side validator behind all three IPC entry points; a placeholder branch in the pill's label renderer guarded against rebuild-per-broadcast.

**Tech Stack:** Electron (main + three sandboxed renderers, `contextIsolation: true`, `nodeIntegration: false`), vanilla JS, `node --test` for unit tests, Cucumber + Playwright-Electron for acceptance.

**Spec:** `docs/superpowers/specs/2026-08-16-blank-tab-pill-affordance-design.md`

## Global Constraints

- **Relaunch to verify.** Chrome documents load once at window creation. `Cmd/Ctrl+R` reloads the active tab's `WebContentsView`, not the chrome. Any visual check requires killing and re-running `npm start`.
- **Empty state only.** A loaded page's pill is untouched. Never make the pill advertise editability when it is showing a domain.
- **No new `:root` custom properties.** Use existing tokens only (`--text`, `--text-dim`, `--border`, `--accent`, `--font-mono`, `--pill-zoom`). A new token would require updating `tokens/tokens.json` and running `npm run tokens:build`, and `substrate:check` fails otherwise.
- **Counter-scale everything inside the pill.** `#islandPill` sets `zoom: var(--pill-zoom)`. Any px value on a pill child must be written `calc(Npx / var(--pill-zoom))` so it tracks the one factor, matching `#pillDomain`'s existing `font-size`.
- **The client-side check is never trusted alone.** Main re-validates every renderer-supplied character. The duplication between the renderer gate and the main validator is deliberate defence in depth, not drift.
- **Copy is fixed:** the placeholder string is exactly `Search or type a URL`. The chip's label is exactly `/`.
- **Every user-visible string stays out of `copy/`, `tokens/`, `settings-schema/`.** Verified: no substrate covers these. `npm run substrate:check` must still pass unchanged.
- **Commit after each task.** Never batch.

## File Structure

| File | Responsibility |
|---|---|
| `src/renderer/pages/type-to-open.js` | **New.** Pure keyboard gate: does this keystroke mean "open the island with this character?" No DOM, no IPC. Shared by both renderers. |
| `src/main/island-typing.js` | **New.** Pure validator: is this a legal prefill character? No `require('electron')`. |
| `src/main/chrome-protocol.js` | Allowlist the shared gate for the chrome document. |
| `src/renderer/index.html` | Caret span inside `#pillDomain`; `#pillSlash` button; load the gate. |
| `src/renderer/styles.css` | `.placeholder`, `.pill-caret` + keyframes, `.pill-slash`, reduced-motion. |
| `src/renderer/renderer.js` | Placeholder branch behind a mode guard; chip wiring; extend the existing pill keydown. |
| `src/renderer/pages/newtab.html` | Load the gate before `newtab.js`. |
| `src/renderer/pages/newtab.js` | Document keydown → `start.openIsland(char)`. |
| `src/main/preload.js` | `openIslandCommands()` / `openIslandTyping(char)` on `browserAPI`. |
| `src/main/tab-preload.js` | `start.openIsland(char)`. |
| `src/main/pages.js` | `pages:start:open-island` handler, newtab-sender validated. |
| `src/main/main.js` | `openIslandTyping()` helper, two `chromeOn` registrations, `startPage.openIsland` hook. |

---

### Task 1: The shared keyboard gate

Both renderers must answer the same question — "is this keystroke text the user wants to search with?" — and they must answer it identically. This task builds it once as a pure module and proves the platform and AltGr branches with tests that fail against the naive implementation.

**Files:**
- Create: `src/renderer/pages/type-to-open.js`
- Modify: `src/main/chrome-protocol.js:19-25` (the `SHARED_ASSETS` set)
- Test: `test/unit/type-to-open-gate.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `globalThis.blancTypeToOpen.isTypeToOpenKey(event, isMac) → boolean`. `event` needs `key`, `isComposing`, `metaKey`, `ctrlKey`, `altKey`, and `getModifierState(name)`. Tasks 4 and 5 both call this.

- [ ] **Step 1: Write the failing test**

Create `test/unit/type-to-open-gate.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');
const source = fs.readFileSync(
  path.join(ROOT, 'src/renderer/pages/type-to-open.js'),
  'utf8',
);

// The module is a classic script that assigns to globalThis (both documents
// load it with a plain <script> under `script-src 'self'`), so a fresh vm
// context is the whole harness — no DOM, no bundler.
const context = {};
vm.runInNewContext(source, context);
const { isTypeToOpenKey } = context.blancTypeToOpen;

/** Build a KeyboardEvent-shaped object. `altGraph` drives getModifierState. */
function key(k, { altGraph = false, ...flags } = {}) {
  return {
    key: k,
    isComposing: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...flags,
    getModifierState: (name) => (name === 'AltGraph' ? altGraph : false),
  };
}

test('plain printable characters open the island', () => {
  assert.equal(isTypeToOpenKey(key('g'), false), true);
  assert.equal(isTypeToOpenKey(key('G', { shiftKey: true }), false), true);
  assert.equal(isTypeToOpenKey(key('7'), false), true);
  // The chip teaches "/" and the character has to do what the chip does.
  assert.equal(isTypeToOpenKey(key('/'), false), true);
});

test('non-text keys and whitespace are rejected', () => {
  assert.equal(isTypeToOpenKey(key('Enter'), false), false);
  assert.equal(isTypeToOpenKey(key('Tab'), false), false);
  assert.equal(isTypeToOpenKey(key('ArrowLeft'), false), false);
  assert.equal(isTypeToOpenKey(key('Dead'), false), false);
  assert.equal(isTypeToOpenKey(key(' '), false), false);
  assert.equal(isTypeToOpenKey(key('g', { isComposing: true }), false), false);
});

test('command-intent modifiers are rejected', () => {
  assert.equal(isTypeToOpenKey(key('t', { metaKey: true }), true), false);
  assert.equal(isTypeToOpenKey(key('t', { metaKey: true }), false), false);
  assert.equal(isTypeToOpenKey(key('r', { ctrlKey: true }), false), false);
  assert.equal(isTypeToOpenKey(key('r', { ctrlKey: true }), true), false);
});

// AltGr reports ctrlKey AND altKey on Windows and Linux. A blanket
// `ctrlKey || altKey` rejection drops the entire AltGr layer — "@" on a
// German layout, "ą" on Polish. This test fails against that implementation.
test('the AltGr layer is accepted', () => {
  assert.equal(isTypeToOpenKey(key('@', { ctrlKey: true, altKey: true, altGraph: true }), false), true);
  assert.equal(isTypeToOpenKey(key('ą', { ctrlKey: true, altKey: true, altGraph: true }), false), true);
});

// Bare Option on macOS is text entry, not a shortcut: every Alt accelerator
// Blanc registers is CmdOrCtrl+Alt+… (main.js:4294, :4333-4336), already
// covered by metaKey. Off macOS, bare Alt IS command intent. The gate is
// platform-dependent, so both branches are asserted rather than whichever
// one the host happens to be.
test('bare Alt is text on macOS and a command elsewhere', () => {
  assert.equal(isTypeToOpenKey(key('ø', { altKey: true }), true), true);
  assert.equal(isTypeToOpenKey(key('∑', { altKey: true }), true), true);
  assert.equal(isTypeToOpenKey(key('f', { altKey: true }), false), false);
});

// event.key for an astral character is length 2 in UTF-16. Counting code
// points keeps this gate in agreement with the main-side validator, which
// accepts one astral character.
test('one astral code point counts as one character', () => {
  assert.equal(isTypeToOpenKey(key('😀'), false), true);
  assert.equal(isTypeToOpenKey(key('ab'), false), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/type-to-open-gate.test.js`
Expected: FAIL — `ENOENT: no such file or directory` opening `src/renderer/pages/type-to-open.js`.

- [ ] **Step 3: Write the module**

Create `src/renderer/pages/type-to-open.js`:

```js
// Shared by the chrome strip (renderer.js) and the start page (newtab.js):
// both have to decide whether a keystroke on a blank tab means "open the
// island and start typing there". Written once so the two documents cannot
// drift, and kept pure (no DOM, no IPC) so test/unit can run it in a vm.
//
// Served to blanc://newtab flat out of this directory, and to the chrome
// document via SHARED_ASSETS in chrome-protocol.js.
(() => {
  'use strict';

  /**
   * @param {KeyboardEvent} event
   * @param {boolean} isMac
   * @returns {boolean} true when the keystroke is text the user means to
   *   search with, rather than a shortcut or a navigation key.
   */
  function isTypeToOpenKey(event, isMac) {
    if (event.isComposing) return false;
    // Code points, not UTF-16 units — one astral character is one character,
    // and this must agree with island-typing.js on the main side.
    if ([...event.key].length !== 1) return false;
    if (!event.key.trim()) return false;

    if (event.metaKey) return false;

    // AltGr reports ctrlKey AND altKey on Windows and Linux. Rejecting those
    // blanket would drop the whole AltGr layer ("@" on German, "ą" on
    // Polish) — ordinary characters people start searches with.
    const altGraph = typeof event.getModifierState === 'function'
      && event.getModifierState('AltGraph');
    if (altGraph) return true;

    if (event.ctrlKey) return false;
    // Bare Option on macOS is text entry (ø, ∑). Blanc reserves nothing under
    // it: every Alt accelerator it registers is CmdOrCtrl+Alt+… and metaKey
    // already rejects those. Off macOS, bare Alt is command intent.
    if (event.altKey && !isMac) return false;

    return true;
  }

  globalThis.blancTypeToOpen = { isTypeToOpenKey };
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/type-to-open-gate.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Allowlist the file for the chrome document**

`src/main/chrome-protocol.js` fails closed on any path not explicitly listed. Add one entry to `SHARED_ASSETS` (currently `:19-25`):

```js
const SHARED_ASSETS = new Set([
  '/styles.css',
  '/panel-left.svg',
  '/pages/icon.svg',
  '/pages/inter-latin.woff2',
  '/pages/jetbrains-mono-latin.woff2',
  // Pure keyboard-gate logic, no IPC and no application data — the chrome
  // strip and the start page share one copy so they cannot disagree.
  '/pages/type-to-open.js',
]);
```

- [ ] **Step 6: Add the allowlist assertion to the test**

Append to `test/unit/type-to-open-gate.test.js`:

```js
// The chrome document can only load what chrome-protocol.js allows. Without
// this entry the <script> tag in index.html 404s and the pill's keyboard
// path silently does nothing.
test('the chrome scheme serves the shared gate', () => {
  const protocolSource = fs.readFileSync(
    path.join(ROOT, 'src/main/chrome-protocol.js'),
    'utf8',
  );
  assert.match(protocolSource, /'\/pages\/type-to-open\.js'/);
});
```

- [ ] **Step 7: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/pages/type-to-open.js src/main/chrome-protocol.js test/unit/type-to-open-gate.test.js
git commit -m "Add the shared type-to-open keyboard gate"
```

---

### Task 2: Main-side validator and the IPC path

Three entry points open the island with a prefill. This builds the single validated helper behind all of them, plus the bridge methods the sandboxed renderers need to reach it.

**Files:**
- Create: `src/main/island-typing.js`
- Modify: `src/main/main.js` (helper + two `chromeOn` + `startPage` hook), `src/main/pages.js`, `src/main/preload.js:85`, `src/main/tab-preload.js:22-31`
- Test: `test/unit/island-typing.test.js`

**Interfaces:**
- Consumes: `showOverlay(mode, { prefill })` (`main.js:1697`), already consumed by `applyMode` (`overlay.js:1245`).
- Produces:
  - `require('./island-typing').isValidPrefillChar(char) → boolean`
  - `window.browserAPI.openIslandCommands()` — no argument (Task 4)
  - `window.browserAPI.openIslandTyping(char)` (Task 4)
  - `window.bowserPages.start.openIsland(char)` (Task 5)

- [ ] **Step 1: Write the failing test**

Create `test/unit/island-typing.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { isValidPrefillChar } = require('../../src/main/island-typing');

const ROOT = path.join(__dirname, '../..');

test('exactly one non-whitespace code point is valid', () => {
  assert.equal(isValidPrefillChar('g'), true);
  assert.equal(isValidPrefillChar('/'), true);
  assert.equal(isValidPrefillChar('ą'), true);
  // Counted as one code point, matching the renderer gate.
  assert.equal(isValidPrefillChar('😀'), true);
});

test('anything else is rejected', () => {
  assert.equal(isValidPrefillChar(''), false);
  assert.equal(isValidPrefillChar('ab'), false);
  assert.equal(isValidPrefillChar(' '), false);
  assert.equal(isValidPrefillChar('\n'), false);
  assert.equal(isValidPrefillChar('\u00A0'), false); // nbsp
  assert.equal(isValidPrefillChar(null), false);
  assert.equal(isValidPrefillChar(undefined), false);
  assert.equal(isValidPrefillChar(7), false);
  assert.equal(isValidPrefillChar({}), false);
});

// NUL is not whitespace, so trim() alone lets it through and the "printable"
// contract would be a lie. These prove it holds.
test('control and format code points are rejected', () => {
  assert.equal(isValidPrefillChar('\u0000'), false); // NUL
  assert.equal(isValidPrefillChar('\u001b'), false); // ESC
  assert.equal(isValidPrefillChar('\u007f'), false); // DEL
  assert.equal(isValidPrefillChar('\u200b'), false); // zero-width space
  assert.equal(isValidPrefillChar('\ufeff'), false); // BOM
});

// The page handler passes its payload through unchanged, so a non-string
// actually reaches the validator instead of arriving pre-coerced. Coercing
// with String(char ?? '') upstream would turn a numeric 7 into a valid '7'
// and make the typeof check above unreachable on that path.
test('the page handler does not coerce its payload before validating', () => {
  const pagesSource = fs.readFileSync(path.join(ROOT, 'src/main/pages.js'), 'utf8');
  const handler = pagesSource.match(/'pages:start:open-island',[\s\S]*?\n  \);/)?.[0];
  assert.ok(handler, 'pages:start:open-island handler not found');
  assert.doesNotMatch(
    handler,
    /String\(/,
    'pass char through unchanged — coercion defeats the validator type check',
  );
});

// The gate is only worth anything if every path actually goes through it.
test('main funnels all three entry points through the helper', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
  assert.match(mainSource, /chromeOn\('chrome:open-island-commands'/);
  assert.match(mainSource, /chromeOn\('chrome:open-island-typing'/);
  // The no-payload channel calls the same helper with a literal '/', so there
  // is never a validated path beside an unvalidated one.
  assert.match(mainSource, /openIslandTyping\('\/'\)/);
  assert.match(mainSource, /isValidPrefillChar/);
});

// contextIsolation + sandbox mean a renderer cannot reach ipcRenderer except
// through these bridges. A channel registered in main with no preload method
// is unreachable and fails silently.
test('both chrome channels have a browserAPI bridge method', () => {
  const preloadSource = fs.readFileSync(path.join(ROOT, 'src/main/preload.js'), 'utf8');
  assert.match(preloadSource, /openIslandCommands:.*'chrome:open-island-commands'/);
  assert.match(preloadSource, /openIslandTyping:.*'chrome:open-island-typing'/);
});

test('the start page bridge exposes openIsland', () => {
  const tabPreloadSource = fs.readFileSync(path.join(ROOT, 'src/main/tab-preload.js'), 'utf8');
  assert.match(tabPreloadSource, /openIsland:.*'pages:start:open-island'/);
  const pagesSource = fs.readFileSync(path.join(ROOT, 'src/main/pages.js'), 'utf8');
  // Sender-validated to the newtab page, like every other pages:* channel.
  assert.match(pagesSource, /'pages:start:open-island',\s*\n?\s*'newtab'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/island-typing.test.js`
Expected: FAIL — `Cannot find module '../../src/main/island-typing'`.

- [ ] **Step 3: Write the validator module**

Create `src/main/island-typing.js`:

```js
'use strict';

// Pure policy, no require('electron') — same rule as tab-sleep.js, so the
// validator is unit-testable without booting an app.
//
// This deliberately duplicates the length/whitespace logic in the renderer's
// type-to-open.js. The renderer check keeps the panel from opening on a
// keystroke that isn't text; this one is the trust boundary. A renderer is
// never trusted to have run its own check.

// \p{C} is Unicode's "other" category — control (Cc), format (Cf), surrogate
// (Cs), private-use (Co), unassigned (Cn). None of them are a character
// someone means to search for, and NUL is not whitespace, so trim() alone
// would let it through and the "printable" contract would be a lie.
const NON_PRINTABLE = /\p{C}/u;

/**
 * A prefill character must be exactly one printable, non-whitespace code
 * point. Code points rather than UTF-16 units, so a single astral character
 * (an emoji from a picker) is one character and not a length-2 string.
 *
 * Stricter than the renderer's gate on purpose. The renderer only ever sees
 * a real `event.key`, which is never a raw control character; this is the
 * trust boundary, where the payload is whatever a renderer chose to send.
 * @param {unknown} char
 * @returns {boolean}
 */
function isValidPrefillChar(char) {
  return typeof char === 'string'
    && [...char].length === 1
    && char.trim() !== ''
    && !NON_PRINTABLE.test(char);
}

module.exports = { isValidPrefillChar };
```

- [ ] **Step 4: Add the helper and channels to main.js**

Near the other overlay helpers in `src/main/main.js` (after `showOverlay`, which is at `:1697`), add:

```js
// The one place a typed character opens the island. The start page, the
// pill's own keydown, and the "/" chip all funnel here so there is never a
// validated path beside an unvalidated one. showOverlay's prefill is already
// consumed by applyMode in overlay.js; main.js:4345 is the existing
// precedent, passing '/group ' from the menu.
function openIslandTyping(char) {
  if (!isValidPrefillChar(char)) return;
  showOverlay('panel', { prefill: char });
}
```

Add the require alongside the other `src/main` requires at the top of the file:

```js
const { isValidPrefillChar } = require('./island-typing');
```

Register both channels beside the existing `chrome:open-island` registration at `:3872`:

```js
  chromeOn('chrome:open-island', () => showOverlay('panel'));
  // The "/" chip. No payload — the prefill is fixed, so nothing crosses IPC
  // that needs validating; it goes through the helper anyway so there is one
  // path that opens the panel with a prefill.
  chromeOn('chrome:open-island-commands', () => openIslandTyping('/'));
  // The pill's own keydown, when the pill holds keyboard focus.
  chromeOn('chrome:open-island-typing', (_e, char) => openIslandTyping(char));
```

Add the hook to the `startPage` object at `:5235`, beside `setLayout`:

```js
      openIsland: (char) => openIslandTyping(char),
```

- [ ] **Step 5: Add the pages handler**

In `src/main/pages.js`, beside the other `pages:start:*` handlers (`:247-257`):

```js
  // Type-to-open from the start page. Main re-validates the character in
  // openIslandTyping — the renderer's own gate is not trusted alone.
  //
  // Deliberately NOT String(char ?? '') like the neighbouring handlers: those
  // coerce because their validators take strings by contract, but coercing
  // here would turn a numeric 7 into a valid '7' and make the validator's own
  // typeof check dead code. The payload is passed through untouched so the
  // one validator sees what the renderer actually sent.
  handle(
    'pages:start:open-island',
    'newtab',
    (char) => hooks.startPage?.openIsland?.(char),
  );
```

- [ ] **Step 6: Add the bridge methods**

In `src/main/preload.js`, beside `openIsland` at `:85`:

```js
  openIsland: () => ipcRenderer.send('chrome:open-island'),
  openIslandCommands: () => ipcRenderer.send('chrome:open-island-commands'),
  openIslandTyping: (char) => ipcRenderer.send('chrome:open-island-typing', char),
```

In `src/main/tab-preload.js`, inside the `start` namespace (`:22-31`), beside `setLayout`:

```js
        openIsland: (char) => invoke('pages:start:open-island', char),
```

- [ ] **Step 7: Run the tests**

Run: `node --test test/unit/island-typing.test.js`
Expected: PASS, 5 tests.

Run: `npm run test:unit`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/main/island-typing.js src/main/main.js src/main/pages.js src/main/preload.js src/main/tab-preload.js test/unit/island-typing.test.js
git commit -m "Add the validated island-typing path and its IPC bridges"
```

---

### Task 3: The pill placeholder and caret

The visible change. A blank tab's pill stops saying `new tab` and starts showing a caret plus dim prompt text.

**Files:**
- Modify: `src/renderer/index.html:33` (add `#pillSlash`), `:133-134` (load the gate), `src/renderer/styles.css`, `src/renderer/renderer.js:568-573`
- Test: `test/unit/blank-tab-pill.test.js`

**Interfaces:**
- Consumes: `tabDomain(tab)` (`renderer.js:292`), which already returns `''` for `blanc://newtab`.
- Produces: `pillLabelMode(tab) → 'loading' | 'domain' | 'placeholder'`, lifted by the test. `#pillSlash` in the DOM for Task 4 to wire.

- [ ] **Step 1: Write the failing test**

Create `test/unit/blank-tab-pill.test.js`:

```js
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

test('the placeholder DOM is rebuilt only on a mode change', () => {
  // tabs:updated arrives ~10/s while anything loads. Rebuilding the caret on
  // every broadcast restarts its animation, turning the 4-blink cue into a
  // permanent blink — the exact thing the design rejected.
  const fn = rendererSource.match(/function renderPillLabel\(tab\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(fn, 'renderPillLabel not found in renderer.js — update this test with it');
  assert.match(fn, /next !== labelMode/,
    'renderPillLabel must guard its rebuild on a mode transition');
  assert.match(fn, /replaceChildren/);
});

test('the caret blinks a bounded number of times and then rests visible', () => {
  const caret = styles.match(/\.pill-caret \{[\s\S]*?\}/)?.[0];
  assert.ok(caret, '.pill-caret rule not found in styles.css');
  // Four iterations, not infinite: the pill sits above every page.
  assert.match(caret, /animation:\s*pill-caret-blink[^;]*\s4;/);
  assert.doesNotMatch(caret, /infinite/);
  // animation-fill-mode: forwards would freeze it on the keyframe's final
  // opacity: 0 and leave no caret at all. Reverting to the default is the
  // wanted resting state.
  assert.doesNotMatch(caret, /forwards/);
  assert.match(styles, /@keyframes pill-caret-blink/);
});

test('reduced motion drops the animation', () => {
  const reduced = styles.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? [];
  assert.ok(
    reduced.some((block) => /\.pill-caret\s*\{[^}]*animation:\s*none/.test(block)),
    'no prefers-reduced-motion rule disabling .pill-caret',
  );
});

test('pill children counter-scale against the pill zoom', () => {
  // #islandPill sets zoom: var(--pill-zoom); a raw px value renders 1.15x.
  for (const rule of ['.pill-caret', '.pill-slash']) {
    const block = styles.match(new RegExp(`\\${rule} \\{[\\s\\S]*?\\}`))?.[0];
    assert.ok(block, `${rule} rule not found in styles.css`);
    assert.match(block, /var\(--pill-zoom\)/, `${rule} must counter-scale its px values`);
  }
});

test('the markup carries the chip and loads the shared gate', () => {
  assert.match(indexHtml, /id="pillSlash"/);
  assert.match(indexHtml, /<script src="pages\/type-to-open\.js"><\/script>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/blank-tab-pill.test.js`
Expected: FAIL — `pillLabelMode not found in renderer.js`.

- [ ] **Step 3: Add the markup**

In `src/renderer/index.html`, replace the `#pillDomain` line at `:33`:

```html
        <span id="pillDomain">new tab</span>
```

with the span plus the chip immediately after it:

```html
        <span id="pillDomain">new tab</span>
        <button id="pillSlash" class="pill-slash" type="button" title="Commands (/)" aria-label="Commands (/)" hidden>/</button>
```

The accessible name must contain the visible label. The button's visible text
is `/`, and an `aria-label` overrides it — `"Commands"` alone would drop the
`/` from the accessible name, so speech control ("click slash") could not
reach the button. `"Commands (/)"` keeps it, and matches the `title`.

Load the shared gate before `renderer.js` at `:133`:

```html
  <script src="pages/type-to-open.js"></script>
  <script src="vertical-tabs.js"></script>
  <script src="renderer.js"></script>
```

- [ ] **Step 4: Add the styles**

In `src/renderer/styles.css`, after the existing `#pillDomain.dim` rule (`:1072`):

```css
/* A blank tab's pill is a typing affordance, not a label. Dim ink is what
   separates a placeholder from real content — a prompt and a domain in the
   same ink read as the same kind of thing, which is how "new tab" came to
   look like the name of the tab rather than an invitation. */
#pillDomain.placeholder { color: var(--text-dim); }

/* Blinks four times, then rests visible. Deliberately not forever: the pill
   sits above every page, and motion that never resolves in always-on chrome
   is a long-term irritant. No animation-fill-mode — when the animation ends
   the element reverts to its default (visible) opacity, which is exactly the
   resting state wanted; `forwards` would freeze it on the keyframe's 0 and
   leave no caret at all. */
.pill-caret {
  display: inline-block;
  width: 1px;
  height: calc(13px / var(--pill-zoom));
  margin-right: calc(4px / var(--pill-zoom));
  background: var(--text);
  vertical-align: text-bottom;
  animation: pill-caret-blink 1.1s steps(1, end) 4;
}
@keyframes pill-caret-blink {
  0%, 50% { opacity: 1; }
  50.01%, 100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .pill-caret { animation: none; }
}

/* The "/" chip — a real button that opens the panel showing the command
   list. Mono because the slash palette it opens is mono. A bare "/" cannot
   say what it does, so clicking it shows you instead. */
.pill-slash {
  font-family: var(--font-mono);
  font-size: calc(10px / var(--pill-zoom));
  line-height: calc(15px / var(--pill-zoom));
  color: var(--text-dim);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: calc(5px / var(--pill-zoom));
  padding: 0 calc(5px / var(--pill-zoom));
  flex: 0 0 auto;
  cursor: pointer;
}
.pill-slash:hover { color: var(--accent); border-color: var(--accent); }
.pill-slash[hidden] { display: none; }
```

- [ ] **Step 5: Replace the label assignment in renderer.js**

Add `pillSlash` to the element lookups at the top of the file, beside `pillDomain` (`:18`):

```js
  const pillSlash = document.getElementById('pillSlash');
```

Replace `renderer.js:570-573`:

```js
    pillDomain.textContent = tab?.isLoading
      ? 'Loading…'
      : tabDomain(tab) || (tab?.private ? 'private tab' : 'new tab');
    pillDomain.classList.toggle('dim', !!tab?.isLoading);
```

with a call:

```js
    renderPillLabel(tab);
```

and define the two functions next to `tabDomain` (`:292`):

```js
  /** Which of the three things the pill's label is showing right now. */
  function pillLabelMode(tab) {
    if (tab?.isLoading) return 'loading';
    return tabDomain(tab) ? 'domain' : 'placeholder';
  }

  // The placeholder is DOM (a caret element), not a string, so it must be
  // built only on the transition INTO placeholder mode. tabs:updated arrives
  // ~10/s while any tab loads; rebuilding the caret on each broadcast
  // restarts its animation and the four-blink cue becomes a permanent blink.
  // Same reason dotsSignature guards the dot row.
  //
  // Consequence, accepted: switching between two blank tabs does not re-blink,
  // because the pill never leaves placeholder mode. The caret marks the pill
  // becoming a typing target, not every tab switch.
  let labelMode = null;
  function renderPillLabel(tab) {
    const next = pillLabelMode(tab);
    if (next !== labelMode) {
      labelMode = next;
      pillDomain.replaceChildren();
      if (next === 'placeholder') {
        const caret = document.createElement('span');
        caret.className = 'pill-caret';
        pillDomain.append(caret, 'Search or type a URL');
      }
    }
    // The domain changes without the mode changing, so this is unconditional.
    if (next === 'loading') pillDomain.textContent = 'Loading…';
    else if (next === 'domain') pillDomain.textContent = tabDomain(tab);
    pillDomain.classList.toggle('dim', next === 'loading');
    pillDomain.classList.toggle('placeholder', next === 'placeholder');
    pillSlash.hidden = next !== 'placeholder';
  }
```

- [ ] **Step 6: Run the tests**

Run: `node --test test/unit/blank-tab-pill.test.js`
Expected: PASS, 8 tests.

Run: `npm run test:unit && npm run substrate:check`
Expected: both PASS. `substrate:check` must be unaffected — no `:root` token changed.

- [ ] **Step 7: Verify in the running app**

Kill any running dev instance, then `npm start`. A plain reload will NOT show this — the chrome document loads once at window creation.

Confirm: the blank tab's pill shows a caret, `Search or type a URL` in dim ink, and the `/` chip; the caret stops blinking after ~4.5s; opening a site in another tab and returning does not restart the blink; a loaded page's pill still shows its bare domain with no chip; ⌘⇧N shows the placeholder beside the `private` chip.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css src/renderer/renderer.js test/unit/blank-tab-pill.test.js
git commit -m "Show a caret and prompt on the blank-tab pill"
```

---

### Task 4: The chip and the pill's keyboard path

Wire the chip to the command list, and teach the pill's existing keydown handler to accept text — without disturbing the Enter/Space activation already there.

**Files:**
- Modify: `src/renderer/renderer.js:729-737`
- Test: `test/unit/blank-tab-pill.test.js` (append)

**Interfaces:**
- Consumes: `globalThis.blancTypeToOpen.isTypeToOpenKey` (Task 1); `window.browserAPI.openIslandCommands()` and `.openIslandTyping(char)` (Task 2); `isMac` (`renderer.js:7`).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/blank-tab-pill.test.js`:

```js
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
  // pill, matching pillButton (renderer.js:96).
  assert.match(rendererSource, /pillSlash\.addEventListener\('mousedown'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/blank-tab-pill.test.js`
Expected: FAIL — `pillSlash click wiring not found in renderer.js`, and the pill-keydown test fails on the missing `isTypeToOpenKey`.

- [ ] **Step 3: Wire the chip and extend the keydown**

In `src/renderer/renderer.js`, replace the existing block at `:729-737`:

```js
  islandPill.addEventListener('click', () => window.browserAPI.openIsland());
  islandPill.addEventListener('keydown', (e) => {
    // Only when the pill itself is focused — a focused child button (tab
    // dot, folded group capsule) must keep its own Enter/Space activation.
    if (e.target !== islandPill) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.browserAPI.openIsland();
    }
  });
```

with:

```js
  islandPill.addEventListener('click', () => window.browserAPI.openIsland());
  islandPill.addEventListener('keydown', (e) => {
    // Only when the pill itself is focused — a focused child button (tab
    // dot, folded group capsule) must keep its own Enter/Space activation.
    if (e.target !== islandPill) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.browserAPI.openIsland();
      return;
    }
    // Typing while the pill has keyboard focus goes where the caret says it
    // does. Extended here rather than in a second listener so the pill's
    // activation semantics stay in one place.
    if (!globalThis.blancTypeToOpen.isTypeToOpenKey(e, isMac)) return;
    e.preventDefault();
    window.browserAPI.openIslandTyping(e.key);
  });

  // The "/" chip. stopPropagation keeps the click off the pill, which would
  // otherwise also open the panel — with no prefill, landing on the tab
  // switcher instead of the command list. mousedown preventDefault keeps the
  // focus ring for keyboard users only, same as pillButton.
  pillSlash.addEventListener('mousedown', (e) => e.preventDefault());
  pillSlash.addEventListener('click', (e) => {
    e.stopPropagation();
    window.browserAPI.openIslandCommands();
  });
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/blank-tab-pill.test.js`
Expected: PASS, 10 tests.

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Verify in the running app**

Kill the dev instance and `npm start` again.

Confirm: clicking the `/` chip opens the panel with `/` typed and the command list showing; clicking the pill anywhere else opens the panel empty on the tab switcher; Tab-focusing the pill and pressing Enter still opens the panel with an empty input, Space likewise; Tab-focusing the pill and typing `g` opens the panel containing `g`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/renderer.js test/unit/blank-tab-pill.test.js
git commit -m "Wire the slash chip and the pill's typing path"
```

---

### Task 5: Type-to-open on the start page

The main path — the caret's promise made good for someone who has just launched the app and is looking at the start page.

**Files:**
- Modify: `src/renderer/pages/newtab.html:202`, `src/renderer/pages/newtab.js`
- Test: `test/unit/start-page-type-to-open.test.js`

**Interfaces:**
- Consumes: `globalThis.blancTypeToOpen.isTypeToOpenKey` (Task 1); `window.bowserPages.start.openIsland(char)` (Task 2); `isMac` (`newtab.js:2`).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Create `test/unit/start-page-type-to-open.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '../..');
const newtabJs = fs.readFileSync(path.join(ROOT, 'src/renderer/pages/newtab.js'), 'utf8');
const newtabHtml = fs.readFileSync(path.join(ROOT, 'src/renderer/pages/newtab.html'), 'utf8');

test('the start page loads the shared gate before its own script', () => {
  const gate = newtabHtml.indexOf('type-to-open.js');
  const own = newtabHtml.indexOf('newtab.js');
  assert.ok(gate !== -1, 'newtab.html must load type-to-open.js');
  assert.ok(gate < own, 'the gate must load before newtab.js reads it');
});

test('typing on the start page opens the island', () => {
  const handler = newtabJs.match(
    /document\.addEventListener\('keydown',[\s\S]*?\n\}\);/,
  )?.[0];
  assert.ok(handler, 'no document keydown handler found in newtab.js');
  assert.match(handler, /isTypeToOpenKey/);
  assert.match(handler, /start\.openIsland/);
  assert.match(handler, /preventDefault/);
});

// The onboarding dialog, the footer layout switcher, and any future control
// live in this document. Only keystrokes that reached the body unclaimed are
// ours; anything with a focused control as its target belongs to that control.
test('keystrokes aimed at a control are left alone', () => {
  const handler = newtabJs.match(
    /document\.addEventListener\('keydown',[\s\S]*?\n\}\);/,
  )?.[0];
  assert.match(handler, /e(?:vent)?\.target !== document\.body/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/start-page-type-to-open.test.js`
Expected: FAIL — `newtab.html must load type-to-open.js`.

- [ ] **Step 3: Load the gate in newtab.html**

In `src/renderer/pages/newtab.html`, at `:202`, add the gate before the page's own scripts:

```html
  <script src="type-to-open.js"></script>
  <script src="onboarding.js"></script>
  <script src="newtab.js"></script>
```

- [ ] **Step 4: Add the handler to newtab.js**

At the end of `src/renderer/pages/newtab.js` (`isMac` is already defined at `:2`):

```js
// The pill's caret says keystrokes land somewhere. They do: a printable
// character typed on a blank start page opens the island with that character
// already in it.
//
// This lives in the renderer rather than a main-side before-input-event
// because only the renderer knows what is focused — a main-side hook fires
// before page dispatch and would steal keys from the onboarding dialog's own
// controls. `target === document.body` is that check: a keystroke aimed at
// any control has that control as its target.
document.addEventListener('keydown', (e) => {
  if (e.target !== document.body) return;
  if (!globalThis.blancTypeToOpen.isTypeToOpenKey(e, isMac)) return;
  e.preventDefault();
  // `?.` on the bridge matches the rest of this file — tab-preload only
  // exposes bowserPages on the blanc: protocol. The gate is called directly:
  // if type-to-open.js failed to load that is a build error worth surfacing,
  // not something to swallow on every keystroke.
  window.bowserPages?.start.openIsland(e.key);
});
```

Note this file is a plain top-level script — no IIFE — so `isMac` from `:2` is
already in scope and the handler appends directly.

- [ ] **Step 5: Run the tests**

Run: `node --test test/unit/start-page-type-to-open.test.js`
Expected: PASS, 3 tests.

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Verify in the running app**

Kill the dev instance and `npm start`.

Confirm, without clicking anything first: typing `g` opens the panel containing `g`; typing `/` opens it showing the command list; ⌘T, ⌘R and ⌘L still behave; pressing Tab moves focus normally rather than opening the panel; with the onboarding dialog open (a scratch profile, or Settings → Show welcome tour) typing does not open the island behind it.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/newtab.html src/renderer/pages/newtab.js test/unit/start-page-type-to-open.test.js
git commit -m "Open the island when typing on a blank start page"
```

---

### Task 6: Acceptance scenarios and governance

The unit tests prove the pieces. This proves the thing the user actually hit: a cold launch with nothing focused.

**Files:**
- Create: `spec/acceptance/blank-tab-affordance.feature`, `test/desktop/steps/blank-tab-affordance.steps.js`
- Modify: `test/desktop/cucumber.mjs` (the `RUNNABLE` list), `spec/features.md`, `spec/parity-matrix.md`, `spec/acceptance/index.md`

**Interfaces:**
- Consumes: the test hook's `activateTab(id, focusContent)` (`test-hook.js:268`), `focusTabContents(id)` (`:269`), `overlayMode()` (`:703`).
- Produces: nothing downstream.

- [ ] **Step 1: Write the feature file**

Create `spec/acceptance/blank-tab-affordance.feature`. The cold-launch precondition is the point of the first scenario — reaching a blank tab via ⌘T proves nothing, because that path passes `focusAddress: true` (`main.js:4253`) and the panel is already open before the test types anything:

```gherkin
Feature: The blank tab says where to type
  A blank tab's island shows a caret and a prompt instead of a label, and
  typing on it opens the island with that character.

  @F37-1
  Scenario: The blank-tab island invites typing
    Given a blank new tab is active
    Then the island shows the typing prompt
    And the island shows the commands chip

  @F37-2
  Scenario: Typing on a cold-launched blank tab opens the island
    Given a blank new tab is active with page content focused
    And the island overlay is closed
    When I type "g" into the page
    Then the island opens with "g" already entered

  @F37-3
  Scenario: The commands chip opens the command list
    Given a blank new tab is active
    When I click the island commands chip
    Then the island opens with "/" already entered
```

- [ ] **Step 2: Register the scenarios**

Add `F37-1`, `F37-2`, `F37-3` to the `RUNNABLE` list in `test/desktop/cucumber.mjs`. The profiles select by explicit id, so an unregistered scenario is silently never run — registration is what makes the test exist.

- [ ] **Step 3: Run the dry-run to verify the steps are undefined**

Run: `npm run test:acceptance:dry`
Expected: FAIL, reporting undefined steps for the three scenarios.

- [ ] **Step 4: Write the step definitions**

Create `test/desktop/steps/blank-tab-affordance.steps.js`, following the existing files in that directory for the harness handle. The load-bearing part is the precondition in `F37-2`:

```js
Given('a blank new tab is active with page content focused', async function () {
  // The World exposes `call`, not `hook`, and there is no `activeTabId`
  // method — it is a field on the `state()` projection (test-hook.js:189,
  // with activeTabId at :231).
  const { activeTabId } = await this.call('state');
  // Reproduce cold launch: main.js:5620 activates the startup tab with
  // focusContent: true. The Cmd/Ctrl+T path does the opposite
  // (main.js:4253 passes focusAddress: true), so a test that opened a tab
  // that way would pass whether or not type-to-open exists.
  await this.call('activateTab', activeTabId, true);
  await this.call('focusTabContents', activeTabId);
});

Given('the island overlay is closed', async function () {
  const mode = await this.call('overlayMode');
  assert.equal(mode, null, 'the overlay must be closed before typing');
});
```

`activateTab(id, focusContent)` is at `test-hook.js:268`, `focusTabContents(id)`
at `:269`, and `overlayMode()` at `:703` — all top-level hook methods, unlike
`activeTabId`.

`Then the island opens with "g" already entered` asserts `overlayMode()` is `'panel'` and reads the address input's value through the existing overlay accessor those step files already use.

- [ ] **Step 5: Run the acceptance suite**

Run: `npm run test:acceptance:dry`
Expected: PASS — all steps resolve.

Run: `npm run test:acceptance:desktop`
Expected: PASS, including the three new scenarios. (Prefix `xvfb-run -a` on headless Linux.)

- [ ] **Step 6: Update the governance files**

- `spec/features.md`: add `F37` describing the blank-tab typing affordance as a product contract — a blank tab must show that it accepts text, and typing on it must begin entry. Presentation (caret, chip) is desktop's expression of it, not the contract.
- `spec/parity-matrix.md`: add the `F37` row.
- `spec/acceptance/index.md`: add traceability rows for `F37-1`, `F37-2`, `F37-3`.

- [ ] **Step 7: Run the full gate**

Run: `npm run test:unit && npm run substrate:check && npm run test:acceptance:dry`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add spec/ test/desktop/
git commit -m "Cover the blank-tab affordance with acceptance scenarios"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: the placeholder, caret, and private-tab treatment → Task 3; the `/` chip and its channel → Tasks 2 and 4; type-to-open, the modifier gate, and the pill's keyboard path → Tasks 1, 4, 5; the shared validator and `preload.js` bridges → Task 2; the cold-launch acceptance precondition and governance → Task 6. The spec's three review-driven test requirements (AltGr accepted, `altKey` platform-split, Enter/Space preserved) are each written as assertions that fail against the naive implementation.

**Known deviation from the spec, deliberate.** The spec places the shared gate logic in each renderer. This plan extracts it to one file served to both documents via `SHARED_ASSETS`, because `chrome-protocol.js` already serves `/pages/*` assets to the chrome document and duplicating a security-relevant gate across two files invites drift. Adding a file to `SHARED_ASSETS` is a reviewed surface — the entry is pure logic with no IPC and no application data, and Task 1 Step 6 asserts the allowlist entry exists.

**Not covered, by design.** The utility-sheet seam (a caret shows while the sheet holds focus) is an accepted limitation in the spec, not a task. macOS dead-key composition likewise.
