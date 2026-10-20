# Floating Island (auto-hide)

Oct 20, 2026 · Follow-up to Auto-hide the Island
(`2026-10-19-auto-hide-island-design.md`, shipped opt-in in v1.39.0, #964).
Designed with the owner; design approved by the owner on 2026-10-20. Not yet
implemented.

## Why

r/browsers feedback on v1.39.0 (u/BaliHans, 2026-10-20) liked Auto-hide but
not that revealing "pushes the page down when unhide, like Helium browser".
Arc and Zen instead float their hidden toolbar over the page, so the page never
moves. The v1.39.0 spec already listed overlaying as a larger follow-up: the
strip is the window's own webContents and always draws beneath child views.

Success: with Auto-hide on, bringing the Island back never moves or resizes the
page.

## Goals, non-goals, anti-goals

- **Goal:** a float presentation for the revealed Island, as the default for
  everyone who uses Auto-hide.
- **Goal:** keep the v1.39.0 push behaviour available as a choice.
- **Non-goal:** changing what reveals or hides the Island (edge, rest band,
  leave check, pinning), the intro tip, the shortcut or the View menu item.
- **Non-goal:** floating with Auto-hide off. The strip stays a permanent band
  there.
- **Anti-goal:** a transparent layer that takes clicks meant for the page.
  The site's own top bar must stay visible and clickable beside the floating
  pill. This is why only the pill floats, not the whole 68px band (the owner
  chose this over a full floating band).
- **Anti-goal:** the page relaying out on reveal or hide in float mode.

## Behaviour (owner decisions)

- **Setting.** Settings → General, directly under *Auto-hide the Island* and
  shown only while it is on: a two-way choice for how the Island comes back.
  - **Float over the page** (default).
  - **Push the page down** (v1.39.0 behaviour).
  Device-local like `islandAutoHide`. People who turned Auto-hide on in
  v1.39.0 get float on update. Anyone who misses the push can switch back.
- **Float.** The page fills the window and never moves. On reveal, only the
  pill slides down from above the window's top edge (160ms in, 200ms out,
  eased out; Reduce Motion snaps). It covers whatever the page has beneath
  it. The page stays visible and clickable on either side of the pill.
- **Window buttons in float mode stay on screen the whole time**, over the
  page, whether the Island is hidden or not:
  - macOS: the traffic lights, top-left.
  - Windows and Linux: the minimise / maximise / close cluster, floating
    top-right.
- **Amended 2026-10-20 (owner): the window buttons now come and go with the
  pill.** Left on screen while the Island was hidden, they sat over the
  page's corners: the macOS traffic lights covered YouTube's menu button, and
  the Windows/Linux cluster sits where sites put sign-in and account buttons.
  The same reason already kept the main-menu button off screen. Pointing at
  the top edge brings them back with the pill; keyboard shortcuts and the
  drag band are unchanged.
- **Moving the window.** An invisible drag band runs along the very top edge
  of the page pane. It drags the window, and a double-click maximises, as
  the bare strip does today. It overlaps the 10px reveal edge, so reaching
  for it also brings the pill down. The page's top few pixels stop taking
  clicks, which few sites use.
- **If a platform will not drag from the band, float ships there anyway**
  without it (owner, 2026-10-20). That platform keeps v1.39.0's limit: a
  hidden Island leaves nothing to drag. Float stays the default everywhere;
  the default never differs per platform. Record any such platform in D29 and
  Known limits.
- **Windows/Linux main-menu button.** It is drawn at the strip's top-left
  (`#mainMenuButton`) and is the only route to the app menu on those
  platforms. In float mode it slides in and out with the pill, at its usual
  top-left spot, and is not on screen while the Island is hidden (owner,
  2026-10-20). An always-on button would sit over the corner where sites put
  their logo.
- **Unchanged from v1.39.0:** what reveals and hides the Island; pinning
  while an Island surface is open; the 5-second intro with its tip;
  hover-open eligibility only while the Island is visible; Wayland's
  reliance on in-window pointer moves.
- **Amended 2026-10-20 (owner):** in float mode the rest band no longer
  reveals the Island, and the leave check has no slack below the strip and
  runs every 120 ms. A site's header sits in the 40px band (YouTube's search
  box), so resting on it landed the floating Island over it. Push mode keeps
  both as they were.

## Behaviour (my calls, confirmed by the owner in playback)

- **Push mode keeps v1.39.0 behaviour except the drag band.** It gets the
  same invisible drag band, which fixes v1.39.0's known limit that a hidden
  strip leaves nothing to drag. Its window buttons still hide and return
  with the strip, as today.
