# Favorites Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the shipping Electron app's Favorites nested folders and a person-chosen order, in a two-pane manager, without losing anything when older devices sync.

**Architecture:** A folder path is stored in the existing `folder` string, joined by `" › "`. Order and empty folders live in a new per-profile layout record that rides in the settings sync payload as `favoritesLayout`. Pure modules hold every rule; `bookmarks.js` and a new store wire them to disk, sync and IPC; the Favorites sheet draws the manager when the host reports `tree: true` and keeps today's flat list otherwise.

**Tech Stack:** Electron main process (CommonJS), sandboxed `blanc://bookmarks/` page (plain JS, `pages.css`), `node --test` unit tests, Cucumber + Playwright-Electron acceptance tests.

**Spec:** `docs/superpowers/specs/2026-11-16-favorites-manager-design.md`. Read it first; this plan argues from it and does not repeat its reasoning.

## Global Constraints

- Path separator is exactly `" › "` (space, U+203A, space). A segment is 1–100 characters after trimming and never contains `›` (replace with `>`).
- A whole path is at most 100 UTF-16 code units (`string.length`).
- Stored `folder` strings keep today's whole-string spelling rule (`canonicalizeFolders`). Never rewrite stored strings to unify a prefix's spelling.
- Internal identifiers stay `bookmarks`; user-facing text says Favorites.
- Layout record cap: 131072 bytes serialized. Removed-entry markers live 90 days.
- A newer desktop restores a remote-missing `favoritesLayout` at most once every 10 minutes.
- No inline styles: all styling in `src/renderer/pages/pages.css`. Pages are served flat from `src/renderer/pages/` (no subdirectories).
- Every new user-facing string goes in `copy/messages/en.json`, with `de`, `es`, `fr`, `pt-BR` and `it` updated in the same PR, then `npm run copy:ack -- <locale> <keys>` and `npm run copy:build`. Never `innerHTML` a message.
- A new `pages:*` capability changes `src/main/tab-preload.js`, its `src/main/pages.js` handler (host `'bookmarks'`) and `browser-api/bridges.json` together, then `npm run browser-api:build`.
- Commit messages and PR text never name an AI model.
- Each milestone below is one PR. Run `npm run lint`, `npm run test:unit` and `npm run substrate:check` before each PR; milestones 4 and 5 also run `xvfb-run -a npm run test:acceptance:desktop` (plain `npm run …` on macOS).
- Chrome and sheet changes need an app relaunch to verify.

## Review Focus

1. A favorite saved under a path on a new desktop, then edited on a client that keeps only `{id,url,title,favicon,addedAt,updatedAt,folder}`: it must come back with its path intact (Task 6 test "older client round trip").
2. Two stored paths that spell a shared prefix differently (`work` and `Work › Clients`): the tree shows one folder, and no stored string changes until the person edits (Task 2 test "prefix spellings merge in the tree only").
3. A rename or move that would push any descendant's path past 100: refused as a whole, nothing half-moved (Task 4 test "too-long rename changes nothing").
4. Removing the last favorite from a folder through the Island's heart (`toggleBookmark`): the folder stays (Task 5 test "toggle keeps the emptied folder").
5. Importing the same file twice after an old flattened import: favorites move once, nothing duplicates, a favorite the person moved elsewhere stays put (Task 8 tests).

## File Structure

| File | Responsibility |
| --- | --- |
| `src/main/favorites-tree.js` (new, pure) | Paths: parse, validate, key, fit; build the display tree; child keys |
| `src/main/favorites-layout-model.js` (new, pure) | Layout record: normalize, edit, merge, cap |
| `src/main/favorites-layout.js` (new) | Per-profile store for the layout record; sync export/merge with the whole-value clock |
| `src/main/bookmark-data.js` (modify) | Folder operations over `{items, tombstones, layout}`; import with repair; menu tree |
| `src/main/bookmarks.js` (modify) | Wire operations to the two stores; tree projection |
| `src/main/bookmark-import.js`, `src/main/browser-data-import.js` (modify) | Full paths in source order |
| `src/main/sync.js` (modify) | Carry `favoritesLayout`; bounded restore |
| `src/main/pages.js`, `src/main/tab-preload.js`, `browser-api/bridges.json` (modify) | New page calls; `tree: true` capability |
| `src/renderer/pages/favorites-manager-model.js` (new, pure, loads in page and Node) | Selection, search filter, drop targets, move-up/down |
| `src/renderer/pages/favorites-manager.js` (new) | The two-pane manager DOM |
| `src/renderer/pages/bookmarks.js`, `bookmarks.html`, `pages.css` (modify) | Choose manager or flat list; markup; styles |
| `src/main/main.js` (modify) | Nested Favorites menu; `/save` with a path |
| `spec/features.md`, `spec/divergence-register.md`, `spec/parity-matrix.md`, `spec/acceptance/favorites-manager.feature`, `test/desktop/steps/favorites-manager.steps.js` | Parity record and acceptance |

Shared shapes, used by every task:

```js
// Layout record
{ version: 1, folders: { [pathKey]: { path: string, order: string[], at: number, tie: string, gone?: true } } }
// pathKey: path segments lowercased, joined by ' › '; '' is the top level

// Tree node (favorites-tree.buildTree)
{ path: string|null, name: string, key: string,
  children: Array<{ kind: 'folder', folder: Node } | { kind: 'favorite', item: Favorite }> }

// Operation state and context
state = { items, tombstones, layout }      ctx = { now: number, tie: string, makeId?: () => string }
// Operation errors: 'invalid' | 'too-long' | 'cycle' | 'missing'
```

---

## Milestone 1 (PR 1): Paths and folder operations

### Task 1: Path rules

**Files:**
- Create: `src/main/favorites-tree.js`
- Test: `test/unit/favorites-tree.test.js`

