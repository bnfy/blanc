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

### Reproduction and evidence boundaries

The archive contains 62 members (92,083 compressed bytes), each hash-verified.
Its final fallback/lease proofs and both regression proofs also pass from
extracted sources and reports. Every attempt records owned profile/key cleanup.
`payload-reference.json` links the unchanged ordinary component inventory and
pinned/delta archive; `leases03/diagnostic-start.js` is the sole diagnostic payload
replacement, with GPL licence retained. The native binary hashes reflect this
checkpoint's one incremental build.

The initial raw attempts preceded the native policy change and are failure
controls, not passes. Per-attempt raw source versions are not fully snapshotted;
reports/logs and final sources are saved. The new raw harness deliberately
continues after a target-discovery timeout and uses renderer-initiated navigation.
Only the exact configured cancellation mode admits normal navigation as a
protected-fallback result; its verifier never calls it prerender acceptance.
The browser's incidental UMA durations are diagnostic output, not a latency run.
Run invocations are in `checks/invocations.jsonl`. Final native sources and the
idempotent preparation script are in the archive. No permission dialogs, system
process pauses, Electron diagnostic builds, full corpus or physical-input pass
are claimed here.
