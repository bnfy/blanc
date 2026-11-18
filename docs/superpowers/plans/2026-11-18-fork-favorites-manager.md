# Blanc Beta: the Favorites manager (F63) in the fork

Date: November 18, 2026. Branch: `chromium/next`. Status: proposed, waiting for
the owner's approval.

Shipping's Favorites page became the F63 manager (bnfy/blanc#1590, in v1.50.0)
and, in bnfy/blanc#1614 (open on November 18, 2026), a full page in a tab with
an Edit dialog. The fork still serves v1.49.1's flat list in its utility sheet
(D40). This plan brings the fork to #1614's page.

## What the fork has today

- The page: `chromium/blanc/island/pages/bookmarks.{html,js}`, v1.49.1 copies
  made by `tools/island-renderer.mjs` (`SHEET_FILES`), shown in the Island
  host's sheet frame. `pages/sheet-adapter.js` hands it a `bowserPages` built by
  `host.js` `sheetBridge`, which calls native ops through `request()`.
- The native ops: `blanc_prototype_ui.cc` (`listFavorites`, `sheetFavorite*`,
  `sheetFolder*`) and `utility_sheet_ops.inc`, on Chromium's `BookmarkModel`.
  A favorite's `folder` is its parent folder's title, one level only.
- Sync: `desktop_sync_service.cc` maps shipping's `folder` string to one folder
  under Other bookmarks, by that whole string. A path such as `Work › Reading`
  from another device is today one flat folder with that title. The Sync bundle
  is v1.46.0 and keeps `favoritesLayout` whole, never applying it.
- Chromium's bookmark-manager command (⌘⌥B, menus) already goes through patch
  0012 to Blanc's own `OpenUtilitySheet(browser, "bookmarks")`.

## Decisions for the owner

