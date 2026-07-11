# Import Favorites + Favorites Folders — Design

**Date:** 2026-07-11
**Status:** Approved design, pending implementation plan

## Summary

Two related capabilities for Blanc's Favorites:

1. **Import favorites from another browser** by reading an exported *Netscape
   bookmark* HTML file (the universal format every major browser — Chrome,
   Edge, Brave, Firefox, Safari — exports). No new dependencies, no reading
   other apps' profile directories, one parser for all sources.
2. **First-class, single-level favorites folders**, managed on the Favorites
   page (`blanc://bookmarks/`), modelled exactly on Blanc's tab groups: a
   folder is a per-favorite label, not a separate entity, and exists only
   while a favorite references it. Import maps each source folder onto one of
   these flat folders.

This is a single, appropriately-scoped implementation effort.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Import mechanism | Netscape bookmark HTML export via native file picker |
| Entry point | "Import…" button on the Favorites page header |
| Folder scope | First-class, managed on the Favorites page only |
| Folder nesting | Single level (flat) |
| Nested-import folder naming | **Immediate parent** `<H3>` name (leaf), not joined path |
| Favorites-page folder ordering | **Alphabetical** (case-insensitive), ungrouped section last |
| Folder identity | **Case-insensitive**; first-existing spelling preserved; rename-to-existing merges |

Other surfaces (ledger start page, ⌘L panel, favorites menu) keep showing a
flat favorites list for now — they read `listBookmarks()` and simply ignore
the new `folder` field.

## Module layout (test seam)

`bookmarks.js` depends on the singleton `JsonStore`, which calls
`app.getPath('userData')` at construction (`store.js:26`) — so its mutations
cannot run under plain `node --test`. Following the codebase's established
idiom (`favicon-policy.js`, `permission-decisions.js`, `external-protocols.js`,
`sync-wipe.js` — pure Electron-free cores with thin wrappers), the logic is
split so every non-trivial rule is a pure, directly-testable function:

| Module | Purity | Responsibility |
|---|---|---|
| `src/main/bookmark-validate.js` **(new)** | Pure, no Electron | `validFavicon(favicon)`, `validFolder(name)`, `folderKey(name)`. Shared by everything below. |
| `src/main/bookmark-import.js` **(new)** | Pure, no Electron | `parseNetscapeBookmarks(html, { now })  → entries[]`. Imports the favicon validator from `bookmark-validate.js` (importing it from `bookmarks.js` would drag in Electron). |
| `src/main/bookmark-data.js` **(new)** | Pure, no Electron | Non-mutating data transforms over a plain `{ items, tombstones }` snapshot: `addImported`, `applySetFolder`, `applyRenameFolder`, `applyRemoveFolder`, `canonicalizeFolders`. Injected `now`/`makeId` for determinism. |
| `src/main/bookmarks.js` (existing) | Electron (store) | Thin wrapper: reads `store.data`, calls the pure transform, and **only** writes + fires `notifyChanged()` when the transform reports a real change. Its current `validFavicon` moves to `bookmark-validate.js` (re-imported here; nothing else imports it). |

Dependency graph is acyclic: `bookmark-validate` ← `bookmark-import`,
`bookmark-data`; `bookmark-data` ← `bookmarks`. `pages.js` uses
`bookmark-import` (parse) + `bookmarks` (persist).

## Data model

Each favorite gains one optional field:

```js
{ id, url, title, favicon, addedAt, updatedAt, folder }
//                                               ^ string name, or null/absent = ungrouped
```

- **No separate folders entity.** A folder is derived from the set of
  `folder` values present on items — exactly like tab groups
  (`pruneEmptyGroups`). An empty folder cannot persist; it vanishes the moment
  its last favorite leaves it. "Create a folder" therefore means *assign a
  favorite to a new-named folder*.
- **No migration needed.** Existing `bookmarks.json` items have no `folder`
  key; a missing/`null` folder reads as ungrouped. `JsonStore` has no schema
  or migrations by design.

### Folder identity & collisions

- **`validFolder(name)`** returns a trimmed non-empty string ≤ 100 chars, or
  `null` for anything else. `null` means **ungrouped** and is only ever
  produced/consumed as an *explicit* ungroup — never as the fallback for
  invalid rename/assign input (see the API rules below).
- **`folderKey(name)` = `name.trim().toLowerCase()`** is the identity key.
  `Work` and `work` are the **same** folder.
- **First-existing spelling wins.** Canonicalization resolves a desired name
  against the folders already present: if some item's `folderKey` matches, the
  new/renamed item adopts that existing item's stored spelling (so `Work` +
  `work` never coexist). "Existing" = the spelling on the earliest item
  (oldest `addedAt`) in that folder. Only when no folder matches is the
  desired spelling stored as the new canonical.
