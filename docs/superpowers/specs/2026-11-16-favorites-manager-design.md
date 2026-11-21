# Favorites manager: nested folders and a chosen order (F63)

Date: November 16, 2026
Status: design, awaiting owner approval. No code written.
Applies to: the shipping Electron app (macOS, Windows, Linux). The Chromium
fork, iPhone and Android are follow-ups (see Non-goals).

## Why

A Patron on Windows 11 wrote to support on November 16, 2026 that the one
thing keeping Blanc from being his daily browser is the Favorites manager. He
keeps a large bookmark collection in folders and sub-folders. After import,
Blanc showed it as one long list grouped by folder name, A–Z. He asked for
"something as simple as the default Chrome/Edge bookmark manager": folders
inside folders, and the ability to sort them himself.

His description matches the code:

- A favorite carries one folder name (`folder`, a string of 1–100 characters or
  `null`). Nesting was ruled out on purpose in
  `2026-07-11-import-favorites-folders-design.md` ("Single level (flat)").
- Import keeps only the innermost folder name. `parseNetscapeBookmarks`
  (`src/main/bookmark-import.js`) stores the top of its folder stack, and
  `parseChromiumBookmarks` (`src/main/browser-data-import.js`) passes down the
  nearest named ancestor. A bookmark at Work › Clients › Acme arrives in a
  flat folder called "Acme".
- Order is fixed. `groupFavoritesForMenu` (`src/main/bookmark-data.js`) and
  the sheet's own `group()` (`src/renderer/pages/bookmarks.js`) sort folders
  A–Z and items newest first. Nothing can be dragged.

## Decisions the owner made (November 16, 2026)

1. Build it in the shipping Electron app first, with a sync format the fork
   and the phones can adopt later.
2. Store nesting as a path in the existing folder name (Approach 1 below).
3. The manager uses two panes: the folder tree on the left, the open folder's
   contents on the right.

Everything else in this document is a proposal from the design work and is
marked "my call" where the owner has not seen it.

## Goals

- Folders inside folders, in the Favorites sheet and the Favorites menu.
- A person chooses the order of folders and favorites by dragging, and the
  order stays.
- Import keeps the source browser's folder tree and order.
- A person whose import was flattened by an earlier version gets the tree back
  by importing again, without duplicates.
- Favorites, nesting and order survive sync with devices that don't know
  about any of this (iPhone 1.0.x, Blanc Beta, older desktop versions).

## Non-goals

- The Chromium fork's Favorites sheet, the iPhone and Android. They keep
  working and show a nested folder as one flat folder named with its path
  (for example "Work › Clients"). Teaching each of them to draw the tree is a
  follow-up per platform. The fork already stores Favorites in Chromium's
  bookmark model, which nests and orders natively.
- A new sync protocol. The authenticated v2 protocol stays its own project.
- A bookmarks bar, tags, notes, duplicate finding, or exporting Favorites.
- Changing which tiles the Start Page shows. Pins already decide that. (This
  reverses a line I proposed in chat; see My calls.)
- Importing a source's empty folders.

## Anti-goals

- A favorite or a folder silently disappearing or moving to the top level
  because another device synced. Losing a custom position is acceptable in
  the edge cases named below; losing a favorite or its folder is not.
- Existing profiles looking different after the update before the person
  changes anything.

## Approaches considered

The iPhone, fork and desktop clients all rebuild a synced favorite from the
fields they know and drop the rest (`sanitizeRemoteItem` in
`src/main/bookmarks.js`, `SyncedFavorites.merge` in
`ios/Blanc/Blanc/Sync/SyncedFavorites.swift`, `Record` in
`chromium/blanc/browser/sync/desktop_sync_service.cc`). They also turn a
folder name longer than 100 characters into "no folder". That rules out
anything that needs a new field on a favorite.

1. **Path in the folder name (chosen).** The `folder` string holds the whole
   path. Older clients keep it intact and show a flat folder with that name.
   Order and empty folders go in a separate synced record. Cost: a full path
   is limited to 100 characters until every client understands paths.
