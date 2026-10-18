# Static origin fallback integration — October 17, 2026

The generated, opt-in uBO payload now registers an isolated static receiver at
`document_idle`, with `match_origin_as_fallback` and HTTP(S) origin patterns.
No new host permissions, private uBO enablement or Chromium extension permission
patch is added. The content script sends only a request type. Its actual runtime
MessageSender supplies document/tab/frame/URL/origin identity to the background.
The authenticated background asks the browser to resolve that exact live,
active document in the same regular profile, using the same bounded precursor /
ancestor rule as the native early gate. It queries the real uncached uBO engine
with browser-selected URL and ancestors, then revalidates context and generation
before returning code through the original document's message channel. There is
no fixture-selected context or harness payload injection in this integrated path.
DOM script insertion retains CSP. An acknowledged callback alone is not a pass.

## Measured results

- Two fresh integrated profiles, ten kinds over two cycles each: **36 automatic
  non-HTTP late-delivery passes**, plus **four HTTP early controls**. Each exact
  leaf document has matching browser context before/after selection and actual
  main-world attempts with **one body execution**. The matrix includes inherited
  and opaque srcdoc, data, blob, sandboxed blob, nested opaque srcdoc/data/blob,
  and child-origin blob. Actual opaque origins remain `null`.
- Each profile checks live context, wrong origin/URL/tab/frame/document, stale
  generation, old document after navigation, a live-before/held/restored reload
  sequence, and rejection of a popup caller: **13 checks per profile**. Two
  unmatched-origin controls have no fixture-specific scriptlet effects; the
  integrated registration is permission-wide, unlike the fixture-only diagnostic.
- **Receiver-gap correction:** the previous fixture diagnostic called secure-
  context-only `crypto.randomUUID()`. Actual data, nested-data and nested-blob
  realms report `isSecureContext=false` and `randomUUID=undefined`; it threw
  before sending hello. A corrected diagnostic using `getRandomValues` now has
  **20/20 delivery passes, zero missing receivers**, including two deliberate
  engine-payload repeats per realm with one body. This supersedes the prior
  missing-receiver hypothesis; it does not retroactively turn those runs into passes.
- Existing regular/private non-HTTP matrix: **30 scoped passes / six boundary
  gaps** across 36 cases. Sixteen private outcomes retain actual Blanc Blocker
  cancellation attribution and no private uBO effects. Exceptions and fresh
  baseline restore add **14 passes / four boundary gaps**; fresh restore is not
  an in-place document-generation claim. All **seven document gate safety checks**
  pass, including missing-payload timeout, exception/replacement generations,
  hostname navigation, popup/stale rejection and independent private behavior.
- **228 focused tests pass; 119-file lint clean.** Negative tests reject
  ambiguous/unconfirmed identities, forged selection, missing main-world arrival,
  duplicate bodies, incomplete reload controls and harness-injected payload claims.

## Build and scope

One guarded incremental build: **35.12 s wrapper / 31.49 s Siso, six steps**, from
one planned action. Final plan: **zero actions**, 6.02 s. No GN/args/toolchain or
cold-output changes. Fresh patch inventory: **31 upstream files / 74 hunks**.
The first general prepare/check did not copy blocker sources and reported zero;
the explicit blocker preparation then produced the one-action plan. Both are logged.
All ten run roots report disposable cleanup; no owned browser process remains.
The original observed payload is preserved; newly generated and diagnostic payloads
are separate directories with pinned-file inventories and GPL notices.

Attempts are retained: integrated01 completed but its observer array was replaced,
so no identity checks ran (excluded); integrated02 stopped on a test-helper CSP
`eval` refusal (no CSP relaxation); integrated03 was exploratory before exact leaf
and live reload-control requirements. Final acceptance is integrated04/05 only.
The first corrected diagnostic was exploratory; the final diagnostic records its
identifier version. Initial lint found an unused initializer and was fixed.

## Remaining gates

This closes this bounded receiver matrix, **not full provider acceptance**.
In-flight reload versus an already-dispatched response is not atomic or qualified.
Already-executed scriptlets are not undone, and new rules on an existing realm
remain unqualified. Broader CSP/Trusted Types, top-level non-HTTP, unknown/mixed
precursors, deeper/fenced frames, arbitrary scriptlets, hostile pages, recovery
and component privilege containment remain open. The once marker prevents duplicate
bodies; it is not a security boundary against page code. Context bodies are bounded
to 64 KiB and unsupported contexts fail closed; larger data documents are untested.
The full 5,123 network corpus and Electron matrices were not rerun for this change.
Electron early behavior and independent update identity remain gaps; its diagnostic
build proposal §8 is still unchecked/unstarted. Latency remains explicitly deferred,
including gate/late-path overhead. Task 0 promotion and plan items 3–6 are unchanged.

## Evidence and reproduction

`archives.json` hashes every archive and member. `runtime.tar.gz` retains all
attempts, actual sender/context metadata, outcomes, fixture responses and corrected
payload deliveries. `sources.tar.gz` pins the experimental code. `payload-delta.tar.gz`
contains modifications, licenses, the original pin and full hash inventories;
`build-and-checks.tar.gz` contains invocation logs, plans, tests, lint and hashes.
Extracted final reports are verified independently before committing.

From the repository, with an existing guarded 157 output and a fresh disposable
payload directory, generate using `ubo-component.mjs OUTPUT --reload-guard --observe
--document-start`. Run `fixtures/replay/synthetic/static-integration-run.mjs CONFIG
PAYLOAD EVIDENCE` then `static-integration-verify.mjs EVIDENCE`. The corrected
fixture-only diagnostic still uses `origin-fallback-payload.mjs` and its runner /
verifier. Never replace the permanent payload or profile to reproduce these tests.
