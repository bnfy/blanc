# A1 patch-design review — October 26, 2026

Technical design review completed against Chromium157.0.8103.15, upstream `1aa07b638799e59656559ae6c6649d4b197f555e`, Blanc implementation source `1523375af5b93cf910d9cca82f522155ef525adf`. The application branch at review start is `fb2ca628f60a3cf232a812004ab7579761bf9b6d`; its intervening changes are documentation and fixtures, not native implementation.

All75upstream patch SHA-256 values match the recorded October25 inventory exactly; the changed tracked path set also matches. Recorded footprint remains75files/184hunks. This is a read-only source binding, not a new151-dependency audit or build. The151clean-dependency observation remains dated October25. Fourteen selected Blanc-owned source/header/inc copies also match their repository inputs. That selection is not an exhaustive owned-source/resource inventory.

The complete changed-source diff was reviewed by responsibility. `domains.json` partitions all75paths/184hunks exactly once; it does not subtract research-disabled code, tests, binary branding or future overrides. `review.patch.gz` retains the reviewed diff. The prior A1 table listed49paths and is replaced by the full75-path ledger.

## Design dispositions

1. **Keep security/lifetime integration explicit.** Final URL-loader assembly after DevTools and the override downstream receiver, WebSocket/WebTransport admission, native hit testing, document identity, encrypted write/flush acknowledgement, profile cancellation and startup ordering are not interchangeable hooks. An earlier network hook reproduced a bypass; moving it back to reduce count is rejected. No hook or test was removed.
2. **Recommend an out-of-tree modular design.** Split the4,149-line UI implementation by UI host, identity/session metadata, profile-owned Split/Spaces state and native extension/theme adapters. Keep small forward-declaration interfaces at upstream call sites. Do not create a `content`→Chrome UI dependency or a browser-core↔browser-view GN cycle. Existing blocker browser/service/Mojo targets provide a starting separation, not proof that all proposed targets already exist.
3. **Treat procedural preparation as a prototype tool.** Current recipes reject unknown anchors but may accept a marker as proof of prior application and mutate files before all recipes finish. They are not the specified all-series before/after-hash transactional apply tool. Manifest validation, disposable-index preflight and exact after-state validation remain implementation work before an authoritative unattended rebase pipeline.
4. **Keep accounting honest.** Copied native implementation, binary resources and the buffer declaration stub remain maintenance inputs even when excluded by the existing upstream-path counter. Research-disabled provider changes still count. Dedicated targets and wrappers do not automatically reduce the union of touched upstream paths. No reduction is measured or claimed.
5. **Consolidate later in bounded changes.** First narrow the UI/session interfaces, then extract owned bodies without behavior change; consider branding and the ESLint compatibility pair only during a necessary affected build/update. Preserve keychain namespace, helper/signing identity, provider exclusion, durable-session semantics and source/binary bindings. The owner’s standing instruction permits recorded budget changes; no increase is requested or applied.

These dispositions complete A1's technical design-review deliverable; the layout migration, transactional apply tool, trusted native inventory CI and measured maintenance savings are not implemented. A1 owner/Decision2 approval is separate. Nothing in this review approves a production migration, an engine, public release or a lower patch count.

## Remaining Decision 2 inputs

The [current six-input matrix](../../decision2-input-disposition-20261026.md) credits the reviewed A1 package and existing visual/VoiceOver/parity evidence. Task0 owner attention/real Google upgrade, informed cost/capacity disposition, F12 residual qualifications and deferred latency remain open. No new stress schedule, browser launch, signing operation, build or passed-test rerun was performed. Electron paused; Google baseline separate; latency deferred.

## CI at this review

Documentation head `fb2ca628f60a3cf232a812004ab7579761bf9b6d` completes29checks:24pass/three Electron failures/two skips; CodeQL explicitly reports no new alerts. In addition to the two sandbox-duplication failures, Intel desktop fails its Electron original-uBO-popup fixture at `shield-provider.mjs:478`, waiting8seconds for `body:not(.loading)`. Full provider logs were inspected; no cause or repair is inferred, and no rerun was made. `ci-findings.json` records the runtime/failure excerpt and scope. The prior732b34f result25pass/2fail/2skip remains its dated result. This is not a native Chromium acceptance failure and does not authorize resuming Electron work. L11 remains open.