**Interfaces — Produces:**
- `SEP = ' › '`, `MAX_PATH = 100`
- `cleanSegment(name: unknown): string|null`
- `splitPath(path: string|null): string[]`, `joinPath(segments: string[]): string|null`
- `validPath(path: unknown): string|null` (normalized, or null when any segment is invalid or the whole is over `MAX_PATH`)
- `pathKey(path: string|null): string`, `parentPath(path): string|null`, `leafName(path): string`
- `isWithin(path, ancestor): boolean` (same folder or a descendant, compared by key)
- `fitSegments(segments: string[]): { path: string|null, shortened: boolean }` (deepest ancestor that fits)
- `parseTypedPath(input: string): string|null` (splits on `>` or `›` with optional spaces around)
- `folderChildKey(name): string` → `'f:' + name.trim().toLowerCase()`; `favoriteChildKey(url): string` → `'u:' + base64url(sha256(url).subarray(0, 6))`

- [ ] **Step 1: Write the failing tests**

```js
test('a top-level name is a one-segment path', () => {
  assert.equal(validPath('  Work '), 'Work');
  assert.deepEqual(splitPath('Work › Clients › Acme'), ['Work', 'Clients', 'Acme']);
});
test('segments never contain ›', () => {
  assert.equal(cleanSegment('A›B'), 'A>B');
  assert.equal(cleanSegment('   '), null);
});
test('a path over 100 code units is invalid', () => {
  assert.equal(validPath(`${'a'.repeat(60)} › ${'b'.repeat(38)}`), null);   // 101
  assert.equal(validPath(`${'a'.repeat(60)} › ${'b'.repeat(37)}`).length, 100);
});
test('keys ignore case per segment', () => {
  assert.equal(pathKey('Work › CLIENTS'), 'work › clients');
  assert.equal(pathKey(null), '');
  assert.equal(isWithin('work › Clients › Acme', 'Work › clients'), true);
  assert.equal(isWithin('Workshop', 'Work'), false);
});
test('fitSegments keeps the deepest ancestor that fits', () => {
  const long = ['a'.repeat(50), 'b'.repeat(40), 'c'.repeat(20)];
  assert.deepEqual(fitSegments(long), { path: `${long[0]} › ${long[1]}`, shortened: true });
  assert.deepEqual(fitSegments(['Work']), { path: 'Work', shortened: false });
});
test('typed paths accept > and ›', () => {
  assert.equal(parseTypedPath('Work>Clients ›  Acme'), 'Work › Clients › Acme');
});
test('child keys', () => {
  assert.equal(folderChildKey(' Clients '), 'f:clients');
  assert.match(favoriteChildKey('https://example.com/'), /^u:[A-Za-z0-9_-]{8}$/);
});
```

- [ ] **Step 2:** Run `node --test test/unit/favorites-tree.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement the functions above in `src/main/favorites-tree.js`. No `require('electron')`; use `node:crypto` for the hash.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit: `Favorites: folder path rules`.

### Task 2: The display tree

**Files:**
- Modify: `src/main/favorites-tree.js`
- Test: `test/unit/favorites-tree.test.js`

**Interfaces:**
- Consumes: Task 1; the layout shape above (an absent or empty layout is `{ version: 1, folders: {} }`).
- Produces: `buildTree(items: Favorite[], layout): Node` (root node has `path: null`, `key: ''`); `shownPath(items, path): string` (the path spelled as the tree shows it); `listFolderPaths(tree): string[]` (every folder, depth-first, for pickers).

Rules to implement (spec sections 1 and 3): a folder exists if a favorite's path equals or starts with it, or the layout has a live (not `gone`) entry for it. Segment spelling comes from the oldest favorite under that prefix (ties: smaller `id`); a folder that exists only in the layout uses the entry's `path`. Children not in the folder's `order` come first (sub-folders A–Z by `localeCompare` with `sensitivity: 'base'`, then favorites by `addedAt` descending), then listed children in list order. Unknown keys in `order` are skipped.

- [ ] **Step 1: Write the failing tests**

```js
const fav = (url, folder, addedAt, id = url) => ({ id, url, title: url, folder, addedAt, updatedAt: addedAt });
const names = (node) => node.children.map((c) => (c.kind === 'folder' ? `[${c.folder.name}]` : c.item.url));

