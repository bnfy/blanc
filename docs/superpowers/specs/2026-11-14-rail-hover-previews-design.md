# Rail hover previews (Chromium fork, vertical tabs)

Date: 2026-11-14. Branch: `chromium/next`. Status: layout A picked by the owner;
this document awaits approval.

## Why

With vertical tabs, the rail shows a favicon and a clipped title per tab, and a
collapsed group shows only its name. Telling tabs apart means clicking through
them. A picture of each page on hover lets people find the tab they want
before they switch, and lets them see inside a collapsed group without opening
it. The idea comes from another browser's hover previews; Blanc copies the
interaction only, not that browser's look, and makes no public claim about the
feature until a release ships it.

## Goals

- Resting on a tab row in the rail shows a card beside the rail: the tab's
  title, its address (host) and a picture of the page.
- Resting on a collapsed group's header shows a list card of that group's tabs;
  resting on a row in that list shows the picture card next to the list.
- Moving between rows never flickers: once a card is up, the next row's card
  replaces it at once.
- Works in Light and Dark, Sunrise and Neutral, and in private tabs.
- Costs nothing while nobody hovers: Blanc asks for no captures and runs no
  timers or network requests. Chromium's own thumbnails (a small picture
  taken as a tab goes to the background, kept in memory) are switched on for
  this; see "Tab thumbnails on macOS".

## Non-goals

- The Island layout (pill dots, ⌘L panel) is unchanged; dots already bloom
  into site icons.
- No live page in the card. A live, usable page over the current one is
  Glance; side by side is Split View. A hover card is a still picture and never
  takes focus.
- No change to the shipping Electron app or its renderer files beyond one
  declared fork edit (below).
- No Android work.

## Anti-goals (failure even if it "works")

- Waking a quiet tab, or loading a restored tab, just because the pointer
  passed over it.
- Cards popping up while the person is simply moving to click a row.
- A card covering the rail or the row being clicked.
- Blanc asking for, showing or keeping a picture of a private tab. (Chromium
  already holds an in-memory picture of a backgrounded tab, private ones
  included, and drops it with the tab; that is existing behavior and is not
  changed here. Stopping it for private tabs would be a separate upstream
  patch.)
- Any picture written to disk, Sync, session files or crash reports.

## Approaches considered

- **A. Two cards (picked by the owner, 2026-11-14).** The group's list card sits
  beside its header; the picture card sits beside the hovered list row. The
  list never moves under the pointer. Covers roughly 800px of the page next to
  the rail while both are up.
- B. One card with a fixed picture area on top of the group list. Covers less
  of the page, but the card is always tall.
- C. Picture grid: the group card shows all its tabs as small pictures. One
  step, but each picture is small and it asks Chromium for several hidden-tab
  captures at once.

## What exists today (checked at 57e3109dd)

- The fork's Island is one host page (`blanc/island/host.html`, `host.js`)
  holding frames: the strip with the rail (`index.html` running shipping's
  `vertical-tabs.js`), the overlay, the Glance card, the float pill. In the
  vertical layout the host's native view covers the whole window but takes
  clicks only in the rail column and in `interactive_bounds`
  (`IslandView::DoesIntersectRect`, `blanc_prototype_ui.cc`).
- Rail rows (`.vertical-tab-row`, primary button `.vertical-tab-primary` with
  `data-tab-id`), split rows (`.vertical-split-row`, `data-split-id`) and group
  sections (`.vertical-tabs-group`, `data-group-id`, `data-collapsed`). Each
  row's button carries a native `title` tooltip and long titles scroll on hover.
- Hover behavior elsewhere is pill-only: hover-open, the approach swell, dot
  bloom. `hover-panel-leave.js` is the ⌘L panel's 200ms leave grace.
- Chromium's own hover card (`TabHoverCardController`) is unused because the
  tab strip is hidden. `ThumbnailTabHelper` is created for every tab only
  while `features::kTabHoverCardImages` is on (`TabFeatures::Init`), and
  Chromium 158 leaves that off on macOS (found while building, below).
- The tab snapshot already carries `private`, `asleep`, `title`, `url`,
  `favicon`, `pinned`, `groupId`, and group `collapsed`.

## Design

### Where it lives

- `blanc/island/rail-hover.js` (new, fork-owned, loaded by `host.html`): the
  hover state machine, kept pure (no DOM) like `hover-panel-leave.js` so
  `node --test` can drive it.
- `blanc/island/rail-hover-card.js` + styles in `host.css` (new): the two
  cards as plain elements in the host document, positioned beside the rail.
  They are not iframes.
