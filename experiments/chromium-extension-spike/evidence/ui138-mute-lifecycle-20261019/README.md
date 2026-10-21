# Site-wide mute lifecycle

## October 19 site-mute lifecycle checkpoint

Ten bounded native bridge checks pass: enabling site mute; per-tab exemption; same-host navigation retaining exemption; different-host navigation clearing site policy; return to the muted host resetting exemption; renderer crash followed by navigation retaining site policy; two fresh private-context mute/disposal cycles each leaving regular policy intact. A new private context starts without the disposed context's mute policy. Tests use local authored HTTP pages and real Chromium WebContents state. `Page.crash` deliberately produces a renderer fatal in the archived log; the outer browser survives and the replacement page is checked. No audible-output, physical-input, cross-window mute or BFCache mute claim.

No source change or compile. Build guard reports zero actions. Footprint remains previously measured41files/100hunks (not re-enumerated). Disposable browser/profile and server removed; retained preview's original tabs verified unchanged. Evidence: `evidence/ui138-mute-lifecycle-20261019/` with hashed archive and readable results. Latency deferred; Electron diagnostic build remains unapproved. Spaces/Glance, wider visuals/native input and broader lifecycle gates remain open; UI migration is not complete.

Prior shutdown follow-up a574ec3d completed CI:27passes, two skipped (linux-native-diagnostics/installed-intel), no new CodeQL alerts. Windows shutdown and primary-close explicitly pass. This evidence checkpoint requires its own CI.
