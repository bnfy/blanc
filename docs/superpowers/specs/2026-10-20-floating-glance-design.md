# Floating Glance

October 20, 2026. **Status: awaiting owner review of this file.** Nothing here
is built yet.

**Revises:** [Glance](2026-08-15-glance-design.md) (F34) and its
[refinement](2026-10-15-glance-refinement-design.md). Where they differ, this
file wins. **Relates to:** [Split View](2026-10-19-split-view-design.md)
(F53), which keeps every side-by-side layout.

Marks: **(owner)** is the owner's decision in chat on October 20, 2026.
*(My call)* is a builder default the owner hasn't ruled on. Everything else
follows from those or from the code as it is.

## Why

Glance has shown one other tab beside the current page since v1.4.0. Split
View (F53, unreleased) now also shows pages side by side, as rounded,
bordered cards. Two features that both put two pages next to each other,
one temporary and one kept, look alike while behaving differently, and the
difference doesn't show on screen. Glance also kept its square panes and
plain divider, so the two read as if from different browsers.

**(owner)** Side by side now always means Split View. Glance becomes a
**floating card over the page**: a quick look at another page without
leaving the one you're on, in the same visual language as Split View's
panes. If you need it for longer, **Keep as split** turns it into a split.

## Goals, non-goals, anti-goals

- **Goal:** Glance is a large, centered, floating card **(owner)**, rounded,
  bordered and shadowed like a Split View pane.
- **Goal:** the page behind stays usable while the card is open **(owner)**.
  Clicking the page works in the page and never closes the Glance.
- **Goal:** the card can be moved and resized **(owner)**, and the next
  Glance opens at the size and place you left it **(owner)**.
- **Non-goal:** changing which tabs Glance can show, the picker, Open Link
  in Glance, ⌘⇧G or `/glance`. How you open a Glance is unchanged.
- **Non-goal:** saving the Glance itself across relaunches or Spaces. As
  today, a Glance never survives a relaunch or a Space switch; only its size
  and place are remembered.
- **Non-goal:** more than one Glance at a time.
- **Anti-goal:** a dark backdrop, or anything that dims or blocks the page
  behind **(owner)**.
