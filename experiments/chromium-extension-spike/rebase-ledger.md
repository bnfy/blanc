# Chromium rebase ledger

Measured record for the migration plan's Task 0 and Decision 2. **Rebase 0 is
in progress: Chromium 157 built successfully; scoped automated checks passed;
native input, visible layout, Web Store installation and popup checks passed
after an asset repair. A real extension version upgrade is still not run because
the older signed fixture is unavailable. The gate outcome remains open.** The owner approved the sibling checkout
and one cold output on October 16, 2026 under `task0-cold-build-request.md` §7.

## Measurement rules

- Record measured figures only; use `not measured` for missing measurements.
  Times are wall-clock unless explicitly identified otherwise. Owner attention
  means hands-on approvals, decisions and fixes, excluding passive watching.
  Agent time means active work, not elapsed build time.
- The cold-build column is a **clean-build recovery benchmark**: sum all guarded
  build invocations from the empty output to the first complete `chrome` target.
  Include same-cache continuations and identify recompilation after fixes in
  separate invocation rows. Exclude editing time and gaps between invocations.
  The runner includes guard preflights; identify Siso-only time separately when
  available. A continuation can contain both unfinished cold work and recompiled
  objects: do not call its whole duration routine incremental cost.
- Keep clean-build recovery separate from routine patching, incremental compiling
  and re-verification. Never add a repair invocation twice. Where the mixed
  continuation cannot be split, routine incremental-only cost is `not measured`.
- Record Siso counts as reported, including local/noexec distinctions. Their sum
  across invocations is not a unique-object count; plans and live denominators
  can change. Record prerequisite buildflag generation separately.
- Record release cadence per row (two weeks since Chrome 153, as documented in
  the approved request). A stopped rebase still gets a row and a reason.
- Outcomes: `in progress`, `passed`, `passed with divergences`, or
  `stopped (criterion N)`. Unperformed acceptance checks say `not run`.

## Summary table

| # | Date | From tag | To tag (commit) | Cadence | Machine / toolchain | Anchors broken | Upstream files before → after | Prepare and anchor fixes | Cold build: accumulated runtime, reported actions | Compile errors | Compile fixes / incremental builds | Re-verification | Owner attention | Agent time | Calendar span | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 2026-10-16 | `156.0.8078.36` | `157.0.8103.6` (`41520584daa6`) | two weeks | Apple Silicon Mac; Xcode 27.1; Clang packaging 53 → 67 | 1 | 21 → 21 (19 text + 2 icon assets each) | prepare 3.701 s; editing/attention not measured | 9,587.120 s (2h39m47.120s); 57,664 summed steps across two invocations | 5 diagnostics, 1 failed object, 1 API change | mixed repair/unfinished-cold invocation 621.402 s, already included at left; pure incremental cost not measured | automated checkpoint 7m57.300s; unlocked native checks passed except actual extension upgrade; see follow-up | not measured | not measured | 3h24m04.890s through automated checkpoint; final span open | in progress |

Files count existing upstream files changed by preparation, excluding new Blanc
files. The earlier estimate of 20 is corrected by the two checkout inventories:
[patched-upstream-files.json](evidence/rebase-157-20261016/patched-upstream-files.json).
Both contain 21 files; the GN file changed location, not count. This is a concrete
inventory, not a newly approved patch-budget definition.

## Rebase 0: `156.0.8078.36` → `157.0.8103.6`

Evidence: [checkpoint report](evidence/rebase-157-20261016/results.md),
[invocations](evidence/rebase-157-20261016/invocations.jsonl),
[runtime observations](evidence/rebase-157-20261016/runtime-evidence.json).
All timestamps below are UTC; local date at build completion was October 16 EDT.

### Environment and disk

