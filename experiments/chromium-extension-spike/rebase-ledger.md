# Chromium rebase ledger

## Shutdown teardown follow-up — 2026-10-19

Reproduced `TypeError: Object has been destroyed` in the official Electron binary: the helper's destroyed callback dereferenced `win.webContents` after BrowserWindow destruction. All three platform brokers now capture the original contents reference and revoke that authority without reading the dead window. The runtime lock hashes explicitly track this reviewed teardown change; this is not renewed screen-sharing/audio acceptance. Failure diagnostics now read the on-disk exception log independently of the dead inspector. The audit inventory was regenerated (only main.js hash changed).

176 focused tests pass. All three new lifetime regression tests failed before the fix; isolated native helper destruction reproduced the exception before and exits zero afterward for all three variants. Scoped ESLint and audit inventory checks pass. Full local unit attempt is retained, not claimed green: absent seed, release refs, dependency/environment issues and the then-stale inventory produced 21 failures. Full desktop attempts still stop with Playwright Target crashed before the shutdown assertion; actual Windows/Linux end-to-end acceptance awaits CI.

Reviewed all nine failed jobs on61d492e7: two shutdown jobs exit1; substrate has stale main.js inventory; both unit jobs and all four desktop jobs fail only the same two inventory assertions (complete provider logs checked after diagnostics truncation). No additional CI failure cause found. No jobs silently rerun.

No Chromium/native compilation, latency run, or diagnostic Electron build; existing official Electron used only for probes. Chromium footprint unchanged. Plan remains in progress, prior gates unchanged. Evidence: `evidence/windows-shutdown-followup-20261019/`.


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
| Final calendar span / total re-verification | open, including the scheduled wait for a Google-endpoint extension upgrade / not measured |
| Criterion 1: >2 owner-days or >1 calendar week | week threshold not reached at checkpoint; owner-attention threshold cannot be quantified from these logs |
| Outcome | **in progress; real extension version-upgrade acceptance not run** |
| Next rebase preparation | account for BrowserView GN target and explicit deps; re-audit concrete extension-container API; retain bounded-memory plan scanner and normal stops; retain the previous-major disposable profile and record scheduled gate waits as specified below |

The approved 156 instance/profile/tabs remain untouched. Disposable 157 resources
are retained for unlocked acceptance and will be removed only after those checks.
At this checkpoint the monitor was paused awaiting an older signed extension
fixture; the bounded daily monitor below supersedes that pause. `CLAUDE.md` and
the completed milestone record are not updated with a gate outcome. This ledger checkpoint does not
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
resolver. The initial prototype-only asset transform fixed that exact tie
(superseded by the shared Electron fix below); four focused tests and ten guard tests pass. Assets-only preparation and native tab/group
retests passed; no native build or cold-build time was added. This repair is
recorded separately from the one upstream anchor and one native API change.
Editing time was not separately measured. Timing records bracket the unlocked
execution session at 16:15:37.096954–16:32:22.007618 UTC (16m44.911s),
including tools and waits; exclusive agent time and prior
owner attention remain unmeasured.

The 156 baseline hashes still match. Fixture tabs/groups, added Favorites/folders
and sentinel site data were cleaned. The isolated 157 profile, one original
disposable Favorite and installed Bitwarden are retained for the remaining
upgrade. At this checkpoint the monitor remained paused (superseded below);
no PR, baseline promotion or gate-outcome change to CLAUDE/AGENTS. The README pin moves only after complete acceptance.

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

### Carry forward to the next rebase

- **Preserve a previous-major migration fixture.** Before retiring the previous
  major's disposable test profile, close that test instance and retain a dated
  snapshot in durable storage, with its path, browser version, installed extension
  versions and fixture provenance recorded in the ledger. Do not rely solely on
  `/private/tmp`. Copy that snapshot into a separate disposable directory for the
  next major's profile-forward migration and extension-upgrade checks; retain the
  original until those checks and their evidence are complete. Never substitute
  the permanent profile. The retained 157 disposable profile should become the
  next rebase's prior-major fixture; 156-to-157 migration remains **not run**.
- **Record the mechanism and duration of external gate waits.** Rebase 0's wait
  was recorded October 17, 2026. The existing heartbeat
  `finish-blanc-chromium-157-rebase` checks daily at **12:00 America/New_York**
  through **November 3, 2026 inclusive**. Record each actual observation's time
  and result, and the eventual upgrade or bound-expiry time. The open calendar
  span includes this wait for an eligible Google-endpoint upgrade; waiting is
  not compilation, re-verification effort or measured owner/agent attention.
  Preserve the separate build and test measurements. On expiry, report and
  pause with the row still in progress; a mechanism-only fallback requires a
  separate owner decision. Future rows should name their own schedule, bound
  and completion condition rather than inherit these dates.

## Tranche 2 incremental builds

### Spike A audit checkpoint — October 17, 2026

Owner approval: request §8 at `5863215d`, merged with #906 as `14b04362`.
Development on the 157 sibling has begun while Rebase 0's Google-endpoint
extension-upgrade observation remains open. The detailed Rebase 0 measurements
remain on `codex/chromium157-rebase` (`e105e52a` at this checkpoint); this
audit-only change does not promote 157 or replace row 0's pending record.

- [Request-path source audit](evidence/f12-spike-a/request-path-audit.md), with
  pinned source ranges and hashes. Runtime coverage: **not run**.
- [Starting inventory](evidence/f12-spike-a/patch-budget-start.json): **21
  upstream files, 55 hunks** against `41520584daa68d0040db7746ae562a0ff82187f6`.
  No native modifications in this checkpoint, so its delta is **0 files /
  0 hunks**. Aggregate ceiling remains 40 / 120.
- [Replay contract and validator](fixtures/replay/README.md): captured real
  requests **0**; comparison unit tests **8 passed**; budget-counter scratch
  repository tests **4 passed**. No block-rate or latency result.
- No native build, preparation, generation, toolchain or profile operation.
  No addition to the clean-build benchmark.
- Owner attention and active agent time: **not measured** for this initial
  audit session. The source-reference timestamp is a checkpoint, not an
  attention measurement. Subsequent sessions must record start/stop intervals
  explicitly, without treating idle waits as attention.

| Build invocation | Start / end | Guard plan | Actions | Result | Classification |
| --- | --- | --- | --- | --- | --- |
| None (source audit and Python harness tools only) | not applicable | not run | 0 | no native build | routine audit; not cold build |

Audit/tool invocations (not native build invocations):

```sh
python3 experiments/chromium-extension-spike/patch-budget.py /Users/anthonyjloria/Projects/BlancChromium157/src --upstream 41520584daa68d0040db7746ae562a0ff82187f6 --output experiments/chromium-extension-spike/evidence/f12-spike-a/patch-budget-start.json
PYTHONDONTWRITEBYTECODE=1 python3 experiments/chromium-extension-spike/patch-budget-test.py
PYTHONDONTWRITEBYTECODE=1 python3 experiments/chromium-extension-spike/fixtures/replay/validate-test.py
```

Next: resolve the audit's open paths and implement origin-preserving fixture
transport and real Electron capture in disposable profiles. The audit and
validator do not satisfy the request-path runtime coverage fixture requirement.


### Spike A audit review corrections — October 17, 2026

[Reviewed inventory](evidence/f12-spike-a/patch-budget-reviewed.json): **21 files /
55 hunks**, unchanged per file; **151 Git dependencies** clean at the resolved
sync manifest's pins. Classification now uses raw content (NUL in first 8,000
bytes), text diffs force `--text`, and applicable `diff`/`binary` attributes are
recorded. Dependency local changes, missing checkouts, pin drift or missing
metadata refuse the inventory instead of silently returning a partial total.
Intentional dependency patches cannot proceed until the counter supports them.

Counter tests: **11 passed**. Replay validator tests: **10 passed**, including
required `profile_kind: regular|private` and profile mismatch rejection.
No native build, runtime coverage or capture; zero addition to the cold column.
This review repair's active attention was not timed; not inferred from wall time.

Post-merge action: merge the spike head into `codex/chromium157-rebase`, retaining
that branch's measured Rebase 0 record and open upgrade gate while incorporating
this separate tranche section. Resolve the expected ledger conflict once; never
replace the measured record with this branch's template. This action is pending
#907's merge, not performed by this correction.

### Merged audit and capture reconciliation — October 17, 2026

Merged spike head `176b9ace` after #909 and #907 passed CI and were squash-merged
under owner authorization. Preserved the entire measured Rebase 0 record above;
added the separate tranche section. The extension-upgrade gate stays open.
No native preparation, build, source/output or profile changes.

### HTTPS fixture transport checkpoint — October 17, 2026

After owner-authorized squash merges #909 (`5120969d`) and #907 (`176b9ace`),
the 157 branch took spike head `176b9ace` as merge `cc1edca2`. Its entire measured
Rebase 0 record was retained and the separate tranche audit section appended;
the predicted ledger conflict is resolved. The existing native build and open
extension-upgrade gate were not changed.

[HTTPS capture evidence](evidence/f12-https-capture-20261017/README.md): three HTTPS
runs and one HTTP regression passed using the real Electron provider in fresh
regular/private profiles, with session-scoped fixture trust and all fixtures
served offline. Twelve fixture decisions per run, 8 allow / 4 cancel; these are
not acceptance-corpus requests. Transport/trust tests **8/8**. Source hashes,
proxy arrivals, certificate decisions and cleanup are saved. Invocations and
run wall clocks are in the evidence; active attention is **not measured**.
No native build/prepare/GN invocation, no new native patch, no cold-column change.
157 replay, real-page corpus and remaining request-path admission stay pending.

### Controlled recording and offline stability — October 17, 2026

#912 merged as `2af25c66` after all 21 current-head jobs passed. The separate
recorder/scrubber/offline modules now have [controlled evidence](evidence/f12-record-replay-20261017/README.md):
one failed acquisition retained, then three successful acquisition rounds with two fresh
replays per regular/private profile, upstream shut down before replay. Each pair
matches six decisions (four allow, two cancel), with zero harness faults. Tests:
13 pipeline + 4 controlled TLS network. Public-page capture, general correlation,
Chromium replay, cosmetics and latency remain pending; corpus count zero.

No native build, prepare or GN invocation; no native patch or cold-column delta.
Runtime interval and all seven source hashes are in run-04/report.json; active
attention is not measured. Existing Chromium checkouts and profiles are untouched.

### Review and owner-selected public feasibility C — October 17, 2026

[Committed aggregate evidence](evidence/f12-public-feasibility-20261017/README.md):
actual public client exercised on ten fixed unauthenticated entrypoints with
unchanged scrub policy and real Electron blocker. Initial documents: 0 admitted,
7 refused at Vary and 3 at status; one other request refused at body type. No
tracker distribution or block-rate result follows because documents never passed
recording admission. No public bundle, raw observations or raw corpus retained.
Profile/key cleanup and installed ASAR preservation passed. A/B remains undecided.

Paired validator now accepts optional causally joined transport events: a valid
oracle-blocked/fork-allowed observation remains a block→allow difference, with
its absent response marked a downstream limitation. Unknown/unjoined misses
remain faults. Electron oracle stability admission stays strict. Native adapter
and causal transport join remain unimplemented; tests here are synthetic.
IPv4 exclusions corrected to the documentation /24s; IPv6 remains unsupported.

Checks: 14 pipeline + 5 controlled TLS/IP + 15 validator tests; targeted lint clean.
Controlled run-05 passes acquisition plus two regular/two private offline runs,
matching final seven implementation hashes. Every invocation is in evidence.
No native build/prepare/GN or cold-column change; active attention not measured.

### Ordinary response handling and repeat C — October 17, 2026

[Evidence](evidence/f12-public-feasibility-repeat-20261017/README.md): Vary now
records controlled upstream selection and enforces forwarded-value equality
on replay; wildcard/Cookie/unknown fields refuse. Empty untyped 200/204 bodies
are admitted. Safe bounded HTTPS preflight maps original→final entrypoints
without admitting redirects to the oracle. Exact status/resource/party fields
are aggregate diagnostics only. Lower-bound false-negative qualification is
emitted by the paired validator and required beside future blocking-rate reports.

Repeat on the same ten entries: 0 admitted documents; 3 uncontrolled Vary,
4 encoded/opaque body refusals, 1 HTTP 401 and 2 HTTP 403. No preflight redirect
occurred. One additional other/unknown-party request was status 200 and body-type
refused. Script/xhr/image first-/third-party distributions are unmeasurable
because document admission prevented them, not zero-percent refusals. No raw
public corpus, privacy relaxation or A/B decision. All process/key/profile/ASAR
cleanup checks pass. Controlled run-06 passes both profile replay pairs and
matches final source hashes. 16 pipeline + 7 network + 15 validator tests pass;
lint clean. No native build/prepare/GN or cold-column change. Active attention
not measured; invocation, runtime brackets and source hashes are in evidence.

### Approved synthetic corpus checkpoint — October 17, 2026

Owner approved the corpus amendment at `68892cc1`, recorded at `4abb4509`.
The explicit matrix was committed before capture (`cf3f0abe`). Generation
produces 5,905 candidate URLs, not oracle decisions. Final 24-case resource
probe passed two fresh regular and two fresh private offline Electron replays:
8 blocked / 16 allowed candidate URLs, with authored script descendants and
saved DOM outcomes. Two failed fixture attempts are retained, followed by
three passing attempts of progressively broader evidence. See
[evidence/f12-synthetic-20261017/README.md](evidence/f12-synthetic-20261017/README.md).
No native build, private real-page acquisition, deadline extension or baseline
promotion. Full threshold/matrix and native fork comparison remain pending.
Runtime start/end timestamps are in each report. Agent/owner attention was not
measured and is not inferred from calendar time. These harness operations do
not alter row 0's cold-build column.

### Expanded synthetic oracle and Chromium control — October 17, 2026

[Committed evidence](evidence/f12-expanded-20261017/README.md): 5,123 eligible
list-derived URLs ran twice in fresh regular and private Electron profiles.
Each profile observed 2,503 blocked / 2,620 allowed unique candidates, excluding
four first-party controls, child requests and repeats. Another 782 domain-scoped
candidates remain excluded. The 24-case no-referrer subset is stable at 9/15;
the unchanged initiator and changed referrer produce a real exception difference.
The matching Ghostery Electron artifact uses referrer as Request.sourceUrl.

Chromium 157 ran the same complete authored bytes twice per profile as an
explicit **no-blocker negative control**: all 5,123 candidates loaded, including
2,503 Electron-blocked ones, and 1,211 additional script children executed and
loaded each time. This validates observable false negatives/descendants in the
harness, not native blocking parity or criterion-3 acceptance. Native engine,
interception and independent request_initiator observations are still absent.
No frame/referrer substitution is used; fully admitted paired URLs remain zero.

All attempts, including certificate and fixture-completion failures, are kept
losslessly with hashes. Scoped ephemeral leaf-key trust passes pinned/unpinned
browser controls; system trust remains unchanged. 48 replay tests and 15 paired
validator tests pass; targeted lint and whitespace checks pass. No native build,
prepare/GN invocation, upstream edit, private real-page capture, baseline
promotion or deadline extension. Native budget not remeasured; row 0's cold
column unchanged. Runtime brackets include harness overhead; owner/agent active
attention is not measured. See summary for the remaining coverage matrix gaps.

### Native blocker and paired synthetic subset — October 17, 2026

[Evidence](evidence/f12-native-20261017/README.md): the opt-in native network
factory hook calls pinned Ghostery 2.18.2 in a sandboxed, jitless Mojo utility.
Two fresh regular and two private full runs match Electron on 5,123 distinct
candidate URLs: 2,503 blocked / 2,620 allowed, zero decision or native-context
differences. The 24-candidate no-referrer subset also passes all four runs (9/15).
Cancellation, allowed-response hashes, DOM execution and script-child loads pass.
Missing/tampered assets and an owned utility termination fail closed before the
fixture server sees the denied requests. Raw failures and successful runs are
retained, including the internal-WebUI interception and response-pipe lifetime
bugs found and repaired during native testing.

Five guarded incremental build invocations inspected 12, 6, 4, 2 and 1 actions;
the first two failed compilation and the final three built. Siso wall times:
4.54, 5.64, 44.33, 44.11 and 31.64 s. Wrapper/guard total 153.075 s. One GN
generation used unchanged args; the final plan has zero actions. No new cold
output, clean, environment re-record, toolchain change or large-build override.
Budget 21/55 → 25 files/62 hunks; 151 dependency checkouts clean at their pins.
Invocation records and source/framework hashes are committed with the evidence.
Task 0's cold column and open upgrade gate are unchanged. Owner/agent attention
is not measured; runtime brackets are not attention figures.

55 replay + 15 validator + 10 build-guard + 11 budget tests pass; lint clean.
This is **synthetic fixture parity for the measured subset**, not full F12
acceptance. Redirect runtime coverage, subframes/opaque origins, 782 domain-scoped
candidates, other resource types, broader first-party cases, workers/SW/cache,
keepalive/teardown, speculative paths, WS/WT interception, resource redirects,
CSP/cosmetics/scriptlets, formal latency protocol and private real-page sample
remain gaps. Startup-delay/timeout injection and live recovery UX remain gaps.
Profiles and fixture keys removed; 156/permanent profiles untouched; no promotion.

### Redirect/worker paths and latency protocol — October 17, 2026

[Evidence](evidence/f12-paths-latency-20261017/README.md) retains three path
attempts and three latency attempts, including invalid harness runs. Final
path run: two fresh Electron and Chromium runs in each profile; authored GET
navigation/fetch/script redirects (allow-to-block, blocked predecessor, two-hop)
and dedicated-worker imports/fetches pass. Shared and service worker behavior
matches, including blocked imports and independent fetches, but unresolved
frame identity leaves those cells **gap**, not admitted parity. No context is
filled from referrer or the active tab.

One guarded incremental timing fix measures factory/redirect entry through
application of the decision, including Mojo. Plan: one action; Siso: six steps,
29.98 s; guard/wrapper: 35.065 s. Final check: zero actions. No GN, args, toolchain,
environment-record, cold output or large-build override. Budget remains 25/62.
Missing/tampered assets and utility termination still fail closed.

Full 5,123-candidate corpus, 26 authored page loads with natural concurrency per
page, one discarded full warm-up then five full measured repetitions per
profile. All 24 full repetitions validate decisions, contexts, response hashes
and DOM/child outcomes. Native median p99: **1.484 ms regular / 2.108 ms private**;
every warm measured native repetition is below 5 ms. The recorded quiet-machine
condition failed before every repetition, so **formal latency qualification
remains open**. Electron JS-observer reference excludes its earlier native
entry and is not an equivalent clock. Cold first-200 figures and the private
warm-up's 7.767 ms p99 are preserved separately, never used for the warm bound.

79 focused replay tests pass; lint: 30 files, zero errors/warnings. Disposable
profiles and certificate keys removed. Routine invocation records, fingerprints,
all observations and failures are archived with hashes. Runtime brackets are
not owner/agent attention measurements. Task 0's cold column, upgrade gate and
156 baseline are unchanged. Subframes/opaque origins, worker identity/teardown,
SW updates/fetch events/cache, keepalive/speculation, WS/WT, additional resource
and rule contexts, cosmetics/scriptlets and private real-page sample remain gaps.


### CodeQL remediation and regression — October 17, 2026

[Evidence](evidence/f12-codeql-20261017/README.md) records fixes for seven CodeQL
findings at aa26d71a: preserve query refusal semantics with separate regexes;
replace exists/read/write with descriptor-based reads and atomic publication;
encode embedded JSON literals for script/HTML boundaries; isolate the local
fixture CA in the TLS agent's secure context. No suppressions or query exclusions.
New-head CodeQL is pending, not inferred from local tests.

84 focused tests pass, seven TLS/network tests pass on rerun, and 44-file lint
is clean. VM decision comparison: 12,830 unchanged. Authored response bytes:
5,123 candidates plus four controls and all 37 path fixtures unchanged. Fresh
native full and no-referrer comparisons pass twice per profile with zero decision
or context differences; GET redirects/dedicated workers and fail-closed probes
pass. Shared/service-worker identity remains a gap.

One guarded incremental bundle-hash build: one planned action, six executed
steps, 29.95 s Siso / 34.983 s wrapper; final plan zero. Budget 25 files / 62 hunks;
151 dependencies clean at pins. No GN, args, toolchain, environment-record or
cold-output change. This is routine tranche-2 work, never Task 0 cold time.
Six verified archives preserve 79 original files. No new latency qualification
is claimed; earlier timings belong to aa26d71a. Broader F12 gaps and Task 0's
upgrade gate remain open. Runtime brackets are not owner-attention measurements.


### Worker context investigation and idle-stop attempts — October 17, 2026

[Evidence](evidence/f12-worker-context-20261017/README.md) records a frame-context
lifetime fix: snapshot the actual frame at request entry rather than after the
async decision. Factory kind, frame state and partition/request isolation origins
are diagnostic fields only. Neither partition metadata nor an apparent owner
fills missing context. The audit explains Chromium's intentionally frameless
worker factories and the Electron observer's missing request-to-client identity.
**Shared/service-worker strict context remains GAP**, despite matching block/allow
behavior. Multi-client/no-client lifecycle correlation and teardown remain open;
no acceptance-contract relaxation or Electron rebuild was made.

One guarded incremental build: two planned actions, seven executed steps,
41.38 s Siso / 46.861 s wrapper; zero-action recheck. Budget unchanged at 25 files /
62 hunks; 151 Git dependencies clean at pins. No GN, args, toolchain, environment-record,
cold-output or large-build override. This is routine tranche 2, not Task 0 cold time.
86 focused tests and 44-file lint pass. Full corpus passes twice per regular/private
profile: 5,123 candidates, 2,503 blocked / 2,620 allowed, zero decision/context
changes. All four no-referrer runs pass 24 candidates. GET redirect/dedicated-worker
and fail-closed probes pass; shared/SW unresolved fields remain explicit.

The owner approved temporary Spotlight/updater pauses and restoration. Spotlight
was paused/restored for each attempt; root-owned Logitech updater could not be
signaled and passwordless sudo required authentication, so it was never paused.
The new --require-idle option retains and stops a run before any repetition below
the existing 90% idle gate. Combined-browser attempt: preflight 92.19%, first
Electron baseline 86.11–89.90%, stopped. Chromium-only attempt: preflight 93.78%,
first baseline 71.86–89.78%, stopped. Both produced zero measured repetitions and
cleaned disposable profiles/keys. No new latency result or qualification is
claimed. Earlier aa26d71a busy-machine timings remain historical. An administrator
authentication question is pending; no credential is collected by the harness.

Lossless hashed archives preserve both stopped runs, pause/restoration records,
build/regression logs, observations, audit and fingerprints. Existing 156/profile/
tabs and Task 0's upgrade gate are unchanged. Runtime brackets are not attention
measurements. Broader request coverage, cosmetics/scriptlets and private sanity
sample gaps remain open.


### Explicit worker contexts — October 17, 2026

Owner approval: “Yes—use explicit worker contexts with strict evidence.”
[Evidence](evidence/f12-worker-identity-20261017/README.md) records the contract
branch and independent CDP worker/realm/client observations in both runtimes.
Six service-worker subrequests per profile and variant now compare with observed
empty or single controlled-page sets. Raw unresolved top-frame fields stay raw;
no sidecar client origin changes engine inputs. Shared connected-client lifecycle
and the initial service-worker script remain gaps. No general worker acceptance.

Final paths-06 and controlled-07: eight fresh runs each, stable and valid in both
profiles, no failed cases; 25.791 s and 21.366 s respectively. Earlier probes and
the paths-04 private instability are archived with their limitations. A first-script
observation barrier fixes missing first-import telemetry; it changes scheduling
and is never enabled for latency. Recomparison with the final code is identical.

