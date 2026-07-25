# URL Bar Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native right-click context menu on the island's address input (Undo/Redo, Cut/Copy/Paste, Copy Clean Link, Paste and Go, Delete, Select All), per the approved spec at `docs/superpowers/specs/2026-07-25-url-bar-context-menu-design.md`.

**Architecture:** The overlay renderer suppresses the DOM `contextmenu` event everywhere except `#addressInput`, so only that field reaches the main process's `context-menu` event (which carries Blink's `editFlags`). Pure logic (`clean-link.js`, `address-menu-model.js`) is separated from a thin Electron layer (`address-menu.js`) so it runs under `node --test` without Electron. Paste and Go reuses the existing `tabs:navigate` body via an extracted `navigateTabToAddress()` plus a `pasteAndGo()` wrapper that also dismisses the overlay.

**Tech Stack:** Electron main process (`Menu`, `clipboard`, `webContents`), vanilla renderer JS, `node --test` unit tests, Cucumber + Playwright-Electron acceptance harness.

## Global Constraints

- Read the spec first: `docs/superpowers/specs/2026-07-25-url-bar-context-menu-design.md`. It is the contract; this plan implements it.
- Work on branch `feat/url-bar-context-menu` (already exists, spec committed).
- The chrome documents load once at window creation — `Cmd+R` reloads the active tab, NOT the chrome. Any change to `src/renderer/overlay.js` requires killing and relaunching `npm start` to observe.
- Never hand-edit `*/generated/` files. This feature touches no tokens, settings enums, or slash-command copy, so `npm run substrate:check` must stay green untouched.
- The tracking-parameter list is exactly: prefix `utm_`, plus exact names `fbclid`, `gclid`, `dclid`, `gbraid`, `wbraid`, `msclkid`, `ttclid`, `twclid`, `igshid`, `yclid`, `mc_eid`, `_openstat`, `vero_id`, `s_cid`. Case-insensitive. Do not add more.
- Surviving query parameters must keep their original order and original encoding — never round-trip through `URLSearchParams`.
- Acceptance scenarios are tagged `@desktop` (never `@all`) plus `@D20`, and their feature/index/step changes land in the same commit as their step definitions (the parity-guards CI runs `test:acceptance:dry` on every push).
- Unit tests: `npm run test:unit`. Acceptance: `npm run test:acceptance:dry` then `npm run test:acceptance:desktop`.
- macOS dev machine; `npm start` runs the app.

---

### Task 1: `clean-link.js` — pure tracking-parameter stripper

**Files:**
- Create: `src/main/clean-link.js`
- Test: `test/unit/clean-link.test.js`

**Interfaces:**
- Consumes: nothing (pure, zero dependencies).
- Produces: `cleanLink(text: string) → string | null` — cleaned URL, or `null` when the trimmed text is not an http(s) URL. Tasks 2, 4, and 5 call it with exactly this signature.

- [ ] **Step 1: Write the failing test**

Create `test/unit/clean-link.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const { cleanLink } = require('../../src/main/clean-link');

test('cleanLink: strips utm_* by prefix, case-insensitively', () => {
  assert.equal(
    cleanLink('https://ex.com/p?utm_source=nl&a=1&UTM_Campaign=x&b=2'),
    'https://ex.com/p?a=1&b=2'
  );
});

test('cleanLink: strips each exact tracking parameter, case-insensitively', () => {
  const names = ['fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid',
    'ttclid', 'twclid', 'igshid', 'yclid', 'mc_eid', '_openstat', 'vero_id', 's_cid'];
  for (const name of names) {
    assert.equal(cleanLink(`https://ex.com/?${name}=abc&keep=1`), 'https://ex.com/?keep=1', name);
    assert.equal(cleanLink(`https://ex.com/?${name.toUpperCase()}=abc&keep=1`), 'https://ex.com/?keep=1', name);
  }
});

test('cleanLink: non-tracking params keep original order and original encoding', () => {
  // %20, +, and a double-encoded value must survive byte-for-byte —
  // URLSearchParams round-tripping would rewrite them.
  assert.equal(
    cleanLink('https://ex.com/s?q=a%20b&fbclid=x&r=c+d&sig=ab%252Fcd'),
    'https://ex.com/s?q=a%20b&r=c+d&sig=ab%252Fcd'
  );
});

test('cleanLink: fragment is untouched, even one containing a question mark', () => {
  assert.equal(
    cleanLink('https://ex.com/p?utm_source=x&a=1#sect?utm_source=keepme'),
    'https://ex.com/p?a=1#sect?utm_source=keepme'
  );
});

test('cleanLink: trailing bare "?" dropped when stripping empties the query', () => {
  assert.equal(cleanLink('https://ex.com/p?utm_source=x'), 'https://ex.com/p');
  assert.equal(cleanLink('https://ex.com/p?utm_source=x#frag'), 'https://ex.com/p#frag');
});

test('cleanLink: URL with no query returned unchanged (trimmed)', () => {
  assert.equal(cleanLink('  https://ex.com/path#frag  '), 'https://ex.com/path#frag');
  assert.equal(cleanLink('https://ex.com/'), 'https://ex.com/');
});

test('cleanLink: null for anything that is not an http(s) URL', () => {
  assert.equal(cleanLink('how tall is everest'), null);       // search query
  assert.equal(cleanLink('example.com/no-scheme'), null);     // scheme-less
  assert.equal(cleanLink('blanc://settings/'), null);
  assert.equal(cleanLink('file:///Users/x/notes.html'), null);
  assert.equal(cleanLink('view-source:https://ex.com/'), null);
  assert.equal(cleanLink(''), null);
  assert.equal(cleanLink(undefined), null);
});

