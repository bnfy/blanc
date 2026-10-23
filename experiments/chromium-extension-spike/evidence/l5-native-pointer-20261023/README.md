# Native Split View input and framing repair — October 23, 2026

The owner found that clicking page content neither activated a pane nor allowed typing unless its header was clicked first. The full-height transparent Island NSView intercepted AppKit hits. A first attempt observing page interaction passed protocol-injected clicks but failed the owner's physical test; it is removed from the final source. The correction makes in-process hosted Cocoa views consult the enclosing Views hit target and return no hit when another view owns the point. AppKit then routes the click to the visible page. There is no new renderer IPC, permission or network surface. Remote app-shim views retain their prior fallback and are not newly qualified.

The requested visual change removes header bottom/right rules and the duplicate Chromium rounded pane frame. A subtle header fill identifies the active pane. Keyboard focus rings and the interactive divider remain.

## Final candidate and verification

- Source: `006ccda1e994f8468baf7b9663453be9aedb61ea`.
- Chromium157.0.8103.15, Apple Silicon, macOS27.2; separate preview identity.
- Stapled archive SHA256: `ca69ff73efc85f8daeefbc782d3f8793b29fcd7ae5248d984b1ea6c91567ab44`.
- Developer ID Anthony Loria (`XYGUCY4498`); Apple accepted `29ec9c3c-9623-4b79-bd7d-7f7d7348dc83`. Strict signature, Gatekeeper and ticket validation pass. Seventeen Mach-O and seven selected asset hashes remain unchanged after tests.
- 75 final signed runtime checkpoints pass:17 regular security,16 private security,19 bridge/scope,17 core browsing and6 recovery. These are bounded regressions, not a fresh complete release acceptance matrix.
- 16 focused source,7 capture and11 patch-counter tests pass; scoped ESLint passes.
- Successful incremental builds:42.03s/6steps for the superseded observer,38.14s/6steps for framing,45.05s/12steps for the corrected native hit-test path. A compiler failure from inline virtual definitions is retained; declarations/test doubles corrected. Final native guard0. Footprint70upstreamfiles/173hunks, recorded under standing owner authorization; no cold build.
- [Native/owner observations](native-observations.md): native clicks and typing work in both panes on the corrected signed app; Actions/Escape and divider keyboard control/reset pass. The owner explicitly confirms both panes activate and typing works. The border stack is absent in the observed presentation.

## Limits and open findings

The initial protocol-only tests did not exercise the macOS NSView hit path. Their passing results are kept under earlier attempts, alongside the owner's failure, and are not used as final physical-input evidence. The initial detached-tab assertion also assumed removal preserved the previously active tab; its corrected fixture follows actual native removal semantics. Bare output readiness attempts and a preparation-script quoting failure are retained. The superseded observer candidate was notarized, but never accepted for the physical defect.

**L5 remains open** for the remaining owner divider/narrow-window, theme/extension/permission and full VoiceOver/matched-visual session. This repair does not close L5 by itself.

**L6 is reopened for an independent owner-session finding:** “Tab closed, but history persistence failed or timed out.” remained visible after the initial close/cancel/leave steps and appears in the original browser log. No data loss is claimed from that message alone, but its history acknowledgement criterion is not accepted. Prior49-check/owner-mapped-UI acceptance remains historical evidence; the75 passing focused regressions do not override the observed failure. Current readiness: **6/12 (50%), delta -1 L6** pending disposition.

Google baseline and permanent profiles/tabs remain separate and untouched. Old disposable test windows are closed; the corrected signed owner-test window at port9873 stays open. Diagnostic profiles are retained for the unresolved warning; only completed regression profiles are removed. Latency remains deferred and the Electron diagnostic build remains pending approval/unstarted. No merge, ready or public-release approval is implied.
