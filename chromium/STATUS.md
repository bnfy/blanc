# Chromium replacement status

Execution contract: spec and plan approved at e884a6564. Active slice: F0 Foundation.

## Authorization
F0.1–F0.6 and F0.8, with necessary incremental builds, approved.
D1 decided 2026-10-31: in-window private tabs.
D7, F0.7, cold builds, new machines, D2/D4–D6/D8/V2 and replacement D3
remain pending. D3 beta-only no-DRM exception accepted; EME notice/handoff required.

## Current work
- F0.1/F0.2/F0.4/F0.8 as before; F0.3 pending.
- **F0.5 S1 finish line reached.** All 253 S1-tagged cases have a real result
  or a named undefined reason on the current candidate: 70 pass, 151 fail, 32
  undefined. Per-row results and reasons: [reports/s1-macos.json](reports/s1-macos.json) (+ JUnit).
- **F0.6 built and verified, except the typed interface.** Candidate macos-d1984adbf76df5f0
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
- **Baseline on the new candidate recorded** (one full run at 8f7f7c16,
  embedded assets): every case matches the previous candidate's result except
  one, whose defined steps pass on both; on the previous build the browser then
  failed to quit cleanly (teardown watchdog), so it counted as a failure, and
  here it quit cleanly and stays undefined. No watchdog exits in this run. An
  earlier run with the screen locked was discarded; the runner now stops when
  the browser gets no animation frame and holds the display awake for the run.
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
- Private tabs refused (in-window private tabs not built yet; D1 decided): F4 and every case with a private step.
- Facade gaps: Bangs disabled, no bangIcons, no beginRenameGroup, /allow-ads and
  /block-ads absent from the command list, search hard-coded to Google.
- Utility pages open as Chromium manager tabs, not Blanc's sheet.
- Candidate-bound explicit failures (hooks declare the surface absent, re-check
  when assets change): Mahjong reads (no Mahjong page), utility-sheet reads,
  Glance-card reads (Glance is a split preview).

## Native-versus-port decisions (owner, 2026-10-31)
Recorded in the spec (§4, §9) and plan:
- D1: port shipping's in-window private tabs (deep tab/profile patch, isolated
  in `blanc/private/`). S1.4 unblocked.
- Pinned tabs stay in their group, as shipped (custom change to Chromium's tab
  collections).
- V8: Chromium's certificate warning page and proceed decisions replace
  `blanc://error` (N5). Rewrite N5's expectations to the approved divergence.
- V9: page-started external-scheme launches ask first through Chromium's
  prompt; typed addresses hand off directly (N6).
Everything else already follows spec §4 (Chromium models, Blanc UI): engines
and suggestions through TemplateURLService and native suggest with Blanc's
privacy rules; chrome://settings restyled with Blanc sections (V1); Blanc
sheets over native bookmarks/history/downloads; Island find capsule over
FindTabHelper; a Blanc address menu; native sessions; native permissions with a
Blanc prompt; link children ungrouped (one patch where TabStripModel inherits
the opener's group); Glance stays a custom card; Close Tabs Below as one entry
through TabRestoreService if its group entries allow it.

## Native test ops
Built in d1984adb: slots 4–8 in previewPageCommand; closeWindow. Identified, not
built: sessionWindows (session.json-shaped projection); certificate decision
list/forget/cap; history visit + site icon seed; favorite favicon seed;
first-run/checklist/Patron/launch-Sunrise state once stored; address context menu
list/run; external-handoff probe; overlay drag flag; microphone capture seed.

## Next
1. F0.6 typed interface; F0.3 under its dependencies; then S1 work in slice
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
| macOS | 70/627 executable cases pass; 195 failed; 360 undefined/not run; 2 excluded — [baseline](scenarios/baseline-macos-d1984adbf76df5f0.json)<br>S1 rows: 70/253 pass; 151 failed; 32 undefined; 0 excluded |
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
