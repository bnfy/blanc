# Find in page: current 158 scoped observations

GitHub latest release endpoint was checked for this work and returned Blanc
v1.45.0, target commit `6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`. Shipping
find uses the transient capsule, match count, arrows and keyboard events in
`src/renderer/overlay.js`. This is source comparison, not a fresh installed-app
visual or behavior comparison.

The copied, isolated Chromium 158 groups candidate app inventory matched all
353 entries of the previously verified `build-closure1/app-inventory.json`.
Its framework SHA-256 was
`237242c7e2ddfab4d8fa49528b98a130c1e11dff9f80ffa1db39c0cdc8c06fa1`;
all 78 files matched `manifest-visible-v2.json` (SHA-256
`ad4ae8585d0c4617464b92c4b35ae063d1512eb6c50f88c3104d8a0b47cefa54`),
and the 18 blocker files matched their existing receipt. This was the copied
candidate, not the running user development instance, the unbuilt combined
candidate, or a signed release. No build, Electron app or permanent user
profile was used. Each run had its own profile, CDP port, local page and proxy;
these controls do not prove host-wide outbound network denial. The owned
browsers exited 0 and each failure profile is retained.

- `keyboard1.json`: active regular fixture became ready, but a synthetic CDP
  Cmd-F did not open the capsule within the timeout. The result does not prove
  physical keyboard behavior: focus and OS accelerator routing were not
  independently observed. `find-keyboard-fixture.mjs` and the log are retained.
- `controls1.json`: calling the existing host entry opened the visible capsule;
  a CDP pointer/input attempt did not produce the expected `1/3` count before
  timeout. Focus and input delivery were not independently established.
- `controls2.json`: the existing host entry opened the visible capsule; a
  script-dispatched input event did not produce `1/3` before timeout. This
  diagnostic had a readiness flaw: it waited for iframe visibility, whereas
  `openFindBar()` emits `onOverlayShow` and sets the overlay find mode in a
  later animation frame. The input may have arrived before `findTabId` was set,
  or that frame may not have run while the surface was backgrounded. It cannot
  distinguish a fixture readiness issue from a product failure. No fourth run
  was made. Scripts and browser logs are retained alongside JSON receipts.

Earlier real-browser evidence for the distinct 138 candidate is linked in
`../ui138-find-20261018/README.md` and related find evidence directories; it
is historical and does not qualify these current 158 bytes. For current 158,
remaining work includes a readiness-observing fixture, authentic keyboard and
focus, regular/private search results, navigation and lifecycle, physical
accessibility, shipping visual comparison and Windows/Linux acceptance. These
observations are not full parity or release-gate evidence.

## Corrected readiness diagnostic

`controls3.json` uses the same framework and asset identities with a fresh
regular fixture profile. It waits for the copied overlay document's
`body.dataset.mode` to become `find`, which is assigned in `applyMode` after
`onOverlayShow` and the overlay's find tab identity are set. The host entry
made the iframe visible, but the overlay mode remained the empty string until
the 12-second timeout; no search input was dispatched. The owned browser exited
0, and the failure profile and log are preserved. The result narrows the
failed tests to the visibility-to-overlay-show handoff/readiness, but does not
establish whether an animation frame was suppressed, a listener was not ready,
the event was lost, the renderer failed, or a product user would observe the
problem. `find-controls-ready-fixture.mjs` and `controls3.json` record exact
fixture and candidate hashes. No physical keyboard, private mode, release
gate, or full product parity claim follows.

## Instrumented handoff diagnostic

`handoff1.json` binds framework `237242c7...` and assets manifest
`ad4ae858...`; the app inventory, 78 assets and 18 blocker files were matched
again before launching. The fixture wraps host animation-frame scheduling and
`onOverlayShow` subscription in memory, then reloads only its own overlay to
observe registration; that reloaded schedule is not a reproduction of the
original startup race. The overlay listener registered, `DOMContentLoaded`
and `load` occurred, and the host scheduled the animation-frame callback. It
never fired during the 12-second wait; no `onOverlayShow` delivery, captured
renderer/callback error, or status message was observed. The host document
reported `visibilityState: hidden`. No search input was dispatched. The owned
browser exited 0 and its failure profile and browser log are preserved.

