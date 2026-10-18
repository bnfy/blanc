# Static delivery drain and header/inherited CSP — October 18, 2026 UTC

This checkpoint qualifies a bounded static-fallback ordering fix, not full Spike B acceptance.

## Reload ordering

`ubo-static-delivery.mjs` grants an opaque, document-bound lease immediately before
replying with nonempty code. The isolated receiver acknowledges only after synchronous
DOM insertion returns (also on insertion failure). Reload makes the provider unready,
acknowledges the native request hold, then drains committed deliveries **before**
resetting the engine. Completion/activation also drain before releasing readiness.
An already committed delivery may execute during this hold, using the pre-reset
engine selection. This is serialization, **not revocation of sent code**.

The barrier binds acknowledgement to the actual extension, tab, frame, document,
URL and origin. It admits at most 64 outstanding deliveries. Its three-second
functional timeout rejects reload and retains outstanding leases; it never
silently forgets a receiver and releases protection. This trades availability for
ordering: a lost acknowledgement currently needs recovery beyond this prototype.
No automatic document-destruction cleanup or production recovery UX is claimed.

Final diagnostic matrix: **45 schedules**, opaque srcdoc/data/blob × five pause
points × held/completed/actual unchanged-rule filter reload. **36 pre-dispatch
drops; nine committed deliveries drained; zero duplicate bodies**. In each of the
nine after-dispatch cases the reload promise remains unsettled while the receiver
is paused, then completes after receiver execution/acknowledgement. Fifteen cells
use real `loadFilterLists()`. A separate destroyed-receiver case runs real reload:
it rejects and stays unready after timeout. Unit tests also prove retry cannot
forget that lease and forged/replayed acknowledgements do not release it.

The pauses are diagnostic interposition, not natural race-frequency measurement.
The initial 45-case run (without the destroyed receiver) and its hash-verified
source are retained; only `race-final` supplies the final proof. The once marker
still suppresses duplicate bodies; it is not an authorization boundary.

## CSP and Trusted Types

Ordinary payload, **15 new cases**: five HTTP response-header controls plus ten
inherited opaque-srcdoc/blob cases. Policies cover nonce, script-none, Trusted
Types, strict-dynamic and report-only. Exact response headers are recorded and
verified. Nonce blocks untrusted inline/dynamic page scripts; strict-dynamic lets
a nonce-trusted script create a dynamic script while refusing the untrusted
inline script; Trusted Types refuses the page's text sink; report-only records
violations while allowing page execution. Script-none prevents page scripts.
Extension delivery still executes once; every inherited late path has an actual
browser-confirmed sender/document and a second main-world attempt, one body.

This establishes privileged delivery while page policies remain effective. It
**does not** establish complete component containment. Parent HTML carries srcdoc
as a parser attribute; the blob is created by the harness through CDP. We do not
claim that ordinary page script could create it under a policy forbidding script.
No policy is weakened or nonce copied onto the injected script to obtain a pass.
Only CSP/CSP-Report-Only headers are accepted by the offline fixture transport;
arbitrary cookie/auth headers and CR/LF are refused.

## Regressions, costs and scope

- Ordinary static integration: **18 non-HTTP late deliveries + two HTTP controls +
  13 identity/generation checks** pass.
- Existing meta-policy matrix: **15 cases** pass.
- Readiness/reload/private independence/background loss: **10 checks**, plus one
  missing-startup-handshake check, pass. The HTTPS page-control rejection remains
  a combined protocol/sender rejection, not isolated sender authorization.
- **253 focused tests; 133-file lint clean.** Initial .js/CommonJS test-import
  failure is documented, corrected to .mjs, and excluded from passes.
- **No native source changes or compilation.** Guard: zero actions, **5.18 s**.
  Executable/framework hashes unchanged. Last measured footprint **31 files /
  74 hunks** is unchanged by these assets and not remeasured.
- Disposable profiles and private fixture keys removed; no owned browser/build
  process remains. Invocations and raw runtime records are archived.

Remaining: native early and upstream non-static in-flight delivery ordering,
changed-rule semantics in already-scripted documents, recovery after lost
acknowledgement, concurrent reload/lifecycle/recreation behavior, arbitrary
scriptlets and asynchronous effects, adversarial containment, deeper/mixed-owner
CSP and combined policies, report endpoints, and the broader request-path matrix.
No full network-corpus or Electron run in this checkpoint. Electron early timing
and independent update identity remain open. **Latency remains deferred, including
barrier overhead; Electron diagnostic build §8 remains unchecked/unstarted.**
Task 0 promotion and plan items 3–6 are unchanged.

`archives.json` records every archive/member hash; `archive-verification.json`
records extraction and independent verification. Generated uBO changes remain
GPL-3.0-or-later with the pinned upstream payload; its pin, full inventory, modified
files and licence are retained. No private keys or browser profiles are archived.
