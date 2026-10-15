# Custom Tab Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person give any tab a name of their own (or go back to the page's title), with the name shown everywhere Blanc labels the tab and kept through navigation, restarts, Spaces, moves and reopen.

**Architecture:** The main-process tab record keeps `title` as the page's own title and gains `customTitle` (string or null). One pure module, `src/main/tab-name.js`, owns the rules (normalize, display title, the untouched-prefill check). `serializeTabs` projects `title` as the display title plus `pageTitle` (page title only while renamed), so every renderer label picks the name up unchanged. Renaming is typed in the ⌘L bar via a `/rename` command; the tab context menu's **Rename Tab…** opens it prefilled and aimed at the right-clicked tab (the existing New Group… pattern).

**Tech Stack:** Electron main process (CommonJS), sandboxed chrome renderers (`overlay.js`, `vertical-tabs.js`), `node --test` unit tests, Cucumber + Playwright-Electron acceptance, the copy/i18n substrate, the `browser-api` bridge contract.

**Spec:** `docs/superpowers/specs/2026-10-14-custom-tab-names-design.md`

## Global Constraints

- Names: whitespace runs (incl. newlines/tabs) fold to one space, ends trimmed, control characters dropped, at most **100** characters counted by code point; empty → "use the page title" (`null`).
- Untouched prefill: an un-renamed tab whose submitted name equals its (normalized) page title stays un-renamed.
- A name persists through any navigation until **Use Page Title** or an empty `/rename`.
- History and Favorites keep page titles. Duplicate Tab does **not** copy the name. Clear history keeps names.
- Private tabs may be renamed; memory only (they are never persisted, reopened or synced already).
- `tab.title` keeps meaning "the page's own title" everywhere in main; never overwrite it with the name.
- `serializeTabs` stays self-contained (unit tests lift it into a `vm` sandbox): inline `tab.customTitle || tab.title`, never call a helper there.
- Every new English string ships with `de`, `es`, `fr`, `pt-BR` and `it` in the same change, acknowledged with `npm run copy:ack`; never hand-edit generated files.
- After editing `main.js`, `preload.js` or any other trust-boundary file: `npm run audit-inventory:write`, and commit the inventory with the change.
- Session rule for this repo: run the `simplify` and `verify` skills right before every commit that changes code (not for docs-only or tests-only commits).
- Git in this worktree session: run each `git` command on its own (no `&&` chains, heredocs or loops around git). Check `git branch --show-current` is `claude/custom-tab-titles-2418df` before committing.
- Do not run the full desktop acceptance suite during UI iteration; run the targeted tags named in each task. The owner says when to run the full suite.

## Review Focus

1. **Stale target:** the right-clicked tab closes while the prefilled panel is open, then Enter is pressed → nothing is renamed (in particular, not the active tab). Pinned by Task 3's `renameTab` unknown-id test and Task 6's overlay rule that a set pending target is used even when it no longer exists.
2. **Pasted junk:** a pasted multi-line title, a 300-character string, or an emoji straddling the 100th character → one clean line, ≤100 code points, no broken surrogate. Pinned by Task 1's normalize tests.
3. **Untrusted files:** a `session.json`/`workspaces.json` written by a newer build or edited by hand with a non-string, empty or overlong `customTitle` → restore normalizes it (`createTab` runs `normalizeTabName`). Pinned by Task 1 (non-strings → null) and Task 4's source assertion on `createTab`.
4. **Page title keeps changing while renamed** (SPA titles, unread counts) → the label stays the custom name; the tooltip and Quick Switcher follow the live page title. Pinned by Task 3's `serializeTabs` projection test.
5. **Clear history with renamed tabs, then quit before any other tab change** → names survive the next launch while page titles are gone. Pinned by Task 2's `metaAfterHistoryClear` tests and Task 4's `clearSessionMeta` test.

---

### Task 1: Pure name rules (`tab-name.js`)

**Files:**
- Create: `src/main/tab-name.js`
- Test: `test/unit/tab-name.test.js`

**Interfaces:**
- Produces:
  - `MAX_TAB_NAME: number` (= 100)
  - `normalizeTabName(raw: unknown): string | null`
  - `displayTitle(tab: { customTitle?: unknown, title?: unknown } | null | undefined): string` — custom name if set, else page title, else `''`
  - `resolveTabRename(tab: { customTitle?: unknown, title?: unknown }, raw: unknown): string | null | undefined` — the new `customTitle`, or `undefined` for "change nothing"

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/tab-name.test.js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { MAX_TAB_NAME, normalizeTabName, displayTitle, resolveTabRename } = require('../../src/main/tab-name');

test('normalizeTabName trims and folds whitespace, including pasted line breaks', () => {
  assert.equal(normalizeTabName('  Cloudflare   DNS  '), 'Cloudflare DNS');
  assert.equal(normalizeTabName('Line one\nLine\ttwo\r\n'), 'Line one Line two');
  assert.equal(normalizeTabName('a  b'), 'a b');
});

test('normalizeTabName drops control characters without leaving double spaces', () => {
  assert.equal(normalizeTabName('a \u0001 b\u007f\u0085c'), 'a b c');
});

test('normalizeTabName returns null for empty, blank or non-string input', () => {
  for (const raw of ['', '   ', '\n\t', '\u0001', null, undefined, 42, {}, ['x']]) {
    assert.equal(normalizeTabName(raw), null, JSON.stringify(raw));
  }
});

test('normalizeTabName keeps at most 100 code points and never splits an emoji', () => {
  assert.equal(MAX_TAB_NAME, 100);
  assert.equal(normalizeTabName('x'.repeat(300)).length, 100);
  const name = normalizeTabName(`${'x'.repeat(99)}😀tail`);
  assert.equal(Array.from(name).length, 100);
  assert.ok(name.endsWith('😀'));
  // A cut that lands after a space must not leave it dangling.
  assert.equal(normalizeTabName(`${'x'.repeat(99)} yz`), 'x'.repeat(99));
});

test('displayTitle prefers the custom name, then the page title', () => {
  assert.equal(displayTitle({ customTitle: 'Budget', title: 'Sheets' }), 'Budget');
  assert.equal(displayTitle({ customTitle: null, title: 'Sheets' }), 'Sheets');
  assert.equal(displayTitle({ customTitle: '', title: 'Sheets' }), 'Sheets');
  assert.equal(displayTitle({}), '');
  assert.equal(displayTitle(null), '');
});

test('resolveTabRename sets, changes and clears a name', () => {
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: null }, ' Budget '), 'Budget');
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: 'Budget' }, 'Q4'), 'Q4');
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: 'Budget' }, ''), null);
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: 'Budget' }, null), null);
});

test('resolveTabRename changes nothing for an unchanged name or the untouched prefill', () => {
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: 'Budget' }, 'Budget'), undefined);
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: null }, ''), undefined);
  // Enter on the prefilled page title must not freeze it as a name.
  assert.equal(resolveTabRename({ title: 'DNS  |  Records', customTitle: null }, 'DNS | Records'), undefined);
  // A renamed tab may deliberately take its page title's text as its name.
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: 'Budget' }, 'Sheets'), 'Sheets');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/tab-name.test.js`
Expected: FAIL with `Cannot find module '../../src/main/tab-name'`

- [ ] **Step 3: Write the module**

```js
// src/main/tab-name.js
// Custom tab names (F46): the pure rules. No electron require — this is the
// unit-test surface. main.js owns the tab record and only applies verdicts
// from here; session-snapshot.js and closed-tabs.js reuse normalizeTabName
// so every path that stores or restores a name cleans it the same way.

