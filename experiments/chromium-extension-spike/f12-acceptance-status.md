# F12 acceptance consolidation — October 21, 2026

Primary plan: [implementation plan §2/§4C](../../docs/chromium-migration-implementation-plan-2026-10-16.md). Status: **both spikes in progress; neither accepted; no engine-selection decision**. This report consolidates dated evidence, not a new runtime run. Historical binary passes do not establish current-head native acceptance. Latency remains deferred; the Electron diagnostic build remains pending approval/unstarted.

## Evidence matrix

| Requirement | Recorded evidence | Status and remaining qualification |
| --- | --- | --- |
| A: network decisions/context | [Native engine](evidence/f12-native-20261017/README.md):5,123 distinct candidates,2,503 blocked/2,620 allowed;two regular/two private runs,zero comparison differences. Separate24-URL no-referrer subset. | Scoped synthetic parity passed on recorded binary. Not real-web effectiveness or complete request-path coverage. Do not combine denominators with B. |
| A: independent engine failure | Same checkpoint refuses requests with missing/altered assets or terminated utility. | Bounded fail-closed evidence; automatic utility restart/live recovery not established by this report. |
| A: workers and redirects | [Shared-worker lifecycle](evidence/f12-shared-lifecycle-20261017/README.md):two clients, exact one-owner teardown, allow/block/allow→block redirect in regular/private modes. | Scoped pass; does not close all worker/redirect permutations. Additional service-worker evidence is inventoried below. |
| A: exhaustive request paths | [Source path audit](evidence/f12-spike-a/request-path-audit.md) names navigation, worker/service-worker, keepalive, speculative loading, WebSocket and WebTransport boundaries. | Source map is not runtime proof. Reconcile every row with a specific run, safe unsupported behavior, or explicit gap before acceptance. |
| B: MV2/provider feasibility | [MV2 audit](evidence/f12-spike-b/README.md) distinguishes ordinary MV2 hard gates from browser-owned component admission and privilege differences. | Component-provider experiments do not establish ordinary MV2 Store support or production containment approval. Retain stop rules and pinned source provenance. |
| B: network parity | [uBO corpus](evidence/f12-ubo-parity-20261017/README.md):5,123 candidates+4controls;2,113 cancels/3,014 total allows;two sessions per runtime,zero observed differences. | Regular-profile synthetic pass. Private uBO disabled; private Blanc Blocker is a separate proof. Online updates disabled in these runs. |
| B: helper/identity ordering | [Helper channels](evidence/f12-helper-channels-20261018/README.md), [browser targeting](evidence/f12-document-target-20261018/README.md), [renderer guard](evidence/f12-renderer-target-20261018/README.md). | Later browser/renderer guards supersede the earlier claim that only post-execution identity was tested. Original caller event provenance and arbitrary asynchronous effects remain outside the demonstrated boundary. |
| B: BFCache/crash/reload | [Lifecycle](evidence/f12-lifecycle-20261018/README.md), [native recovery](evidence/f12-native-recovery-20261018/README.md). | Real BFCache and renderer-crash cases pass boundedly. Background document reload is not process-loss recovery. Prerender activation remains unqualified. |
| Both: cosmetics and production recovery UI | Dated follow-ups in Spike B audit and results ledger; helper tests prove execution/drain, not full logger/picker UI acceptance. | Complete cross-runtime/private real-page sanity and native UI acceptance remain open. Do not infer coverage from network parity. |
| Both: patch budget/cost | [A1 design](a1-patch-budget-design.md), rebase ledger. Latest approved ceiling55files/129hunks; last fresh count55/129. | Whole-prototype count is not per-engine marginal maintenance cost. A1 review/authoritative native CI and staffing sheet remain open. |
| Both: decision latency | No qualified new measurement. | **Deferred by owner. Do not run.** Cannot mark aggregate spike accepted while required latency evidence remains absent. |

## Concrete next acceptance work, in order

