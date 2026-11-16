> Signed follow-up: [replacement acceptance](../f12-navigation-signed-20261026/README.md) now qualifies these20affected navigation checks on sourceefb1b511. The pending-signing language below is the retained native checkpoint, superseded only for this bounded path.

# F12 separate navigation factory — October 26

## Finding and narrow repair

The prior final-loader repair covered `url_loader_factory::CreateInternal`, but `NavigationURLLoaderImpl::CreateNetworkLoaderFactory` assembles a network factory directly. Removing the old outer Chrome hook left this separate path without pre-network admission. Its existing response-stage check is too late to prevent a blocked subframe reaching the network.

The signed source1523375 baseline reproduces this in regular and private contexts: both blocked subframe requests reach the loopback server, and native request-decision joins are absent. The baseline completes14assertions:8pass/6fail. Failures and traces are retained under `before/`; none count as passes.

`prepare_final_factory.mjs` now adds the existing finalizer after navigation DevTools assembly and before network-factory construction. This reuses the content-owned callback, real BrowserContext/current frame and kNavigation type; it adds no Chrome dependency, alternate engine, new decision policy, CORS/cookie override or earlier duplicate gate. The single upstream delta is `navigation.patch`. The prepare test checks ordering/idempotence and refuses changed navigation anchors.

## Affected evidence only

The repaired native output passes20assertions across regular/private contexts:

- Allowed subframe reaches the server and has one exact CDP-request-digest→native allow decision with the correct private bit.
- Filter-blocked subframe has an exact native refusal and **zero** destination server arrivals.
- Top-level navigation has an exact native allow join and reaches the server. The pinned engine deliberately allows mainFrame requests, including the test hostname; this is attribution proof, not a claimed top-level filter refusal.
- Both fixture browsers exit normally.

The oracle binds the actual bundled engine.js digest and independently checks mainFrame=0/subFrame=1 for the blocked-host URL. The fixture maps that hostname to a loopback-only HTTP server. It uses fresh task profiles, Network request IDs and hashed native decisions, not URL/order guessing or HTTP diagnostic headers. Opt-in trace data are retained locally/archived; no production private logging policy changes.

Four changed preparation tests pass. One guarded incremental build planned1action and completed6steps in60.28s; final guard schedules0actions. No GN/toolchain/cache changes, cold build, Electron build, latency measurement, repeated fetch/header/socket/worker/L8 matrix or owner walkthrough. The generated scheduler's initial potential-work counts are not executed compile totals; only one C++ object compiled.

`source-output-binding.json` binds the native output and preparation input; `inventory.json` records76existing upstream files/185hunks and151clean Git dependency checkouts. The previous75/184ceiling refusal is retained as `inventory-before-limit.json`. The owner’s standing budget authorization permits recording the new ceiling, with later consolidation; no reduction is claimed. Four owned profiles were removed only after clean exit/process-absence checks (`cleanup.json`). Permanent profiles/tabs, Google baseline and signed masters remain untouched.

## Acceptance boundary / remaining queue

This is **native output evidence, not a newly signed candidate**. The existing signed1523375/e57f5cdb master still lacks this navigation repair. Package/sign/notarize a replacement and rerun only these affected navigation cases before crediting signed coverage. Historical14706b0e L7/L8 approval is not transferred. No F12 aggregate, Decision2, release or new launch-gate acceptance; progress remains9/12.

The old October25 main-frame replacement adjunct remains unqualified; its blocked-host expectation did not match deliberate mainFrame policy. Direct main-frame attribution is now qualified, but a privileged DevTools navigation replacement/restart join is a distinct remaining case. Explicitly enabled/default-disabled pre-prefetch routing and final production-observer/provider-parity disposition remain separate Decision2 inputs. Do not rerun passed paths as an open-ended stress matrix. Electron paused; Google baseline separate; latency deferred.

`run.mjs` is the final20-check fixture; `before/run.mjs` is its14-check baseline version before adding main-frame attribution. Raw reports and dated signed/native identities preserve that distinction.