- **Rename-to-existing merges.** `renameFolder("News", "Reading")` when a
  `Reading` folder exists relabels every `News` item to the existing `Reading`
  spelling — they share a `folder` value and merge into one section. A
  case-only rename (`news` → `News`) re-spells every item in place.

## Ordering (single source of truth: `addedAt`)

To avoid a visible reshuffle after the first sync (`mergeFromSync` re-sorts the
store oldest-first by `addedAt`, `bookmarks.js:138`), ordering is defined once
and applied everywhere:

- **`addedAt` is authoritative.** Import preserves each entry's `ADD_DATE`
  (Unix seconds → ms) when valid and not in the future, else `now`.
- **The store is always kept oldest-first by `addedAt`.** `addImported`
  returns the merged items sorted with the *same* comparator `mergeFromSync`
  uses, so importing old-dated bookmarks never leaves the store in an order
  that a later sync would silently rearrange. Existing oldest-first consumers
  (`favoritesMenuItems`' `slice(-20).reverse()`) stay correct.
- **The Favorites page sorts each folder by `addedAt` descending** explicitly —
  display order never depends on store insertion order, so it is identical
  before and after a sync.

## `src/main/bookmark-data.js` — pure transforms

Each takes a read-only `{ items, tombstones }` snapshot plus injected
`now`/`makeId` and returns, without mutating the input, `{ items, changed }`
plus the fields relevant to that operation — `tombstones` only for transforms
that touch them (just `addImported`) and operation-specific counts.
`bookmarks.js` writes back exactly the fields returned, and only when
`changed === true`.

- `addImported(snapshot, entries, { now, makeId }) → { items, tombstones, added, skipped, changed }`
  - **Dedupe by exact URL against both** existing favorites **and earlier
    entries in the same batch**; **first occurrence wins**, every later
    duplicate is skipped and counted in `skipped`.
  - Each new item: `title` falls back to URL; `favicon` via `validFavicon`;
    `folder` canonicalized (§ Folder identity) against the growing folder set;
    `addedAt` from the entry; `updatedAt = now`; `id = makeId()`.
  - Clears any delete-tombstone for each newly-added URL (matches
    `toggleBookmark` re-add semantics).
  - Merged items returned sorted oldest-first by `addedAt`.
  - `changed = added > 0`. An all-duplicate import returns `changed: false`
    (no write, no `notifyChanged()`).
- `applySetFolder(snapshot, id, folder, { now }) → { items, changed, ... }`
  - `folder === null` → **explicit ungroup** (allowed).
  - `folder` a string → canonicalize via `validFolder`/identity; if
    `validFolder` rejects it (blank, > 100 chars), **no-op** (`changed:false`) —
    invalid input never ungroups.
  - No-op (and `changed:false`) if `id` is unknown or the resolved folder
    equals the current one. Bumps `updatedAt` only on real change.
- `applyRenameFolder(snapshot, oldName, newName, { now }) → { items, changed, ... }`
  - `const target = validFolder(newName); if (target === null) return changed:false;`
    — a blank/over-long rename is **rejected**, never treated as ungroup.
  - **Case-only rename exception:** if
    `folderKey(oldName) === folderKey(newName)`, use the trimmed `newName`
    **verbatim** and re-spell every matching item (e.g. `news → News`).
    Resolving against existing folders here would find the current `news`
    spelling and wrongly no-op.
  - **Otherwise**, resolve `target` against existing folders (merge-on-collision
    semantics above) before relabelling.
  - Relabels every item whose `folderKey === folderKey(oldName)`, bumps their
    `updatedAt`. `changed:false` if no items match (unknown folder) or the
    resolved spelling already equals the current one (true no-op).
- `applyRemoveFolder(snapshot, name, { now }) → { items, changed, ... }`
  - Explicit ungroup-all: sets `folder = null` on every item in `name`, bumps
    their `updatedAt`. `changed:false` if the folder holds nothing.
- `canonicalizeFolders(items) → items` — collapses every `folderKey` group to
  a **single** canonical spelling, enforcing the identity invariant on a set of
  items that may have arrived from mixed sources (a sync merge). The canonical
  spelling for a group is the `folder` of its item with the smallest `addedAt`,
  ties broken by smallest `id` — a **fully deterministic** rule, so two devices
  independently canonicalizing the same merged set converge on the same
  spelling. It rewrites `folder` spelling **only**; it does **not** touch
  `updatedAt` (cosmetic normalization must never outrank a real edit under LWW
  or cause sync ping-pong — same reasoning as favicon self-healing). Ungrouped
  (`folder == null`) items are left alone.

## `src/main/bookmarks.js` — wrapper additions

Thin wrappers around the transforms; each reads `store.data`, and **only** when
the transform reports `changed` does it write and notify:

```js
function renameFolder(oldName, newName) {
  const s = ensureStore();
  const res = data.applyRenameFolder(s.data, oldName, newName, { now: Date.now() });
  if (!res.changed) return;
  s.update((d) => { d.items = res.items; });
  notifyChanged();
}
```

Public additions: `importBookmarks(entries) → { added, skipped }`,
`setBookmarkFolder(id, folder)`, `renameFolder(oldName, newName)`,
`removeFolder(name)`. `sanitizeRemoteItem` also runs `folder` through
`validFolder` (a malformed/older sync blob can't inject a bad folder).
`toggleBookmark` (⌘D / star) is unchanged: newly-starred pages are ungrouped.

## Sync — rides existing machinery, no new primitives

`folder` is a per-item field, covered by the existing whole-item
last-writer-wins merge keyed by URL. `exportForSync()` items carry `folder`
automatically. Cross-device conflict (rename on A, move on B) resolves
per-favorite by `updatedAt` LWW, never dropping a favorite. No folder
tombstones — an emptied folder disappears because it is derived, never stored.

**One structural addition beyond sanitization.** The case-insensitive folder
identity invariant is enforced by `bookmark-data`'s canonicalization on local
writes, but a merge is a back door: two devices can independently create `Work`
and `work`, and `sanitizeRemoteItem` only validates the *strings*, so the
unioned store could hold both spellings. Therefore `mergeFromSync` runs the
merged items through `canonicalizeFolders(items)` (§ transforms) before storing
them — after the union/tombstone pass, replacing the current bare
`d.items = […sorted]` assignment. Because canonicalization is deterministic and
does not bump `updatedAt`, both devices converge on the same spelling without a
sync trigger (it rides the existing `notifyMerged()`, not `notifyChanged()`).
The store is thus canonical by construction — local transforms canonicalize,
`mergeFromSync` canonicalizes — so `exportForSync` needs no separate step.

## Import parser — `src/main/bookmark-import.js`

`parseNetscapeBookmarks(html, { now = Date.now() } = {}) → [{ url, title,
favicon, addedAt, folder }]`, pure and I/O-free. `now` is injected so
missing/future-`ADD_DATE` fallback is deterministic under `node --test`:

- **Folder = immediate enclosing `<H3>` name.** Every `<H3>` opens a folder;
  the parser tracks the current folder as it walks `<DL>`/`</DL>` nesting. A
  favorite inside `Bookmarks bar → News` yields `folder: "News"`; one directly
  under a root `<DL>` with no enclosing `<H3>` is ungrouped (`folder: null`).
- **Case-insensitive, quote-tolerant tokenizing.** Tag and attribute names are
  matched case-insensitively (`<A>`/`<a>`, `HREF`/`href`, `ADD_DATE`, `ICON`);
  attribute values are read as double-quoted strings (the format's convention),
  with single-quoted and bare-value tolerance. This is a deliberately simple
  regex/scan (in the spirit of `normalizeAddressInput`), not a DOM parse.
- **URL filter:** only `http:` / `https:` links kept. `javascript:`
  bookmarklets, Firefox `place:` smart folders, `chrome://`, `about:`, etc.
  are dropped.
- **Favicon:** the `ICON="data:image/…"` attribute is used when it passes
  `validFavicon` (≤ 2048 chars); otherwise `null`, and existing self-healing
  fills it in on first visit. (Many base64 icons exceed 2048 chars and are
  simply dropped — same validation as everywhere else.)
- **Dates:** `addedAt` from `ADD_DATE` (Unix seconds → ms) when valid and not
  future (compared against the injected `now`), else `now`.
- **HTML entities** in titles and URLs are decoded (`&amp; &lt; &gt; &quot;
  &#39; &#NN;`).

## Main-process wiring — `src/main/pages.js`

New guarded `pages:bookmarks:*` handlers (each re-verifies the sender is an
internal `blanc://` page, like every existing handler):

- `pages:bookmarks:import` →
  1. `dialog.showOpenDialog(mainWindow, { filters: [{ name: 'Bookmarks',
     extensions: ['html', 'htm'] }], properties: ['openFile'] })`.
  2. Cancelled → `{ cancelled: true }`.
  3. **Size guard:** `fs.promises.stat()` first; reject if
     `size > 20 * 1024 * 1024` (**20 MiB**) → `{ error: 'too-large' }`, before
     any `readFile`.
  4. `fs.promises.readFile` → `parseNetscapeBookmarks` → `importBookmarks` →
     `hooks.onDataChanged?.()`.
  5. Return `{ added, skipped }`, or `{ error: 'unreadable' }` on read/parse
     failure, or `{ error: 'empty' }` when the file yields zero valid links.
- `pages:bookmarks:set-folder` (id, folder) → `setBookmarkFolder`.
- `pages:bookmarks:rename-folder` (oldName, newName) → `renameFolder`.
- `pages:bookmarks:remove-folder` (name) → `removeFolder`.

`setupPages` gains `hooks.getMainWindow` (returns the live `win` or
`undefined`) so the dialog is parented. `pages.js` imports `dialog` and `fs`.

## Preload bridge — `src/main/tab-preload.js`

Extend `bowserPages.bookmarks` with `import`, `setFolder`, `renameFolder`,
`removeFolder` (each an `ipcRenderer.invoke` of the channel above). The
picker's folder list is derived renderer-side from `bookmarks.list()` — no
extra IPC.

## Favorites page — `bookmarks.html` + `bookmarks.js` + `pages.css`

- **Header:** the `Favorites` heading plus an **"Import…"** button and an
  inline status line (`role="status"`). The renderer only ever receives the
  `{ added, skipped }` / `{ error }` / `{ cancelled }` summary — never file
  contents or paths.
- **Body:** grouped rendering —
  - **Folder sections**, alphabetical (case-insensitive by `folderKey`). Each
    header shows the folder name + count with **Rename** and **Remove folder**
    (ungroup-all) actions.
  - An **ungrouped section** last, for `folder == null` favorites.
  - Within a section, rows ordered **`addedAt` descending** (§ Ordering). Each
    row shows title / url / added-date / Remove as today, **plus a "folder"
    chip** opening a small picker: existing folders (`→ name`), `→ none`, and a
    **"new folder…"** inline `<input maxlength="100">`. Picking or submitting
    calls the matching bridge method, then refreshes.
- **Status copy** (inline, no modal dialogs):
  - Success: `Imported 42 favorites (skipped 7 already saved).`
    (singular/plural aware; the "(skipped …)" clause omitted when 0)
  - `empty` → `No bookmarks found in that file.`
  - `unreadable` → `Couldn't read that file.`
  - `too-large` → `That file is too large to import.`
  - `cancelled` → silent no-op.
- **`pages.css`:** folder-header, section, and picker styles, reusing existing
  `row-list` / `row` / `actions` / button classes. No new design tokens.

## Testing — `test/unit/` (node `--test`, `npm run test:unit`)

All logic lives in the pure modules, so tests import them directly (no Electron),
matching the existing `favicon-policy.test.js` / `permission-decisions.test.js`
pattern.

- **`bookmark-import.test.js`** — parse **representative real fixtures** from
  Chrome, Firefox, and Safari exports (checked into `test/fixtures/`), not one
  synthetic file: immediate-parent folder naming, ungrouped top-level links,
  entity decoding, `ICON` (valid + over-length dropped), `ADD_DATE` (valid /
  missing / future), dropped non-`http(s)` links, and mixed tag/attribute case
  with quoted values. A fixed injected `now` makes the missing/future-date
  fallback deterministic.
- **`bookmark-data.test.js`** —
  - `addImported`: URL dedupe against existing items **and** intra-batch, with
    first-occurrence-wins; existing favorites and their folders untouched; new
    items get canonicalized folders; tombstone-clear; oldest-first `addedAt`
    ordering of the result; all-duplicate import → `changed:false`.
  - `applySetFolder`: explicit `null` ungroups; invalid string (blank / 101
    chars) is a no-op, **not** an ungroup; unknown id / unchanged folder →
    `changed:false`.
  - `applyRenameFolder`: relabels; blank/over-long `newName` rejected
    (`changed:false`, no ungroup); rename-to-existing **merges** into the
    existing spelling; case-only re-spell; unknown/no-op → `changed:false`.
  - `applyRemoveFolder`: ungroups all; empty folder → `changed:false`.
  - `canonicalizeFolders`: a mixed-spelling set (`Work` + `work`) collapses to
    one deterministic spelling (oldest `addedAt`, tie by `id`); `updatedAt`
    left untouched; ungrouped items unaffected; two independent runs converge.
  - Folder identity: `Work`/`work` treated as one; first-existing spelling
    preserved.
- **`bookmark-validate.test.js`** — `validFavicon` (allow-list + 2048 cap),
  `validFolder` (trim, non-empty, 100-char cap, else `null`), `folderKey`.

## Explicitly out of scope / no impact

- **Substrate checks** (`substrate:check`): unaffected — no new slash command,
  settings enum/default, or design token.
- **Per-file CSP:** unaffected — the file picker is native; no new web-facing
  resource is loaded.
- **Nested folders, exporting favorites, empty standalone folders, folders on
  the start page / ⌘L panel / favorites menu:** not in this effort. The flat
  model and per-favorite `folder` field leave room to add these later without
  reshaping storage or sync.
