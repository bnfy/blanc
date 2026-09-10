# External-link window activation — September 9, 2026

Local implementation on `codex/fix-external-link-activation`, based on
`c3a3eb44`. This is a signed local candidate, not a published release or an
installation over the owner's existing Blanc.

## Change

External HTTP(S) handoffs explicitly unhide macOS Blanc and restore/focus the
receiving window, with bounded native restore/activation follow-up. Pending
focus is canceled on another handoff, window hide/minimize/close, app resignation,
selection of another browser window, quit, or the two-second deadline.

Warm URL requests retain their receiving window/profile while chrome loads.
Cold requests wait for startup release and resolve against the restored window.
An incoming URL recreates a closed browser window without depending on a
separate app activation event. App activation preserves the last focused
runtime instead of resetting it to primary. Chrome readiness no longer releases
the startup URL gate before session restore and the blocker decision.

## Evidence

Host: macOS 27.0, build 26A5425a; Electron 44.1.1; macOS arm64.

- Full unit suite: **1,583 passed, zero failed**. After that run, the additional
  no-active-tab chrome-readiness test and the full focused activation/handoff/
  Dock set passed (**35 tests**).
- New Electron lifecycle smoke: **passed** cold launch, hidden, minimized,
  combined hidden/minimized, no-window reopen without an `activate` event,
  named-profile routing, and second-instance multi-URL selection.
- Existing cold-launch focus smoke: **passed**.
- Existing tab-import handoff smoke, which shares the activation helper: **passed**.
- Acceptance dry run: **141 scenarios / 865 steps resolved**, no undefined steps;
  this is a definition check, not execution of those scenarios.
- Public `/Applications/Blanc.app` v1.15.0: native LaunchServices tests passed
  background, hidden **10/10**, minimized **10/10**, and combined states, but
  **failed after the last browser window was closed**. The requested URL never
  appeared in a selected tab and no chrome window was available.
- Signed candidate: the same native matrix **passed**, including closed-window
  reopening and the check that later background reloads leave Finder frontmost.
- Both baseline and candidate matrices were also run with `open -g`, which
  delivers through LaunchServices without independently bringing Blanc forward.
  The baseline again failed closed-window reopening; the candidate passed the
  entire matrix, including **10 hidden and 10 minimized repetitions**.
- Native assertions use AppKit's frontmost process ID and WindowServer's
  onscreen browser window, in addition to the selected URL/tab. Foreground state
  must remain stable for 500 ms. These are not renderer-focus proxies.
- Candidate build completed the pinned signing/profile/entitlements verification,
  all eight hardened fuses, packaged blocker byte checks, and packaged compliance
  checks. Deep strict codesign verification passed outside the sandbox.

Candidate: `dist/mac-arm64/Blanc.app` (local package version remains 1.15.0).
The packaged main process files were byte-compared with this working tree.

`app.asar` SHA-256:
`d1991406642517c1aa900defa34a02e52e88aa9e8490d16e88c0db0a6bc58ffd`

Signing identity: Developer ID Application: Anthony Loria (XYGUCY4498), pinned
certificate SHA-1 `55283A84D3706D5A22386D5F002A0CD4845ECFD4`.
This private candidate was not notarized or published.

## Still pending

The owner's exact hidden/minimized email-app failure was **not reproduced** in
the isolated baseline. The email application and precise hide/minimize action
have been requested so that path can be reproduced or owner-confirmed against
the candidate. Actual email-link and other desktop/full-screen Space confirmation
remain pending; no claim is made that these manual cases passed.

Do not merge, tag, or publish a release until the affected-Mac confirmation is
recorded. The ordinary release protocol remains applicable.