const MAX_TAB_NAME = 100;
// C0 and C1 controls plus DEL. Whitespace controls are folded to spaces first.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** A typed (or stored) name → the name to keep, or null for "use the page
 * title". Counted by code point so an emoji at the limit is never split. */
function normalizeTabName(raw) {
  if (typeof raw !== 'string') return null;
  const folded = raw.replace(/\s/gu, ' ').replace(CONTROL, '').replace(/ {2,}/g, ' ').trim();
  if (!folded) return null;
  return Array.from(folded).slice(0, MAX_TAB_NAME).join('').trim() || null;
}

/** What Blanc labels a tab with: the person's name for it, else the page's. */
function displayTitle(tab) {
  if (typeof tab?.customTitle === 'string' && tab.customTitle) return tab.customTitle;
  return typeof tab?.title === 'string' ? tab.title : '';
}

/** What a rename request does: the new customTitle (string, or null for the
 * page title), or undefined when nothing should change. An un-renamed tab
 * submitted with its own page title stays un-renamed — otherwise one stray
 * Enter on the "Rename Tab…" prefill would freeze today's title forever. */
function resolveTabRename(tab, raw) {
  const next = normalizeTabName(raw);
  const current = normalizeTabName(tab?.customTitle);
  if (next !== null && current === null && next === normalizeTabName(tab?.title)) return undefined;
  if (next === current) return undefined;
  return next;
}

module.exports = { MAX_TAB_NAME, normalizeTabName, displayTitle, resolveTabRename };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/tab-name.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit** (run `simplify` and `verify` first)

```bash
git add src/main/tab-name.js test/unit/tab-name.test.js
git commit -m "Add the pure rules for custom tab names"
```

---

### Task 2: Saved data carries names (session meta, sync, closed tabs)

**Files:**
- Modify: `src/main/session-snapshot.js` (`sessionTabMeta`, `syncSnapshot`, new `metaAfterHistoryClear`)
- Modify: `src/main/closed-tabs.js` (`buildTabEntry`, `buildGroupEntry`, `buildBatchEntry`, `projectEntries`)
- Test: `test/unit/session-snapshot.test.js`, `test/unit/closed-tabs.test.js`, `test/unit/session-restore.test.js`

**Interfaces:**
- Consumes: `normalizeTabName`, `displayTitle` from Task 1.
- Produces:
  - `sessionTabMeta(tab)` → `{ title, favicon }` plus `customTitle` only when the tab is renamed.
  - `metaAfterHistoryClear(meta: unknown): Array<{title:'', favicon:null, customTitle?:string}> | null` (exported from `session-snapshot.js`).
  - Closed-tab entries and their group/batch members gain `customTitle: string | null`; `projectEntries` labels a single-tab entry with `customTitle || title`.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/session-snapshot.test.js` (and add `metaAfterHistoryClear` to its `require` destructuring at the top):

```js
test('sessionTabMeta writes customTitle only for a renamed tab', () => {
  assert.deepEqual(Object.keys(sessionTabMeta(tab())).sort(), ['favicon', 'title']);
  const meta = sessionTabMeta(tab({ title: 'Sheets', customTitle: '  Budget ' }));
  assert.equal(meta.title, 'Sheets', 'title keeps the page title for older builds');
  assert.equal(meta.customTitle, 'Budget');
  // An error page drops its Blanc-authored title but keeps the person's name.
  const onError = sessionTabMeta(tab({
    url: 'blanc://error/?url=' + encodeURIComponent('https://fail.example/'),
    title: 'Can’t reach this page', customTitle: 'Budget',
  }));
  assert.equal(onError.title, '');
  assert.equal(onError.customTitle, 'Budget');
});

test('syncSnapshot sends the name a renamed tab shows', () => {
  const snap = syncSnapshot([tab({ title: 'Sheets', customTitle: 'Budget' }), tab({ id: 'b', title: 'Plain' })], []);
  assert.deepEqual(snap.tabs.map((t) => t.title), ['Budget', 'Plain']);
  assert.deepEqual(Object.keys(snap.tabs[0]).sort(), ['groupId', 'pinned', 'title', 'url']);
});

test('metaAfterHistoryClear keeps typed names and drops page titles and icons', () => {
  const kept = metaAfterHistoryClear([
    { title: 'Sheets', favicon: SAFE_ICON, customTitle: 'Budget' },
    { title: 'Mail', favicon: null },
  ]);
  assert.deepEqual(kept, [
    { title: '', favicon: null, customTitle: 'Budget' },
    { title: '', favicon: null },
  ]);
});