test('cleanLink: valueless and empty-valued params are preserved when non-tracking', () => {
  assert.equal(cleanLink('https://ex.com/?flag&utm_source=x&empty='), 'https://ex.com/?flag&empty=');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/clean-link.test.js`
Expected: FAIL — `Cannot find module '../../src/main/clean-link'`

- [ ] **Step 3: Write the implementation**

Create `src/main/clean-link.js`:

```js
// Pure logic behind the address-bar menu's "Copy Clean Link" item — extracted
// so it's unit-testable without Electron, same pattern as view-source.js.
//
// The list is deliberately conservative and curated (see the design spec):
// over-stripping silently breaks links, which is worse than leaving a tracker
// on one. Brave's own clean-link guidelines make the same call — generic
// parameters aren't stripped globally without domain scoping, machinery this
// v1 doesn't need.

const TRACKING_EXACT = new Set([
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'ttclid',
  'twclid', 'igshid', 'yclid', 'mc_eid', '_openstat', 'vero_id', 's_cid',
]);

function isTrackingParam(rawName) {
  const name = rawName.toLowerCase();
  return name.startsWith('utm_') || TRACKING_EXACT.has(name);
}

/**
 * Strip known tracking parameters from an http(s) URL.
 *
 * Operates on the RAW string, never a URL/URLSearchParams round-trip:
 * surviving parameters must keep their original order and their original
 * encoding byte-for-byte (URLSearchParams re-encodes `%20`↔`+` and
 * normalizes unreserved characters, which corrupts signed URLs). new URL()
 * is used only to validate the scheme.
 *
 * @param {string} text - the address bar's visible text
 * @returns {string|null} cleaned URL, or null when text isn't an http(s) URL
 */
function cleanLink(text) {
  const trimmed = String(text ?? '').trim();
  let protocol;
  try {
    ({ protocol } = new URL(trimmed));
  } catch {
    return null;
  }
  if (protocol !== 'http:' && protocol !== 'https:') return null;

  // Split raw string: fragment starts at the first '#'; the query is between
  // the first '?' BEFORE that and the fragment. A '?' inside the fragment is
  // fragment text, not a query.
  const hashIndex = trimmed.indexOf('#');
  const beforeFragment = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : trimmed.slice(hashIndex);
  const queryIndex = beforeFragment.indexOf('?');
  if (queryIndex === -1) return trimmed;

  const base = beforeFragment.slice(0, queryIndex);
  const kept = beforeFragment
    .slice(queryIndex + 1)
    .split('&')
    .filter((segment) => !isTrackingParam(segment.split('=', 1)[0]));

  return base + (kept.length ? `?${kept.join('&')}` : '') + fragment;
}

module.exports = { cleanLink };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/clean-link.test.js`
Expected: PASS, all tests.

Note the empty-query edge: `https://ex.com/?` splits into one empty segment whose name `''` is not a tracking param, so it's kept — `https://ex.com/?` round-trips unchanged. Acceptable: the input already had a bare `?`.

- [ ] **Step 5: Run the whole unit suite**

Run: `npm run test:unit`
Expected: PASS (no existing test touches these files, but verify nothing else broke).

- [ ] **Step 6: Commit**

```bash
git add src/main/clean-link.js test/unit/clean-link.test.js
git commit -m "Add cleanLink(): curated tracking-parameter stripper"
```

---

### Task 2: `address-menu-model.js` — pure menu descriptor builder

**Files:**
- Create: `src/main/address-menu-model.js`
- Test: `test/unit/address-menu-model.test.js`

**Interfaces:**
- Consumes: `cleanLink(text)` from Task 1 (`require('./clean-link')`).
- Produces: `buildAddressMenu({ editFlags, clipboardText, fieldText }) → Array` of `{ id, label, accelerator?, enabled }` and `{ type: 'separator' }` descriptors. Item ids, in order: `undo`, `redo`, (separator), `cut`, `copy`, `copy-clean-link`, `paste`, `paste-and-go`, `delete`, (separator), `select-all`. Tasks 4 and 5 depend on these exact ids.

- [ ] **Step 1: Write the failing test**

Create `test/unit/address-menu-model.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const { buildAddressMenu } = require('../../src/main/address-menu-model');

const ALL_FLAGS = {
  canUndo: true, canRedo: true, canCut: true, canCopy: true,
  canPaste: true, canDelete: true, canSelectAll: true,
};

function build(overrides = {}) {
  return buildAddressMenu({
    editFlags: ALL_FLAGS,
    clipboardText: 'https://paste.example/',
    fieldText: 'https://ex.com/?utm_source=x',
    ...overrides,
  });
}

test('buildAddressMenu: item order, labels, separators', () => {
  const items = build();
  assert.deepEqual(
    items.map((i) => i.type === 'separator' ? '—' : i.id),
    ['undo', 'redo', '—', 'cut', 'copy', 'copy-clean-link', 'paste',
     'paste-and-go', 'delete', '—', 'select-all']
  );
  const byId = Object.fromEntries(items.filter((i) => i.id).map((i) => [i.id, i]));
  assert.equal(byId['undo'].label, 'Undo');
  assert.equal(byId['redo'].label, 'Redo');
  assert.equal(byId['cut'].label, 'Cut');
  assert.equal(byId['copy'].label, 'Copy');
  assert.equal(byId['copy-clean-link'].label, 'Copy Clean Link');
  assert.equal(byId['paste'].label, 'Paste');
  assert.equal(byId['paste-and-go'].label, 'Paste and Go');
  assert.equal(byId['delete'].label, 'Delete');
  assert.equal(byId['select-all'].label, 'Select All');
});

test('buildAddressMenu: accelerators only where a real shortcut exists', () => {
  const byId = Object.fromEntries(build().filter((i) => i.id).map((i) => [i.id, i]));
  assert.equal(byId['undo'].accelerator, 'CmdOrCtrl+Z');
  assert.equal(byId['redo'].accelerator, 'Shift+CmdOrCtrl+Z');
  assert.equal(byId['cut'].accelerator, 'CmdOrCtrl+X');
  assert.equal(byId['copy'].accelerator, 'CmdOrCtrl+C');
  assert.equal(byId['paste'].accelerator, 'CmdOrCtrl+V');
  assert.equal(byId['select-all'].accelerator, 'CmdOrCtrl+A');
  assert.equal(byId['copy-clean-link'].accelerator, undefined);
  assert.equal(byId['paste-and-go'].accelerator, undefined);
  assert.equal(byId['delete'].accelerator, undefined);
});

test('buildAddressMenu: each editFlag gates exactly its item', () => {
  const flagToId = {
    canUndo: 'undo', canRedo: 'redo', canCut: 'cut', canCopy: 'copy',
    canPaste: 'paste', canDelete: 'delete', canSelectAll: 'select-all',
  };
  for (const [flag, id] of Object.entries(flagToId)) {
    const items = build({ editFlags: { ...ALL_FLAGS, [flag]: false } });
    const byId = Object.fromEntries(items.filter((i) => i.id).map((i) => [i.id, i]));
    assert.equal(byId[id].enabled, false, `${flag} off disables ${id}`);
    for (const [otherFlag, otherId] of Object.entries(flagToId)) {
      if (otherFlag !== flag) assert.equal(byId[otherId].enabled, true, `${otherId} unaffected`);
    }
  }
});

test('buildAddressMenu: missing editFlags disable everything flag-gated', () => {
  const items = build({ editFlags: {} });
  const byId = Object.fromEntries(items.filter((i) => i.id).map((i) => [i.id, i]));
  for (const id of ['undo', 'redo', 'cut', 'copy', 'paste', 'delete', 'select-all']) {
    assert.equal(byId[id].enabled, false, id);
  }
});

test('buildAddressMenu: Copy Clean Link enabled only for http(s) fieldText', () => {
  const enabled = (fieldText) => build({ fieldText })
    .find((i) => i.id === 'copy-clean-link').enabled;
  assert.equal(enabled('https://ex.com/?utm_source=x'), true);
  assert.equal(enabled('https://ex.com/clean-already'), true);
  assert.equal(enabled('how tall is everest'), false);
  assert.equal(enabled('blanc://settings/'), false);
  assert.equal(enabled(''), false);
});

test('buildAddressMenu: Paste and Go needs canPaste AND non-blank clipboard', () => {
  const item = (opts) => build(opts).find((i) => i.id === 'paste-and-go');
  assert.equal(item({}).enabled, true);
  assert.equal(item({ clipboardText: '' }).enabled, false);
  assert.equal(item({ clipboardText: '   \n' }).enabled, false);
  assert.equal(item({ editFlags: { ...ALL_FLAGS, canPaste: false } }).enabled, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/address-menu-model.test.js`
Expected: FAIL — `Cannot find module '../../src/main/address-menu-model'`

- [ ] **Step 3: Write the implementation**

Create `src/main/address-menu-model.js`:

```js
// Pure descriptor builder behind the address bar's context menu — extracted
// so enabled-state logic is unit-testable without Electron (address-menu.js
// holds the Menu/clipboard/webContents plumbing). Same split as
// tabicons-model.js / tabicons.js.

const { cleanLink } = require('./clean-link');

/**
 * @param {object} input
 * @param {object} input.editFlags - Blink's flags from the context-menu event
 * @param {string} input.clipboardText - clipboard.readText() at menu time
 * @param {string} input.fieldText - the address input's visible value
 * @returns {Array<{id:string,label:string,accelerator?:string,enabled:boolean}|{type:'separator'}>}
 */
function buildAddressMenu({ editFlags = {}, clipboardText = '', fieldText = '' }) {
  return [
    { id: 'undo', label: 'Undo', accelerator: 'CmdOrCtrl+Z', enabled: !!editFlags.canUndo },
    { id: 'redo', label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', enabled: !!editFlags.canRedo },
    { type: 'separator' },
    { id: 'cut', label: 'Cut', accelerator: 'CmdOrCtrl+X', enabled: !!editFlags.canCut },
    { id: 'copy', label: 'Copy', accelerator: 'CmdOrCtrl+C', enabled: !!editFlags.canCopy },
    // Cleans the VISIBLE text, not the tab URL — identical while the field is
    // untouched, and never silently acts on an object other than the one on
    // screen once the user has typed (see the design spec).
    { id: 'copy-clean-link', label: 'Copy Clean Link', enabled: cleanLink(fieldText) !== null },
    { id: 'paste', label: 'Paste', accelerator: 'CmdOrCtrl+V', enabled: !!editFlags.canPaste },
    { id: 'paste-and-go', label: 'Paste and Go', enabled: !!editFlags.canPaste && clipboardText.trim().length > 0 },
    { id: 'delete', label: 'Delete', enabled: !!editFlags.canDelete },
    { type: 'separator' },
    { id: 'select-all', label: 'Select All', accelerator: 'CmdOrCtrl+A', enabled: !!editFlags.canSelectAll },
  ];
}

module.exports = { buildAddressMenu };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/address-menu-model.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/address-menu-model.js test/unit/address-menu-model.test.js
git commit -m "Add buildAddressMenu(): pure address-bar menu descriptors"
```

---

### Task 3: Extract `navigateTabToAddress()` + `pasteAndGo()` in main.js

**Files:**
- Modify: `src/main/main.js` (the `tabs:navigate` handler around line 2044; new functions near it or near `normalizeAddressInput` ~line 816)

**Interfaces:**
- Consumes: existing `tabs`, `handOffToOs`, `normalizeAddressInput`, `isUtilityUrl`, `openInternalPage`, `tabsWantingAddressBarFocus`, `hideOverlay` — all already in main.js module scope.
- Produces: `navigateTabToAddress(id, rawText)` and `pasteAndGo(id, rawText)` in main.js module scope. Task 4 wires `pasteAndGo` into the menu; Task 5 passes it to the test hook.

This is a pure refactor plus one new 4-line wrapper — no behaviour change to the IPC path, so no new unit test; the existing acceptance F5 scenarios (typed navigation, mailto hand-off) are the regression net.

- [ ] **Step 1: Extract the handler body**

In `src/main/main.js`, find the `tabs:navigate` handler (currently):

```js
  chromeHandle('tabs:navigate', (_e, id, url) => {
    const tab = tabs.get(id);
    if (!tab) return;
    // Checked against the raw address-bar text, before normalizeAddressInput
    // — a bare mailto:/tel: URI has no "://" and would otherwise fall
    // through its domain-guessing heuristic into an unreachable https:// URL.
    if (handOffToOs(url, { trusted: true })) return;
    const target = normalizeAddressInput(url);
    // A typed utility address opens the sheet, never navigates the tab.
    if (isUtilityUrl(target)) return openInternalPage(target);
    tabsWantingAddressBarFocus.delete(id);
    tab.view.webContents.loadURL(target);
  });
```

Replace with:

```js
  chromeHandle('tabs:navigate', (_e, id, url) => navigateTabToAddress(id, url));
```

and add, as top-level functions directly after `normalizeAddressInput()` (~line 834):

```js
/** The full typed-address routing pipeline — shared by the tabs:navigate IPC
 * handler and the address-bar menu's Paste and Go, so the two can't drift. */
function navigateTabToAddress(id, rawText) {
  const tab = tabs.get(id);
  if (!tab) return;
  // Checked against the raw address-bar text, before normalizeAddressInput
  // — a bare mailto:/tel: URI has no "://" and would otherwise fall
  // through its domain-guessing heuristic into an unreachable https:// URL.
  if (handOffToOs(rawText, { trusted: true })) return;
  const target = normalizeAddressInput(rawText);
  // A typed utility address opens the sheet, never navigates the tab.
  if (isUtilityUrl(target)) return openInternalPage(target);
  tabsWantingAddressBarFocus.delete(id);
  tab.view.webContents.loadURL(target);
}

/** Paste and Go = navigate + dismiss the island, exactly like pressing Enter.
 * The menu action and the F19-3 acceptance binding both use THIS wrapper, so
 * the scenario's "closes the island" half asserts the real code path. */
function pasteAndGo(id, rawText) {
  navigateTabToAddress(id, rawText);
  hideOverlay();
}
```

(Preserve the two comments — they move with the code. `trusted: true` stays correct for the menu path: the navigation originates in an explicit user click on a menu item, not page-controlled content.)

- [ ] **Step 2: Verify the refactor**

Run: `npm run test:unit && npm run test:acceptance:dry && npm run test:acceptance:desktop`
Expected: all PASS — F5-1/2/3 (typed domain, search, mailto hand-off) exercise the extracted path end-to-end.

- [ ] **Step 3: Commit**

```bash
git add src/main/main.js
git commit -m "Extract navigateTabToAddress() + pasteAndGo() from tabs:navigate"
```

---

### Task 4: `address-menu.js` Electron layer + overlay wiring

**Files:**
- Create: `src/main/address-menu.js`
- Modify: `src/renderer/overlay.js` (suppress listener, near the other document-level listeners at the bottom)
- Modify: `src/main/main.js` (`createOverlay()` ~line 648: attach + blur guard; module scope: `addressMenuOpen` flag)

**Interfaces:**
- Consumes: `buildAddressMenu` (Task 2), `cleanLink` (Task 1), `pasteAndGo` (Task 3).
- Produces: `attachAddressMenu(wc, deps)` and `runAddressMenuItem(id, { wc, fieldText, actions })` exported from `address-menu.js`. Task 5's test hook calls `runAddressMenuItem` with exactly this signature. `deps` shape is defined in Step 2.

- [ ] **Step 1: Create `src/main/address-menu.js`**

```js
const { Menu, clipboard } = require('electron');
const { buildAddressMenu } = require('./address-menu-model');
const { cleanLink } = require('./clean-link');

/**
 * Right-click menu for the island's address input. Wired to the OVERLAY
 * webContents, not tabs — the overlay renderer suppresses contextmenu on
 * everything except #addressInput, so this handler only ever fires for it.
 *
 * `deps` supplies main.js state so this module doesn't import main.js
 * (same cycle-avoidance as context-menu.js):
 *   isOverlayLive()      — window + overlay alive, mode is panel/palette
 *   getWindow()          — the BrowserWindow (popup anchor)
 *   getOverlayBounds()   — overlay view bounds, window-relative
 *   setMenuOpen(bool)    — toggles main's blur-guard flag
 *   onMenuClosed()       — main's refocus-or-dismiss policy
 *   actions.pasteAndGo(text) — navigate active tab + dismiss overlay
 */

/** Execute one menu item. Exported separately so the acceptance test hook can
 * drive the exact action path a native popup click runs (a native Menu can't
 * be driven by Playwright). */
function runAddressMenuItem(id, { wc, fieldText, actions }) {
  switch (id) {
    // Explicit calls (not menu roles) so edits always target the overlay,
    // never whatever happens to hold focus — same reasoning as context-menu.js.
    case 'undo': return wc.undo();
    case 'redo': return wc.redo();
    case 'cut': return wc.cut();
    case 'copy': return wc.copy();
    case 'paste': return wc.paste();
    case 'delete': return wc.delete();
    case 'select-all': return wc.selectAll();
    case 'copy-clean-link': {
      const cleaned = cleanLink(fieldText);
      if (cleaned !== null) clipboard.writeText(cleaned);
      return;
    }
    case 'paste-and-go': {
      const text = clipboard.readText().trim();
      if (text) actions.pasteAndGo(text);
      return;
    }
  }
}

function attachAddressMenu(wc, deps) {
  wc.on('context-menu', async (_event, params) => {
    if (!params.isEditable) return;

    // params carries editFlags but not the input's value; read it with one
    // awaited round-trip into Blanc's own chrome document. (A renderer-side
    // "report value on contextmenu" send would travel a different pipe than
    // this event, with no ordering guarantee between them.)
    let fieldText;
    try {
      fieldText = await wc.executeJavaScript(
        'document.getElementById("addressInput")?.value ?? ""');
    } catch {
      return; // overlay destroyed or mid-navigation — no menu, no fallback
    }
    // The await opened a lifecycle window: Escape can race the right-click
    // and dismiss the overlay. Revalidate before popping, or the menu would
    // float over nothing.
    if (!deps.isOverlayLive()) return;

    const items = buildAddressMenu({
      editFlags: params.editFlags,
      clipboardText: clipboard.readText(),
      fieldText,
    });
    const menu = Menu.buildFromTemplate(items.map((item) =>
      item.type === 'separator' ? item : {
        label: item.label,
        accelerator: item.accelerator,
        enabled: item.enabled,
        click: () => runAddressMenuItem(item.id, { wc, fieldText, actions: deps.actions }),
      }
    ));

    const bounds = deps.getOverlayBounds();
    // The blur-guard flag is set HERE, beside popup(), never across the await
    // above — an abort path there would leak it set and permanently disarm
    // blur dismissal.
    deps.setMenuOpen(true);
    menu.popup({
      window: deps.getWindow(),
      // params.x/y are overlay-webContents-relative; popup wants
      // window-relative. Explicit coordinates also make keyboard invocation
      // (Shift+F10 / menu key) land at Chromium's caret-anchored position
      // instead of the mouse.
      x: Math.round(bounds.x + params.x),
      y: Math.round(bounds.y + params.y),
      // Electron's context-menu guide recommends forwarding sourceType so
      // Windows/Linux can adjust for keyboard vs. mouse invocation.
      sourceType: params.menuSourceType,
      frame: params.frame ?? undefined,
      callback: () => {
        deps.setMenuOpen(false);
        deps.onMenuClosed();
      },
    });
  });
}

module.exports = { attachAddressMenu, runAddressMenuItem };
```

- [ ] **Step 2: Wire it in `src/main/main.js`**

Near the other overlay state at module scope (by `let overlayMode`), add:

```js
let addressMenuOpen = false; // native address-bar menu up: suppress blur dismissal
```

In the overlay `blur` handler (~line 683), add the guard as the FIRST check inside the handler, before the `acceptanceTestMode` return:

```js
  overlayView.webContents.on('blur', () => {
    // A native address-bar context menu takes OS focus; that blur is not a
    // dismissal — the popup's close callback owns what happens next.
    if (addressMenuOpen) return;
```

At the end of `createOverlay()` (after the existing `blur` handler), attach:

```js
  attachAddressMenu(overlayView.webContents, {
    isOverlayLive: () =>
      hasLiveWindow()
      && overlayView && !overlayView.webContents.isDestroyed()
      && (overlayMode === 'panel' || overlayMode === 'palette'),
    getWindow: () => win,
    getOverlayBounds: () => overlayBounds(),
    setMenuOpen: (open) => { addressMenuOpen = open; },
    // Never steal focus back from another app: if the window lost focus
    // while the guard was suppressing blur dismissal, perform the dismissal
    // the guard swallowed — without touching focus.
    onMenuClosed: () => {
      if (!hasLiveWindow()) return;
      if (!win.isFocused()) return hideOverlay({ refocusContent: false });
      if (overlayMode === 'panel' || overlayMode === 'palette') {
        overlayView.webContents.focus(); // the popup took focus from it
      }
      // overlayMode gone (Paste and Go closed it): nothing to do.
    },
    actions: {
      pasteAndGo: (text) => { if (activeTabId) pasteAndGo(activeTabId, text); },
    },
  });
```

And at the top of main.js, next to `const { attachContextMenu } = require('./context-menu');`:

```js
const { attachAddressMenu } = require('./address-menu');
```

- [ ] **Step 3: Add the suppress listener in `src/renderer/overlay.js`**

Near the other `document`-level listeners (end of file is fine):

```js
  // Only the address input gets a context menu (see src/main/address-menu.js).
  // Cancelling the DOM event here stops Chromium from ever dispatching the
  // browser-side context-menu event for the find bar, the group-name picker,
  // and the panel chrome — they stay inert, exactly as before.
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('#addressInput')) e.preventDefault();
  });
```

- [ ] **Step 4: Static verification**

Run: `npm run test:unit && npm run test:acceptance:dry`
Expected: PASS (nothing new is exercised yet; this catches require-path typos and syntax errors — `test:acceptance:dry` boots nothing but the step-resolution machinery, while `test:unit` requires no Electron. main.js syntax is verified by the desktop run in the next step).

- [ ] **Step 5: Live smoke test (relaunch — chrome documents load once)**

Kill any running dev instance, then `npm start`. Verify:
1. ⌘L, right-click the address input → menu appears with all ten items, at the click point.
2. Panel stays open while the menu is up; Escape closes the menu, panel remains, caret/selection intact.
3. Right-click the find bar (⌘F) and panel chrome → nothing (as before).
4. Copy Clean Link on a page with `?utm_source=…` → clipboard holds the stripped URL.
5. Paste and Go with a URL on the clipboard → navigates, island closes.
6. Cmd-Tab away while the menu is open, dismiss it → Blanc does not steal focus; the panel is gone when you return.

Leave the dev instance running at end of turn (user preference).

- [ ] **Step 6: Commit**

```bash
git add src/main/address-menu.js src/main/main.js src/renderer/overlay.js
git commit -m "Add right-click context menu to the address input"
```

---

### Task 5: Acceptance scenarios F19-2/F19-3 + test-hook bindings

Everything in this task lands in ONE commit: the parity-guards CI runs `test:acceptance:dry` on every push, and a scenario without resolvable steps fails it.

**Files:**
- Modify: `spec/acceptance/navigation-and-context-menu.feature` (after the F19-1 scenario)
- Modify: `spec/acceptance/index.md` (rows after F19-1, line ~85)
- Modify: `test/desktop/cucumber.mjs` (RUNNABLE list)
- Modify: `src/main/test-hook.js` (new hook methods + refs)
- Modify: `src/main/main.js` (pass `pasteAndGo` in the test-hook refs, ~line 2845)
- Modify: `test/desktop/steps/runnable.steps.js` (new step definitions)

**Interfaces:**
- Consumes: `buildAddressMenu` (Task 2), `runAddressMenuItem` (Task 4), `pasteAndGo` (Task 3), existing hook plumbing (`getActiveTabId`, `getOverlayWebContents`, `getOverlayMode`, `showOverlay`, `world.call`, `world.waitForState`, `world.fixtureUrl`).
- Produces: `__blanc.addressMenu({ fieldText })`, `__blanc.runAddressMenuItem(id, fieldText)`, `__blanc.setClipboardText(text)`, `__blanc.readClipboardText()`.

- [ ] **Step 1: Add the scenarios**

In `spec/acceptance/navigation-and-context-menu.feature`, after the F19-1 scenario:

```gherkin
  @F19-2 @F19 @desktop @D20
  Scenario: Copy Clean Link strips tracking parameters, keeping the rest
    Given the active tab is on "plain" with query "?id=42&utm_source=news&fbclid=abc"
    When I open the command-bar context menu
    Then the "Copy Clean Link" item is enabled
    When I choose "Copy Clean Link" from the command-bar context menu
    Then the clipboard holds the page address with query "?id=42"

  @F19-3 @F19 @desktop @D20
  Scenario: Paste and Go navigates the active tab and closes the island
    Given a tab open on "plain"
    And the island panel is open
    And the clipboard holds the address of "other"
    When I choose "Paste and Go" from the command-bar context menu
    Then the active tab loads the address of "other"
    And the island is closed
```

(Fixture names are arbitrary: `test/desktop/support/fixtures-server.js` serves ANY `/site/<name>` path as a minimal titled page, so `"plain"` and `"other"` work as written — no fixture registration needed.)

**Step-expression conflict, load-bearing:** `Then the active tab navigates to {string}` ALREADY EXISTS in `test/desktop/steps/extended.steps.js:62` with different semantics (it resolves `ctx.enteredInput` through the address model — no actual navigation). The F19-3 scenario therefore uses the distinct expression `the active tab loads the address of {string}`, which waits for the real navigation. Do not reuse or shadow the existing expression.

- [ ] **Step 2: Extend the test hook**

In `src/main/test-hook.js`: add to the top requires:

```js
const { clipboard } = require('electron');
const { buildAddressMenu } = require('./address-menu-model');
const { runAddressMenuItem } = require('./address-menu');
```

Add `pasteAndGo` to the destructured refs list, and inside the `globalThis.__blanc = { ... }` object (near the existing `// ---- address routing / overlay ----` section, ~line 270):

```js
    // ---- address-bar context menu (F19-2/F19-3) ----
    // A native Menu.popup() can't be driven by Playwright, so these bind the
    // same pure/action layers the popup runs: buildAddressMenu for contents,
    // runAddressMenuItem for the click paths (incl. the pasteAndGo wrapper).
    setClipboardText(text) { clipboard.writeText(text); },
    readClipboardText() { return clipboard.readText(); },
    addressMenu({ fieldText }) {
      return buildAddressMenu({
        // In the real event Blink reports all-true flags for a focused,
        // populated input; the flag→enabled mapping is unit-tested.
        editFlags: {
          canUndo: true, canRedo: true, canCut: true, canCopy: true,
          canPaste: true, canDelete: true, canSelectAll: true,
        },
        clipboardText: clipboard.readText(),
        fieldText,
      });
    },
    runAddressMenuItem(id, fieldText) {
      return runAddressMenuItem(id, {
        wc: getOverlayWebContents(),
        fieldText,
        actions: {
          pasteAndGo: (text) => { pasteAndGo(getActiveTabId(), text); },
        },
      });
    },
```

In `src/main/main.js`, add `pasteAndGo,` to the refs object passed to `require('./test-hook').install({ ... })` (~line 2845).

- [ ] **Step 3: Write the step definitions**

In `test/desktop/steps/runnable.steps.js` (check first whether `Given the island panel is open` / `Then the island is closed` already exist — grep for `island` in `test/desktop/steps/`; reuse any that do and skip redefining them):

```js
// ---------- F19-2 / F19-3: address-bar context menu ----------

Given('the active tab is on {string} with query {string}', async function (name, query) {
  const url = this.fixtureUrl(name) + query;
  const id = await this.call('openTab', url);
  ctx.tabByName[name] = id;
  ctx.activeExpectedUrl = url;
  await this.waitForState((s) => s.tabs.some((t) => t.id === id && t.url === url));
});

Given('the island panel is open', async function () {
  await this.call('openPanel'); // existing hook method: showOverlay('panel')
  assert.equal(await this.call('overlayMode'), 'panel');
});

Given('the clipboard holds the address of {string}', async function (name) {
  ctx.pasteTargetUrl = this.fixtureUrl(name);
  await this.call('setClipboardText', ctx.pasteTargetUrl);
});

When('I open the command-bar context menu', async function () {
  // Binding note (test/desktop/README.md convention): a native popup can't
  // be driven, so "open" captures the menu the popup would show, built from
  // the same descriptors — with fieldText = the untouched field's value,
  // which is the active tab's URL.
  const state = await this.state();
  const active = state.tabs.find((t) => t.id === state.activeTabId);
  ctx.addressMenuFieldText = active.url;
  ctx.addressMenuItems = await this.call('addressMenu', { fieldText: active.url });
});

Then('the {string} item is enabled', async function (label) {
  const item = ctx.addressMenuItems.find((i) => i.label === label);
  assert.ok(item, `menu has "${label}"`);
  assert.equal(item.enabled, true, `"${label}" enabled`);
});

When('I choose {string} from the command-bar context menu', async function (label) {
  if (!ctx.addressMenuItems) {
    // F19-3 skips the explicit "open" step: capture with the current field text.
    const state = await this.state();
    const active = state.tabs.find((t) => t.id === state.activeTabId);
    ctx.addressMenuFieldText = active.url;
    ctx.addressMenuItems = await this.call('addressMenu', { fieldText: active.url });
  }
  const item = ctx.addressMenuItems.find((i) => i.label === label);
  assert.ok(item, `menu has "${label}"`);
  assert.equal(item.enabled, true, `"${label}" enabled`);
  await this.call('runAddressMenuItem', item.id, ctx.addressMenuFieldText);
});

Then('the clipboard holds the page address with query {string}', async function (query) {
  const expected = ctx.activeExpectedUrl.split('?')[0] + query;
  assert.equal(await this.call('readClipboardText'), expected);
});

Then('the active tab loads the address of {string}', async function (name) {
  const url = this.fixtureUrl(name);
  await this.waitForState((s) =>
    s.tabs.some((t) => t.id === s.activeTabId && t.url === url));
});

Then('the island is closed', async function () {
  assert.equal(await this.call('overlayMode'), null);
});
```

Also add the context slots to `test/desktop/support/context.js` if it initializes named slots explicitly (check its shape; if it's a plain mutable object, no change needed).

Final ambiguity sweep before committing: grep both step files for each new expression (`island panel is open`, `island is closed`, `with query`, `command-bar context menu`, `loads the address of`, `clipboard holds`) — Cucumber fails on ambiguous matches, and `Given the island panel is open` in particular may already exist for an island scenario; if an identical-text step exists, reuse it and delete the duplicate from this list.

- [ ] **Step 4: Register the scenarios as runnable**

In `test/desktop/cucumber.mjs`, add to the RUNNABLE array after the `@F17-1` line:

```js
  '@F19-2', '@F19-3',
```

- [ ] **Step 5: Add the index rows**

In `spec/acceptance/index.md`, after the F19-1 row (`➖` = platform-N/A per the legend — the URL-bar menu is desktop-only per D20):

```markdown
| F19-2 | Copy Clean Link strips tracking params | D20 | ✅ | ➖ | ➖ |
| F19-3 | Paste and Go navigates + closes island | D20 | ✅ | ➖ | ➖ |
```

- [ ] **Step 6: Dry-run, then run**

Run: `npm run test:acceptance:dry`
Expected: PASS — both new scenarios resolve every step.

Run: `npm run test:acceptance:desktop`
Expected: PASS including F19-2 and F19-3. If F19-2's clipboard assertion flakes because another process wrote the clipboard mid-test, that's real pollution, not a retry candidate — the steps write then read within one scenario, so investigate before touching timeouts.

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit (single commit — see task preamble)**

```bash
git add spec/acceptance/navigation-and-context-menu.feature spec/acceptance/index.md \
  test/desktop/cucumber.mjs test/desktop/steps/runnable.steps.js \
  test/desktop/support/context.js src/main/test-hook.js src/main/main.js
git commit -m "Add F19-2/F19-3 acceptance scenarios for the address-bar menu"
```

---

### Task 6: Parity docs — F19, D20, matrix

**Files:**
- Modify: `spec/features.md` (F19 section, ~line 304)
- Modify: `spec/divergence-register.md` (append D20 after D19, ~line 423)
- Modify: `spec/parity-matrix.md` (F19 row, line ~35)

**Interfaces:** none — documentation only, but the D#/F# cross-references must match Task 5's tags exactly.

- [ ] **Step 1: Extend F19 in `spec/features.md`**

Replace the F19 section body with (keeping the existing text, adding the URL-bar paragraph and second acceptance line):

```markdown
## F19 — Context menu (link/page actions)

- Link/page actions: open in new tab, open in **background** tab, copy link,
  save/relevant page actions. Children inherit group + privacy (F2/F4). OS hand-off
  (D4) honored for `mailto:` etc. Gesture entry point diverges (D7 — long-press on
  mobile vs right-click on desktop).
- **URL-bar menu (desktop only — D20):** the command bar's address input offers
  Undo/Redo, Cut/Copy/Paste, Delete, Select All, plus **Copy Clean Link**
  (copies the field's visible text minus a curated tracking-parameter list —
  `utm_*` and known click-ids, case-insensitive, surviving params byte-intact)
  and **Paste and Go** (clipboard text through the full typed-address pipeline —
  OS hand-off, search-vs-URL heuristic, utility-sheet routing — then the island
  closes).
- **Acceptance:** Long-press/right-click a link → "open in background tab" opens it
  without switching away, inheriting the opener's group.
- **Acceptance (desktop):** Copy Clean Link on a URL with `utm_*`/click-id
  params yields the URL without them, other params intact; Paste and Go with a
  URL on the clipboard navigates the active tab and closes the island.
```

- [ ] **Step 2: Append D20 to `spec/divergence-register.md`**

After D19, matching its format:

```markdown
## D20 — URL-bar context menu (desktop only)
**Features:** F19, F5

**Why:** A pointer right-click on the address field is a desktop-only gesture.
Mobile address fields inherit the platform's own text-selection menu
(Cut/Copy/Paste/Select All arrive for free from the OS), and replacing or
augmenting that menu fights platform conventions for marginal gain.

- **Desktop:** native context menu on the island's address input: Undo, Redo,
  Cut, Copy, **Copy Clean Link**, Paste, **Paste and Go**, Delete, Select All.
  Copy Clean Link strips a curated tracking-parameter list (`utm_*` prefix plus
  known click-ids, case-insensitive) from the field's visible text, preserving
  the order and encoding of surviving parameters; disabled when the text isn't
  an http(s) URL. Paste and Go routes clipboard text through the same pipeline
  as a typed address (OS hand-off, search heuristic, utility routing) and
  dismisses the island.
- **iOS:** no custom menu; the system text-selection menu applies. No Copy
  Clean Link / Paste and Go equivalent in v1.
- **Android:** no custom menu; the system text-selection menu applies. No Copy
  Clean Link / Paste and Go equivalent in v1.

**Parity contract:** basic text editing on the address field works everywhere
via each platform's native affordances. Copy Clean Link and Paste and Go are
desktop conveniences, not parity requirements; if a platform later gains them,
the cleaning rules must match `src/main/clean-link.js` exactly.

**Status:** Accepted 2026-07-25.
```

- [ ] **Step 3: Update the F19 row in `spec/parity-matrix.md`**

Change the divergences column of the F19 row from `D4, D7` to `D4, D7, D20` (leave the rest of the row as is).

- [ ] **Step 4: Verify and commit**

Run: `npm run substrate:check`
Expected: PASS (docs don't touch substrates; this is the guard that nothing else drifted).

```bash
git add spec/features.md spec/divergence-register.md spec/parity-matrix.md
git commit -m "Record URL-bar context menu in F19 and D20"
```

---

### Task 7: Full verification + manual pass

**Files:** none (verification only).

- [ ] **Step 1: Full automated suite**

Run: `npm run substrate:check && npm run test:unit && npm run test:acceptance:dry && npm run test:acceptance:desktop`
Expected: all PASS. Report actual output, not assumptions.

- [ ] **Step 2: Manual checklist (relaunch `npm start`; chrome loads once)**

From the spec's manual list — all on the running app:

1. Right-click the address input with and without a text selection → menu appears; Cut/Copy enabled only with a selection.
2. Keyboard invocation: focus the address input, press Shift+F10 (or the menu key) → menu at the field's caret, not the mouse position. (macOS has no context-menu key by default; if Shift+F10 is bound elsewhere, note it and verify this leg on the packaged Windows/Linux build later — the `sourceType` forwarding is the code under test.)
3. Right-click the find bar and the group-name picker → both stay dead.
4. Menu up → panel stays open; dismiss with Escape → caret and selection survive.
5. Cmd-Tab to another app while the menu is open, close it → Blanc must not steal focus back; panel is dismissed on return.
6. Paste and Go with: a URL (navigates + island closes), a search phrase (searches with the Settings engine), a `mailto:` URI (hands off to the OS mail app, no navigation).
7. Copy Clean Link with typed non-URL text in the field → item disabled.

Leave the dev instance running at end of turn.

- [ ] **Step 3: Report**

Summarize results against the checklist. Any failure: stop, use superpowers:systematic-debugging, do not paper over.

---

## Self-Review Notes (already applied)

- Task 4's `deps.actions.pasteAndGo(text)` reads `activeTabId` at click time (not menu-open time) — if the active tab changed while the menu was up, the navigation targets the tab the user is looking at. Deliberate.
- `runAddressMenuItem`'s hook binding (Task 5) uses all-true `editFlags`; the flag→enabled mapping is covered by Task 2's unit tests, so the acceptance layer only asserts the layers a real click exercises (descriptors → action → clipboard/navigation/overlay).
- `wc.delete()` is the Electron WebContents editing method matching the `canDelete` flag (present alongside cut/copy/paste since Electron 1.x).
- Fixture names "plain"/"other" in Task 5 are final — the fixtures server serves any `/site/<name>` path, no registration exists to update.
- The F19-3 navigation assertion deliberately avoids the pre-existing `the active tab navigates to {string}` expression (extended.steps.js:62, model-level, no real navigation) — see Task 5 Step 1's conflict note.
```