| Field | Measurement |
| --- | --- |
| Source | `/Users/anthonyjloria/Projects/BlancChromium157/src`, upstream `41520584daa68d0040db7746ae562a0ff82187f6` |
| Baseline source | 156 at `5a93aa59e3043e747eff68659dcf7d20193d160e`; separate checkout preserved |
| Output | sibling `src/out/BlancPrototype`; retained throughout failure and continuation |
| GN arguments | `is_debug=false is_component_build=false symbol_level=0 target_cpu="arm64"`; digest `414e3baad6c84730b3c17f411ed82c5065561ba344fe2a202675654e1e18a057` matches baseline |
| Machine | owner's Apple Silicon Mac, 10 CPU cores, 24 GiB RAM |
| Xcode / SDK | Xcode 27.1 (`27A9275`), macOS SDK 27.0 (`26A425`); no global upgrade |
| Clang 156 | `llvmorg-24-init-7747-g62397f8b-53` |
| Clang 157 | `llvmorg-24-init-7747-g62397f8b-67` |
| Toolchain comparison | LLVM revision prefix unchanged; packaging revision differs. Cross-version cache reuse and binary equivalence not measured |
| depot_tools | sibling copy at `382c208a9973e1a6c0867b6d8664dc6dc9116e30`, auto-updates disabled |
| Free disk before / checkpoint | 480.7 GiB / 408.17 GiB; endpoint measurements, not task-exclusive consumption |
| New source including output / output alone | 57.26 GiB / 8.42 GiB allocated; output is included in source total, do not add again |
| Peak disk | not measured |

Disk uses `du -sk` and `df -k`; raw units, timestamp and exclusions are in
[disk-checkpoint.json](evidence/rebase-157-20261016/disk-checkpoint.json).
The actual source tree is larger than the request's estimate. Sibling depot_tools
and `_bad_scm` outside `src` are not included in that source total. No existing
checkout was deleted to make room. Existing 156 args, environment record and
compiler revision hashes match [before](evidence/rebase-157-20261016/baseline156.json)
and [after](evidence/rebase-157-20261016/baseline156-after.json).

### Fetch, preparation and plan inspection

| Stage | Start → end (UTC) | Invocation runtime | Result / action |
| --- | --- | --- | --- |
| Source clone | Oct 16 23:34:42.463 → 23:38:05.511 | 203.046 s | shallow pinned tag; SHA verified |
| First dependency sync | 23:38:05.601 → 23:44:58.508 | 412.906 s | failed: runner PATH omitted installed Homebrew git-lfs |
| First resume | 23:46:08.646 → 23:46:15.106 | 6.460 s | failed: partially checked-out LiteRT |
| Fresh LiteRT checkout repair | 23:47:10.140 → 23:47:14.867 | 4.727 s | restored this new dependency to DEPS SHA; downloads retained |
| Final dependency resume | 23:47:14.867 → 23:55:27.009 | 492.136 s | passed |
| One-time hooks | 23:56:11.135 → 23:56:44.453 | 33.318 s | passed; Mac toolchain installation skipped |
| First prepare | 23:57:03.822 → 23:57:07.423 | 3.601 s | failed on moved BrowserView GN anchor |
| Prepare after anchor fix | 23:57:51.038 → 23:57:51.139 | 0.100 s | passed |
| GN generation | 23:57:55.621 → 23:58:01.323 | 5.702 s | passed; once, after prepare, unchanged args |
| Environment recording | 23:58:01.323 → 23:58:02.347 | 1.024 s | passed; no compilation |
| First plan | 23:58:02.348 → 23:58:24.480 | 22.132 s | failed at old 128 MiB capture limit |
| Plan after guard repair | 23:59:13.453 → 23:59:43.283 | 29.830 s | 57,785 actions; expected buildflag stop |
| Reported buildflags only | Oct 17 00:00:22.062 → 00:00:32.145 | 10.083 s | 120 requested headers, 122 actual Siso steps (initial plan 129); no native compilation |
| Final cold preflight | 00:00:47.824 → 00:01:16.769 | 28.945 s | 57,663 planned actions; no regeneration/buildflags; normal >1,000 guard stop |

