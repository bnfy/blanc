# Browser-owned Downloads controller v7 — reentrancy candidate

This is a separate unregistered candidate; v6 is preserved. Latest published release and direct tag were checked for the same Downloads work item on 2026-10-29: Blanc v1.45.0, commit `6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`.

Independent v6 review identified a post-take race: observer destruction while reconciling generation N can synchronously start N+1 or reset the document, after which the N method could still return true and invite stale publication. V7 separates ticket phases (open, taken, committed), and only commits N after reconciliation returns, the controller weak pointer remains valid, and the document and epoch/generation still match. `CanPublishSnapshot` rechecks the committed ticket and bound document; the future publisher must call it immediately before its UI-sequence publication without yielding, and it must supply the actual browser-owned receiver frame. This is not a wired publication boundary or proof of cross-process timing.

Review also found that v6 cleared handles before revoking the old document. V7 revokes the document and changes its epoch/generation before swapping handles into a detached local map. Its helper destroys old observers only after revocation and detachment. A reentrant bind can supersede the outer bind, which checks the controller weak pointer, returned reset epoch, profile weak pointers and existing binding before installing its document.

Focused tests exercise the actual snapshot gate, reconciliation and reset helpers: late old and duplicate completions, invalid snapshot handling, document epoch change, overflow, a destructor starting a newer snapshot, a destructor resetting the epoch before commit, and reset-before-destructor reentry. They compile with `xcrun clang++ -std=c++20 -Wall -Wextra -Werror` and exit 0 with assertions. The pinned Chromium 158 syntax-only check of the actual controller exited 0 (`syntax-command.json` and `syntax.log`); inherited environment and transitive inputs are not fully pinned. The fake helpers do not execute real `DownloadItem` observers, delete an actual controller, exercise weak-pointer invalidation, dispatch IPC, or prove real browser focus, activation or reentrancy. V5's cancel path tests were not repeated.

The controller remains unregistered. Authoritative owner-window identity, actual overlay activation, live visibility and warning/enterprise action policy, handle bounds for abandoned snapshots, actual regular/private manager and item lifecycle, UI and command outcome tests are required before exposure. No native build, real browser, user profile or release gate was exercised.

Frozen SHA-256:
- `download-controller.cc`: `0849686d2cd078f994831ce59b2e74c7f9fa7f5481dbaec7931be34de4794f5c`
- `download-controller.h`: `9a22738c4c8cd4753753ec9cbf7d6cea7d40efc107be2e7d5674e40c7b5593c3`
- `snapshot-gate.h`: `425a0ead99ed633919c11b674f6fb7879e75dcb3e71c8043635dc4e47b9cd14a`
- `reconcile.h`: `3d5a47534a0c0308a44a3c00714f17cf12446fe3af2b8d3c105ff97919fa8e26`
- `reset-state.h`: `cead36f91e3f53f7f78099a8ed0d7ae55081e640ad3d077c6c745ae91e476086`
- `snapshot-order-test.cc`: `41e3e0f9ca42b48c6dc72a5b7142a9a3391fd4f21fc8da67c04f4685a57aa857`
