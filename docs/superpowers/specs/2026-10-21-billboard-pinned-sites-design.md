# Pinned sites on the Billboard start page

**Date:** 2026-10-21
**Status:** draft for owner review. The owner checks in §4 are open.
**Builds on:** [2026-10-05 start page layouts polish](2026-10-05-start-page-layouts-polish-design.md) (Billboard's one row of six, short site names, the hover ×), F35 in `spec/features.md`.

## 1. Why

A support email on 2026-10-21 asked for "an option to pin the shortcuts that are saved on the home screen. Other browsers have this feature." Billboard is the default layout. Its six tiles come from local history ranked by visit count, so they move as browsing changes, and the only thing a person can do to a tile is hide it. Firefox and Edge let people pin a shortcut so it stays put. Ledger, Shelf and Tally already show Favorites ("Favorite a page with ♥ to pin it here"); Billboard had no way to keep a site in its row.

## 2. Behavior

- Each Billboard tile gets a pin button on its top-left corner, mirroring the × on the top-right. Like the ×, it appears on hover and focus, and always on touch screens.
- Pinning a site moves it to the front of the row. Pinned sites lead in the order they were pinned. The rest of the row follows the ranking as before, minus hidden and pinned sites.
- A pinned tile's pin stays on show and is filled, so the row says which sites hold their place. Clicking it unpins the site, which goes back to its ranked place (or off the row if it no longer ranks in the top six).
- At most six sites can be pinned: one row's worth. With six pinned, no ranked sites show. On windows under 640px wide only the first four tiles show, as today.
- Hiding a pinned site (its ×) unpins it and hides it. Pinning a hidden site unhides it. A site is never both.
- While a pinned site still ranks in history, its tile draws exactly as an unpinned one would: the most recently visited page, its title, its cached icon. When history no longer holds the site (cleared, or aged out of the 5,000-entry cap), the tile stays, shows the domain's letter and name, and opens the site's origin.
- Focus follows the site: after pinning, focus lands on the pin of the site now at the front; after unpinning, on the site's new place, or the slot it left if it dropped off the row. A polite live region announces "{title} pinned to Billboard." or "{title} unpinned from Billboard."
- Private Billboard tabs show no sites and no pins, as today.

## 3. Data and privacy

- Pins are stored in the profile's `blanc://newtab` localStorage under `blanc.billboard.pinned-top-sites.v1`, beside the existing hidden list (`blanc.billboard.hidden-top-sites.v1`). Named profiles get their own lists, because their start pages run in their own sessions.
- Each pin is `{ key, url }`: the hostname key that main's `top-sites.js` uses, and the http(s) origin. No path, query, title or icon is stored, so a pin keeps no more browsing detail than the hidden list does. On read, each entry is re-derived from its URL. An entry whose key doesn't match its own origin, a non-http(s) URL, a repeat, or anything past six is dropped.
- Nothing new crosses IPC. There is no new `pages:*` channel, no main-process store, no Sync, and no telemetry. The page never contacts a site or a favicon service to draw a pinned tile.
- Pins survive clearing history, the same way the hidden list does. They are a deliberate choice, like a Favorite.

The pure rules live in `src/renderer/pages/billboard-pins.js` (`pinFor`, `readPins`, `addPin`, `removePin`, `billboardSites`), served flat and tested in a vm (`test/unit/billboard-pins.test.js`), the same pattern as `start-site-name.js`.

## 4. Owner checks

1. **Pins lead the row**, rather than holding the slot where they were pinned (Firefox's model). Leading matches how pinned tabs lead their group in Blanc, and it is predictable with only six tiles.
2. **The pinned marker stays on show.** Without it, nothing explains why a tile no longer moves. The glyph is the ⌘L panel's pin, at the ×'s size and weight.
3. **Pins outlive clearing history.** The alternative is to clear pins with history. That would make pinning useless to anyone who clears history often.
4. **Billboard only.** Ledger, Shelf and Tally draw Favorites, which already stay put. Choosing which Favorites those layouts show, or reordering them, is a separate request.
5. **No drag to reorder pins** in this change. Unpinning and re-pinning changes the order.

## 5. Tests

- `test/unit/billboard-pins.test.js`: origin-only pins, read-time sanitizing, the six-pin cap, row order, a pin history no longer holds.
- `test/unit/newtab-top-sites.test.js`: the row comes from `billboardSites`, pins are written only to page storage, and no pin channel exists in the preload or `pages.js`.
- `spec/acceptance/newtab-layouts.feature` (`@F35-5`): pin and unpin; a pin that outlasts clearing history until it is hidden.
