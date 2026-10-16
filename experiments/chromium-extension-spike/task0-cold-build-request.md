# Task 0 cold-build approval request

**Status: awaiting the owner's written approval. Nothing has been fetched,
generated or built.** This request exists because
`docs/chromium-migration-implementation-plan-2026-10-16.md` §6 proposes a
measured rebase of the prototype patch set onto the next Chromium major, and
that task needs one cold build, which the build-cache rule in `AGENTS.md`
makes a separately approved event. Approving PR #868 did not approve this.

Fields marked **to measure** are filled by Codex on the Mac before the request
is submitted; the Linux session that drafted this cannot read the Mac's disk
or reach `chromium.googlesource.com` and `chromiumdash.appspot.com`.

## 1. Target tag

| | |
| --- | --- |
| Current pin | `156.0.8078.36`, commit `5a93aa59e3043e747eff68659dcf7d20193d160e` |
| Proposed target | **`157.0.8103.6`**, the build Google promoted to the Chrome Beta channel for Windows, Mac and Linux on October 16, 2026 ([Chrome Releases post](https://chromereleases.googleblog.com/2026/10/chrome-beta-for-desktop-update_02089051700.html)). Chromium stable on Mac is still `155.0.8059.40` (October 6); 157 stable is scheduled for November 3 per [Chrome Platform Status](https://chromestatus.com/release-notes/157), a date to confirm on the Chrome Releases blog. |
| Why beta, not stable | A fork has to rebase at the branch point or early beta to ship a security-current build on stable day; measuring against the first 157 beta tag is the realistic case, and 157 stable will not exist for about three weeks. If 157 reaches stable before approval arrives, substitute the first 157 stable tag and note it in the ledger. |
| **To measure** | Confirm the tag exists before fetching: `git ls-remote --tags https://chromium.googlesource.com/chromium/src refs/tags/157.0.8103.6`. If a later `157.0.81xx.y` beta has been tagged by then, prefer the newest beta tag and record it here. |
| Aside for the cadence estimate | Chrome Enterprise's release notes say Chrome Stable is moving to a two-week release cycle ([Chrome Enterprise release notes](https://chromeenterprise.google/resources/release-notes/)); when and whether that applies to Chromium majors is unconfirmed, but it bears directly on the four-weekly cadence the evaluation doc assumed and the ledger should record which cadence was in force. |

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

| Item | Estimate | **To measure** |
| --- | --- | --- |
| Existing checkout, for reference | — | `du -sh /Users/anthonyjloria/Projects/BlancChromium` |
| Existing output, for reference | — | `du -sh /Users/anthonyjloria/Projects/BlancChromium/src/out/BlancPrototype` |
| New checkout with full history | about the same as the existing checkout | measured value above |
| New checkout, shallow (`fetch --no-history`, then `git fetch --depth 1 origin refs/tags/157.0.8103.6`) | roughly 20–25 GB less than full history | — |
| New output, `is_debug=false is_component_build=false symbol_level=0` | about the same as the existing output | measured value above |
| Free space required before starting | sum of the two new items plus 20% headroom | `df -h /Users/anthonyjloria/Projects` |

Recommendation: the shallow checkout. Task 0 needs one tag, not history,
and `prepare.mjs` reads files, not git. If the measured free space cannot
hold even the shallow estimate, the request is withdrawn until space is
made; nothing in the existing checkout is deleted to make room.

## 4. Expected duration

| Stage | Estimate | Basis |
| --- | --- | --- |
| Fetch and one-time hooks | 30–90 min | network-bound; no prior measurement on this machine is recorded |
| `prepare.mjs` anchor fixes | unknown; this is what Task 0 measures | 20 anchored upstream files today |
| `gn gen` | minutes | — |
| `--record-environment`, `--check` | minutes; `--check` stops on the large plan by design, or on a buildflag-generation stop handled per the README | — |
| Cold build, `chrome` target | **about 2.5–3.5 h** | the focused UI cold build took 2h20m for 40,298 actions and the following `chrome` target 8m6s for 2,721 more, on this machine with Xcode 27.1; a cold build from a fresh checkout has no cache to prune and may run somewhat longer |
| Compile-error fixes and incremental rebuilds | unknown; measured | recent small rebuilds 32–60 s, earlier native fixes 1m49s–8m6s |
| Re-verification (automated checks and native-input checklist) | 1–2 h | the October 16 milestone retests |

Total: half a working day of machine time plus an unknown amount of
patch-fixing attention. The Mac should not be needed for another build
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
build (a failed or interrupted one is reported, not retried, until the owner
says so), any build for Windows or Linux, or any change to shipping Blanc.

## 6. Deliverables

A dated section in `results.md` and the first row of a new
`experiments/chromium-extension-spike/rebase-ledger.md` with: upstream tag
and commit, measured free space before and after, fetch time, anchors
broken (file, hunk, cause, minutes), files patched before and after, `gn`
and plan outcomes, cold-build wall-clock and action count, compile errors
and their fixes, re-verification results, owner attention time and agent
time. If criterion 1 of the plan's §5 is hit (more than two owner-days of
attention or more than one calendar week including builds), the ledger says
so and the task stops there.

## 7. Approval

Owner's written approval, with the measured fields above filled in, is
recorded here before any command in §5 runs:

- [ ] Target tag confirmed to exist: `_______`
- [ ] Free space measured: `_______` against a shallow estimate of `_______`
- [ ] Approved by the owner on `_______` (quote or link)