- `host.js` hooks pointer and focus events on the strip document's rail (as it
  already does for hover-open) and feeds the state machine.
- Native: `blanc_prototype_ui.cc` gains a thumbnail request and a hit rect for
  the list card (below). No upstream Chromium file changes are expected except
  for the setting (see Open question).
- One declared edit in `tools/island-renderer.mjs` `EDITS['vertical-tabs.js']`:
  rows keep their `title` attribute out while previews are on, so the system
  tooltip and the card never show together. (Exact anchor is the builder's
  call; it must occur once, per the tool's rule.)

### Timing

- Open: the pointer rests on a row for 500ms (timer restarts on entering
  another row). Keyboard focus on a row (`:focus-visible`) opens after the same
  500ms.
- Swap: while a card is up, entering another row swaps the card's contents at
  once (no delay, no fade). The picture area keeps its size; a new picture
  replaces the old when it arrives. With the keyboard, the rail's own row keys
  (ArrowUp/ArrowDown, Home/End, which move its single tab stop) swap the card
  the same way.
- Leave: leaving the rail starts a 150ms grace. Entering the list card within
  it keeps both cards; otherwise both close.
- Close at once on: a click or press anywhere, a scroll of the rail, any key
  other than the rail's row keys above, a drag starting, the window losing focus,
  the rail resizing, a tab switch, and any Island surface opening (panel,
  palette, Find, shield, Spaces, group menu, sheet, Settings, a permission
  prompt, the extensions panel, the pane menu).
- None at all while a Glance card is open, while a drag is in progress, or
  while the rail is collapsed or hidden.
- Reduce motion: cards appear and disappear without any slide; otherwise a
  120ms fade in, no exit animation (shipping's Glance rule: a closing card
  is gone at once).

### The picture card (any tab row)

- About 280px wide: title (up to 2 lines), host below in the dim color, then a
  16:10 picture area. Title is page data (`data-i18n-ignore`).
- Placed 8px right of the rail, vertically centered on the row and clamped
  inside the window. Beside a list row, it sits 8px right of the list card.
- Pointer-transparent (`pointer-events: none`): it never takes clicks, so the
  page under it keeps working.
- Picture by tab state:
  - Awake background tab: Chromium's thumbnail (below), or the placeholder
    until it arrives.
  - Current tab, and visible split panes: no picture (the page is already in
    view); title and host only.
  - Quiet tab (`asleep`): its last capture if Chromium kept one, marked with
    shipping's quiet string (`rail.state.quiet`); else the placeholder. Never
    subscribes, so it never loads the tab.
  - Private tab: never a picture; title, host and shipping's private string
    (`rail.state.private`) on the private look.
  - Blanc's own pages (Start Page, sheets): title only with the placeholder.
- Placeholder: the tab's favicon, large, centered on the card's surface tint.
- Split row: one card with each pane's picture side by side (each pane follows
  the rules above), titled with the split's own label.

### The list card (collapsed group header)

- Only for collapsed groups: an open group already lists its tabs in the rail.
- About 220px wide: the group name (and color dot if the group has one), then
  one row per tab (favicon + title), the same row height as the rail. At most
  12 rows; more scroll inside the card.
- Placed 8px right of the rail, top aligned with the header, clamped inside
  the window.
- Takes the pointer: its rectangle is added to the host's click area while it
  is up. Resting on a row opens the picture card beside it with the same rules
  as the rail (500ms first, then instant swaps). Clicking a row opens the
  group and switches to that tab, as ⌘1–9 does for a collapsed group, so the
  current tab is never hidden behind a folded header; both cards close. Nothing else is clickable in it: no close
  buttons, no menus, no drag.
- It is a pointer convenience only; it isn't in the tab order and is hidden
  from assistive tech. Keyboard users reach the same tabs by expanding the
  group.

### Thumbnails (native)

- New host request `tabThumbnail(tabId)` in `blanc_prototype_ui.cc`, replying
  `{image: "data:image/jpeg;base64,…" | null}`:
  - private tab (`blanc::private_tabs::IsPrivateTab`) → null, without touching
    the thumbnail;
  - no `ThumbnailTabHelper::From(tab)` → null;
  - asleep (discarded, or not live and `NeedsReload()`) → the thumbnail's
    existing compressed data if Chromium exposes it without subscribing, else
    null. Must not subscribe: subscribing calls `LoadIfNecessary()` on a tab
    that isn't discarded, which would load a restored tab;
  - otherwise subscribe (`ThumbnailImage::Subscribe()`,
    `SetCompressedImageCallback`, `RequestCompressedThumbnailData()`) and reply
    with the first data, or null after 300ms.