1. **Favorites is a tab in the fork too (recommended).** It matches shipping
   and Chromium, whose bookmark manager is a tab. The page loads in a tab at
   `chrome://blanc-prototype/pages/bookmarks.html`, shown as `blanc://bookmarks/`.
   Opening Favorites again switches to that tab (shipping's `openInternalPage`).
   From a private window it opens in a regular window of the profile, as
   Chromium's own bookmark manager does. Shipping instead shows it in the private
   window with the pins hidden; this is a new divergence to record.
   The alternative keeps it in the sheet frame, where the page now draws itself
   as a full page (`body.fav-page`) inside an overlay. That is shipping's old
   shape with the new styling, so I don't recommend it.
2. **Nested folders are real Chromium folders (recommended).** A path
   `Work › Reading` is a `Reading` folder inside `Work` under Other bookmarks.
   Sync reads and writes the whole path as the `folder` string, so the format
   doesn't change for other devices. A one-time pass at model load splits every
   existing flat folder whose title holds ` › ` into the nested chain, moving its
   contents in order. That pass is the only change to existing data.
3. **Order and empty folders stay on this Mac for now.** Chromium's own order is
   the manager's order, and it is kept across launches. The fork keeps
   `favoritesLayout` whole for other devices, as today, but doesn't apply or
   publish it. So a reorder made in the fork doesn't reach shipping desktops,
   and theirs doesn't reach the fork. Mapping `favoritesLayout` both ways is a
   follow-up.
4. **Pin the Favorites page separately and wait for #1614 to merge
   (recommended).** The page's files get their own pin,
   `chromium/blanc/favorites-page.json`, at #1614's merge commit on `main`, as
   the Settings strings already have. It never trails the renderer pin. Moving
   the whole renderer pin to v1.50.0 or later is a separate job: it carries every
   Island file and the scenario inventory (the last move, `384b409d5`, touched
   33 files). Pinning an open PR's head is not an option, because its commits can
   change before merge.

## The bridge, call by call

Every call answers `{ok: true}` or `{ok: false, error}` with shipping's codes:
`invalid`, `missing`, `cycle`, `too-long`, and for `edit` `exists` and
`invalid-url`. A path is the folder titles from Other bookmarks down, joined by
` › `. `null` is the top level. A path longer than 100 characters is refused,
which is the limit every client enforces.

| Call | BookmarkModel |
| --- | --- |
| `capabilities()` | `{editable, tree: true, import: true}`; `editable` from `CanEditFavorites` |
| `tree()` | Walk Other bookmarks: folders become `{kind:'folder', key, folder:{path, name, key, children}}`, favorites `{kind:'favorite', key, item}`, in Chromium's order. Keys are `n:<node id>`. Bookmarks bar, mobile and account folders, if not empty, appear as top-level folders that can't be renamed, moved or removed, as in Chrome's manager. |
| `createFolder(parentPath, name)` | `AddFolder` at the end of the parent; an existing name (ignoring case) answers `ok` without a duplicate |
| `renameFolder(path, newName)` | `SetTitle` on that one folder (path-based now, not every folder of that name); a name a sibling already has merges the two into the sibling, as shipping does |
| `removeFolder(path)` | Move its children into its place in the parent, then `Remove` it, as today |
| `moveFolder(path, newParentPath)` | `Move` to the end of the new parent; `cycle` if the parent is inside it; merges into a same-named folder there |
| `move(ids, path)` | `Move` each favorite to the end of the folder |
| `reorder(path, keys)` | `Move` each listed child to its index; unknown keys are skipped |
| `remove(id)` / `removeMany(ids)` | `Remove` each editable favorite |
| `edit(id, {title, url})` | `SetTitle` and `SetURL` after shipping's `editableAddress` rules (http/https; a bare host gets `https://`); `exists` if another favorite has that address; a Start Page pin follows the new address; returns `{ok, key}` |
| `setFolder(id, folder)` | Kept: `move([id], folder)` |
| `onChanged(cb)` | A bookmark-model observer on the page's handler notifies the page, as the Start Page's does |
| `list`, `import`, `browserSources`, `importBrowser`, `pins.*` | Unchanged |

Only editable favorites in the profile's own storage are touched, as
`EditableFavorite` already requires. Managed bookmarks are shown and not
editable.

## Work, in order

1. **Native ops.** In `utility_sheet_ops.inc` (renamed in spirit to "Favorites
   ops"): path helpers (split, join, find, find-or-create a chain), the calls
   above, and the one-time split of ` › ` titles. `FavoriteRecord`'s `folder`
   becomes the full path, so `/save Work › Reading`, the Start Page and Sync see
   paths. `favorite_helpers.h` gains the path helpers; `SaveFavorite`,
   `SetFolder` and Sync's `ApplyFavorite`/`Collect` use them.
2. **The tab.** A `FavoritesHandler` (WebUI message handler) that answers only
   when the committed main-frame URL is exactly the Favorites page in a regular
   profile, beside the Start Page's `NewTabHandler`. `OpenUtilitySheet(browser,
   "bookmarks")`, typed `blanc://bookmarks` and `blanc://favorites`, and the
   sheet's Favorites links open or switch to the tab. `bookmarks` leaves
   `SHEET_PAGES`.
3. **The page.** `tools/favorites-page.mjs` copies `bookmarks.html`,
   `bookmarks.js`, `favorites-manager.js`, `favorites-manager-model.js`,
   `start-pins.js` and `row-icon.js` at the pin, swapping the sheet bridge for
   a new `pages/favorites-adapter.js` (`chrome.send`, as `newtab-adapter.js`).
   The `.fav-*` and `body.fav-page` rules are ported into the fork's
   `pages/pages.css`. The `favorites.*` strings come from the same commit
   through `interface-strings.mjs`. Served-asset lists and the manifest are
   updated.
4. **Guards and records.** `favorites-manager-guard.test.mjs` flips to "the
   desktop page is the manager's and reports `tree: true`" (Android stays flat).
   New unit tests: the path helpers and every call's error codes against a
   recorded model, the handler's URL gate, and the page pin never trailing the
   renderer pin. D40 changes to "the desktop fork has the tree; order is
   local". The private-window divergence is added. `chromium/STATUS.md` and the
   tracker row for F9/F63 are updated.
5. **Checks.** The fork unit suite
   (`node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs`).
   Then on the Mac Studio, with no release or build running: apply with
   `tools/apply.py`, `tools/build.mjs SRC --check --out=BlancPrototype`, review
   the plan size, and `--build`. No cold build, no hooks, no GN or toolchain
   change. Then one native check that opens the tab, creates, nests, moves,
   reorders, edits and removes, and syncs a nested path against the local
   Worker.

## Patch budget

None. Every change is in Blanc's own files (`chromium/blanc/**`,
`chromium/tools/**`, tests, docs). Patch 0012 already sends Chromium's
bookmark-manager command to `OpenUtilitySheet`, so no upstream file changes.

## Not in this change

- Applying or publishing `favoritesLayout` (decision 3).
- Android and iPhone, which keep the flat list (D40).
- Moving the whole renderer pin to v1.50.0.
- Any public claim about Favorites in Blanc Beta until a release ships it.