2. **Tree beside the favorites.** Favorites keep a single folder name and a
   separate record says which folder is inside which. Older devices look
   exactly as today. Rejected: folder identity is the name, without regard to
   case, so "Work › Misc" and "Home › Misc" would be one folder. A large
   imported tree has such repeats.
3. **New fields and a new sync version.** No path limit and the cleanest
   model. Rejected for now: it needs the v2 sync project plus iPhone and fork
   releases before the desktop could ship anything.

## Design

### 1. Folder paths

- A folder path is its segment names joined by `" › "` (space, U+203A,
  space). Example: `Work › Clients › Acme`. A top-level folder is a path of
  one segment, so every folder that exists today is already a valid path.
- A segment is 1–100 characters after trimming and never contains `›`. Where
  a name arrives with `›` in it (import, typed input), it is replaced with
  `>`.
- A whole path is at most 100 UTF-16 code units, the limit the other clients
  enforce. Creating, renaming or moving a folder so that any favorite's path
  would pass the limit is refused with a message that says why.
- Identity is the path compared without regard to case, segment by segment.
  This is today's `folderKey` applied to a path.
- Stored strings keep today's spelling rule unchanged: `canonicalizeFolders`
  collapses whole strings that differ only by case, and nothing more. Older
  clients apply the same whole-string rule, so the two never disagree about
  a stored value. A per-prefix rewrite of stored strings was considered and
  dropped: its rewrites carry no clock, older clients would not adopt them,
  and the iPhone would upload after every desktop upload.
- The tree is built by merging segments without regard to case. Where two
  stored paths spell a shared prefix differently ("work" and
  "Work › Clients"), the tree shows one folder, spelled as in the oldest
  favorite under that prefix (ties: the smaller id, as `buildCanonMap` does).
  Folder operations write explicit, stamped paths using the shown spelling,
  so stored spellings converge as people edit.
- A folder exists when a favorite's path equals it or starts with it, or when
  the layout record (section 3) lists it. The second case is how an empty
  folder exists.
- A folder never disappears as a side effect on a device that has the
  manager. When removing or moving a favorite (from the sheet, the Island's
  heart, or anywhere else) would leave a folder with nothing in it, the
  folder's layout entry is written in the same change. It goes away only
  when the person deletes it.
- A folder name saved before this change that already contains `" › "`
  becomes a nested folder. Accepted: the character is not on a keyboard.

These rules live in a new pure module (suggested name
`src/main/favorites-tree.js`; `bookmark-tree.js` is taken by tab import) with
no Electron dependency, and `bookmark-data.js`'s `apply*` functions use it.

### 2. Folder operations

Each is a pure `apply*` function over `{ items, tombstones }` plus the layout
record, returning `changed`, like the existing ones.

- **New folder** under any folder or at the top. Refuses a name that already
  exists there (compared without case) by selecting the existing folder.
- **Rename** changes one segment. Every favorite under the folder gets its
  path rewritten and its `updatedAt` restamped, as `applyRenameFolder` does
  today. Renaming onto a sibling's name merges the two folders.
- **Move a folder** into another folder or to the top. Same rewrite. A folder
  cannot move into itself or its own descendants. Moving onto a same-named
  folder merges.
- **Delete a folder** moves its favorites and sub-folders up one level. For a
  top-level folder that is today's behavior (favorites become ungrouped).
  Nothing is deleted with it.
- **Move a favorite** to a folder or to the top (`applySetFolder`, given a
  path).

### 3. Order and empty folders: the layout record

A new per-profile store (suggested `favorites-layout.json`, `scope:
'profile'`, like `start-page-pins.json`). The Personal profile's record rides
in the settings sync payload as one more value, `favoritesLayout`, the way
`startPagePins` does (`withStartPagePins` in `src/main/sync.js`), so the
Worker needs no new store.

- The record holds one entry per folder that has a chosen order or is empty,
  keyed by the folder's path key; the top level has the empty key. An entry
  holds the folder's ordered list of child keys, its own clock and
  tie-breaker, and a removed marker.
