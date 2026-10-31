# Chromium replacement status

Execution contract: spec and plan approved at e884a6564. Active slice: F0 Foundation.

## Authorization
F0.1–F0.6 and F0.8, with necessary incremental builds, approved.
D7, F0.7, cold builds, new machines, D1/D2/D4–D6/D8/V2 and replacement D3
remain pending. D3 beta-only no-DRM exception accepted; EME notice/handoff required.

## Current work
- F0.1/F0.2/F0.4/F0.8 as before; F0.3 pending.
- **F0.5 S1 finish line reached** on the previous candidate (19b83f79): all 253
  S1-tagged cases have a real result or a named undefined reason (70 pass, 152
  fail, 31 undefined). [reports/s1-macos.json](reports/s1-macos.json) (+ JUnit)
  lists per-row results and reasons; it stays the gap list until the new
  candidate's baseline replaces it.
- **F0.6 built, except the typed interface.** Candidate macos-d1984adbf76df5f0
  (two incremental builds, 8 and 13 steps; toolchain, SDK and GN args
  unchanged): the 73 served Island files are compiled in from `blanc/island/`
  (`blanc/island_resources`); the asset-folder switch survives only in preview,
  non-official builds (`ENABLE_BLANC_DISK_ASSETS`, proven by
  `tools/check-hook-gates.py`); patch 0003 keys Blanc behaviour on
  `blanc::IslandMode()` instead of that switch (8 upstream sites). Smoke
  (`tests/embedded-assets-smoke.mjs`): with no asset folder the Island and
  Blanc's Start Page load, and 54 of 73 resources read back byte-identical (the
  rest are not retrievable from cache). The typed interface from
  `browser-api/contract.json` is not started.
- **Baseline on the new candidate: not recorded yet.** The first full run
  (3a94ff5c) ran with the display asleep and the screen locked from case 12
  onward; the Island opens on an animation frame, so 36 cases that pass on a
  rendering display failed. That run was discarded. The runner now stops when
  the browser gets no animation frame (b75120d6) and holds the display awake
  for the run. Re-run with the screen unlocked.
- Runner: shipping's 24 S1 step files and fixture server load unchanged from
  v1.45.1 (85883b1a); adapters (tests/adapters/) map shipping hooks to the Island
  facade, native dispatch, Island DOM and CDP; fork steps (tests/fork-steps/)
  cover S1 texts shipping never defined. Cases run their defined prefix and retry
  a failure once. Profiles live in local temp storage; only logs and errors are
  kept. Guards before each case: free memory, and a rendering display.

## Observed problems to investigate
- Chromium's teardown watchdog ("Teardown watchdog expired") terminates some test
  browsers on quit (exit 2), intermittently. Cause not confirmed; such cases are
  recorded as failures with the log line.
- The Island's `styles.css` is served without a charset and decoded as
  Windows-1252 (non-ASCII is only in comments today). Same on disk and embedded.
- The Start Page requests `onboarding.js` and `onboarding-guard.js`, which were
  never in the served set.
- A tab created through CDP `Target.createTarget` gets Chromium's NTP, not
  Blanc's Start Page; Island-created tabs are correct.
- 2026-10-30 memory incident (parallel runners, leaked helpers, profiles in the
  synced folder): fixed. Run one native test browser at a time; launch the dev
  instance with `open -n` so it never belongs to an agent's process tree.

## Reading the failures
Most failures on the previous candidate are real product gaps, clustered:
- Settings opens chrome://settings (no Blanc controls): 42 Island hover/auto-hide
  cases, search engine, suggestions, theme, bang and tab-icon settings.
- Private tabs refused (D1 pending): F4 and every case with a private step.
- Facade gaps: Bangs disabled, no bangIcons, no beginRenameGroup, /allow-ads and
  /block-ads absent from the command list, search hard-coded to Google.
- Utility pages open as Chromium manager tabs, not Blanc's sheet.
- Candidate-bound explicit failures (hooks declare the surface absent, re-check
  when assets change): Mahjong reads (no Mahjong page), utility-sheet reads,
  Glance-card reads (Glance is a split preview).

## Native candidates — owner to assess before any build
Native Chromium surfaces that could be adapted instead of porting Electron:
1. Search engines: TemplateURLService / chrome://settings/searchEngines (F5-2/4/8–11,
   F14-1); facade search routes to Google today. Small to route, moderate for presets/UI.