test('an unordered profile looks like today: folders A–Z, then newest first', () => {
  const tree = buildTree([fav('a', null, 1), fav('b', null, 2), fav('c', 'Zoo', 3), fav('d', 'apps', 4)], EMPTY);
  assert.deepEqual(names(tree), ['[apps]', '[Zoo]', 'b', 'a']);
});
test('paths nest', () => {
  const tree = buildTree([fav('a', 'Work › Clients › Acme', 1)], EMPTY);
  const work = tree.children[0].folder;
  assert.equal(work.children[0].folder.children[0].folder.path, 'Work › Clients › Acme');
});
test('prefix spellings merge in the tree only', () => {
  const items = [fav('a', 'work', 1), fav('b', 'Work › Clients', 2)];
  const tree = buildTree(items, EMPTY);
  assert.deepEqual(names(tree), ['[work]']);
  assert.equal(shownPath(items, 'WORK › clients'), 'work › Clients');
  assert.equal(items[1].folder, 'Work › Clients');            // stored string untouched
});
test('listed children follow unlisted ones, in list order', () => {
  const items = [fav('a', 'W', 1), fav('b', 'W', 2), fav('c', 'W', 3)];
  const layout = { version: 1, folders: { w: { path: 'W', order: [favoriteChildKey('a'), 'u:gone', favoriteChildKey('b')], at: 5, tie: '' } } };
  assert.deepEqual(names(buildTree(items, layout).children[0].folder), ['c', 'a', 'b']);
});
test('an empty folder exists through the layout; a gone entry does not', () => {
  const layout = { version: 1, folders: {
    'empty': { path: 'Empty', order: [], at: 1, tie: '' },
    'old': { path: 'Old', order: [], at: 1, tie: '', gone: true } } };
  assert.deepEqual(names(buildTree([], layout)), ['[Empty]']);
});
```

- [ ] **Step 2:** Run the test file. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement `buildTree`, `shownPath`, `listFolderPaths`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `Favorites: display tree from paths and layout`.

### Task 3: Layout record model

**Files:**
- Create: `src/main/favorites-layout-model.js`
- Test: `test/unit/favorites-layout-model.test.js`

**Interfaces — Produces** (all pure, all return a new normalized layout unless noted):
- `LAYOUT_MAX_BYTES = 131072`, `GONE_TTL_MS = 90 * 24 * 60 * 60 * 1000`, `EMPTY_LAYOUT`
- `normalizeLayout(value: unknown): Layout` (drops invalid entries, invalid paths, non-string keys, clocks ≤ 0 or ≥ `Date.UTC(3000,0,1)`; tie capped at 128 chars)
- `setFolderOrder(layout, path, order: string[], {at, tie})`
- `ensureFolder(layout, path, {at, tie})` (adds a live entry with `order: []` if none is live; clears `gone`)
- `removeFolderEntry(layout, path, {at, tie})` (writes `gone: true`, `order: []`)
- `movePrefix(layout, fromPath, toPath, {at, tie})` (re-keys the folder and every descendant entry; the old keys become `gone`; on a key collision the newer `at` wins)
- `mergeLayouts(local, remote, {now}): Layout` (per entry: larger `at`, then smaller `tie`, then smaller `JSON.stringify(entry)`; drops `gone` entries older than `GONE_TTL_MS`)
- `boundLayout(layout, maxBytes = LAYOUT_MAX_BYTES): { layout, dropped: number }` (empties `order` lists, oldest `at` first, longest list first among equal `at`; never removes an entry)
- `layoutsEqual(a, b): boolean` (compares normalized, key-sorted JSON)

- [ ] **Step 1: Write the failing tests**

```js
test('merge is per entry and symmetric', () => {
  const a = setFolderOrder(EMPTY_LAYOUT, 'Work', ['u:1'], { at: 10, tie: 'a' });
  const b = setFolderOrder(setFolderOrder(EMPTY_LAYOUT, 'Work', ['u:2'], { at: 9, tie: 'b' }), 'Home', ['u:3'], { at: 9, tie: 'b' });
  const ab = mergeLayouts(a, b, { now: 100 });
  assert.deepEqual(ab.folders.work.order, ['u:1']);
  assert.deepEqual(ab.folders.home.order, ['u:3']);
  assert.ok(layoutsEqual(ab, mergeLayouts(b, a, { now: 100 })));
});
test('a removed empty folder stays removed, then its marker expires', () => {
  const made = ensureFolder(EMPTY_LAYOUT, 'Empty', { at: 1, tie: '' });
  const gone = removeFolderEntry(made, 'Empty', { at: 2, tie: '' });
  assert.equal(mergeLayouts(gone, made, { now: 3 }).folders.empty.gone, true);
  assert.equal(mergeLayouts(gone, made, { now: 2 + GONE_TTL_MS + 1 }).folders.empty, undefined);
});
test('movePrefix carries descendants', () => {
  let l = setFolderOrder(EMPTY_LAYOUT, 'Work › Clients', ['u:1'], { at: 1, tie: '' });
  l = movePrefix(l, 'Work', 'Jobs', { at: 2, tie: '' });
  assert.deepEqual(l.folders['jobs › clients'].order, ['u:1']);
  assert.equal(l.folders['work › clients'].gone, true);
});
test('boundLayout empties the oldest lists first and keeps entries', () => {
  const big = Array.from({ length: 6000 }, (_, i) => `u:${String(i).padStart(8, '0')}`);
  let l = setFolderOrder(EMPTY_LAYOUT, 'Old', big, { at: 1, tie: '' });
  l = setFolderOrder(l, 'New', big, { at: 2, tie: '' });
  const { layout, dropped } = boundLayout(l);
  assert.equal(dropped, 1);
  assert.deepEqual(layout.folders.old.order, []);
  assert.equal(layout.folders.new.order.length, 6000);
  assert.ok(Buffer.byteLength(JSON.stringify(layout)) <= LAYOUT_MAX_BYTES);
});
test('normalizeLayout drops junk', () => {
  assert.deepEqual(normalizeLayout({ folders: { x: { path: 'Y', order: [], at: 1 } , w: null } }).folders, {});   // key ≠ pathKey(path)
});
```

- [ ] **Step 2:** Run `node --test test/unit/favorites-layout-model.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Follow `src/main/device-names.js` for the entry-clock pattern.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `Favorites: layout record model`.

### Task 4: Folder operations

