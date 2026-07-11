# `/save [folder]` — quick-favorite from the command bar

**Date:** 2026-07-11
**Status:** Approved

## What

A new slash command that saves the active tab to Favorites straight from the ⌘L command
bar, without reaching for ⌘D or the heart button — and, with an optional argument, files it
into a Favorites folder in the same keystroke. It adds a command surface over the existing
bookmarks store; there is no new user-facing concept.

- **`/save`** → save the active tab to Favorites at top level (no folder).
- **`/save <folder>`** → save into `<folder>`, found-or-created by name (created on first
  use). Everything after `/save ` is the folder name, so multi-word names
  (`/save reading list`) work.

Terminology: a Favorites **folder** is the target here — the string `folder` on a bookmark
item — not a **tab group** (`/group`). The two are separate features. They share a
find-or-create-by-name shape but **not** their identity rules: tab-group names are
lowercased and capped at 40 (case-sensitive identity thereafter), whereas Favorites folders
preserve spelling, cap at 100, and match **case-insensitively** with a canonical spelling
(see below). This spec follows the folder rules, not the group rules.

## Behavior

**Add-only / idempotent.** `/save` only ever adds; it never removes. This keeps it
semantically clean and distinct from the *toggle* already bound to ⌘D and the heart button.

**Guards** mirror `toggleBookmarkForActiveTab` exactly — `/save` is a **no-op** when:
- the active tab is **private** (Favorites never populate from private browsing), or
- the URL is not `http(s)` (`blanc://`, `file://`, blank new tab).

On those pages nothing happens and the overlay still closes — consistent with the heart
button being *disabled* there and with how `/close-group` no-ops when there is no group.
There is no toast/confirmation surface in the app today; success is silent, reflected by the
filled heart the next time the panel opens.

**Folder validation and casing.** The folder argument is run through the existing
`validFolder` / `folderKey` / canonical-spelling machinery in `bookmark-data.js` — the same
rules `applySetFolder` and `addImported` already apply, so `/save` can never create a folder
the Favorites page and native menu would treat differently:

- **New folder** (no case-insensitive match exists) → the trimmed argument is stored as-is
  (preserves spelling).
- **Existing folder** (a favorite already carries a case-insensitive match, e.g. `Work`) →
  adopt that folder's **canonical spelling** (`buildCanonMap`), so `/save work` files into
  the existing `Work` rather than forking a second folder.
- **No argument** — the overlay collapses an empty parse (`''`) to `null` *before* it reaches
  the store (`window.browserAPI.saveFavorite(folder || null)`), so `/save` and `/save ` with
  only trailing spaces both arrive as `folder = null` → a plain top-level save. The store
  layer therefore only ever receives `null` (top-level) or a **non-empty** candidate string.
- **Over-long argument** — a non-empty candidate longer than 100 characters → `validFolder`
  returns `null`, and the command is a **no-op: it must never fall back to saving at top
  level.** (`validFolder`'s contract: a `null` from a *non-null* input means "reject," not
  "ungroup.")

**Folder edge cases:**

| State | Command | Result |
|-------|---------|--------|
| Not saved | `/save` | Add, top level |
| Not saved | `/save work` | Add into folder `work` (canonical spelling if one exists) |
| Not saved | `/save <101+ chars>` | **No-op — nothing saved** (rejected, not top-level) |
| Already saved | `/save` | No-op (add-only) |
| Already saved | `/save work` | **File the existing favorite into `work`** (move/upsert) |
| Already saved | `/save <101+ chars>` | No-op (existing favorite untouched) |

Honoring an explicitly-named folder on an already-saved page is the intuitive read — the
user typed `work` on purpose — and a folder move is not destructive the way a removal would
be. A bare `/save` never touches an existing favorite.

The overlay **closes** after running (not `keepOverlay`), like `/pin` and `/mute`.

## Architecture