- A child key is `f:` plus a sub-folder's segment key, or `u:` plus a short
  hash of a favorite's address (SHA-256, first 6 bytes, base64url). Addresses
  are the identity because sync merges favorites by address; ids differ
  between devices.
- Merge is per entry, newest clock wins, with the same tie rules as
  `device-names.js`. A removed entry is kept as a marker for 90 days (the
  favorites tombstone window), so a deleted empty folder does not come back
  from another device.
- **The whole value's clock.** The settings payload gives each value one
  clock (`meta.favoritesLayout`), and two kinds of client treat an unknown
  value as a whole: the iPhone (`SyncedSettings.merge`) and the fork's sync
  runner (`__keepUnknownSettings` in
  `chromium/blanc/services/sync_runner/shims/api.js`) keep it and upload it
  again, newest whole-value clock wins. So whenever a desktop's per-entry
  merge produces a value that differs from the remote's, it must raise the
  whole-value clock above both the local and the remote clock before
  uploading. Otherwise those clients keep a stale copy and the two sides
  upload against each other on every pass. When the merge result equals the
  remote's value, the clock is left alone.
- **Older Electron desktops** (every build before this ships) drop the
  value when they upload settings, and `settings.syncPayloadEquals` makes
  them upload whenever the remote has a clocked value they don't export. A
  newer desktop would restore it on its next pass, and the two would trade
  uploads for as long as both are open. To bound that, a newer desktop whose
  only difference from the remote is a missing `favoritesLayout` restores it
  at most once every 10 minutes. Its own copy is never lost meanwhile.
- The stored record is capped at 128 KB serialized (the settings blob shares
  a 512 KB limit). That holds an order for roughly 10,000 favorites. Over
  the cap, order lists are dropped oldest change first, and among lists of
  the same age (one import) the longest first; those folders return to the
  default order. Entries for empty folders are dropped last. When an import
  causes this, its status line says that some folders are in the default
  order.
- Known limit, not changed here: the favorites store itself is one 512 KB
  encrypted blob including icons, so a very large collection can already
  fail to sync with `payload-too-large`. Raising that belongs with sync v2.

**Display order inside a folder.** Children not in the folder's list come
first: sub-folders A–Z, then favorites newest first. Listed children follow in
list order. Keys in the list that no longer match anything are ignored and
pruned at the next write. Consequences:

- A profile that has never reordered anything looks exactly as it does today.
- A favorite added on a device that doesn't know the record shows at the top
  of its folder among the favorites.
- The first time a person drags anything in a folder, that folder's whole
  current order is written to its list.

**What editing on an older device does.** Older clients (older desktops, the
iPhone, the fork, Android) treat each path as one flat folder name and match
it as a whole string. No favorite is ever lost, but their folder edits do not
reach sub-folders:

- Renaming "Work" there renames only the favorites directly in Work. Its
  sub-folders keep the old name, so the manager then shows both the new
  folder and a "Work" that still holds the sub-folders.
- Deleting "Work › Clients" there is that client's "remove folder", which
  ungroups: those favorites go to the top level, not up to Work. This is the
  person's own action on that device, so it is outside the anti-goal about
  silent moves, but it differs from what the manager's Delete does.
- Either edit leaves the affected folder's order list pointing at a path
  that no longer matches, so it shows in the default order.

The newer desktop does not try to repair these; it cannot tell them from an
intended change. They end when each platform adopts the tree.

### 4. Import

- Both parsers return the full path for each entry, in source order.
  Chromium's roots keep their names as the first segment ("Bookmarks bar",
  "Other bookmarks", in the interface language as today), and an HTML file's
  folders are taken as written.
- A path over 100 characters puts the entry in the deepest ancestor whose
  path fits. The import status line says how many were placed higher for
  this reason.
- Import writes the layout so each folder it creates keeps the source's
  order. In a folder that already existed, imported children follow the
  existing ones.
