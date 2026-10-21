# Native early and upstream completion ordering — October 18, 2026 UTC

This checkpoint qualifies bounded delivery/reset ordering, not full uBO acceptance.
It extends the static delivery and lost-ack evidence in the preceding checkpoint.

## Mechanism

Native GetScript now returns a browser-created token. A dispatched nonempty response
is retained with its actual WeakDocumentPtr until the same document's DocumentService
receives Complete after synchronous ExecuteScript returns. Reload cancellation clears
undispatched jobs only. An authenticated, current-provider/current-generation query
counts remaining deliveries while held. Ready is refused natively while any remain.
Only actual WeakDocumentPtr invalidation can retire an abandoned native lease; no
inactivity/renderer-live test or time-based lease expiry is used. The generated
provider enables this drain before its initial begin, not just before activation.
The renderer checks lifetime again after the synchronous completion round trip.

Both scriptlet-filtering.js executeScript sites (injection and log-level injection)
now acquire a separate bounded completion lease synchronously with dispatch, while
ready. Reload waits for that invocation's real promise settlement. Missing settlement
keeps the lease, and timeout rejects while held. No document-destruction shortcut is
used for these leases. This retains the pinned vAPI wrapper and permissions. Its
catch converts errors to an empty array, but it awaits the underlying browser API:
ScriptExecutor::Handler finishes only after pending frames reply or are removed, or
there was no injection to dispatch. Source copies are archived. This terminality
argument does NOT establish exact document identity across navigation (the upstream
source itself contains a navigation-identity TODO), successful injection on refusals,
or completion of timers, observers and other effects scheduled by a scriptlet.
Other cosmetic/contentscript-extra injection paths are not covered by this wrapper.

## Runtime results and diagnostic boundaries

Four final schedules in a fresh offline disposable profile:

- Two native schedules pause actual selected code inside ExecuteScript using a
  diagnostic debugger statement. Native count stays one, and an already queued
  upstream call also stays pending. Real loadFilterLists cannot finish. Direct
  native ready is refused. Resume drains both; timeout also stays held and a real
  retry succeeds after resume.
- Two upstream schedules invoke the real engine's injectNow for the exact loaded
  fixture tab, with the real rules and real API result (one result each). A
  diagnostic derivative delays release after API settlement. Native count is zero,
  upstream count is one, and real reload waits/rejects on timeout. Releasing that
  acknowledgement allows completion/retry. This tests the completion boundary,
  not an isolated pause inside upstream renderer execution.
- All four preserve the first-inline constant and one main-world body. Debugger
  delays are controlled schedules, not measurements of naturally occurring races.

Attempts 01 and 02 passed the two native cells but timed out waiting for an upstream
pause. Attempt 03 used a completion barrier but captured pending about:blank work
with an empty API result. These are retained and excluded from the final four-cell
proof. Attempt 04 waits for the exact fixture tab and invokes the real engine there;
its positive API result is required by the independent verifier. Earlier source
variants are archived and matched to their original report hashes.

Regressions: 45 static schedules (36 pre-dispatch drops, nine drained committed
deliveries, zero duplicates), live timeout/retry and destroyed-receiver recovery;
18 ordinary non-HTTP deliveries + two HTTP controls + 13 identity/generation checks;
15 header/inherited CSP cases; ten readiness checks and one unready-startup check.
268 focused tests and 139-file lint pass. No full 5,123-candidate parity rerun,
Electron run, meta-CSP matrix, physical input test or latency measurement occurred.

## Build and footprint

One guarded incremental build: six initially planned actions, 45.70 s wrapper,
41.73 s Siso, 19 final steps. Generated dependency estimates are not completed-action
counts. Final guard: zero actions, 4.98 s. Fresh patch budget: 31 existing upstream
files / 74 hunks, within 40 / 120; nested dependency checkouts clean at recorded pins.
No cold output, GN argument, toolchain, Xcode, depot_tools or preserved 156 changes.

## Remaining gaps

Exact upstream target document across navigation; native/frame destruction, retained
crash, BFCache/prerender and background-recreation runtime schedules; changed-rule
in-place semantics and asynchronous effects; other injection channels and broader
containment; Electron early timing and independently observed update identity. Native
ack forgery/different-document negative tests are source-guarded but not runtime
exercised here. No full production atomicity or provider recovery UX claim.
Latency is deferred, including acknowledgement round-trip overhead. Electron
instrumentation build §8 remains unchecked/unstarted. Task0 upgrade gate and plan
items 3–6 remain unchanged; Spikes A/B continue in progress.

Previous-head CI at 79588947: 21 passed, one failed, none skipped. CodeQL reports no
new alerts. oauth-compatibility failed in newtab-wallpaper-smoke.mjs:151 waiting for
private wallpaper fade opacity (30 s), after OAuth and Favorites checks passed.
No rerun or shipping-code change was made; the new head needs its own CI results.

## Archives

Archives preserve sources, generated payload deltas against the pinned GPL uBO tree,
full payload inventory/pin, source audit, measured invocations, runtime attempts,
proofs, cleanup and binary hashes. Only authored fixtures are used. Profiles and
fixture private keys are removed; no authenticated browsing data is captured.
Every archive member is hashed and re-read after extraction; the five final proof
programs are rerun from the extracted source copy. The packaging program is included.