One guarded incremental build: one planned action, six steps, 30.65 s Siso /
36.441 s wrapper; zero-action check. No GN/args/toolchain/cache/cold-output change.
Budget 25 files / 62 hunks, 151 dependencies clean at pins. Routine tranche-2
cost only, never Task 0 cold time. 104 tests and 47-file lint pass. Full corpus
and fail-closed tests remain the previous 3ca65a11 results, not re-claimed here.
Eight verified archives preserve 129 files, including failed attempts and exact
capture-module snapshots. No private keys or permanent profile data.

Latency remains deferred by the owner; no process pause or password dialog.
Correction to the earlier checkpoint: administrator authentication is no longer
pending. Multi-client/teardown, service-worker fetch-event/cache/update behavior
and other F12 gaps remain open. The 156 baseline and Task 0 upgrade gate remain
unchanged. Attention/agent time is not measured.

### Worker ownership and initial service script — October 17, 2026

[Evidence](evidence/f12-worker-ownership-20261017/README.md). Actual MessagePort
challenges now link shared-worker connections to independently observed page and
worker realms. Initial service scripts join the new worker's DevTools target token
and pre-install lifecycle; no document top frame is invented. Actual hook inputs
and referrers remain compared, including the no-referrer variant.

All ten authored cases pass in default, controlled-client and no-referrer variants,
twice per runtime and regular/private profile (24 final runs). Six shared
subrequests and the initial service script close within these bounds; broad
multi-client/teardown, updates, failed scripts without a realm and fetch/cache
behavior remain gaps. No full corpus or formal latency re-claim.

Two exploratory runs retained shared gaps (25.552 s, 20.700 s), then the authored
readiness gate passed (21.172 s); final runs took 21.028 s, 21.371 s, 51.223 s.
These are probe invocation times, not decision latency or owner attention.
Correction: a97cec27's requested debugger barrier did not establish a pause;
current evidence uses observed agent readiness and actual port handshakes.

122 focused tests pass; 52-file lint clean. No native build, prepare, GN, args,
toolchain or environment change. Framework/native/engine hashes equal a97cec27;
zero added upstream files/hunks, preceding footprint 25/62. This is routine
tranche-2 work, never Task 0 cold time. Eleven verified archives retain 223 files,
including nonclosing attempts and the explicitly incomplete exploratory paths-02
source snapshot. Final source hashes match all three final reports. Disposable
profiles/certificate keys removed; no owned probe remains. Latency deferred,
156 and permanent tabs untouched, Task 0 upgrade gate open. Attention/agent time
not measured.
### Tranche 2: shared-worker multiple clients and owner teardown — October 17, 2026

[Evidence](evidence/f12-shared-lifecycle-20261017/README.md). Harness-only
checkpoint: two document owners and navigation-driven destruction of one exact
owner pass in regular/private profiles, twice per runtime. The prior ten-case
path regression remains green.

- Native builds: none; guarded `--check` reported zero scheduled actions in
  5.686 s. This is routine tranche work and never Task 0 cold-build time.
- Verification: final lifecycle 20.307 s; path regression 20.647 s; 127 tests;
  55-file lint clean. Failed/limited attempts of 17.774 s, 16.975 s and 23.970 s
  are retained separately in seven verified archives containing 63 files.
- Patch budget: no upstream or native file/hunk delta; prior measured footprint
  remains in force.
- Scope: bounded two-client and exact realm-destruction behavior only. Broader
  ownership, port lifecycle, target-close continuation, teardown races and
  service-worker behavior remain explicit gaps.
- Latency: deferred by owner; no latency measurement or process pause occurred.
- Owner attention / agent time: not measured.

### MV2 audit and service-worker lifecycle — October 17, 2026

[Spike B source audit](evidence/f12-spike-b/README.md) starts the approved second
F12 spike. Ordinary MV2 install/enable/startup gates are hard-disabled in the 157
pin; parser, component exception and blocking API remain. Component packaging,
privileges and payload dependencies need further audit before a runtime decision.
No ordinary MV2 restoration or uBO runtime success is claimed. Spike B remains
in progress; no extension-system patch or native build occurred.

[Service lifecycle evidence](evidence/f12-service-lifecycle-20261017/README.md)
records eight passing behavior sessions across Electron/Chromium and regular/private:
failed registration, controlled network fetch, cache response, blocked fetch and
replacement by a different script URL. Raw provider decisions independently verify
allow/block, profile and initiator. Observer session-loss errors remain in all
final sessions, so strict context acceptance stays open. Same-URL update revalidation,
failed-script realm correlation, multi-client/in-flight ownership and cache restart
remain gaps. Both attempts are archived with verified hashes; the first stopped
on offline-rejected background requests. Final invocation bracket: 27.831 seconds.

57-file lint is clean; eight evidence-verifier cases pass. No native build,
prepare, GN, output, toolchain or args change; zero upstream patch delta. This is
routine tranche work, not Task 0 cold time. Owner attention and agent time are not
measured. Latency remains deferred; 156, permanent profiles/tabs and Task 0's
extension-upgrade gate are unchanged. Plan progress table and coverage gaps updated.

### Component-loading audit and same-URL service updates — October 17, 2026

[Component audit](evidence/f12-spike-b/README.md) traces allowlisting, required
manifest key, component feature auto-grants, background-page creation and updater
ownership. Component loading is not ordinary MV2 compatibility. Runtime remains
unproven; no extension-system patch or component privilege was introduced.

[Service update evidence](evidence/f12-service-update-20261017/README.md) records
8 passing same-URL changed-byte update sessions, twice per runtime/profile, with
actual v1/v2 response hashes and controller version. The 404 startup target explains
the observer failures: original setup errors were masked by resume in finally.
Exact-session detach reconciliation now records incomplete lifecycle observations;
unknown errors remain faults. All final sessions have zero unexplained faults.
Strict failed-script/controlled-fetch context, unchanged-byte/cache-validator
updates and broader lifecycle coverage remain gaps; acceptance stays open.

Existing ten-case worker-path regression passes across eight sessions. 92 focused
tests pass; 58-file lint clean. Three sandbox-only loopback EPERM test failures
and the failed first update attempt are retained beside successful runs. Five
archives have verified member hashes. No native build/prepare/GN, no upstream
patch delta, no new output. Latency deferred. Test invocation timestamps are in
reports; owner attention/agent time not measured. Plan and coverage updated;
156, permanent profiles/tabs and Task 0 extension-upgrade gate unchanged.

### Controlled-fetch contexts and component-path design — October 17, 2026

[Context evidence](evidence/f12-service-context-20261017/README.md) closes the
bounded single-client controlled-fetch join: eight fresh runtime/profile sessions,
16 allowed/blocked worker requests. A proven page event is separated from the
worker network event; unknown duplicates remain gaps. Actual hook inputs and
observed worker/client contexts compare, without substituting a top-frame origin.
Same-URL update behavior still passes, but update-script attribution remains open
because the native update-check request lacks a DevTools ID. Failed-startup and
cache-only attribution and broader lifecycle cases remain gaps.

[Component assessment](evidence/f12-spike-b/README.md) identifies a narrow
browser-owned Add/allowlist candidate, without claiming runtime feasibility or
extension-core restoration. Pinned Chromium uBO cannot suspend requests during
filter-engine reset. Authenticated startup/reload holds, failure recovery and
privilege containment are requirements before adoption, not implemented features.

93 focused tests pass; 58-file lint clean. Existing worker-path regression is
retained with the fresh context run. No native build, upstream patch delta or
new output; latency deferred. Evidence archives/member hashes and source hashes
verified. Plan and coverage updated. Owner attention/agent time not measured;
156, permanent profiles/tabs and Task 0 upgrade gate remain unchanged.

### HTTP-failed loader identities and update-correlation guard — October 17, 2026

[Evidence](evidence/f12-service-loader-20261017/README.md): eight token-linked
HTTP 404 initial-script loader identities resolve across fresh runtime/profile
sessions. Execution realm is explicitly unobserved, never invented. The 16
controlled-fetch contexts and same-URL update behavior still pass. Broader failed
startup and update-script attribution are not closed.

Update investigation found a false Electron match when two same-URL hook
occurrences shared one initial Network event. The new hook/event bijection guard
rejects it; all eight captured updates remain gaps. Source inspection confirms the
native update checker lacks a frame/tab and recorded DevTools ID, so a later worker
with the same URL cannot establish its identity. Negative tests cover mismatched
HTTP tokens, non-failure responses, event ordering and repeated hook occurrences.

The [uBO assessment](evidence/f12-spike-b/README.md) now specifies browser hold
acknowledgement before engine reset, generation-safe release, fail-closed startup
and failure probes. These are runtime prerequisites, not implemented protection.
95 focused tests pass, 58-file lint clean; final worker-path regression retained.
Three archives verified with source hashes. No native build or patch delta;
latency deferred. Plan/coverage updated. Owner attention/agent time not measured;
156, permanent profiles/tabs and Task 0 upgrade gate unchanged.
# Tranche 2 routine incremental component probe — October 17, 2026

Evidence: [offline component admission](evidence/f12-component-admission-20261017/README.md).
Invocations: payload generation (658 hashes verified); prepare on 157; guarded
`--check` (2 scheduled actions before generated expansion); guarded `--build`
(4.79 s failed compile, restricted ScopedAllowBlocking); repaired guarded
`--build` (33.35 s success, 6 completed steps). No cold build or environment reset.
Both invocations and the failed/runtime retries are archived. Runtime admission
passes; provider readiness/reload protection and update-script identity remain
open. Budget 25/62 before, 27/65 after. Context regression 95/95, component 3/3.
These costs belong to routine tranche work, never Task 0's cold column. Latency
deferred; owner attention/agent effort not measured.
# Tranche 2 routine uBO reload safeguard — October 17, 2026

See [runtime and failed-attempt evidence](evidence/f12-ubo-reload-20261017/README.md).
Preparation copied only Blanc-owned blocker sources and generated GPL payload
integration. Unchanged-args GN added the existing extensions/browser dependency
(3.724 s). Guard check reported one initial action. Build invocations:

| Invocation | Result | Elapsed | Classification |
| --- | --- | --- | --- |
| hold-build | raw-pointer annotation compile failure | 5.84 s | routine incremental |
| hold-repair-build | success, six steps | 31.07 s | routine incremental |
| hold-pipe-build | empty response-body pipe repair, success, six steps | 31.64 s | routine incremental |
| hold-lifetime-build | weak profile context and profile-owned state, success, six steps | 31.29 s | routine incremental |

No cold build, cache reset, GN argument or toolchain change. Footprint 27/65,
unchanged from component admission. Test/retry session timestamps and failed
records are archived separately; owner attention/agent effort remain unmeasured.
No costs enter Task 0's cold column. Bounded runtime proof passes; full uBO parity,
broader worker/request coverage and update-script identity remain open. Latency
remains deferred. 156 and permanent profiles are untouched; disposable cleanup
includes the fixture-server connection-reset abort.

### Tranche 2 — full uBO corpus / update-check checkpoint, October 17

Routine verification only; **zero native compilations**, guard zero actions.
No cold-build time added to row 0. See
[evidence/f12-ubo-parity-20261017](evidence/f12-ubo-parity-20261017/README.md).
Final corpus run UTC 00:43:41.656–00:45:54.289 (132.633 s): four fresh sessions,
5,127 requests each, zero parity differences. Failed probe and interrupted full
run retained separately. Two eight-session service runs exercise unchanged and
changed bytes; all update identities stay gaps. Raw per-run timestamps are in
reports; they are session brackets, not owner attention or agent work time.
128 tests / 67-file lint pass. Footprint remains 27 files / 65 hunks; no native
patch delta. Owner attention and agent time not measured. Latency deferred;
156 baseline and Task 0 outcome unchanged. Full Spike A/B acceptance remains open.


### Tranche 2 — cosmetic and update collision checkpoint — October 17, 2026

See [evidence/f12-ubo-cosmetics-20261017](evidence/f12-ubo-cosmetics-20261017/README.md). Four fresh uBO sessions / eight normal+CSP pages match on static CSS,
`has-text` mutations and late constant/fetch scriptlets. First-inline constant
check fails in both runtimes on all eight pages; document-start acceptance stays
open. Initial favicon misses retained; final fixture explicitly serves them.
Eight same-URL/two-registration update sessions pass behavior; all 16 update
identities remain ambiguous gaps. No URL/order/timing join introduced.
138 focused tests and 73-file lint pass; guard schedules zero actions, zero native
compilations, no cold cost. Native footprint unchanged. Reports give session
brackets only; owner attention/agent time unmeasured. Latency deferred. Full
Spike A/B acceptance, Task 0 outcome and baseline promotion remain unchanged.


### Document-start / update-identity follow-up — October 17, 2026

See [evidence](evidence/f12-scriptlet-start-20261017/README.md). Two four-session sets (with/without injection
observer), 48 loads across normal/CSP, first visit/reload/fresh navigation:
0 early constant and 0 immediate-fetch prevention passes; later getter/constant
succeed. Both gates remain open; no fixture delay or fabricated identity fix.
Pinned source shows update version omitted and full scope collapsed to origin
before factory interception. Correct fixes require pre-page-script registration
with generation/document binding, and an independent loader-registration join
in both runtimes. 142 tests / 77-file lint pass; archives independently verified.
Guard zero actions, no native compile/cold cost; footprint unchanged. Latency
deferred; owner attention/agent time unmeasured. Plan acceptance unchanged.


### Native document-start and update-loader implementation — October 17, 2026

See [evidence](evidence/f12-document-gate-20261017/README.md). Chromium now passes
12/12 first-inline constant/getter and immediate-fetch checks across normal/CSP,
reload and fresh documents; Electron remains 0/12. Seven document/profile/filter
safety probes and ten prior reload/ownership checks plus unready startup pass.
Static/has-text/late-fetch regressions pass; early timing difference is explicitly
reported, not hidden as parity. Native-only loader tokens prove eight unchanged
same-URL collision checks and four changed-byte updates; Electron's independent
identity and cross-runtime acceptance remain gaps. Eight changed-byte sessions
retain controlled-fetch and failed-initial-loader proofs.

162 tests and 84-file lint pass. Four guarded incremental attempts: 55.62 s
stopped after an unexpectedly expanded header rebuild, 15.65 s compile failure,
13.26 s API-spelling failure, 43.98 s success / 10 steps; final guard zero actions.
128.51 s total invocation wall time is routine repair/build overhead, not cold
cost. Exact pristine header bytes and their recorded checkout metadata were
restored to avoid needless recompilation; proof is archived. No output, args or
toolchain reset. Footprint 31 files / 74 hunks (limit 40/120). Initial payload
import-order timeout is retained; final lazy initialization passes. All seven
archives independently verify and disposable profiles/keys were removed.

Main-frame guarantee only; synchronous gate/polling overhead remains unqualified.
Electron correction, subframes/opaque contexts, broader scriptlets/paths/lifecycle,
component containment and recovery remain open. Latency deferred; owner attention
and agent time unmeasured. Task 0 outcome/baseline and 156/permanent data unchanged.


### Subframe scriptlets and cross-runtime update tracing — October 17, 2026

See [evidence](evidence/f12-subframe-trace-20261017/README.md). Native HTTP(S)
subframes use browser frame IDs/ancestor chains and uncached current-engine
selection: 16/16 first-inline constant/getter, ancestor and immediate-fetch cases
pass across same-origin, cross-origin, nested CSP, fresh navigation, exception
and changed/restored ancestor cases. Electron early 0/16; late 12/16 versus
Chromium 16/16. Shipping Electron remains unchanged. Main-frame 12/12 and seven
safety regressions pass on the new binary.

Eight same-URL collision sessions with native ServiceWorker tracing complete.
Eight native update joins pass; eight Electron identities remain gaps. Stock
checker constructor traces expose script URLs, not the independent registration,
checked-version or hook-token join needed to close the cross-runtime gate. No
URL/time/order or numeric trace-ID equivalence is inferred. First trace attempt
stopped on a two-second flush deadline and remains excluded; final ten-second
bounded flush requires actual completion. Old unit job fixtures were corrected
to carry the now-required frame ID/ancestors; 172 tests and 89-file lint pass.

One guarded incremental build: 37.57 s wrapper / 33.65 s Siso, eight steps, no
failure or cold output. Final guard zero actions, footprint unchanged 31/74.
All build wall time is routine tranche work, separate from Task 0 cold cost.
Owner attention/agent time not measured. Latency including gate overhead remains
deferred. Private subframes, opaque/non-HTTP/fenced contexts, broader scriptlets,
component containment, recovery UX and independent Electron identity remain
open. No Task 0 outcome/baseline promotion or change to 156/permanent profiles.


### Private/opaque frames and Electron instrumentation assessment — October 17, 2026

See [evidence](evidence/f12-opaque-electron-audit-20261017/README.md) and the
[source-backed Electron assessment](electron-update-instrumentation.md).
Eight fresh sessions (two per runtime/profile) complete 56 frame cases. The
24 private script-enabled cases keep uBO disabled, permit the allowed control
and reject the blocked probe with zero blocked arrivals. Eighteen have actual
private Blanc Blocker cancellation records; six Electron srcdoc/data cases
remain attribution gaps because the existing observer scrub rejects non-HTTP
frame metadata. This does not count as private uBO scriptlet acceptance.

Four native regular HTTP/sandbox-HTTP cases pass first-inline constant/getter
and fetch suppression. Eight native non-HTTP regular cases lack the tested
early effects; Electron's 12 regular script-enabled cases lack them too.
Late effects differ: Electron HTTP/sandbox-HTTP/about:blank flags appear, while
srcdoc/data flags do not; Chromium non-HTTP flags do not appear. Eight sandbox
no-script cases prevent authored script execution; this is sandbox enforcement,
not successful scriptlet coverage. Actual opaque origins stay literal `null`.

The Electron v44.8.0 source pin is Chromium 152.0.7977.167. The assessment maps
browser-owned update metadata → per-load token → ResourceRequest → real Electron
webRequest hook, with collision/profile/old-version/lifetime safeguards and
required negative tests. It is unimplemented/uncompiled and needs a separately
approved Electron diagnostic build. Existing native joins retain their prior
meaning; independent Electron update identity stays open.

Two incomplete matrix attempts remain archived (opaque frame-name lookup,
then about:blank navigation replacing document.write); the corrected harness
uses element.contentFrame and writes to the default blank document. The first
unit invocation hit nine sandbox loopback EPERM errors; the authorized loopback
rerun passes all 181 tests. Lint: 93 files, zero issues. No native edits or
compilation; the existing output's final guarded plan has zero actions. Last
measured footprint 31 files/74 hunks is unchanged by these harness/docs changes.
All profiles/CA private keys and owned browser processes are removed. No native
mouse/keyboard or latency claim. Latency stays deferred; broader opaque/fenced
coverage, scriptlets, containment, recovery, worker contexts and both full
acceptance gates stay open. Plan items 3–6 remain unstarted; no Task 0/baseline
promotion and no 156/permanent-profile changes. Attention/agent time unmeasured.


### Inherited document start, Electron observer and diagnostic-build proposal — October 17, 2026

See [evidence](evidence/f12-inherited-observer-20261017/README.md). The opt-in
native gate now considers about:blank/srcdoc only when the committed browser
URL matches, its non-opaque HTTP(S) origin matches its actual parent origin,
and the existing profile/document/generation checks hold. That origin supplies
scriptlet rule selection only; document identity and request metadata remain
unchanged. Opaque about/data and unsupported schemes do not acquire a guessed
parent origin or an early-protection claim.

Eight fresh sessions repeat all 56 frame cases. Native early checks now pass
8/8 across HTTP, sandboxed HTTP, inherited srcdoc and blank (four newly passing
inherited cases). All 24 private script-enabled cases have actual private Blanc
Blocker cancellation records and unchanged allowed/blocked network outcomes.
The six former Electron attribution gaps are closed by synthetic-only exact
about/data metadata admission, with observed initiator presence and literal
opaque null preserved. Unknown data/blob/file metadata and exempted network
fields are rejected; the public recorder scrubber is unchanged.

Six inherited normal/exception/restoration probes and all seven gate-safety
regressions pass. The 56-case matrix retains 16 early-scriptlet gaps: four native
opaque srcdoc/data cases and 12 Electron regular cases. Eight sandbox script-denial
checks remain scoped enforcement evidence, not scriptlet passes. Broader nested,
blob/fenced/CSP/lifecycle contexts, full provider/containment acceptance and
cross-runtime update identity remain open. The full 5,123 corpus was not rerun.

187 focused tests pass; lint covers 96 files without issues. One guarded
incremental build: 37.45 s wrapper / 33.62 s Siso, eight steps, after a two-action
plan. No compile failure, cold output, GN-arg/toolchain or hook change. Final guard
zero actions; measured footprint31 files/74 hunks. Build time is routine tranche
work, never Task0 cold cost. Profiles, fixture CA keys and owned browser processes
removed. No physical-input claim. Latency remains deferred; attention/agent time
not measured, items3–6 unstarted, Task0/156/permanent data unchanged.

[Electron diagnostic build proposal](electron-instrumentation-build-request.md)
is drafted with separate unchecked §8 approval. It pins Electron44.8.0/Chromium152,
one isolated arm64 testing output, local tools and resource/time limits. Estimates
are labelled unmeasured (4–8h cold compile; up to220GiB new-root budget). No fetch,
setup or build started. The current tranche approval does not authorize it.

Inherited-frame native/extension late-path deduplication is not proved by the bounded constant/fetch cases; an exactly-once probe remains required for broader scriptlets.

## Opaque about selection and inherited deduplication — October 17, 2026

Evidence: [opaque/dedup checkpoint](evidence/f12-opaque-dedup-20261017/README.md).
Browser-side selection now admits exact committed about:blank/srcdoc with a
browser-recorded tuple/precursor matching the actual non-opaque HTTP(S) parent.
The precursor selects rules only; opaque origin stays `null` and is never used
as a same-origin grant or a replacement network observation. Unknown precursor,
opaque parent and unsupported URLs remain outside this bounded gate.

The generated uBO payload wraps both its exported native main-world body and
its extension insertion body with one per-payload random, per-realm once marker.
The marker is non-enumerable/non-configurable/non-writable after installation.
It is duplicate prevention, not an authorization boundary against page code.
Exceptions that select no payload set no marker; a throwing body is not retried.
New documents have independent markers. In-place filter-generation semantics
and arbitrary scriptlets remain broader coverage work.

Eight fresh sessions repeat 56 frame cases: **42 scoped passes / 14 gaps**.
Native regular early checks now pass 10/10 (HTTP, sandbox HTTP, inherited srcdoc,
blank, opaque srcdoc, each twice). All 24 private cancellation observations
still pass; uBO remains disabled there. Two native data cases and twelve Electron
early cases remain gaps. Eight no-script cases are sandbox enforcement only.

Four inherited repeat-delivery cases, across two fresh document cycles, show
one body execution with 4–5 attempts after two deliberate extension deliveries.
The test explicitly resets upstream's isolated injection sentinel to force the
late main-world path; it does not pretend these deliveries occurred naturally.
Two opaque srcdoc cases pass early checks but extension late delivery cannot be
observed, so their repeat-delivery scope remains a gap. Independent verification
rejects missing attempts, duplicate bodies and opaque-origin substitution.

Boundary run records blob, data and nested-opaque early gaps, plus one passing
opaque-srcdoc exception. Seven existing gate-safety and six inherited
normal/exception/restoration checks pass; a separate observer/counter-free
payload repeats the six inherited checks. Full 5,123-network parity and complete
previous ancestor matrices were not rerun and remain historical.