- **Anti-goal:** an invisible margin around the card that takes clicks meant
  for the page and does nothing with them. A transparent pixel in a view
  still takes clicks (Electron views can't pass them through), so every view
  the card adds stays tight to what it draws. *(My call: the one exception
  is a thin ring just outside the border, about 8 px, that holds the resize
  edges and the shadow. A click there resizes the card, as at the edge of a
  window, so it isn't lost; the shadow is kept short enough to fit it.)*
- **Anti-goal:** Escape closing the Glance while you're typing in the page
  behind.

## Behavior

### Opening and closing

- Every way of opening a Glance works as today: View → Open Glance (⌘⇧G),
  `/glance`, the picker, the ⌘L row chip, the tab menu's Open in Glance,
  Open Link in Glance, and a link opened from inside the Glance landing in
  it. They show the card instead of a side-by-side pane.
- **×** in the card's header closes it, as do ⌘⇧G and Close Glance.
- **Escape** closes it only while the card has keyboard focus **(owner)**.
  Today nothing closes Glance on Escape; this is new. **(owner, after the
  October 20 review:)** "the card" means its chrome: the header and its
  controls, including the Move or resize control. Inside the Glance page,
  Escape goes to the site as usual (closing its dialogs and menus, leaving
  fullscreen), and Escape in the page behind never closes the Glance either.
  From inside the Glance page you close it with × or ⌘⇧G.
- **Activating the Glance tab another way** (an Island dot, ⌘1–9, the ⌘L
  list) acts like **Open as tab**: the Glance ends and that tab becomes the
  active tab. Today these swap the two pages. *(My call, so there's one rule
  instead of a hidden swap.)*
- Clicking or scrolling the page behind never closes the card **(owner)**.
- **Switching to another tab closes the Glance (owner):** it belongs to the
  page you opened it over. Today a Glance survives a switch to a tab outside
  a split; that changes. Switching back doesn't bring it back.
- Closing rules carry over: closing the main page while a Glance is open
  makes the Glance tab the active tab and ends the Glance; closing the Glance
  tab ends the Glance.

### Placement, size and memory

- **First open:** a large card centered over the page area, below the
  Island, with page visible on every side **(owner: centered and large)**.
  *(My call: width is the smaller of 1,100 px and 80% of the page area;
  height runs from 16 px below the Island's band to 32 px above the window's
  bottom edge.)*
- **Move:** drag the card's header (anywhere that isn't a button) **(owner)**.
- **Resize:** drag any edge or corner **(owner)**. *(My call: the minimum
  card is 360 × 280 px; the card always stays inside the page area, and at
  least 48 px of its header stays on screen.)*
- **Remembered:** the next Glance opens at the size and place you last left
  a card **(owner)**. *(My call: one remembered frame per device, stored as
  fractions of the page area so it fits windows of any size; device-local,
  never synced, not per window. If the window has shrunk, the card is pulled
  back inside it and kept at least the minimum size; a window smaller than
  the minimum shows the card filling the page area less an 8 px margin.)*
- **Reset:** double-clicking the header returns the card to the first-open
  size and place and clears the remembered frame. *(My call, mirroring
  today's double-click reset on the divider.)*
- Window resizes keep the card's place as fractions of the page area, so it
  scales with the window. Moving and resizing follow the pointer live,
  without animation.
- **The page area** is the window's content area below the Island's resting
  band, whatever the Auto-hide setting, and the remembered fractions are
  measured against it. The card is fixed to the window: it doesn't move
  when an auto-hidden Island reveals, in either style. *(My call.)*
- **The card stays above the page.** It can't be sent behind; you move it,
  resize it or close it. *(My call.)*

### The card

- **Look:** the same language as Split View's pane cards (spec D9): rounded
  corners at the pane radius, a 1 px border, darker while the card has
  focus, and a soft shadow so it reads as floating. The page view inside
  gets matching corners, as split panes do.
- **Header (owner, as proposed):** the GLANCE label, the site (favicon and
  host, with the private chip for a private tab), then:
  - **Back** and **Reload/Stop** for the Glance page, as today.
  - **Change:** opens the picker to show a different tab, as today.
  - **Open as tab** (replaces Make main): the Glance tab becomes the active
    tab, full window, the Glance ends, and the page you were on stays open
    as an ordinary tab. *(It no longer swaps the two pages.)*
  - **Keep as split:** turns the main page and the Glance into a two-pane
    split. *(My call: main page on the left, Glance on the right, at 50/50,
    since there's no ratio to carry over.)*
  - **×:** closes the Glance.
  - Right-clicking the header opens the Glance tab's menu, as today.
- **Narrow header (compaction).** The header is one row at every card width
  down to the 360 px minimum. As the card narrows, it gives up room in this
  order, one step at a time, measured the way `fitGlanceHeader` measures
  today's header:
  1. **Change**, **Open as tab** and **Keep as split** become icon-only
     buttons together. Each keeps its full label as its tooltip and
     accessible name, so speech input and screen readers still use the
     words.
  2. The **GLANCE** label hides. The card's accessible name still says
     Glance.
  3. The host truncates with an ellipsis. Below about 8 characters it hides,
     leaving the favicon (and the private chip) as the site's mark.

  **Back**, **Reload/Stop** and **×** never hide, and neither does the
  private chip. At 360 px the header holds the favicon, Back, Reload, the
  three icon buttons and × with room left to drag. Widening the card undoes
  the steps in reverse. *(My call, after the October 20 review.)*
- **Focus:** clicking inside the card focuses the Glance page; clicking the
  page behind focuses the main page. Today's "commands follow the focused
  pane" rule stays (`commandTargetTab`): ⌘R, ⌘F, zoom, print and the
  1Password fill act on the card when it has focus. The Island keeps
  addressing the main page, as today.
- **Keyboard move and resize.** The header's drag area is also a focusable
  control, **Move or resize Glance**, in the header's tab order before ×.
  With it focused:
  - **Arrow keys** move the card 16 px; with **Shift**, 64 px.
  - **Option+Arrow** (Alt+Arrow on Windows and Linux) resizes the card from
    its bottom-right corner by the same steps, never below the minimum.
  - **Enter** resets the card to its first-open size and place, like a
    double-click on the header.

  Each change goes to the remembered frame, as a drag does, and is announced
  through the existing Glance status live region ("Glance moved", "Glance
  resized to {width} by {height}", "Glance reset"), throttled so holding a key
  doesn't flood it. The new strings go through the message catalog in every
  language. *(My call, after the October 20 review.)*
- **Motion:** the card fades and scales in from 96% over Glance's existing
  timing (opacity 140 ms, 340 ms ease `cubic-bezier(.2,.9,.25,1)`), and out
  the same way reversed. Reduce Motion: a 140 ms fade only. *(My call.)*
  **A closing card stops taking input at once**, the moment the close
  begins: clicks, keys and drags go to the page behind while the card's
  exit animation finishes.

### What goes away

- The side-by-side and stacked layouts, the divider, its keyboard controls
  and its ratio.
- **Make main** and its swap.
- Glance forcing the push layout under Auto-hide, and pinning the Island:
  the card floats over the page in either Auto-hide style, and the Island
  hides and reveals as usual while a Glance is open. *(My call: nothing is
  drawn in the strip any more, so nothing needs it held up.)*

### Other features

- **Split View:** unchanged. Glance still can't open while a split shows,
  and making a split still ends a Glance. Keep as split is described above.
- **Floating Island:** the card sits below the Island band and below every
  Island surface. Stacking order: tabs < Glance card < utility sheet <
  Island float views < fill capsule < overlay < permission view < tooltip
  and uBO popup. *(My call: the sheet and every Island surface stay above
  the card.)*
- **Quiet Tabs, capture, 1Password, permission prompts, private tabs:**
  unchanged. The Glance tab still counts as visible and never goes quiet.
- **Find and the 1Password fill capsule** for the Glance page anchor to the
  card, wherever it sits. The permission prompt stays bottom-center over the
  window, as today. *(My call.)*
- **Linux:** the card's views stay window-owned for life and hide with
  `setVisible(false)`, under the same redraw rule as the floating Island
  views.

## Constraints

- Electron only (decided October 5, 2026); no new extension or fork work.
- Every Blanc-authored string goes through `copy/messages/en.json`, and the
  same PR updates de, es, fr, pt-BR and it. Strings change: `glance.promote`
  and `glance.promoteShort` give way to an Open as tab label; the divider
  strings (`glance.resize`, `glance.dividerValue`) go; `slash.glance.hint`
  ("Keep another open tab beside this page") is rewritten for a floating
  card.
- The `browser-api` contract changes with the bridge: `promoteGlance`,
  `resizeGlance`, `resetGlance` and the `GlanceLayout` type are replaced by
  whatever the card needs (move, resize, reset, open as tab), with
  `browser-api:build` regenerating the vectors.
- Edits to boundary files need `npm run audit-inventory:write`.
- **Marketing claims stay as they are until a release ships this.** The
  website's Glance pages (`site/src/pages/features/glance.astro`, the guide,
  `GlanceDemo`, `GlanceIsland`, the homepage and Arc comparison lines) and
  their ledgers and tests describe side by side, stacking, Make main and a
  divider. They change in a website-only PR after the release, per
  `docs/marketing-claims.md`.
- `spec/features.md` F34, `spec/parity-matrix.md` and the Split View spec's
  "in their current places and proportions" line are amended in the same PR
  as the code.
- Hand checks: packaged macOS, plus Windows and Linux VMs before the release
  that ships it.

## Left to the builder

- How the card is built from views: for example the Glance tab's own view
  plus a tight chrome view for the header, border, shadow and resize edges.
  Keep every view tight so nothing transparent takes the page's clicks, and
  keep the shadow from being clipped (see the shadow-clipping lessons in
  WebContentsViews).
- Resize hit areas (edge width, corner size) and cursors.
- Rewriting `glance.feature` (about 60 `@F34` scenarios), `glance.steps.js`,
  the Glance unit tests and the F1-33/F1-39 and F53 scenarios that assume
  the side-by-side layout.
- Whether `glance-layout.js` is reshaped or replaced.
