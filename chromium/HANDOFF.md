# Foundation continuation for a fresh chat

Read the approved spec and plan in docs/chromium-replacement/, then chromium/STATUS.md and tracker.json. The execution contract was approved at e884a6564. Work from current files and actual processes.

## Current authorization
F0.1–F0.6 and F0.8, including necessary incremental builds, are approved. D7, F0.7, cold builds, new PW/PL/PM machines, D1/D2/D4–D6/D8/V2 and full-replacement D3 are pending. Owner D3 permits beta without DRM only; an EME playback notice and explicit current-page Electron handoff are required before beta.

## Source and candidate
Canonical source: chromium/blanc; patches: chromium/patches. The spike is frozen; preserve its old uncommitted work. Native checkout/cache: ~/Projects/BlancChromium158/src, out/BlancPrototype. Compiler, SDK and GN args remain pinned. The build wrapper requires the saved SDK real path; consult the durable build environment, not a new default. No clean, competing or cold build.

The canonical foundation and preview test hook compile. Zero-action guards passed. The current candidate identity is in tracker.json. The owner's running development app is a separate immutable artifact; preserve it and its tabs. Read Chromium Preview/evidence/chromium-development-process.json for its complete launch arguments. Do not quit, refresh or alter it without normal owner closure and the prescribed backup.

## Initial F0.5 baseline
The committed baseline JSON in chromium/scenarios/ binds source 2456e7046506c0bf89a9517551c006850fe201dd to native candidate macos-19b83f79bd18b94c. It represents 627 cases from 578 declarations: three passed on the native app, 622 have undefined adapters and were not executed, two are explicitly mobile-only. This is an initial partial-adapter baseline; F0.5 remains incomplete. Undefined adapters are not evidence of product absence. JUnit and a slice report are under chromium/reports. Raw results/profiles/failures remain durable outside Git under Chromium Preview/evidence/foundation/.

## Next actions
1. Extend the fork step library and transport while preserving the exact shipping assertions and backgrounds/examples. The shipping reference is v1.45.1 / 85883b1a; verify the latest release before new parity work.
2. Run affected new or changed cases; preserve failures and valid unchanged evidence. Do not repeat passed unrelated suites. Regenerate both progress displays through tools/progress.mjs after candidate changes and at slice boundaries.
3. Continue F0.3/F0.6/F0.8 under their real dependencies; the identity spike and platform-floor decisions remain unresolved. Do not infer plan completion from the initial baseline.
4. Commit and push real code with STATUS/tracker/evidence at session end. Keep STATUS short and overwritten; do not append routine history to CONTINUATION.md.

Electron product work stays paused; latency deferred; Google baseline separate. Retain signed masters and the Chromium157 fallback. Never put profiles, credentials, caches or apps in Git. No build or fixture process should be assumed running from a receipt; inspect actual processes first.