One guarded incremental build: **34.24 s wrapper / 30.61 s Siso, six steps**,
from a one-action plan. Final guard zero; fresh footprint **31 files / 74 hunks**.
**195 focused tests / 102-file lint pass**. First lint found one harness global
reference and was corrected. Two excluded dedup probes are retained: first
never forced late delivery past upstream's isolated marker; second overclaimed
opaque extension reachability and stopped. Neither is counted as acceptance.
Disposable profiles/fixture CA keys/runtime processes were removed.

Latency remains deferred, including gate and marker overhead. Electron early
behavior and independent update-loader identity remain open; its diagnostic
build request §8 is unchecked and no checkout/build started. Broader lifecycle,
CSP/opaque/fenced contexts, arbitrary scriptlets, component containment and
plan items 3–6 remain open. Task0 and the156 baseline are unchanged.

## Data/blob and nested-opaque document coverage — October 17, 2026

Evidence: [non-HTTP chain checkpoint](evidence/f12-data-blob-20261017/README.md).
The native gate now accepts data/blob along with about documents only when the
exact browser-committed URL matches and its browser-owned tuple/precursor is
HTTP(S). Every opaque parent must carry that same tuple; selection stops at the
first non-opaque parent and requires an exact match there. Mismatches, unknown
precursors, no parent, unsupported ancestors and chains beyond 64 hops receive
no added payload. No ancestor is skipped to borrow the visible top tab. This is
rule selection only, never inherited origin privileges or substituted network
context. Document/profile/generation binding and once-only payload remain.

Four fresh native regular/private sessions cover nine cases each. **14 regular
early checks** pass over data, blob, sandboxed blob, nested opaque srcdoc/data/blob
and child-origin blob. Host-specific first-inline markers prove top-vs-child rule
selection. **16 private-policy checks** have actual Blanc cancellation records
with the observed initiator (including opaque `null`); private uBO stays disabled.
Six of the 36 cases remain gaps: four cross-owner blob navigations are rejected
by Chromium before an inspectable document, and two regular mismatched-chain
data documents receive no early payload. Browser rejection is not a native
scriptlet/selection pass. The private mismatched chain still has its own network
cancellation proof and is not counted as private uBO coverage.

Two more fresh regular sessions exercise explicit exceptions and the baseline
again: seven exception outcomes and seven baseline early outcomes pass; four
mismatch/navigation gaps remain. The latter session is labelled `restored` in
raw data but is a **fresh-session baseline**, not an in-place filter-generation
restoration claim. The 56-case Electron/native matrix is also rerun on this
binary; its proof and exact scoped counts are in this checkpoint's evidence.
Inherited deduplication and document-gate safety regressions are rerun separately.
Full 5,123-URL network parity and full previous ancestor matrices remain historical.

One guarded incremental build: **36.01 s wrapper / 32.36 s Siso, eight steps**
after a two-action plan. Final guard zero. Fresh measured footprint **31 upstream
files / 74 hunks**. **202 focused tests / 106-file lint pass**. No cold output,
GN-args/toolchain changes, latency run or Electron diagnostic build. §8 of that
separate proposal remains unchecked. Plan items 3–6 and Task0 remain unchanged.

Two failed harness attempts are retained/excluded: the first assumed a rejected
cross-owner blob had a visible document; the second evaluated that absent
execution context and stalled. Only its verified disposable browser was stopped
with SIGTERM so the runner saved evidence and removed its profile. The final
probe uses actual browser console rejection without evaluating a missing realm.
All final and failed-run cleanup reports, raw observations, source snapshots,
binary hashes, invocation logs and independent verification are archived.

Remaining: cross-owner/unknown-precursor and mismatched chains, top-level data/blob,
deeper/fenced contexts, opaque-specific ancestor rules and CSP permutations,
opaque extension late-path reachability, arbitrary scriptlets/lifecycle/recovery,
component containment, independent Electron update identity and Electron early
timing. Qualified latency remains explicitly deferred, including gate overhead.

Final regression evidence: the eight-session56case matrix verifies **44 scoped
passes /12 Electron early gaps** (native12early,24private attribution and8sandbox
no-script enforcement). Four inherited repeat-delivery proofs and seven gate
safety checks pass; two opaque extension late-delivery attempts remain unproved.
These scoped categories are not summed into full provider acceptance.

## Opaque late delivery and duplicate suppression — October 17, 2026

Evidence: [late-delivery checkpoint](evidence/f12-opaque-late-20261017/README.md).
Two fresh native regular profiles each create eight document kinds twice: opaque
srcdoc, data, blob, sandboxed blob, nested opaque srcdoc/data/blob, and child-origin
blob. Native first-inline effects and original security origins are checked before
any diagnostic delivery. No private uBO or Electron parity claim is added.

- **8 actual extension repeat-delivery passes:** data and nested-data documents
  receive two deliberate late deliveries through raw `chrome.tabs.executeScript`.
  The real engine's assembled injector executes, its main-world attempt count rises
  by at least two, and its body count remains one. The upstream isolated injector
  sentinel is deliberately reset; the shared main-world once marker is not reset.
- **8 opaque-srcdoc delivery gaps:** direct and nested sandboxed srcdoc callbacks
  explicitly refuse access at origin `null`, even with `matchAboutBlank: true`.
  The earlier wrapper hid this error; it is now archived. Permissions are unchanged.
- **16 blob delivery gaps:** `webNavigation.getAllFrames` omits the blob leaf.
  A separate all-frames diagnostic message probe supplies browser-owned sender
  metadata for reachable parents, but no matching blob document. No frame id or
  parent origin is substituted. The pinned `IsValidUrl` source excludes blob from
  webNavigation's accepted schemes; the all-frames omission's deeper cause remains
  unproved. An omitted frame is not proof that every possible extension path fails.
- **32 direct mechanism passes:** the same real engine main-world payload is also
  delivered twice by explicit Playwright evaluation in each actual document realm.
  Attempts rise by exactly two, bodies remain one, origins and early effects stay
  unchanged. This is diagnostic duplicate-suppression evidence, **not extension
  delivery acceptance**. The fixture supplies the selection origin for this direct
  test; unresolved extension frame ids use a diagnostic-only `-1`. New document
  cycles prove marker state is per realm, not retained from the previous document.

Seven negative verifier tests reject missing main-world arrival despite successful
API callbacks, repeated bodies, missing direct attempts, replaced opaque origins,
stale/wrong document identity, silently discarded blob candidates and changed
payload bytes. Both final runs independently verify. Three failed harness attempts
remain excluded: Playwright's stale empty opaque URL twice, then assuming blob
appeared in webNavigation. The final harness reads `location.href` in the actual
realm and records absent extension identity as a gap.

**209 focused tests and 109-file lint pass.** The first sandboxed unit invocation
failed on loopback `listen EPERM`; the permitted run passed without code changes.
No native or payload code changed. Guarded plan: **zero actions, 3.77 seconds**;
no compile launched. App/framework hashes match the prior checkpoint. The last
measured upstream footprint remains 31 files / 74 hunks (not remeasured here).
Both final runs took 13.33 and 13.07 seconds; these are harness wall times, not
latency measurements. All five attempted disposable profiles were removed.

Claude Code plan: Spike B remains in progress. Production opaque-srcdoc/blob late
reachability, mixed/unknown/top-level/deeper/fenced contexts, ancestor/CSP rules,
arbitrary scriptlets, lifecycle/filter generations and privilege containment remain
open. Previous network, private and gate-safety matrices were not rerun for this
harness-only change. Latency stays deferred. Electron diagnostic proposal §8 is
still unchecked; no checkout/build started. Task 0 and plan items 3–6 are unchanged.

## Opaque/blob static origin fallback investigation — October 17, 2026

Evidence: [static fallback checkpoint](evidence/f12-origin-fallback-20261017/README.md).
The pinned source distinguishes legacy `matchAboutBlank`'s about-only ancestor
climb from static content scripts' `match_origin_as_fallback` origin/precursor
matching for about/blob/data/filesystem. Host permission checks remain in place.
The legacy climb can stop at a remote parent; this is consistent with the opaque
refusal, but no internal trace proves that particular bailout. webNavigation's
valid-scheme list separately excludes blob, explaining its enumeration omission.

Two **diagnostic-only copies** of the existing observed uBO payload add one static
isolated-world content script, matched only to the two authored fixture origins,
at document idle. They differ only in `match_about_blank` versus
`match_origin_as_fallback`. Existing scripts, permissions and private exclusion
are preserved. The prototype's existing payload is not edited. The test receiver
sends actual browser `MessageSender` frame/document id, URL and origin; the harness
requires an exact unique authored document before targeting its `documentId`.
No permission or extension-system patch, guessed frame id or substituted origin.

The matched final comparison has ten frame kinds over two document cycles:

- About-only mode: **4 positive-control passes / 16 absent-receiver gaps**.
  The HTTP and inherited-srcdoc controls confirm the content script is loaded.
- Origin mode: **14 diagnostic static-delivery passes / 6 gaps per profile**,
  reproduced in two fresh profiles (**28 / 12**). New reachable kinds are opaque
  srcdoc, blob, sandboxed blob, nested opaque srcdoc and child-origin blob.
  Their browser-provided origins stay unchanged, including opaque `null`.
- Static data, nested-data and nested-blob receivers remain absent. The earlier
  programmatic data/nested-data passes still stand; the two APIs behave differently.
  This absence is retained as a gap, not attributed to a source cause without proof.
- All three final profiles pass two out-of-scope controls: unmatched HTTP and
  sandboxed srcdoc produce no diagnostic receiver or fixture-specific scriptlets.
  Existing generic native scriptlet counters may still be present and are recorded.

Each successful receiver gets the real engine main-world payload twice through
extension messaging and DOM script insertion. Actual main-world attempts increase
by at least two while the body count remains one. **No direct Playwright payload
evaluation is used.** Payload bytes and exact responses/identity are archived.
This proves a bounded, supported extension delivery mechanism. It is **not yet
provider integration**: fixture-selected rule context is still supplied by the
harness; authenticated context selection, readiness/generation/lifetime binding,
CSP/ancestor rules, recovery and privilege containment remain required. The
receiver is intentionally an isolated experiment, never shipped or installed into
the permanent profile. No new private uBO or Electron acceptance claim is added.

**216 focused tests / 114-file lint pass.** Seven new verifier tests reject absent
arrival, wrong/stale identity or origin, duplicate execution, direct-eval claims,
widened manifest scope, unmatched-host delivery and payload tampering. The loaded
manifest itself is verified. Guarded native plan: **zero actions, 5.68 seconds**;
no compilation. Native app/framework hashes remain unchanged; last measured patch
footprint remains 31 files / 74 hunks, not remeasured here. All experiment profiles
are removed. Early exploratory runs are archived separately from the final proof;
one scope-control attempt failed because it incorrectly expected no generic native
counter at all. The final control checks actual fixture-specific effects instead.

Claude Code plan and routine ledger updated. Spike B remains in progress. Qualified
latency remains deferred; harness wall times are not latency measurements. Electron
diagnostic build §8 remains unchecked/unstarted. Task 0 and items 3–6 are unchanged.


## Static origin fallback integrated — October 17, 2026

[Evidence and exact limits](evidence/f12-static-integration-20261017/README.md).
Browser-owned live document/tab/frame/origin, precursor/ancestor selection and
reload generation now bind the automatic static late path to the real uBO engine.
Two fresh profiles: **36 non-HTTP late-delivery passes + four HTTP early controls**,
one body per document; **26 identity/generation checks**. No fixture context or
harness payload delivery supplies those results. The former data/nested-data/
nested-blob receiver gaps were a diagnostic `crypto.randomUUID()` failure in
insecure contexts; its corrected diagnostic passes **20/20**, superseding that
hypothesis. Existing private/non-HTTP matrix **30 passes/six boundary gaps**,
exceptions/fresh restore **14/four**, and **seven gate safety checks** pass.

**228 tests / 119-file lint pass.** One incremental build **35.12 s wrapper /
31.49 s Siso, six steps**; final guard zero actions. Fresh footprint **31 files /
74 hunks**. Exploratory/failed attempts and cleanup are retained in the evidence.
No full network-corpus or Electron rerun. In-flight delivery/reload atomicity,
broader CSP/Trusted Types, lifecycle/owners/scriptlets/containment and Electron
identity remain open. Latency deferred; Electron build §8 unchecked/unstarted.
No baseline promotion or change to plan items 3–6.


## Static fallback reload schedules and CSP — October 17, 2026

[Evidence and exact limits](evidence/f12-static-race-csp-20261017/README.md).
Assets-only final reply generation check: final **45 diagnostic schedules** include
15 actual filter-list reloads; **36 pre-dispatch drops / nine after-delivery stale
attempts**, no duplicate bodies. Explicit diagnostic pauses establish controlled
behavior, not natural race incidence. **After-dispatch atomicity remains a gap**;
unchanged-rule reloads do not qualify in-place changed-rule semantics.

Ordinary provider CSP matrix **15/15** actual late attempts with one body. Page
nonce/script-none and Trusted Types controls remain enforced; extension-world
insertion is privileged/exempt in this pin. Receiver comment corrected, no policy
weakening; full CSP/containment remains open. Ordinary regression **18 late + two
HTTP controls + 13 identity checks** passes. **238 tests / 126-file lint** pass.
Zero-action guard **4.57 s**, no compile; last upstream footprint31/74 unchanged,
not remeasured. Initial lint and all runtime attempts retained. No full network,
Electron/private/safety reruns. Parent32790e0b CodeQL four alerts remain unresolved.
Latency deferred; Electron build §8 unchecked/unstarted; Task0/items3–6 unchanged.


## Four CodeQL remediations — October 17, 2026

[Changes, evidence and limits](evidence/f12-codeql-final-20261017/README.md):
readiness fixture HTTPS, exact parsed-host checks in probe/verifier, and HTML-safe
marker literals in the self-contained generated wrapper. No suppressions.
**10 readiness + one startup check**, **18 late deliveries + two HTTP controls +
13 identity checks**, **15 CSP cases**, **242 tests / 128-file lint** pass. Initial
mixed-content-short-circuit attempt and lint failure retained and excluded.
The final page HTTPS control proves native fail-closed rejection, not isolated
sender authorization. Native source unchanged; **zero actions / 4.29 s**, no build.
CI must confirm the four alerts clear on the pushed head. After-delivery atomicity,
broader acceptance/containment and Electron identity gaps remain; latency deferred,
Electron build §8 unchecked/unstarted; Task0/items3–6 unchanged.


## Static delivery barrier and broader CSP — October 18, 2026 UTC

[Evidence and exact limits](evidence/f12-static-drain-20261018/README.md).
The static receiver now holds a document-bound delivery lease until synchronous
insertion finishes. Reload acknowledges the native request hold, then drains
committed deliveries before engine reset/readiness. Sent code is serialized,
not revoked. A three-second timeout retains the lease and fails closed; lost
acknowledgements have no automatic recovery yet.

**45 controlled schedules:** 36 pre-dispatch drops, nine deliveries drained before
reset, no duplicate bodies; 15 actual unchanged-rule reloads. A destroyed receiver
makes actual reload reject while unready. This qualifies static-delivery/reset
ordering, not native-early/upstream injection atomicity, changed-rule semantics or
natural race incidence.

**15 new policy cases:** five HTTP-header controls and ten inherited srcdoc/blob
cases cover nonce, none, Trusted Types, strict-dynamic and report-only. Page-policy
negative controls remain effective while privileged extension delivery succeeds.
Not full containment. Existing **15 meta-CSP**, **18 late + two HTTP + 13 identity**,
and **10 readiness + one startup** regressions pass. **253 tests / 133-file lint**.
**Zero actions / 5.18 s**, no native build; binary hashes unchanged, last footprint
31 files/74 hunks unchanged and not remeasured. Four archives, 231 members, five
independent extracted proofs; all disposable roots removed. Initial test-import
failure and earlier race run retained/excluded from final proof.

Remaining: lost-ack recovery, concurrent reload/lifecycle/recreation, native early
and non-static upstream deliveries, in-place changed rules, asynchronous effects,
adversarial/deeper/combined CSP and full containment, broader coverage and Electron
identity. Latency remains deferred; Electron diagnostic build §8 stays unchecked
and unstarted. Task0/items3–6 unchanged. Parent b99334c7 passed all 22 CI checks,
none skipped, CodeQL no new alerts; this checkpoint awaits its own CI.


## Lost acknowledgement recovery and reload lifecycle — October 18, 2026 UTC

[Evidence and limits](evidence/f12-static-recovery-20261018/README.md).
A held reload can now retire a static lease after the browser proves the exact
previously verified document is absent. This proof chain starts with actual
MessageSender identity and two LateContext checks; an arbitrary absent ID is not
destruction proof. The authenticated query preserves inactive/BFCache/retained
crash documents as present, based on the pinned source audit. Runtime BFCache,
prerender and crash cases remain unqualified.

**45 controlled schedules pass**, retaining 36 pre-dispatch drops / nine drained
committed deliveries and zero duplicate bodies. Additional runtime checks prove:
live receiver timeout keeps page fetches blocked; two real load calls share a
promise through acknowledgement; overlapping begin and stale completion reject;
receiver acknowledgement allows retry after failure; destroyed receiver permits
actual reload recovery with exact native lifetime evidence. Malformed ID,
stale/malformed generation and popup query controls reject.

Generated uBO clears its shared load promise after native readiness acknowledgement
on success or failure; completion uses the epoch returned by begin. This broadens
reload lifecycle coverage but does not close native early/upstream non-static
injection atomicity, changed-rule semantics, asynchronous effects or full recovery UX.

**260 tests / 133-file lint**, ordinary **18 late + two HTTP + 13 identity**,
**15 header/inherited CSP**, and **ten readiness + one startup** checks pass.
One guarded incremental **34.59 s wrapper / 30.82 s Siso, six steps**; final guard
zero actions **4.39 s**. Fresh footprint **31 files / 74 hunks**. Four archives,
236 members, four independent extracted proofs. Initial test/harness failures and
pre-final runtime retained and excluded; all disposable roots/private keys removed.
No full network, Electron or meta-CSP rerun. Latency remains deferred; Electron
build §8 unchecked/unstarted. Task0/items3–6 unchanged; CI pending this checkpoint.

## Native early and upstream completion ordering — October 18, 2026 UTC

[Evidence and limits](evidence/f12-delivery-order-20261018/README.md).
Native nonempty GetScript responses retain a document-bound token through synchronous
renderer execution and completion acknowledgement. Begin cancels only undispatched
jobs; provider reset/ready drains dispatched work, and native ready refuses pending
deliveries. Generated initial startup also drains native leases. Upstream scriptlet
injection and log-level API calls synchronously acquire completion leases, released
only when the pinned API settles. Missing completion times out held, not expired.

Four controlled schedules pass: two inside native ExecuteScript (with queued upstream
work also pending), two after actual exact-tab upstream API settlement but before
acknowledgement release. Both paths block actual filter reload, remain held on timeout
and recover on completion/retry; no duplicate main-world bodies. The upstream two
are completion-boundary diagnostics, not a renderer execution pause or exact-document
identity proof. Attempts 01/02 failed to pause upstream; attempt 03 caught empty-result
about:blank work; all are retained/excluded. Final attempt 04 requires positive exact-tab
API results. Broader lifecycle/navigation/async effects and non-scriptlet injection
channels remain gaps; native destruction recovery is source-backed, not runtime-tested.

Regressions: 45 static schedules and lost-ack controls; 18 late + two HTTP + 13 identity
checks; 15 header/inherited CSP; ten readiness + one startup. 268 tests / 139-file lint.
One incremental build 45.70 s wrapper / 41.73 s Siso, 19 steps; final guard zero actions
4.98 s. Fresh footprint 31 files / 74 hunks. No cold/args/toolchain changes. Full network,
Electron and meta-CSP matrices not rerun. Latency deferred; Electron build §8 unchecked.
Previous-head 79588947 CodeQL passed with no new alerts; oauth-compatibility failed in
wallpaper smoke line 151 (30 s private fade wait), not OAuth itself. No rerun. Current
checkpoint CI remains to be evaluated. Plan items 3–6 and Task0 promotion gate unchanged.


## Procedural helper completion drains — October 18, 2026

Four additional messaging API sites join the upstream barrier; awaited results are preserved. Two procedural drain/timeout schedules and four existing native/upstream schedules pass. 272 regression tests pass; 127 scoped lint checks pass. Zero-action guard in 5.06 s, no compile; binary hashes unchanged. Runtime durations are diagnostic execution brackets, not latency or owner-attention measurements. Logger/noscript/picker runtime, exact document identity, other injection channels and lifecycle/async semantics remain gaps. Latency deferred; Electron build unapproved. See [evidence](evidence/f12-helper-delivery-20261018/README.md). Task 0 and baseline unchanged.

## Logger, noscript, picker and navigation checkpoint — October 18, 2026

Six disposable regular-profile Chromium schedules pass: logger, noscript and
picker each drain normally and fail closed on an intentionally withheld API
acknowledgement, then recover after release/retry. These exercise the real helper
files. Noscript replaces its authored fallback; picker preserves its awaited
reply and does not return early. Logger coverage proves helper execution and
completion ordering, not the logger UI or every logged cosmetic rule.

Two additional picker schedules navigate after actual helper execution while its
acknowledgement is withheld: same URL and another path on the same origin. The
actual extension MessageSender documentId matches webNavigation's old document;
the new document has a different ID and cannot retire the old pending lease.
These are post-execution identity observations, not document-bound pre-dispatch
targeting. Legacy executeScript loads the file asynchronously and targets a frame;
ScriptExecutor explicitly notes its preallocated document ID can become stale.
Pre-dispatch navigation, cross-origin/BFCache/lifecycle races, async effects and
other injection channels remain gaps. No full atomicity or acceptance claim.

Diagnostic payloads only add exact helper-entry observations and controlled
completion holds; no production/native changes. First attempt failed because the
picker hold intercepted initialization instead of the requested picker helper;
the corrected harness arms picker after initialization. The failed attempt and
intermediate pass remain archived; the final source passes all six cases with
the document observer enabled. Independent verification rejects eight corrupted
evidence variants. 272 regression tests pass; 127 scoped lint files clean;
zero-action build guard, no compilation, binary hashes unchanged from 249b086c.
Fresh disposable profiles/certificate keys removed. See
[evidence](evidence/f12-helper-channels-20261018/README.md).
Latency deferred; Electron diagnostic build approval remains unchecked. Spikes
A/B remain in progress, items 3–6 not started, no baseline promotion.

## Browser pre-dispatch document constraint — October 18, 2026

The opt-in uBO identity/switch path accepts `blancDocumentId` for single-frame
JavaScript only. ScriptExecutor compares the browser document ID within its own
tab/frame; ExecuteCodeFunction checks after asynchronous file loading and before
dispatch. Missing/replaced, malformed, cross-tab, CSS/webview and all-frame uses
of this constraint are refused. Other extensions cannot use it. Legacy calls
without the field retain their upstream behavior.

The generated adapter acquires a completion lease before querying browser frame
identity, rechecks readiness/generation, and supplies the observed document ID.
All-frame calls without a subtree root expand a maximum 64-document snapshot
into individually constrained calls; newly created frames are not added later.
A partial error cannot release another pending call. Subtree all-frame targeting
and larger snapshots refuse. The observation boundary is the browser snapshot:
this does not prove the original caller's earlier event belonged to that document.

Eleven offline regular-profile runtime checks pass: current code/file execution;
same-document fragment acceptance; same-URL, cross-path and cross-origin stale
rejection; malformed/wrong-frame/cross-tab/all-frame raw rejection; two-document
adapter fanout. Controlled navigation pauses after the actual browser snapshot
and before raw API invocation. Replacement DOM remains untouched. No artificial
pause inside native file loading was used; the post-load check is source-audited.
Six logger/noscript/picker and four native/upstream completion schedules also pass.
Seven corrupted-evidence variants reject. Three verifiers pass again using only
extracted archived sources/reports. 276 regression tests and 130 module plus two
wrapper lint checks pass. The initial nonunique preparation anchor and missing
harness globals lint failure are retained with corrected passes.

