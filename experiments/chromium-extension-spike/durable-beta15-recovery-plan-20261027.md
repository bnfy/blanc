> Current outcome October28: baseline and UI native acceptance complete; finalguard0. See [affected evidence](evidence/blocker-recovery-ui-20261027/README.md). Earlier pending/draft entries below are historical. Signed qualification remains pending; no gate credit.

> Fresh staged dry run: **57,677 scheduled actions; 47,083 clang compile commands; zero pending buildflag generators.** Normal large-build guard refused compilation. 121 metadata targets completed separately. Final inventory passes77/186,151clean dependencies; all published patch hashes match. 354 GiB free; proposed8workers. This replaces historical estimates, not a build authorization.

# Durable .15 workspace recovery and rebuild plan

Prepared October 27, 2026 for PR #1028. **Plan only: no source staging, GN generation, dependency fetch or compilation has started.** This does not authorize a large-build exception.

## Scope and expected work

Restore Chromium **157.0.8103.15**, upstream `1aa07b638799e59656559ae6c6649d4b197f555e`, with the published Blanc integration at `e3724d7212e5332ab47a0b94af5c5210cf5cd981` (native fix source `3d5d46a`). Restore the baseline first; implement recovery UI afterward as a separate incremental delta. Do not combine unreviewed recovery changes into the initial recovery build.

| Item | Verified input / expected scope |
| --- | --- |
| Preserved seed | `/Users/anthonyjloria/Projects/BlancChromium157`, upstream .6 `41520584daa68d0040db7746ae562a0ff82187f6`; .15 Git object absent |
| Seed output | 8.1 GB in `src/out/BlancPrototype`; reuse only matching cache records, not as proof of .15 |
| Available storage | 361 GiB available at observation; recheck before staging/build. Clone-on-write saves initial space but rebuilt files consume real space |
| Target footprint | Published .15 inventory: 77 existing upstream files/186 hunks; 151 clean Git dependencies. Verify again after reconstruction |
| Compiler/SDK | Existing clang revision `llvmorg-24-init-7747-g62397f8b-67`; Xcode27.1/27A9275, SDK27.0/26A425. No version changes |
| GN args | Release ARM64, non-component, symbol_level0; SHA256 `414e3baad6c84730b3c17f411ed82c5065561ba344fe2a202675654e1e18a057` |
| Expected build size | **Large recovery**, historical plans43,586–53,938 scheduled actions; later plan44,672C++commands. These are comparison points, not a fresh count or ceiling |
| Time planning | Comparable previous .15 update took2h49m accumulated build time; the later missing-input recovery took roughly3h55m across attempts. Reserve a multi-hour build window; no fixed ETA |
| Concurrency | Start with8local workers, following the previous memory-pressure correction. Pause gracefully if actual pressure warrants; resume same cache |
| Native UI follow-up | Expected edits limited to blocker health API, trusted Island/native dialog integration and applicable UI assets; count/guard this delta separately |

## Permanent layout

- Working repo and restart handoff: current `Chromium Preview/repo` and `CONTINUATION.md`.
- New native checkout/cache: `/Users/anthonyjloria/Projects/BlancChromium157Recovery/src`, output `out/BlancPrototype`. Use local Projects storage; file-provider metadata already broke strict app signature verification in Documents.
- Build logs and raw plans: `/Users/anthonyjloria/Projects/BlancChromium157Recovery/records/20261027`. Mirror small summaries into the durable handoff; no sole copies in /private/tmp.
- Signed master/recovery archive: `/Users/anthonyjloria/Projects/BlancPreviewArtifacts`. Preserve recovered signed app and ZIP before all new work.
- Signing access: permanent `Chromium Preview/signing`,0700directory/0600private key; never Git-track it.

## Phase 1 — stage and produce the exact dry plan (no compilation)

