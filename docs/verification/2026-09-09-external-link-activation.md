# External-link window activation — September 9, 2026

Local implementation on `codex/fix-external-link-activation`, based on
`c3a3eb44`. This is a signed local candidate, not a published release or an
installation over the owner's existing Blanc.

## Change

External HTTP(S) handoffs explicitly unhide macOS Blanc and restore/focus the
receiving window, with bounded native restore/activation follow-up. Pending
focus is canceled on another handoff, window hide/minimize/close, app resignation,
selection of another browser window, quit, or the two-second deadline.
Cancellation also covers the queue's wait for chrome readiness: a later user
hide/minimize cancels activation without dropping the URL. A fresh external
handoff creates new foreground intent, including when Blanc is already hidden.

Warm URL requests retain their receiving window/profile while chrome loads.
Cold requests wait for startup release and resolve against the restored window.
An incoming URL recreates a closed browser window without depending on a
separate app activation event. App activation preserves the last focused
runtime instead of resetting it to primary. Chrome readiness no longer releases
the startup URL gate before session restore and the blocker decision.

## Evidence

Host: macOS 27.0, build 26A5425a; Electron 44.1.1; macOS arm64.

- Full unit suite after the review correction: **1,594 passed, zero failed**.
  The focused activation/handoff/Dock set passed (**45 tests**). The new
  readiness-cancellation tests failed against the original implementation
  before the correction.
- New Electron lifecycle smoke: **passed** cold launch, hidden, minimized,
  combined hidden/minimized, no-window reopen without an `activate` event,
  named-profile routing, and second-instance multi-URL selection.
- Review regression: reproduced hide/minimize being undone while recreated
  chrome was delayed. Both deterministic Electron cases now **pass**: the
  delivered URL appears exactly once, selection stays unchanged, the newer
  hidden/minimized state survives readiness plus 2.2 seconds, and a fresh
  external link restores the window normally.
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
- The candidate rebuilt after the review correction passed that matrix again.
  Its first run stopped during Finder foreground setup before delivering the
  seventh minimized-case URL; a complete rerun passed all cases. That stopped
  run is not counted as a successful matrix.
- The original baseline and candidate matrices were also run with `open -g`, which
  delivers through LaunchServices without independently bringing Blanc forward.
  The baseline again failed closed-window reopening; the candidate passed the
  entire matrix, including **10 hidden and 10 minimized repetitions**.
- The rebuilt candidate's `open -g` repeat was **interrupted**, after background
  and nine hidden cases passed: Terminal (PID 78831, independently identified
  by process name) became frontmost during the tenth hidden case's stability
  assertion. This is not counted as a completed matrix for the rebuilt artifact.
- Native assertions use AppKit's frontmost process ID and WindowServer's
  onscreen browser window, in addition to the selected URL/tab. Foreground state
  must remain stable for 500 ms. These are not renderer-focus proxies.
- Candidate build completed the pinned signing/profile/entitlements verification,
  all eight hardened fuses, packaged blocker byte checks, and packaged compliance
  checks. Deep strict codesign verification passed outside the sandbox.

Candidate: `dist/mac-arm64/Blanc.app` (local package version remains 1.15.0).
The packaged main process files were byte-compared with this working tree.

`app.asar` SHA-256:
`2574141de087a814702cc03edd1a044dd6ac04aa8cf168a73000555cf3c231f0`

Signing identity: Developer ID Application: Anthony Loria (XYGUCY4498), pinned
certificate SHA-1 `55283A84D3706D5A22386D5F002A0CD4845ECFD4`.
This private candidate was not notarized or published.

## Still pending

The owner's exact hidden/minimized email-app failure was **not reproduced** in
the isolated baseline. The email application and precise hide/minimize action
have been requested so that path can be reproduced or owner-confirmed against
the candidate. Actual email-link and other desktop/full-screen Space confirmation
remain pending; no claim is made that these manual cases passed.
The rebuilt artifact's complete background-only LaunchServices repeat also
remains pending after the Terminal interruption described above.

Do not merge, tag, or publish a release until the affected-Mac confirmation is
recorded. The ordinary release protocol remains applicable.
