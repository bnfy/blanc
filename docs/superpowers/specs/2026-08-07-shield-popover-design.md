# Shield chip → site-protection popover

**Date:** 2026-08-07
**Status:** Approved design, pre-implementation
**Decided with:** visual-companion mockups (interaction model, popover anatomy, chip-at-rest), selections recorded in the brainstorm session

## Overview

The island pill's shield is today a passive count chip: hidden at 0, an accent
count while blocking, a struck-through 0 when the site is allow-listed (v1.0.7,
PR #69). This design turns it into Blanc's version of Brave's shield button —
a clickable chip that opens a small site-protection popover with one toggle,
scoped strictly to the current site.

**Click scope decision:** site-only. Nothing reachable from the pill can flip
ad blocking globally; global stays in Settings and `/block-ads`.

## Goals

- The shield reads as *ad/tracker protection for this site*, not as an
  unexplained number.
- One obvious control: allow ads here / re-block here, with the page reload
  that already accompanies those commands stated plainly.
- A discoverable, always-findable entry point on every web page.

## Non-goals

- No global on/off toggle in the popover (deliberate cut; site-only scope).
- No per-site filter granularity, "report broken site" flow, or filter-list UI.
- No change to `/allow-ads` / `/block-ads` semantics — the popover reuses them.
- No mobile implementation now (spec/parity notes only).
- The chip keeps its internal identifiers (`pillShield`, `.shield`).

## The chip

`pillShield` becomes a real `<button>` in the pill (same id/class), rendering
a small shield glyph in the pill's stroke style plus, when relevant, the count.
State derives from `{host, blockedCount, excepted, adblockEnabled}`:

| State | Condition | Look | Tooltip |
|---|---|---|---|
| hidden | no web host (internal pages, `view-source:`, blank tab) | not rendered | — |
| quiet | protected, 0 blocked | dim glyph, no number, transparent bg | "Protected — click for site controls" |
| count | protected, N > 0 | glyph + count, accent chip (today's styling) | "Blanc blocked N ads & trackers on this page — click for site controls" (singular form at 1) |
| off | site excepted **or** `adblockEnabled === false` | slashed glyph, muted outline, no number | site: "Ads allowed on this site — click for site controls"; global: "Ad blocking is off — click for details" |

Notes:

- The slashed glyph replaces the struck-through 0: same
  distinguishable-by-shape-not-color property, no fake number.
- The chip is clickable in every visible state and toggles the popover
  open/closed. Its click handler stops propagation so the pill's own
  open-panel click doesn't fire. Keyboard-focusable, `aria-label` set per
  state.
- Private tabs show the chip under the same rules — blocking runs on the
  private session too.
- The "always present, quietly" rule is new behavior: today the shield hides
  at 0. A popover entry point that vanishes on quiet pages is undiscoverable
  (chip-at-rest mockup, option A chosen).

**Renderer data requirement:** the chip needs the global `adblockEnabled`
flag, which the renderer doesn't receive today. Extend the `tabs:updated`
broadcast with a top-level `adblockEnabled` boolean (per-tab `excepted` and
`blockedCount` already ride it).

## The popover

A fourth overlay mode, `'shield'`, in the existing overlay document —
no new views or documents. Find-capsule rules: tight bounds, no scrim, the
page outside stays clickable.

Anatomy (top to bottom):

1. **Header row** — domain (mono, ellipsized on overflow) with
   "Protection **on**" / "Protection **off**" beneath it; toggle switch at the
   trailing edge.
2. **Count line** — "12 ads & trackers blocked on this page" /
   "1 ad or tracker blocked on this page" /
   "Nothing blocked on this page yet". When off: "Ads allowed on this site".
3. **Reload note** — dim: "Changing this reloads the page."
4. **Footer** — "blocking settings →", opens the Settings sheet.

**Toggle semantics** (existing IPC, verbatim):

- Protection on → flip off: `chrome:adblock-exempt-active` →
  `runAllowAdsCommand` (hostname added to `adblockExceptions`, deferred
  reload — inherits the settings-fanout crash guard,
  `reloadTabAfterSettingsFanout`).
- Ads allowed here → flip on: `chrome:adblock-toggle` →
  `runBlockAdsCommand`, whose un-except branch re-blocks the site. The
  popover only invokes this while the site is excepted, so the command's
  global-toggle branch is unreachable from the pill.
- The popover stays open across a flip and re-renders the new state while
  the page reloads beneath it.

**Global-off variant:** when `adblockEnabled === false`, the site toggle is
replaced by "Ad blocking is off everywhere" plus the settings footer. No
site toggle is shown (it could do nothing), and global state cannot be
flipped from the pill.

**Dismissal:** Esc (existing `before-input-event`), overlay blur, clicking
the chip again, tab switch or creation, and any active-tab navigation that
**changes the site** (different or missing blockable hostname — the state
the popover describes is gone). Same-site navigations deliberately keep it
open: that includes the toggle's own reload (which would otherwise close
the popover the moment it's used) and ordinary same-site link clicks, with
the count line updating live. Summoning ⌘L swaps the overlay to palette
mode via the normal `showOverlay` path.

## Architecture & data flow

- Chip click → new guarded `chrome:open-shield` IPC carrying the chip's
  viewport rect (`getBoundingClientRect` returns post-`zoom` coordinates)
  → main's `showOverlay('shield', payload)` with
  `{host, blocked, excepted, enabled}`. Main stays the only mode mutator.
- Bounds follow the find-capsule pattern: fixed constants in
  `chrome-layout.js` (a pure `calculateShieldBounds` next to `findBounds`),
  not runtime measurement — a fixed-size region below the strip, right edge
  aligned to the chip's right edge, clamped to the window with a small
  margin. The region is slightly taller than the drawn popover; the small
  transparent remainder swallowing clicks is the same accepted trade-off as
  find's 160px region.
- **Live updates:** the overlay already receives `tabs:updated`; shield mode
  re-renders the count line from it. After a toggle changes settings, main
  re-sends the `overlay:show` payload — the same idempotent render path.
- Existing overlay guards apply unchanged: re-stack below the overlay when a
  tab view attaches while it's open, Escape in main, blur-dismiss (shield
  behaves like panel/palette, not like find).
- Styling uses the shared tokens in `styles.css` (one stylesheet serves strip
  and overlay); light/dark/private come from the existing `data-theme`
  scopes. No new token values.

## Edge cases

- Long hostnames ellipsize in the header row.
- `view-source:` tabs and internal pages have no chip (unchanged hidden rule).
- Navigation mid-open closes the popover (see dismissal).
- The popover never renders for a tab without a host; `chrome:open-shield`
  is a no-op in that case.

## Testing & verification

- **Unit (node --test):** pure-logic modules per the `session-snapshot.js`
  pattern:
  - chip-state derivation: `{host, blocked, excepted, enabled}` →
    hidden / quiet / count / off (+ tooltip/aria strings).
  - popover action routing: excepted → `adblock-toggle`, protected →
    `adblock-exempt-active`, global-off → no toggle rendered.
  - bounds clamping for the popover rect.
- **Manual (relaunch `npm start`; chrome documents don't hot-reload;
  Playwright-first):** quiet page → glyph only; ad-heavy page → live count;
  toggle off → reload with ads, slashed chip; toggle back on; global-off
  variant; Esc / blur / chip-reclick / tab-switch / ⌘L dismissal; private
  tab; long hostname; dark and private themes.
- `substrate:check` unaffected: no token values, settings enums, or
  slash-command copy change.

## Spec / parity touches

- `spec/features.md` F12: add the clickable shield chip + site popover to the
  desktop contract.
- `spec/parity-matrix.md` F1/F12 notes: desktop gains "shield chip opens
  site-protection popover"; mobile PLANNED.
- D13 unaffected: on iOS the popover's count line follows the binary
  protected/paused state instead of a number.

## Copy inventory (all new user-facing strings)

| Where | String |
|---|---|
| Chip tooltip (quiet) | Protected — click for site controls |
| Chip tooltip (count) | Blanc blocked N ads & trackers on this page — click for site controls |
| Chip tooltip (off, site) | Ads allowed on this site — click for site controls |
| Chip tooltip (off, global) | Ad blocking is off — click for details |
| Popover state | Protection on / Protection off |
| Popover count | 12 ads & trackers blocked on this page / 1 ad or tracker blocked on this page / Nothing blocked on this page yet |
| Popover (off) | Ads allowed on this site |
| Popover reload note | Changing this reloads the page. |
| Popover footer | blocking settings → |
| Popover (global off) | Ad blocking is off everywhere |