The pure store mutation lives in `bookmark-data.js` (the established home for all folder
identity/canonicalization logic and the only layer that's unit-testable without Electron);
everything above it is thin plumbing. No new IPC namespace, no new store file, no schema
change. There are in fact **three** hand-synced slash-command copies, not two — this design
adds `/save` to all three and extends the substrate guard to cover the third.

- **`src/main/bookmark-data.js`** — new pure `applySaveFavorite({ items, tombstones },
  { url, title, favicon, folder }, { now, makeId })`. Returns `{ items, tombstones, changed }`
  (same shape as the other `apply*` transforms). Logic:
  1. If `folder` is non-null, resolve it through `validFolder`; a `null` result → return
     `{ changed: false }` immediately (**reject before any add** — this is what makes an
     over-long folder a total no-op, never a top-level save). Otherwise canonicalize via
     `buildCanonMap(items).get(folderKey(valid))` → `existing.folder ?? valid`.
  2. Find the item by `url`. **If present** (idempotent): a `null` folder → `{ changed: false }`;
     a resolved folder equal to the current one → `{ changed: false }`; otherwise return the
     item moved to the resolved folder with a bumped `updatedAt`.
  3. **If absent:** append a new item (`makeId`, `validFavicon`, `title || url`,
     `addedAt/updatedAt = now`, `folder` = resolved target or `null`) and drop any tombstone
     for that url (re-favoriting clears a prior delete — mirrors `toggleBookmark`'s add path).
  Added to `module.exports`.

- **`src/main/bookmarks.js`** — thin `saveFavorite(url, title, favicon, folder)` wrapper:
  call `data.applySaveFavorite(ensureStore().data, …, { now: Date.now(), makeId: crypto.randomUUID })`,
  and only on `changed` do the **single** `s.update` (writing back `items` + `tombstones`)
  and `notifyChanged()` — one write, one sync notification, mirroring `setBookmarkFolder`.
  Added to `module.exports`.

- **`src/main/main.js`** — two edits:
  - `saveActiveTabAsFavorite(folder)`: the same three-line guard as
    `toggleBookmarkForActiveTab` (`!tab || tab.private || !/^https?:\/\//.test(tab.url)`),
    then `bookmarks.saveFavorite(tab.url, tab.title, tab.favicon, folder)`, then re-derive
    `tab.bookmarked = bookmarks.isBookmarked(tab.url)` (correct for add / move / reject alike,
    rather than optimistically assuming `true`), then `broadcastTabs()` + `scheduleMenuRebuild()`.
    Registered alongside the existing bookmark handler:
    `chromeHandle('tabs:save-favorite', (_e, folder) => saveActiveTabAsFavorite(folder))`.
  - Add `['/save [folder]', 'Save this page to favorites, into a folder if you name one']` to
    the `SLASH_COMMANDS` list (~line 1690) that feeds the **Help → Slash Commands** menu —
    the third hand-synced copy — placed right after `['/favorites', 'Open favorites']`.

- **`src/main/preload.js`** — `saveFavorite: (folder) => ipcRenderer.invoke('tabs:save-favorite', folder)`
  on the `browserAPI` bridge.

- **`src/renderer/overlay.js`** — a new `COMMANDS` entry whose `run` parses the folder off
  the typed input, mirroring `/group`:
  ```js
  { cmd: '/save', hint: 'Save this page to favorites — name a folder to file it',
    run: (input) => {
      const folder = (input ?? '').replace(/^\/save\s*/, '').trim();
      window.browserAPI.saveFavorite(folder || null);
    } },
  ```
  Placed **immediately after `/favorites`** so the two favorite commands sit together. Known
  side effect: typing bare `/s` now surfaces `/save` above `/settings`, so `/s`+Enter fires
  `/save` (both rows still shown; `/sa` vs `/se` disambiguates with one more keystroke).

- **`copy/slash-commands.json`** (source of truth) + **`src/renderer/pages/shortcuts.js`**
  (`blanc://shortcuts/` reference list) — matching copy. The JSON entry carries a `doc`
  override (same mechanism `/group` uses) so the reference list and Help menu show the
  argument form while the palette shows the base command:
  ```json
  { "command": "/save",
    "hint": "Save this page to favorites — name a folder to file it",
    "doc": { "command": "/save [folder]",
             "hint": "Save this page to favorites, into a folder if you name one" } }
  ```
  `shortcuts.js` gets `['/save [folder]', 'Save this page to favorites, into a folder if you name one']`.
  Run `npm run copy:build` after editing the JSON to regenerate the mobile string artifacts.

- **`copy/build.mjs`** — **extend the guard to the third copy.** Today it parses only the two
  sources in `spec.sources` and would let the `main.js` Help-menu list drift silently. Add
  `"main": "src/main/main.js"` to `spec.sources` in `slash-commands.json`; add a `parseMain()`
  (identical shape to `parseShortcuts()` — same `const SLASH_COMMANDS = [ … ]` variable and
  `['cmd', 'hint']` tuple format, so factor the two into one parametrized helper); and add a
  third `diffList('main.js', parseMain(), shortcutsExpected)` to `check()` (main.js uses the
  same `doc`-override spellings as `shortcuts.js`, so it compares against `shortcutsExpected`,
  not `overlayExpected`). Update the file header comment (which says "BOTH desktop copies")
  and the `$note` in `slash-commands.json` to name all three copies.

The command list's own filtering needs no change: `renderList` keys off the first
whitespace-delimited word (`slashWord`), so while the user types `/save rea…` the `/save`
row stays pinned as the top command and Enter fires it with the full input — identical to
`/group work`.

## Testing

- **Unit — `test/unit/bookmark-data.test.js`** (pure logic, `node --test`, no Electron):
  add `applySaveFavorite` cases alongside the existing `applySetFolder` ones —
  - new url → adds at top level (`folder: null`);
  - new url + named folder → added into it, **canonical spelling adopted** for a case-variant
    (extend the existing `applySetFolder`-adopts-spelling fixture);
  - new url + over-long (101-char) folder → `changed: false`, **nothing added** (the reject);
  - existing url + bare (`null`) → `changed: false` (idempotent, untouched);
  - existing url + named folder → moved/upserted, `updatedAt` bumped;
  - existing url + same folder → `changed: false`;
  - adding clears a prior tombstone for that url.
- **`npm run substrate:check`** — now proves **all three** desktop copies (`overlay.js`,
  `pages/shortcuts.js`, and `main.js`'s Help-menu `SLASH_COMMANDS`) plus the generated mobile
  strings agree with `slash-commands.json` (fails CI on drift). Confirm the extended
  `copy/build.mjs --check` flags a deliberately-mismatched main.js entry before landing.
- **Manual, via a fresh `npm start`** (chrome documents load once at window creation — a ⌘R
  reload will *not* show these changes):
  - `/save` on an `https://` page → appears in `blanc://bookmarks/`, top level; running it
    again does nothing.
  - `/save work` → new "work" folder holds the page; `/save WORK` from a second `https://`
    page joins the **same** folder under its canonical spelling.
  - `/save work` on an already-saved (top-level) page → the favorite moves into "work".
  - `/save reading list` → multi-word folder name preserved.
  - `/save ` + a >100-char name → nothing is saved (no top-level fallback).
  - `/save` on a private tab, on `blanc://settings/`, and on a blank new tab → no-op.
  - Help → Slash Commands and `blanc://shortcuts/` both list `/save [folder]`.