This identifies the immediate cause of this **fixture's** uninitialized Find
capsule: its host animation frame did not run while the observed host document
was hidden. It does not show whether the user's foreground development browser
is hidden, whether this is normal for its WebContents arrangement, or whether
real keyboard input or product use hits the same condition. Old callbacks may
remain subscribed during this artificial overlay reload. No production source
or candidate assets were changed, and no further run was made.

## Foreground and visible-host investigation

GitHub latest release was checked again and returned v1.45.0 at `6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`. Before these checks, all 353 copied app inventory entries, 78 visible-v2 asset files and 18 blocker files matched their prior receipts. The framework was `237242c7e2ddfab4d8fa49528b98a130c1e11dff9f80ffa1db39c0cdc8c06fa1`; asset manifest was `ad4ae8585d0c4617464b92c4b35ae063d1512eb6c50f88c3104d8a0b47cefa54`. This is an isolated unsigned Mac candidate, not the user dev instance or the unbuilt combined candidate.

- `foreground1.json` stopped before browser launch when the default sandbox denied the loopback listener; no fixture profile was created.
- `foreground2.json`: the owned host document was visible, but `Page.bringToFront` did not make its process macOS-frontmost. It stopped before Find input and the owned browser exited 0.
- `foreground3.json` and `foreground4.json`: the existing ownership-checked helper could not normally activate the owned fixture window; the second receipt identifies `activation_request_failed`, with `activation_accepted: false`. The owned browsers exited 0. These do not establish an actual Find failure.
- `hostvisible1.json`: without bringing the page target forward, the host was initially visible and the capsule appeared, but overlay `body.dataset.mode` never became `find` before timeout. The owned process was not macOS-frontmost; no search input was dispatched and the browser exited 0.
- `handoff-visible1.json`: a diagnostic overlay reload registered the listener and scheduled the host RAF while host visibility was `visible`; the callback never fired, the mode stayed empty, and host visibility was `hidden` at final observation. No `onOverlayShow` delivery or recorded renderer exception occurred. This owned browser exited 0 and the profile is preserved. The instrumentation and overlay reload change timing, and the process was not confirmed foreground, so this does not prove the original startup race or a foreground-user failure.

Failed fixture profiles/logs are preserved. The AppKit refusal and macOS focus state are actionable limitations to physical-foreground assessment; no physical keyboard, private mode, shipping visual comparison, or cross-platform acceptance is claimed.

## Find handoff fallback candidate

A separate unpromoted host candidate and source review package live at `../../find-show-handoff-draft/`. It adds guarded timer and late-subscriber delivery for the Find show handoff; group-candidate host SHA is `853a2a9f700cae4084e3badaa4c463005a5b3159554fcf50ec78d48509cb7eaa`. In `find-fallback-diag2.json`, the copied 158 groups framework `237242c7...` with the candidate 78-file bundle and a fresh owned regular profile passed host entry, overlay Find initialization, fully loaded local page query `1/3`, Enter `2/3`, and close; browser exit was 0 and the fixture profile was removed. The test dispatches events via script and does not establish physical shortcut, actual foreground, private, accessibility or cross-platform behavior. The distinct combined-host candidate was not run in a browser.

`find-fallback1.json` and `find-fallback-diag1.json` remain failures with preserved profiles. The diagnostic confirmed a request and 0/0 reply, but those runs did not wait for the page body to load; the new diag2 did. This is not evidence that user Find was broken or that all Find behavior now matches shipping.

`find-fallback-private1.json` passed the v1 candidate (`853a2a9f...`) in an isolated non-default private context, with host/page matched, all tabs private, private theme, loaded-page `1/3`, Enter `2/3`, close, and browser exit 0. Synthetic script input and host entry remain the scope; no physical keyboard or full parity is claimed. Subsequent v2 code changes to address reviewer-identified races are unqualified by this run.

`find-handoff-v3-regular1.json` and `find-handoff-v3-private1.json` passed the reviewed v3 groups-compatible host (`6c1dd9d8...`) and adapter (`59c25c4b...`), with all 78 assets bound by manifest `9fbce34e...` and copied framework `237242c7...`. Both loaded the page before opening Find, observed Find mode, scripted a three-match query, advanced to the next result and closed; the private test verified unique host/page non-default context, all tabs private and private theme. Both owned browsers exited 0, and the successful fixture profiles were removed. These remain scoped scripted checks: native Cmd-F, physical focus, visual/accessibility, lifecycle and Windows/Linux are unverified. The tested host/adapter source is integrated in `prototype/`, not yet running in the user dev instance. Earlier failed results remain intact.