- **Surfaces drawn from the Island cover the page in float mode, never push
  it.** This covers the ⌘L panel and palette, find, the shield, capture and
  Spaces popovers, the group menu, the Glance picker and the uBO popup. They
  anchor under the floating pill exactly where they anchor under the strip
  today.
- **Glance falls back to push.** While Glance is open (it already pins the
  Island), float mode lays out like push. Glance's horizontal header and its
  divider are drawn in the strip document between the panes. Opening Glance
  already rearranges the panes, so the one shift happens then. Closing Glance
  returns to float.
- **Vertical tabs.** The rail keeps its column and stays in the window's own
  document. The pill floats centred over the page pane, where it sits today.
  The drag band spans the page pane only. Anything already drawn in the rail
  column (macOS traffic lights there, the rail's own controls) stays put.

## Behaviour (my calls, not yet seen by the owner)

- **Legibility.** The floating pill, the Windows/Linux controls and the menu
  button sit over arbitrary page content. Each gets a backing surface and a
  soft shadow (the pill's existing surface, the shadow from the overlay's
  popovers) rather than relying on the strip's page tint. The `tint-dark`
  adaptation does not apply to them.
- **Drag band height: 6px.** Thin enough to cost the page almost nothing.
  The pill's 12px top margin keeps it clear of the pill. The builder may
  tune it after hand testing on each platform.
- **No new menu item or slash command** for float versus push. The choice
  lives in Settings only.

## How it gets built

### The floating pill is its own view

The window's own webContents (the strip document) keeps everything it draws
today: the push-mode strip, the vertical rail, the Glance divider and header,
and now the drag band. In float mode a new **float view** is added: a small
transparent `WebContentsView` (`setBackgroundColor('#00000000')`, transparent
body), sized tight around the pill plus room for its shadow, never full width.
A transparent pixel still takes clicks, so tight bounds are what keep the
site's top bar clickable (the anti-goal).

Two more tight transparent views carry the Windows/Linux window controls
(top-right, on screen the whole time in float mode) and the main-menu button
(top-left, revealed and hidden with the pill, with the same slide). Neither is
created on macOS, which uses the native traffic lights and menu bar.

Why a separate view and not the existing overlay view: the overlay changes its
bounds per mode (find's tight capsule, the shield and Spaces popovers below the
strip). The floating pill must stay visible while those are open. One view
cannot be both.

**Document.** The float view runs the strip's renderer (the pill's rendering,
dots, shield chip, tooltips, hover and island-rect reporting already live in
`renderer.js`) in a float surface that draws only the pill. It does not draw a
second copy of the pill code. It must be an exact `blanc-chrome://` allowlist
entry with `browserAPI`, so it goes into `TRUSTED_CHROME_DOCUMENTS` (preload),
`browser-api/contract.json` `surfaces`, and the scheme handler's allowlist,
then `npm run browser-api:build`. Whether it is a new path serving
`index.html` with a surface flag or a separate small HTML file loading
`renderer.js` is the builder's call. The controls and menu-button views can be
one small shared document. They need only `window:*`, the main-menu IPC, and
the maximised state for the maximise icon.

**Lifetime.** The float views are created only while Auto-hide is on with
float selected, and destroyed when either is turned off. They are never
created for push users or with Auto-hide off.

**Cost.** Float mode adds one view per window on macOS (the pill) and three
on Windows and Linux (the pill, the controls, the menu button). A fourth is
added on any platform that needs the fallback drag strip. Separate views do
not necessarily mean separate OS renderer processes. Each PR that adds views
records the measured renderer process count and memory per window, float
versus push.

### One source of truth for "where is the Island"

Today `islandStripHidden()` feeds `chromeHeight: 0` into
`currentChromeLayout()`, and every bound follows from that. Float mode splits
two questions that are currently one:

1. **Page top.** Float mode always gives the page pane `y = 0`, unless Glance
   is open (push fallback). Push mode keeps v1.39.0's rule.
2. **Island visible and its anchor.** Revealed or pinned, as today. Overlay
   anchors (`calculateShieldBounds`, `calculateSpacesBounds`,
   `calculateCaptureBounds`, find, panel and palette, the tooltip, the uBO
   popup) take the Island's geometry from (2), not from the page top. Find's
   `findBounds.y` in particular uses the layout's strip height, which is 0
   while hidden today.

Keep this policy pure in `island-autohide.js` and `chrome-layout.js` (a float
pill bounds function, a drag-band rect), unit-tested like the existing
helpers.

### Surfaces that assume the strip is `window.webContents`

The survey found these (main.js line numbers at 989ae334). In float mode the
float view is the live Island surface, and each needs to handle it:

