# Chromium replacement status

Execution contract: spec and plan approved at e884a6564. Active slice: F0 Foundation.

## Authorization
F0.1–F0.6 and F0.8, with necessary incremental builds, approved.
D7, F0.7, cold builds, new machines, D1/D2/D4–D6/D8/V2 and replacement D3
remain pending. D3 beta-only no-DRM exception accepted; EME notice/handoff required.

## Current work
- F0.1/F0.2/F0.4/F0.8 as before; F0.3 and F0.6 pending.
- **F0.5 S1 finish line reached (2026-10-30, Claude).** Every S1-tagged case
  (rows F1–F16, F18–F20, F23, F32, F35, F37, F44, F47, N4–N6, N8, N19, N21,
  N22; 253 cases) has a real result or a named undefined reason on the
  current candidate. S1: 68 pass, 139 fail, 46 undefined. Per-row results with
  each failure's reason: [reports/s1-macos.json](reports/s1-macos.json) (+ JUnit).
- Runner: shipping's 24 S1 step files and fixture server load unchanged from
  v1.45.1 (85883b1a); adapters (tests/adapters/*.mjs) map shipping hook names to
  the Island facade, native dispatch, Island DOM and CDP; a Playwright-shaped
  CDP shim drives the overlay/strip iframes; fork steps (tests/fork-steps/)
  cover S1 texts shipping never defined. Cases run their defined prefix and
  retry a failure once, as shipping does. `tests/coverage.mjs S1` is the static
  view; `tests/merge-baseline.mjs` re-runs only affected cases.
- Baseline = full run at 15fff856 plus re-runs at bdb339d5 (harness relaunch now
  undefined) and 73b15fb1 (F23 zoom on the reset tab); each scenario keeps its
  fork commit. Raw output: Chromium Preview/evidence/foundation/s1-baseline-15fff856,
  s1-rerun-*, s1-dev/*.
- No build ran. Bar B unchanged: no row changed state.

## Reading the failures
Most failures are real product gaps on this candidate, clustered:
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

## Native test ops identified (none built)
closeWindow; sessionWindows (session.json-shaped projection); certificate
decision list/forget/cap; history visit + site icon seed; favorite favicon seed;
first-run/checklist/Patron/launch-Sunrise state once stored; address context menu
list/run; external-handoff probe; slots 4–8 in previewPageCommand; overlay drag
flag; microphone capture seed. Runner (not native): fixture relaunch, OS-language
launch (F44), local TLS certificate rotation (N5 local cases).

## Next
1. Owner: assess the native candidates above; decide D1.
2. F0.3 and F0.6 under their dependencies; then S1 work in slice order, using
   reports/s1-macos.json as the gap list. Re-run affected cases with --only and
   merge-baseline.mjs instead of full runs.

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
| macOS | 68/627 executable cases pass; 183 failed; 374 undefined/not run; 2 excluded — [baseline](scenarios/baseline-macos-19b83f79bd18b94c.json)<br>S1 rows: 68/253 pass; 139 failed; 46 undefined; 0 excluded |
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

Candidate identities: macOS: macos-19b83f79bd18b94c; Windows: none; Linux: none.
<!-- END GENERATED PROGRESS -->