One guarded incremental build: 317.03 s wrapper, 312.06 s Siso, 1,017 executed
steps. Initial plan 208 actions expanded after schema generation; existing output,
GN args and toolchain retained. Final check zero actions (3.91 s). Footprint
35 upstream files / 79 hunks, within 40 / 120. No cold build. This is routine
tranche build effort, not Task 0's clean-build column.

Remaining: navigation after browser validation/before renderer execution still
needs a renderer document-token guard; queued runAt scheduling, BFCache/prerender,
crash/lifecycle and asynchronous effects remain open. No full exact-delivery or
all-path atomicity claim. Logger UI and arbitrary scriptlet/cosmetic coverage are
unchanged gaps. Latency (including snapshot overhead) stays deferred. Electron
diagnostic build §8 unchecked/unstarted. Spikes A/B in progress; items 3–6 not
started. No baseline promotion. Disposable profiles and fixture keys removed.
Evidence: `evidence/f12-document-target-20261018/`.

## Renderer document-token guard — October 18, 2026

Browser validation now resolves the actual Blink DocumentToken only from a live,
active, non-error committed document after verifying the API document ID in the
executor's own tab. An optional immutable token travels in ExecuteCodeParams.
The renderer checks WebDocument.Token() when the injection becomes eligible and,
for the experimental uBO component, immediately before execution after delayed
permission replies. Other extensions retain their permission-reply path. The
new content helper avoids exposing RFHImpl through the extensions layer.

Eight bounded offline cases pass: three deliberate transport-token mismatches
(document_start/end/idle), each with a matching-token positive control; a legacy
unconstrained control; a genuinely deferred document_end release; and same-URL,
cross-path and cross-origin replacements while document_end work is queued.
Replacement markers remain untouched. Navigation callbacks return [null], which
is recorded as teardown behavior, not evidence that the old document never
began executing. Two failed harness attempts expected an error/empty array;
they are retained, not counted as passes. The final validator requires actual
replacement identity and untouched DOM as well as the non-positive callback.

The mismatch switch is opt-in, exact-component and exact-source-marker gated,
and only corrupts an already-present token. It cannot bypass the guard. These
three denials are diagnostic fault injection, not an observation of a naturally
occurring IPC race. The permission-reply recheck is source-audited, not exercised
through a native permission dialog. BFCache/prerender, crashes, original caller
identity before the browser snapshot and asynchronous scriptlet effects remain
unqualified. No all-path atomicity or full acceptance claim.

281 focused regression tests and 135 module lint checks pass. Two incremental
builds: 162.37 s wrapper / 158.51 s Siso / 251 steps, then 34.30 s wrapper /
29.69 s Siso / six steps to narrow the permission recheck to this component.
The initial 89-action plan expanded/pruned after Mojo generation; both retained
the existing cache. GN regeneration followed the added header's BUILD.gn edit,
with unchanged arguments/toolchain. Final guard zero actions (4.26 s).
Footprint: **40 upstream files / 91 hunks**, at the file ceiling of 40 / 120.
The five added existing paths are content public BUILD.gn, RFHImpl.cc, frame.mojom,
programmatic_script_injector.cc and script_injection.cc; the new Blanc header is
separately inventoried. Any further upstream-file addition needs consolidation
within the budget or a new owner decision. No cold output.

Latency stays deferred, including token-check overhead. Electron diagnostic build
§8 remains unchecked/unstarted. Spikes A/B in progress, items 3–6 not started;
Task 0 upgrade gate and baseline promotion unchanged. Evidence and failed attempts:
`evidence/f12-renderer-target-20261018/`.

Final binary regressions also pass: eleven browser document-target checks, six
logger/noscript/picker checks and four native/upstream completion schedules. Each
report has an independent verifier. Repeated preparation leaves all 40 existing
upstream files and the new Blanc header byte-identical.

Archive verification: 108 members (338,786 compressed bytes), hashes checked; all
four report proofs pass using extracted archived sources and reports.

## BFCache, prerender and renderer crash coverage — October 18, 2026

This checkpoint changes only disposable offline harnesses. The native renderer
document-token guard and binary are unchanged. Lifecycle06 proves a real BFCache
restore (persisted pageshow, same document ID and page-instance nonce, preserved
marker), rejection while that document is cached, and successful exact targeting
after restore. A queued document_end injection is pending before an actual
renderer crash; its callback fails. Browser API recovery creates a different
document, whose marker remains untouched; the stale ID is refused and the new
ID succeeds. These are bounded regular main-frame cases, not all lifecycle or
asynchronous-side-effect acceptance.

The lifecycle probe removes Playwright's default BFCache-disable switch only for
this test. Pinned uBO disables preloading by default; the first prerender attempt
observed PreloadingDisabled. Later conditional probes enable browser prediction
only in disposable profiles and record both settings. Playwright-attached probes
do not prove prerender activation; ordinary navigation is explicitly a gap.

Earlier attempts are retained: DOMContentLoaded was an invalid restore wait;
Playwright commands failed after an intentional crash; direct frame debugging
suppressed prerender; and an isolated-world recovery observer incorrectly read a
main-world variable. Lifecycle06 reads authored DOM data and passes the two scoped
cells. These harness failures are not counted as product passes. Raw-launch attempt
01 also failed because the component manifest argument lacked the established
ASCII escaping; its fatal startup and cleanup are retained.

287 tests pass; final guard zero actions, no compile. Measured footprint remains
40 upstream files / 91 hunks (40-file ceiling). Latency remains deferred and the
Electron instrumentation build remains unapproved/unstarted. Original caller
identity, subframe/multi-document lifecycle, permission replies, and asynchronous
scriptlet effects remain gaps; no full acceptance or baseline promotion.

The raw background-only probe also reached configured preloading but observed no
prerender target within its 15-second bound. Its cause is unresolved; this result
cannot be attributed solely to Playwright and is not a prerender acceptance pass.
Raw attempts 02/03 lost their popup observer during startup; attempt04 uses the
surviving background only. All four failed raw attempts are archived and cleaned.
139 module lint checks pass. Binary hashes and the ordinary component inventory
match the prior renderer-token checkpoint. Guard duration 3.65 s; fresh budget
scan 45.76 s. These are test/tooling costs, not compilation or latency measurements.
Evidence: `evidence/f12-lifecycle-20261018/`. Full network parity was not rerun.

Archive: 48 members, 52,881 compressed bytes; every hash checked and the
independent lifecycle proof passes from extracted sources/reports. All attempt
reports record cleanup. Historical failed raw source versions are not fully
snapshotted; final sources and the through-attempt05 lifecycle source are saved.

## Prerender cancellation and lifecycle lease recovery — October 18, 2026 (EDT)

Prerender investigation exposed a synchronous-binder hazard. DocumentStart made
synchronous GetScript/Complete calls while its unlisted non-associated binder
inherited Chromium's prerender deferral. Chromium's own policy implementation
warns of this deadlock pattern. The raw control fetched the speculative document
but produced no target; enabling discovery and attempting renderer-initiated
navigation then timed out. Target absence alone is not proof of non-existence:
DevTools enumeration walks the primary frame tree.

The opt-in document-start experiment now sets only its own binder to kCancel.
No prerender capability is granted and no gate is bypassed. The policy lives in
Blanc-owned code with one call added to an already-patched browser-client file.
Prerender activation remains unsupported. The new runtime proves explicit
SpeculationRule Mojo-policy cancellation (enum11), normal-load activation values,
first-inline scriptlet protection, untouched DOM, stale-target refusal and a
successful exact-current-target control. This is protected fallback, not a
prerender activation pass or general containment acceptance.

Two broader lifecycle schedules pass on the rebuilt binary. A genuine queued
upstream document_end injection holds one delivery lease and an actual filter
reload. Removing its iframe or crashing the renderer settles the API, drains
the lease, and lets reload complete; the surviving/recovered main DOM is clean.
The diagnostic component exports references to the actual production modules;
it does not replace dispatch, acknowledgement or reload behavior. This does not
qualify crashes inside synchronous native execution, lost native acknowledgements,
background recreation, private uBO, asynchronous effects or original caller identity.

294 tests and 142 module lint checks pass. One guarded incremental build:
46.43 s wrapper / 40.92 s Siso / eight steps. The three-action initial plan expanded
and pruned generated dependencies; existing output/cache retained. Repeated
preparation and the final guard report zero actions (3.48 s). No GN arguments,
toolchain, cold output or 156/permanent profile changes. Fresh footprint:
**40 upstream files / 92 hunks**, one additional hunk and no additional file.
The file ceiling remains binding. Latency remains deferred, including binder and
gate overhead. Electron diagnostic build §8 remains unchecked/unstarted.
Spikes A/B remain in progress, items3–6 unstarted; no baseline promotion.

Failed raw controls and the first lease harness attempt are retained. The latter
assumed Playwright exposed component background pages; the corrected probe uses
a diagnostic module export through the existing popup. All test profiles and
private certificate keys are removed. Native binaries changed only through the
recorded incremental build; payload source/pin lineage remains explicit.
Evidence: `evidence/f12-prerender-recovery-20261018/`.

Final-binary regressions also pass: the bounded BFCache/crash targeting pair
and eight renderer-token/queued-navigation cases, with independent report proofs.
The lifecycle harness still correctly labels prerender activation as a gap.

## Native execution crash recovery — October 18, 2026 EDT

Evidence: [bounded crash and background recreation](evidence/f12-native-recovery-20261018/README.md).
A paused native ExecuteScript plus actual Page.crash exposed a retained weak
document lease; the browser now retires only absent or non-live-renderer
documents. The repaired schedule drains pending1→0, releases held reload and
verifies protected replacement DOM. Actual background-document reload produces
a new realm and ready engine, preserving authored blocking and first-inline
protection. Background-process crash/restart policy and async effects stay open.
One guarded incremental build: 35.07 s wrapper / 31.39 s Siso, six steps from
one planned action. Final guard0; fresh budget40files/92hunks, no new upstream
file. This is routine repair/testing, never Task0's cold-build column.
Latency deferred; Electron diagnostic build unapproved/unstarted. UI migration
to the recent Electron releases is the next owner-requested task, inventoried in
`ui-refresh-20261018.md`; no new UI parity is claimed by this checkpoint.

### Electron 1.38 UI preview — October 18, 2026 EDT

Routine owner-authorized UI migration, separate from Task 0 clean-build figures.
Three guarded incremental builds: 40.03s, 39.40s, 45.06s wrapper (six Siso steps
each). The last repairs a previously skipped 157 native header reservation,
identified from the owner's overlap report. Viewport delta verifies exactly68px
reserved; 79 reviewed tests plus header regression pass. Evidence and precise
remaining UI gaps: `evidence/ui138-preview-20261018/README.md`. Owner attention
and agent time not measured. Latency deferred; Electron diagnostic build unapproved.
No cold output/toolchain/GN argument change or 156/permanent-profile modification.
Final footprint40files93hunks, within40/120; final plan0. Partial UI preview, not
full UI parity or Task0/Tranche2 acceptance.

## October 18 rail, Recently Closed, site mute and Store follow-up

Implemented native page-width reservation and hit testing for the reviewed vertical rail,
profile-local layout/width preferences, native TabRestoreService entries/restore/forget/clear,
and exact-host session-only site mute with independent private policies and per-tab unmute.
No new upstream path: 40 files / 94 hunks. Native rail switching, page click-through,
keyboard width change, menu site mute and Recently Closed row restore were exercised.
Bridge tests cover new/existing same-host tabs, host transitions, private isolation,
restore/forget and native viewport resize. Restart preserved rail width and closed entries,
cleared site mute, and showed an empty error status. Forget All passes on the final binary.

The owner-requested Chrome Web Store promotion rule is exact-origin and download-campaign
scoped, runs in Chromium's internal isolated world, and hides only the promotional container.
Normal Google installation of Extensity 1.14.0 passed through the native permission sheet
and success bubble; persistence and native removal passed. Test profile removed; original
preview New Tab and Store tabs restored. This is not a UA spoof or permission bypass.

Evidence: `evidence/ui138-rail-store-20261018/` (31 hashed archive members).
Four focused tests and scoped lint pass. Incremental successful wrapper times:
39.57, 57.36 and 41.97 seconds; failed 14.66/35.98-second attempts retained. Final guard zero.
Remaining: full matched visuals, broader rail drag/group/window restoration qualification,
and reconciliation of Chromium's profile-wide Recently Closed list with Electron's window-local
semantics. Glance/Spaces remain unported. The promotion may briefly paint before load callbacks;
its empty wrapper remains labelled in AX, and the separate inline Chrome-install banner is
outside the popover rule. Latency stays deferred; Electron diagnostic build remains unapproved.
Task 0 promotion/upgrade gate and F12 acceptance gaps are unchanged.

## October 18 rail/restore and visual acceptance follow-up

Native drag/keyboard, tab/group/window restoration and private isolation now have bounded
acceptance evidence. Fixed opaque rail renderer paint, redundant rail header offset, loose-tab
end-of-strip movement and insertion before a group's first tab; interior/pinned targets stay
rejected. Matched 1280x800 rail/panel geometry and private color pass; Billboard's 68px header
reservation matches. Component screenshots are not complete composed visual parity: content,
pill controls, Start Page features, narrow/DPI/palette/find and wider lifecycle cases remain gaps.
Evidence: `evidence/ui138-acceptance-20261018/` (hashed archive, failed attempts retained).
79 renderer tests, three promotion tests and scoped lint pass. Two incremental builds 44.17s
and 43.66s; final guard zero. Budget unchanged at 40 files / 94 hunks; no increase needed.
Disposable profiles removed; original two preview tabs restored. Recently Closed remains
profile-wide; Spaces/Glance unported. Plan item 4 started, incomplete; items 3/5/6 unchanged.
Latency deferred, Electron diagnostic build unapproved/unstarted; F12/Task0 gates unchanged.

## October 18 narrow/palette/find diagnostic checkpoint

Native command entry now selects palette mode, full-window scrim/hit region and copied
repeat-command selection behavior; click/typing/new-tab entries remain panel mode. Five
actual Chromium sizes, 1280x700 through 500x400 pass bounded palette geometry/typed-selection
checks. Crowded 500x400 panel/list/footer and rail scrolling pass. Electron reference uses
renderer viewport emulation and diagnostic palette CSS, not native window/keyboard input.
Electron actual find API returns 1/1 fixture match at five sizes; Chromium Blanc find capsule
and bridge remain unported (/find filtered out), native Find not tested while locked.
Native Cmd-L/Escape/outside-click acceptance awaits unlock; no physical checks claimed.
At <=800px native controls require Chromium panel y48 vs Electron y12; full composed/DPI/
private parity remains open. Evidence: `evidence/ui138-narrow-palette-20261018/`.
One 37.69s incremental build, six steps; final guard zero; 40 files / 94 hunks unchanged. Four regressions
and focused host lint pass. Disposable fixtures removed, original preview two tabs restored.
Plan item4 in progress; previous F12/Task0 gates unchanged. Latency deferred; Electron
diagnostic build unapproved/unstarted. Find migration and unlocked input are next gaps.

## October 18 find-capsule checkpoint

The copied Electron 1.38 find capsule now uses Chromium WebContents Find/StopFinding and
window-local result events. Native Find and Find Next/Previous route through the capsule;
/find is restored. Stale request IDs, inactive/foreign tabs and navigation resets are guarded.
The query limit is 4096 UTF-8 bytes; case-insensitive search uses Chromium's engine.

Automated final-binary checks match installed Electron 1.38 on four matches including a
same-origin iframe, next/previous/wrap, Unicode and zero results. Rapid query replacement,
cross-document reset, tab switch/closure, same-document preservation, private isolation,
foreign/inactive rejection, slash listing and empty host status pass. Command helper calls
exercise the Cmd-G destination, not physical shortcuts. Capsule bounds pass at actual native
1280/800/500px widths. Component screenshots are not full composed visual parity.

Two incremental builds: 62.04s and 60.37s wrapper (58.06s and 55.07s Siso), 15 steps each.
Final guard zero actions; footprint 40 upstream files / 96 hunks, within 40/120. Four focused
regressions, syntax and focused host lint pass. No cold build, GN/toolchain change or latency run.

Failed harness attempts retained: private context requested on page endpoint instead of browser
endpoint; immediate post-restart connection before browser readiness; Node 20 invocation without
experimental WebSocket support. Final matrix and commands pass. Diagnostic background flags
were used only in disposable instances because the Mac is locked. Profiles removed and fixture
server stopped; original preview New Tab and Store restored on final binary with empty status.

Native Cmd-F/Cmd-G/Enter/Shift-Enter/Escape/button clicks, focus/passthrough, IME, VoiceOver,
DPI/full composed visual comparisons, PDF/cross-origin frames and crash/BFCache remain untested.
Native input stays pending unlock. Plan visual item 4 remains incomplete; prior F12/Task0 gates
unchanged. Latency deferred; Electron diagnostic build remains unapproved/unstarted.

Evidence: `evidence/ui138-find-20261018/`. Build times are routine incremental work, not Task 0 cold-build cost.

## October 18 expanded find and visual checkpoint

An actual crash of the exact active disposable tab left its find capsule visible. The native
owner now retires the request ID and query/count state and resets the capsule when the primary
renderer exits, without sending StopFinding to a dead renderer. The before-fix regression fails;
the final binary closes the capsule and searches successfully after navigation reload. This is
bounded regular-tab recovery, not every crash/BFCache/private lifecycle combination.

Eight queries agree with installed Electron 1.38: cross-origin iframe (different local port),
open shadow DOM, hidden text exclusion, input/textarea text, Japanese, accented text and no match.
Six component style comparisons (1280/500px, light/dark/private diagnostic theme attributes)
match rendered dimensions, colors, borders, radii, fonts and shadows for the six capsule controls.
Empty, no-match and 300-character no-match states agree on count and outer bounds. Input client/
scroll metrics differ between Chromium152 and157 (24px client difference); recorded, not hidden
or presented as full pixel equivalence. Native CSS sizing and Electron viewport emulation are
explicitly distinct. Matching-DPR clipped component captures supplement the numeric checks;
these are diagnostic theme renders, not physical private-window/input or whole-window parity.

One guarded incremental build: 41.02s wrapper /37.23s Siso, six steps from a one-action plan.
Final guard zero; budget unchanged40 upstream files /96 hunks. Four focused tests pass. No cold
output, GN/toolchain change, latency test, or Electron diagnostic build. Binary hashes recorded.
Failed window-target harness attempt and overstrict client-metric comparison retained. The
first broad crash probe did not establish exact active-target identity; only crash-before/after
with unique URLs qualify that regression. CDP crash and dead-runtime timeouts are recorded.

Disposable profiles and fixture servers removed; original two preview tabs preserved and
reopened on the final binary. Native input stays pending unlock. PDF, BFCache/back-forward,
private crash, IME, VoiceOver, physical display-scale, hover/focus and complete composed visual
parity remain gaps. Plan visual item4 remains incomplete; prior F12/Task0 gates unchanged.
Latency deferred; Electron diagnostic build remains unapproved/unstarted.

Evidence: `evidence/ui138-find-expanded-20261018/`. Build time is routine incremental work, not Task0 cold cost.

## October 18 BFCache/private find checkpoint

Regular A→B→back A→forward B restores the same document instance markers and records
pageshow.persisted=true in both documents. Find closes at each cross-document transition,
then finds the expected two/three matches after each actual BFCache restore. Private A→B→back A
also restores the same document with persisted pageshow and successful find. No forced BFCache
flags, Playwright browser defaults or assumed reload-as-cache pass were used.

A fresh private window exposed a theme gap: direct-open Find skipped the copied panel renderer's
private-theme application. The prototype host now applies or clears that scope from its active
native tab snapshot before opening Find. This is an assets-only integration fix; copied Electron
source is unchanged. The first failing theme assertion is retained, not counted as a pass.

Private search, cross-window and inactive-tab rejection, tab-switch/navigation resets, reopen,
BFCache restore and exact active private renderer crash/reload pass. Regular listeners receive
no private search results; private Recently Closed stays empty. Disposing the private context
removes its targets, regular find still works and the regular theme remains non-private. Crash
transport/dead-runtime timeouts are retained. This tests one bounded private context, not every
multi-window/subframe/process-sharing schedule or durable profile-forensics guarantee.

No native compilation. Assets-only prepare 0.05s; final guard zero actions (3.39s); native binary
hashes identical to the prior expanded-find checkpoint. Native patch footprint remains 40 files /
96 hunks because no native/preparation source changed. Four focused regressions, host syntax and
focused lint pass. Disposable profile/server removed; original preview's two tabs restored.

Native input remains pending unlock. PDF, IME/VoiceOver, physical focus/hover/display-scale,
BFCache eviction/ineligible pages, private forward restoration, private subframe crashes and full
composed visual parity remain gaps. No Electron comparison is claimed for these lifecycle runs;
installed Electron was not launched. Visual plan item4 remains incomplete. Latency deferred;
Electron diagnostic build unapproved/unstarted; prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-lifecycle-20261018/`. No change to the Task0 cold-build column.

## October 19 PDF and private lifecycle find checkpoint

An authored two-page text PDF contains three occurrences of needle. Chromium's real PDF viewer
loads it and native Find reports all three matches in regular and private windows. Regular next/
previous returns 1→2→1; no-match returns zero in both windows. PDF→HTML navigation resets the
capsule and HTML search succeeds. Private theme and cross-window rejection pass; private search
produces no regular-window result events. PDF fixture pages and the actual viewer capture were
visually inspected. This is a simple selectable-text PDF, not OCR, encrypted or form-document coverage.

Private A→B→back A→forward B preserves each document instance and reports persisted pageshow;
find resets at transitions and returns the expected three matches after forward restoration.
Removing a cross-origin iframe during an open find session leaves zero child matches on a fresh
query while parent text remains searchable. Closing the active searched tab resets the capsule;
private Recently Closed remains empty. Context disposal removes its targets and regular host
status remains empty. These are real bridge/engine checks, not physical key or pointer events.

No production code changes, preparation or compilation were needed. Build guard zero actions
(5.38s); native hashes unchanged from the expanded-find checkpoint, footprint remains 40 files /
96 hunks. Focused host lint passes. No repeat unit suite is claimed for this evidence-only change.
Disposable profile/server removed; original two preview tabs restored. Initial Poppler rendering
emitted Fontconfig configuration/cache warnings; a fixture-local config/cache rerender completed
and both pages were inspected. No system font configuration changed.

Remaining: PDF wrap/end-page selection, PDF reload/crash/plugin lifecycle, scanned/encrypted/forms,
cache eviction/ineligible pages, private subframe crashes/process sharing, IME/VoiceOver/physical
focus/display scale and full composed visual parity. No new Electron comparison was run. Native
input remains pending unlock; latency deferred; Electron diagnostic build unapproved/unstarted.
Visual plan item4 remains incomplete; previous F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-pdf-20261019/`. No change to Task0 cold-build costs.

## October 19 PDF reload/crash checkpoint

Regular and private selectable-text PDF find each return three matches before reload, after
Page.reload, after an actual outer-page renderer crash and recovery navigation, and after switching
away and reselecting the PDF tab. Reload/crash/tab transitions reset the capsule. The crashed target
rejects/times out a Runtime evaluation; crash command responses are retained. Private theme stays
private, closing the searched private PDF resets find, private Recently Closed remains empty and
private context disposal succeeds. Page.crash selected the PDF URL's outer page target: this does
not prove independent PDF plugin-process crash recovery. No physical keyboard/mouse acceptance.

