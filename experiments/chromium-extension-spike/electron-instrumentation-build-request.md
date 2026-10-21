# Electron update-identity diagnostic build request

**Draft — awaiting separate owner approval in §8.** October 17, 2026.
Drafting/merging this document does not authorize fetching a build checkout,
running setup hooks, installing tools or compiling. No Electron checkout/output
has been created for this proposal. Only small public source references and
read-only machine measurements were collected.

## 1. Question and deliverable

Can the real Electron blocker hook be joined independently to the registration
and **old checked version** of an actual service-script update, including a
same-URL collision and unchanged bytes with no new execution realm?

Implement the opt-in instrumentation described in
[electron-update-instrumentation.md](electron-update-instrumentation.md), build
one disposable Electron runtime, and run the existing collision/update fixtures
against stock and instrumented Electron plus the existing Chromium157 prototype.
An unresolved token, mismatched profile/version or observer loss stays a gap.
This is diagnostic evidence, not shipping Electron changes, MV2 release approval,
full worker acceptance, latency qualification or Chromium baseline promotion.

## 2. Exact source and proposed locations

- Electron tag **v44.8.0**, peeled commit
  `60169b45c12488c6fda237af7f6425526a7ce5f0`, tag object
  `9d3201f397dbb80549c888ec43d34125fab86870`; confirmed with official remote
  `git ls-remote` October 17. Reconfirm before fetch; no moving branch substitute.
- Its DEPS pins Chromium **152.0.7977.167**, Node **v24.22.0**. Sync exactly this
  Electron DEPS and apply its patch queue before measuring the diagnostic delta.
- New isolated root: `/Users/anthonyjloria/Projects/BlancElectron4480Diagnostic/`
  (absent at inspection); sources `<root>/src/`, Electron `<root>/src/electron/`.
- Sole new cold output: `<root>/src/out/BlancElectronDiagnostic/`.
- Checkout-local tools/cache: `<root>/tools/`, `<root>/git-cache/`. Do not write
  shared depot_tools, Chromium156/157 sources, outputs, caches or toolchains.
- Profiles and fixture CAs: fresh owner-only ephemeral directories created by
  the existing harness under `/private/tmp`; remove after each run. Never launch
  with the real Blanc profile or replace `/Applications/Blanc.app`.
- Evidence and diagnostic patch files live under this experiment directory on
  the prototype branch. Root app sources and packaged runtime remain unchanged.

## 3. Machine, disk and time

Read-only measurements on this Mac: **Mac16,10, arm64, 10 physical/logical CPUs,
24 GiB RAM**; selected Xcode **27.1 (27A9275)** at
`/Applications/Xcode.app/Contents/Developer`. `df -k` reported **420,000,000 KiB
available (400.5 GiB)**. Current 157 output is **8,440,388 KiB (8.05 GiB)**;
that is not an Electron output estimate.

| Stage | Planning allowance, not a measurement |
| --- | --- |
| Fresh source/dependency fetch, isolated cache/tools, hooks | 1–3 hours; 70–120 GiB disk |
| Testing-config output and temporary link overhead | 40–100 GiB disk |
| Cold Electron target | **4–8 hours** provisional; no Electron build has been timed on this Mac |
| Instrumentation port/compile repair | Unknown; record separately |
| Cached incremental rebuild and runtime verification | 1–2 hours provisional, excluding unknown repairs |

Budget **up to 220 GiB** for the new root, leaving at least **100 GiB** free.
Both are hard stop conditions, not an invitation to delete existing data. Refresh
free space at fetch start, after sync and before linking; monitor during build.
If the estimate does not fit, stop and revise the proposal. Disk totals include
cache/output once, not twice. A fresh tree can exceed these estimates.

The measured Chromium157 clean-build benchmark was 2h39m47s accumulated, including
its mixed repair/unfinished-cold continuation. Electron's config/target differs;
that number is only a reference and does not establish this estimate. This build
is cold because its approved output starts empty, not because a version change
has been proven to invalidate every cached action. Record fetch, hooks, patch
work, cold compilation, cached repairs, tests and owner attention separately.

## 4. Configuration and prerequisite stops