- **Strip-only sender checks:** `chrome:tooltip-show`/`-hide`,
  `chrome:island-rect`, `chrome:open-main-menu`. Also
  `isTrustedChromeSender` and `ownsBrowserShortcutSurface`.
- **Broadcasts the pill renders from:** `chrome:island-state`, `tabs:updated`,
  `chrome:downloads`, `chrome:theme-appearance`, `chrome:workspaces-updated`,
  `bangs:changed`, `chrome:page-tint`, and the rest of the 13 channels
  (25 send sites). The underlying strip keeps receiving what the rail and
  Glance need.
- **Coordinates.** The float view's origin is not (0,0). Its `island-rect`
  and tooltip anchors must be offset to window coordinates. `watchCursorFor`
  needs the view's origin as its offset.
- **Focus and keys.** Restoring focus to the pill after Escape; the focus sink
  when a focused tab detaches; `installChromeShortcuts`' `before-input-event`
  handlers (so ⌘⌥B, ⌘L and the rest work while the float view has focus);
  `warmStrip`'s frame wait before a reveal; the uBO popup's outside-click
  surfaces; crash diagnostics.
- **Underlying strip pill.** In float mode it is covered and must not report
  island geometry, hover or tooltips that compete with the float view's.

### Stacking

From bottom to top:

1. tab and Glance views
2. the utility sheet (it stays "always below the Island")
3. the controls and menu-button views
4. the float view
5. the fill-status capsule
6. the overlay
7. the permission view
8. the tooltip view and the uBO popup

Every path that attaches a tab view raises it to the top (`addChildView`
restacks), so the float views must be re-raised wherever
`restackPermissionView` and the overlay re-add run today: `setActiveTab`,
`setGlanceTab`, `showOverlay`, sheet show, fill-capsule attach. The tooltip
view is not re-raised after a tab attach today; check it stays above the float
view.

### Linux

Per `tab-view-lifecycle.js` and `overlay-view-lifecycle.js`, Electron 44 on
Linux stops drawing a view that is removed and re-added. The float views
therefore stay attached for their whole lifetime: hide with `setVisible(false)`
or off-window bounds, and raise by re-adding an existing child (which does not
detach it). Never remove and re-add them. Extend
`npm run test:tab-view-drawing:desktop` so a float view survives tab switches,
Move Tab to New Window and a space opened elsewhere.

### Motion and performance