No production changes or compilation. Guard zero actions (3.59s); native hashes match the prior
PDF checkpoint. Footprint remains 40 upstream files/96 hunks (not re-enumerated for evidence-only
work). Setup failures were a sandbox ps denial and immediate CDP-readiness race; both occurred
before test cases and are recorded in attempts.json. Final browser results are in results.json.
Disposable profile/server removed; existing preview tabs and empty host status verified without
relaunching the preview. No new Electron comparison, unit suite or PDF visual comparison claimed.

Remaining: independently selected PDF plugin failure, scanned/encrypted/forms and selection/wrap,
cache eviction/ineligible pages, private subframe crashes/process-sharing, IME/accessibility/full
visual parity. Native input pending unlock, latency deferred, Electron diagnostic build unapproved
and unstarted. Visual item4 and previous F12/Task0 gates remain incomplete/unchanged.

Evidence: `evidence/ui138-find-pdf-recovery-20261019/`. No Task0 cold-cost change.

## October 19 PDF-plugin/private subframe checkpoint

Regular and private tests separately select exactly one process with both the disposable profile
argument and --pdf-renderer, record its command line, kill that process, verify its exit, and prove
the outer PDF page retains its JavaScript marker. Reload resets Find and restores all three text
matches in both profiles. This closes the bounded independent PDF-renderer recovery case rather
than repeating the earlier outer-page crash. The find capsule remains open immediately after
plugin death in both profiles; fresh-query/no-reload behavior and crash-state UI handling remain
unqualified. The recovery pass does not imply that the capsule automatically clears on plugin exit.

A private cross-site iframe (localhost child inside 127.0.0.1 parent) is independently exposed as
an iframe CDP target. Page.crash times out as recorded; parent marker survives, parent search
returns one match and child search returns zero. Navigating the child again restores two matches;
removing it returns zero. Private theme, closed-tab empty Recently Closed and context disposal
pass. No broader process-sharing or simultaneous-frame failure claim is made.

Evidence-only, no production changes or compilation. Guard zero actions (4.14s); native hashes
match the previous PDF checkpoint. Footprint remains 40 upstream files/96 hunks (not re-enumerated).
Disposable profile/server removed; preview original tabs and empty status verified. No physical
input, Electron comparison or repeat unit suite claimed. The fixture is the previously authored
selectable-text PDF, unchanged; no new rendering/visual comparison is claimed.

Remaining: plugin crash-state capsule handling and no-reload queries, complex/scanned/encrypted/
form PDFs, concurrent renderer failures, cache eviction/ineligible pages, wider private frame
process-sharing, IME/accessibility/full visual parity. Native input pending unlock; latency deferred;
Electron diagnostic build unapproved/unstarted. Plan item4 and prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-plugin-20261019/`. No Task0 cold-cost change.

## October 19 PDF-plugin find reset fix

The active WebContents observer now retires its find session when a PDF renderer frame is deleted,
including independent plugin-process exit. The shared renderer-loss reset invalidates request ID,
query and cached counts, then closes the capsule; late find replies are ignored. Ordinary subframe
deletion does not take this path. Main-frame crash behavior uses the same reset helper.

Final native tests kill a uniquely identified disposable --pdf-renderer in regular and private
windows and prove the outer page's marker survives. The capsule now closes in both cases (prior
checkpoint recorded false). Reopening find WITHOUT reloading returns final zero matches for both
needle and a missing query, without hanging; this does not resurrect the crashed PDF or claim its
text remains searchable. Reload restores three matches. Private cross-site iframe crash, parent
search, missing child search, child recovery/removal, theme and closure regressions also pass.

One guarded incremental build: 38.53s wrapper /34.85s Siso, six steps, from a one-action plan.
Final guard zero (4.68s). Fresh footprint 40 upstream files/96 hunks, within 40/120. No new upstream
file, cold output, GN argument or toolchain change. Native binary hashes and invocation records
are archived. Disposable profile/server removed, original preview relaunched on the final binary
and original tabs/empty status verified. No new unit suite, Electron comparison or physical-input
claim; the actual native regression is the acceptance test.

Remaining: complex/scanned/encrypted/forms PDFs, multi-plugin/concurrent failures, broader cache/
private process-sharing/accessibility/full visual cases. Native input pending unlock; latency
explicitly deferred; Electron diagnostic build unapproved/unstarted. Plan item4 and earlier
F12/Task0 gates remain incomplete/unchanged. Build time is routine, not Task0 cold cost.

Evidence: `evidence/ui138-find-plugin-fix-20261019/`. No Task0 cold-cost change.

## October 19 complex PDF/concurrent crash checkpoint

An authored four-page PDF adds two-column text, 90-degree rotated text, an image-only page and
an interactive AcroForm field. Structure checks confirm four pages, field value and widget; all
four Poppler page renders were visually inspected. Regular/private native Find each returns two
column matches, one rotated match and one form-label match. The actual form-field value and
image-only text both return final zero matches in both profiles: these are observed limitations,
not OCR or full form-content acceptance. No password-protected PDF check is claimed.

With regular and private PDFs open together, exactly two owned --pdf-renderer processes are
selected from the isolated profile and SIGKILL is sent in one host-clock-millisecond batch. Both
processes exit; both outer-page markers survive; each capsule closes. Reopened no-reload search
completes with zero matches, and reload independently restores two column/one rotated matches.
The kill calls share a batch, not a claim of simultaneous OS scheduling or exhaustive concurrent
crash coverage. Private context disposal succeeds. No main-plus-plugin or browser/GPU failure.

No production changes or compilation; guard zero actions (3.53s), binary hashes match the PDF
reset fix. Footprint remains40 files/96 hunks (not re-enumerated for evidence-only work). Disposable
profile/server removed; preview original tabs/empty status verified without restart. No new unit
suite, Electron comparison, physical input or performance claim. The source PDF, structural checks,
rendered pages, runtime observations and harness are archived.

Remaining: encrypted/password documents, XFA and form edits, OCR, embedded fonts/large PDFs,
main-plus-plugin and wider concurrent failure schedules, cache/process sharing/accessibility/full
visual coverage. Native input pending unlock; latency deferred; Electron diagnostic build remains
unapproved/unstarted. Plan item4 and previous F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-complex-20261019/`. No Task0 cold-cost change.

## October 19 protected/large PDF checkpoint

A two-page AES-256 PDF uses an explicitly nonsecret fixture password. Structural checks verify
wrong-password rejection and successful decryption. The actual Chromium viewer password dialog
is observed in its extension target: regular/private runs submit a wrong password through the
real dialog control and observe invalid=true, then submit the correct fixture password and find
two secretprobe matches. A find request before unlock reports no positive matches in its observed
window; this is not an exhaustive security audit or a physical password-entry check.

The authored larger PDF is 250 pages and 15,199,513 bytes, including one high-entropy image and
text on every page. Both profiles return251 substring matches for pageprobe (one per page plus
lastpageprobe), one unique last-page match, zero for absentprobe, and one last-page match after
reload. This is bounded functional acceptance, not throughput/latency/memory qualification.
Protected page1 and large page250 were rendered and visually inspected; not all250 pages.

No production changes or compilation. Guard zero actions3.97s; native hashes match the PDF reset
fix. Footprint remains40files/96hunks (not re-enumerated for evidence-only work). Fixture profiles/
server removed; original preview tabs and empty status preserved. PDF bytes, generators, structure,
sampled renders, runtime results and harness are archived; fixture password is public test data.

Remaining: password persistence/re-prompt after restart, permissions-only encryption/other crypto,
XFA/form edits/OCR, embedded fonts/malformed/extreme PDFs, wider concurrent/lifecycle/cache/
accessibility/fullvisual coverage. No Electron comparison or physical input claim. Native input
pending unlock; latency deferred; Electron diagnostic build unapproved/unstarted. Plan item4 and
prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-password-20261019/`. No Task0 cold-cost change.

## October 19 PDF password lifecycle checkpoint

Eight actual viewer-dialog observations pass across regular/private windows: initial open,
Page.reload, closing/reopening the same URL, and reopening the same URL after a full browser
restart using the same disposable profile. Every checkpoint presents a visible password dialog
with an empty input. Pre-unlock search observations contain no positive result; correct re-entry
restores two matches. The fixture is unchanged AES-256 with a public, nonsecret test password.

The first browser exits with a private PDF open. Its PID is confirmed absent before relaunch;
the second browser has a different PID and uses the same profile directory. Startup targets
contain only New Tab and host, no prior private PDF. The post-restart regular/private URLs are
opened explicitly: this does not qualify automatic session restore, crash restore or Recently
Closed restoration. These observations establish re-prompt behavior for the tested paths, not
proof that no password bytes ever reach memory/disk or a general persistence/security audit.

No production changes or compilation. Guard zero5.64s; hashes match the PDF reset binary;
footprint remains40files/96hunks (not re-enumerated). No latency run, unit-suite repeat, Electron
comparison or physical input claim. Disposable profile/server deleted; preview original tabs
and empty host status preserved. Before/after results, PIDs, fixture and harness archived.

Remaining: automatic session/crash/RecentlyClosed restore, password-manager integration,
permissions-only encryption/other algorithms, XFA/OCR/form edits, extreme PDFs and wider
lifecycle/accessibility/fullvisual coverage. Native input pending unlock; latency deferred;
Electron diagnostic build unapproved/unstarted. Plan item4 and prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-password-life-20261019/`. No Task0 cold-cost change.

## October 19 PDF session/crash-restore checkpoint — blocked on startup crash

Normal saved-session restoration PASSES using --restore-last-session in the same disposable
profile. The regular protected PDF URL is present without a createTarget/navigation call, prompts
with an empty password field, exposes no positive pre-unlock result during the observation, and
returns two matches after re-entry. A private PDF open at shutdown is absent from restored targets.
The regular/private seed checks and a new private PDF opened after normal restoration also pass.
This is actual session restoration, not the earlier explicit URL reopen test; no native button input.

Crash restoration FAILS before password checks. After unlocking regular/private PDFs and allowing
session saving, the exact owned browser PID is SIGKILLed. All owned browser processes are checked
gone before the same profile is relaunched with --restore-last-session. Startup terminates at
app_menu_button.cc:61 CHECK(element), through AppMenuButton::GetAnchor and
SessionCrashedBubbleView::ShowBubble. The hidden Island-only app menu selects its fallback anchor,
which is unavailable at this point. The fatal stack is archived. The first CDP fetch failure was
initially suspected to be readiness; a second failed read plus the fatal log disproved that. Neither
is a successful crash-restore test. No recovery dialog was suppressed and no pass claimed.

No repair or production change in this checkpoint. A direct edit of the failing app-menu file would
add an upstream file beyond the current40-file inventory; a repair within existing patches or an
explicit budget revision is still required. No compile; guard zero3.59s, binary hashes unchanged,
footprint40files/96hunks not re-enumerated. Disposable profile/server removed; preview preserved.
Crash-restore password behavior remains blocked; normal session restore is separately qualified.

Native input pending unlock, latency deferred, Electron diagnostic build unapproved/unstarted.
Other restore paths, encryption formats, broader PDF/lifecycle/accessibility/fullvisual remain
open. Plan item4 and prior F12/Task0 gates unchanged. This is a failed acceptance checkpoint,
not evidence that Chromium's generic recovery behavior is safe in the Island-only prototype.

Evidence: `evidence/ui138-find-session-20261019/`. No Task0 cold-cost change.

## October 19 crash-recovery anchor repair

The existing BrowserView toolbar-provider integration now delegates through a Blanc-owned
adapter. App-menu bubbles receive the Island View anchor; other toolbar/menu operations
forward to Chromium. The recovery bubble is preserved, not suppressed. No new upstream
file: inventory is 40 files / 97 hunks (one additional BrowserView hunk; below 120).
The first implementation compiled but exposed a shutdown dangling toolbar pointer because
ToolbarView dies before the Island owner. A ViewObserver now clears that pointer at deletion.
The failed attempt and diagnostic are retained; final normal shutdown has no fatal/dangling report.

Two guarded incremental builds: 62.76 seconds (15 executed steps), then 38.61 seconds
(six steps) for the lifetime repair. Final guard: zero actions in 4.06 seconds. No cold
output, toolchain, GN-argument or latency changes. The inventory was measured before the
Blanc-owned lifetime repair, which adds no upstream file/hunk; final source patch is archived.

Actual normal same-profile session restoration passes: regular protected PDF restored without
manual navigation, empty password re-prompt, no observed positive pre-unlock result, two matches
after re-entry, private PDF excluded. The owned browser was then SIGKILLed and relaunched.
It survives, and Session.SessionCrashed.Bubble records SHOWN=1, ERROR=0. The harness initially
expected automatic crash restoration; that assertion correctly failed because the real recovery
bubble waits for user choice. Mac locked, so its native Restore button and visual placement
remain NOT RUN. No automatic crash-restore/password pass is claimed.

Separately, the existing Recently Closed bridge restores the saved window after the crash:
regular PDF password field is empty, re-entry yields two matches, private URL absent. This
is saved-entry restoration, not acceptance of the recovery bubble button. Harness readiness
failures and the corrected asynchronous helper are recorded in outcome.json. Disposable profile
and server removed; original preview New Tab/Web Store tabs restored on final binary with empty
status. Native input pending unlock; latency deferred; Electron diagnostic build unapproved.
Broader recovery/UI/accessibility and prior F12/Task0 gates remain open. Plan item4 incomplete.

Evidence: `evidence/ui138-crash-anchor-20261019/`. Routine incremental cost only; Task0 cold column unchanged.

## October 19 repeated recovery/lifecycle checks

Two same-profile crash/recovery rounds survive with Chromium's recovery-bubble SHOWN histogram.
Saved windows restored through the existing Recently Closed bridge contain the regular protected
PDF and exclude the private PDF. Both rounds re-prompt with an empty password field and return
two matches after re-entry; no positive pre-unlock matches were observed. These are bridge tests,
not activation of the native recovery button. Owned PID/command and persisted Crashed marker
are checked before subsequent kills. A third crash relaunch also shows the bubble successfully.

Closing the browser while the recovery decision is unresolved and restarting offers the bubble
again. The original assertion expecting no bubble failed and is retained as a harness assumption;
no dismiss/Restore choice was exercised. Three private PDF context creation/disposal cycles pass
without removing existing regular targets. Final orderly shutdown logs no fatal/dangling pointer.
Normal session restoration also passes again. An initial SIGKILL run automatically restored the
PDF and re-prompted, but its prior disk exit marker was not captured: suspected persistence timing
is not proven. Histogram/CDP readiness failures remain in invocation records; subsequent probes
poll readiness explicitly. No general crash policy or password-storage security claim.

Evidence-only: no production changes or compilation. Guard zero actions in5.61s; native hashes
unchanged. Footprint remains40files/97hunks, not re-enumerated. Disposable profile/server removed;
original preview New Tab/Web Store tabs preserved with empty status. Native recovery buttons,
focus/visual placement and physical input remain pending unlock. Latency deferred; Electron
diagnostic build unapproved/unstarted. Wider lifecycle/corrupt-session/OS restart behavior and
prior F12/Task0 gates remain open; plan item4 incomplete.

Evidence: `evidence/ui138-recovery-repeat-20261019/`. No cold-build cost change.

## October 19 corrupt-session checks

Seven bounded cases ran in offline copies of disposable regular/private PDF session seeds.
Mutations were made only after owned browser processes exited: invalid first eight bytes,
half-file truncation (retaining header), or deletion of Session_* files. Before/after sizes and
SHA-256 values are recorded. Intact control restores the regular PDF; private PDF never restores.
The first matrix damages only Default/Sessions while Sessions_Encrypted remains intact;
restoration there does not establish recovery from loss of both stores. A fresh seed supplies
three cases damaging both stores. Tabs_* and other profile data remain untouched.

| Case | Original regular PDF restored | New page/search and next clean restore |
| --- | --- | --- |
| intact | True | pass |
| invalid-header | True | pass |
| truncated | True | pass |
| missing | True | pass |
| both-invalid-header | False | pass |
| both-truncated | False | pass |
| both-missing | False | pass |

A fallback to New Tab is startup resilience with original-session data loss, not successful
restoration. Every case accepts a new authored page, native Find returns one match, and that
new page restores and searches on the next clean launch. No private URL appears. No fatal or
dangling-pointer diagnostic appears across the run. These are CDP/bridge checks; no recovery
button, filesystem permission failure, partial-write concurrency, Tabs_* corruption, encrypted
key loss, OS reboot or general profile-corruption resilience is claimed.

Evidence-only: no production changes or compilation; guard zero3.62s, binary hashes unchanged,
40files/97hunks not re-enumerated. Disposable profile copies/server removed, original preview
preserved. Native input pending unlock, latency deferred, Electron diagnostic build unapproved.
Plan item4 and broader F12/Task0 gates remain open; no cold-build column change.

Evidence: `evidence/ui138-corrupt-session-20261019/`.

## October 19 Recently Closed corruption and torn-record checks

Five isolated cases mutate Tabs_* in both plaintext and encrypted session stores, with the
owned browser stopped: intact control, invalid eight-byte header, final-byte removal,
half-file truncation, and missing files. Original sizes and hashes and changed sizes/hashes
are recorded. Session_* files are not mutated. Truncation models a partial write; no live
write interruption, concurrent writer, fsync/durability, disk-full or power-loss claim.

| Case | Original closed fixture entries visible | Fresh entry persists and reopens |
| --- | --- | --- |
| intact | 1 | pass |
| invalid-header | 0 | pass |
| tail-cut | 0 | pass |
| mid-cut | 0 | pass |
| missing | 0 | pass |

The intact control establishes saved Recently Closed data. Loss of old entries after corruption
is recorded as data loss, not recovered history. In every case the browser remains usable;
clear/new-tab/close creates a fresh native entry, a clean restart preserves it, and reopening
through the native bridge yields the expected URL. The seed private-tab control does not
appear in exposed closed entries. No fatal or dangling-pointer diagnostic across the run.
This does not prove absence of private data from every underlying byte or hidden window entry.

No production changes or compilation: guard zero4.26s, native hashes unchanged; footprint
40files/97hunks not re-enumerated. Disposable profile/copies/server removed and preview original
tabs preserved. Native input pending unlock, latency deferred, Electron diagnostic build
unapproved/unstarted. Larger history/group/window entries, invalid command lengths, disk errors,
concurrent writes and native recovery choices remain gaps. Plan item4 and F12/Task0 gates open.

Evidence: `evidence/ui138-closed-corrupt-20261019/`. Cold-build costs unchanged.

## October 19 live persistence crash and group/window restoration

Two-tab named group closes into one entry and reopens with both URLs, group name and membership
preserved. Moving that group into its own window, orderly browser shutdown, normal launch and
Recently Closed window restoration also preserves both URLs and group membership. Native bridge
calls only; no physical menu/button acceptance or arbitrary group/window combinations claimed.

One live run SIGKILLs the exact owned browser PID when fs.watch reports Tabs_* creation/rotation
during repeated tab closure. A second content-change-only attempt observes no qualifying event
after40 closures and its bounded wait; it does not kill the browser and is not an interruption pass. The event,
file size, acknowledged-close count and PID/command are recorded. No offline mutation is used.
Notifications can arrive after a completed write: this is live persistence-adjacent crash recovery,
NOT proof of an interrupted write syscall or a torn record. The actual mid-write/power-loss gate
remains open; prior offline truncation simulations remain separate.

| Trigger | Acknowledged closes at event | Live-close entries exposed after recovery |
| --- | --- | --- |
| rename | 7 | 7 |

The crashed browser and the non-triggering second run remain usable; new closed entries survive a subsequent clean restart
and reopen at the expected URL. No fatal/dangling diagnostics. These counts are exposed entries,
not proof of durable completion of every issued write. No general storage-integrity claim.

No production change/compile; guard zero3.74s and unchanged native hashes.40files/97hunks not
re-enumerated. Disposables removed, original preview preserved. Native input pending unlock,
latency deferred, Electron diagnostic build unapproved. Larger/mixed/private groups, group color
and collapsed-state parity, disk-full/permissions, true syscall interruption and OS restart remain
gaps. Plan item4 and earlier F12/Task0 gates remain open; cold-build column unchanged.

Evidence: `evidence/ui138-live-closed-20261019/`.

## October 19 group visual restoration checks

Two-tab blue/collapsed and pink/expanded groups were closed and reopened through the native
Recently Closed bridge. Then each was moved into a separate window, its expected collapsed
state explicitly set and recorded before shutdown, and the saved window restored after browser
restart. This separates group-entry behavior from the state saved for window restoration.

| Fixture | Restore path | Color retained | Collapsed state retained |
| --- | --- | --- | --- |
| blue-collapsed | group entry | True | False |
| blue-collapsed | saved window | True | True |
| pink-expanded | group entry | True | True |
| pink-expanded | saved window | True | True |

Closed-group restoration expands the blue group: collapsed state is NOT retained on that path.
Saved-window restoration retains it. Names, two URLs and group membership remain intact in all
four cases; blue/pink colors remain exact. The expanded control remains expanded. No repair or
Electron behavior comparison is claimed; whether group expansion is the desired product policy
remains open. Harness pass flags represent completion/structural checks, not all visual parity;
the separate groupVisual/windowVisual fields retain the failed collapsed-state comparison.

Initial named-color rejection and an overlapping shutdown/relaunch timeout are retained;
final runs use hex colors and wait for owned processes to exit. No fatal/dangling diagnostics.
No production change or compile; guard zero5.42s, native hashes unchanged;40files/97hunks not
re-enumerated. Disposable profiles/server removed; preview preserved. Native input pending,
latency deferred, Electron diagnostic build unapproved. All-color/mixed-group/private/crash
visual persistence and physical rendering remain gaps. Plan item4/F12/Task0 gates remain open.

Evidence: `evidence/ui138-group-visual-20261019/`. Cold-build costs unchanged.

## October 19 closed-group collapsed-state repair

The Recently Closed bridge captures a group entry's collapsed flag before restoration consumes
it, then reapplies the flag to the restored native group. Returned LiveTab session identities
identify the group; the saved-group UUID handles Chromium's saved-group path, which can reopen
a group without returning LiveTabs. The most-recent route now reports success for that path.
Only the collapsed flag is changed; current title/color are retained. Ordinary tab and window
entries are not given a group override. No additional upstream file or hunk is patched.

Final-binary automated native bridge checks pass all six group/window cases:
- Blue collapsed: selected Recently Closed group entry and saved window both retain collapse.
- Pink expanded control: group entry and saved window remain expanded.
- Green collapsed: reopen-most-recent returns true and retains collapse; saved window retains it.
Each case checks two URLs, membership, group name and exact color. Window checks explicitly
record the intended state before clean shutdown and normal restart, independently of group
restoration. These are bounded regular-profile tests, not physical mouse/keyboard acceptance.

The first LiveTabs-only repair compiled but failed collapse preservation. The next repair passed
selected-entry checks but the most-recent success return remained false; both failures are kept.
An owned-browser shutdown/start overlap was refused and retained; cleanup now waits for exit.
A sandboxed prepare failed at icon-tool access, then succeeded with approved tool access.
Three guarded incremental builds: 34.20s, 37.14s and 34.11s Siso; six steps each.
Final guard zero actions. Fresh patch inventory: 40 upstream files / 97 hunks (budget40/120).
No GN/toolchain/cache change, cold build, latency run or Electron diagnostic build.

Disposable profile/server removed; original preview tabs restored on the final binary, empty
host status. Native input remains pending unlock. Cross-window group-entry routing, all colors,
private/mixed-group/crash visual persistence and wider lifecycle remain unqualified. Earlier
F12/Task0 gates and plan item4 remain open. This supersedes the bounded collapsed-state failure
in evidence/ui138-group-visual-20261019, without rewriting that historical result.

Evidence: `evidence/ui138-group-collapse-fix-20261019/`. Routine repair only; cold column unchanged.

