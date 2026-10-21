# Pinning on every Start Page layout

**Date:** 2026-10-21
**Status:** draft for owner review. On 2026-10-21 the owner asked for pinning on all four layouts, not only Billboard. The owner checks in §5 are open.
**Builds on:** [2026-10-05 start page layouts polish](2026-10-05-start-page-layouts-polish-design.md) (Billboard's one row of six, short site names, the hover ×), F35 in `spec/features.md`.

## 1. Why

A support email on 2026-10-21 asked for "an option to pin the shortcuts that are saved on the home screen. Other browsers have this feature." Firefox and Edge let people pin a shortcut so it stays put.

- **Billboard**, the default layout, fills its six tiles from local history ranked by visit count. They move as browsing changes, and the only thing a person could do to a tile was hide it.
- **Ledger, Shelf and Tally** show Favorites, but only the first 6, 8 and 5 in Favorites order, which is oldest first. Once someone has more favorites than a layout shows, the newer ones never reach the Start Page, and nothing lets them choose which do.

## 2. Billboard: pinned sites

- Each tile gets a pin button on its top-left corner, mirroring the × on the top-right. Like the ×, it appears on hover and focus, and always on touch screens.
- Pinning a site moves it to the front of the row. Pinned sites lead in the order they were pinned. The rest of the row follows the ranking as before, minus hidden and pinned sites.
- A pinned tile's pin stays on show and is filled, so the row says which sites hold their place. Clicking it unpins the site, which goes back to its ranked place (or off the row if it no longer ranks in the top six).
- At most six sites can be pinned: one row's worth. With six pinned, no ranked sites show. On windows under 640px wide only the first four tiles show, as today.
- Hiding a pinned site (its ×) unpins it and hides it. Pinning a hidden site unhides it. A site is never both.
- While a pinned site still ranks in history, its tile draws exactly as an unpinned one would: the most recently visited page, its title, its cached icon. When history no longer holds the site (cleared, or aged out of the 5,000-entry cap), the tile stays, shows the domain's letter and name, and opens the site's origin.
- Private Billboard tabs show no sites and no pins, as today.

## 3. Ledger, Shelf and Tally: pinned favorites

- Each favorite gets a pin beside its link (a button can't sit inside a link): at the end of a Ledger or Tally row, and in a Shelf card's top-right corner, which is otherwise empty. It shows on hover and focus, and stays on show, filled, once pinned. It is the same round badge as Billboard's.
- The three layouts share **one** list of pinned favorites. Pinned favorites come first, in the order they were pinned; the rest keep their Favorites order. So a favorite pinned on Shelf (eight tiles) also leads Tally (five) and Ledger (six), which is how a newer favorite gets onto a smaller layout.
- At most eight favorites can be pinned, Shelf's tile count. A layout that shows fewer draws the first pins that fit.
- Deleting a favorite drops its pin the next time a Start Page loads.
- Hovering a Shelf card's pin keeps the card lifted and outlined, as hovering the card does.
- Private start pages draw favorites in their Favorites order, without pins (see §4).

## 4. Shared behavior, data and privacy

- Focus follows the item: after pinning, focus lands on the pin of the item now at the front; after unpinning, on the item's new place, or the slot it left if it dropped off the layout. A polite live region announces "{title} pinned to Billboard." / "{title} pinned to the Start Page." and the matching unpinned messages.
- All pins are kept in the profile's `blanc://newtab` localStorage, beside the existing hidden list (`blanc.billboard.hidden-top-sites.v1`). Named profiles get their own lists, because their start pages run in their own sessions.
  - Site pins: `blanc.billboard.pinned-top-sites.v1`, entries `{ key, url }`, the hostname key that main's `top-sites.js` uses and the http(s) **origin**. No path, query, title or icon, so a site pin keeps no more browsing detail than the hidden list does. Each entry is re-derived from its URL on read. An entry whose key doesn't match its own origin, a non-http(s) URL, a repeat, or anything past six is dropped.
  - Favorite pins: `blanc.start.pinned-favorites.v1`, an array of the favorites' own URLs, bounded and de-duplicated. Each one is only a lookup key into the Favorites main already serves, never a link target.
- Nothing new crosses IPC. There is no new `pages:*` channel, no main-process store, no Sync and no telemetry. The page never contacts a site or a favicon service to draw a pinned tile.
- Pins survive clearing history, the same way the hidden list does. They are a deliberate choice, like a Favorite.
- **Limit of page storage:** a private start page runs in the private session, whose storage is separate and ephemeral, so it can't see the pins. Billboard shows nothing there anyway. Ledger, Shelf and Tally show favorites there in plain Favorites order, with no pin buttons, so nothing pinned in a private tab can silently vanish.

The pure rules live in `src/renderer/pages/start-pins.js` (`pinFor`, `readPins`, `addPin`, `removePin`, `billboardSites`, `readFavoritePins`, `addFavoritePin`, `removeFavoritePin`, `livingFavoritePins`, `favoriteTiles`), served flat and tested in a vm (`test/unit/start-pins.test.js`), the same pattern as `start-site-name.js`.

## 5. Owner checks

1. **Pins lead**, rather than holding the slot where they were pinned (Firefox's model). Leading matches how pinned tabs lead their group in Blanc, and it is predictable with five to eight tiles.
2. **The pinned marker stays on show.** Without it, nothing explains why a tile no longer moves.
3. **Pins outlive clearing history.** The alternative is to clear pins with history. That would make pinning useless to anyone who clears history often.
4. **One favorites pin list across Ledger, Shelf and Tally**, capped at eight.
5. **Only favorites a layout already shows can be pinned from it.** A favorite beyond Shelf's eight can't be reached from any Start Page. Pinning it from the Favorites page (and showing pins on private start pages) needs a small device-local store in main with a new guarded `pages:*` channel, because the Favorites page is a different origin from the Start Page. This change leaves that out.
6. **No drag to reorder pins.** Unpinning and re-pinning changes the order.

## 6. Tests

- `test/unit/start-pins.test.js`: origin-only site pins, read-time sanitizing, the six- and eight-pin caps, row and tile order, a site pin history no longer holds, a deleted favorite's pin.
- `test/unit/newtab-top-sites.test.js`: the Billboard row comes from `billboardSites`, both pin lists are written only to page storage and read nothing in private tabs, and no pin channel exists in the preload or `pages.js`.
- `spec/acceptance/newtab-layouts.feature` (`@F35-5`): Billboard pin and unpin; a site pin that outlasts clearing history until it is hidden; a favorite pinned on Shelf that leads Shelf, Ledger and Tally, is stored as its URL, and returns to Favorites order when unpinned.
