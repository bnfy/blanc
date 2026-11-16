# Prerender activation repair — October 24, 2026

**The activation gap is repaired and 72 Developer ID–signed checks pass. Notarization is pending 1Password authorization; L7 remains open.** Source `14706b0e8d4753d2a7ef35ea32a875b516366b0d`, Chromium157.0.8103.15. No public artifact is approved by this checkpoint.

## Repair

Prerender activation uses Chromium's `CommitDeferringCondition` path, rather than the response throttle that activations skip. The new condition rechecks the engine before HTTP(S) activation; only an explicit allow resumes. Work is posted after returning `kDefer`, a35-second timer bounds waiting, and navigation-owned weak callbacks suppress late replies after cancellation/destruction. Denial, disconnect and timeout stop the navigation. This factory is restricted to prerender activation with Blanc assets enabled; ordinary navigations and BFCache behavior are unchanged.

The early activation phase has no initialized sanitized referrer. The corrected gate supplies the already-available browser-provided initiator origin (or empty for unavailable/opaque context). It adds no diagnostic logging or private data persistence.

## Verification

| Scope | Result |
| --- | --- |
| Incremental native builds | Initial45.55s/eight steps; corrective31.42s/six steps; finalzero-action guard. Existing compiler, SDK, args and caches preserved. |
| Source/build guards | 13tests pass;11patch-counter tests pass;12compliance tests pass. Fresh73upstreamfiles/180hunks and151clean pinned Git dependencies. Standing owner budget authorization applied; initial73/179 overflow record retained locally. |
| Healthy prerender | Eight signed checks: real regular/private prerendering, activationStart evidence, committed target and clean exit. No source-page debugger or feature override. |
| Utility loss | Twelve signed checks: verified native regular/private mode, ready prerender, exact disposable blocker child terminated, activation refused, original page remains, fresh fetch refuses and clean exit. |
| Deadline / late reply | Six signed regular-profile checks: hold the exact utility, arm activation, wait beyond35seconds, release utility; target does not commit and a fresh request succeeds after release. The late reply does not revive activation. This is a functional timeout test, not a latency benchmark. |
| Signed regressions | Startup7, encrypted session/recovery6, core17 and notice16 pass. Notice uses actual pointer activation of the trigger; Escape closes it and returns focus. |
| Signed integrity | 17arm64 executables,10preview identities, no get-task-allow or disabled library validation; eight certificate hashes remain present. All462signed file/symlink entries remain unchanged after tests. No notarization ticket is claimed. |

The aggregate72 counts only the final passing signed assertions above. Previous, ad-hoc, failed and overlapping attempts are separate.

## Retained failures and fixture corrections

The first signed repair (`a6a5a7d4`) crashed on `GetReferrer()` before activation referrer initialization. Its trace is retained; the current origin-based lookup fixes it. That intermediate app was never published or accepted. Initial preparation tried a packaged engine directory lacking its build-only hash header; corrected preparation reused the unchanged pinned header.

An extra timeout fixture kept polling while its utility was suspended and failed the later fresh-request assertion. The corrected fixture stops polling once armed; original failure remains. Another attempt used a changed shell Node20runtime without its WebSocket global. Final tests pin `/usr/local/bin/node`22.14.0. Notice's programmatic `.click()` did not give its document input focus; concurrent and then serial failures are retained. A trusted pointer click establishes focus and the unchanged Escape/return assertion passes. None required weakening product security assertions or changing the UI.

## Pending acceptance

The corrected code commits identify the source checkpoint; the signed bundle is retained at `/private/tmp/blanc-prerender-final-20261024/Blanc Chromium Preview.app`. Developer ID signing succeeded on the existing authorized MacBook identity. The earlier notarization attempt stopped at1Passwordauthorization, before Apple submission. The owner has been asked once to unlock/approve CLI access. On authorization, notarize this corrected bundle, staple and verify it, preserve the before/after signed-code mapping, and finish replacement acceptance. Do not submit the intermediate crashing bundle.

Electron remains paused. Google baseline and permanent profiles were not used; only disposable fixture profiles were created. Latency is deferred. Broader BFCache, policy-change, cross-origin and lifetime matrices are not newly qualified here.