## October 19 cross-window group and crash persistence checks

Two regular-profile fixtures: blue/collapsed and pink/expanded, each with two URLs. A second
window contains a same-named decoy group. Closing the source group and restoring its entry
from the second window restores both tabs into the caller window with exact membership, name,
color and collapsed state; the decoy's native ID and visual fields remain unchanged.

Two owned-browser SIGKILLs per fixture then test separate persistence paths. The first happens
after closing the group and waiting six seconds; after normal restart the entry is restored
through Recently Closed. The second happens with the restored group moved to its own two-tab
window and its intended collapsed flag explicitly set/recorded before waiting six seconds.
After normal restart that saved window is restored through Recently Closed. Each kill verifies
the owned profile command and persisted Crashed marker. No OS power-loss, interrupted syscall,
automatic crash-restore or native recovery-button acceptance is claimed.

| Initial state | Cross-window group | Closed group after crash | Saved window after crash |
| --- | --- | --- | --- |
| Collapsed blue | pass | **FAIL: expanded** | pass |
| Expanded pink | pass | pass | pass |

The persisted closed-group failure is real, not treated as acceptance. The pinned upstream
`tab_restore_service_impl.cc` writer serializes title/color/saved identity/timestamp but no
collapsed bit; its reader explicitly constructs single closed groups with is_collapsed=false
(lines519-523). The bridge repair retains in-memory metadata but cannot recover an omitted
on-disk field. Whole-window restoration uses different metadata and retains collapse.
No production repair is included in this checkpoint. A compatible closed-group serialization
change is a follow-up; its upstream footprint must be audited before implementation.

The first cross-window assertion selected a group by duplicate name and failed despite the
correct restored state; corrected tests identify it by both tabs' native membership. That
harness failure and the strict persisted-collapse failure are retained. Final proof files use
completed=true for a finished observation and pass=false/outcome=collapsed-state-difference
for the known failure; a zero harness exit does not turn that case into a pass.

No native change or compile. Guard zero actions3.95s; binary hashes unchanged; footprint remains
40files/97hunks (not re-enumerated). Disposable profile/server removed; original preview tabs
and empty status preserved. Native input pending unlock, latency deferred, Electron diagnostic
build unapproved/unstarted. Private/multi-profile/multiple overlapping restores, unsaved groups,
mid-write/OS reboot and broader crash/visual paths remain unqualified. Plan item4 and earlier
F12/Task0 gates remain open.

Evidence: `evidence/ui138-group-cross-crash-20261019/`. Routine testing only; cold column unchanged.

## October 19 closed-group persistence repair

The pinned closed-group writer now appends the collapsed boolean after its existing timestamp.
The reader optionally reads that trailing field, initialized false for legacy records. The
existing record prefix/command ID is unchanged; old readers ignore the extra field. This
compatibility conclusion is source-backed, not a legacy-binary runtime acceptance claim.
Already-written old records have no recoverable collapse bit and still restore expanded.
The transform has exact anchors and independent presence markers for repeat preparation.

All six strict final-binary native bridge cases pass: collapsed blue and expanded pink,
each restored cross-window, from a persisted closed-group entry after SIGKILL, and as a
saved whole window after a second SIGKILL. Exact colors/names/two-tab membership survive;
the same-named decoy stays unchanged. Four kills verify the owned profile and Crashed marker,
with bounded six-second persistence waits. This repairs the previously archived failing
collapsed closed-group case. No native-button, power-loss or mid-write syscall claim.

One guarded incremental build:30.42s Siso/35.98s wrapper,six steps. Final guard0/6.00s.
Fresh footprint **41 upstream files / 100 hunks**, within the narrow October19 amendment
(41/120) applying the owner's earlier allowance to raise the40-file ceiling if needed.
Only new upstream path:components/sessions/core/tab_restore_service_impl.cc. No other budget,
scope, GN/toolchain/cache or acceptance relaxation. Future patch-consolidation audit remains.
Eleven patch-counter tests and two-module scoped ESLint pass; syntax and whitespace pass.
Initial npx ESLint attempt could not resolve the registry; existing local ESLint was used.

Disposable profile/server removed; final preview restarted with original two tabs/empty status.
Native input pending unlock, latency deferred, Electron diagnostic build unapproved/unstarted.
Legacy/malformed trailing field runtime, private/multi-profile/unsaved/multiple concurrent
restores, mid-write/OS reboot and broader lifecycle/visual cases remain gaps. EarlierF12/Task0
and planitem4 remain open. Cold-build column unchanged; this is routine repair/testing.

Evidence: `evidence/ui138-group-persistence-fix-20261019/`.

## October 19 legacy-record and private-group checks

A disposable regular profile first closes a collapsed blue two-tab group on the current
binary. With the browser stopped, the test removes the appended four-byte boolean from
kCommandCreateGroup(13), adjusting both outer command size and embedded Pickle length.
Only owned disposable encrypted Tabs counterparts are removed to force the plaintext fixture
path. The current binary reloads the legacy-shaped entry and restores both URLs, membership,
name and color, defaulting to expanded as required for an absent collapse bit. A false
collapsedMatches field records that intentional legacy fallback; expected expanded is asserted.
This is a synthetic old-format record test, NOT an older-binary or encrypted legacy migration
acceptance claim. Original and mutated file hashes/length metadata are retained, not profiles.
The first attempt omitted the Pickle length adjustment and was refused; that timeout and
malformed mutation record remain archived rather than being counted as compatibility evidence.

A fresh disposable profile verifies private groups have no Recently Closed history. Closing a
collapsed two-tab private group leaves a usable private window and no closed entry. Reopen-most-
recent returns false; a known regular group entry ID cannot be restored or forgotten through
the private bridge, and private clear returns false. The regular history stays identical before
and after those calls and private-context disposal; restoring its regular group still returns
both URLs. No private tabs appear in the regular window. Expected refusal is the private-mode
contract, not missing restoration functionality. No native mouse/keyboard checks performed.

No production changes/compile; guard0/5.24s, native binary hashes unchanged,41files/100hunks
(not re-enumerated). Test profile/server removed, original preview tabs/status preserved.
Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.
Older-binary/new-record rollback, encrypted legacy fixtures, malformed optional-field matrix,
multiple private contexts, private crash/restart leakage and wider lifecycle remain gaps.
EarlierF12/Task0 and visualitem4 gates remain open; routine testing only, cold column unchanged.

Evidence: `evidence/ui138-group-legacy-private-20261019/`.

## October 19 encrypted legacy and private crash checks

The current binary writes a closed-group fixture using its configured mock keychain. With the
owned browser stopped, the harness decrypts the encrypted command13 using Chromium's public
mock password/derivation, removes only the appended collapse flag, adjusts the Pickle length,
and re-encrypts the command and updates its outer length. All other ciphertext remains intact.
Plaintext Tabs counterparts are removed from that disposable profile so they cannot supply the
restored group. After restart the native encrypted reader restores both URLs, name, color and
membership and defaults to expanded, as required for the absent field. File hashes and record
sizes are saved. No real keychain access, profile/key upload, older-binary execution or real-key
migration is claimed. This is a synthetic encrypted legacy-shaped fixture.

A fresh disposable browser retains a regular closed group, closes one private group (history
stays empty), and leaves another two-tab private group live when the owned browser is SIGKILLed.
Before killing, the harness verifies its profile command and persisted Crashed marker. After
normal restart no private URL/group is present in exposed tabs or Recently Closed; the regular
closed group still restores both tabs. A newly created private context has no groups/history,
and reopen-most-recent returns false. Context disposal leaves regular restoration intact.
This covers exposed native session behavior, not forensic absence of private bytes on disk,
automatic crash-restore-button interaction, all incognito lifecycles or OS/power-loss recovery.

No production change or compile; zero-action guard, binary hashes unchanged;41files/100hunks
(not re-enumerated). Disposable profiles/server removed, original preview/status preserved.
Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.
Real-keychain/key rotation, older-binary rollback, malformed encrypted records, multiple private
contexts and wider concurrent/crash/visual scenarios remain gaps. Plan/evidence updated;
F12/Task0 and visualitem4 gates remain open. Routine testing only; cold column unchanged.

Evidence: `evidence/ui138-group-encrypted-private-crash-20261019/`.

## Store promotion wrapper repair — 2026-10-19

The exact campaign's empty dialog shell is now suppressed along with its content; mixed controls are excluded. Four unit tests and live 1600px Sign in hit-testing pass; navigation reaches Google Accounts without credentials. Official Extensity Add to Chrome remains enabled. Fresh native permission/install verification remains pending because CUA selects the retained older preview; closing it was rejected by automatic approval review to protect original tab state. No current native install pass is claimed. Original preview remains open on its previously loaded binary. Evidence: `evidence/ui138-store-promotion-wrapper-20261019/`. One guarded incremental build35.51s (six steps), finalguard0/5.86s; prior41files100hunks not re-enumerated, no new upstream paths. Latency deferred; Electron diagnostic build unapproved.

## Native Store promotion regression — 2026-10-19

Owner-approved restart preserved both original preview tabs. Native CUA checks on82572a12 pass: Extensity permission text and delayed Add button, Cancel without install, successful Add confirmation, and native removal confirmation/cleanup. Test tab closed; original New Tab and Store retained. Promotion wrapper now hidden with zero rectangle. Evidence: `evidence/ui138-store-native-20261019/`. Fresh native installation/permission gap from previous checkpoint closed; no authenticated sign-in, upgrade or post-install restart-persistence claim. No build/source changes; patch footprint unchanged. Latency deferred and Electron diagnostic build unapproved; other gates unchanged.

## Windows CI shutdown candidate — 2026-10-19

Final Windows/Linux helper teardown now destroys the internal capture helper after the last runtime window closes. Added a helper-close veto regression and bounded timeout diagnostics; no deadline relaxation. Historical CI cause unproven: logs only showed process alive after10s. 28 unit tests and scoped ESLint pass; local desktop attempts crash before assertion, so Windows CI remains required. Evidence: `evidence/windows-shutdown-20261019/`. Owner authorized fix on#920; shipping Electron main.js/test changed. No Chromium build/patch-budget change; latency deferred; Electron diagnostic build unapproved.

## October 19 site-mute lifecycle checkpoint

Ten bounded native bridge checks pass: enabling site mute; per-tab exemption; same-host navigation retaining exemption; different-host navigation clearing site policy; return to the muted host resetting exemption; renderer crash followed by navigation retaining site policy; two fresh private-context mute/disposal cycles each leaving regular policy intact. A new private context starts without the disposed context's mute policy. Tests use local authored HTTP pages and real Chromium WebContents state. `Page.crash` deliberately produces a renderer fatal in the archived log; the outer browser survives and the replacement page is checked. No audible-output, physical-input, cross-window mute or BFCache mute claim.

No source change or compile. Build guard reports zero actions. Footprint remains previously measured41files/100hunks (not re-enumerated). Disposable browser/profile and server removed; retained preview's original tabs verified unchanged. Evidence: `evidence/ui138-mute-lifecycle-20261019/` with hashed archive and readable results. Latency deferred; Electron diagnostic build remains unapproved. Spaces/Glance, wider visuals/native input and broader lifecycle gates remain open; UI migration is not complete.

Prior shutdown follow-up a574ec3d completed CI:27passes, two skipped (linux-native-diagnostics/installed-intel), no new CodeQL alerts. Windows shutdown and primary-close explicitly pass. This evidence checkpoint requires its own CI.

## October 19 Spaces/Glance foundation checkpoint

Migration remains incomplete; user-facing controls remain hidden. Added Island-only native split pair/close probes (not full Glance): reject unknown/self/pinned/grouped/already-split tabs; use native split views with62/38 ratio. Chromium sorts input indices, so a reordered reference initially occupied the larger pane. Corrected explicit ordering; final runtime main718px/reference436px, both visible; close restores full main width and preserves both tabs. Pin/self/unknown rejection passes. Focusing reference changes native active tab, confirming a contract gap: Blanc requires stable main identity and focused-pane command routing. No full Glance focus/header/stacking/resize/lifecycle/persistence acceptance claimed. Grouped tabs deliberately refused in this foundation.

Added a pure Spaces capture adapter mapping native snapshots into saved tab/group columns. Four tests cover private/mixed-private refusal, zipped pin/group/active identity, independent group records, and explicit unsupported-URL omissions. Real native snapshot capture passes. This does not store or switch spaces: durable profile storage, atomic switching/autosave, single-window ownership, recovery, residency, deletion/undo and UI integration remain unimplemented. Unsupported/empty captures are explicitly incomplete; no file grants are inferred. No permanent profile changes.

Two incremental native builds succeeded:36.11s and37.60s Siso, six steps each. Final guard0/4.51s. Fresh inventory41files/100hunks within41/120. Scoped module lint passes; four unit tests pass. Initial test API-name error and native ordering failure retained. Owned test profile/server removed; retained preview tabs unchanged (running preview was not restarted). Evidence: `evidence/ui138-spaces-glance-foundation-20261019/`. Latency deferred; Electron diagnostic build unapproved. Next: stable Glance role/focus routing and native Spaces persistence/transaction boundary, then copied UI exposure and acceptance. No claim of finished feature migration.

## Glance focus and bounded Spaces persistence/switching — October 19, 2026

The hidden native preview now keeps Glance's main tab ID distinct from the focused tab ID. Actual reference focus preserves the main identity; Island Reload and Back route to the focused reference without reloading the main page, and opening Find targets the reference and returns its unique match. Explicit tab-row operations still use their supplied ID. This is not full Glance acceptance: physical keyboard routing, Close/Hard Reload/zoom/Print, main-scoped extension/shield actions, explicit promotion, foreground children, narrow stacking, divider/header and broader lifecycle remain open. Public controls remain hidden.

Spaces has an internal native profile-scoped versioned JSON store, serialized off the UI thread and written with Chromium's atomic file writer. It refuses private access, malformed/corrupt stores, unsafe URLs, incomplete/loading/split/beforeunload-sensitive captures and unsaved source changes. Switching requires an explicitly saved unchanged source, rechecks tab IDs and capture after disk I/O, stages destination tabs, then closes the saved source. It restores URL order, pins, group name/color/collapse and active selection. A live owner prevents another window overwriting the same named space. This is a bounded prototype API, not the complete Spaces UI or a crash-atomic window transaction. No claim of zero state loss for arbitrary pages: history/form/scroll/residency are not captured. Autosave, live-cache residency, focus-existing-owner UX, delete/undo, richer identity metadata, switching crash recovery and arbitrary document races remain open. Controls stay hidden until those policies are implemented.

Ten final runtime checks pass, plus five restart/ownership/corruption checks: bidirectional A/B switching, group/pin restoration, private read/write refusal, restart persistence, second-window ownership refusal, corrupt store read/write refusal without tab mutation, and unsafe stored destination refusal. The first capture failure, unsupported fixture color and collapsed-group switching failure are retained. The collapse repair applies saved visuals after final selection, which otherwise expands the group. Browser automation only; no physical-input or full visual claim. Four capture unit tests and three-module scoped lint pass.

Native build attempts: initial compile failure (9.23s Siso /14.82s wrapper; C++ dictionary chaining and handler placement fixed), then three six-step incremental successes:33.85/33.79/33.88s Siso (37.36/37.60/37.69s wrappers). Final guard zero actions/4.38s. Fresh upstream inventory41files/100hunks within41/120. No cold build, GN/toolchain change, latency run or Electron diagnostic build. All invocation records and53hashed evidence members are preserved under `evidence/ui138-spaces-routing-20261019/`. Owned disposable profiles/server removed, original retained-preview tabs unchanged; retained preview not restarted. Task0/F12 gates remain unchanged, latency deferred, Electron diagnostic build unapproved.

Next: complete Glance's remaining command/role paths and Spaces autosave/ownership/switch recovery before exposing the copied controls. Plan item4 remains incomplete; these checks do not close native-input, VoiceOver, full visual parity or the other tranche acceptance gates.

## Focused commands, Spaces autosave and explicit checkpoint recovery — October 19, 2026

The internal native page-command bridge delegates Hard Reload, Close, zoom in/out/reset and Print to Chromium's focused-WebContents command path. Actual reference Hard Reload preserves the main document marker; reference zoom in/out/reset changes only the distinct-origin reference; reference Close removes that tab, collapses Glance and retains main. Unknown commands are refused, and the internal Close command refuses the last tab. Explicit tab-row close IDs are unchanged. Print is wired but not exercised; physical keyboard/menu parity, same-origin zoom policy, main-scoped extension/shield actions, promotion, children and complete Glance UI remain unqualified. Public Glance controls stay hidden.

Bound Spaces now autosave a complete capture after one second of stability, driven by the existing Island snapshot poll, with writes serialized off the UI thread. The previous validated JSON generation is atomically checkpointed before the current generation is replaced. Corrupt/unreadable/missing primary data with a checkpoint refuses normal writes; errors stop autosave and are exposed in the snapshot. Explicit internal recovery validates the checkpoint, restores it, leaves current tabs unchanged, and clears live ownership/autosave binding so recovered data cannot immediately be overwritten by an old window. Invalid checkpoints refuse without modifying the primary. No automatic loss-hiding fallback or renderer storage.

Eleven final runtime checks and five restart checks pass: focused commands, navigation/group/pin autosave, prior-generation retention, corrupt-store stop, explicit recovery, rebind/resume, acknowledged save surviving an owned browser SIGKILL, explicit reopening after restart, missing-primary refusal/recovery, invalid-checkpoint refusal. The crash happened after an observed successful write, not inside a write. The initial alternate-loopback fixture timeout and stale cached UI snapshot assertion are retained as failed harness attempts; localhost and waiting for fresh snapshot state corrected them. Four capture tests and three-module scoped lint pass.

Limits remain explicit: snapshot-poll autosave has an unacknowledged tail and is not a guaranteed exit flush; background throttling, beforeunload/incomplete captures, interrupted-write/power-loss and switch-mid-transaction recovery remain unqualified. Spaces still lacks full residency, ownership focus UX, delete/undo and public controls. It does not preserve arbitrary page form/scroll/history state. No full feature or native-input acceptance is claimed; plan item4 remains incomplete. Latency stays deferred; Electron diagnostic build remains unapproved; Task0/F12 gates unchanged.

Two six-step incremental builds passed:34.07s and33.31s Siso (38.17s and36.94s wrapper). Final guard0/4.47s. Fresh inventory41files/100hunks within41/120. No cold output, hooks, GN/toolchain changes. Evidence: `evidence/ui138-spaces-autosave-20261019/`,46hashed archived members plus readable results/invocations. Owned disposable profile/server removed; retained preview original tabs unchanged and not restarted.

## Spaces exit flush and interrupted-write investigation — October 19, 2026

Spaces captures a complete bound snapshot during Chromium's WillCloseAllTabs notification, before tab removal, and queues a value-owned save on the existing BLOCK_SHUTDOWN sequenced runner. Private, incomplete, loading, split, beforeunload-sensitive or error-stopped captures remain excluded. This is a bounded normal-close flush, not a guarantee for every shutdown path.

The real normal-exit test passed: the latest navigation was absent from the primary before Browser.close and present after process exit. Normal restart retained that snapshot. A separately authored partial temporary file did not affect the validated primary or list result. Four capture tests pass. The injected write-barrier attempt failed to start a usable browser and timed out before reaching the write; its script, helper source and failed result are retained. No actual mid-write interruption, power-loss durability or interrupted backup replacement is claimed. The synthetic temporary-file probe is not a substitute for those checks. No security settings or signatures were changed to force injection.

One incremental build passed:34.94s Siso,40.92s wrapper; prepare1.81s. Final guard zero actions/3.55s. Footprint recorded in patch-budget.json. Owned test profile/server removed and retained preview tabs preserved. Native input, latency and the Electron diagnostic build remain pending/deferred; plan item4 and broader recovery/ownership/switch-transaction gates remain open. Evidence: evidence/ui138-spaces-exit-20261019/.

## Actual Spaces temporary-write interruption — October 19, 2026

A disposable-process write interposer stopped the actual Chromium Spaces primary temporary-file write after 96 of 192 bytes. The harness verified the owning browser PID, the native hidden temp filename, actual file size, valid checkpoint and unchanged complete primary before SIGKILL. The process was killed while the write remained blocked, before atomic replacement. Restart without injection retained the exact prior JSON generation; explicit Space reopening restored baseline URLs and excluded the unfinished navigation. After pages finished loading, a new save succeeded.

This is a real bounded process-crash/partial-primary-write check, not power-loss durability, backup-write interruption, rename/fsync boundary coverage or arbitrary concurrent recovery. No product patch or native Chromium compilation was needed. Guard: zero actions,5.22s; upstream footprint unchanged from measured41files/100hunks. Native input pending; latency deferred; Electron diagnostic build unapproved. Plan item4 remains incomplete.

The prior helper failure was recursive write interposition (stack overflow), not a signing restriction. The test-only helper now uses direct SYS_write (macOS deprecation warning retained); it does not alter signing/security settings. The first revised run missed Chromium's hidden temporary filename and timed out; corrected matching uses the owned profile directory and exact Spaces basename. Recovery attempts retained an early CDP connection failure and a save refusal while restored tabs were loading. The final resave waits for complete captures. These failures are archived, not counted as passes. Disposable profile/server removed and retained preview tabs unchanged. Evidence: evidence/ui138-spaces-interrupted-write-20261019/.

## Spaces backup and atomic-replacement boundaries — October 19, 2026

Five actual disposable-process interruption cases pass, each followed by restart without injection, native Space listing/reopening and a subsequent successful save:

- Backup temporary write interrupted at94/188bytes: complete primary and previous backup unchanged.
- Immediately before backup rename: complete primary and previous backup unchanged.
- Immediately after successful backup rename: primary unchanged and backup equals the previous primary.
- Immediately before primary rename: primary unchanged and backup equals it.
- Immediately after successful primary rename: new complete primary retained, backup equals old primary; restart restores the new navigation.

The test-only interposer matches the exact owned profile path and backup/primary destination, consumes a one-shot arm and emits a PID/path marker before waiting. The harness verifies the owned PID and on-disk generations before SIGKILL. These are controlled before/after rename boundaries, not a kill inside the kernel rename operation. Partial backup size is checked on disk. All five cases passed on the first attempt in this checkpoint. Helper direct-syscall deprecation warnings remain in the archive; no signing/security settings were changed.

This qualifies bounded process-crash recovery, not power-loss durability, fsync failure, disk-full/I/O errors, concurrent writers or switch-mid-transaction recovery. No product changes or Chromium compilation; final guard zero actions/3.61s. Footprint unchanged from measured41files/100hunks. Five owned profiles/servers cleaned and retained preview tabs preserved. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan item4 and broader acceptance remain open. Evidence: evidence/ui138-spaces-write-boundaries-20261019/.

## Spaces disk-full and write-error recovery — October 19, 2026

Four controlled native write-error cases pass: ENOSPC and EIO at both backup and primary temporary-file writes. The test-only interposer restricts injection to the disposable profile's exact Spaces filenames and records actual browser PID/path/errno. It returns a real syscall-style failure to Chromium's writer; the disk was not physically filled.

Each failed autosave exposes the specific checkpoint or primary-write error, preserves the complete primary, and stops autosave while errored. Backup-write failures preserve the prior backup; primary-write failures leave the validated previous primary in the checkpoint. After removing injection, an explicit save clears the error and persists the previously unsaved navigation; a further navigation then autosaves successfully. All four error/recovery cases passed. No product repair was needed.

The first cleanup verifier failed because retained-preview CDP had no host.html target. Owned fixtures had already been stopped/removed; subsequent cleanup records observed targets rather than assuming the host exists. The retained preview was not modified, but original-tab identity was not reverified this checkpoint. The failed cleanup assertion is retained. All owned disposable profiles/servers were removed.

