# Port the fork's Start Page widgets and Island backdrop to the Electron build

Date: 2026-11-18. Status: proposed, awaiting the owner's approval.

## Intent

The Chromium fork's Start Page moved ahead of the shipping Electron build on
November 13, 2026 (chromium/STATUS.md on `chromium/next`: V24, its follow-up,
V26, "Shortcuts is a choice", "Customize, redesigned", "Shortcuts stay clear of
the widget columns", "Favorites resizes too", "On your other devices,
redesigned", and "The Island's band continues the Start Page's wallpaper").
Those entries were marked "fork only" at the time. The owner now wants the
people on the Electron build to have the same page and the same seamless
wallpaper behind the Island, so the two builds look alike. The phones already
use the fork's page (D39).

## Goals

1. **One Start Page.** Billboard is the only layout. Ledger, Shelf and Tally
   leave the page, Customize and Settings.
2. **Optional widgets.** Favorites and On your other devices are switches in
   Customize. Sent to this device shows whenever something waits, as now.
   - On a window 1200 px or wider the cards sit in a column on each side of
     the page, clear of the header and footer. Narrower, the two columns sit
     side by side under the clock.
   - Each card has a grip: drag to reorder or to move to the other side, or
     use the arrow keys (Up/Down within a column, Left/Right across),
     announced to assistive technology.
   - Favorites and On your other devices resize by their bottom edge onto
     fixed sizes (240, 360, 480, 600, 720 px), with the fork's spring, the
     arrow keys, Home and End, and double-click or Delete to fit the column.
   - Favorites lists eight; given a size it lists all and scrolls inside.
   - On your other devices takes the fork's redesign: grouped under each
     device with a laptop or phone glyph, two-line rows, three tabs a device
     then "N more tabs" / "Show fewer", fades and a hover scrollbar.
3. **Shortcuts are a count.** A − / + stepper from 1 to 12 in Customize.
   Billboard draws only the sites it has, in centered rows of at most six,
   and says "N sites so far. More appear as you browse." when it has fewer
   than the count. A row holds only the tiles that fit between filled
   columns; when not even three fit, the columns go under the clock.
4. **Blocked line.** The line under the clock is the count alone
   ("121 ads blocked this week"). There is no chart widget (V26).
5. **Readable on any wallpaper.** Over your image or a Color fill the
   widgets are glass cards in the Island's material family. The date, the
   blocked line, tile names and group chips take whichever ink, light or
   dark, stands out more against the image right behind them, read from the
   image itself. The footer sits in a fade up from the bottom edge. The
   clock is unchanged.
6. **Customize redesign.** Two columns from 760 px wide (stacked when
   narrower): Widgets (skeleton preview tiles, gold outline when on),
   Shortcuts and Clock on the left; Wallpaper with every option it has today
   on the right. The popover never covers the clock or the line under it;
   it scrolls inside when it needs more room.
7. **Wallpaper behind the Island.** On a Start Page the strip's band paints
   its slice of the page's own wallpaper layers, so a photo or Sunrise runs
   behind the Island without a seam. It cross-fades with the page. With
   vertical tabs on, the rail keeps its solid surface (owner, 2026-11-18:
   top band only); the band paints only above the page.

## Non-goals

- V25 (Mahjong in place of the Patron pill). The Patron pill stays.
- Extension side panels as cards (the fork removed them).
- Fork-only plumbing in the diff: the profile importer hooks, pin-icon and
  top-sites epochs, group-failure UI, `blancStartDataReady`, installed
  browser-theme wallpaper, the preview notice.
- The website. Its four-layout copy and claim ledgers change in a separate
  website PR after a release ships this (`docs/marketing-claims.md`).
- Changing `newtabLayout` itself (see Constraints).

## Anti-goals

- Losing anyone's arrangement: a user who chose Ledger, Shelf or Tally gets
  the widgets that best match it, once.
- A band that visibly mismatches the page (a hard seam, a stale photo, a
  photo in a private window).
- A widget choice that follows the user to other devices. It is per device,
  like the fork's.
- Text that fails 4.5:1 contrast over pure black or pure white behind it.

## Constraints

- `newtabLayout` is a synced key (`SYNCED_KEYS` in `src/main/settings.js`),
  read by older Electron versions and sync peers. It stays stored, synced and
  validated as today; the new page only reads it once, for migration.
- New settings go through `settings-schema/schema.json` and `settings:build`,
  or `substrate:check` fails.
- New `pages:*` channels need `tab-preload.js`, the `pages.js` handler's host
  check (newtab only) and `browser-api/bridges.json` changed together, then
  `browser-api:build`.
- Every English string change updates de, es, fr, pt-BR and it in the same PR
  (`copy:ack`); `newtab.js` and `newtab.html` are guarded i18n files.
- Pages are served flat from `src/renderer/pages/` (no subfolders).
- The strip's CSP already allows `img-src blanc:`; nothing remote is added.
- Shared spec: F35 in `spec/features.md` and `newtab-layouts.feature` change
  to the one-page design.
- CLAUDE.md and AGENTS.md describe four layouts; update both.

## Approaches

**The page.** (a) Port the fork's page code: bring over the fork's edits to
`newtab.js` and `newtab.html` (about 740 changed lines) and the Start Page
rules in `newtab-prototype.css`, and replace the fork's native plumbing with
Electron's. (b) Rebuild in the Electron page's own style using the fork as
reference. The owner picked (a): behavior matches what the fork's tests
already proved, and the two pages stay close so later fork changes port
easily.

**The band.** (a) The page reports its wallpaper layers, main validates them
and the strip paints its slice (the fork's way, and Electron already sends
the strip a sampled page color). (b) Run the Start Page under the strip with
the floating-Island machinery. The owner picked (a): (b) changes every Start
Page's geometry and collides with the Linux redraw rule, Split View and
Glance.

## Design

### Delivery

Two PRs, in order: **PR 1** the Start Page (goals 1–6), **PR 2** the band
(goal 7). Each is releasable alone.

### PR 1: the widget setting

A device-local settings key `newtabWidgets`, never in `SYNCED_KEYS`, written
only through `settings.setNewtabWidgets()` (whole-value validation, like
`setLinkRoutes`), never through `pages:settings:set`. Pure rules in a new
`src/main/start-widgets.js` (no `require('electron')`), unit-tested:

```
{ v: 1,
  favorites: bool, devices: bool,
  shortcutCount: 1..12,               // default 6
  place: { left: [...], right: [...] },  // names: favorites, devices, sent
  sizes: { favorites?: 240|360|480|600|720, devices?: same } }
```

Validation follows the fork's handler (`blanc_prototype_ui.cc` widgets
section): unknown names, `chart` and `panels` are dropped; a repeated place
name is dropped; a missing card returns to its default side (favorites and
devices left, sent right); a size outside the five is dropped; 0 removes it.

