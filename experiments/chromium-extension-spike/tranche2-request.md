# Tranche 2 request: the Decision 2 package, F12 first

**Status: the original tranche was approved on October 17, 2026 (§8), and
its audit and recording checkpoints have started. The corpus amendment in
§2.1 was explicitly approved on October 17, 2026 at `68892cc1` (§8.1).
The owner authorized recording approval, merging #916 once CI is green,
and resuming implementation within the amended scope. Further option C
runs remain stopped. Spike A implementation is in progress on draft #920;
the current full-uBO-corpus and update-check checkpoint is mapped below.** Task 0 measured a rebase (`rebase-ledger.md`, row 0: 2h39m47s
cold build, one broken anchor, one API change, 21 upstream files) and its
native acceptance passed except the extension version-upgrade observation,
which stays under daily check through November 3. That open gate blocks 157's
promotion to the verified baseline and the row's `passed` outcome; it does not
block the next work, which needs only the measurement. This request asks the
owner to clear the next tranche of `docs/chromium-migration-implementation-plan-2026-10-16.md`
§5 step 2: the items Decision 2 needs, with F12 blocking first.

## 1. What this tranche produces

The Decision 2 package, as the plan's §2 defines it. Each item ends in a
recorded artifact; none ends in a claim.

| # | Item | Plan reference | Artifact | Needs builds |
| --- | --- | --- | --- | --- |
| 1 | **F12 blocking spike A**: Blanc Blocker on Chromium's network stack | §3 F12 (a), §4 C | `evidence/f12-spike-a/` report with measured block rate, cosmetic coverage, patch count, decision latency | yes, incremental |
| 2 | **F12 blocking spike B**: Manifest V2 audit and uBO runtime spike | §3 F12 (b), §4 C, §7 | `evidence/f12-spike-b/` audit (every MV2 gate in the 157 checkout, with file and line) and a runtime report with patch count and block rate, or a recorded stop | yes, incremental |
| 3 | A1 patch-budget design | §4 A1 | design doc: out-of-tree layout, budget number, the measured 21-file inventory against it, CI reporting | no (the layout move itself is not in this tranche) |
| 4 | Electron-versus-Chromium visual comparison | §2 kill gate | side-by-side captures of resting, panel, palette, find and private states at the same window sizes, with a diff list | no |
| 5 | VoiceOver pass of the Island | §2 kill gate | checklist with pass/fail per control and the rotor/focus order | no |
| 6 | Staffing and CI cost sheet | §2 | one page replacing the evaluation's hypotheses with Task 0's numbers at the two-week cadence | no |

Order: 1 and 2 start first and run in parallel where the single builder
allows (one build at a time; the spikes alternate, they never overlap a build).
3 runs alongside as a document. 4, 5 and 6 fill the gaps. The tranche ends
when every row has its artifact, or when a kill criterion is hit and recorded.

### 1.1 Progress checkpoint — October 18, 2026 UTC (native/upstream delivery ordering)

This table is the live map from implementation work back to the approved plan.
The current evidence is `evidence/f12-delivery-order-20261018/`: native execution
acknowledgement and upstream API completion now join the reload drain. Four
controlled schedules pass, with timeout/retry and combined pending work observed.
The upstream diagnostic holds acknowledgement after actual API settlement; it is
not exact-document or asynchronous-effect acceptance. The 45 static schedules,
ordinary identity, CSP and readiness regressions pass. 268 tests / 139-file lint;
one 45.70-second incremental build; fresh footprint 31/74 and final zero-action guard.
Previous-head 79588947 CodeQL passed, but oauth-compatibility failed in wallpaper
smoke (private fade wait, 30 seconds). No job was rerun. This checkpoint needs its
own CI. Broader lifecycle, upstream navigation identity, other injection channels,
changed-rule and asynchronous semantics remain open.
Detailed measurements remain in `rebase-ledger.md`; test outcomes and evidence
links remain in `results.md`. A row marked in progress is not acceptance.

| Item | Status | Evidence / next gate |
| --- | --- | --- |
| 1. Spike A | **In progress** | Request-path audit, origin-preserving replay, synthetic 2,000/2,000 corpus, browser-process factory proxy, sandboxed Mojo Ghostery engine, regular/private network parity, fail-closed probes, GET redirects, dedicated workers, bounded service-worker identity, two shared-worker clients and one exact-owner teardown are measured. Current evidence is linked from `results.md`, including `evidence/f12-shared-lifecycle-20261017/`. Remaining acceptance work includes the rest of the request-path matrix, CSS/procedural cosmetics/scriptlets, the private real-page sanity sample and qualified quiet-machine latency. The final aggregate `evidence/f12-spike-a/` report is pending. |
| 2. Spike B | **In progress: full synthetic network parity** | `evidence/f12-ubo-reload-20261017/` records sandboxed component readiness, bundled-list local replacement, authored-rule blocking, acknowledged pre-reset cancellation, stale/page/popup rejection, background-target loss and independent private Blanc Blocker. Profile lifetime and empty-body response bugs were caught and repaired incrementally. No extension-core MV2 override. `evidence/f12-ubo-parity-20261017/` adds two fresh runs per runtime over 5,123 candidates plus four controls: 2,113 blocks / 3,014 allows, zero context/decision/fixture differences. `evidence/f12-ubo-cosmetics-20261017/` adds eight matching regular main-frame pages: static CSS, has-text mutations and late fetch scriptlets pass; historical document-start failure is superseded for Chromium main frames by `evidence/f12-document-gate-20261017/`: 12/12 early constant/fetch passes versus Electron 0/12, seven safety probes and 12 native-only update-loader joins. The subframe follow-up `evidence/f12-subframe-trace-20261017/` adds 16/16 early native cases and identifies two late Electron ancestor misses per session. Cross-runtime identity remains open. Broader cosmetics/scriptlets/paths, exhaustive failures/lifecycle, privilege containment and production recovery UX remain open. |
| 3. A1 patch-budget design | **Not started** | Current measured upstream footprint is 31 files / 74 hunks, including the document-start callback and local update-factory wrapper. Design artifact remains required. |
| 4. Visual comparison | **Not started** | Fixed-size Electron/Chromium capture matrix remains required. |
| 5. VoiceOver pass | **Not started** | Island rotor, labels, order and Escape focus-return checklist remains required. |
| 6. Cost sheet | **Not started** | Task 0 clean recovery, fortnightly maintenance and extension-release wait must remain three separate lines. |

Current follow-up: six logger/noscript/picker completion schedules and two
post-execution navigation identity schedules pass. Same-URL and same-origin
cross-path navigation retain the old lease until its real completion. Exact
pre-dispatch document targeting, broader lifecycle/async effects and other
injection channels remain gaps. See `evidence/f12-helper-channels-20261018/`.
Spikes A/B remain in progress; items 3–6 not started. Latency deferred; Electron
diagnostic build §8 unchecked/unstarted. No promotion or gate closure.