This tests injected ENOSPC/EIO write handling, not a physically full filesystem, flush/fsync errors, rename failures, permission failures, power-loss or concurrent writers. Test-helper syscall deprecation warning retained; no signing/security changes. No Chromium compile; final guard zero/5.24s; footprint unchanged from measured41files/100hunks. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan item4 and broader gates remain open. Evidence: evidence/ui138-spaces-write-errors-20261019/.

## Spaces flush and rename failure recovery — October 19, 2026

Four controlled native failure cases pass: backup and primary flush failures, plus backup and primary rename failures. On macOS Chromium tries F_BARRIERFSYNC before fsync; archived operation events prove both returned EIO in each flush case. Rename cases return EIO only for the exact owned Spaces destination. Browser PID and file paths are verified. Injection is restricted to disposable profiles; no filesystem or signing settings were changed.

Each case preserves the complete primary, reports the checkpoint or primary-write error, and stops autosave while errored. Backup failures retain the previous checkpoint; primary failures retain the previous primary in the new checkpoint. Removing injection and explicitly saving clears the error and persists the unsaved navigation; a later navigation autosaves successfully. All four passed on their first attempt. No product fix was needed.

These are injected syscall-return failures, not actual hardware flush failure, power-loss, physical media durability, permissions exhaustion or concurrent-writer qualification. Test-helper syscall deprecation warnings retained. Four owned profiles/servers removed; retained preview untouched, host unavailable so original-tab identity not reverified. No Chromium compile; guard zero/3.52s; footprint unchanged from measured41files/100hunks. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan item4 and broader gates remain open. Evidence: evidence/ui138-spaces-flush-errors-20261019/.

## Spaces concurrent windows and switch-read interruption — October 19, 2026

Controlled same-profile, two-window checks pass: a blocked native save keeps the profile busy and refuses the other window's save; after release, retry succeeds and all A/B/C records remain. A foreign window cannot save over the actively owned A name. During a blocked switch read, changing the source navigation causes the switch to reject with tabs unchanged, preserving the changed source instead of installing the destination.

A subsequent switch was stopped during its real stdio disk read, before UI tab staging. The harness verified the exact browser PID/file marker and killed only the disposable browser. Disk records remained unchanged; restart without injection reopened both the saved source and destination and saved again. Four live assertions plus restart/reopen/resave pass. This is same-browser window serialization and pre-dispatch crash recovery, not independent browser processes writing one profile, crash during tab staging/removal, rollback of a partially changed UI, or arbitrary concurrent external writers. Those remain gaps.

Initial helper interposed read but missed stdio's internal path; timed-out attempt retained. Corrected fread interposition reached the real read, and all final checks passed. No product changes/native compile; guard zero/3.60s; footprint unchanged from measured41files/100hunks. Owned profile/server removed; retained preview untouched, host unavailable so original-tab identity not reverified. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan item4 remains incomplete. Evidence: evidence/ui138-spaces-concurrent-20261019/.

## Spaces crashes during actual staging and removal — October 19, 2026

Temporary diagnostic hooks abruptly exited the disposable browser without shutdown cleanup after first destination staging (four live tabs), all destination staging (six), first actual source removal (five), and final source removal (three). Markers record the actual live URLs and expected three-tab source/destination. Each case preserved the complete saved A/B records; restart without the crash flag explicitly reopened both Spaces at their correct three-tab contents and saved again. All four final cases pass.

CloseWebContentsAt queues some removals: the first diagnostic attempt after a close request still had six tabs. The corrected removal checkpoints run from tab-model notifications after actual removal. Completion order differs from request order, so the assertion checks the actual surviving source/destination set, not an assumed first close. Initial UI-thread blocking marker failure, request-only observation, stale-log match and close-order harness assumptions are retained. Markers are read only from the current switch's log interval in final removal runs.

This demonstrates saved-record recoverability after abrupt exit during these four UI stages. It does not demonstrate automatic completion/rollback of the interrupted live window, automatic session restoration, preservation of unsaved page state, or power-loss durability. Public Spaces controls remain hidden; broader transactional/residency acceptance remains open.

All diagnostic source edits were removed byte-for-byte and the normal prototype rebuilt. Normal A/B switching passes even with the now-inert diagnostic flag supplied. Four guarded incremental builds succeeded: wrappers39.60/38.10/38.15/38.83s; Siso35.26/34.19/34.16/34.93s. Final guard zero/3.74s. No cold build or GN/toolchain change. Final upstream footprint unchanged from measured41files/100hunks. Diagnostic patches and invocation logs are archived; no diagnostic hook is in product source. Owned profiles/servers removed; retained preview untouched, host unavailable so original-tab identity not reverified. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan item4 remains incomplete. Evidence: evidence/ui138-spaces-switch-crash-20261019/.

## Automatic source-Space recovery — October 19, 2026

Owner decision recorded verbatim: **Restore the source Space (recommended)**. A versioned profile-local `.switch` journal is atomically written before staging, with a random transaction ID, named source and validated source/destination captures. The source must equal its durably saved record. Pending intent blocks other saved-Space mutations. Completion waits for the exact new tab IDs and complete capture before removing the journal; a successful switch API callback alone is insufficient.

Four forced exits after first/all destination staging and first/all actual source removal automatically restore the saved source after restart, without an explicit bridge/API reopen. Saved A/B records remain unchanged, and the completed recovery clears the journal. A second crash during first-tab recovery preserves the same journal; the next restart restores exactly one three-tab source set. Malformed intent and a nonempty unrelated startup page retain the journal and leave live content unchanged. Normal A/B switching and four capture-policy tests pass. Temporary crash hooks are removed; the normal binary is rebuilt and smoke-tested.

This is bounded startup recovery into a sole empty, non-session-restored regular window. It checks SessionRestore::IsRestoring before reading and before applying recovery; it does not identify an original window across macOS restarts. Exact restored-window ownership, in-flight/multiwindow session-restore races and private-runtime recovery still need qualification. Ambiguous startup content fails closed and leaves a recovery error/journal; automatic recovery is not complete for those cases. The UI remains hidden. Intent-write/acknowledgement fault injection, crash around journal deletion, group/pin recovery, power-loss durability and unsaved page state remain gaps. Previous generic Spaces write-error tests do not qualify the new journal. Journal deletion is not claimed as power-loss-durable acknowledgement.

Only guarded incremental builds were used; no cold output, args/toolchain changes, latency tests or Electron diagnostic build. Native input remains pending. The production source contains no diagnostic crash hooks. Owned test profiles/servers are removed; retained preview was untouched (host unavailable, original tabs not reverified). Task 0/F12 gates and plan item 4 remain open.

Evidence: `evidence/ui138-spaces-auto-source-20261019/`. Build wrapper timings: build 39.94 s, build2 38.62 s, diagnostic-build 37.53 s, restore-build 42.17 s. Fresh patch budget: 41 upstream files / 100 hunks. Final zero-action guard is archived. These costs are routine implementation/testing, never the Task 0 cold-build column.

## Spaces journal failures and multiwindow ownership — October 19, 2026

Five native journal fault cases pass: ENOSPC/EIO on the actual intent temporary write, both F_BARRIERFSYNC and fallback fsync EIO, final intent rename EIO, and completion unlinkat EIO. All markers identify the disposable browser PID and exact profile-local path. The four intent failures leave source tab IDs/URLs and saved records unchanged, expose an error, then successfully switch on retry with journal clearance. Completion-clear failure retains the journal and complete saved records, refuses another save, then restores the source and clears intent on a normal uninjected restart. This is injected syscall-failure evidence, not a physically full disk, power-loss or hardware-durability claim.

Four controlled startup ownership cases pass using a synthetic valid journal plus complete saved A/B store, holding the actual journal fread while windows change. A second regular window and an identical empty regular window cause refusal: neither window changes and intent remains. A private window stays unchanged while the sole regular window automatically restores the source. Closing the candidate window before the read completes leaves the other regular window and intent unchanged. Saved A/B store bytes are unchanged in all four cases. This qualifies safe refusal/private isolation, **not successful multiwindow recovery or identification of the original restored window**. Candidate closure currently leaves recovery pending until another startup; no in-process reassignment is claimed.

Initial acknowledgement helper intercepted unlink rather than Chromium's unlinkat and missed the fault; its timeout is retained. The corrected probe observes actual unlinkat EIO. The first restart assertion ran before host initialization; retained failure, readiness wait corrected, subsequent source recovery passed. Initial intent-only ownership probes are also retained, followed by the four stronger complete-store runs. Earlier switch/restore acceptance remains unchanged.

No product code changed and no Chromium compilation ran. Final guard: zero actions / 3.72 s. Existing footprint remains 41 files / 100 hunks (no new source edits; not freshly recounted). Test helper dylibs were scoped to owned profiles and are excluded from the evidence archive; source/build logs remain. Disposables removed; retained preview untouched, host unavailable so original tabs not reverified. Plan, results and routine ledger updated; public Spaces controls remain hidden. Latency deferred; native input and Electron diagnostic build pending. Task 0/F12/visual acceptance gates remain open.

Remaining: exact durable window identity across session rebuild and both restore paths, live multiwindow recovery rather than refusal, repeated startup ordering, failure around deletion/crash/powerloss, recovery group/pin and unsaved state. Source audit below identifies the integration points; this checkpoint does not expand the patch ceiling or claim them implemented.

Evidence: `evidence/ui138-spaces-journal-ownership-20261019/`.

## Durable window identity budget request — October 19

Unapplied hook sketch: three new upstream paths / seven hunks, projected44files/107hunks. Existing41/120 ceiling unchanged; explicit owner budget response pending. Design and acceptance contract: `evidence/ui138-window-identity-design-20261019/README.md`. No product source/build/profile changes or new runtime claims. Identity save acknowledgement remains a prerequisite to prove. Latency deferred; native input/Electron diagnostic build pending.

## Durable window identity — October 19, 2026

Owner explicitly approved: **Raise to 44 files; keep 120 hunks**. The counter and §7 now use that ceiling. Actual measured footprint: **44 upstream files / 107 hunks**, with exactly the three reviewed new paths. No further expansion.

Regular prototype windows receive a browser-owned UUID. Session rebuild serializes it, normal session restoration reattaches it, and native Recently Closed exports/imports it. Private windows have no identity. New version-2 switch journals bind their saved source to that UUID; recovery requires one matching same-profile window after session restoration settles. Missing/invalid/duplicate matches are refused instead of choosing by URL, title or window order. Version-1 journals retain their earlier restricted fallback. Current-session tab IDs/capture are still revalidated after disk work. Incremental identity metadata is queued through SessionService; an acknowledgement of durable save is not available from the inspected interface and is not claimed.

Two real two-window runs pass: first distinct content, then identical two-tab URL/layout contents. UUIDs survive normal restart; the owned browser is then SIGKILLed while a diagnostic rename hook holds immediately after the version-2 journal is atomically installed. Restart with Chromium session restore automatically recovers the UUID-matching source, clears intent, preserves both saved records and leaves the other window's content/identity unchanged. This is a before-staging journal-commit crash point, not all prior staging/removal points rerun under version 2. Native Recently Closed window restoration independently preserves the source UUID and two-tab content. Private window identity is empty and saving is refused. A valid but nonmatching UUID in a synthetic version-2 intent leaves both restored windows unchanged and retains the journal.

Five focused tests and three scoped module lint checks pass. First build failed on two diagnostics from one dictionary chaining expression; repaired without changing args or cleaning output. Initial incremental wrapper38.12s failed, continuation56.99s succeeded (50.68s Siso,9steps). Final guard0/4.44s. A package-resolving lint invocation was canceled because this worktree has no node_modules; the existing installed scoped linter passed. Actual runtime proofs and failures are retained. No Electron diagnostic build or latency run. Owned profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified.

Remaining: crash before newly queued identity metadata reaches disk, explicit session-rebuild fault injection, duplicate/malformed persisted UUID runtime tests, version-2 crashes during staging/removal/recovery, late overlapping restore windows, original-session unsaved state, deletion/power-loss durability and public recovery UX. Missing identity intentionally leaves recovery pending; successful full multiwindow/lifecycle acceptance is not claimed. Nonowner windows can retain a recovery-status error until reinitialization. Public Spaces controls remain hidden. Native input pending; latency deferred; Electron diagnostic build unapproved. Task 0/F12 and plan item4 remain open.

Evidence: `evidence/ui138-window-identity-20261019/`. Routine implementation/test time only; Task0 cold column unchanged.

## Window identity and recovery boundaries — October 19, 2026

Four actual abrupt exits pass with version-2 durable identity journals: after the first destination tab, all destination tabs, first actual source removal and all source removals. Temporary profile-scoped native diagnostics record live URLs at each boundary (3,4,3,2 tabs respectively) and exit86. After real Chromium session restoration, only the matching source UUID is recovered automatically, both saved records remain byte-equivalent as parsed JSON, the unrelated window retains its UUID/content, and the journal clears. This extends the prior before-staging journal-write crash proof; it does not prove every interleaving or power-loss durability.

With the owned browser stopped, the duplicate-identity harness replaces the second window UUID with the first in both plaintext and mock-keychain-encrypted Session records. No real keychain/profile is accessed. A synthetic valid v2 intent then targets that duplicated UUID. Both restored windows expose the duplicate, recovery reports no unique match, both window contents and saved records remain unchanged, and the journal remains. Repeated on the restored normal binary. This proves bounded duplicate persisted identity refusal, not late-arriving duplicate ownership or malformed-record handling.

All four crash cases, normal-binary duplicate refusal and normal A→B→A switching with explicit completed saves pass. The initial immediate B→A attempt was refused by the complete-saved-window guard; that failure is retained. A second snapshot sampled one source-removal callback before completion; final verification waits for the journal acknowledgement and exact final tab count. Both attempts are retained. Immediate reverse-switch acceptance is not claimed. Native diagnostics removed byte-for-byte; normal binary rebuilt and tested. Two guarded incremental builds only: diagnostic wrapper 38.65s and normal restore 37.91s. Final zero-action guard 5.16s. Product source unchanged from536e33bd; prior measured44files/107hunks within44/120 remains unchanged, not re-enumerated. Test profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified.

Remaining: metadata save acknowledgement/crash before identity persistence, late or overlapping session restores, malformed persisted identities, crash during v2 recovery itself, groups/pins/unsaved page state across these exact boundaries, arbitrary interleavings and power-loss/deletion durability. Full multiwindow recovery acceptance and public Spaces controls remain open. Native input pending, latency deferred, Electron diagnostic build unapproved. Other Task0/F12 gates unchanged. Routine evidence/testing only; cold-build ledger unchanged.

Evidence: `evidence/ui138-window-recovery-boundaries-20261019/`.

## Interrupted recovery and malformed identity — October 19, 2026

Four version-2 recovery interruption schedules pass. Each starts with two regular windows, persists their distinct UUIDs, crashes after the first destination tab during a switch, then restarts with real session restoration and crashes again during automatic source recovery: first/all source tabs staged, first/all prior tabs removed. The exact recovery marker is recorded and the journal remains byte-identical across the second crash. A third launch without the crash flag restores exactly the saved source content under its original UUID, preserves the decoy and saved records, and clears the journal. This is bounded process-crash coverage, not power-loss or every callback interleaving.

Two synthetic malformed persisted identity cases pass on the restored normal binary: 36 invalid characters and an uppercase UUID. Only owned disposable plaintext/mock-encrypted session records are mutated using Chromium's public mock keychain. Restored source identity is empty, the decoy retains its valid identity/content, both windows and saved records remain unchanged, recovery reports no unique match, and the valid journal remains. No fallback UUID is invented. This does not qualify malformed serialized lengths, missing metadata save acknowledgement, or late-arriving restore windows.

Temporary diagnostics removed byte-for-byte and normal binary rebuilt. Incremental wrappers: diagnostic 39.02s, normal restore 36.82s; final guard0/3.28s. Product source unchanged; prior measured44files/107hunks remains unchanged within44/120, not re-enumerated. Owned profiles and fixture server cleaned; retained preview untouched, host unavailable so its original tabs not reverified.

Remaining: metadata save acknowledgement/crash before initial identity persistence, late or overlapping restores, malformed session serialization and journal variants, groups/pins/unsaved state at these boundaries, arbitrary scheduling and power-loss/deletion durability. Full Spaces acceptance/public controls remain open. Native input pending; latency deferred; Electron diagnostic build unapproved. Task0/F12 gates unchanged. Routine testing evidence only; cold-build accounting unchanged.

Evidence: `evidence/ui138-recovery-interruption-20261019/`.

## Metadata save ordering and delayed session restore — October 19, 2026

**Save acknowledgement remains an observed failure/gap, not a pass.** The disposable browser's first Session-file write (8-byte header) was held before the syscall. UI initialization, distinct window UUID generation, saving A/B and a complete Spaces switch to B all succeeded while that Session file remained zero bytes. The hook was then released and the disposable browser shut down normally. This directly proves that queued identity registration is not a prerequisite completion acknowledgement for switching. The experiment did not simulate power loss or claim a lost-data recovery outcome; it identifies the missing ordering gate. The harness's `pass` means it reproduced this observation, not that the feature meets durability acceptance.

Source audit: `components/sessions/core/command_storage_manager.cc` Save() invalidates its timer, posts AppendCommands to a sequenced backend and provides only an error callback. HasPendingSave() reflects timer state, not completed IO. Clear/encrypted backends have staged selection rules and delayed encryptor availability. `command_storage_backend.cc` AppendCommandsToFile returns write status internally; no success acknowledgement is propagated through the inspected SessionService path. A delay, an empty pending queue, or AddWindowExtraData returning cannot be treated as durable completion.

**One delayed-restore schedule passes.** With two previously saved windows and a valid synthetic v2 intent, a real Session-file read was held on the backend. A third unrelated regular window was opened via CDP while the read remained held. Its snapshot had no recovery mutation/error and the journal remained. After release, the two real session windows restored; the UUID-matching source recovered, both original saved records and the original decoy remained unchanged, the new third window remained, and the journal cleared. Nonowner windows retained the already-known status error after recovery; this is not a full overlapping/late-duplicate restore qualification.

No product source change or native build. A scoped diagnostic dylib intercepted only owned disposable Session paths; public mock keychain, no real profile/keychain access. Zero-action final guard. Prior measured44files/107hunks unchanged, not re-enumerated. Owned profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified. Evidence includes actual syscall paths/PIDs, before/after snapshots and invocation records.

Required next implementation: carry an identity-generation-specific successful save result from the authoritative session backend to the browser owner; define write-vs-flush guarantees explicitly; refuse/defer destructive switching until that generation is acknowledged; keep errors, encryptor delay and owner destruction fail-closed. This needs a concrete upstream patch inventory before changing the44/120 ceiling; no budget increase or acknowledgement implementation is claimed here. Also still open: late duplicate restoration, multiple overlapping restorer lifetimes, save failures, rebuild/rotation ordering and power-loss durability. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan remains in progress; cold-build accounting and other Task0/F12 gates unchanged.

Evidence: `evidence/ui138-session-save-restore-20261019/`.

## Save acknowledgement implementation proposal — October 19, 2026

The owner requested a fix for the reproduced metadata ordering gap. An **unapplied** patch sketch adds a successful flush result from the selected session backend through CommandStorageManager and SessionServiceBase. It measures **five new upstream files and seven added hunks**, projecting **49 files / 114 hunks** from44/107. The existing44/120 ceiling remains unchanged pending explicit owner approval. No Chromium files/output/profile changed and no build started for this sketch.

New paths: `components/sessions/core/command_storage_backend.{h,cc}`, `components/sessions/core/command_storage_manager.{h,cc}`, and `chrome/browser/sessions/session_service_base.h`. The already-patched session_service_base.cc gains the forwarding method. Counts compare pristine/current/drafted text with the pinned diff flags and record Git version. Candidate API text is reviewable in the evidence directory, not a compiled implementation or acceptance result.

Implementation contract: immediately queue the exact owner UUID again, then request SaveAndFlush; wait for the authoritative clear/encrypted backend and delayed encryptor operations in sequence. A matching owner/generation callback, successful append state and file flush are required before switch intent/staging. Reject busy/pending/error/dead-owner or changed-identity completion; never infer success from timer expiry. Use a weak owner lifetime and a bounded fail-closed timeout if callbacks are dropped during shutdown. Inspect rebuild/write-error ordering and add a generation token to the backend result if a later rebuild could mask failure of the requested batch. The sketch shows the transport/flush seam; that generation validation and the Blanc-owned switch gate must be completed before it is considered correct. Flush success is an OS file-flush acknowledgement, not a claim about hardware/power-loss durability.

Required checks: replay the held-first-write reproducer and prove switching cannot stage/delete tabs while blocked; release and prove matching-generation success permits switching. Inject write/flush errors, delayed encryptor readiness, owner close, identity replacement, rebuild/rotation and callback timeout; preserve source on each refused attempt. Rerun late restoration, duplicate/malformed identities and recovery crash boundaries. Keep all builds incremental and recount before/after. Up to120 hunks remains the proposed limit, with no automatic relaxation if final implementation exceeds it.

Awaiting only the specific file-budget decision: raise44→49, retain120hunks. Plan remains in progress; save-acknowledgement runtime gap remains open. Native input pending; latency deferred; Electron diagnostic build unapproved.

Evidence: `evidence/ui138-save-ack-design-20261019/`.

## Metadata save acknowledgement implemented — October 19, 2026

Owner approval recorded: **"Raise to 49 files; keep 120 hunks"**. Fresh inventory measures **49 upstream files / 114 hunks**, within that limit. Five new upstream session manager/backend/header paths provide a save-and-flush reply through the already-patched SessionServiceBase. The historical 44/107 measurements remain historical.

Before a destructive Spaces switch, the browser queues its exact durable window UUID again, requests a save, and waits for the selected authoritative session backend's valid-file/initial-marker state and OS file-flush result. The requested append is queued before its flush on the same backend sequence; delayed encrypted operations queue append before flush. A failed append closes the backend file, so the immediately following flush refuses rather than acknowledging a later rebuild. No UI task yield occurs between scheduling the batch and its flush. The callback is bound to the owner browser, source capture and a monotonically increasing request generation. Missing/dead/changed owners or sources, errors and stale completions cannot create an intent or stage/remove tabs. This is an OS file-flush acknowledgement, not hardware or power-loss durability.

An initial runtime test exposed a second bug: the native 15-second deadline exceeded the bridge's 10-second deadline, allowing a late completion after the caller timed out. The native deadline is now eight seconds. The failed test is retained. The corrected test receives the native timeout, releases the held write, proves the late callback does not switch, and then completes an explicit retry.

Bounded runtime passes:
- A real first Session write held before its syscall leaves the file at zero bytes, source tabs unchanged and no switch journal; releasing it permits the switch. Repeated with encrypted-only storage selected explicitly, holding the actual Sessions_Encrypted file.
- Injected write EIO and both macOS flush mechanisms failing preserve source tabs and saved records, create no journal, return an error, and allow an explicit retry after injection is removed. Tested under the default configuration, explicit clear-only and explicit encrypted-only storage; default configuration is not assumed to select a particular authoritative backend.
- Source navigation while acknowledgement is pending rejects the stale source capture; the changed page remains and an explicit save/retry succeeds.
- The delayed Session read/third-window restoration schedule passes again. Duplicate persisted UUID, invalid UUID and uppercase UUID regressions safely refuse recovery with records/windows preserved.

Build accounting: one retained compile failure (38.61s wrapper; incomplete SingleThreadTaskRunner type), successful continuation 57.32s, timeout repair 39.36s. All incremental, same output and unchanged GN/toolchain. Final guard schedules zero actions (6.04s). Five focused tests, 11 patch-budget tests and three-module lint pass. Disposable profiles and servers cleaned; retained preview untouched, its host unavailable so original tabs are not reverified.

