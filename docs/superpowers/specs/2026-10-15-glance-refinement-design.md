# Glance refinement

October 15, 2026. **Status: scope agreed in chat, awaiting owner review of
this file.** Nothing here is built yet. This spec refines the shipped Glance
feature; it does not replace `2026-08-15-glance-design.md`, which stays the
record of the original design. Where the two differ, this file wins, and the
amendments section at the end lists every line of the older spec and of
`spec/features.md` F34 that changes.

## Why

Glance shipped in v1.4.0 (PR #139) and has not been touched since beyond
localization. A code audit on October 15 (two read-only passes over
`src/main/main.js`, `src/main/tab-view.js`, `src/main/glance-layout.js`,
`src/renderer/renderer.js`, `src/renderer/overlay.js` and `styles.css`,
spot-checked by hand) found that the reference pane is less of a page than
the design promised:

- A video you start in the reference plays **muted**, with no indicator and
  no control to unmute. Glance never lifts the background-autoplay guard that
  `setActiveTab` lifts for the main page (`tab-view.js:289`, `main.js:6325`).
- With the cursor in the reference, ⌘R, ⌘F, ⌘W, zoom, print and the 1Password
  fill all act on the **main page** (`main.js:4847`, `:7185`, `:8295`,
  `:3920`). Nothing you do with focus in the reference can reload, search,
  zoom, print or close it.
- A `target=_blank` link in the reference **replaces the main page**
  (`tab-view.js:593`), the one thing the original spec says reference
  interaction must never do.
- Moving the main tab to a new window can leave the old window with Glance
  pointing at the tab that left (`main.js:9039` with the promote branch at
  `main.js:6368`).
- In the stacked layout the Island is centred over 68 % of the window, not
  the full-width main page (`renderer.js:408`).
- Dragging the divider jumps by however far inside the grip you grabbed it
  (`glance-layout.js:127` maps the raw pointer to the divider's left edge).
- The ⌘L drag-reorder live region lives inside the picker section, which is
  `hidden` in every other overlay mode, so reorder announcements are never
  spoken (`overlay.html:148`, `overlay.js:1841`).
- Nothing in Glance moves: the header, divider and picker appear and vanish
  in one frame. The Spaces menu, built later, has an enter/exit the rest of
  the chrome now expects.
- Glance is hard to find: there is no `/glance`, no **Open Link in Glance**
  on page links, and the tab menu's **Open in Glance** never turns into
  **Close Glance**.

## Decisions (owner, October 15, 2026)

1. **Full scope**: bugs, behaviour, visual polish and discoverability, in
   three PRs (see *Delivery*).
2. **Browser commands follow focus.** With keyboard focus in the reference,
   ⌘R / ⌘⇧R, ⌘F, ⌘W, ⌘+ / ⌘− / ⌘0, ⌘P, ⌘[ / ⌘] and the 1Password fill act
   on the reference. ⌘W in the reference closes the reference tab and Glance
   collapses; the main page is untouched.
3. **New tabs opened from the reference open into Glance.** A `target=_blank`
   link, `window.open` or a ⌘⇧-click from the reference makes the new tab
   the reference; the previous reference stays open as an ordinary tab; the
   main page is untouched. One deliberate narrowing of the chip the owner
   chose ("target=_blank or right-click → Open in New Tab"): **Open Link in
   New Tab** stays a background tab in both panes, because it has never
   changed roles from either pane and a background tab is what its name
   says; the explicit route is the new **Open Link in Glance**. The owner can
   reverse this in review.
4. **The reference gets Back and Reload in its header**, plus ⌘[ / ⌘] / ⌘R
   following focus and trackpad swipe re-enabled there. Still no address bar.

## What the user sees

### The header

```
┌ side by side ───────────────────────────────────────────────────────┐
│ GLANCE │ ‹  ↻ │ ◉ Lisbon travel guide · private │  Make main  Change  ✕ │
└─────────────────────────────────────────────────────────────────────┘
```

Reading left to right: the `GLANCE` eyebrow; **Back** and **Reload**
(30 × 30 icon buttons, the pill's own back and reload glyphs; Reload becomes
Stop while the reference loads, the pill's `data-mode` pattern); the favicon
and single-line title; a `private` chip when the reference is a private tab
(the ⌘L row's `.row-private` style, so the dashed border is no longer the
only cue); then the existing **Make main**, **Change** and close actions.

- **Back** is disabled while the reference cannot go back (`canGoBack` is
  already in every tab payload, `main.js:4217`). There is no Forward button;
  ⌘] and a trackpad swipe go forward.
- **Make main**'s visible text stays "Make main". Its accessible name becomes
  **"Make main — swap with the main page"**, so the visible words are part of
  the name (today's "Make Glance the main page" is not, `en.json:341`). When
  the header is too narrow for the words, the icon is a swap glyph (two
  opposed arrows), not the Forward chevron it reuses today (`index.html:87`).
- Compaction order at narrow widths, by container query as today: the
  eyebrow hides first, then the title truncates to the favicon alone, then
  **Make main** collapses to its icon. Back, Reload, Change and close stay at
  every supported width. The stacked header keeps the eyebrow at widths where
  it fits (today `styles.css:307` hides it unconditionally).
- Right-clicking the header's empty area or title opens the reference tab's
  context menu, the same model the ⌘L rows use (`tab-context-menu-model.js`,
  surface `row`), with **Close Glance** in place of **Open in Glance**.
- Nothing else changes in the header: no mute control (mute lives in that
  context menu and the ⌘L row), no address, no shield.

### Commands follow focus

Main keeps one new per-window value, `focusedPaneTabId`, which is either the
main tab or the reference tab:

- Set by each visible pane's `webContents` `focus` event (the reference
  already has a focus handler that deliberately does not promote,
  `tab-view.js:427`).
- Reset to the main tab whenever Glance closes, the roles swap, the main tab
  changes, or the reference tab leaves the window.

A command that acts on "the current page" resolves its target through one
pure function, `commandTargetTab(runtime, senderWebContents)`:

1. If the key event came from the main or reference pane's live
   `webContents`, that pane.
2. Otherwise (a native menu click, a macOS accelerator dispatched to the
   window), `focusedPaneTabId` if it is still a visible pane.
3. Otherwise the main page, as today.

Commands that use it: reload and hard reload, close tab, find, zoom in/out/
reset, print, back/forward (menu and ⌘[ / ⌘]), the 1Password fill and its
key-glyph hint, mouse gestures and trackpad swipe (`tab-view.js:210` today
cancels every gesture unless the tab is the main page).

Commands that stay on the main page, deliberately: ⌘L and everything typed
into the Island (the reference has no address bar), ⌘T / ⌘⇧N (a new tab is a
new working page and becomes main, Glance stays), ⌘1–9 and tab cycling, the
shield popover, the blocked count, `/dark-site`, `/allow-ads`, `/pin`,
`/mute`, `/rename` and the other `/` commands that address "this tab" (the
Island is the main page's).

Consequences spelled out:

- ⌘W in the reference closes the reference **tab**. Glance collapses, the
  main page fills the window, focus moves to the main page, and the strip
  announces it. Close in the header still closes only the pane and keeps the
  tab open.
- ⌘F in the reference opens the find capsule centred over the reference
  pane, searching the reference. The capsule is bound to the pane it opened
  on; it closes when that pane's tab closes or the roles swap.
- The 1Password fill targets the focused pane. `docs/1password-integration.md`
  records this in the same PR; the picker anchors over the pane's own bounds
  (`onepassword-policy.js:441` already takes the view's origin). The broker,
  the credential path and the explicit-invoke rule are unchanged.
- A screen-share request (`getDisplayMedia`) from the reference is admitted
  on the same terms as from the main page: `tabAttached` (`main.js:9922`)
  counts both visible panes. (The refusal is inferred from
  `evaluateDocumentVisible`; PR 1 confirms it in the running app before
  changing it.)

### Links and new tabs from the reference

Every path that today makes a new tab the main page because the reference
opened it instead makes it the reference:

- Through the window-open handler (`tab-view.js:593`): a foreground
  disposition (`target=_blank`, `window.open`, ⌘⇧-click) calls
  `setGlanceTab(newId)` instead of `setActiveTab(newId)`; a background
  disposition (⌘-click, middle-click) stays a background tab with no role
  change, as today.
- The reference's own context menu **Open Link in New Tab** keeps opening a
  background tab (`context-menu.js:25`, decision 3); the new **Open Link in
  Glance** (see *Discoverability*) opens into Glance.
- `new-window` dispositions still open a popup window.

The new tab inherits the opener's profile, private flag and group exactly as
today. The previous reference stays open as an ordinary tab; the main page
and its focus are untouched. If the new tab fails to attach (closed while
loading, or main refuses it), nothing changes.

### Audio in the reference

A visible pane is never "hidden" for autoplay purposes. `noteMediaStarted`
is told the tab is visible when it is the main tab **or** the reference, and
`setGlanceTab` lifts an existing guard the way `setActiveTab` does
(`revealTabAudio`, `main.js:6325`). A video you press play on in the
reference is audible; the ⌘L row's sound indicator reflects it; mute through
the context menu or the ⌘L row works as for any tab.

### Lifecycle fixes

- **Move Tab to New Window on the main tab** with Glance open promotes the
  reference and collapses Glance in the source window, the same rule as
  closing the main tab (`main.js:6783`). The dangling `glanceTabId` can no
  longer happen.
- **Close Group** that removes the main tab while the reference survives
  promotes the reference instead of activating a neighbour
  (`main.js:5209`). If both panes are in the group, both close and the
  normal neighbour rule applies.
- **Closing the reference tab from anywhere** (✕ on a ⌘L row, the rail, a
  page script, ⌘W per decision 2) returns focus to the main page when the
  reference held it. Today `closeTab` has no focus call (`main.js:6750`), so
  focus lands on the chrome strip.
- **Closing the main tab with Glance visible** announces "{title} is now the
  main page. Glance closed." Today the promotion is silent (`main.js:6783`).
- **Cancelling during a quiet-tab wake cancels.** Every picker request
  carries the window's `glanceRequestEpoch`; dismissing the picker, closing
  Glance, switching the main tab or closing the window bumps it. A
  `setGlanceTab` that finishes waking a tab after the epoch moved attaches
  nothing, announces nothing, and the row action's follow-up `hideOverlay()`
  (`main.js:8563`) runs only for a still-current request.
- **Orphaned Change picker.** ⌘⇧G or View → Close Glance while the Change
  picker is open dismisses the picker with Glance.
- **Quiet Tabs, closed-tab holds, session restore, Spaces, sync and private
  tabs** are unchanged; the existing guards stay (`sleepTab` re-checks
  `glanceTabId`; Glance is never persisted or synced).

### Layout fixes

- **Stacked Island centring.** When the panes stack, the main page is the
  full page width, so the Island is centred over the full page width
  (today `renderer.js:408` centres it over 68 %). On Windows and Linux the
  pill's maximum width in the stacked layout is reduced by the window-control
  reservation on both sides, so it stays centred and never reaches the
  controls.
- **Window controls over the header (Windows/Linux, side by side).** The
  custom minimise/maximise/close buttons sit above the header's opaque
  neutral surface (`styles.css:2766`), yet take the sampled page tint's
  white glyphs when the main page is dark (`styles.css:370`). While Glance
  is side by side they use the theme's `--text-dim` / `--text` colours and a
  hover fill distinct from the header (`--accent-dim`), and ignore
  `tint-dark`.
- **Stacked Change picker.** In the stacked layout the Change picker uses the
  same centred, page-wide placement as the open picker. The caret under
  **Change** is a side-by-side detail only. Today the overlay is only as tall
  as the space under the lower header (`main.js:2985`), which at a 480 px
  window leaves the list zero rows.
- **Divider drag.** The strip records where inside the grip the drag began
  and sends the pointer position minus that offset, so the divider stays
  under the cursor from the first move. The divider's pure maths
  (`ratioForGlanceDivider`) is unchanged; a non-finite point is ignored
  rather than resetting the ratio to 62 %.
- **Empty state is reachable.** ⌘⇧G, View → Open Glance… and `/glance`
  always open the picker. With one tab it shows "Open another tab to use
  Glance" (`en.json:1087`, dead today because `openGlancePicker` refuses
  with fewer than two tabs, `main.js:6509`). The View item is always
  enabled.
- **Drag-reorder live region.** `#islandDragLive` moves out of the picker
  section so ⌘L reorder announcements are spoken in every overlay mode.

### Motion

Glance adopts the chrome's existing motion vocabulary; it introduces no new
curve or duration. Every transition below collapses to a 140 ms opacity fade
under `prefers-reduced-motion: reduce`, the Spaces switcher's rule
(`styles.css:3552`).

- **Header and divider** enter with opacity 0 → 1 over 140 ms and a 6 px
  slide — from the right when side by side, from below when stacked — over
  340 ms on the Spaces curve `cubic-bezier(.2, .9, .25, 1)`, through
  `transition` + `@starting-style` + `display … allow-discrete`, the pattern
  at `styles.css:3334`. They leave the same way in reverse. The two page
  views take their new bounds at once; native `WebContentsView` bounds are
  not animated (stepping `setBounds` re-lays out two live pages per frame,
  and the chrome cannot verify the result headlessly). The pages snapping
  while the chrome glides is the decision; if it reads badly in the running
  app the fallback is to fade the chrome only.
- **Picker** uses the Spaces menu enter/exit: `scale(.92)` + 6 px and opacity
  0 at `@starting-style`, 140 ms opacity / 340 ms transform. Its
  `transform-origin` is the **Change** caret when changing and the top centre
  when opening. Main delays detaching the overlay view for `glance` as it
  already does for `panel`, `palette` and `spaces` (`OVERLAY_RETRACT_MS`,
  `main.js:3550`), so the exit is visible.
- **Make main** cross-fades the header's favicon, title and chip over 120 ms
  instead of swapping them in one frame. The panes swap at once.
- **Divider grip** colour transitions over 120 ms on hover and focus.

### Picker rows

The picker keeps its separate document section and its separate data path
(open tabs of this window and profile only; never history, Favorites,
remote tabs, suggestions or commands). Its rows take the ⌘L panel's
vocabulary so the two lists read as one family:

- Row radius `--radius`, the panel's edge-faded hover wash
  (`styles.css:2130`), and weight rather than a second fill for the
  highlighted row. The duplicate `:hover` fill goes: `mousemove` already
  moves the highlight (`overlay.js:484`), so a row is never lit twice.
- Title 13 px; secondary line 11 px `--text-dim` (today 10.5 px,
  `styles.css:2032`). Keyboard hint and empty-state text no smaller than
  11 px.
- Quiet tabs are dimmed like `.island-row.quiet` and lose the visible
  "· quiet" word; the word stays in the row's accessible name. Private tabs
  carry the `.row-private` chip.
- Every row has a `title` tooltip with the full page title and host.
- The card's radius is `--island-panel-radius`.
- While a chosen quiet tab wakes, the chosen row shows "Opening…" in its
  secondary line and the live region says it; the other rows dim as today.
- Arrow keys no longer re-announce the result count; only typing does.
  Home and End move the caret in the filter field as in any text field; the
  list's first and last rows are reached with the arrow keys.
- The accessible name of a row joins its parts with ", " (today it includes
  the visual " · " separator, `overlay.js:482`).

### Discoverability

- **`/glance`** opens the picker (the Change picker while Glance is open).
  `/glance <text>` opens it with the filter prefilled. Hint: *"Keep another
  open tab beside this page"*. It is added to `copy/slash-commands.json`, the
  ⌘L list, the Shortcuts page list and `en.json` plus the five translations
  in the same PR (F44 rule).
- **Open Link in Glance** follows **Open Link in New Tab** in the page
  context menu on links (`context-menu.js:24`), not on images. It creates
  the tab in the opener's profile, private flag and group and makes it the
  reference, replacing the current one if Glance is open.
- **Open in Glance / Close Glance.** The tab context menu item reads
  **Close Glance** when the row is the current reference, as the ⌘L row chip
  already toggles (`overlay.js:671`).
- The Glance header's right-click menu (above).
- Not included: a Start Page checklist item or any Start Page mention.

### Accessibility

Everything in the original spec's accessibility contract holds. Changes:

- **Make main** passes label-in-name (above). The new Back and Reload
  buttons have the pill's accessible names ("Back", "Reload" / "Stop").
- The private chip gives the private state a visible, readable cue, so no
  state is carried by border style alone.
- The strip's live region announces: reference opened / changed / closed,
  the reference tab closed, the main tab closed with the reference promoted,
  and a cancelled wake ("Didn't open that tab in Glance"). "Glance made
  main" (`en.json:2620`) becomes "{title} is now the main page; {other} is
  in Glance".
- The picker is a `role="dialog"` labelled by its heading, like
  `#workspaceSwitcher` (`overlay.html:117`), rather than a landmark
  `<section>`.
- Focus-visible styling of the new header buttons matches the existing
  header buttons; nothing app-wide changes.

### Security and privacy

- The main process still owns attachment, bounds, focus, role changes and
  the wake path. `focusedPaneTabId` never leaves main; renderers keep
  receiving `glanceTabId` and geometry only.
- Opening into Glance from the reference uses the existing window-open
  handler and `setGlanceTab`'s full ownership re-check; it adds no new way
  to attach a tab from another window or profile.
- **Open Link in Glance** goes through `handOffToOs` and
  `isForbiddenTopLevelUrl` like **Open Link in New Tab**.
- The 1Password fill keeps its renderer-free credential path; only which
  visible, user-focused pane it targets changes, and that is recorded in
  `docs/1password-integration.md`.
- Nothing new is persisted, synced or sent anywhere.

## Delivery

Three PRs, each with its own plan file, in this order. Each lands with its
unit tests, its acceptance scenarios, the copy change in every language, and
the `browser-api/contract.json` + `spec/features.md` edits it needs.

1. **Glance fixes.** Audio in the reference; Move Tab to New Window; Close
   Group; focus and announcements on close; wake cancellation; orphaned
   Change picker; stacked Island centring; Windows/Linux window controls;
   stacked Change picker; divider grab offset; reachable empty state; the
   drag-reorder live region; screen-share admission. No new behaviour, no
   new copy beyond the two announcements.
2. **The reference behaves like a page.** `focusedPaneTabId` and
   `commandTargetTab`; commands follow focus; links and new tabs open into
   Glance; Back and Reload in the header; the swap glyph and label-in-name;
   gestures and swipe in the reference; the header's context menu; the
   1Password note.
3. **Glance polish and discoverability.** Motion; picker rows; the private
   chip; picker a11y changes; `/glance`; **Open Link in Glance**; the
   **Close Glance** toggle; the spec amendments below.

## Acceptance gate

Each PR passes before it leaves draft:

1. Unit coverage for the pure parts it adds: the grab-offset maths, the
   command-target resolver, the context-menu model toggle, Close Group
   promotion, wake-epoch cancellation, the stacked pill width.
2. Desktop acceptance scenarios added to `spec/acceptance/glance.feature`
   for every user-visible rule above: reload / find / close in the reference
   act on the reference; a link from the reference opens into Glance; Back
   in the header; the stacked Island centre; the single-tab picker;
   `/glance`; **Open Link in Glance**. Keyboard routing scenarios deliver
   keys with `webContents.sendInputEvent`, because CDP-injected keys bypass
   `before-input-event` (learned in #139).
3. The existing Glance scenarios, `npm run test:unit`, `npm run lint` and
   `npm run substrate:check` pass from a clean relaunch.
4. Before/after captures of every visual change, cropped to the changed
   surface at full resolution, in the PR.
5. PR 1's Windows/Linux window-control change and the long-open divider
   pointer-drag question from #139 are checked by hand in the Windows VM
   before PR 1 merges; the result is recorded in the PR.
6. A fresh correctness, focus and lifecycle review of the diff.

## Out of scope

- HTML5 element fullscreen (a YouTube video going full screen) inside either
  pane; no handler exists for either pane today and the gap is not
  Glance-specific.
- A second address bar, Forward button, or independent shield for the
  reference.
- Animating native view bounds.
- More than two panes; persisting or syncing Glance; cross-window or
  cross-profile references; a Start Page mention; a vertical-rail marker for
  the reference.

## Amendments to earlier documents

Each amendment lands in the PR that changes the behaviour it describes, in
the same commit as that behaviour (the parity spec-first rule): the F34
command, link and header lines and the 1Password note in PR 2; the entry
points, the older spec's corrections and the `design-qa.md` note in PR 3;
acceptance scenarios in whichever PR adds the behaviour.

- `spec/features.md` F34: add that browser commands follow the focused
  pane, that tabs opened from the reference open into Glance, that the
  header carries Back and Reload, and the `/glance` and **Open Link in
  Glance** entry points. Keep "reference pages remain fully interactive
  without changing roles" and the no-persistence rule.
- `docs/superpowers/specs/2026-08-15-glance-design.md`: the header is the
  68 px strip, not 64 px (`window-runtime-registry.js:123`); the eyebrow is the UI sans,
  not mono (`styles.css:239`); the stacked Island is centred over the full
  page width; the "Open another tab to use Glance" state is reachable from
  the open flow; **Change** keeps its caret only when side by side.
- `design-qa.md` Glance notes: "mono families" is stale.
- `spec/acceptance/glance.feature`: the new scenarios above.
- `docs/1password-integration.md`: the fill targets the focused pane.
