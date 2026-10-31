# Blanc Chromium replacement

Execution contract: [approved specification](../docs/chromium-replacement/2026-10-30-desktop-replacement-spec.md) and [plan](../docs/chromium-replacement/2026-10-30-desktop-replacement-plan.md) at `e884a6564411dfddc99dc55bd1f3aaa28d78430c`.

The owner authorized F0.1–F0.6 and F0.8, including incremental builds necessary for those tasks. D7 is not approved. F0.7, cold builds, new Windows/Linux/Intel machines, D1–D6, D8 and V2 require separate scoped approval. Preserve shipping behavior until a divergence is approved. Electron product work is paused; latency deferred; Google baseline separate.

## Working rules

- Canonical integration source belongs here. The spike is historical: add no source or evidence under `experiments/chromium-extension-spike/`.
- Select and integrate one source generation per feature; record its provenance in Git. Existing drafts and raw evidence remain preserved until an approved archive operation.
- One current candidate per platform, with at most two features in progress. Preserve the owner's running browser; use isolated test profiles.
- Preserve the existing output, caches, SDK/compiler and GN arguments. Inspect processes and dry-run scope before a build. No competing builds or cold output.
- Tests are evidence. Retain raw results durably outside Git; generate one report per slice/platform. Reuse applicable passed checks.
- Keep profiles, credentials, keys, caches and application binaries out of Git.
- Update STATUS.md in place. Historical status remains in Git. Progress claims require scenario-to-row and candidate/platform bindings.

## Foundation

The existing Chromium 158 checkout and output remain the working cache. Creating this directory does not establish that its source matches the running development app. Source reconciliation precedes patch conversion and compilation. The running development app, original output and paused overlays have different identities.

Use `python3 chromium/tools/inventory.py --src /path/to/Chromium/src --output /durable/local/inventory.json` for a read-only reconciliation against the existing 158 rebase manifest. The report contains paths relative to Chromium, hashes and counts; it excludes profile contents, credentials and binary payloads. This is inventory, not acceptance.

## Generated progress

`node chromium/tools/progress.mjs` renders both bars from tracker.json into the marked STATUS block. Never edit that block by hand. The build wrapper refreshes candidate identity and both bars automatically after successful compilation. At every slice boundary run `node chromium/tools/progress.mjs --slice-boundary=F0` (substitute the actual slice), then `node chromium/tools/progress.mjs --check`. The check fails on stale displays. Bar A remains Not run until a matching candidate/platform/shipping baseline is present; changing candidates invalidates prior baseline credit. Bar B keeps macOS, Windows and Linux separate and labels legacy stages explicitly.

## Source application and checks

`python3 chromium/tools/check-patches.py` reconstructs the selected source from 79 pinned upstream inputs and verifies every resulting digest. `python3 chromium/tools/apply.py --src /existing/checkout` checks a matching checkout; `--apply --backup /durable/local/backup` applies only to pristine or already-matching files and rejects unknown local edits. Reconcile unknown source rather than overwriting it. One-time migration scripts and original import copies remain in the durable local foundation evidence, not the active tools directory.

The foundation selection excludes the journaled, unbuilt Glance/language overlay, preserving it locally. New custom source is canonical under `blanc/`; the browser-owned UI template target respects upstream visibility while the entry build group is `//blanc`. Read THIRD_PARTY_NOTICES.md for upstream source licensing.

## Slice chat handoff

After the F0.5 baseline, prepare a concise handoff pointing to the approved plan/spec, STATUS.md, tracker.json, the code commit and any live process handles. Use a fresh chat at slice boundaries when the owner requests it. Do not copy the long conversation or historical continuation into the new handoff. Bar A uses the generated executable-case total (627 from 578 declarations at this reference), with explicit exclusions remaining visible in that total.

## F0.5 runner

`node chromium/tools/scenario-inventory.cjs --check` validates the pinned shipping corpus, including backgrounds and all outline examples. `node chromium/tests/runner.mjs /durable/local/runtime-config.json /durable/local/baseline-output` evaluates every declaration/case, launches a fresh isolated native profile for cases with complete step adapters, and writes JSON plus JUnit. Undefined adapters remain explicit; they are not product failures, exclusions or passes. A declaration passes only if all its executable examples pass. The initial step library is incomplete: the first baseline measures both its known behavior and its unresolved adapters; it does not complete full product parity or F0.5 by itself.

Preview test code is guarded by ENABLE_BLANC_TEST_HOOKS, disabled for release or official builds. A preview without `--blanc-test` explicitly denies dispatch. Requests bind to the exact native Island host and production policy paths, cache replies for bounded replay, and reject changed payloads under reused IDs. `check-hook-gates.py` tests conditional preprocessing; actual release-image qualification remains a later gate.

## Island assets

The Island, overlay, Start Page and settings assets the candidate serves with `--blanc-prototype-assets` are canonical here: fork files in `blanc/island/`, shipping files listed by path at the pinned shipping commit in `blanc/island-assets.json`, whose `manifest` is the SHA-256 of every served file. `node chromium/tools/assets.mjs --check` proves the tree reproduces it; `--out=/durable/dir` assembles a served folder. Change assets here, update the manifest in the same commit, and serve the assembled folder; never edit an artifacts folder in place. Compiling them into the resource pak (F0.6) builds on this.
