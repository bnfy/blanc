# Bounded uBO readiness/reload protection — October 17, 2026

## Final measured result

`blanc-ubo-hold-private-final.json` passes ten checks with Chromium's sandbox
enabled. The regular-profile component suppresses a bundled-list tracker request
by redirecting it to `data:text/plain;base64,Cg==` (200, one byte), with no request
at the fixture server. This is a local replacement, not a cancelled response.
An authored in-memory rule then blocks its target while an allowed control arrives.
These are real uBO engine decisions, with the regular Ghostery path bypassed only
under the explicit reload-probe flag; they are not the 5,123-URL parity corpus.

The browser authenticates the registered fixed-ID background host, main frame,
committed background.html document, initiator and regular profile. Each begin
requires the next generation and replies before `loadFilterLists` resets engines.
Generated payload code releases after successful freeze; startup additionally
waits for `webRequest.start`. The browser owns state in the profile's user data
and holds weak document/context references. Missing readiness, failed handshake,
stale generation, non-background page/popup, and document loss cannot release it.

The hold **cancels new intercepted HTTP(S) requests**, rather than queueing
requests that may have already passed an empty extension engine. The runtime
proves cancellation, release with filtering intact, actual list reload, rejection
of page/popup/stale release requests, and fail-closed behavior after confirmed
background target destruction. A separate unready final run proves startup
cancellation without a handshake. Private browsing still uses Blanc Blocker,
loads its allowed fixture and blocks its tracker during the regular-profile hold;
private-profile closure and subsequent regular requests succeed without a crash.

Verify final records with `ubo-readiness-verify.mjs` and the two final JSON paths.
The normal readiness harness takes CONFIG PAYLOAD RESULT; `--unready` uses the
admission-only payload to omit the handshake deliberately. All sessions are
disposable and use a reject-only proxy except for explicit authored fixture hosts.
No keychain change, external forwarding, permanent profile, or latency run.

## Build and failure record

The existing output was used throughout. Guard preflight reported one initial
action; each successful invocation completed six steps. No cache reset or args
change. Final check reports zero actions. Budget remains 27 files / 65 hunks.

| Attempt | Observation / action |
| --- | --- |
| First compile, 5.84 s | Chromium required raw_ptr annotation. |
| Repair build, 31.07 s | Compiled; runtime exposed a missing response-body pipe. |
| Pipe repair, 31.64 s | Blink's successful-response DCHECK fixed with a closed, empty data pipe. |
| Private-profile teardown | Revealed a real dangling raw profile pointer, retained in profile-lifetime-failure.json. |
| Lifetime repair, 31.29 s | Weak BrowserContext reference, profile-owned hold state, fail-closed expired contexts. Final sandboxed checks pass. |

Harness failures are retained too: first-install uBO restart closed its popup;
bundled-list replacement had been incorrectly expected to cancel; navigating a
background page did not prove its destruction, so the final test explicitly closes
and verifies removal of its target. A reject-proxy ECONNRESET aborted one run;
its incomplete status and separate profile cleanup are retained. Connection resets
are now recorded; other socket errors fail the run. Earlier runs used Playwright's
default sandbox setting; only final records with `chromiumSandbox:true` claim the
sandboxed result. None of these failed attempts is counted as a pass.

95 worker-context regressions plus eight packaging/handshake tests pass (103).
65-file lint is clean. Source and generated payload hashes identify the tested
integration. Generated modifications retain uBO's GPL-3.0-or-later terms and
LICENSE.txt; upstream pinned files were verified before copying and remain intact.
The generated diagnostic API is test-only and is not a shipping design.

## Update-script identity

The final service archive contains eight fresh Electron/Chromium regular/private
sessions. Same-URL changed-byte behavior, 16 controlled-fetch contexts and eight
HTTP-failed loader identities pass. The browser now records the actual loader
request ID plus a factory-instance discriminator. Initial and update tuples differ
in all four Chromium sessions. **Transport identity is not worker identity.**
The native update still has no DevTools token; Electron lacks a corresponding
independent transport join. All eight update contexts remain rejected as gaps.
The verifier preserves both tuples and explicitly sets transportIsWorkerIdentity
false, rather than borrowing a new or initial worker by URL.

## Remaining gates

- Full pinned-corpus uBO parity, filter-set completeness and privileges containment.
- Failed list loads, concurrent reload/failure permutations, repeated background
  recreation and recovery UI. Only bounded paths above were exercised.
- Already-dispatched requests are not revoked; non-HTTP(S) and unobserved request
  paths retain the coverage gaps in the tranche plan.
- Cross-runtime update-script identity, unchanged-byte/cache validators, broader
  service-client/cache-only and worker lifecycle attribution.
- Quiet-machine latency remains explicitly deferred. Task 0 is not promoted.

Archives contain fixture observations only, with disposable profiles and fixture
trust keys cleaned. `sha256.json` covers the archived evidence.
