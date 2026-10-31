# Foundation continuation for a fresh chat

Read the approved spec and plan in docs/chromium-replacement/, then chromium/STATUS.md and tracker.json. The execution contract was approved at e884a6564. Work from current files and actual processes.

## Handback from Claude (2026-10-31)
Claude finished F0.5 for S1 (gap list reports/s1-macos.json), then, with the owner's go-ahead, completed F0.6 on macOS: candidate macos-790ca4d6d538c894 compiles the Island assets in, keys Blanc behaviour on blanc::IslandMode() (patch 0003), and runs the navigation group on the typed interface generated from browser-api/contract.json (patch 0004; tools/browser-api-mojom.mjs). Its baseline (scenarios/baseline-macos-790ca4d6d538c894.json) matches the previous candidate case for case. The runner stops when the display isn't rendering. The owner's dev instance (PID in evidence/chromium-development-process.json) was relaunched once with the owner's approval after a backup; otherwise untouched.

**Owner preference:** when native Chromium functionality looks easier to adapt than porting the Electron behavior, list it for the owner to assess before building either. The owner decided the open candidates on 2026-10-31 (STATUS.md, spec §4/§9). Never adapt a test to accept a native surface as parity.

## Current authorization
F0.1–F0.6 and F0.8, including necessary incremental builds, are approved. D7, F0.7, cold builds, new PW/PL/PM machines, D1/D2/D4–D6/D8/V2 and full-replacement D3 are pending. Owner D3 permits beta without DRM only; an EME playback notice and explicit current-page Electron handoff are required before beta.

## Source and candidate
Canonical source: chromium/blanc; patches: chromium/patches. The spike is frozen; preserve its old uncommitted work. Native checkout/cache: ~/Projects/BlancChromium158/src, out/BlancPrototype. Compiler, SDK and GN args remain pinned. No clean, competing or cold build. Current candidate identity is in tracker.json. The owner's running development app is a separate immutable artifact; read Chromium Preview/evidence/chromium-development-process.json and never quit, refresh or alter it without normal owner closure and the prescribed backup.

## Runner
Use Node 22 (/usr/local/bin/node; needs global WebSocket). Runtime config for the current candidate: Chromium Preview/evidence/foundation/f06-typed-runtime-config.json (embedded assets). Keep the screen unlocked during runs; the runner holds the display awake and stops if it stops rendering. Full run: `node chromium/tests/runner.mjs <config> <new durable dir>`. Development subset: add `--only=<text in the case id>` (never a baseline; progress refuses it). Re-run only affected cases and fold them in with `tests/merge-baseline.mjs`; regenerate `tests/slice-report.mjs` and `tools/progress.mjs`. `tests/coverage.mjs <slice>` shows statically missing hooks and steps. A new slice adds its shipping step files to tests/lib/shipping-core.cjs (audit imports) and its rows to tests/slices.mjs.

## Next actions
1. F0.3 under its dependencies; then S1 tasks in order against the S1 gap list. New native handlers go on the typed interface: add the group's Bind override in BrowserApiHost and its remote in blanc/island/browser-api.js.
2. Commit and push code with STATUS/tracker/reports at session end. Keep STATUS short and overwritten.

Electron product work stays paused; latency deferred; Google baseline separate. Retain signed masters and the Chromium157 fallback. Never put profiles, credentials, caches or apps in Git. Inspect processes before any build or fixture run.