**Files:**
- Modify: `src/main/bookmark-data.js` (`applySetFolder`, `applySaveFavorite`, `applyRenameFolder`, `applyRemoveFolder`; add the rest)
- Test: `test/unit/bookmark-data.test.js` (extend; existing tests must stay green, with flat calls behaving as before)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (each returns `{ items, tombstones, layout, changed, error? }`; on `error` nothing changes):
  - `applyCreateFolder(state, parentPath, name, ctx)` → also `path`
  - `applyRenameFolder(state, path, newName, ctx)` (renames one segment; every favorite at or under `path` gets its prefix rewritten and `updatedAt = ctx.now`; a sibling with that name merges)
  - `applyMoveFolder(state, path, newParentPath, ctx)` (`'cycle'` when `newParentPath` is within `path`)
  - `applyRemoveFolder(state, path, ctx)` (favorites and sub-folders move up one level; the folder's layout entry becomes `gone`)
  - `applySetFolder(state, id, path, ctx)` and `applyMoveFavorites(state, ids: string[], path, ctx)` (`path: null` is the top level)
  - `applyReorder(state, path, orderKeys: string[], ctx)` (writes the folder's full order)
  - `applyRemoveFavorites(state, ids, ctx)` (adds tombstones)
  - `keepEmptiedFolders(beforeItems, afterItems, layout, ctx): Layout` (for every folder that had a favorite directly or below it before and has nothing after, `ensureFolder`); every operation above and `applySaveFavorite`'s move case call it
- `applySetFolder` and `applySaveFavorite` switch from `validFolder` to `validPath` and resolve an existing folder's spelling with `shownPath`.

- [ ] **Step 1: Write the failing tests**

```js
test('rename rewrites every descendant and stamps it', () => {
  const s = state([fav('a', 'Work', 1), fav('b', 'Work › Clients', 1), fav('c', 'Workshop', 1)]);
  const r = applyRenameFolder(s, 'Work', 'Jobs', { now: 9, tie: 't' });
  assert.deepEqual(r.items.map((i) => [i.folder, i.updatedAt]), [['Jobs', 9], ['Jobs › Clients', 9], ['Workshop', 1]]);
});
test('too-long rename changes nothing', () => {
  const s = state([fav('a', `Work › ${'c'.repeat(90)}`, 1)]);
  const r = applyRenameFolder(s, 'Work', 'Much longer name', { now: 9, tie: 't' });
  assert.equal(r.error, 'too-long');
  assert.equal(r.changed, false);
  assert.equal(r.items, s.items);
});
test('a folder cannot move into itself', () => {
  const s = state([fav('a', 'Work › Clients', 1)]);
  assert.equal(applyMoveFolder(s, 'Work', 'Work › Clients', CTX).error, 'cycle');
});
test('delete moves contents up one level', () => {
  const s = state([fav('a', 'Work › Clients', 1), fav('b', 'Work › Clients › Acme', 1), fav('c', 'Solo', 1)]);
  const r = applyRemoveFolder(s, 'Work › Clients', CTX);
  assert.deepEqual(r.items.map((i) => i.folder), ['Work', 'Work › Acme', 'Solo']);
  assert.equal(applyRemoveFolder(r, 'Solo', CTX).items[2].folder, null);        // top level: today's behavior
});
test('create refuses nothing that exists, and makes an empty folder', () => {
  const r = applyCreateFolder(state([]), 'Work', 'Clients', CTX);
  assert.equal(r.path, 'Work › Clients');
  assert.equal(r.layout.folders['work › clients'].gone, undefined);
  assert.equal(applyCreateFolder(r, 'work', 'CLIENTS', CTX).changed, false);
});
test('moving the last favorite out keeps the folder', () => {
  const s = state([fav('a', 'Solo', 1, 'id-a')]);
  const r = applyMoveFavorites(s, ['id-a'], null, CTX);
  assert.ok(r.layout.folders.solo && !r.layout.folders.solo.gone);
});
test('reorder writes the whole order', () => {
  const s = state([fav('a', 'W', 1), fav('b', 'W', 2)]);
  const keys = [favoriteChildKey('a'), favoriteChildKey('b')];
  assert.deepEqual(applyReorder(s, 'W', keys, CTX).layout.folders.w.order, keys);
});
```

- [ ] **Step 2:** Run `node --test test/unit/bookmark-data.test.js`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement. Existing callers that pass `{ items }` or `{ items, tombstones }` keep working: treat a missing `layout` as `EMPTY_LAYOUT`.
- [ ] **Step 4:** Run `node --test test/unit/bookmark-data.test.js test/unit/bookmark-validate.test.js`. Expected: PASS.
- [ ] **Step 5:** Commit: `Favorites: nested folder operations`.

---

## Milestone 2 (PR 2): Layout store and sync

### Task 5: The layout store and `bookmarks.js` wiring

**Files:**
- Create: `src/main/favorites-layout.js`
- Modify: `src/main/bookmarks.js`
- Test: `test/unit/favorites-layout-store.test.js` (model it on `test/unit/start-page-pins-store.test.js`, including its Electron stub and `waitForJson`)

**Interfaces:**
- Consumes: Tasks 3–4; `syncClock` from `./settings`; `JsonStore` from `./store`.
- Produces, `favorites-layout.js`: `getLayout(): Layout`; `setLayout(layout): void` (bounds with `boundLayout`, raises the whole-value clock with `syncClock.nextSyncWriteTimestamp`, notifies); `exportForSync(): { value, at, tie } | null`; `mergeFromSync({ value, at, tie }): boolean`; `onChanged(fn)`. Store: `new JsonStore('favorites-layout', { version: 1, layout: EMPTY_LAYOUT, clock: 0, tie: '' }, { scope: 'profile' })`.
- Produces, `bookmarks.js` (each runs the matching `apply*`, writes both stores when changed, calls `notifyChanged()`, returns `{ ok: true, path? }` or `{ ok: false, error }`): `getTree()` (returns `buildTree`'s root with `key: favoriteChildKey(item.url)` added to each favorite, so the page never hashes), `createFolder(parentPath, name)`, `renameFolder(path, newName)`, `moveFolder(path, newParentPath)`, `removeFolder(path)`, `moveFavorites(ids, path)`, `reorderFolder(path, orderKeys)`, `removeBookmarks(ids)`. `toggleBookmark`, `removeBookmark`, `setBookmarkFolder` and `saveFavorite` pass the layout through and call `keepEmptiedFolders`.

`mergeFromSync` rule (spec section 3, "The whole value's clock"): `merged = mergeLayouts(local, normalizeLayout(remote.value), { now })`. Store `merged`. If `layoutsEqual(merged, remote.value)`, set the clock to `max(localClock, remote.at)` and adopt the remote tie when the remote clock is the larger. Otherwise set the clock to `max(Date.now(), localClock + 1, remote.at + 1)` with this device's tie, so the next export beats the remote.

- [ ] **Step 1: Write the failing tests**

```js
test('a merge that changes the value raises the clock above both sides', () => {
  layout.setLayout(setFolderOrder(EMPTY_LAYOUT, 'Home', ['u:1'], { at: 50, tie: 'me' }));
  const before = layout.exportForSync().at;
  const remoteValue = setFolderOrder(EMPTY_LAYOUT, 'Work', ['u:2'], { at: 60, tie: 'them' });
  layout.mergeFromSync({ value: remoteValue, at: before + 1000, tie: 'them' });
  const out = layout.exportForSync();
  assert.ok(out.at > before + 1000);
  assert.ok(out.value.folders.home && out.value.folders.work);
});
test('a merge that equals the remote adopts its clock and does not rise', () => {
  const remoteValue = setFolderOrder(EMPTY_LAYOUT, 'Work', ['u:2'], { at: 60, tie: 'them' });
  layout.mergeFromSync({ value: remoteValue, at: 7_000_000_000_000 - 1, tie: 'them' });
  assert.equal(layout.exportForSync().at, 7_000_000_000_000 - 1);
});
test('toggle keeps the emptied folder', () => {
  bookmarks.saveFavorite('https://a.example/', 'A', null, 'Solo');
  bookmarks.toggleBookmark('https://a.example/', 'A', null);
  assert.deepEqual(bookmarks.getTree().children.map((c) => c.folder?.name), ['Solo']);
});
test('a never-touched profile exports nothing', () => {
  assert.equal(freshLayout.exportForSync(), null);
});
```

- [ ] **Step 2:** Run `node --test test/unit/favorites-layout-store.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement the store and the `bookmarks.js` functions.
- [ ] **Step 4:** Run the new file plus `node --test test/unit/bookmark-*.test.js test/unit/start-page-pins-store.test.js`. Expected: PASS.
- [ ] **Step 5:** Commit: `Favorites: layout store and operations wiring`.

### Task 6: Sync

**Files:**
- Modify: `src/main/sync.js` (the `settings` entry of `STORES`, `withStartPagePins`, the store-change listeners near `startPagePins.onChanged`)
- Modify: `src/main/bookmarks.js` (`sanitizeRemoteItem`: `validPath` in place of `validFolder`)
- Modify: `src/main/favorites-layout-model.js`
- Test: `test/unit/favorites-layout-sync.test.js`

**Interfaces:**
- Consumes: Task 5.
- Produces: `withFavoritesLayout(payload)` in `sync.js`, composed with `withStartPagePins` (adds `values.favoritesLayout`, `meta.favoritesLayout`, `tieBreakers.favoritesLayout` when `exportForSync()` is non-null); the `settings` merge calls `favoritesLayout.mergeFromSync({ value: remote?.values?.favoritesLayout, at: remote?.meta?.favoritesLayout, tie: remote?.tieBreakers?.favoritesLayout })`; `favoritesLayout.onChanged` schedules a settings push the way pins do.
- Produces, pure in `favorites-layout-model.js`: `RESTORE_INTERVAL_MS = 600000`; `settingsEqualsWithLayout(exported, remote, { baseEquals, lastRestoreAt, now }): { equal: boolean, restoring: boolean }`. When `baseEquals(exported, remote)` is true, `equal`. When the payloads differ only in that `remote` lacks `favoritesLayout`: `equal` if `now - lastRestoreAt < RESTORE_INTERVAL_MS`, otherwise not equal with `restoring: true`. Any other difference: not equal. `sync.js` keeps `lastRestoreAt` in memory and sets it when `restoring`.

- [ ] **Step 1: Write the failing tests** (pure; simulate clients as functions over blobs)

```js
// An older desktop: keeps only known favorite fields, drops favoritesLayout.
const olderDesktop = (blob) => ({ ...blob, settings: omit(blob.settings, 'favoritesLayout'),
  bookmarks: { ...blob.bookmarks, items: blob.bookmarks.items.map(({ id, url, title, favicon, addedAt, updatedAt, folder }) =>
    ({ id, url, title, favicon, addedAt, updatedAt, folder: folder && folder.length <= 100 ? folder : null })) } });

test('older client round trip keeps paths and brings order back', () => {
  /* new desktop writes path 'Work › Clients' + an order; olderDesktop rewrites the blob;
     new desktop merges it: every favorite keeps its folder string, getTree() order is unchanged,
     and the next export carries favoritesLayout again. */
});
test('restore is bounded to once per ten minutes', () => {
  const base = () => false;
  const exported = payloadWith({ favoritesLayout: 5 }), remote = payloadWith({});
  assert.deepEqual(settingsEqualsWithLayout(exported, remote, { baseEquals: base, lastRestoreAt: 0, now: 1_000_000 }), { equal: false, restoring: true });
  assert.deepEqual(settingsEqualsWithLayout(exported, remote, { baseEquals: base, lastRestoreAt: 1_000_000, now: 1_000_000 + 599_999 }), { equal: true, restoring: false });
});
test('a client that keeps the value whole settles', () => {
  /* keeper(blob) returns the newest-clock favoritesLayout it has seen, whole. Alternate desktop
     merge+export and keeper for 6 passes after concurrent edits on two desktops: assert the last
     two desktop exports are layoutsEqual with equal clocks (no further upload). */
});
test('another difference still uploads', () => {
  const r = settingsEqualsWithLayout(payloadWith({ favoritesLayout: 5, theme: 9 }), payloadWith({ theme: 8 }), { baseEquals: () => false, lastRestoreAt: 9e12, now: 9e12 });
  assert.equal(r.equal, false);
});
```

Write the two sketched tests out in full using `mergeLayouts`, `bookmarks.mergeFromSync`-equivalent pure merges and the `olderDesktop`/`keeper` helpers; their assertions are the ones named in the comments.

- [ ] **Step 2:** Run `node --test test/unit/favorites-layout-sync.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. In `sync.js` replace the settings entry's `equals: settings.syncPayloadEquals` with a wrapper over `settingsEqualsWithLayout`.
- [ ] **Step 4:** Run the new file plus `node --test test/unit/sync-*.test.js test/unit/ios-sync-vectors.test.js`. Expected: PASS.
- [ ] **Step 5:** Commit: `Favorites: sync the layout record`.

---

## Milestone 3 (PR 3): Import and repair

### Task 7: Parsers return full paths in source order

**Files:**
- Modify: `src/main/bookmark-import.js` (`parseNetscapeBookmarks`), `src/main/browser-data-import.js` (`parseChromiumBookmarks`)
- Test: `test/unit/bookmark-import.test.js`, `test/unit/browser-data-import.test.js`

**Interfaces — Produces:** each entry gains `folder` as a fitted full path (via `cleanSegment` per level and `fitSegments`), `shortened: boolean`, and keeps its position in the returned array as source order. Chromium roots contribute their name as the first segment for every descendant (today only direct children get it). `parseNetscapeBookmarkTree` and tab import are untouched.

- [ ] **Step 1: Write the failing tests**

```js
test('HTML import keeps the whole path', () => {
  const html = '<DL><DT><H3>Work</H3><DL><DT><H3>Clients</H3><DL><DT><A HREF="https://a.example/">A</A></DL></DL></DL>';
  assert.equal(parseNetscapeBookmarks(html)[0].folder, 'Work › Clients');
});
test('Chromium import keeps roots and nesting', () => {
  const data = { roots: { bookmark_bar: { name: 'Bookmarks bar', children: [
    { type: 'folder', name: 'Work', children: [{ type: 'url', name: 'A', url: 'https://a.example/' }] }] } } };
  assert.equal(parseChromiumBookmarks(data, { t: (k) => k })[0].folder, 'Bookmarks bar › Work');
});
test('an over-long path lands in the deepest ancestor that fits', () => {
  /* three nested 45-character folders: entry.folder is the first two joined, entry.shortened === true */
});
test('a › in a source folder name becomes >', () => { /* H3 "A › B" → folder 'A > B' */ });
```

- [ ] **Step 2:** Run both test files. Expected: new tests FAIL; update existing expectations that assert the flattened leaf name to the full path.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `Favorites import: keep the source's folder paths`.

### Task 8: Import writes order and repairs flattened favorites

**Files:**
- Modify: `src/main/bookmark-data.js` (`addImported`), `src/main/bookmarks.js` (`importBookmarks`), `src/main/pages.js` (the two import handlers return the new counts), `src/renderer/pages/bookmarks.js` (status line), `copy/messages/*.json`
- Test: `test/unit/bookmark-data.test.js`

**Interfaces — Produces:** `addImported(state, entries, ctx)` returns `{ items, tombstones, layout, added, skipped, moved, shortened, orderDropped, changed }`. `importBookmarks(entries)` returns `{ added, skipped, moved, shortened, orderDropped }`.

Rules (spec section 4): for an entry whose URL is already saved, if `pathKey(saved.folder) === pathKey(leafName(entry.folder))` and `pathKey(saved.folder) !== pathKey(entry.folder)`, move the saved favorite to `entry.folder` (stamp `updatedAt`) and count `moved`; otherwise count `skipped`. For each folder the import touches, write its order: existing listed and unlisted children first in their current display order, then imported children in source order (sub-folders by first appearance). Run `boundLayout`; `orderDropped` is its `dropped`.

New copy keys (English; translate all five languages): `favorites.import.moved` "{count} moved into their folders.", `favorites.import.shortened` "{count} placed in a parent folder because the folder path was too long.", `favorites.import.orderDropped` "Some folders are in the default order because the collection is very large."

- [ ] **Step 1: Write the failing tests**

```js
test('importing again repairs a flattened favorite once', () => {
  const s = state([fav('https://a.example/', 'Acme', 1, 'a')]);
  const entries = [{ url: 'https://a.example/', title: 'A', folder: 'Work › Clients › Acme' }];
  const r = addImported(s, entries, CTX);
  assert.equal(r.items[0].folder, 'Work › Clients › Acme');
  assert.deepEqual([r.added, r.moved, r.skipped], [0, 1, 0]);
  const again = addImported(r, entries, CTX);
  assert.deepEqual([again.added, again.moved, again.skipped, again.changed], [0, 0, 1, false]);
});
test('a favorite the person moved elsewhere is left alone', () => {
  const s = state([fav('https://a.example/', 'Reading', 1, 'a')]);
  const r = addImported(s, [{ url: 'https://a.example/', title: 'A', folder: 'Work › Acme' }], CTX);
  assert.equal(r.items[0].folder, 'Reading');
  assert.equal(r.skipped, 1);
});
test('import keeps source order after existing children', () => {
  const s = applyReorder(state([fav('https://old.example/', 'W', 1)]), 'W', [favoriteChildKey('https://old.example/')], CTX);
  const r = addImported(s, [{ url: 'https://z.example/', folder: 'W' }, { url: 'https://b.example/', folder: 'W' }], CTX);
  assert.deepEqual(r.layout.folders.w.order, ['https://old.example/', 'https://z.example/', 'https://b.example/'].map(favoriteChildKey));
});
```

- [ ] **Step 2:** Run `node --test test/unit/bookmark-data.test.js`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement; add the copy keys; `npm run copy:ack` for each locale's new keys; `npm run copy:build`.
- [ ] **Step 4:** Run `npm run test:unit` and `npm run copy:check`. Expected: PASS.
- [ ] **Step 5:** Commit: `Favorites import: source order and repair of flattened favorites`.

---

## Milestone 4 (PR 4): The manager

### Task 9: Page bridge

**Files:**
- Modify: `src/main/pages.js`, `src/main/tab-preload.js` (the `host === 'bookmarks'` block), `browser-api/bridges.json`; regenerate with `npm run browser-api:build`
- Test: `test/unit/favorites-page-capabilities.test.js` (extend)

**Interfaces — Produces** on `window.bowserPages.bookmarks`, host `bookmarks` only:

| Method | Channel | Returns |
| --- | --- | --- |
| `capabilities()` | existing | now `{ editable: true, tree: true }` |
| `tree()` | `pages:bookmarks:tree` | `bookmarks.getTree()` |
| `createFolder(parentPath, name)` | `pages:bookmarks:create-folder` | `{ ok, path?, error? }` |
| `moveFolder(path, newParentPath)` | `pages:bookmarks:move-folder` | `{ ok, error? }` |
| `move(ids, path)` | `pages:bookmarks:move` | `{ ok, error? }` |
| `reorder(path, orderKeys)` | `pages:bookmarks:reorder` | `{ ok, error? }` |
| `removeMany(ids)` | `pages:bookmarks:remove-many` | `{ ok }` |
| `renameFolder(path, newName)`, `removeFolder(path)` | existing channels | now `{ ok, error? }` |

Handlers coerce arguments (`String`, arrays capped at 5000 ids / 20000 keys, each a string of at most 200 characters), call the `bookmarks.js` function, then `hooks.onDataChanged?.()` when `ok`.

- [ ] **Step 1:** Extend the capabilities test to assert `tree: true`, and add a case that the handler source for each new channel names host `'bookmarks'` (follow the file's existing assertion style).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement preload, handlers and `bridges.json` entries (copy the shape of `bookmarks.setFolder`); run `npm run browser-api:build`.
- [ ] **Step 4:** Run `npm run browser-api:check` and `node --test test/unit/favorites-page-capabilities.test.js test/unit/pages-sync-channels.test.js`. Expected: PASS.
- [ ] **Step 5:** Commit: `Favorites: page bridge for the manager`.

### Task 10: Manager model (pure, in the page)

**Files:**
- Create: `src/renderer/pages/favorites-manager-model.js` (UMD-style: assigns `window.FavoritesManagerModel` and `module.exports` when present; no DOM)
- Test: `test/unit/favorites-manager-model.test.js`

**Interfaces — Produces:**
- `findFolder(tree, path): Node|null`; `breadcrumb(tree, path): Array<{ name, path }>`
- `childKeyOf(child): string` (the same keys main uses: `'f:' + name.toLowerCase()` for a folder; a favorite's key is delivered by main on each tree item as `item.key`, so `getTree()` in Task 5 adds `key: favoriteChildKey(url)` to each favorite)
- `searchFavorites(tree, query): Array<{ item, path }>` (case-insensitive match on title and URL; empty query returns `[]`)
- `selectionAfterClick(orderedKeys, selected: Set, key, { toggle, range, anchor }): { selected: Set, anchor }`
- `orderAfterDrop(orderedKeys, movedKeys, beforeKey|null): string[]` (moved keys keep their relative order; `null` appends)
- `orderAfterStep(orderedKeys, key, direction: -1|1): string[]`
- `canDropInto(folderPath, movedFolderPaths): boolean` (false for a folder into itself or a descendant)

- [ ] **Step 1: Write the failing tests**

```js
test('drop keeps the moved rows together and in order', () => {
  assert.deepEqual(orderAfterDrop(['a', 'b', 'c', 'd'], ['d', 'b'], 'a'), ['b', 'd', 'a', 'c']);
  assert.deepEqual(orderAfterDrop(['a', 'b', 'c'], ['a'], null), ['b', 'c', 'a']);
});
test('shift-click selects a range from the anchor', () => {
  const r = selectionAfterClick(['a', 'b', 'c', 'd'], new Set(['a']), 'c', { range: true, anchor: 'a' });
  assert.deepEqual([...r.selected], ['a', 'b', 'c']);
});
test('search reports each match with its path', () => {
  const tree = buildTree([fav('https://acme.example/', 'Work › Clients', 1)], EMPTY);
  assert.deepEqual(searchFavorites(tree, 'ACME').map((m) => m.path), ['Work › Clients']);
  assert.deepEqual(searchFavorites(tree, ''), []);
});
test('a folder cannot drop into its own descendant', () => {
  assert.equal(canDropInto('Work › Clients', ['Work']), false);
  assert.equal(canDropInto('Home', ['Work']), true);
});
test('step moves one place and stops at the ends', () => {
  assert.deepEqual(orderAfterStep(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  assert.deepEqual(orderAfterStep(['a', 'b', 'c'], 'a', 1), ['b', 'a', 'c']);
});
```

- [ ] **Step 2:** Run `node --test test/unit/favorites-manager-model.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `Favorites: manager model`.

### Task 11: The two-pane manager

**Files:**
- Create: `src/renderer/pages/favorites-manager.js`
- Modify: `src/renderer/pages/bookmarks.html` (add `<div id="manager" class="fav-manager" hidden>` after `#list`, a search input and a New folder button in `.page-head`, and the two new `<script>` tags before `bookmarks.js`), `src/renderer/pages/bookmarks.js` (after `capabilities()`: when `capabilities.tree`, hide `#list`, call `window.FavoritesManager.mount({ root, capabilities, t: blancI18n.t })`, and route refreshes to `manager.refresh()`; otherwise unchanged), `src/renderer/pages/pages.css`, `copy/messages/*.json`, `copy/i18n-scope.json` (mark the two new files `guarded`)
- Create: `spec/acceptance/favorites-manager.feature`, `test/desktop/steps/favorites-manager.steps.js`
- Modify: `src/main/test-hook.js` (expose `favorites.tree()` and `favorites.seed(items)` on `globalThis.__blanc` if the existing Favorites hooks don't already cover seeding with folders)

**Interfaces:**
- Consumes: Tasks 9–10.
- Produces: `window.FavoritesManager.mount({ root, capabilities, t }) → { refresh(): Promise<void> }`.

Behavior (spec section 5; every item is a requirement):
1. Left pane `nav.fav-tree`: "All favorites" then the folder tree with disclosure buttons; `role="tree"`/`treeitem`, arrow keys move and open/close. Open folders and the selected path persist in `localStorage` keys `favorites.manager.open` and `favorites.manager.selected` (wrap in try/catch).
2. Right pane `section.fav-list`: breadcrumb, then the selected folder's children in tree order. Folder rows open the folder on double-click or Enter. Favorite rows keep today's open, pin and remove controls (reuse `row()` pieces and `start-pins.js` from `bookmarks.js`; export what is needed on `window.FavoritesRows`).
3. Drag and drop with HTML5 drag events: reorder within the right pane (calls `reorder(path, orderAfterDrop(...))`); drop on a folder in either pane (calls `move(ids, path)` for favorites and `moveFolder(path, target)` for folders); tree folders drag to re-parent. Drop indicators are CSS classes. Rows animate to their new place with the existing motion tokens; no animation under `prefers-reduced-motion`.
4. Each row has a ⋮ menu button: Move to… (a `<select>` of `listFolderPaths` plus the top level), Move up, Move down, Remove; folders add Rename, New folder inside, Delete folder. All reachable by keyboard.
5. Ctrl/Cmd-click and Shift-click select several rows; drag, Move to… and Remove act on the selection.
6. The search input filters with `searchFavorites`; results show title, address and path; no drag handles while searching.
7. Below 720px (`@media (max-width: 720px)`, the existing breakpoint) the tree pane is replaced by a folder `<select>` above the list.
8. With `capabilities.editable === false`, no drag, menus or New folder.
9. Operation errors show in `#importStatus` (`role="status"`): `favorites.manager.error.tooLong` "That folder path would be longer than Blanc can sync. Use shorter names or fewer levels.", `favorites.manager.error.cycle` "A folder can't move into itself."
10. Focus rings stay thin and selected rows never touch (project conventions in `pages.css`).

Other copy keys: `favorites.manager.all` "All favorites", `.newFolder` "New folder", `.newFolderInside` "New folder inside", `.search` "Search favorites", `.moveTo` "Move to…", `.moveUp` "Move up", `.moveDown` "Move down", `.topLevel` "Top level", `.deleteFolder` "Delete folder", `.items` "{count} items", `.noResults` "No favorites match.", `.emptyFolder` "This folder is empty."

Acceptance scenarios (`spec/acceptance/favorites-manager.feature`, tagged like the existing desktop features):

```gherkin
Scenario: Nested folders show as a tree
  Given favorites saved in "Work › Clients" and "Work › Reference"
  When I open the Favorites sheet
  Then the folder tree shows "Work" containing "Clients" and "Reference"

Scenario: An untouched profile keeps today's order
  Given favorites saved in folders "Zoo" and "apps" and two ungrouped favorites
  When I open the Favorites sheet
  Then the top level lists "apps", "Zoo", then the ungrouped favorites newest first

Scenario: Reordering sticks
  Given three favorites in "Work"
  When I move the last favorite up twice with its menu
  And I reopen the Favorites sheet
  Then it is first in "Work"

Scenario: Moving a favorite to another folder
Scenario: Deleting a folder moves its contents up one level
Scenario: A too-long rename is refused with a message
Scenario: Search finds a favorite in a nested folder and shows its path
Scenario: A folder stays after its last favorite is removed
```

- [ ] **Step 1:** Write the feature file and step definitions (drive through `__blanc` seeding and the page's DOM; use the menu actions rather than synthetic drags). Run `npm run test:acceptance:dry`. Expected: steps resolve.
- [ ] **Step 2:** Run `npm run test:acceptance:desktop -- --name "Favorites manager"` (or the project's one-scenario config). Expected: FAIL.
- [ ] **Step 3:** Implement the manager, markup, styles and copy; `copy:ack` each locale; `npm run copy:build`.
- [ ] **Step 4:** Run the acceptance scenarios, `npm run copy:check`, `npm run test:i18n:desktop`, `npm run lint`. Expected: PASS.
- [ ] **Step 5:** Relaunch `npm start` and check by hand with a real mouse: drag to reorder, drag into a tree folder, drag a folder into another, narrow the window below 720px, Dark theme. Record what was checked in the PR.
- [ ] **Step 6:** Commit: `Favorites: two-pane manager`.

---

## Milestone 5 (PR 5): Menu, `/save` and the parity record

### Task 12: Nested Favorites menu and `/save` paths

**Files:**
- Modify: `src/main/bookmark-data.js` (replace `groupFavoritesForMenu`'s use), `src/main/main.js` (`favoritesMenuItems`, the `saveFavorite` path near the `bookmarks.saveFavorite(tab.url, …, folder)` call)
- Test: `test/unit/bookmark-data.test.js`

**Interfaces — Produces:**
- `favoritesMenuModel(items, layout): Array<{ kind: 'folder', name, children } | { kind: 'favorite', item } | { kind: 'separator' }>` (tree order; at the top level only, a separator between the last folder and the first favorite when both exist and no favorite precedes a folder in the chosen order)
- `resolveSavePath(items, layout, typed: string): string|null` (`parseTypedPath`; an existing full path wins; else a single segment matching exactly one existing folder anywhere resolves to that folder's path; else the typed path from the top level; `null` when invalid or too long)

- [ ] **Step 1: Write the failing tests**

```js
test('menu nests in tree order', () => {
  const m = favoritesMenuModel([fav('a', 'Work › Clients', 1), fav('b', null, 2)], EMPTY);
  assert.deepEqual(m.map((x) => x.kind), ['folder', 'separator', 'favorite']);
  assert.equal(m[0].children[0].name, 'Clients');
});
test('/save resolves a unique leaf, then creates from the top', () => {
  const items = [fav('a', 'Work › Clients', 1)];
  assert.equal(resolveSavePath(items, EMPTY, 'clients'), 'Work › Clients');
  assert.equal(resolveSavePath(items, EMPTY, 'Work > New'), 'Work › New');
  assert.equal(resolveSavePath(items, EMPTY, 'Recipes'), 'Recipes');
});
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; `favoritesMenuItems` maps the model to Electron menu templates recursively, keeping `escapeMenuLabel` and the 120-character label cut.
- [ ] **Step 4:** Run `npm run test:unit`. Expected: PASS. Relaunch and check the Favorites menu and `/save Work > Clients` by hand.
- [ ] **Step 5:** Commit: `Favorites: nested menu and /save paths`.

### Task 13: Parity record

**Files:**
- Modify: `spec/features.md` (add `## F63 — Favorites manager (desktop)` after F62 with the spec's goals and an Acceptance line; add one line under F9 pointing to it), `spec/divergence-register.md` (add `## D40 — Nested Favorites folders show flat on phones and the fork`: path-named flat folders, folder edits there don't reach sub-folders, until each platform adopts the tree), `spec/parity-matrix.md` (F63 row: desktop PARTIAL "Merged, unreleased", iOS and Android N/A, D40), `CLAUDE.md` and `AGENTS.md` (one paragraph in Architecture after the Favorites naming paragraph: paths in `folder`, `favoritesLayout`, the whole-value clock rule, the flat mode for hosts without `tree`)

- [ ] **Step 1:** Make the edits. Do not touch `site/` or release notes; the website keeps describing the released Favorites until a release ships this.
- [ ] **Step 2:** Run `npm run substrate:check` and `npm run test:unit` (unit tests guard the parity matrix and claims ledgers). Expected: PASS.
- [ ] **Step 3:** Commit: `Spec: F63 Favorites manager and D40`.

---

## After the last PR

- Add an entry to `docs/press/release-notes/unreleased.md` (Added: **Favorites manager**; note that the real-mouse drag check in a packaged build is still owed before release).
- The fork, iPhone and Android follow-ups are not part of this plan.
