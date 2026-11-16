# F12 DevTools navigation replacement / restart — October 26

Tested the unchanged notarized navigation replacement, source`efb1b511`, archive SHA-256`19cdde2731c41f8e33309a50b872fcb0d8092072a7b6ed1bda781328da5840de`. This is new redirected-navigation coverage, not a rerun of the20passed direct-navigation checks or earlier42fetch checks. No native/Electron build, package/signing change, Google probe or latency measurement.

## Observations

Six regular/private chains explicitly intercept a302redirect and replace its pending destination via Fetch.continueRequest:

- Allowed subframe replacement arrives exactly once; original redirect destination never arrives.
- Blocked cross-origin subframe replacement is refused, with zero replacement destination arrivals.
- Cross-origin main-frame replacement has a native allow decision, but fails with ERR_FAILED and **crashes the network service** in both contexts. Neither replacement destination arrives. Main-frame filtering is deliberately allow in the pinned engine, so this is not an expected filter refusal.

All six chains have exact intercepted Network-ID digest→native decision joins with the correct private bit. Actual native ordering is **initial0, checked redirect1, restarted replacement0**. The original fixture incorrectly expected only two decisions. Its first complete run therefore records36passing/10failing assertions: six wrong-count assertions and four real main-frame completion/admission failures. Original reports/traces/crash stacks remain unchanged under `first/`.

`validate-retained.py` corrects only those six attribution assertions offline against the retained observations; it does not send new traffic. All six corrected joins pass. Four new negative controls reject a missing restart, wrong request hash, wrong private bit and missing hop-index reset. **The four real failures remain.** Do not describe the original runtime run as all-pass or combine offline corrections into a new full runtime suite.

A separate, previously untested same-origin main-frame replacement control in each context passes18assertions (`same-origin/`), including exact three-stage joins, one replacement arrival and committed document. No passing subframe cases were repeated. Both browser processes exit normally, but that does not erase the two network-service crashes in the cross-origin run.

## Source reconciliation and repair boundary

Pinned upstream InterceptionJob::InnerContinueRequest cancels the old loader for a modified follow-redirect URL, applies changes and calls StartRequest. ApplyModificationsToRequest clears trusted isolation_info when origins differ (around line1531). URLLoader checks nonempty isolation_info at line538; both actual crash stacks end there. The interceptor file is unchanged against pinned upstream. This establishes the observed failure and a focused source lead, **not proof whether upstream alone or Blanc integration owns the cause**; no unmodified-upstream runtime comparison was performed. The new final navigation gate itself emitted the expected replacement decisions.

Next repair must preserve trusted isolation semantics across the cross-origin restart without disabling the DCHECK, assigning fabricated context or weakening the final gate. Limit rechecks to the affected cross-origin main-frame path and any control changed by that repair; no blanket repeat matrix.

## Evidence and status

`tested-artifact.json` binds the signed/notarized candidate; the oracle engine digest remains bound in each report. Source digests and review scope are in `source-review.json`. Four disposable profiles were removed only after all logged process IDs were absent; main exits0 and the two helper crashes are both recorded in `cleanup.json`. Permanent profiles/tabs and Google baseline remain untouched. Research tracing is explicitly opted in; no production private diagnostic policy changes.

Request/restart attribution is now qualified for these finite cases, including the failed main-frame attempts. Cross-origin main-frame functional recovery remains **open**; no aggregate F12/Decision2 or additional launch-gate acceptance. Electron paused, Google baseline separate, latency deferred. Earlier direct-navigation and signed-distribution passes remain credited within their original scope.
