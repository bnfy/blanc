# Start Page pins

**Date:** 2026-10-21
**Status:** draft for owner review. On 2026-10-21 the owner asked for pinning on all four layouts, then for "Pin to Start Page" on the Favorites page and in the tab right-click menu, and then decided three checks: a Billboard pin keeps the page last visited, pins sync, and the limit stays at eight for now. The remaining owner checks in §6 are open.
**Builds on:** [2026-10-05 start page layouts polish](2026-10-05-start-page-layouts-polish-design.md) (Billboard's one row of six, short site names, the hover ×), F35 in `spec/features.md`.

## 1. Why

A support email on 2026-10-21 asked for "an option to pin the shortcuts that are saved on the home screen. Other browsers have this feature." Firefox and Edge let people pin a shortcut so it stays put.

- **Billboard**, the default layout, fills its six tiles from local history ranked by visit count. They move as browsing changes, and the only thing a person could do to a tile was hide it.
- **Ledger, Shelf and Tally** show only their first 6, 8 and 5 Favorites in Favorites order, which is oldest first. Once someone has more Favorites than a layout shows, the newer ones never reach the Start Page, and nothing let them choose which do.

## 2. One list, four ways in

There is one list of **Start Page pins**: up to eight pages, each an http(s) URL and a name. Every layout draws the pins first. Pins can be added from four places:

| Where | What it pins |
|---|---|
| A Billboard tile's pin (top-left, opposite the ×) | The page the tile opens, the site's page visited last, under that page's title (owner decision, 2026-10-21). |
| A favorite's pin on Ledger, Shelf or Tally (end of a row; a Shelf card's top-right corner) | That favorite's URL and title. |
| The Favorites page: **pin** / **unpin** beside **move ▸** and **remove** | That favorite's URL and title. |
| The tab right-click menu: **Pin to Start Page** / **Unpin from Start Page**, right after **Save to Favorites** | The tab's URL and the name it shows (its custom name if renamed). The same pages Favorites take: never a private tab, only http(s). Disabled for a new pin when all eight are taken, but always available to unpin. |

Because pins can come from a tab or the Favorites page, they must reach whichever layout someone uses (Billboard is the default). That rules out separate Billboard and favorites lists.

## 3. How each layout draws them

- **Billboard:** pins first, in pin order, then the ranked sites minus hidden sites and any site a pin already covers (by hostname). A pinned tile can be unpinned but not hidden; only ranked tiles keep the ×. A pin shows even when history no longer holds the site, or the site is hidden.
- **Ledger, Shelf, Tally:** pins first, in pin order, then the Favorites that aren't pinned, in Favorites order. A pinned page that is a Favorite draws as that Favorite. A pinned page that isn't one (from a tab or a Billboard tile) draws from the pin's URL, name and icon.
- Each layout shows as many as it has room for: Billboard and Ledger six, Shelf eight, Tally five.
- A pinned tile's pin stays on show and is filled. An unpinned tile's pin shows on hover and focus, and always on touch screens.
- Focus follows the item: after pinning, focus lands on the pin of the item now at the front; after unpinning, on the item's new place, or the slot it left. A polite live region announces "{title} pinned to the Start Page." and the matching unpinned message.
- The Favorites page shows a small pin mark beside a pinned favorite's date at rest. Its **pin** button is disabled, with an explaining tooltip, when all eight pins are taken.
- Open Start Pages and an open Favorites page redraw when the list changes anywhere. A notice that brings nothing new leaves the page and its focus alone.
- **Private start pages** draw the pins, the way they draw Favorites, but show no pin buttons and can't change the list. Main refuses `pin`/`unpin` from a private tab's start page. Private Billboard still shows no tiles at all.

## 4. Data and privacy