Source fetch through completed dependency sync spans **20m44.546s**; recorded
clone/sync/repair process runtimes sum to **1,119.275 s**. Gaps and one-time hooks
are separate. Installed git-lfs was added to runner PATH; it was not upgraded.
Only the fresh sibling LiteRT partial checkout was repaired.

The complete plan was 355,220,619 bytes. The guard now writes the dry run directly
to disk and scans it with bounded memory, preserving regeneration, buildflag,
unknown-plan and large-build stops. Ten guard tests pass, including a plan over
128 MiB and markers spanning read boundaries. The targeted BrowserView `gn check`
also passed. Buildflag stop handling was required; it was not bypassed by
`--allow-large-build`. After the C++ fix no GN change occurred, so no second GN
generation was required. Final post-build guarded inspection reported zero actions.

### Broken anchors and compile repair

| Upstream file | Hunk | Cause | Fix | Minutes |
| --- | --- | --- | --- | --- |
| `chrome/browser/ui/BUILD.gn` → `chrome/browser/ui/views/frame/BUILD.gn` | BrowserView source registration | BrowserView split into its own GN target | register bridge source in `browser_view`, expose header in `browser_view_header`, declare nine direct dependencies | not measured separately |

One old anchor failed. The first failed prepare ended at 23:57:07.423; repaired
prepare ended at 23:57:51.139, a **43.716 s observation window**, not measured
editing time or owner attention. All other prepare anchors applied. The two new
Blanc native files remain; the `.cc` changed as follows, the header did not.

| Error | Cause | Fix | Build result |
| --- | --- | --- | --- |
| `blanc_prototype_ui.cc:646,872,902,1360,1376`: no member `extensions_container` in `ToolbarView` | concrete accessor renamed in 157; generic interface lacks required View/model access | five calls use retained `extensions_container_for_testing()` with explanatory comment; no upstream header patch | repaired object compiled; entire target passed in invocation 2; actual extension popup checks subsequently passed in the unlocked follow-up |

The API failure is one cause producing five diagnostics in one object. Guard
capture failure is preparation tooling overhead, not another upstream anchor or
native compile error. Editing time for both repairs was not separately measured.

### Cold build: clean-build recovery benchmark

| # | Start → end (Oct 17 UTC) | Guarded runtime | Siso counts | Kind | `--allow-large-build` | End |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 00:01:37.405576 → 02:31:03.121811 | 8,965.718 s | 54,900 local + 434 noexec = 55,334 | cold start | yes | failed on accessor calls; cache retained |
| 2 | 02:36:22.315629 → 02:46:43.716419 | 621.402 s; Siso alone 616.32 s | 1,990 local + 340 noexec = 2,330 | recompilation after fix plus unfinished cold work, same output | yes | complete |

**Sum: 9,587.120 s = 2h39m47.120s**, including guard preflights, excluding source
editing and gaps. Counts sum to **57,664 reported steps** (56,890 local + 774
noexec), not unique objects. The preceding 122 buildflag steps are separate.
Calendar span between first invocation and successful completion is
**2h45m06.311s**. There was no clean restart, no second cold output, and no
source-unchanged interruption/resume invocation. Both invocations were above
1,000 actions, so both used the approved large-build flag after inspection.

Before invocation 2: repair prepare took 2.437 s; plan inspection took 6.075 s
and reported 2,330 actions, no regeneration/buildflag stop. The **5m19.194s gap**
between invocations includes diagnosis, editing, preparation, inspection and
monitoring; it is not a direct measurement of editing or owner attention.

The 621.402 s continuation is already included in the recovery sum. Its portion
attributable only to the source fix is **not measured**. No separate ordinary
incremental build benchmark is claimed. Raw compiler diagnostics and Siso tails:
[first](evidence/rebase-157-20261016/08-cold-build-01-summary.txt),
[second](evidence/rebase-157-20261016/11-build-after-api-fix-summary.txt).