Use the pinned [`testing.gn`](https://github.com/electron/electron/blob/v44.8.0/build/args/testing.gn)
configuration, with native arm64 target and local execution. Proposed args:

```gn
import("//electron/build/args/testing.gn")
target_cpu = "arm64"
```

At this pin the testing config is release-mode (`is_debug=false`), non-component
except FFmpeg, non-official, with DCHECKs on and symbol level 1. Do not substitute
release/debug/component settings mid-build to rescue timing. Resolve and record
all inherited args and prove remote execution disabled before compiling; any
needed additional argument requires a reviewed update before freezing the args.
No paid/remote build service, global tool installation or automatic bootstrap.

Pinned macOS instructions require Python ≥3.9 and Node ≥22.18.0. The inspected
shell has Python3.9.6, Node20.19.0 through nvm and Node22.14.0 at
`/usr/local/bin/node`; neither inspected Node meets that minimum. Approval
would include a separately installed, checksum-verified Node24.22.0 under the
new root only, with its own PATH. Use an isolated depot_tools checkout at inspected revision
`382c208a9973e1a6c0867b6d8664dc6dc9116e30`, with auto-update disabled;
verify that exact revision before sync. If that revision,
selected Xcode/SDK or Rosetta availability cannot satisfy the pinned build,
stop. Do not upgrade Xcode, shared depot_tools, system packages or Rosetta under
this request. The DEPS-pinned Clang may be fetched into the new root only.

Sources: [pinned GN instructions](https://github.com/electron/electron/blob/v44.8.0/docs/development/build-instructions-gn.md)
and [pinned macOS prerequisites](https://github.com/electron/electron/blob/v44.8.0/docs/development/build-instructions-macos.md).
No `e init --bootstrap`: it would couple preparation and compilation.

## 5. Bounded execution, only after §8

1. Reconfirm tag, paths, free space, machine and no competing fetch/build. Start
   invocation and attention logs. Create only the new root and pinned local tools.
2. Configure gclient with Electron as the unmanaged `src/electron` solution and
   pin its revision **before** sync. Inspect its hooks first; run setup hooks once
   inside this root. Record DEPS, actual dependency HEADs, tool hashes and hooks.
   Do not follow the documentation's moving-main example or share writable cache.
3. Audit the **applied** Electron Chromium patch queue. Add the browser-owned
   factory wrapper/token mapping and the narrowly gated Electron details export;
   verify existing DevTools IDs, profile lifetime, exact joins and no HTTP header
   injection. Count added upstream files/hunks against the applied Electron base,
   separately from the Chromium157 patch budget. Record GN dependency changes.
4. Implement/test an **Electron-specific build guard** before compiling. The
   current `build.mjs` hardcodes Chromium's `chrome` target and `out/BlancPrototype`;
   do not repoint it or pretend it guards this target. The new guard must pin the
   new root/output/`electron` target, args and tool environment, lock the output,
   reject competing builds, stream a parseable dry plan, stop on regeneration or
   hidden buildflag generation, and log every invocation/result. After patching,
   generate GN, record environment, inspect the complete cold plan and compare
   it with this proposal. Unknown plans/tool changes stop; no blind raw build.
5. Run **one** approved cold output's `electron` target locally. Proposed initial
   worker cap: six on this 24-GiB Mac; reducing concurrency preserves the output
   and is allowed, changing GN args is not. Stop on resource exhaustion, disk
   thresholds or **eight hours of accumulated compilation** and report before
   extending the time budget. Do not pause system processes or prompt for admin.
6. Cache-preserving continuation of this same build and guarded incremental
   repairs in this same output are within the proposed scope. Incremental plans
   above 1,000 actions or an unparseable plan stop for review; never clean/recreate
   the output to get past the guard. No second cold output is authorized.
7. Run sandboxed disposable tests; remove profiles/CAs, retain measured evidence,
   and leave existing applications/profiles alone. No release/signing/notarization,
   autoupdate feed, publishing, deployment, shipping branch change or merge.

## 6. Acceptance and evidence

- Exact independent browser-metadata ↔ actual Electron hook token joins for
  changed/unchanged main and imported scripts, two same-URL registrations,
  regular/private, with old checked version distinct from a new execution realm.
- Missing/duplicate/reused token, wrong profile/scope/version, existing DevTools
  ID, aborted/failed load and teardown rejection. Redirect/304/cache/retry gaps
  explicitly recorded if unclosed; no URL/time/order substitute.
- Stock/instrumented behavior comparison, unchanged provider decisions and
  no diagnostic headers/extra requests. Other observer routes explicitly audited.
- Source pins and applied patches, GN args, environment guard, action count,
  invocation logs and cache continuations, separate cold/incremental timings,
  peak disk, cleanup and evidence digests. No quiet-machine latency claim.

## 7. Limits and rollback

Existing156/157 and installed Electron builds remain the rollback. Nothing is
copied into them. Preserve the diagnostic output on failure; report the concrete
error and estimate before extending scope. Any second output, changed source
pin/configuration, Xcode/system change or release action needs separate approval.
This diagnostic approval would not change tranche2's implementation time boxes,
40-file/120-hunk Chromium budget, kill criteria, deferred latency or full gates.

## 8. Separate owner approval — not granted

- [ ] Owner explicitly approves this document at reviewed commit `________`,
      on `________`, exact words `________`.
- [ ] Approval covers the one new root/output, pinned source, proposed config,
      isolated prerequisites and §5's resource/time/continuation limits only.

Until the owner supplies that approval, the proposal remains documentation only.