Remaining qualification gaps: forced delayed-encryptor initialization, explicit owner destruction while waiting, identity replacement during the wait, adversarial rebuild/rotation schedules, late duplicate/overlapping restores, malformed serialization, power-loss/hardware durability and arbitrary lifecycle interleavings. Prior staging/removal crash schedules were not rerun this checkpoint. No full Spaces acceptance or public-controls promotion. Native input pending; latency deferred; Electron diagnostic build unapproved/unstarted. Task 0/F12 gates and cold-build accounting unchanged.

Evidence: `evidence/ui138-save-ack-20261019/` (runtime failures retained alongside final passes).

## Delayed encryptor delivery and owner destruction — October 19, 2026

Four bounded schedules pass: owner destruction while a real first Session write is held, delayed encryptor delivery followed by release, delay through the native acknowledgement timeout followed by release/retry, and source-owner destruction while encryptor delivery is delayed. The normal binary repeats the held-write owner test after diagnostic removal.

The temporary diagnostic pauses the SessionRestore manager's OnEncryptorReady handoff before encrypted-backend construction, only for the exact owned disposable profile. It retains the real encryptor and reschedules through the manager's weak pointer; it does not block the UI thread while waiting. Explicit encrypted-only storage is selected. Three pending operations are observed after requesting the switch, no encrypted Session file exists, source content remains intact, and no switch journal appears. Release permits the queued append/flush acknowledgement and switch. Holding beyond eight seconds returns the native error; release cannot revive the expired switch and an explicit retry succeeds. This qualifies delayed delivery to the session manager, not a real OS keychain/provider failure or cryptographic computation delay.

For owner destruction, CDP closes the source window's actual page targets while an unrelated regular window keeps the profile alive. The source owner disappears before release. After release and the old timeout deadline, no journal or replacement destination appears, the surviving window retains its UUID/content, and that window can save and switch normally. Closing tabs one at a time legitimately changes the saved source through exit flush: an initial overly broad assertion expecting the pre-close store failed and is retained. The final assertion snapshots the store immediately after owner closure and proves the late acknowledgement does not change it. This does not claim whole-window-close preservation of the original tab set or destruction of the entire profile/session manager.

An initial diagnostic launch failed Chromium's blocking-I/O DCHECK before acceptance. The profile-scoped test hook was corrected with a test-only blocking allowance for its local marker checks; the UI delay itself uses asynchronous timers. The failed launch and timeout remain archived. All diagnostic code and its temporary include were removed byte-for-byte afterward; the normal binary was rebuilt and tested. No product-source change from 5c47643a.

The diagnostic inventory measured 49 files/115 hunks initially and 49/116 after its correction, both within the approved 49/120. Restoring the exact source returns to the prior measured 49/114; that final count is source-equality backed, not a new full inventory. Only incremental builds used the existing output; no GN/toolchain changes or cold-build accounting changes.

Remaining: complete profile/session-manager destruction during acknowledgement, provider failure rather than delayed delivery, identity replacement, adversarial session rebuild/rotation, overlapping/late duplicate restoration and arbitrary scheduling/power-loss durability. Full Spaces acceptance remains open. Native input pending; latency deferred; Electron diagnostic build unapproved/unstarted. Retained preview untouched; host unavailable, so original tabs not reverified. Owned profiles/server removed.

Evidence: `evidence/ui138-save-lifetime-20261019/`.

Incremental wrapper times: initial diagnostic 34.75s, repaired diagnostic 36.45s, normal restore 33.55s. Final guard zero actions / 3.94s. 67 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## Profile shutdown and unavailable-provider acknowledgement — October 19, 2026

Two full-browser graceful shutdown schedules pass with an acknowledgement pending. In the first, the SessionRestore manager's real encryptor handoff is delayed and its destructor records three pending encrypted operations. In the second, the first encrypted Session write is held before its syscall; the session-manager destructor is observed before the write is released. Both processes exit with code zero, no switch journal appears, saved Spaces remain unchanged, and a new process using the same disposable profile can save and switch successfully. These tests cover complete application/profile teardown, not hot deletion of one profile while another remains running, or arbitrary forced termination.

The unavailable-provider case supplies a non-null Encryptor with no keys at the SessionRestore manager handoff. The diagnostic confirms IsEncryptionAvailable is false and EncryptString returns nullopt. With encrypted-only session storage selected, two actual switch attempts return the native metadata-save error; source tabs and saved records remain unchanged and no journal is created. No cleartext Session file is observed in this fixture. Clean shutdown exits zero, and restart without the injected unavailable encryptor successfully switches. This is a simulated provider-failure result at the consumer boundary, not a real macOS keychain denial, provider IPC failure, permanent key loss, or in-process provider recovery. The real keychain is untouched; the public mock-keychain mode is used throughout.

A temporary hook scoped to the exact disposable profile records session-manager destruction and holds/replaces encryptor delivery. Its initial two compile failures (private Mojo tag constructor, then missing protected ref-counted destructor) are retained. A first delayed-shutdown run passed teardown but attempted its post-restart save before the page settled; the complete-saved-window guard refused it. That failure is retained; the final harness waits for page readiness before saving. All diagnostic source/include changes are removed byte-for-byte, and the normal binary is rebuilt and passes save/switch, graceful exit and restart/switch checks.

Diagnostic inventory: 49 files / 117 hunks, within the approved 49/120. A pinned-flags recheck confirms the corrected diagnostic manager still has the same four hunks. Normal source equality returns to the prior measured 49/114; no new full normal inventory is claimed. All builds are incremental in the existing output. No product-source changes from 5c47643a; no GN/toolchain or cold-build accounting changes.

Remaining: hot profile deletion/unload, genuine OS/provider failure modes and same-process provider recovery, missing-key decryption of existing records, identity replacement, adversarial session rebuild/rotation and arbitrary lifecycle/power-loss schedules. Full Spaces acceptance remains open. Native input pending; latency deferred; Electron diagnostic build unapproved/unstarted. Owned profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified.

Evidence: `evidence/ui138-save-provider-20261019/`.

Incremental wrapper times: failed diagnostic attempts 7.46s / 10.82s, successful diagnostic 33.24s, normal restore 33.58s. Final guard zero actions / 3.53s. 63 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## Windows uBO Retry recovery asset fix — October 19, 2026

The Windows desktop failure on caddd938 occurred while the browser was still alive: the provider reported failed/ubo-background-crashed with its recovery budget exhausted. Settings view 58 was focused at 1792449081225 and closed at 1792449089228 by discardFailedUtilitySheet, matching the eight-second navigation watchdog. The later process exit zero was test cleanup, not the initiating failure. The log does not identify which pending resource caused the Windows load stall.

The recovery page previously re-entered Electron's network stack through net.fetch(file:) for bundled HTML/scripts/styles. It now reads already-allowlisted local assets asynchronously and returns explicit MIME types with nosniff, including the existing exact branding endpoint. URL resolution, IPC ownership, CSP, external blocking and the eight-second hung-sheet deadline are unchanged. This removes the internal file-fetch dependency during provider loss; it does not claim that a native Windows trace proved the exact blocked resource. The desktop regression deliberately holds file fetches and requires visible Retry with zero such calls. A focused native probe also clicks Retry and requires ready afterward. The audit inventory is refreshed.

No Chromium source/output/profile changes or builds. Upstream footprint remains the prior measured 49 files/114 hunks; no fresh inventory claimed. Latency deferred, native input pending, Electron diagnostic build unapproved/unstarted. Windows acceptance remains dependent on new-head CI; no historical pass is substituted.

Validation: focused native probe passes visible Retry, zero file-fetch dependency and actual Retry click to ready; the old source fails the same injected-stall probe before Settings becomes available. The original Mac full uBO suite and updated full suite both pass (natural Windows timing not reproduced locally). Unit batches pass 24/24 and 36/36, with overlap; scoped lint and audit inventory check pass. Missing-dependency/sandbox setup failures and an initial focused-probe hook typo are retained. No Electron source build was performed; tests use official Electron 44.8.0. New-head Windows CI remains pending.

Evidence: `evidence/ui138-retry-assets-20261019/`.

## Identity replacement and session rebuild/rotation — 2026-10-19

Tests exercise the real native UUID replacement, SessionService reset and current-to-last-session rotation APIs through a temporary control restricted to the exact disposable profile. The write interposer holds the first actual Session header write before its syscall; PID/path and zero-byte file are checked. Both explicit clear-only and encrypted-only session storage use the public mock keychain, never the real keychain.

The established-profile matrix first performs a clean close and restore. Identity replacement while a save acknowledgement is pending rejects the switch before a journal or tab mutation; a fresh save/switch succeeds. Reset and rotation are requested both before acknowledgement starts and while it is pending. The switch stays pending with no journal while the write is held. Successful cases verify the source UUID and untouched decoy contents after an actual owned-browser SIGKILL and session restore. Rotation also requires an observed new Session filename. This does not prove power-loss durability, all rebuild reasons, or arbitrary simultaneous external writes.

A separate fresh-profile first-crash attempt failed to restore the two windows, returning one new blank window instead. That remains an unresolved runtime gap, not a passing matrix cell. The initial cached-identity assertion has a preserved result. A later host-startup timeout and sandbox process-inspection refusal remain in the invocation history; their same-name log files were overwritten by later runs, as explicitly recorded in additional-attempts.txt. The final matrix uses a cleanly primed profile and must not be described as first-ever-session crash coverage.

The first normal-binary smoke attempted to save/switch while restored pages still reported loading and timed out waiting for B; its result/log are preserved. The repeat waits for restored pages before saving. Temporary native diagnostics are removed byte-for-byte and the normal binary rebuilt and checked. Product source is unchanged. Fresh diagnostic inventory is 49 upstream files / 114 hunks; the native diagnostic is in a Blanc-owned file, excluded by the established counting rule. Normal source restoration preserves that footprint within 49/120. All builds use the existing incremental output; no cold-build figures change.

Remaining: first-run crash restoration, arbitrary rebuild/rotation failure schedules, real keychain/provider faults, hot profile deletion and wider lifecycle/power-loss cases. Native input remains pending, latency deferred, and the Electron diagnostic build unapproved/unstarted. Retained preview is untouched; its host is unavailable, so original tabs are not reverified. Owned test profiles/server are removed.

Evidence: `evidence/ui138-save-rotation-20261019/`.

Ten final diagnostic schedules and one normal-binary smoke pass. Incremental wrapper times: diagnostic 41.29s, normal restore 41.27s. Final guard zero actions / 6.2s. 129 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## First-run profile prerequisite for session acknowledgement — 2026-10-19

Reproduced on the prior normal binary: a first-run Spaces switch completes with a 20,992-byte Session file but no Default/Preferences. After SIGKILL, --restore-last-session produces one new blank window. ProfileImpl::IsNewProfile derives new-profile status from preference-store initialization, and StartupBrowserCreator::GetSessionStartupPref ignores forced restoration for new profiles. This is separate from Chromium's intentional crash-loop protection, which normally requires the recovery prompt after a persisted Crashed exit marker.

The existing Blanc integration now waits for PrefService::CommitPendingWrite after successful authoritative Session save/flush, then checks on the disk sequence that Preferences is a readable JSON dictionary. PrefService's callback alone does not report write failure. The original owner/UUID/capture/generation guards and eight-second timeout still gate journal creation; late completion cannot start a switch. No preferences are fabricated or directly written by Blanc. This checks profile initialization readiness, not that every changed preference has persisted when an older valid Preferences file already exists.

Six bounded runtime checks pass: first-ever-profile crash restoration with clear-only and encrypted-only sessions, held Preferences rename/release, rename EIO refusal, held replacement beyond timeout with stale completion ignored, and source navigation while replacement is held. Both first-run cases verify Preferences exists with Crashed exit marker, exact source UUID/URLs, and untouched decoy identity/URLs after restore. Automated restoration uses --hide-crash-restore-bubble only on the disposable restart so the native engine can be tested while native input is pending. Production crash prompting is unchanged; physical Restore-button acceptance is not claimed. This is not general automatic crash recovery or first-run recovery without a Spaces acknowledgement.

The old-source failure and an initial observer failure that assumed Preferences already existed are retained. Injected errors target only the disposable Preferences rename; no real disk, keychain or retained profile is changed. Five capture/window-identity unit tests pass. Prior ten rebuild/rotation schedules are not rerun on this checkpoint; broader lifecycle/provider/power-loss qualification remains open.

One guarded incremental build: 38.38s wrapper / 34.54s Siso, six steps. Final guard: zero actions / 3.59s. Product changes are confined to the Blanc-owned integration file; upstream footprint remains the prior measured 49 files / 114 hunks within 49/120, not newly re-enumerated. No diagnostic native control remains. Latency deferred; native input pending; Electron diagnostic build unapproved/unstarted. Plan remains in progress.

Evidence: `evidence/ui138-first-session-20261019/`.

67 archive members verified against SHA-256. Owned profile/server and stopped raw profile snapshot removed; retained preview untouched, host unavailable so original tabs not reverified.

## Identity/rebuild/rotation rerun on the profile-persistence fix — 2026-10-19

Rerun against 6c1135a1, including its PrefService completion and readable-profile check. The same ten schedules cover clear-only and encrypted-only storage: identity replacement while acknowledgement is pending, and real SessionService reset/rotation before or during pending acknowledgement. A held first Session write proves no early journal. Identity change must refuse without source/store mutation and permit a fresh retry. Reset/rotation must complete after release. Actual process crash/restoration verifies source UUID and exact source URLs, decoy UUID/URLs, and absence of unfinished switch intent; rotation additionally requires a new Session filename.

Profiles are cleanly primed, matching the earlier matrix. Disposable restarts now explicitly use --hide-crash-restore-bubble because the fix correctly persists the Crashed exit marker. This is an automated restoration-engine test, not native Restore-button acceptance or a production prompt-policy change. The separate first-run checks remain at ui138-first-session-20261019.

Temporary test control is restricted to the exact disposable profile, removed byte-for-byte afterward, and the normal fixed binary rebuilt and smoke-tested. No product-source change. Upstream footprint remains the prior measured 49 files / 114 hunks within49/120; Blanc-owned temporary controls do not add upstream paths. No new inventory or unit-test count is claimed. All builds incremental in the existing output.

Remaining: physical recovery UI, arbitrary overlapping/external writers, real provider failures, hot profile deletion, wider lifecycle and power-loss qualification. Latency deferred; native input pending; Electron diagnostic build unapproved/unstarted. Plan remains in progress. Owned test profiles/server removed; retained preview untouched and unavailable, so original tabs not reverified.

Evidence: `evidence/ui138-save-rotation-fixed-20261019/`.

Ten final diagnostic schedules and one normal-binary smoke pass. Incremental wrapper times: diagnostic 38.36s, normal restore 38.86s. Final guard zero actions / 3.58s. 121 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## Malformed Spaces recovery journals — 2026-10-19

Eight bounded native checks pass on the normal f45e4107 binary. Synthetic truncated JSON, unsupported version, missing window identity, non-string identity, out-of-range active tab, unsafe file URL and invalid group index are refused with an error. Each retains the exact journal bytes, preserves both source and decoy UUIDs/URLs and the saved store, and refuses a save while recovery is unresolved. A valid v2 control recovers the source and clears its journal while preserving the decoy and store.

The encrypted-session disposable profile uses the mock keychain and cleanly persisted two-window state. Restarts explicitly use the diagnostic crash-bubble bypass only in this test profile; no native recovery-button acceptance is claimed. Invalid journals are replaced only while the test browser is stopped. These are authored serialization negatives, not physical disk corruption, power loss, or exhaustive parser/lifecycle qualification.

Two initial seed attempts failed in the harness: the shell selected Node20 without global WebSocket, and the helper caught that error as host-not-ready. Both failures are preserved. The complete matrix uses bundled Node24.19.0. No product changes or native compilation; final check-only guard schedules zero actions (4.81s). Prior measured footprint49files/114hunks is unchanged within49/120, not re-enumerated. Owned profile/server removed; retained preview untouched and host unavailable, so original tabs not reverified.

Remaining: actual OS provider faults, hot profile deletion, arbitrary overlapping restore/writers, unsaved state and power-loss qualification; full Spaces acceptance remains open. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Evidence: `evidence/ui138-journal-validation-20261019/`.

66 archived members verified against SHA-256. No new unit-test count claimed.

## Overlapping restore and unsaved page state — October 19, 2026

A held actual Session read overlaps two new regular-window creations and closure of one of those windows. The journal remains while held. After release, the original source UUID/URLs recover, the original and surviving new decoys remain, saved Spaces are unchanged and the journal clears. Two bounded runs pass. This is one delayed session restoration with concurrent window activity, not two independent overlapping SessionRestore operations or arbitrary interleavings.

A live authored form with a beforeunload handler refuses switching before any journal/tab/store mutation and preserves its typed value and 700px scroll. After removing the handler and crashing the owned browser, a synthetic valid v2 intent exercises source rollback. The settled-session repeat restores the saved source structure, but the form value is empty and scroll is zero: **unsaved form and scroll recovery fail**. The harness's procedural pass does not mean those acceptance cells pass. The recovery record carries URLs/group/pin/active structure, not live document state; full Spaces acceptance remains open.

An initial immediate crash attempt timed out waiting for three windows and journal clearance. It is retained as unresolved; adding four seconds of session-settling before the repeat is a narrower test, not a product fix or proof of the cause. Nonowner recovery-status errors also remain visible after successful source recovery. No arbitrary overlap, history/form serialization or power-loss claim.

Only disposable profiles and the public mock keychain were used. The Session read interposer is confined to the disposable launch; the final restart uses the normal binary without injection. Explicit crash-bubble bypass is test-only, not physical Restore acceptance. Test helper compilation is not a Chromium build. No product changes or native compilation; final guard zero actions/4.04s. Prior measured49files/114hunks unchanged within49/120, not re-enumerated. Owned browser/server/profile removed; retained preview untouched/unavailable.

Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Remaining: exact concurrent restoration scheduling, immediate post-restore crash behavior, unsaved document state, real provider/hot-profile/power-loss qualification. Evidence: `evidence/ui138-overlap-unsaved-20261019/`.

39 archive members SHA-256 verified. No new unit-test count claimed.

## Preserve session-restored page state during Spaces rollback — October 19, 2026

The old rollback reopened every source URL even when Chromium had already restored the exact source window, destroying its restored page state. After the existing durable UUID, SessionRestore-in-progress, capture and live-tab-ID guards, a complete matching session-restored window is now retained. Its existing tab IDs enter the same completion/journal-clear checks. Mismatching/partially staged windows continue through the existing source reconstruction path. No renderer form extraction or extra plaintext form storage is introduced.

A named authored form populated through CDP Input.insertText and a 700px scroll establish the regression: ordinary settled session restoration retains both; old Spaces rollback loses both; the fixed binary retains both. The earlier fixture used autocomplete=off and direct value assignment, so it was not an adequate guarantee of Chromium form serialization; that limitation is corrected explicitly rather than rewriting historical evidence. beforeunload refusal remains passing. Eight malformed/valid-journal regressions and five focused capture/identity tests pass.

Immediate-crash investigation: cleanly primed two-window and held-read/overlapping three-window repeats recover the expected structural state without the four-second settling pause, but lose very recent form/scroll updates. A no-Spaces immediate control loses those updates too. Source audit records Chromium's delayed page-state synchronization and 2.5-second session-save timer. This explains the unpersisted-state limitation, not the original timeout: **that earlier timeout was not reproduced and its cause remains unresolved**. A separate unprimed control timed out with one new window, retained as a profile-initialization limitation; it must not be substituted as proof of the historical timeout's cause.

This fix preserves state Chromium actually restored. It does not serialize arbitrary DOM state, recover edits lost before session persistence, or retain forms when a partially staged window must be reconstructed from URL/group/pin records. Full unsaved-state and lifecycle acceptance remains open. Password/disabled-autocomplete semantics remain Chromium-owned. Nonowner recovery-status errors remain a separate gap.

One guarded incremental build:42.84s wrapper/36.46s Siso/six steps. Final guard zero/3.49s. Only Blanc-owned source changes; prior measured49files/114hunks unchanged within49/120, not re-enumerated. Test interposer compilation is separate from native build cost. No cold output, GN or toolchain changes. Disposable profiles/servers removed; retained preview untouched/unavailable. Test-only crash-bubble bypass is not native input acceptance. Latency deferred; native input pending; Electron diagnostic build unapproved/unstarted. Evidence: `evidence/ui138-state-preservation-20261019/`.

134 archived members SHA-256 verified; failed/control results remain included.

## Partial Spaces page-state recovery by durable tab identity — October 19, 2026

Version-3 switch journals now carry source tab UUIDs. The existing session metadata acknowledgement includes those UUIDs, and two hooks in already-patched session files preserve them through session rebuild/restoration. Recovery reuses only session-restored tabs whose durable identity and URL both match the source record; missing tabs are reconstructed and staging/imposter tabs removed. The durable window UUID, restore-in-progress, live-tab/capture and completion checks remain. No form contents are extracted into the Spaces store. Versions 1/2 remain supported; only v3 can supply validated tab identities, and malformed/duplicate source identity lists fail closed.

The final binary preserves the authored surviving form and 700px scroll in a partially reconstructed source window containing a missing New Tab, an extra destination tab and a same-URL imposter with different form contents. The imposter is excluded, the missing tab reconstructed, the decoy window unchanged and the journal cleared. The journal is captured from a real switch after acknowledged metadata persistence; the partial session shape is deliberately constructed and cleanly persisted, not a claim of crashing at every staging instruction. Five malformed identity-list cases retain their exact journals/windows/store, and a legacy v2 journal with an unvalidated extra v3 field is handled by the legacy path. The grouped variant also preserves the blue collapsed group and pinned slot. Its follow-on switch exposed an order regression; a native trace showed an old pinned tab still present after asynchronous close, constraining absolute moves. Final staging uses the returned WebContents directly and orders desired tabs at the unpinned end before assigning pins/groups, while completion still waits for the exact final capture. Ordinary and grouped A/B switching pass through journal completion. Five focused capture/identity tests pass.

Three fresh immediate-crash probes on the final normal binary (ordinary restoration plus two legacy-v2 Spaces repeats) restore the expected two-window structure without timeout. All lose the edits made just before the crash, including the no-Spaces control. The original three-window immediate timeout remains unreproduced and unresolved; these observations do not establish its cause. Observed restart completion intervals are diagnostic timestamps, not latency qualification. Recovery still cannot restore document state absent from Chromium's persisted session, including removed source tabs or very recent edits. Nonowner recovery-status errors and wider lifecycle/identity corruption coverage remain open.

Build record: initial incremental compile failed on a missing WebContents forward declaration (13.08s); repaired incremental build63.18s wrapper/59.34s Siso/18steps; validation hardening incremental39.05s/35.15s/sixsteps. Final guard zero actions/4.51s. The complete build invocation table, including the ordering repair and diagnostic iteration, is recorded in the evidence README. Fresh inventory49files/116hunks within approved49/120, two additional hunks in existing paths. Temporary native ordering logs were removed before the final build. No cold output, GN/toolchain changes or native-input/latency runs. The local ESLint invocation was unavailable because this checkout lacks its eslint dependency; module syntax and focused tests passed, with CI pending. Failed fixture API/background-target and stale-marker attempts are retained, not counted as acceptance.

Native input remains pending; latency deferred; Electron diagnostic build unapproved/unstarted. Test-only crash-prompt bypass and mock keychain are confined to disposable profiles. Evidence: `evidence/ui138-partial-state-20261019/`. Plan item4 and broader Spaces acceptance remain in progress.

324 archived members SHA-256 verified. Owned profiles/servers removed; retained preview untouched/unavailable. Normal final incremental40.12s/34.55s Siso/sixsteps; temporary diagnostic38.93s and ordering attempt40.76s are also separately logged.