- Main keeps the list in a `scope: 'profile'` `JsonStore`, `start-page-pins.json` (`src/main/start-page-pins.js`). Personal's is at the userData root; a named profile's is under `profiles/<id>/` and is removed with that profile.
- It is not in telemetry, and it is kept when history is cleared, like Favorites.
- **Sync** (owner decision, 2026-10-21). Profile Sync carries the Personal profile's list, as Sync carries only Personal.
  - The list rides inside the end-to-end-encrypted settings payload as one more clocked value, `startPagePins` in `values`/`meta`/`tieBreakers`. The v1 Worker accepts only its four store names, so a new store would need a Worker deploy; this avoids one.
  - The list is one value with one clock. A local pin or unpin stamps a clock past any seen (`nextSyncWriteTimestamp`) and schedules a sync. A peer's list wins whole when its clock is newer; an equal clock is settled by the settings tie-breaker. So two devices changing pins offline keep the later device's list.
  - A merged change redraws open pages. A value this version can't read still advances the clock, so it can't win every pass.
  - A Blanc that predates pins drops the value when it uploads settings. `syncPayloadEquals` then sees the blob lacking it, and the next newer device uploads it again, as with device names.
- Each pin is `{ url, title }`. The URL must be http(s) and at most 4,096 characters; the name is trimmed to 200, falling back to the host. Saved pins are re-sanitized on read, and repeats and anything past eight are dropped.
- When listed, each pin gets an icon already held locally: its Favorite's, else its site's from the history icon cache. The page never fetches a site or a favicon service.
- Channels (guarded, in `browser-api/bridges.json`, hosts `newtab` and `bookmarks` only):
  - `pages:pins:list`
  - `pages:pins:pin` (url, title) → `{ ok, reason? }`
  - `pages:pins:unpin` (url)
  - main → page `pages:pins:changed`. It carries no data, so each page re-reads its own profile's list.
- The tab menu reads and writes the store in main. It needs no channel.
- The Billboard's hidden-site list is unchanged: hostnames only, in the profile's `blanc://newtab` localStorage.

## 5. What changed from the first draft

The first two commits of this PR kept pins in the Start Page's own localStorage, as separate Billboard and favorites lists. That couldn't serve the tab menu (main) or the Favorites page (another origin), and private start pages couldn't see it. Nothing had shipped, so it was replaced outright; there is nothing to migrate.

## 6. Owner checks

Decided on 2026-10-21:
- A Billboard pin keeps the page last visited.
- Pins sync.
- The limit stays at eight for now.

Still open:
1. **Pins lead**, rather than holding the slot where they were pinned (Firefox's model). Leading matches how pinned tabs lead their group in Blanc.
2. **One list across all four layouts.** A layout with fewer tiles shows the first pins that fit.
3. **The newest change to the list wins whole** in Sync, rather than merging pin by pin.
4. **Pins outlive clearing history.**
5. **A pinned Billboard tile can't be hidden**, only unpinned.
6. **Private start pages show the pins read-only.**
7. **No drag to reorder pins.** Unpinning and re-pinning changes the order.

## 7. Tests

- `test/unit/start-page-pins-store.test.js`: sanitizing, the cap, idempotent pinning, change notices, the Personal and named-profile files, and the sync clock (no export before a change, newer wins, equal clocks converge, unreadable values advance the clock).
- `test/unit/sync-start-page-pins.test.js`: two devices through the settings payload, the no-op upload skip, and repair after an older Blanc drops the value.
- `test/unit/start-pins.test.js`: Billboard and favorites-layout order, site keys, and change detection.
- `test/unit/tab-context-menu-model.test.js` and `tab-context-menu-runner.test.js`: the menu item's label, place, enabled rules and dispatch.
- `test/unit/newtab-top-sites.test.js`:
  - hiding stays in page storage;
  - pins only go through `pages:pins:*` for the two pages;
  - private start pages can't change pins.
- `spec/acceptance/newtab-layouts.feature` (`@F35-5`):
  - Billboard pin and unpin;
  - a site pin that outlasts clearing history;
  - a favorite pinned on Shelf leading Shelf, Ledger and Tally;
  - the tab menu pinning a page that an already-open Start Page then leads with;
  - the Favorites page pinning a favorite that a new Start Page leads with.
