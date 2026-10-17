# Optional hover-open and pinned homes

- Date: 2026-10-17
- Status: proposed; implementation-ready
- Source: Reddit feedback from `u/Unfair-King-8224`

## 1. Summary

Two small requests point at the same goal: make the Island quicker to use while
keeping Blanc predictable.

1. **Open the Island on hover** is a device-local, opt-in setting. When enabled,
   a mouse resting over the collapsed Island for 300 ms opens the same panel as
   a click. Moving across it does nothing. Click, keyboard and touch behaviour
   stay unchanged.
2. **Pinned tabs remember a home page.** Pinning a tab records its current URL
   as its pinned home. During the current session the tab behaves normally and
   keeps its navigation history. After a normal quit and relaunch, the pinned
   tab starts at its home instead of the last page reached inside that tab.

These are independent features and can ship separately.

### Reddit request traceability

The pinned-home work directly answers the request that pinned tabs behave like
Zen/Arc by staying tied to the first URL chosen when the person comes back to
the browser. In Blanc, that means:

- the URL showing when **Pin Tab** is chosen becomes the tab's stable home;
- browsing away from that home is allowed during the current session;
- after quitting and reopening Blanc, the pinned tab opens at its home again;
- the person can deliberately replace the home with **Make This the Pinned
  Home**.

This is the specific Zen/Arc-like behavior requested, not a promise to copy
either browser's complete pinned-tab system. Blanc deliberately does not reset
the tab on every selection, share one live pin across windows or Spaces, or
discard the last page during crash recovery.

## 2. Goals

- Let people who prefer pointer-driven navigation reveal the Island without a
  click.
- Avoid accidental openings while the pointer is merely crossing the strip.
- Make a pin mean “keep this site here,” matching the useful part of the
  Zen/Arc mental model without turning every tab selection into a reload.
- Preserve keyboard access, current click behaviour, in-session history, lazy
  restore, crash recovery, private-tab rules and Blanc's existing session
  compatibility.

## 3. Non-goals

- No hover-to-select for tab dots or rows.
- No automatic closing while the pointer leaves the expanded panel. Existing
  Escape, outside-click and focus rules remain authoritative.
- No reset of a pinned tab each time it is selected.
- No sharing one pinned tab instance across windows, profiles or Spaces.
- No change to what “pin” means for ordering, grouping, Quiet Tabs or tab sync.
- No attempt to copy Zen or Arc's complete pinned-tab UI.

## 4. Optional hover-open

### 4.1 Setting and copy

Add a device-local boolean setting:

```js
islandHoverOpen: false
```

It is not Profile Synced (keep it out of `SYNCED_KEYS`). Put it in
**Settings → General**, immediately after **Tab layout** (`#tabLayoutSetting`).
The Island stays available in both tab layouts, so the row is shown whenever
the build supports the setting (`supports('islandHoverOpen')`), independent of
the chosen layout.

- Label: **Open the Island on hover**
- Hint: **Rest the pointer on the Island to open it without clicking.**

Default is off. Existing users do not acquire a new interaction unexpectedly.

### 4.2 Interaction contract

When the setting is on and all of these conditions remain true for 300 ms:

- the window is focused;
- the Island is collapsed;
- the pointer is inside the resting `#islandPill` hit box;
- the device reports a hover-capable fine pointer (see §4.3);
- no native context menu, drag, permission prompt, Glance, utility sheet or
  other Island popover is active (`overlayMode` is null and no utility sheet
  or Glance surface is showing);

Blanc opens `showOverlay('panel')`, exactly as a click on the pill does.

The timer is cancelled when any condition stops being true. Re-entering starts
a fresh 300 ms dwell. The dwell fires once per entry; after the panel closes,
the pointer must leave the resting pill and enter it again before hover can
open it a second time. This prevents an outside-click close from immediately
reopening the panel under a stationary pointer.

Pointer motion inside the pill does not restart the timer. Pointer proximity
outside the pill continues to produce the existing rise/grow response but
never starts the open timer.

### 4.3 Input and accessibility

- Click and Enter/Space still open immediately.
- ⌘L/Ctrl+L and typing-to-open are unchanged.
- Touch and coarse-pointer input never hover-open. Electron's
  `MouseInputEvent` carries no pointer type, so main cannot tell a mouse move
  from a touch-synthesized one. The chrome renderer instead reports
  `matchMedia('(any-hover: hover) and (any-pointer: fine)')` (and its changes)
  to main, and the dwell arms only while that is true. On a hybrid touchscreen
  laptop a tap still opens through the ordinary click before any 300 ms dwell
  could elapse, and the dwell's once-per-entry rule (§4.2) keeps the pointer
  left resting there after the tap from reopening the panel.
- Reduced-motion changes no timing or behaviour; it continues to affect only
  animation.