### Re-verification checkpoint

Automated runtime session: Oct 17 **02:50:50.053 → 02:58:47.353 UTC**, a calendar
span of **7m57.300s**, including relaunches and harness corrections. This is not
active agent time or the final acceptance duration. Evidence below refers to the
[report](evidence/rebase-157-20261016/results.md) and its linked observations,
logs and assertion scripts. Renderer screenshots taken while locked do not prove
native window geometry or visible refresh.

| Check | Result | Scope / evidence |
| --- | --- | --- |
| Version, Blanc new-tab routing, Island iframe startup, extension slot | pass | CDP/bridge snapshot; slot 26 px; no physical interaction |
| Create/navigation/back/forward/reload/stop | pass | automated bridge assertions |
| Favorites creation and named-folder reuse | pass | automated assertions; no physical hearts or typed slash commands |
| Pin/mute, pinned boundary, tab/group moves, group name reuse/fold/focus/ungroup/close | pass | bridge assertions; not native drag/keyboard |
| Pin/order/group/Favorites/layout/dynamic wallpaper persistence | pass | restart assertions; mute not included, remains transient |
| Four layout selections and cross-tab preference propagation | pass | DOM selection/state observations; screenshots included |
| History-only clear, Favorite/cookie/localStorage preservation, cleared history after restart | pass | disposable profile only |
| Native TopSites query cleared and same-document notification | pass | fresh service query assertion; recorded `sites` field is stale renderer state, not that fresh query |
| Private data guards, silent heart APIs, hidden hearts after panel opens, clear refusal | pass | bridge and CSS assertions; regular history preserved |
| Normal Web Store listing / enabled Add to Chrome button | pass | listing readiness only; install not initiated |
| Guard regression tests and final plan | pass | 10 tests; final plan zero actions |
| CGEvent Cmd-L/T/A/D/R/[; Escape, page typing and Island focus | not run | Mac locked |
| Physical hearts, typed `/save`/`/history`, folder rejection, switcher ranking/dedup and late favicon | not run | Mac locked |
| Native pin/mute audio, drag/keyboard reorder, group gestures | not run | Mac locked |
| Visible start-page refresh, TopSites refresh, type-to-open bridge and all layouts | not run | hidden document lacked `layout-ready`; service notification is not visible proof |
| Visible header tint, traffic lights, Island geometry and Dock icon | not run | native window checks require unlock |
| Web Store install with native permission dialog | not run | Mac locked |
| One Google-endpoint extension update surviving restart | not run | Mac locked |
| Extension popup focus, Escape and Cmd-L interaction | not run | Mac locked |

Harness failures are retained, not counted as passing runs. They include early
TopSites assertions, hidden-page rendering expectations, unopened private-overlay
state, incorrect wallpaper state lookup, an overbroad mute-persistence expectation,
unavailable CDP browser-context creation and an immutable SQLite read correction.
See the report and stage logs for qualifications. No new product divergence is
confirmed by this checkpoint; the acceptance run remains incomplete.

### Effort, outcome and next rebase

| Field | Current record |
| --- | --- |
| Owner attention | not measured |
| Active agent time (Codex / Claude) | not measured / not measured |
| First fetch → last automated result | Oct 16 23:34:42.463 → Oct 17 02:58:47.353 UTC; 3h24m04.890s |
| Final calendar span / total re-verification | open / not measured |
| Criterion 1: >2 owner-days or >1 calendar week | week threshold not reached at checkpoint; owner-attention threshold cannot be quantified from these logs |
| Outcome | **in progress; real extension version-upgrade acceptance not run** |
| Next rebase preparation | account for BrowserView GN target and explicit deps; re-audit concrete extension-container API; retain bounded-memory plan scanner and normal stops |

The approved 156 instance/profile/tabs remain untouched. Disposable 157 resources
are retained for unlocked acceptance and will be removed only after those checks.
The monitor is paused awaiting an older signed extension fixture. `CLAUDE.md` and the completed milestone
record are not updated with a gate outcome. This ledger checkpoint does not
approve a migration or another cold output.

### Baseline decision after checkpoint review

The owner chose **157 as the sole next baseline only after native acceptance
passes**, preserving the 156 checkout as archival. Dual-version preparation is
not requested. This branch's `prepare.mjs` targets 157; the spike README's 156 pin
continues to describe the fully verified baseline until acceptance completes.
Before landing this branch, complete the outstanding checks, record the outcome,
and update the README pin to 157. This decision does not itself pass Task 0 or
authorize another cold build.

Before the unlocked session, record active agent start/stop intervals separately
from process runtime. Record owner hands-on intervals only when observed or
reported; mark these as partial coverage because earlier attention was not timed.
Do not infer owner attention from the duration of the whole test session.

### Unlocked native acceptance follow-up — October 17

The owner authorized native acceptance after unlocking the Mac. The
[native report](evidence/rebase-157-native-20261017/results.md) supersedes the
checkpoint table's `not run` cells for keyboard/mouse, Favorites/search/late
favicon, private guards, tab/group gestures, visible layouts/TopSites/typing,
window tint/traffic lights/Dock icon, normal Web Store installation, extension
popup focus and installed-extension persistence. **One Google-endpoint version
upgrade remains not run:** Bitwarden installed at 2026.10.0; checking for updates
left it at that version, and the older signed CRX fixture is unavailable. This
is not a failed browser updater, nor a version-upgrade pass.

Native tests found an empty-pinned-section/first-loose-gap tie in the copied drag
resolver. A prototype-only asset transform fixes that exact tie; four focused
tests and ten guard tests pass. Assets-only preparation and native tab/group
retests passed; no native build or cold-build time was added. This repair is
recorded separately from the one upstream anchor and one native API change.
Editing time was not separately measured. Timing records bracket the unlocked
execution session at 16:15:37.096954–16:32:22.007618 UTC (16m44.911s),
including tools and waits; exclusive agent time and prior
owner attention remain unmeasured.

The 156 baseline hashes still match. Fixture tabs/groups, added Favorites/folders
and sentinel site data were cleaned. The isolated 157 profile, one original
disposable Favorite and installed Bitwarden are retained for the remaining
upgrade. The monitor stays paused; no PR, baseline promotion or gate-outcome
change to CLAUDE/AGENTS. The README pin moves only after complete acceptance.

### Review follow-up: Electron ownership and bounded upgrade wait

Installed Electron Blanc 1.36.0 produces the same coincident pinned/loose slots
and rejects the first loose gap with the original resolver. The source function
matches this branch. The correction therefore moved to shared
`src/renderer/tab-drag.js`; the prototype transform was removed. Three shared
regressions plus the existing suites pass (51 tests), and generated prototype
bytes are unchanged from the native acceptance run. No native rebuild.
[Measured model, corrected resolver and validation](evidence/rebase-157-native-20261017/electron-followup/results.md).

The October 16 disposable 156 upgrade profile is missing; no permanent profile
was copied and profile-forward migration is **not measured**. Google's update
service returned HTTP 200 / noupdate for all six recorded extension versions. A
no-change updater callback alone was not network evidence; raw HTTP/XML responses
are now saved. The actual Google-endpoint version upgrade is still not run.

The owner-directed bounded wait is active: daily at noon local time through
November 3 inclusive, quiet unless actionable, pausing on completion, required
owner action or expiry. No third-party CRX mirrors. If the bound expires, the
row stays in progress; mechanism-only fallback requires the owner's separate
decision. No 157 promotion, no CLAUDE/AGENTS outcome change.