**Migration**, once, when `newtabWidgets` is absent: Ledger → favorites +
devices; Tally → favorites; Shelf → favorites + shortcutCount 12;
Billboard or anything else → none. `v: 1` marks it done. (Billboard and
"never chose" both map to none, so the synced default needs no marker.)

**Bridge.** `bowserPages.start` gains `setWidget(name, on)`,
`setWidgetPlace(place)`, `setWidgetSize(name, size)` and
`setShortcutCount(n)`, each a `pages:start:*` channel allowed for the newtab
host only. `data()` and the existing status push carry `widgets`, so every
open Start Page follows a change at once (as the fork's do).

### PR 1: the page

- Port the fork's widget, Customize, devices, blocked-line, shortcut-count
  and clock-optical-centering hunks in `newtab.js` and `newtab.html`,
  dropping the out-of-scope hunks listed under Non-goals.
- The page always applies Billboard. The layout picker, Ledger's column,
  Shelf's grid and Tally's chart and their code go.
- The image-aware ink sampler moves from the fork's `newtab-adapter.js` into
  a new flat file `src/renderer/pages/newtab-ink.js` (pure page code; it
  reads the visible `.start-wallpaper-layer[data-wallpaper-image]`, which
  Electron's `newtab-wallpaper.js` already sets).
- The Start Page rules from `newtab-prototype.css` (widgets and rails,
  Customize columns and stepper, tray tokens and glass, ink, footer fade,
  devices, resize) move into `pages.css`. New tokens go through
  `tokens/tokens.json` where `tokens:check` guards them.
- Settings → General drops the New tab layout select; Customize holds the
  choices.
- The page stops sending `newtab_layout` telemetry (there is no choice left);
  the Worker keeps accepting it, so nothing breaks.

### PR 2: the band

- **Page:** report `{zoom, width, height, layers[≤4]}` when idle (40 ms
  debounce, deduplicated), each layer its computed `color`, `image`, `size`,
  `position`, `repeat`, `opacity` and `fade`; layer 0 is the body's
  background, then each `.start-wallpaper-layer`. Resend on mutation,
  color-scheme change, resize and visibility. Not sent from private pages.
- **Main** (`pages:start:backdrop`, newtab host only): reject the whole spec
  on any bad field (zoom 0.25–5, width and height 1–20000, 1–4 layers, each
  string ≤ 4096 characters, opacity 0–1). Allow images only from
  `blanc://newtab/` bundled wallpaper files and the current
  `user-wallpaper-*` URL from `src/main/wallpaper.js`. Reply with
  `{band}`: the strip height, or 0 when it stands aside (private tab, split, Glance over the page, auto-hide
  in either style, full screen, Match site colors off, not the active tab).
  Forward the spec to `stripSurfaces(runtime)` as `chrome:page-backdrop`, or
  `null` to fall back to the sampled color. Turning Match site colors on or
  off asks every open Start Page again.
- **Page, on the reply:** set `--island-band-h` and `data-island-band`,
  laying its wallpaper out from the band's top (the layers and a fixed
  `body::before` copy of the body background start that far above). No
  horizontal offset: the rail is not painted.
- **Strip:** a `#bandBackdrop` of up to four layers under the pill, sized to
  the page plus the band and clipped to the band above the page (beside
  the rail when vertical tabs are on; the rail keeps `var(--bg)`), cross-fading
  2 s (none under reduced motion); the strip is transparent while it paints.
  Main skips the top-rows color sample for a Start Page with a backdrop.

### Tests

- Unit: `start-widgets.js` (validation, migration, defaults); the tray and
  footer contrast rule (port `start-plates.test.mjs`); backdrop validation.
- Acceptance: rewrite `newtab-layouts.feature` and its steps to the one-page
  design, using the fork's V24 replacement steps
  (`chromium/tests/lib/start-widgets.mjs`) as the guide; update F35.
- Desktop checks ported from the fork's `native-start-widgets.mjs`,
  `native-start-devices.mjs` (PR 1) and `native-island-backdrop.mjs` (PR 2),
  including a seam measurement across the band's last row and the page's
  first.
- Hand check in a dev run: Sunrise, a Color fill and a photo, light and dark,
  vertical tabs on and off.

## Calls made in writing this up (the owner can overturn any)

- **Convergence:** keep the fork's page close to Electron's. Use the fork's
  bridge call signatures as its page calls them (for example
  `setWidgetPlace(left, right)`, not a single object) and its string keys
  (`start.widgets.*`, `start.shortcuts.*`, `start.devices.*`,
  `start.billboard.blocked`) with the five translations the fork already
  has. Fork-only paths are deleted from Electron's copy, not feature-gated:
  the fork keeps its own pinned copy, so nothing needs to load the same
  file yet.
- **Mahjong link text:** the footer link reads "Play Blanc Mahjong"
  (`start.mahjong.play`, recorded under V24); its place and look stay as
  shipping has them, since V25 is out.
- **Window controls over a photo (Windows and Linux):** the strip already
  switches its controls to light ink over a dark sampled color
  (`tint-dark`). With a backdrop, main sends the band's average color with
  the spec so the same rule applies.

## Left to the builder

- Exact function boundaries when porting the fork's hunks, and how to share
  the image sampling between ink and anything else.
- Where the strip's `#bandBackdrop` sits in `index.html` relative to the
  float views (float style stands aside, so float copies need nothing).
- Whether the strip loads wallpaper images directly by `blanc://` URL or
  receives them already validated from main.
