# Subframe scriptlets and cross-runtime update tracing — October 17, 2026

Bounded Spike B correctness and Spike A identity follow-up. Neither full acceptance
nor a real-web result. Latency remains owner-deferred; these browser runs are
correctness probes, including those whose filenames contain `timing`.

## Measured outcomes

| Probe | Chromium 157 | Electron 44.8.0 / installed Blanc 1.36.0 |
| --- | --- | --- |
| First-inline flag/getter, ancestor selection and immediate fetch; eight cases in each of two fresh regular sessions | 16/16 pass | 0/16 pass |
| Later flag/ancestor state, same 16 cases | 16/16 pass | 12/16 pass |
| Two registrations sharing one unchanged script URL; regular/private, twice each | Eight browser-token registration/version joins pass | Eight update identities remain gaps |
| Stock ServiceWorker trace, same eight sessions | Two actual checker constructions per session; URL fields only on constructor | Same; no demonstrated hook-request to registration/version join |

Subframe cases: same origin; cross origin; nested cross-origin CSP; cross-origin
CSP navigation; a fresh document at the same URL; a child scriptlet exception;
the same child host under an unrelated ancestor; then under the original ancestor
again. Native prevention is also checked against actual proxy arrivals, not just
a returned JavaScript value. Electron's two late misses per session are the
same-origin frame and the restored-ancestor case. The generated native adapter
avoids hostname-cache reuse for gate requests; shipping Electron is unchanged.

## Implementation and limits

The existing opt-in DocumentService gate now accepts HTTP(S) child frames. It
sends the browser's ExtensionApiFrameIdMap frame ID and committed ancestor URLs
alongside the exact document URL. The reply still requires the registered uBO
background document, current filter generation and live WeakDocumentPtr. The
actual current engine selects the code. Gate requests bypass hostname-only
scriptlet caching; ancestor host/domain values come from that browser-supplied
chain. The late HTTP(S) path retains isolated-world injection only, preventing a
second main-world injection. Non-HTTP documents retain upstream behavior.

The signal remains bound to the document and profile; it does not borrow a top
frame's URL as the child's identity. CSP is not relaxed. Test pages exercise real
first inline execution without delays or observer-installed scriptlets. The
existing synchronous wait/20ms poll/three-second timeout remains a prototype;
overhead is unqualified.

New optional `traceUpdates` capture enables only the ServiceWorker trace category
on the owned disposable browser. Raw trace events and existing CDP lifecycle
records are retained. The constructor events contain `script_url` and
`main_script_url`, while the fixture deliberately has two different registrations
for that one URL. Trace flow IDs are not blocker hook IDs. The strict verifier
does not equate numeric IDs across namespaces or join by ordering/timestamps.
The native token remains independently validated against lifecycle observations;
Electron receives no fabricated token or copied native identity.

This rules out using the captured constructor trace as sufficient evidence. It
does not prove that every possible Electron diagnostic route is impossible.
The next direct route is independently reviewed Electron native instrumentation
at the update checker and webRequest dispatch, carrying the actual registration,
checked version, scope/storage key, private profile and a shared request token.
No Electron binary was rebuilt or patched here; another cold output is outside
the current incremental-build approval. Generic worker correlation remains strict.

## Failures retained

`trace01` stopped when Chromium private tracing did not flush within two seconds.
It is incomplete and excluded from the accepted set. `trace02` uses a ten-second
bounded flush and requires the tracing-complete event; all eight sessions finish.
The first test pass failed five old document-job fixtures because they omitted
the newly required frame ID/ancestor fields. The fixtures were updated and two
context checks added; no runtime validation was weakened. The first standalone
subframe verifier rejected denied Google background traffic; it now uses the
same exact refusal whitelist as the existing offline uBO validators. Any other
transport fault still rejects the run. Nothing was forwarded to those hosts.

## Build and regression cost

One guarded incremental build passed: 37.57 seconds wrapper, 33.65 seconds Siso,
eight steps, after a two-action dry plan. Final plan zero actions. No hooks,
GN args, toolchain, output cleanup or cold build. Upstream footprint 31 files/74
hunks (limit 40/120). 172 focused tests and 89-file lint pass. Main-frame correctness
regressions retain 12/12 native first-inline passes and seven safety probes,
including independent private-profile behavior and missing-payload cancellation.
These are not new latency measurements. Owner attention/agent time unmeasured.

## Verification and reproduction

Use `subframe-scriptlet-verify.mjs` on extracted `frames/`,
`update-trace-verify.mjs` on `trace02/`, and `document-start-verify.mjs` on
`timing/` plus `safety/`. The archives include fixtures, raw observations, failed
attempts, source snapshots and generated payload deltas with the upstream GPL
license. `archives.json` records each archive and member SHA-256.

Remaining gaps: independent Electron update identity; Electron early and
ancestor-cache corrections through separate shipping review; private subframe
scriptlets, about:blank/srcdoc/data, sandbox/opaque/fenced frames, arbitrary
scriptlets and other procedural operators, broader lifecycle and request paths,
component containment, recovery UI and the private real-page sample. The full
5,123-candidate network corpus was not rerun here. Task 0's extension-upgrade gate,
verified 156 baseline, permanent profiles and original tabs remain untouched.