1. **Request-path reconciliation (no build):** map every Spike A audit row to archived runtime evidence, including method/redirect, worker ownership, regular/private scope and source/binary identity. Treat service-worker updates/cache response, keepalive after close, pre-prefetch, prerender, WebSocket and WebTransport as unresolved until explicitly mapped; do not assume they fail or pass from an older report's gap list.
2. **Artifact provenance/currentness (read-only):** verify archive inventories for the selected final runs and map their source/binary hashes to current implementation. Identify which checks actually need a current-head rerun; no blanket rerun or fresh build.
3. **Bounded runtime shortlist:** choose the highest-risk uncovered enabled request path and one positive/negative control. Reuse disposable fixtures and the existing incremental binary. Keep historical failures and exact scopes; do not inflate checkpoint totals.
4. **Provider containment/recovery disposition:** resolve original-caller identity, background process loss and prerender handling with explicit tests or safe unsupported outcomes. A platform behavior change requires source review; no ordinary-MV2 bypass inferred from the component route.
5. **Complete aggregate decisions:** add patch/cost and qualified latency only when authorized; produce pass/stop/in-progress outcome against the primary plan's criteria. Engine selection and Decision2 remain owner decisions.

## What this checkpoint completed

- Added the missing Spike A aggregate report entry point.
- Added this shared acceptance matrix and linked Spike B to it, retaining its detailed historical source audit.
- Identified the first next task as row-by-row request-path/provenance reconciliation, rather than extending unrelated Spaces stress tests indefinitely.
- No new native acceptance, source fixes, builds, profile changes, latency measurements or Electron diagnostic work performed.

Supporting inventory: `evidence/f12-service-context-20261017/`, `f12-service-update-20261017/`, `f12-service-loader-20261017/`, `f12-worker-context-20261017/`, `f12-worker-identity-20261017/`, `f12-worker-ownership-20261017/`. These are candidates for row reconciliation, not newly verified passes in this report.

## October21 request-path reconciliation

[Row-by-row evidence and provenance report](evidence/f12-reconciliation-20261021/README.md):13 source-map rows reconciled;38 archives/1,269 members hash-verified. Later ownership/controlled-fetch evidence supersedes some historical gaps, while same-URL update attribution and keepalive/speculation/socket/transport qualification remain open. No current-head binary equivalence claimed. Owner priority: sufficient Decision2 evidence ASAP; next bounded runtime investigation is keepalive/sendBeacon after sender close, with regular/private allow/block controls. Latency and Electron diagnostic build stay pending.

### Sender-closure preflight — October 21, 2026

Keepalive/sendBeacon remains open: pinned assets are missing and installed reference hash changed, so regeneration correctly refused. Zero runtime passes. Evidence: experiments/chromium-extension-spike/evidence/f12-sender-close-20261021/. Recover authenticated assets or reconcile a new baseline before parity claims. Latency deferred; Electron diagnostic build pending approval.

### F12 native assets recovered — October 21, 2026

Supersedes the missing-native-assets blocker above: the authenticated CodeQL archive contains the current pinned engine. Archive and 13 member hashes/sizes verified; recovered header matches current Chromium source. Native-only keepalive/sendBeacon work can resume; runtime checks are not yet run. Original paired Electron ASAR remains unavailable, so paired parity stays open. Evidence: experiments/chromium-extension-spike/evidence/f12-sender-close-20261021/asset-recovery.json. No build or latency run; Electron diagnostic build remains pending approval.

### Native sender-closure evidence — October 21, 2026

Four native schedules pass (regular/private × keepalive/beacon), with eight explicit post-close redirect decisions and preserved allowed POST body hashes. Qualifies pre-enqueued requests through one307 after target destruction; retries/process teardown/other methods and paired Electron parity remain open. See experiments/chromium-extension-spike/evidence/f12-sender-close-20261021/README.md and validation.json. No build; latency deferred; Electron diagnostic build pending. Next Decision2 priority: socket/speculation disposition and remaining strict source-path attribution.

## Socket/speculation source disposition — October 21, 2026

[Captured source disposition](evidence/f12-socket-speculation-20261021/README.md) completes the next reconciliation task. Socket/transport rows require a Blanc Blocker adapter, not just URL-loader test reruns. Normal prefetch needs runtime initial-request/consumption evidence; pre-prefetch is a conditional bypass with disabled defaults and scoped caller evidence; prerender cancellation is limited to the document-start switch. Next: context-bound WebSocket enforcement and real document/worker/private handshake controls, subject to the existing patch budget. This is source evidence only: no runtime pass, build, engine acceptance or release approval. Latency deferred; Electron diagnostic build pending approval.