1. Record process inventory without secret-bearing arguments; refuse a competing build. Record original .6 HEAD, args, toolchain metadata, selected source/output digests and original profiles' paths without reading/copying their contents. Record current free space.
2. Create an APFS copy-on-write clone of the original .6 workspace, including its warm output, into the new Projects path. Refuse an existing destination. Ensure nested Git metadata and symlinks are independent where required. No reset, clean or write in the original workspace. If clone/reflink support fails or materializes an unexpectedly large copy, stop and show the storage impact.
3. In the copy only, fetch the exact official Chromium .15 commit and required exact dependency revisions. Reconstruct from the published source-materials/dependency manifests and the reviewed .15 preparation scripts. Restore missing tracked/package/generated inputs from exact pins; verify hashes. Do not run hooks, automatic depot_tools update, SDK/compiler updates or third-party mirrors. Every failure and restoration gets its own log.
4. Reapply published Blanc preparation and verify the resulting native source against published patch/owned-source manifests. Expected77/186and151clean dependencies. Any drift stops the operation for review. No claimed .15 build from old .6 binaries.
5. Relocate copied Siso metadata using the recorded supported export/import procedure, retaining command hashes/digests. Path changes may invalidate entries. Do not delete cache or falsify timestamps to force reuse. Verify package/generated inputs upfront, especially Go and Skia/GPU revision headers that failed in the previous recovery.
6. Compare actual compiler/SDK/args with the pinned record; account for the checkout path in clang's InstalledDir without ignoring version/content differences. If a genuine mismatch exists, stop before generation.
7. Review GN regeneration with unchanged arguments. Generate only required metadata after review; list buildflag generators separately because they can expose additional compilation. Run normal `build.mjs <new-src> --check` and retain its full plan. The1000-action guard is expected to refuse; do not pass --allow-large-build or start compilation here.
8. Present exact scheduled actions, C++commands, buildflags/other generators, cache reuse limitations, disk headroom and proposed worker count. **Compilation requires explicit owner approval of this newly measured plan.** Prior recovery exceptions do not transfer automatically.

## Phase 2 — single approved recovery build

After approval only, run the reviewed build wrapper in the durable checkout with the explicit large-build exception and8local workers. Preserve full logs and successful-build input record. Resume the same cache after narrowly diagnosed missing-input failures, recording failures separately; no clean/new cold output. A changed compiler/SDK/args or unexpected expansion requires a new review. Finish with the normal zero-action guard and final native source/dependency inventory.

Baseline acceptance is artifact identity, correct .15 version, source/material binding, successful build and zero-action guard. Existing signed candidate remains the accepted reference; reconstructed output does not inherit its signature or blanket runtime approval. No unrelated full suite or Electron build.

## Phase 3 — recovery UI incremental delta

Implement the [reviewed recovery design](blocker-recovery-design-20261027.md): browser-owned read-only health, persistent unavailable indication, accessible native Quit/Keep-open recovery, normal quit/veto/session-save flow. Requests stay blocked until a fresh authenticated engine is ready. No live boolean-reset shortcut; live Retry requires generation-owned callbacks and a separate review. Verify native dialog ownership and Island geometry before relying on a DOM banner.

Review source delta and incremental dry plan; normal1000-action guard applies. Run only new affected regular/private controls: healthy blocking, owned utility failure, visible/accessibility recovery state, no-arrival refusal, cancel/veto behavior and successful normal quit/reopen recovery. Preserve initial failures. Then package/sign/notarize the changed candidate and run affected checks once on final signed bytes. Reuse unchanged controls/owner acceptance via explicit mapping; no repeat corpus, socket/stress/distribution walkthrough unless affected.

## Boundaries and restart discipline

Original .6 source/output, shipping app/profiles/tabs, Google upgrade baseline and recovered signed masters are preserved. No permanent profile copy or Google fixture action. Electron paused and latency deferred. No merge/release or automatic gate closure.

Before ending each work session, write active command/PID/log, exact source/artifact identities and remaining step into the durable handoff. After restart inspect processes before resuming; processes do not survive a reboot, but the durable cache and records should. Publish only scoped source/evidence when authorized. Keep all local signing material and large build artifacts outside Git.

## Recovery baseline complete; recovery UI incremental started
October28 03:25 UTC: approved baseline succeeded,57677steps in3h5m34.66s; normal check passed0actions. Logs records/20261027/recovery-build.log and recovery-zero-action-check.log. Reviewed repository-only UI draft copied selectively into four owned native source/header files; generated host.js refreshed without full prepare. Normal dry plan19actions passed. Incremental build launched8workers, exec3313, log records/20261027/blocker-ui-incremental-build.log. Inspect before continuing; no competing build. Runtime/quit-veto/private checks not yet run; no signing/gate credit.