test('metaAfterHistoryClear returns null when there is no name to keep', () => {
  assert.equal(metaAfterHistoryClear([{ title: 'Mail', favicon: null }]), null);
  assert.equal(metaAfterHistoryClear([{ title: 'Mail', customTitle: '   ' }]), null);
  assert.equal(metaAfterHistoryClear(undefined), null);
  assert.equal(metaAfterHistoryClear('junk'), null);
});
```

Append to `test/unit/closed-tabs.test.js`:

```js
test('closed entries keep a custom name and label themselves with it', () => {
  const renamed = baseTab({ title: 'Sheets', customTitle: 'Budget' });
  const entry = buildTabEntry(renamed, SNAP, { index: 0 }, 0);
  assert.equal(entry.title, 'Sheets');
  assert.equal(entry.customTitle, 'Budget');
  assert.equal(buildTabEntry(baseTab(), SNAP).customTitle, null);
  const group = buildGroupEntry({ id: 'g', name: 'work', index: 0 }, [renamed], 0);
  const batch = buildBatchEntry([renamed], 0);
  assert.equal(group.tabs[0].customTitle, 'Budget');
  assert.equal(batch.tabs[0].customTitle, 'Budget');
  assert.equal(projectEntries([entry])[0].title, 'Budget');
  assert.equal(projectEntries([buildTabEntry(baseTab(), SNAP)])[0].title, 'A');
});
```

Append to `test/unit/session-restore.test.js` (it already requires `filterRestoredSession`; add it to the destructuring if not):

```js
test('a saved custom name rides through the restore filter with its tab', () => {
  const out = filterRestoredSession({
    urls: ['blanc://settings/', 'https://a.example/'],
    meta: [{ title: 'Settings', favicon: null }, { title: 'A', favicon: null, customTitle: 'Budget' }],
  }, (url) => url.startsWith('blanc://settings'));
  assert.deepEqual(out.urls, ['https://a.example/']);
  assert.equal(out.meta[0].customTitle, 'Budget');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/session-snapshot.test.js test/unit/closed-tabs.test.js test/unit/session-restore.test.js`
Expected: FAIL — `metaAfterHistoryClear is not a function`, `customTitle` assertions undefined. (The restore-filter test may already pass: the filter passes meta objects through. Keep it as a guard.)

- [ ] **Step 3: Implement `session-snapshot.js`**

At the top, beside the existing `bookmark-validate` require:

```js
const { normalizeTabName, displayTitle } = require('./tab-name');
```

Replace the body of `sessionTabMeta`:

```js
function sessionTabMeta(tab) {
  const onErrorPage = typeof tab?.url === 'string' && tab.url.startsWith('blanc://error');
  const title = !onErrorPage && typeof tab?.title === 'string'
    ? tab.title.slice(0, MAX_META_TITLE)
    : '';
  const meta = { title, favicon: persistableFavicon(tab?.favicon) };
  // F46: only a renamed tab carries the key, so every other entry is written
  // exactly as before and older builds simply ignore it.
  const customTitle = normalizeTabName(tab?.customTitle);
  if (customTitle) meta.customTitle = customTitle;
  return meta;
}
```

In `syncSnapshot`, replace the `title:` line:

```js
        // F46: other devices see what this tab is labelled with here.
        title: displayTitle(t).slice(0, MAX_SYNC_TITLE),
```

Add after `sessionTabMeta`:

```js
/** clearSessionMeta's rewrite of one window's meta column (F46). Page titles
 * and icons are history and go; a name the person typed is theirs, like a
 * group name, and stays. Null when nothing is worth keeping, so the caller
 * deletes the column exactly as it always has. */
function metaAfterHistoryClear(meta) {
  if (!Array.isArray(meta) || !meta.some((m) => normalizeTabName(m?.customTitle))) return null;
  return meta.map((m) => {
    const customTitle = normalizeTabName(m?.customTitle);
    return customTitle ? { title: '', favicon: null, customTitle } : { title: '', favicon: null };
  });
}
```

Add `metaAfterHistoryClear` to `module.exports`.

- [ ] **Step 4: Implement `closed-tabs.js`**

At the top: `const { normalizeTabName } = require('./tab-name');`

In `buildTabEntry`, after the `title:` line:

```js
    customTitle: normalizeTabName(tab.customTitle),
```

In both the `buildGroupEntry` and `buildBatchEntry` member maps, after each `title:` line:

```js
        customTitle: normalizeTabName(m.customTitle),
```

In `projectEntries`, change the single-tab branch from `: e.title,` to:

```js
      : (e.customTitle || e.title),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/unit/session-snapshot.test.js test/unit/closed-tabs.test.js test/unit/session-restore.test.js test/unit/tabsync-model.test.js test/unit/session-meta.test.js`
Expected: PASS

- [ ] **Step 6: Commit** (run `simplify` and `verify` first)

```bash
git add src/main/session-snapshot.js src/main/closed-tabs.js test/unit/session-snapshot.test.js test/unit/closed-tabs.test.js test/unit/session-restore.test.js
git commit -m "Carry custom tab names through saved sessions, sync and closed tabs"
```

---

### Task 3: Tab record, `renameTab`, and the bridge

**Files:**
- Modify: `src/main/main.js` (require; `createTab` option + record field; `renameTab`; `serializeTabs`; `tabs:rename` handler; test-hook refs)
- Modify: `src/main/preload.js` (`renameTab`)
- Modify: `src/main/test-hook.js` (`renameTab`, `customTitle` in `state()`)
- Modify: `browser-api/contract.json` (TabEntry `title` doc + `pageTitle`; `renameTab` member)
- Regenerate: `browser-api/generated/*` via `npm run browser-api:build`
- Regenerate: `security/audit-surface-inventory.json` via `npm run audit-inventory:write`
- Test: new `test/unit/tab-rename-main.test.js`; update `test/unit/tab-sleep-snapshot-isolation.test.js`

**Interfaces:**
- Consumes: `normalizeTabName`, `resolveTabRename` (Task 1).
- Produces:
  - main: `renameTab(tabId, rawName)` — no-op for unknown tabs, tabs of another window, or `resolveTabRename(...) === undefined`; otherwise sets `tab.customTitle`, `broadcastTabs()`, `scheduleMenuRebuild()`.
  - main: `createTab(url, { ..., customTitle = null })` stores `customTitle: normalizeTabName(customTitle)`.
  - IPC `tabs:rename (id, name)`; bridge `window.browserAPI.renameTab(id: TabId, name: string | null): Promise<void>`.
  - `tabs:updated` TabEntry: `title` (display) and `pageTitle: string | null`.
  - test hook: `renameTab(id, name)`; `state().tabs[i].customTitle`.

- [ ] **Step 1: Write the failing tests**

Create `test/unit/tab-rename-main.test.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { resolveTabRename } = require('../../src/main/tab-name');
const { connectionFor, committedUrlOf, shieldChipState } = require('../../src/main/shield-model');

// main.js cannot be required under node --test; lift the shipped functions.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const renameSource = mainSource.match(/function renameTab\(tabId, rawName\) \{[\s\S]*?\n\}/)?.[0];
const serializeSource = mainSource.match(/function serializeTabs\(\) \{[\s\S]*?\n\}/)?.[0];

test('renameTab and serializeTabs could be lifted from main.js', () => {
  assert.ok(renameSource, 'renameTab not found in main.js — update this test with it');
  assert.ok(serializeSource, 'serializeTabs not found in main.js — update this test with it');
});

function renameHarness(tabList, runtimeId = 'w1') {
  const calls = [];
  const sandbox = {
    tabs: new Map(tabList.map((t) => [t.id, t])),
    rt: () => ({ id: runtimeId }),
    resolveTabRename,
    broadcastTabs: () => calls.push('broadcast'),
    scheduleMenuRebuild: () => calls.push('menu'),
  };
  vm.runInNewContext(`${renameSource}\nthis.__fn = renameTab;`, sandbox);
  return { rename: sandbox.__fn, tabs: sandbox.tabs, calls };
}

test('a name is stored and broadcast; an empty name hands back the page title', () => {
  const h = renameHarness([{ id: 't1', runtimeId: 'w1', title: 'Page', customTitle: null }]);
  h.rename('t1', '  Budget ');
  assert.equal(h.tabs.get('t1').customTitle, 'Budget');
  assert.deepEqual(h.calls, ['broadcast', 'menu']);
  h.rename('t1', '');
  assert.equal(h.tabs.get('t1').customTitle, null);
});

test('a closed tab, another window\'s tab, or an unchanged name changes nothing', () => {
  const h = renameHarness([
    { id: 't1', runtimeId: 'w1', title: 'Page', customTitle: null },
    { id: 't2', runtimeId: 'w2', title: 'Other', customTitle: null },
  ]);
  h.rename('closed-meanwhile', 'Budget');
  h.rename('t2', 'Budget');
  h.rename('t1', 'Page'); // Enter on the untouched prefill
  assert.equal(h.tabs.get('t1').customTitle, null);
  assert.equal(h.tabs.get('t2').customTitle, null);
  assert.deepEqual(h.calls, []);
});

function serialize(tab) {
  const sandbox = {
    blockingProviders: null,
    settings: { getSettings: () => ({ adblockEnabled: true, adblockExceptions: [], islandSiteColors: true }) },
    rt: () => ({ tabOrder: [tab.id] }),
    tabs: new Map([[tab.id, tab]]),
    isHostnameExcepted: () => false,
    shieldChipState, connectionFor, committedUrlOf,
    mainI18n: { t: require('../support/english-t').englishT },
    buildSiteInfo: () => ({ state: 'secure' }),
    liveContents: () => null,
    certificateObserver: { get: () => null },
  };
  vm.runInNewContext(`${serializeSource}\nthis.__fn = serializeTabs;`, sandbox);
  return sandbox.__fn()[0];
}

const PAGE = {
  id: 'p', url: 'https://example.com/', isLoading: false, blockedCount: 0,
  asleep: false, view: null, title: 'DNS | Records',
};

test('an un-renamed tab projects its page title and no pageTitle', () => {
  const row = serialize({ ...PAGE, customTitle: null });
  assert.equal(row.title, 'DNS | Records');
  assert.equal(row.pageTitle, null);
});

test('a renamed tab projects its name, with the live page title alongside', () => {
  const row = serialize({ ...PAGE, customTitle: 'Cloudflare DNS' });
  assert.equal(row.title, 'Cloudflare DNS');
  assert.equal(row.pageTitle, 'DNS | Records');
  const retitled = serialize({ ...PAGE, title: '(3) DNS | Records', customTitle: 'Cloudflare DNS' });
  assert.equal(retitled.title, 'Cloudflare DNS', 'a page retitling itself never moves the name');
  assert.equal(retitled.pageTitle, '(3) DNS | Records');
});
```

In `test/unit/tab-sleep-snapshot-isolation.test.js`, add `'pageTitle'` to `EXPECTED_KEYS` (after `'title'`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/tab-rename-main.test.js test/unit/tab-sleep-snapshot-isolation.test.js`
Expected: FAIL — `renameTab not found in main.js`; the allowlist test reports a missing `pageTitle`.

- [ ] **Step 3: Implement the record, `renameTab` and the projection in `main.js`**

Beside the `session-snapshot` require (line ~181):

```js
const { normalizeTabName, displayTitle, resolveTabRename } = require('./tab-name');
```

In `createTab`'s options destructuring (line ~5992), add `customTitle = null` after `favicon = null`. In the tab record, directly after the `title:` line:

```js
    // F46: the person's own name for this tab, or null for the page title.
    // `title` stays the page's own; restore paths hand in file contents, so
    // the name is normalized here too.
    customTitle: normalizeTabName(customTitle),
```

Directly after `groupTabByName` (line ~5108):

```js
/** F46: give a tab the person's own name, or with an empty name hand it back
 * its page title. The rules (cleaning, the untouched-prefill check) live in
 * tab-name.js; this applies the verdict. A tab of another window or one that
 * closed while the panel was open is left alone. */
function renameTab(tabId, rawName) {
  const tab = tabs.get(tabId);
  if (!tab || tab.runtimeId !== rt().id) return;
  const next = resolveTabRename(tab, rawName);
  if (next === undefined) return;
  tab.customTitle = next;
  broadcastTabs();
  scheduleMenuRebuild();
}
```

In `serializeTabs`, replace `title: tab.title,` in the `rest` object with:

```js
        // F46: the label to draw — the person's name when renamed, else the
        // page's title. pageTitle carries the page's own title only while the
        // tab is renamed (tooltips, Quick Switcher). Inline on purpose: tests
        // lift this function without tab-name.js.
        title: tab.customTitle || tab.title,
        pageTitle: tab.customTitle ? tab.title : null,
```

Directly after `chromeHandle('tabs:duplicate', …)`:

```js
  chromeHandle('tabs:rename', (_e, id, name) => { renameTab(id, name ?? null); });
```

In the `require('./test-hook').install({ … })` call (line ~10388), add `renameTab,` to the list that holds `groupTabByName, toggleGroupCollapsed, …`.

- [ ] **Step 4: Bridge, hook and contract**

`src/main/preload.js`, directly after `duplicateTab`:

```js
  renameTab: (id, name) => ipcRenderer.invoke('tabs:rename', id, name),
```

`src/main/test-hook.js`: add `renameTab,` to the destructured `refs` (next to `groupTabByName`); in `state()`'s per-tab object add `customTitle: t.customTitle ?? null,` after `title`; beside `groupTabByName(id, name)` add:

```js
    renameTab(id, name) { renameTab(id, name); },
```

`browser-api/contract.json`, in `types.TabEntry.fields`, replace the `title` entry and add `pageTitle` after it:

```json
        "title": {
          "type": "string",
          "doc": "The label to draw: the person's custom name when the tab is renamed (F46), else the page title."
        },
        "pageTitle": {
          "type": "string | null",
          "doc": "The page's own title while the tab has a custom name; null otherwise."
        },
```

In `members`, directly after the `duplicateTab` member:

```json
    {
      "name": "renameTab",
      "group": "tabs",
      "kind": "invoke",
      "channel": "tabs:rename",
      "params": [
        {
          "name": "id",
          "type": "TabId"
        },
        {
          "name": "name",
          "type": "string | null"
        }
      ],
      "returns": "void",
      "doc": "Give a tab a custom name, or with an empty or null name restore its page title (F46)."
    },
```

- [ ] **Step 5: Regenerate and run the checks**

Run: `npm run browser-api:build`
Then: `npm run browser-api:check`
Expected: `browser-api:check` passes; `browser-api/generated/` shows `renameTab` and `pageTitle` added.

Run: `npm run audit-inventory:write`
Then: `node --test test/unit/tab-rename-main.test.js test/unit/tab-sleep-snapshot-isolation.test.js test/unit/browser-api-contract.test.js test/unit/island-site-colors.test.js test/unit/quiet-tabs-chrome.test.js test/unit/fill-hint.test.js test/unit/audit-surface-inventory.test.js`
Expected: PASS

- [ ] **Step 6: Commit** (run `simplify` and `verify` first)

```bash
git add src/main/main.js src/main/preload.js src/main/test-hook.js browser-api security/audit-surface-inventory.json test/unit/tab-rename-main.test.js test/unit/tab-sleep-snapshot-isolation.test.js
git commit -m "Store custom tab names and project them to the chrome"
```

---

### Task 4: Names survive restore and reopen, and label main's own surfaces

**Files:**
- Modify: `src/main/main.js` (launch restore, space open, `reopenEntry`/`reopenGroupEntry`/`reopenBatchEntry`, `closedMemberRecord`, `clearSessionMeta`, `tabMenuItems`, `dockActiveTabDescriptor`, Glance status)
- Regenerate: `security/audit-surface-inventory.json`
- Test: `test/unit/session-meta.test.js`, `test/unit/tab-menu-items.test.js`, new assertions in `test/unit/tab-rename-main.test.js`

**Interfaces:**
- Consumes: `metaAfterHistoryClear` (Task 2), `displayTitle`/`normalizeTabName` (Task 1), `createTab`'s `customTitle` option (Task 3).
- Produces: no new names.

- [ ] **Step 1: Write the failing tests**

In `test/unit/session-meta.test.js`, change `runClear`'s sandbox to provide the helper:

```js
  const sandbox = {
    sessionReadOnly: readOnly,
    ensureSessionStore: () => ({ update: (fn) => fn(data) }),
    metaAfterHistoryClear: require('../../src/main/session-snapshot').metaAfterHistoryClear,
  };
```

and add:

```js
test('clearing history keeps names the person typed and drops page titles', () => {
  const data = runClear({
    version: 2,
    windows: [
      { urls: ['https://a/', 'https://b/'], meta: [{ title: 'A', favicon: null, customTitle: 'Budget' }, { title: 'B', favicon: null }] },
      { urls: ['https://c/'], meta: [{ title: 'C', favicon: null }] },
    ],
  });
  assert.deepEqual(data.windows[0].meta, [
    { title: '', favicon: null, customTitle: 'Budget' },
    { title: '', favicon: null },
  ]);
  assert.equal('meta' in data.windows[1], false, 'a window without names loses its meta as before');
});
```

In `test/unit/tab-menu-items.test.js`, add `displayTitle: require('../../src/main/tab-name').displayTitle,` to the sandbox in `run()`, and add:

```js
test('a renamed tab is listed by its custom name', () => {
  const items = run({ slotIds: [1], tabsById: { 1: tab({ customTitle: 'Reading' }) } });
  assert.equal(items[0].label, 'Reading — theverge.com');
});
```

Append to `test/unit/tab-rename-main.test.js`:

```js
test('every restore and reopen path hands the saved name back to createTab', () => {
  assert.match(mainSource, /customTitle: saved\.meta\?\.\[index\]\?\.customTitle \?\? null,/, 'launch restore');
  assert.match(mainSource, /customTitle: cleaned\.meta\?\.\[index\]\?\.customTitle \?\? null,/, 'opening a space');
  assert.equal((mainSource.match(/asleep: true, title: member\.title, favicon: member\.favicon, customTitle: member\.customTitle,/g) || []).length, 2, 'group and batch reopen');
  assert.match(mainSource, /pinned: entry\.pinned, muted: entry\.muted, groupId: resolvedGroupId, customTitle: entry\.customTitle,/, 'single-tab reopen, every tier');
  const member = mainSource.match(/function closedMemberRecord\(id\) \{[\s\S]*?\n\}/)?.[0];
  assert.match(member, /customTitle: tab\.customTitle \?\? null,/, 'group/batch close records the name');
  const create = mainSource.match(/function createTab\(url = newTabUrl\(\), \{[\s\S]*?\n\}/)?.[0];
  assert.match(create, /customTitle: normalizeTabName\(customTitle\),/, 'createTab cleans names from files');
});

test('duplicating a tab does not copy its name', () => {
  const duplicate = mainSource.match(/function duplicateTab\(id\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(duplicate, 'duplicateTab not found');
  assert.doesNotMatch(duplicate, /customTitle/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/session-meta.test.js test/unit/tab-menu-items.test.js test/unit/tab-rename-main.test.js`
Expected: FAIL — names cleared from session meta; Tabs menu shows the page title; restore/reopen source assertions do not match.

- [ ] **Step 3: Implement in `main.js`**

Require `metaAfterHistoryClear` alongside the existing `session-snapshot` import:

```js
const { persistableEntries, sessionTabMeta, metaAfterHistoryClear } = require('./session-snapshot');
```

Launch restore (line ~11103) and space open (line ~5691): after each `favicon: … ?? null,` line add, respectively:

```js
          customTitle: saved.meta?.[index]?.customTitle ?? null,
```

```js
      customTitle: cleaned.meta?.[index]?.customTitle ?? null,
```

`reopenGroupEntry` and `reopenBatchEntry`: change `asleep: true, title: member.title, favicon: member.favicon,` to

```js
      asleep: true, title: member.title, favicon: member.favicon, customTitle: member.customTitle,
```

`reopenEntry`'s `common` object: change its first line to

```js
    pinned: entry.pinned, muted: entry.muted, groupId: resolvedGroupId, customTitle: entry.customTitle,
```

(`common` is spread into both the Tier 0 adoption and the snapshot/URL `createTab` calls, so every tier keeps the name.)

`closedMemberRecord`'s returned object: after `url: tab.url, title: tab.title, favicon: tab.favicon ?? null,` add

```js
    customTitle: tab.customTitle ?? null,
```

`clearSessionMeta` becomes:

```js
function clearSessionMeta() {
  if (sessionReadOnly) return;
  ensureSessionStore().update((d) => {
    if (Array.isArray(d.windows)) {
      for (const windowEntry of d.windows) {
        if (!windowEntry || typeof windowEntry !== 'object') continue;
        // F46: page titles go with history; names the person typed stay.
        const kept = metaAfterHistoryClear(windowEntry.meta);
        if (kept) windowEntry.meta = kept;
        else delete windowEntry.meta;
      }
    }
    delete d.meta;
  });
}
```

Labels — use the display title:
- `tabMenuItems` (line ~8014): ``const label = `${displayTitle(tab) || mainI18n.t('tab.untitled')} — ${domain}${group ? ` (${group.name})` : ''}`;``
- `dockActiveTabDescriptor` (line ~8785): `const raw = displayTitle(tab) || mainI18n.t(tab.isLoading ? 'tab.loading' : 'tab.untitled');`
- `setGlanceTab`'s status (line ~6444): `mainI18n.t('glance.status.opened', { title: displayTitle(tab) || mainI18n.t('tab.untitledShort') })`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run audit-inventory:write`
Then: `node --test test/unit/session-meta.test.js test/unit/tab-menu-items.test.js test/unit/tab-rename-main.test.js test/unit/closed-tabs-ui.test.js test/unit/workspaces-apply.test.js test/unit/close-tab-shutdown.test.js test/unit/audit-surface-inventory.test.js`
Expected: PASS

- [ ] **Step 5: Commit** (run `simplify` and `verify` first)

```bash
git add src/main/main.js security/audit-surface-inventory.json test/unit/session-meta.test.js test/unit/tab-menu-items.test.js test/unit/tab-rename-main.test.js
git commit -m "Keep custom tab names through restore, reopen and clear history"
```

---

### Task 5: Rename Tab… and Use Page Title in the tab menu

**Files:**
- Modify: `copy/messages/en.json`, `de.json`, `es.json`, `fr.json`, `pt-BR.json`, `it.json` (`tabMenu.rename`, `tabMenu.usePageTitle`)
- Regenerate: `npm run copy:build` outputs (`src/renderer/pages/strings.*.js`, `src/main/ublock-strings.json` if touched, `copy/generated/*`)
- Modify: `src/main/tab-context-menu-model.js`, `src/main/tab-context-menu.js`
- Modify: `src/main/main.js` (`beginRenameTab`, `tabContextData`, `menuContextActions`, test-hook refs)
- Modify: `src/main/test-hook.js` (`beginRenameTab`)
- Regenerate: `security/audit-surface-inventory.json`
- Test: `test/unit/tab-context-menu-model.test.js`, `test/unit/tab-context-menu-runner.test.js`

**Interfaces:**
- Consumes: `renameTab` and `displayTitle` (Tasks 1, 3).
- Produces:
  - menu item ids `rename` (always) and `use-page-title` (only when `tab.customTitle`), placed right after `duplicate`.
  - runner actions `actions.rename(tabId)` and `actions.usePageTitle(tabId)`.
  - main: `beginRenameTab(tabId)` → `showOverlay('panel', { prefill: '/rename <display title>', purpose: { renameTabId: tabId } })`. Task 6's overlay consumes `purpose.renameTabId`.
  - test hook: `beginRenameTab(id)`.

- [ ] **Step 1: Add the strings**

`copy/messages/en.json`, directly after `tabMenu.duplicate`:

```json
  "tabMenu.rename": {
    "message": "Rename Tab…",
    "note": "Tab context menu command that opens the ⌘L bar to type a custom name for the tab."
  },
  "tabMenu.usePageTitle": {
    "message": "Use Page Title",
    "note": "Tab context menu command shown only on a renamed tab; removes the custom name so the tab shows the page’s own title again."
  },
```

In each translation file, directly after its `tabMenu.duplicate` entry, add both keys with a `message` only (the `source` hash is written by `copy:ack`):

| key | de | es | fr | pt-BR | it |
| --- | --- | --- | --- | --- | --- |
| `tabMenu.rename` | `Tab umbenennen…` | `Cambiar nombre de pestaña…` | `Renommer l’onglet…` | `Renomear aba…` | `Rinomina scheda…` |
| `tabMenu.usePageTitle` | `Seitentitel verwenden` | `Usar título de la página` | `Utiliser le titre de la page` | `Usar título da página` | `Usa il titolo della pagina` |

e.g. in `de.json`:

```json
  "tabMenu.rename": {
    "message": "Tab umbenennen…"
  },
  "tabMenu.usePageTitle": {
    "message": "Seitentitel verwenden"
  },
```

Run, one per language:

```bash
npm run copy:ack -- de tabMenu.rename tabMenu.usePageTitle
npm run copy:ack -- es tabMenu.rename tabMenu.usePageTitle
npm run copy:ack -- fr tabMenu.rename tabMenu.usePageTitle
npm run copy:ack -- pt-BR tabMenu.rename tabMenu.usePageTitle
npm run copy:ack -- it tabMenu.rename tabMenu.usePageTitle
npm run copy:build
npm run copy:check
```

Expected: `copy:check` passes. If `copy:ack` rejects an entry without `source`, run `npm run copy:status -- de` and match the shape it reports.

- [ ] **Step 2: Write the failing tests**

In `test/unit/tab-context-menu-model.test.js`, update the order test's expected ids to insert `'rename'` after `'duplicate'`:

```js
    'copy-link', 'copy-clean-link', 'reload', 'duplicate', 'rename',
```

and add:

```js
test('Rename Tab… is always offered; Use Page Title only on a renamed tab', () => {
  assert.equal(byId(build(), 'rename').label, 'Rename Tab…');
  assert.equal(byId(build(), 'use-page-title'), undefined);
  const renamed = build({ tab: { customTitle: 'Budget' } });
  assert.equal(byId(renamed, 'use-page-title').label, 'Use Page Title');
  assert.deepEqual(ids(renamed).slice(3, 6), ['duplicate', 'rename', 'use-page-title']);
});
```

and extend the separator test's loop to include `build({ tab: { customTitle: 'Budget' } })`.

In `test/unit/tab-context-menu-runner.test.js`, add `'rename', 'usePageTitle'` to the `names` list and add:

```js
test('rename begins the handoff; use-page-title clears the name', () => {
  for (const [id, fn] of [['rename', 'rename'], ['use-page-title', 'usePageTitle']]) {
    const { actions, calls } = spyActions();
    runTabContextMenuItem(id, { tab, actions });
    assert.deepEqual(calls, [[fn, 7]]);
  }
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/unit/tab-context-menu-model.test.js test/unit/tab-context-menu-runner.test.js`
Expected: FAIL — no `rename` item; runner returns undefined.

- [ ] **Step 4: Implement the menu**

`tab-context-menu-model.js`, the reload/duplicate section becomes:

```js
  items.push({ id: 'reload', label: t('menu.reload'), accelerator: ACCEL.reload });
  items.push({ id: 'duplicate', label: t('tabMenu.duplicate') });
  items.push({ id: 'rename', label: t('tabMenu.rename') });
  // Only a renamed tab has a page title to go back to (F46).
  if (tab.customTitle) items.push({ id: 'use-page-title', label: t('tabMenu.usePageTitle') });
  items.push({ type: 'separator' });
```

`tab-context-menu.js`, in `runTabContextMenuItem` after `duplicate`:

```js
    case 'rename': return actions.rename(tab.id);
    case 'use-page-title': return actions.usePageTitle(tab.id);
```

`main.js`, directly after `beginNewGroup`:

```js
/** "Rename Tab…" handoff (F46): the command panel prefilled with /rename and
 * the tab's current label, bound to the right-clicked tab. Same atomic
 * purpose-payload reasoning as beginNewGroup: the target must survive the
 * overlay's did-finish-load replay or Enter would rename the active tab. */
function beginRenameTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  showOverlay('panel', { prefill: `/rename ${displayTitle(tab)}`, purpose: { renameTabId: tabId } });
}
```

In `tabContextData`'s `tab` object add `customTitle: tab.customTitle ?? null,`. In `menuContextActions` after `beginNewGroup`:

```js
    rename: b((id) => beginRenameTab(id)),
    usePageTitle: b((id) => renameTab(id, null)),
```

Add `beginRenameTab,` to the test-hook `install({ … })` refs; in `test-hook.js` destructure it and add `beginRenameTab(id) { beginRenameTab(id); },` beside `renameTab`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run audit-inventory:write`
Then: `node --test test/unit/tab-context-menu-model.test.js test/unit/tab-context-menu-runner.test.js test/unit/audit-surface-inventory.test.js`
Then: `npm run copy:check`
Expected: PASS

- [ ] **Step 6: Commit** (run `simplify` and `verify` first)

```bash
git add copy src/renderer/pages src/main/tab-context-menu-model.js src/main/tab-context-menu.js src/main/main.js src/main/test-hook.js security/audit-surface-inventory.json test/unit/tab-context-menu-model.test.js test/unit/tab-context-menu-runner.test.js
git commit -m "Add Rename Tab and Use Page Title to the tab menu"
```

Before committing, run `git status` and also add any other file `copy:build` regenerated (for example `src/main/i18n-locales.json`). `src/main/ublock-strings.json` should not change, since no `ublock.*` key changed; if it did, stop and find out why.

---

### Task 6: The `/rename` command and renderer labels

**Files:**
- Modify: `copy/messages/*.json` (`slash.rename.hint`, `slash.rename.doc`), `copy/slash-commands.json`
- Modify: `src/renderer/overlay.js` (command, pending target, prefill selection, row tooltip, Quick Switcher, Glance picker filter)
- Modify: `src/renderer/vertical-tabs.js` (tooltip, render signature)
- Modify: `src/main/main.js` (`SLASH_COMMANDS`), `src/renderer/pages/shortcuts.js` (`SLASH_COMMANDS`)
- Regenerate: `npm run copy:build` outputs; `security/audit-surface-inventory.json`

**Interfaces:**
- Consumes: `browserAPI.renameTab` (Task 3), `purpose.renameTabId` from `beginRenameTab` (Task 5), TabEntry `pageTitle` (Task 3).
- Produces: `/rename [name]` command; overlay state `pendingRenameTabId`.

- [ ] **Step 1: Strings and registry**

`copy/messages/en.json`, directly after `slash.mute.hint`:

```json
  "slash.rename.hint": {
    "message": "Name this tab — leave it empty to use the page title",
    "note": "Slash command hint shown in the ⌘L palette for /rename."
  },
  "slash.rename.doc": {
    "message": "Give this tab your own name, or go back to its page title with no name",
    "note": "Reference description of /rename [name] on blanc://shortcuts and in Help → Slash Commands."
  },
```

Translations, directly after each file's `slash.mute.hint`:

| key | de | es | fr | pt-BR | it |
| --- | --- | --- | --- | --- | --- |
| `slash.rename.hint` | `Diesem Tab einen Namen geben – leer lassen für den Seitentitel` | `Ponle nombre a esta pestaña; déjalo vacío para usar el título de la página` | `Nommer cet onglet — laissez vide pour utiliser le titre de la page` | `Dê um nome a esta aba — deixe vazio para usar o título da página` | `Dai un nome a questa scheda — lascia vuoto per usare il titolo della pagina` |
| `slash.rename.doc` | `Diesem Tab einen eigenen Namen geben oder ohne Namen zum Seitentitel zurückkehren` | `Da a esta pestaña un nombre propio o, sin nombre, vuelve al título de la página` | `Donne à cet onglet le nom de votre choix, ou revient au titre de la page sans nom` | `Dá a esta aba um nome próprio ou, sem nome, volta ao título da página` | `Dà a questa scheda un nome a tua scelta o, senza nome, torna al titolo della pagina` |

`copy/slash-commands.json`, directly after the `/mute` entry:

```json
    {
      "command": "/rename",
      "doc": {
        "command": "/rename [name]"
      },
      "platforms": [
        "macos",
        "windows",
        "linux"
      ]
    },
```

`main.js` and `src/renderer/pages/shortcuts.js`, in each `SLASH_COMMANDS` list directly after `['/mute', 'slash.mute.hint'],`:

```js
  ['/rename [name]', 'slash.rename.doc'],
```

- [ ] **Step 2: The overlay command**

`overlay.js` line ~108, beside `let pendingGroupTabId = null;`:

```js
  // F46: the tab a menu-initiated "Rename Tab…" targets, like pendingGroupTabId.
  let pendingRenameTabId = null;
```

In `COMMANDS`, directly after the `/mute` entry:

```js
    { cmd: '/rename', hint: blancI18n.t('slash.rename.hint'), run: (input) => {
      const name = (input ?? '').replace(/^\/rename\s*/, '');
      // "Rename Tab…" targets the right-clicked tab, even if it closed in the
      // meantime (main then does nothing) — never silently the active tab.
      // An empty name hands the tab back its page title.
      const target = pendingRenameTabId ?? state.activeTabId;
      if (target) window.browserAPI.renameTab(target, name);
      pendingRenameTabId = null;
    } },
```

In `applyMode`'s panel branch: inside `if (!reshow) { … }` after `pendingGroupTabId = null;` add `pendingRenameTabId = null;`. Replace the `beginGroupTabId` purpose block with:

```js
      if (purpose && typeof purpose === 'object' && purpose.beginGroupTabId != null) {
        pendingGroupTabId = purpose.beginGroupTabId;
        pendingRenameTabId = null;
      }
      // "Rename Tab…" (F46): same atomic payload as New Group… above.
      if (purpose && typeof purpose === 'object' && purpose.renameTabId != null) {
        pendingRenameTabId = purpose.renameTabId;
        pendingGroupTabId = null;
      }
```

Replace `if (prefill) addressInput.setSelectionRange(prefill.length, prefill.length);` with:

```js
        if (prefill) {
          // "Rename Tab…" selects only the current name, so typing replaces
          // it and the arrow keys edit it; other prefills park the cursor.
          const from = pendingRenameTabId != null && prefill.startsWith('/rename ')
            ? '/rename '.length
            : prefill.length;
          addressInput.setSelectionRange(from, prefill.length);
        }
```

In the overlay-hide handler (line ~2366), after `pendingGroupTabId = null;` add `pendingRenameTabId = null;`.

In the input handler (line ~2515), after the `/group` block:

```js
    if (pendingRenameTabId != null && !addressInput.value.startsWith('/rename')) {
      pendingRenameTabId = null;
    }
```

- [ ] **Step 3: Renderer labels**

`overlay.js` `tabRow`: replace `if (tab.title) title.title = tab.title;` with

```js
    // A renamed row's tooltip is the page's own title (F46).
    if (tab.pageTitle || tab.title) title.title = tab.pageTitle || tab.title;
```

`switcherResults`: replace `matchScore(query, matchableText(t.title, t.url))` (the local-tabs loop) with

```js
      const s = matchScore(query, matchableText([t.title, t.pageTitle].filter(Boolean).join(' '), t.url));
```

`filteredGlanceTabs`: `[tab.title, tab.pageTitle, tabDomain(tab), groupName]`.

`vertical-tabs.js`: in `railSignature`'s tab map add `pageTitle: tab.pageTitle,` after `title: tab.title,`; replace `primary.title = title;` with `primary.title = tab.pageTitle || title;`.

- [ ] **Step 4: Acknowledge, build and check**

```bash
npm run copy:ack -- de slash.rename.hint slash.rename.doc
npm run copy:ack -- es slash.rename.hint slash.rename.doc
npm run copy:ack -- fr slash.rename.hint slash.rename.doc
npm run copy:ack -- pt-BR slash.rename.hint slash.rename.doc
npm run copy:ack -- it slash.rename.hint slash.rename.doc
npm run copy:build
npm run audit-inventory:write
npm run substrate:check
npm run lint
```

Expected: all pass (`copy:check` inside `substrate:check` verifies the registry order across `overlay.js`, `main.js` and `shortcuts.js`).

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 5: Commit** (run `simplify` and `verify` first)

```bash
git add copy src/renderer src/main/main.js security/audit-surface-inventory.json
git commit -m "Add the /rename command and show page titles on renamed rows"
```

---

### Task 7: Spec entry and acceptance scenarios (F46)

**Files:**
- Modify: `spec/features.md` (new `## F46 — Custom tab names (desktop)` after F45)
- Modify: `spec/parity-matrix.md` (F46 row after F45)
- Modify: `spec/acceptance/index.md` (files table + F46 rows)
- Modify: `spec/acceptance/tabs-and-groups.feature` (F46 scenarios)
- Create: `test/desktop/steps/custom-tab-names.steps.js`
- Modify: `test/desktop/cucumber.mjs` (`RUNNABLE`)

**Interfaces:**
- Consumes: test hooks `renameTab`, `beginRenameTab`, `state().tabs[i].customTitle`, `navigateTab`, `openTab`, `persistedSessionData`, `openPanel`, `closeOverlay`; `overlayPage`, `runSlashCommand`, `openOverlaySurface`; `ctx.relaunch`.

- [ ] **Step 1: Spec text**

`spec/features.md`, after F45:

```markdown
## F46 — Custom tab names (desktop)

A person can give any tab a name of their own, or keep the page's title.

- **Rename.** The tab context menu's **Rename Tab…** opens the command bar
  with `/rename` and the tab's current label, the label selected, aimed at
  that tab. `/rename <name>` renames the active tab; `/rename` alone, or
  **Use Page Title** (shown only on a renamed tab), restores the page title.
- **The name.** Whitespace folds to single spaces, control characters are
  dropped, at most 100 characters; empty means the page title. Submitting an
  un-renamed tab's own page title does not rename it.
- **Lifetime.** The name stays through any navigation, quiet/wake, moves,
  relaunch, Blanc Spaces and Reopen Closed Tab; Duplicate Tab does not copy
  it. Private tabs can be renamed, in memory only.
- **Where it shows.** Every Blanc label for the tab (rows, rail, dots, Glance,
  Tabs and Dock menus, Recently Closed, other devices via Tab Sync). History
  and Favorites keep page titles; a renamed row's tooltip shows the page
  title, and the Quick Switcher matches both.
- **Acceptance:**
  [`acceptance/tabs-and-groups.feature`](./acceptance/tabs-and-groups.feature)
  (`@F46`, bound in `test/desktop/steps/custom-tab-names.steps.js`);
  `test/unit/tab-name.test.js` and `test/unit/tab-rename-main.test.js`.
```

`spec/parity-matrix.md`, after the F45 row:

```markdown
| F46 | Custom tab names | SHIPPED | — | — | Desktop only. A tab may carry the person's own name instead of its page title; it survives navigation, relaunch, Spaces and reopen, never reaches History or Favorites, and is memory-only for private tabs. | — |
```

`spec/acceptance/index.md`: change the Tabs & groups files row to `| Tabs & groups | \`tabs-and-groups.feature\` | F2, F3, F46 |`, and append after the F45 rows:

```markdown
| F46-1 | Rename Tab… names the right-clicked tab | — | ✅ | ➖ | ➖ |
| F46-2 | A name stays through navigation to another site | — | ✅ | ➖ | ➖ |
| F46-3 | `/rename` with no name restores the page title | — | ✅ | ➖ | ➖ |
| F46-4 | Use Page Title restores the page title | — | ✅ | ➖ | ➖ |
| F46-5 | A name survives relaunch | — | ✅ | ➖ | ➖ |
| F46-6 | A private tab's name never reaches session.json | — | ✅ | ➖ | ➖ |
```

- [ ] **Step 2: Scenarios**

Append to `spec/acceptance/tabs-and-groups.feature`:

```gherkin
  @F46-1 @F46 @desktop
  Scenario: Rename Tab… names the right-clicked tab
    Given a tab open on "rename-first"
    And a tab open on "rename-other"
    When I choose Rename Tab… for the tab on "rename-first"
    Then the command bar reads "/rename rename-first" with "rename-first" selected
    When I type "Budget" and press Enter in the command bar
    Then the tab on "rename-first" is labelled "Budget"
    And the tab on "rename-other" is labelled "rename-other"

  @F46-2 @F46 @desktop
  Scenario: A name stays through navigation to another site
    Given a tab on "rename-first" named "Budget"
    When that tab goes to "rename-second" on another site
    Then the tab on "rename-second" is labelled "Budget"

  @F46-3 @F46 @desktop
  Scenario: /rename with no name restores the page title
    Given a tab on "rename-first" named "Budget"
    When I run the slash command "/rename"
    Then the tab on "rename-first" is labelled "rename-first"

  @F46-4 @F46 @desktop
  Scenario: Use Page Title restores the page title
    Given a tab on "rename-first" named "Budget"
    When I choose Use Page Title for the tab on "rename-first"
    Then the tab on "rename-first" is labelled "rename-first"

  @F46-5 @F46 @desktop
  Scenario: A name survives relaunch
    Given a tab on "rename-first" named "Budget"
    And the saved session holds the name "Budget"
    When I relaunch Blanc
    Then the tab on "rename-first" is labelled "Budget"

  @F46-6 @F46 @desktop
  Scenario: A private tab's name never reaches session.json
    Given a private tab on "rename-private" named "Secret plan"
    And a tab on "rename-first" named "Budget"
    Then the saved session holds the name "Budget"
    And the saved session does not contain "Secret plan"
```

- [ ] **Step 3: Step definitions**

Create `test/desktop/steps/custom-tab-names.steps.js`:

```js
const assert = require('node:assert');
const { Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('./../support/context');
const { waitForValue, openOverlaySurface } = require('./../support/poll');
const { overlayPage } = require('./../support/overlay');

// F46 custom tab names. "Rename Tab…" and "Use Page Title" are native menu
// items the harness cannot click; their steps call exactly the action each
// item runs (beginRenameTab / renameTab(id, null)). Typing in the command bar
// and the labels read back go through the real overlay.

async function openLoaded(world, name, opts) {
  const url = world.fixtureUrl(name);
  const id = await world.call('openTab', url, opts);
  await world.waitForState((s) => s.tabs.some((t) => t.id === id && t.title === name && !t.isLoading));
  ctx.tabByName[name] = id;
  return id;
}

async function named(world, name, label, opts) {
  const id = await openLoaded(world, name, opts);
  await world.call('renameTab', id, label);
  await world.waitForState((s) => s.tabs.some((t) => t.id === id && t.customTitle === label));
  return id;
}

/** The tab's label as the ⌘L panel draws it, plus the stored name. */
async function labelOf(world, id) {
  await openOverlaySurface(world, 'openPanel', 'panel');
  const page = await overlayPage();
  const text = await page.locator(`.tab-row[data-tab-id="${id}"] .row-title`).textContent();
  await world.call('closeOverlay');
  return text;
}

Given('a tab on {string} named {string}', async function (name, label) {
  ctx.renamedTabId = await named(this, name, label);
});

Given('a private tab on {string} named {string}', async function (name, label) {
  await named(this, name, label, { private: true });
});

When('I choose Rename Tab… for the tab on {string}', async function (name) {
  await this.call('beginRenameTab', ctx.tabByName[name]);
  await waitForValue(() => this.call('overlayRendererMode'), (m) => m === 'panel', 'the command bar to open');
});

When('I choose Use Page Title for the tab on {string}', async function (name) {
  await this.call('renameTab', ctx.tabByName[name], null);
});

Then('the command bar reads {string} with {string} selected', async function (text, selected) {
  const page = await overlayPage();
  const field = await waitForValue(
    () => page.evaluate(() => {
      const input = document.getElementById('addressInput');
      return { value: input.value, selected: input.value.slice(input.selectionStart, input.selectionEnd) };
    }),
    (f) => f.value === text,
    'the rename prefill',
  );
  assert.equal(field.selected, selected);
});

When('I type {string} and press Enter in the command bar', async function (typed) {
  const page = await overlayPage();
  await page.keyboard.type(typed);
  await page.press('#addressInput', 'Enter');
});

When('that tab goes to {string} on another site', async function (name) {
  // insecure.test is a different site from 127.0.0.1 (the harness maps it to
  // the same fixture server with --host-resolver-rules).
  await this.call('navigateTab', ctx.renamedTabId, this.insecureFixtureUrl(name));
  await this.waitForState((s) => s.tabs.some((t) => t.id === ctx.renamedTabId && t.title === name && !t.isLoading));
  ctx.tabByName[name] = ctx.renamedTabId;
});

Then('the tab on {string} is labelled {string}', async function (name, label) {
  // Matched by path, so it finds the tab whichever host it reached it on and
  // after a relaunch (fresh tab ids). The rename crosses IPC asynchronously:
  // wait for main's record to agree before reading what the panel draws.
  const pathname = new URL(this.fixtureUrl(name)).pathname;
  const state = await this.waitForState((s) => s.tabs.some((t) =>
    t.url.endsWith(pathname) && (t.customTitle || t.title) === label));
  const tab = state.tabs.find((t) => t.url.endsWith(pathname));
  assert.equal(await labelOf(this, tab.id), label);
});

// Cucumber matches step text regardless of Given/When/Then, so this one
// definition also serves "Then the saved session holds the name …".
Given('the saved session holds the name {string}', async function (label) {
  await waitForValue(
    () => this.call('persistedSessionData'),
    (data) => JSON.stringify(data?.windows ?? []).includes(`"customTitle":${JSON.stringify(label)}`),
    `session.json to hold ${label}`,
  );
});

Then('the saved session does not contain {string}', async function (text) {
  const data = await this.call('persistedSessionData');
  assert.equal(JSON.stringify(data).includes(text), false);
});
```

`When I relaunch Blanc` already exists in `vertical-tabs.steps.js` and `When I run the slash command {string}` in `runnable.steps.js`; do not redefine them.

`test/desktop/cucumber.mjs`, after the F45 line in `RUNNABLE`:

```js
  // F46 custom tab names.
  '@F46-1', '@F46-2', '@F46-3', '@F46-4', '@F46-5', '@F46-6',
```

- [ ] **Step 4: Run the scenarios**

Run: `npm run test:acceptance:dry`
Expected: every F46 step resolves.

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F46 or @F2 or @F3"`
Expected: PASS. If F46-5 fails because restored tabs are quiet, read the label from state via `customTitle` rather than waking the tab; do not weaken the session assertion.

- [ ] **Step 5: Commit**

```bash
git add spec test/desktop
git commit -m "Specify custom tab names as F46 with acceptance scenarios"
```

---

### Task 8: Whole-branch verification in the real app

**Files:** none (verification only)

- [ ] **Step 1: Full unit and substrate gates**

Run: `npm run test:unit`, `npm run substrate:check`, `npm run lint`, `npm run test:acceptance:dry`
Expected: all pass. Report any failure with its output before changing anything.

- [ ] **Step 2: Drive the dev app**

Restart the dev app (`npm start`, chrome documents only load at window creation). With the test hook off, check by hand and screenshot:
1. Right-click the pill → **Rename Tab…** → the ⌘L bar shows `/rename <title>` with the title selected → type a name → Enter → pill dots' tooltip, ⌘L row and the Tabs menu show it.
2. Right-click a non-active ⌘L row → Rename Tab… → the right-clicked tab (not the active one) is renamed.
3. Switch to vertical tabs, right-click a rail row → rename → rail shows it; hover shows the page title.
4. Navigate the renamed tab to another site → name stays. **Use Page Title** → page title returns.
5. Quick Switcher: typing part of the page title of a renamed tab finds it.
6. Quit and relaunch → the name is back.

Leave the dev app running afterwards.

- [ ] **Step 3: Branch review**

Run the `code-review` skill (or `superpowers:requesting-code-review`) over the branch, fix confirmed findings in their owning files, and rerun Step 1.