- **Repair.** Today an entry whose address is already saved is skipped. New
  rule: if the saved favorite's folder equals (without case) the last segment
  of the entry's path, and the full path differs, the favorite moves to the
  full path. That is exactly where the old flattening put it. A favorite the
  person moved anywhere else is left alone. The status line reports how many
  were moved into their folders.
- The Arc import's single "Arc" folder and Bring open tabs are unchanged.

### 5. The Favorites sheet

> **Superseded on November 18, 2026.** The owner disliked the result overall
> (heavy card rows, cramped in the 900px sheet, hover-only controls, awkward
> everyday tasks), reviewed three rendered directions and chose the third:
> Favorites is a page of its own in a tab, like Chrome's bookmark manager.
> The header holds the title, a search across the top, New folder and
> import, and turns into the selection bar (×, count, Open all, Move to…,
> Remove) while rows are selected. The folder tree sits on the left; the open
> folder's contents are one plain list in a raised card, split by hairlines,
> with an always-visible ⋮ menu on every row (Open in new tab, Edit…,
> Pin/Unpin, Move to…, Move up/down, Remove) and the pin mark only; no
> select circles, no row ×, no hover-only Pin. Edit… opens a dialog with
> name, address and folder (a supporter's request of the same day; a new
> address is the old favorite tombstoned and the new one added in its place,
> and its Start Page pin follows). `blanc://bookmarks/` leaves
> `UTILITY_PAGES`; the sheet's Favorites links, the menu, `/favorites` and
> the ⌘L footer open or focus the tab (without reloading it), and the page
> hears `pages:bookmarks:changed` after any change made elsewhere. The page's
> markup stays a sheet page because Blanc for iPhone restyles that one;
> `bookmarks.js` switches it to the full page everywhere else. The Chromium
> fork copies this page from a pinned release and keeps it in its own sheet,
> so moving that pin needs the fork's sheet adapter updated. The text below
> is the November 16 design, kept as the record.

The sheet keeps its current styling (`body.sheet`, the warm Sunrise surface)
and its header actions. The list area becomes two panes.

```
Favorites                    [Search] [New folder] [Import ...]
+----------------------+-----------------------------------------+
| All favorites        | Work › Clients                          |
| v Work               | :: [folder] Acme                4 items |
|   v Clients    <sel> | :: Client portal     portal.example.com |
|       Acme           | :: Invoices         billing.example.com |
|   > Reference        | :: Style guide        brand.example.com |
| > Recipes            |                                         |
+----------------------+-----------------------------------------+
```

- **Left pane:** the folder tree with disclosure arrows, "All favorites" at
  the top (the top level). Which folders are open and which is selected are
  remembered per device in the page's `localStorage`.
- **Right pane:** the selected folder's sub-folders and favorites in one
  mixed order, with a breadcrumb. Opening a sub-folder row selects it in the
  tree. A favorite row keeps today's controls (open, pin to Start Page,
  remove).
- **Drag and drop:** drag rows in the right pane to reorder; drop a row on a
  folder in either pane to move it there; drag folders in the tree to reorder
  or re-parent them. Changes animate into place.
- **Without a pointer:** every row has a menu with Move to… (a folder picker
  listing paths), Move up and Move down, and folders add Rename, New folder
  inside and Delete. Arrow keys move through the tree and the list.
- **Several at once:** Ctrl/Cmd-click and Shift-click select several rows in
  the right pane; dragging, Move to… and Remove act on all of them.
- **Search:** a search field filters every favorite by title and address and
  shows a flat result list with each favorite's path. Reordering is off while
  a search is showing.
- **Narrow windows:** below the sheet's existing 720px breakpoint the tree
  collapses into a folder menu above the list.
- **Read-only mode** (`capabilities.editable` false) shows the tree and order
  with no editing controls.
- **Hosts without the tree.** The fork copies this page at its renderer pin
  (`SHEET_FILES` in `chromium/tools/island-renderer.mjs`) and serves it
  through its own bridge, which has none of the new calls. The page
  therefore draws the manager only when `capabilities()` reports `tree:
  true`, which the Electron app does. Without it the page keeps today's flat
  list and controls unchanged, so a fork pin move is never blocked on this
  work. The flat mode is removed once the fork adopts the tree.