- Hover opening moves focus to the existing address input, as every panel open
  does today. There is no new focus path or live-region announcement.
- Vertical-tabs mode keeps the Island for search and commands, so the setting
  remains effective there.

### 4.4 Architecture

The existing proximity path already sees pointer movement across both the page
and chrome views:

`webContents 'input-event' (mouseMove, via watchCursorFor) → updateIslandProximity → chrome:island-proximity → renderer`

Two properties of that path matter here:

- Moves over the expanded overlay are not watched, so the state machine sees
  no exit while the panel is open. That is the intended behavior: after a
  close, hover stays disarmed until the first watched move outside the pill.
- When the overlay retracts, `hideOverlay` samples
  `screen.getCursorScreenPoint()` and feeds it to `updateIslandProximity`.
  That sample must not count as a fresh entry; it only establishes the
  "inside, disarmed" state that case 6 in §4.5 depends on.

Extend the main-process side with a small pure state machine rather than using
DOM `mouseenter`, because most approaches begin over a page `WebContentsView`.
The renderer's reported `islandRect` remains the sole geometry authority.

Add `src/main/island-hover-open.js` with pure transitions for:

- pointer entered/exited the exact rectangle;
- dwell armed/cancelled/fired;
- overlay/window/settings eligibility changes;
- re-arm only after an exit.

`main.js` owns the timer and calls the existing `showOverlay('panel')`. It must
re-check the focused runtime, setting, overlay state and rectangle when the
timer fires. A stale timer must never open an Island in another window.

Settings changes apply live. Turning the option off cancels every armed dwell.

### 4.5 Hover acceptance cases

1. Default/off: entering and remaining over the pill for more than 300 ms does
   not open it.
2. On: 299 ms does not open; 300 ms opens the ordinary panel once.
3. Crossing the pill and leaving before the dwell cancels the open.
4. Moving within the pill does not postpone the open.
5. Entering only the 250 px proximity band animates but never opens.
6. After an outside-click dismissal under a stationary pointer, it stays
   closed until pointer exit and re-entry.
7. A click during the dwell opens once and cancels the pending hover open.
8. Context menus, shield/Space popovers, permission prompts, Glance, the
   utility sheet and active drags suppress hover opening.
9. Switching focus or windows cancels the old runtime's dwell.
10. Mouse works on macOS, Windows and Linux; touch/coarse input does not arm.
11. A tap on a touchscreen opens through the click path, and the pointer left
    resting there afterwards does not reopen the panel once it is closed.

## 5. Pinned homes

### 5.1 User model

When the person chooses **Pin Tab**, Blanc records the tab's current
persistable URL as `pinnedHomeUrl`.

- They can keep browsing inside that tab for the rest of the session.
- Switching away and back returns to the current page with history intact.
- After a normal quit and relaunch, the tab opens at `pinnedHomeUrl`.
- **Unpin Tab** clears `pinnedHomeUrl`.
- Pinning it again captures the page that is current at that moment.

Add two items to the existing tab context menu for a pinned tab:

- **Return to Pinned Home** — enabled when the current persistable URL differs
  from the home; navigates there in the current tab.
- **Make This the Pinned Home** — enabled when the current URL is a supported
  persistable destination and differs from the home; updates the home without
  requiring an unpin/re-pin cycle.

The commands apply to both the resting pill and an expanded-Island tab row.

### 5.2 Supported homes

A pinned home may be:

- `http:` or `https:`;
- a restorable local HTML `file:` URL already allowed by Blanc;
- a restorable first-party `blanc:` page.

Transient pages are not homes: `blanc://error`, permission prompts, capture
helpers, extension internals and other utility URLs. `persistableUrl()` unwraps
an error page to its real destination before validation.

Private tabs keep today's non-persistent semantics. The tab context menu
already offers **Pin Tab** for private tabs, so a private pinned tab records
its home in memory only. The home never reaches disk, Spaces, closed-tab
entries or sync, and disappears with the private tab.

### 5.3 Clean launch versus recovery

The reset happens only after a clean, ordinary shutdown.

- **Clean relaunch:** restore a pinned tab from `pinnedHomeUrl`; it may remain
  quiet/asleep under the current lazy-restore policy.
- **Crash/session recovery:** restore the last committed `url`, not the pinned
  home, so recovery does not discard the page the person was using when Blanc
  stopped unexpectedly.
- **Restart Now after an update:** treat it as a clean relaunch and use pinned
  homes. The update flow is an intentional restart, not crash recovery.

This distinction uses the existing crash ledger. It does not introduce a
second shutdown marker.

- Capture `diagnostics.sessionRecoveryPending()` once at startup, before any
  call to `diagnostics.resolveSessionRecovery()` clears it (including the
  automatic resolve when only a single blank tab was open), and use that
  captured value for the pinned-home decision.