2. Search suggestions: omnibox SearchSuggest provider (F5-4/5/11); privacy rules to recheck.
3. Settings: chrome://settings vs Blanc Settings controls (F14, F15-1, Island settings).
4. Utility sheets: chrome://bookmarks|history|downloads tabs vs Blanc sheet (F9–F11, F16).
5. Find: native find bar vs the full-width 228 px Island view (F8-1). Small–medium.
6. Address menu: omnibox Paste and go vs Blanc's address menu (F19-2/3); the Island
   input is not the omnibox, so a small Blanc menu is likely simpler.
7. External hand-off: ExternalProtocolHandler / existing `externalTab` op (F5-3/F5-7).
8. Private: incognito windows vs in-window private tabs (F4) — decision D1.
9. Permissions: Chromium bubble vs Blanc prompt (F13-1). Certificates: Chromium
   interstitial and decisions vs blanc://error and session-only continue (N5).
   HTTP auth: native login dialog vs silent cancel (F20).
10. Tab strip semantics: Chromium un-groups pinned tabs (F3-5), link children join
    the opener's group (F3-21), per-tab closed entries vs one Close Tabs Below undo,
    pinned section choice (#1174). Glance: native split vs floating card (F34).
11. Windows: native multi-window passes F2-5; close-window and session projection need ops.
Bangs have no native equivalent.

## Native test ops
Built in d1984adb: slots 4–8 in previewPageCommand; closeWindow. Identified, not
built: sessionWindows (session.json-shaped projection); certificate decision
list/forget/cap; history visit + site icon seed; favorite favicon seed;
first-run/checklist/Patron/launch-Sunrise state once stored; address context menu
list/run; external-handoff probe; overlay drag flag; microphone capture seed.

## Next
1. Full S1 baseline on macos-d1984adbf76df5f0 with the screen unlocked
   (`node tests/runner.mjs <Chromium Preview>/evidence/foundation/f06-runtime-config.json <new dir>`,
   ~2 h, one browser at a time); record it as
   `scenarios/baseline-macos-d1984adbf76df5f0.json`, point tracker.json at it,
   regenerate reports/s1-macos.* and the bars.
2. Owner: assess the native candidates above; decide D1.
3. F0.6 typed interface; F0.3 under its dependencies; then S1 work in slice
   order. Re-run affected cases with --only and merge-baseline.mjs.

## Intentionally uncommitted
No canonical `chromium/` changes are left uncommitted. Preserved, not staged:
`AGENTS.md`, `docs/chromium-migration-implementation-plan-2026-10-16.md` and
`experiments/chromium-extension-spike/` (earlier modified source, untracked
drafts, generated candidates and raw evidence; historical, mixed-qualification).
Outside Git: profiles, credentials, caches, apps and raw fixtures stay local.
Use `git status --short` for exact paths. Nothing was discarded.

<!-- BEGIN GENERATED PROGRESS -->
### Bar A — executable shipping cases on the fork

| Platform | Current-candidate baseline |
| --- | --- |
| macOS | Not run for current candidate (previous baseline is stale) |
| Windows | Not run (627 cases) |
| Linux | Not run (627 cases) |

627 executable cases from 578 declarations. Exclusions stay visible in the fixed total; inventory is not a fork run.

### Bar B — requirement rows by platform

| State | macOS | Windows | Linux |
| --- | ---: | ---: | ---: |
| Not started / unassessed | 42 | 79 | 79 |
| Research only | 1 | 0 | 0 |
| Drafted | 11 | 0 | 0 |
| Implemented | 0 | 0 | 0 |
| Built, isolated (legacy) | 9 | 0 | 0 |
| Integrated, partial (legacy) | 16 | 0 | 0 |
| Integrated | 0 | 0 | 0 |
| Verification needs recheck | 0 | 0 | 0 |
| Verified | 0 | 0 | 0 |
| Release-ready | 0 | 0 | 0 |
| Total | 79 | 79 | 79 |

Legacy macOS stages come from the approved spec; they await verification on the canonical candidate. No legacy stage counts as Verified.

Candidate identities: macOS: macos-d1984adbf76df5f0; Windows: none; Linux: none.
<!-- END GENERATED PROGRESS -->