- All new text goes through `copy/messages/en.json` with every language
  updated in the same PR.

### 6. Other surfaces

- **Favorites menu** (`favoritesMenuItems` in `main.js`): nested submenus in
  the manager's order, top-level favorites after the folders' separator as
  today.
- **`/save <folder>`:** the argument may be a path typed with `>` or `›`
  between names ("Work > Clients"). It matches an existing full path first,
  then a folder with that name if exactly one exists anywhere, and otherwise
  creates the path from the top level.
- **Start Page, Quick Switcher, Arc import, tab import:** unchanged.

### 7. Bridges and guards

- `window.bowserPages.bookmarks` gains the layout read and the new
  operations (create, move and delete a folder by path; reorder a folder's
  children). Each needs the preload, its `pages.js` handler limited to the
  `bookmarks` host, and `browser-api/bridges.json` changed together, then
  `npm run browser-api:build`.
- `spec/features.md` gets F63 (desktop) and a note under F9; the divergence
  register gets a new entry: phones and the fork show a nested folder as a
  flat folder named by its path until each adopts the tree.
- `spec/acceptance/` gets a feature file for nesting, ordering, import and
  repair.

### 8. Testing

- Unit tests for the pure modules: path parsing and limits, the tree's
  shown spelling, every folder operation, display order, layout merge and its cap.
- Sync round-trip tests with two simulated older clients: one that keeps
  only the known favorite fields and drops `favoritesLayout` (an older
  desktop), and one that keeps `favoritesLayout` whole by its clock (the
  iPhone and the fork). In both, no favorite or folder is lost, order
  returns, and the exchange settles: after a bounded number of passes
  neither side uploads again.
- Import tests: full paths from both sources, the over-length rule, source
  order, and repair (moves a flattened favorite, leaves a moved one alone).
- Acceptance scenarios for the sheet, plus a real-mouse drag check in a
  packaged build before release, since synthetic input has misled us on
  overlays before.

## My calls (for the owner to check)

1. The separator is `" › "`, and `›` is not allowed inside a folder name.
2. Start Page tiles do not change. In chat I proposed that the Start Page
   follow the manager's order; reading the code, tiles are chosen by pins and
   a limit, and re-sorting them would change existing Start Pages on update.
3. Chromium's root names ("Bookmarks bar", "Other bookmarks") stay as the
   first path segment on import, as Chrome's own manager shows them. The
   alternative, dropping them so the bar's folders become top-level, saves
   about 16 characters of the 100 but merges same-named folders from
   different roots.
4. Selecting several favorites at once is in the first version.
5. Deleting a folder never deletes favorites; contents move up one level.
6. The layout record is capped at 128 KB, which keeps a chosen order for
   roughly 10,000 favorites; past that, some folders fall back to the
   default order and the import says so.
7. Import does not create the source's empty folders.
8. This is F63 with its own divergence entry, and its release note and any
   website copy wait for the release that ships it.
9. A folder stays when its last favorite leaves; only Delete removes it.
10. Folder edits made on an older device or a phone act on one flat folder
    and do not reach sub-folders (section 3). The desktop documents this and
    does not try to repair it.
11. The page keeps today's flat list for hosts that don't report the tree
    (the fork, until it adopts it).
12. While an older desktop version and a newer one are both open on one
    account, they trade one settings upload about every 10 minutes until the
    older one updates.

Calls 9–12 came out of an independent read of this document against the
code, which also corrected two claims in the first draft: the iPhone and the
fork keep an unknown synced value instead of dropping it, and spelling is
now unified when the tree is built instead of by rewriting stored names.

## Left to the builder

- Module, file, IPC channel and message-key names beyond the suggestions.
- The exact serialized shape of the layout record, within the rules in
  section 3.
- Drag-and-drop mechanics and the animation, within the project's existing
  motion tokens.
- How the work splits into PRs. A natural order: paths and operations with
  their tests; the layout record and sync; import and repair; the sheet; the
  menu and `/save`.