- While the picture card shows an awake tab, the host keeps that one
  subscription (`watchThumbnail(tabId)` / `unwatchThumbnail()`), so a capture
  Chromium takes meanwhile arrives as an `onTabThumbnail` event. At most one
  subscription per window; it ends when the card closes or moves to another
  tab, and on tab close.
- Chromium's thumbnail is JPEG in memory. The fork base64-encodes it only for
  the reply; neither side stores it. The host keeps at most the current card's
  image and drops it on close.
- The host's request allowlist and codec (`browser-api-codec.js`, the method
  list near line 7703) are updated the way other host requests are.

### Click area (native)

- A new `hover_card_bounds` rect on the window owner, set by a host request
  (or an extension of `geometry`; builder's call), included in
  `IslandView::DoesIntersectRect` in both branches. Empty unless the list card
  is up. The picture card never adds to it.

### Accessibility

- Cards are `aria-hidden` and never focused: each rail row's label already
  carries its title and states (current, private, quiet, playing, muted).
- Escape closes any card without doing anything else; it is consumed only
  when a card was up.
- Keyboard focus opens the picture card (same delay) so sighted keyboard
  users get the picture too.

### Look

- Cards use the Island panel's surface, border, radius and shadow tokens from
  `styles.css` (`--surface-raised`, `--border`, `--island-panel-radius`,
  `--shadow-popover`), so they follow Light/Dark and Sunrise/Neutral like the
  panel does. Private tabs use the private theme's tokens.
- Instrument Sans as elsewhere in the Island; the picture has a 1px hairline
  and the panel's inner radius.
- No Crest-like styling: no frosted gradients, no large search field.

### Tab thumbnails on macOS (owner, 2026-11-14)

Chromium 158 declares `kTabHoverCardImages` disabled by default on macOS
(`chrome/browser/ui/ui_features.cc`); Google turns it on for Apple Silicon
Macs through the `TabHoverCardImagesMacArm` field trial, which Blanc doesn't
receive. Without it no tab has a `ThumbnailTabHelper`, so there would be no
pictures. The owner chose to switch it on: patch 0084 makes the feature on by
default in Blanc builds on every platform. Cost: Chromium takes a small
picture as each tab goes to the background and keeps it in memory (tens of
KB per tab). Its only other users, Chromium's own hover card and its Settings
row, are hidden in Blanc.

## Constraints

- Fork rules: work on `chromium/next`, merge `main` in, never rebase or
  force-push; no change to the Electron app; build only through
  `chromium/tools/apply.py` then `chromium/tools/build.mjs`, never cold; no
  build or Mac Studio work until Blanc Beta 2.0.0-beta.4 is published.
- `tools/island-renderer.mjs --check` must still pass (the vertical-tabs edit
  is declared there, not hand-made in the generated file).
- New upstream patches (if the setting needs one) stay within the owner's
  October 21 patch-budget direction: record fresh totals in `STATUS.md`.

## Open question for the owner

- **A Settings switch.** Chromium offers a switch for its hover pictures.
  Blanc's Settings strings are generated from shipping's catalogs, which have no
  words for this, so a switch now means either an English-only label in every
  language until shipping carries the copy, or waiting. Options:
  1. No switch in this first version: always on with vertical tabs; the 500ms
     rest keeps it out of the way. A switch follows when shipping has copy.
  2. A switch now (Settings → Appearance, beside the vertical-tab text size),
     on by default, English label in every language for now.

## Verification

- `node --test` on the new pure state machine (open delay, swap, grace,
  closers, Glance and surface suppression, keyboard), next to the fork suite:
  `node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs`.
- `chromium/tools/island-renderer.mjs --check`, `chromium/tools/check-patches.py`.
- A syntax-only compile of the changed C++ with out/BlancBeta's flags.
- After beta.4 is published: an incremental Mac Studio build and an on-screen
  check (both themes, private tab, quiet tab, collapsed group, split row).

## Calls made after the builder check (owner may correct)

- Chromium's existing in-memory captures (including private tabs) are left
  as they are; Blanc only never asks for, shows or keeps private pictures.
- Clicking a tab in a collapsed group's list card opens the group, like ⌘1–9.
- The rail's arrow/Home/End keys swap the card; Tab leaves the rail and
  closes it.

## Left to the builder

- Exact sizes within the ranges above, the vertical-tabs edit's anchor, whether
  the click rect is its own request or part of `geometry`, and test names.
