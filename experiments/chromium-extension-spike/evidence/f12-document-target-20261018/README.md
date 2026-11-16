# Browser document targeting evidence

## Browser pre-dispatch document constraint — October 18, 2026

The opt-in uBO identity/switch path accepts `blancDocumentId` for single-frame
JavaScript only. ScriptExecutor compares the browser document ID within its own
tab/frame; ExecuteCodeFunction checks after asynchronous file loading and before
dispatch. Missing/replaced, malformed, cross-tab, CSS/webview and all-frame uses
of this constraint are refused. Other extensions cannot use it. Legacy calls
without the field retain their upstream behavior.

The generated adapter acquires a completion lease before querying browser frame
identity, rechecks readiness/generation, and supplies the observed document ID.
All-frame calls without a subtree root expand a maximum 64-document snapshot
into individually constrained calls; newly created frames are not added later.
A partial error cannot release another pending call. Subtree all-frame targeting
and larger snapshots refuse. The observation boundary is the browser snapshot:
this does not prove the original caller's earlier event belonged to that document.

Eleven offline regular-profile runtime checks pass: current code/file execution;
same-document fragment acceptance; same-URL, cross-path and cross-origin stale
rejection; malformed/wrong-frame/cross-tab/all-frame raw rejection; two-document
adapter fanout. Controlled navigation pauses after the actual browser snapshot
and before raw API invocation. Replacement DOM remains untouched. No artificial
pause inside native file loading was used; the post-load check is source-audited.
Six logger/noscript/picker and four native/upstream completion schedules also pass.
Seven corrupted-evidence variants reject. Three verifiers pass again using only
extracted archived sources/reports. 276 regression tests and 130 module plus two
wrapper lint checks pass. The initial nonunique preparation anchor and missing
harness globals lint failure are retained with corrected passes.

One guarded incremental build: 317.03 s wrapper, 312.06 s Siso, 1,017 executed
steps. Initial plan 208 actions expanded after schema generation; existing output,
GN args and toolchain retained. Final check zero actions (3.91 s). Footprint
35 upstream files / 79 hunks, within 40 / 120. No cold build. This is routine
tranche build effort, not Task 0's clean-build column.

Remaining: navigation after browser validation/before renderer execution still
needs a renderer document-token guard; queued runAt scheduling, BFCache/prerender,
crash/lifecycle and asynchronous effects remain open. No full exact-delivery or
all-path atomicity claim. Logger UI and arbitrary scriptlet/cosmetic coverage are
unchanged gaps. Latency (including snapshot overhead) stays deferred. Electron
diagnostic build §8 unchecked/unstarted. Spikes A/B in progress; items 3–6 not
started. No baseline promotion. Disposable profiles and fixture keys removed.
Evidence: `evidence/f12-document-target-20261018/`.

`record.tar.gz` contains 88 hashed members: runtime records, checks, source audit, exact sources and generated GPL payload deltas with the full pinned inventory. `inventory.json` verifies every member; `binary-hashes.json` records the new build. An initial extraction command used a Python tarfile option unavailable on this host; extraction was repeated with explicit regular-file/path/hash checks and all three proofs passed. This packaging error did not affect runtime results.
