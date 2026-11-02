# Task 0 cold-build approval request

**Status: approved by the owner on October 16, 2026 (§7). The build has
not started; Codex runs it on the Mac within the §5 scope and fills
`rebase-ledger.md` row 0.** This request exists because
`docs/chromium-migration-implementation-plan-2026-10-16.md` §6 proposes a
measured rebase of the prototype patch set onto the next Chromium major, and
that task needs one cold build, which the build-cache rule in `AGENTS.md`
makes a separately approved event. Approving PR #868 did not approve this.

The measured fields (tag commit, disk) were filled by Codex on the Mac on
October 16; the Linux session that drafted this cannot read the Mac's disk or
reach `chromium.googlesource.com` and `chromiumdash.appspot.com`.

## 1. Target tag

| | |
| --- | --- |
| Current pin | `156.0.8078.36`, commit `5a93aa59e3043e747eff68659dcf7d20193d160e` |
| Proposed target | **`157.0.8103.6`**, the build Google promoted to the Chrome Beta channel for Windows, Mac and Linux on October 16, 2026 ([Chrome Releases post](https://chromereleases.googleblog.com/2026/10/chrome-beta-for-desktop-update_02089051700.html)). Chromium stable on Mac is still `155.0.8059.40` (October 6); 157 stable is scheduled for November 3 per [Chrome Platform Status](https://chromestatus.com/release-notes/157), a date to confirm on the Chrome Releases blog. |
| Why beta, not stable | A fork has to rebase at the branch point or early beta to ship a security-current build on stable day; measuring against the first 157 beta tag is the realistic case, and 157 stable will not exist for about three weeks. If 157 reaches stable before approval arrives, substitute the first 157 stable tag and note it in the ledger. |
| Tag confirmed | Codex confirmed on October 16 that `157.0.8103.6` exists upstream at commit `41520584daa68d0040db7746ae562a0ff82187f6`. If a later `157.0.81xx.y` beta is tagged before the fetch, prefer the newest beta tag and record it here. |
| Cadence this measures against | Chrome milestones ship every **two weeks** starting with Chrome 153 ([Google's announcement](https://developer.chrome.com/blog/chrome-two-week-start)). The evaluation doc's four-weekly assumption is out of date: a fork rebases onto a new major twice as often as that doc priced, and Task 0's ledger entry is the first data point at the real cadence. |

## 2. Paths

Everything new lives in a sibling directory. The existing checkout, output,
Siso cache, GN arguments and toolchain are never opened for writing.

| | |
| --- | --- |
| Existing checkout (read-only for this task) | `/Users/anthonyjloria/Projects/BlancChromium/src` |
| Existing output (never touched) | `/Users/anthonyjloria/Projects/BlancChromium/src/out/BlancPrototype` |
| New gclient root | `/Users/anthonyjloria/Projects/BlancChromium157/` |
| New checkout | `/Users/anthonyjloria/Projects/BlancChromium157/src` |
| New output (fixed by `build.mjs` to `<src>/out/BlancPrototype`) | `/Users/anthonyjloria/Projects/BlancChromium157/src/out/BlancPrototype` |
| Test profile | a fresh disposable `--user-data-dir`, never the permanent prototype profile |
| Assets | `prepare.mjs` run against the new checkout only; `generated/` is regenerated from the same Blanc sources |

The new gclient root has its own `.gclient`, so `gclient sync` and the
one-time setup hooks there cannot reach the existing checkout.

## 3. Disk estimate

Measured by Codex on the Mac on October 16:

| Item | Measured or estimated |
| --- | --- |
| Free space on the volume | **480.7 GiB** |
| Existing checkout, `/Users/anthonyjloria/Projects/BlancChromium`, total | **42.3 GiB**, of which `out/BlancPrototype` is **9.0 GiB** (so sources, `.git`, toolchain and third-party fetches are about 33.3 GiB); the checkout is already shallow |
| New checkout at `157.0.8103.6`, shallow like the existing one | about **33 GiB** (same shape as the existing sources) |
| New output, `is_debug=false is_component_build=false symbol_level=0` | about **9 GiB** |
| New total | about **42 GiB**; about 51 GiB with 20% headroom, against 480.7 GiB free |

Disk is not a constraint. The new checkout is made the same way as the
existing one (shallow); no extra history-trimming step is claimed or
needed. Nothing in the existing checkout is deleted or moved.

## 4. Expected duration

| Stage | Estimate | Basis |
| --- | --- | --- |
| Fetch and one-time hooks | 30–90 min | network-bound; about 33 GiB of sources and toolchain; no prior measurement on this machine is recorded |
| `prepare.mjs` anchor fixes | unknown; this is what Task 0 measures | 20 anchored upstream files today |
| `gn gen` | minutes | — |
| `--record-environment`, `--check` | minutes; `--check` stops on the large plan by design, or on a buildflag-generation stop handled per the README | — |
| Cold build, `chrome` target | **about 2.5–3.5 h (provisional)** | the focused UI cold build took 2h20m for 40,298 actions and the following `chrome` target 8m6s for 2,721 more, on this machine with Xcode 27.1. This build is cold because it starts from an empty output directory with no configured compilation cache, not because a new major necessarily invalidates everything; how much a configured cache or unchanged inputs would reuse across 156 → 157 is unmeasured |
| Compile-error fixes and incremental rebuilds | unknown; measured | recent small rebuilds 32–60 s, earlier native fixes 1m49s–8m6s |
| Re-verification (automated checks and native-input checklist) | 1–2 h | the October 16 milestone retests |

Total: the stated stages come to about **4–7 hours** of machine time plus
an unknown amount of patch-fixing attention, which is the quantity Task 0
exists to measure. The Mac should not be needed for another build
during the cold build (one builder at a time), and the build should run
foreground in a visible Terminal, as other long operations do.

## 5. What approval covers, and what it does not

Approval covers exactly: the fetch into the sibling root, the one-time hooks
there, `gn gen` there with the existing arguments, the environment recording,
the plan inspection, and one `build.mjs <new-src> --build --allow-large-build`
against the saved plan, followed by ordinary guarded incremental rebuilds in
the new output only.

It does not cover: touching `/Users/anthonyjloria/Projects/BlancChromium` in
any way, changing Xcode or depot_tools, changing `args.gn`, a second cold
output directory, any build for Windows or Linux, or any change to shipping
Blanc.

Interrupted or failed builds: resuming the **same** cold build in the same
output directory, with its Siso cache and completed actions intact, stays
within this approval (that is an incremental continuation, and the guard's
plan check applies to it like any other build; if the inspected plan still
shows more than 1,000 remaining actions, the continuation runs with
`--allow-large-build` under this same approval). Deleting or recreating
`BlancChromium157/src/out/BlancPrototype`, or starting a cold build in any
other output directory, is a new cold build and needs a separate approval.
An interruption is recorded in the ledger either way.

## 6. Deliverables

A dated section in `results.md` and the first row of a new
`experiments/chromium-extension-spike/rebase-ledger.md` with: upstream tag
and commit, measured free space before and after, fetch time, anchors
broken (file, hunk, cause, minutes), files patched before and after, `gn`
and plan outcomes, cold-build wall-clock and action count **recorded as
their own column**, compile errors and their fixes, re-verification
results, owner attention time and agent time. The cold-build column is a
clean-build recovery benchmark; the routine per-milestone rebase cost is
the patching, compiling-incrementally and testing columns, and the ledger
must not fold the two together. If criterion 1 of the plan's §5 is hit (more than two owner-days of
attention or more than one calendar week including builds), the ledger says
so and the task stops there.

## 7. Approval

Owner's written approval, with the measured fields above filled in, is
recorded here before any command in §5 runs:

- [x] Target tag confirmed to exist: `157.0.8103.6` at
      `41520584daa68d0040db7746ae562a0ff82187f6` (Codex, October 16)
- [x] Free space measured: 480.7 GiB against an estimate of about 42 GiB
      (Codex, October 16)
- [x] Approved by the owner on October 16, 2026, in the Claude Code
      session after reviewing the measured request at `ea352cc` (merged as
      #870): "Approve the Task 0 cold build". The approval covers exactly
      the §5 scope: the sibling checkout at `157.0.8103.6`, one cold build
      in `BlancChromium157/src/out/BlancPrototype` with cached continuation
      of that same build, and ordinary guarded incremental rebuilds there.
      Any other cold output, toolchain or `args.gn` change, or touch of the
      existing checkout needs a new approval.
