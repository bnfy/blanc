# Lost-ack recovery and reload lifecycle — October 18, 2026 UTC

## What changed

The static-delivery barrier can retire an outstanding lease when an authenticated
browser query proves its previously verified document ID is no longer present.
It still cannot release a live, inactive, cached or retained crashed document on a
timeout. The request uses the same live provider background document and current
native generation, including while protection is held. Malformed document IDs,
stale/malformed generations and the popup sender are rejected.

This is a **proof chain**, not a general absent-ID authorization API. The lease
stores the actual MessageSender document ID only after two successful browser
`LateContext` validations. The browser then looks up that exact token in
`ExtensionApiFrameIdMap`. Absence for an arbitrary never-observed ID would not
prove destruction and is never an input to barrier retirement. A page cannot
supply the queried document ID or a retirement result. Unknown/error/mismatched
responses retain the lease. Polling is bounded by the existing functional timeout;
a response arriving after the drain timed out cannot silently retire its lease.

The pinned source audit in the archive records that document-map entries are
created/destroyed with `ExtensionDocumentUserData`. `DocumentUserData` survives
BFCache and retained crashed frames. We deliberately do not use `IsActive()` or
renderer liveness as destruction evidence. Runtime BFCache/prerender/crash
qualification remains open; those properties are source-backed, not runtime passes.

Reload begin now rejects an overlapping begin, and completion carries the epoch
returned by begin and checks it around drain/ready acknowledgement. A stale
completion cannot release a newer epoch. Generated uBO keeps its shared load
promise until the final native readiness acknowledgement, then clears it on both
success and failure. Concurrent `loadFilterLists()` callers share that promise;
a rejected drain can be retried after the exact receiver acknowledges.

## Measured runtime

The final diagnostic run preserves **45 schedules**: srcdoc/data/blob × five pause
points × held/completed/actual unchanged-rule reload. **36 pre-dispatch drops,
nine committed deliveries drained, no duplicate bodies**; 15 actual filter reloads.
These controlled pauses do not measure natural race frequency.

Additional checks in that same fresh profile:

- A live paused receiver stays present in native document observations. Two real
  reload callers share one promise and both reject on the retained lease timeout.
  A real page fetch remains blocked while held. An overlapping begin and premature
  completion are rejected. Resuming the receiver permits acknowledgement and a
  subsequent real reload succeeds; the failed shared promise was cleared.
- Completion with the prior epoch is rejected while a new epoch stays held;
  completing the current epoch restores readiness.
- Destroying a previously verified receiver produces a native `exists:false`
  observation for that exact document. A real reload then succeeds without its
  lost acknowledgement; the final native control is accepted `/ready`.
- Live-document query succeeds; malformed document ID, stale generation and a
  malformed generation string return 403. A popup-origin query is rejected.

The initial recovery run predates the query-negative probes; its exact source
hash and raw report are retained, but only `race-final` supplies the final proof.
Initial test failures (obsolete source-anchor assertion and a VM Promise-realm
mismatch) are retained and corrected. An early verification invocation before
report creation failed with ENOENT and is excluded.

## Scope and remaining gaps

The barrier still serializes committed **static** delivery before engine reset;
it does not revoke sent code. Native document-start callback delivery and other
upstream non-static injections are not covered by this lease. In-place changed
rules on already-scripted documents, asynchronous scriptlet effects, background
loss/recreation, BFCache/prerender/crash runtime behavior, adversarial containment
and broader lifecycle/request-path cases remain open. Live lost acknowledgements
still fail closed until acknowledgement or proven destruction; this is not a
complete production recovery UI.

No Electron build or latency run. The Electron diagnostic request §8 remains
unchecked/unstarted; latency remains deferred, including polling and gate costs.
The 156 checkout and permanent profiles are untouched. Task 0 promotion and plan
items 3–6 are unchanged. This is not full Spike A/B acceptance.

Build, ordinary regression, cleanup and archive summaries are recorded alongside
this file and in `rebase-ledger.md`. Generated uBO modifications retain GPL-3.0-or-
later, with the pinned file manifest, modified files, full inventory and licence
in the archive. Private fixture keys and disposable profiles are excluded.

## Validation and build cost

- Final race/recovery proof passes all 45 schedules plus live timeout/retry,
  destroyed recovery, concurrent-load identity, stale completion and lifetime
  query rejection controls.
- Ordinary static regression: 18 late deliveries + two HTTP controls + 13
  identity/generation checks. Header/inherited policy regression: 15 cases.
- Readiness/reload/private independence/background loss: ten checks plus one
  missing-startup cancellation check. All pass. The HTTPS page control remains
  combined protocol/sender refusal, not isolated sender authorization proof.
- 260 focused tests pass; 133-file lint clean. Generated `loadFilterLists()` is
  executed in a unit test for coalescing through acknowledgement and rejection
  retry, in addition to the real browser checks.
- One guarded incremental build: 34.59 s wrapper / 30.82 s Siso, six steps, from
  one planned compile action. Final zero-action guard: 4.39 s. No cold output,
  GN arguments, hooks or toolchain changes. Fresh footprint: 31 files / 74 hunks.
- All disposable roots/private keys removed; no owned runtime/build remains.
  No full network-corpus, Electron or meta-CSP matrix rerun at this checkpoint.