- When recovery is pending, the recovery prompt offers **restore** or
  **fresh**. **Restore** reopens pinned tabs at their last `url`, keeping
  `pinnedHomeUrl` attached so the next clean launch still returns home.
  **Fresh** restores nothing, as today.
- **Restart Now** reaches `autoUpdater.quitAndInstall()` through
  `src/main/update-restart.js`. The plan must verify that this path still
  fires `will-quit` (where the ledger's `endSession()` runs) on macOS, Windows
  and Linux. If any platform skips it, end the ledger session explicitly in
  the restart path rather than treating the update as a crash.

### 5.4 Persistence and compatibility

Store the optional home in the aligned `meta` entry:

```json
{
  "title": "Inbox",
  "favicon": null,
  "pinnedHomeUrl": "https://mail.example/"
}
```

Why `meta`, rather than another top-level parallel array:

- old builds already ignore unknown metadata keys;
- unpinned tabs pay no schema cost;
- the value stays aligned through the existing tab filtering and ordering
  paths;
- session format version does not need to change.

`sessionTabMeta()` includes `pinnedHomeUrl` only when the tab is pinned and the
home passes the same persistence policy as the tab URL. History clearing keeps
the pinned home: it is an explicit tab setting like a custom tab name, not
browsing-history decoration. The current page title and favicon still clear.
Today `metaAfterHistoryClear()` keeps the meta column only when some entry has
a `customTitle`, so extend that condition and the per-entry rewrite to keep
`pinnedHomeUrl` as well.

Old sessions with `pinned: true` and no `pinnedHomeUrl` migrate lazily: the
restored URL becomes the home in memory, and the next normal session write adds
it. No bulk migration or one-time marker is needed.

### 5.5 Spaces, groups and sync

- Group membership has no effect on the pinned home.
- Duplicating a pinned tab copies its home because the duplicate is pinned too.
- Reopening a closed pinned tab restores its home metadata as well as its last
  current URL. `closed-tabs.js` copies an explicit field list
  (`buildTabEntry`, `buildGroupEntry` and their restore projections, next to
  `customTitle` and `pinned`), so add `pinnedHomeUrl` there.
- Moving a tab to another window carries its home.
- Saving and restoring a Space preserves the home for pinned members. Extend
  the Space's aligned metadata with the same optional key.
- Device tab sync continues publishing the tab's **current URL**, because the
  remote-tabs UI describes what is open now. `pinnedHomeUrl` is not added to a
  remote device's visible tab record.
- If a future “open this whole remote session” flow preserves pinned state, it
  may use the received current URL as the new device's home. The home itself is
  not a cross-device command.

### 5.6 Navigation and failure behaviour

`Return to Pinned Home` uses the normal top-level navigation policy. If the
home cannot load, Blanc shows the existing error page and retains the home so
Retry and the next launch still target the intended site.

At restore, an invalid or newly forbidden stored home is dropped and Blanc
falls back to the stored current URL. It never opens an unsupported scheme.

### 5.7 Pinned-home acceptance cases

1. Pinning on URL A records A. Navigating to B and switching tabs preserves B
   and its back/forward history for the current session.
2. A clean relaunch restores the pinned tab at A.
3. Crash recovery restores it at B.
4. Unpinning clears the home; re-pinning on B records B.
5. **Make This the Pinned Home** changes A to B and persists it.
6. **Return to Pinned Home** navigates from B to A through the normal policy.
7. An old pinned session without the field uses its saved URL as the home.
8. Lazy/asleep restore paints the saved title/favicon while its eventual load
   targets the home.
9. Private pinned tabs write neither current URL nor home.
10. Duplicate, closed-tab reopen, window move, group move and Space restore
    keep the home aligned with the correct tab.
11. History clearing keeps the home but clears ordinary title/favicon history.
12. Invalid, utility and forbidden homes fall back safely to the current URL.
13. Recovery **restore** reopens at B with home A kept; the next clean launch
    opens A.
14. Restart Now after an update opens pinned tabs at their homes on macOS,
    Windows and Linux.

## 6. Delivery sequence

### Milestone A — hover-open

1. Setting validation, Settings UI and localized copy.
2. Pure hover state machine and unit tests.
3. Main-process wiring to the existing proximity geometry.
4. Desktop acceptance on macOS, Windows and Linux.

### Milestone B — pinned homes

1. Tab record and session/Space metadata.
2. Pin/unpin capture and legacy-session fallback.
3. Clean-start restore selection, preserving crash recovery.
4. Context-menu actions and copy.
5. Unit, migration, session recovery and packaged desktop acceptance.

The features should not share a release flag or implementation module. A defect
in one must not block or disable the other.

## 7. Release and messaging gate

Neither feature is a public Blanc capability until it is in a released build
and passes the relevant release evidence. Until then, community replies may say
the suggestions are being explored or worked on, but must not say Blanc opens
on hover or that pinned tabs return home today.
