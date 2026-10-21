# F12 request-path and provenance reconciliation — October 21

Read-only evidence review. 38 archives and1,269 recorded members verified against recorded SHA256 (and byte counts where present), including retained failed attempts. `verification.json` records archive results; `verify.py` is the verifier used. Archives were streamed without extraction or executing their contents. Integrity proves correspondence to recorded evidence, not correctness or current-head runtime parity. No native build/runtime/latency/Electron diagnostic work.

## Original Spike A source-map rows

All paths below refer to sibling evidence directories. Status is bounded historical evidence, never blanket acceptance.

| Audit row | Strongest reviewed evidence | Residual gap / disposition |
| --- | --- | --- |
| Main/subframe navigation | `f12-native-20261017`, `f12-paths-latency-20261017` main-frame GET redirect | Subframe/opaque context and cross-origin/private full matrix not established by this path review |
| Document fetch/XHR/image/CSS/script/font/media/EventSource | Native corpus and authored response/DOM outcomes | No claim every resource type or nested/opaque-frame combination is represented; match fixture manifest before adding coverage |
| Dedicated/shared worker main scripts | `f12-worker-ownership-20261017` initial script and exact worker/client correlation | General script redirect and final-owner teardown not fully qualified |
| Worker fetch/importScripts | Ownership variants plus `f12-shared-lifecycle-20261017` two clients and one owner navigation | Later evidence supersedes old six-context shared-worker gap for these fixtures; arbitrary owner changes remain open |
| New/updated service-worker scripts | Ownership initial loader; `f12-service-loader-20261017` token-linked404; `f12-service-update-20261017` changed-byte update behavior | Same-URL update hook attribution explicitly rejected as ambiguous; behavior pass is not context pass. Unchanged-byte/validator/restart variants open |
| Service-worker network fetch | `f12-service-context-20261017`16 controlled-fetch contexts; ownership message-triggered fetches | One stable controlled client qualified; cache-only behavior is not strict network-hook context proof; reassignment/multiple clients open |
| keepalive/sendBeacon | [Native sender closure](../f12-sender-close-20261021/README.md): four regular/private keepalive/beacon schedules, eight post-close307 decisions | Pre-enqueued POST continuation passes; exact target destruction and allowed-body/blocked-decision evidence. Retries, other redirects, process teardown and paired Electron parity remain open. |
| Speculation prefetch | Source audit | Reachability/initial request and consumption evidence absent from reviewed records |
| Pre-prefetch | Source audit null-content-client branch | Establish configured reachability and interception before issuing a network request; cannot infer coverage from later consumption |
| Prerender | `f12-lifecycle-20261018` explicitly fails to establish activation; native recovery retains gap | Existing cancellation/default preloading policy is not successful activation parity |
| WebSocket | Separate hook identified; native report records absent interception | No later qualifying document/worker handshake proof located; inspect current hook and stop/implement within approved scope |
| WebTransport | Separate hook identified; native report records absent interception | No HTTP/3 handshake proof located; ordinary HTTP replay is insufficient |
| Redirect/restart | `f12-paths-latency-20261017`:GET fetch/script/navigation chains; shared lifecycle allow→block | Non-GET/method-changing, modified headers/replacement URL and deferred cancellation matrix open |

## Supersession and provenance

- Worker context/identity reports were partial. Ownership24final runs closes the stated initial-loader/shared subrequest gaps only for default/controlled/no-referrer fixtures. Shared-lifecycle evidence adds two clients and one-owner teardown.
- Service lifecycle report retains observer faults; later same-URL update records reconcile detach handling but do not establish strict update identity. Loader report explicitly rejects eight update occurrences instead of reusing an initial token. Controlled-fetch report closes16 stable-client contexts, not cache-only attribution.
- Spike B browser-document targeting was followed by renderer-token eligibility/pre-execution checks, then BFCache/crash and native lease recovery. These are later superseding evidence, not reasons to count earlier failures as passes.
- Selected inventories cover paths/latency, worker ownership, shared lifecycle, service context/loader/update, renderer targeting and native recovery. Verification includes unsuccessful attempts because the inventories do. No aggregate runtime pass count is derived from member counts.
- Historical sources/binaries are pinned in their archives. No equivalence to today's complete native binary is asserted. Currentness mapping and selected reruns remain necessary. The historical latency run failed its quiet-machine prerequisite; do not use it to close latency or rerun it under this task.

## Decision2 evidence priority

Owner requested gathering sufficient evidence ASAP. Keep the work finite: first investigate keepalive/sendBeacon after sender close with allowed/blocked controls in regular/private modes; then inspect current separate socket/transport and speculative-loading hooks to distinguish missing implementation from missing tests. Strict service-update attribution is a separate proof task. Reuse existing fixtures and incremental output; do not repeat the entire corpus or expand optional Spaces stress matrices without a concrete reason.

Both F12 spikes remain in progress. No engine selection, gate waiver or production-readiness claim. Primary plan remains authoritative; native physical input pending, latency deferred, Electron diagnostic build unapproved/unstarted.
