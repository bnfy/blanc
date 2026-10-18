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
