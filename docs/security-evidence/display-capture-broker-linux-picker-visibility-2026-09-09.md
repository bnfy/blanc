# Linux Playout picker visibility — 2026-09-09

Scope: Ubuntu 24.04.3 ARM64, GNOME Wayland, stock Electron 44.1.1 /
Chromium 152.0.7977.65. This investigation changes Linux overlay lifetime
only. No Mac/Windows native test, package rebuild, commit, merge, or release.

## Packaged observation

Authenticated AppImage `a0dfa75bccb5599eccba8fbd6d6f3def26e5c0b02cb7e5d41e83a86109b8deb0`
at `fda425eb`, running as `blanc-meet-playout` with CDP 9445. The live Meet
tab had moved to `ddm-yopa-fmk`; `bbu-qpjh-bwu` remains the original launch
URL, not the room used in this diagnostic.

The dependency-free Python CDP observer replaced the failed guest `ws`
import. It only read renderer state, with `Runtime.evaluate` explicitly
using `userGesture: false`; it never invoked capture or picker consent.

| UTC | Overlay mode | Document visibility | Focus | Observation |
| --- | --- | --- | --- | --- |
| 16:23:16 | closed | hidden | false | observer ready |
| 16:23:38 | `display-share` | **hidden** | true | owner clicked Present |
| 16:24:08 | closed | hidden | false | request timed out |

The renderer built a 680×258 picker centered in its 1024×678 viewport.
Its CSS visibility was visible, opacity 1, and Continue enabled. No renderer
exceptions were observed. Owner confirmed **“No card appeared”**; the
native VM window showed Meet and then its sharing-error dialog. Broker
`req-7` / `share-8` ended with `timeout` / `AbortError`; no capture-handler
installation or helper offer occurred. Previous `req-1`, `req-3`, and
`req-5` have the same timeout pattern. This attempt did not reach the portal
or helper and is not the older X11 display-open failure.

This proves `showOverlay` reached the overlay renderer, rather than a
missing picker model or immediate chrome dismissal. The 30-second request
window retained `display-share` while the native renderer remained hidden.

## Native reproduction and workaround

A throwaway, no-capture app on the guest's existing stock Electron runtime
reproduced the failure. After the overlay's first native removal and
reattachment, `view.getVisible()` and attachment were true and focus returned,
but `document.visibilityState` stayed hidden and animation frames stopped
at 128. Calling `setVisible(true)`, toggling false/true, and hiding while
detached before reattachment did not recover that view.

A fresh overlay retained as a child of its window worked across hide/show
and restacking. The final run loaded the **actual new product lifecycle
module**, byte-bound by SHA-256
`5a22d093b358c5ab1b2832b5748e0aed9fa721e4a6ff2ca3a67d0366df2627a5`:

| Phase | Native visible | Attached | Renderer visibility | Frames |
| --- | --- | --- | --- | --- |
| first show | true | true | visible | 43 |
| hide | false | true | hidden | 43 |
| reopen | true | true | visible | 87 |
| restack | true | true | visible | 129 |
| second reopen | true | true | visible | 173 |

Assertions passed (`PRODUCT_VIEW_LIFECYCLE_OK`, exit 0). This isolates a
Linux native-view reattachment failure and validates the workaround's
visibility/painting mechanism. It is **not** a full Blanc picker, portal,
capture, or conference pass.

## Working-tree fix and limits

`src/main/overlay-view-lifecycle.js` keeps Linux's overlay window-owned,
hides it with `setVisible(false)`, and raises/shows it on reopening.
`main.js` uses that lifecycle for both immediate dismissal and the existing
delayed panel retraction. It must apply to all Linux Island modes because
closing an address panel before Present previously detached the very view
the picker reused. Mac/Windows retain their existing detach/reattach path.

The existing timeout, consent, helper permissions, audio flags, renderer
styles, and source selection are unchanged. Targeted lifecycle, picker,
indicator, and runtime-registry tests: **30 passed, 0 failed**. Main syntax
and scoped whitespace checks passed.

No authenticated artifact was modified. The fix is **uncommitted and
unpackaged**. Linux conference remains **NOT RUN / BLOCKED before a usable
picker** on the existing AppImage; it cannot pass from the native probe.
Next: review/freeze the fix, authenticate a replacement Linux arm64 package,
then repeat Present and the original conference/control/negative gates.
Merge and release remain closed; no gate is waived.

## Records and cleanup

Under `output/display-capture-candidate-playout/linux-arm64/`:

- `inspect-picker.py`, `picker-snapshot.json`, `picker-watch.jsonl`
- `view-visibility-probe.cjs`, `view-visibility-probe*.log`
- `view-visibility-product-lifecycle.log`
- `picker-diagnostic-cleanup.json`

The observer exited. Each native probe deleted its own temporary guest
profile and app files after exit. The small reproduction scripts and
evidence logs are retained; no dependency download or Electron build ran.