The float view sits at its final bounds. The slide is a CSS transform inside
it (`translateY` from above, clipped by the view's top edge, which is the
window's top), not a native bounds animation per frame. The page view never
changes bounds on reveal or hide in float mode, so nothing relays out. Hide
runs the slide-out, then hides the view. Keep the existing two-frame warm-up
idea if the first reveal after a long hide stutters (it did under xvfb in
v1.39.0). Reduce Motion snaps.

### Drag band

The band is a `-webkit-app-region: drag` element in the window's own document
(the strip), replacing today's blanket `.strip-hidden { no-drag }`, which
stays no-drag below the band. Evidence that the window document's drag region
wins over child views:

- the drag-region fixtures README (macOS AppKit hit test runs before child
  views);
- v1.39.0's own finding that the hidden strip dragged the window through the
  page, on macOS and native Wayland.

There is no evidence yet for **Windows**. It gets proven at the hand-off (see
Spike and hand-off), and if neither approach drags, Windows ships float
without a band (owner decision above). Things to keep:

- double-click maximises (renderer.js);
- `drag-suspended` while the panel or palette is open;
- the band starts at the page pane's left edge in the vertical layout.

On native Wayland a drag region also stops the page receiving pointer moves
there. Reveal there then comes from the remaining 6–10px of the edge band and
the rest band, since Wayland reveal already depends on in-window moves. Check
it by hand.

### Settings, copy, schema

- New device-local key, suggested name `islandAutoHideStyle`:
  `'float' | 'push'`, default `'float'`, unknown values sanitise to
  `'float'`. Add it to `settings-schema/schema.json` `internalDefaults` next to
  `islandAutoHide`, never to `SYNCED_KEYS`, and run `settings:build`/`check`.
  No migration is needed: existing profiles have no value and read the
  default.
- Settings UI: under `#islandAutoHideSetting`, hidden while the toggle is off.
  Main applies a change live to every window, like `applyIslandAutoHide`.
- New strings in `copy/messages/en.json` and every selectable language (de,
  es, fr, pt-BR, it) in the same PR, per F44. The guarded files must pass
  `copy:check`.

## Spike and hand-off

**Where checks run.** This Mac runs macOS only. Windows and Linux (X11 and
native Wayland) checks run on the owner's other Mac, in Parallels. When the
work reaches its first Windows/Linux check, open a PR with everything so far
(spike included), with exact numbered steps for each check, and stop. The
owner continues from that Mac. Merge waits on those checks.

**Spike (throwaway), macOS here first:**

1. **Tight transparent view over a tab view.** It composites with a shadow,
   takes clicks only inside its bounds, and keeps drawing across tab
   switches.
2. **CSS slide inside a clipped view.** It reads as coming from above the
   window edge, with no native bounds animation.
3. **Drag band.** The window document's band drags the window and
   double-click maximises while a tab view covers it.

**At the hand-off, on Windows and Linux:**

1. **Drag band.** A drag region in the window's own document still drags
   where a child `WebContentsView` covers it. If not, try the fallback: a 6px
   transparent drag view on top. It would swallow the page's top pixels
   (accepted cost), and its own drag region must be shown to work. If neither
   drags, that platform ships float without a band (owner decision), and the
   band code is turned off there.
2. **Tight transparent view.** The same checks as spike item 1. On Linux it
   must also survive a re-raise without detaching.
3. **Native Wayland reveal.** Revealing still works with the band taking the
   top pixels.

Implementation stops at the Windows/Linux hand-off. Merge waits for those
results. Failure of the drag band alone may use the approved no-band
fallback; other failures must be resolved before merge.

**Results (2026-10-20, after the merge; full table on bnfy/blanc#994):**

1. **Drag band.** Drags on Windows, X11 and Wayland from the window
   document's own region, so the fallback view is not needed. Double-click
   maximises on Linux but not on Windows (the fallback view is no better
   there; recorded as a known limit in the 2026-10-19 spec and D29).
2. **Tight transparent views.** Composite with their shadow, take clicks only
   inside their bounds, and keep drawing across tab switches on all three
   (the drawing check passes 22 of 22 on xvfb and Wayland). On Linux in float
   mode the window document goes `hidden` once the page covers it whole and
   stops tracking resizes, so after a maximise the views are placed from a
   stale island-rect report and the controls' clicks miss. Fixed in
   bnfy/blanc#999: on Linux a covered strip keeps one row uncovered, and
   all four controls then land on X11 and Wayland.
3. **Native Wayland reveal.** Pointing 7–10px inside the edge or resting
   30px down reveals the pill with the band in place.

Cost: three renderers per window on Windows and Linux (pill, controls, menu),
about 335 MB RSS or working set between them, which counts shared pages per
process.

## Tests

- **Unit:** float pill bounds; the drag-band rect (island and vertical
  layouts); page top versus Island anchor in float, push and Glance-fallback
  states; settings default and sanitising; never synced; Settings placement.
- **Desktop acceptance** (new scenarios after F1-27 in
  `spec/acceptance/island-and-commands.feature`):
  - float reveal leaves the active tab at `y = 0` and shows the float view;
  - push mode keeps today's F1-15…F1-27 assertions (they run with push
    selected, or are split per mode);
  - Glance in float mode uses the push layout;
  - Windows/Linux controls stay visible while the Island is hidden in float;
  - the drag band reads as `drag` in both modes;
  - find, shield and Spaces anchor under the floating pill;
  - hover-open works on the floating pill.
  The test hook's `getChromeWebContents` users (`stripAppRegion`,
  `sendChromeMouseInput`, `getIslandAutoHideState`) need to address the float
  view where the pill now lives.
- **Unit tests that regex main.js** (island-autohide, island-hover-open-wiring,
  platform-main-menu, window-runtime-registry, linux-view-reattach,
  overlay-view-lifecycle, permission-prompt-focus) will need updating
  alongside.
- **Manual gates:** the drag band on macOS, Windows, Linux X11 and native
  Wayland (Windows and Linux at the hand-off above); the floating pill over
  light, dark and busy pages; the controls over a dark page.

## Docs to update with the implementation

- **D29** in `spec/divergence-register.md`: float by default, the push choice,
  window buttons that come and go with the pill (amended), the drag band. The parity contract is
  unchanged.
- **`2026-10-19-auto-hide-island-design.md`:** point Known limits at this
  spec.
- **CLAUDE.md:** the Architecture paragraph that says the window's own
  webContents is the strip, and the stacking list. Mirror the change in
  `AGENTS.md`.
- **Website:** no website or marketing copy until a release ships it, per
  `docs/marketing-claims.md`.

## Left to the builder

- The float document's form (new path versus surface flag), and the exact view
  sizes and shadow margins.
- How main tracks the float views on the window runtime.
- Drag-band height after hand testing.
- The settings key's final name and the Settings control's form (radio pair
  or segmented control), within the Settings page's existing patterns.
