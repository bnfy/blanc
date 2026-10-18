# uBO full synthetic corpus and update-check identity — October 17, 2026

## Result and scope

Two fresh sandboxed Electron 44.8.0 sessions and two fresh sandboxed Chromium
157 sessions each replayed **5,123 distinct candidates plus four context controls**.
All four observed **2,113 cancels and 3,014 allows** (3,010 candidate allows).
There were **zero** stability, context, decision, original-transfer or authored
script/descendant outcome differences. No candidate redirected in this corpus;
the earlier bundled-rule local replacement remains a separate bounded check.
`parity-report.json` and `blanc-ubo-parity-full02.tar.gz` are the final evidence.
`ubo-parity-verify.mjs` independently recomputes the result from raw observations.

This is **synthetic uBO network/fixture parity**, regular profile only, not a
real-web rate or complete F12 acceptance. Electron's actual uBO provider is the
oracle; the earlier Blanc Blocker oracle is not substituted. Native observations
wrap the actual pinned uBO listener, copy its input before mutation, and return
its original result unchanged. Context checks use observed method, type,
initiator, main frame and the actual navigation's tab identity; they do not
substitute referrer for initiator. The observer-preservation test covers undefined,
allow, cancel and local replacement results. Private uBO stays disabled; the
previous independent private Blanc Blocker proof is unchanged.

All 658 installed Electron uBO payload files match the repository's pinned
1.75.0 hashes; the native generated payload starts from those same verified files.
Both runtimes selected the same ten bundled lists, with identical per-list input
entry counts and 257,793 aggregate used entries. Per-list *used* counts differ
while the aggregate agrees; those raw counters are retained rather than asserted
to match. No online filter responses were acquired. Automatic updating was
explicitly disabled through uBO's own setting in both disposable profiles before
capture. The candidate URLs are list-derived and retain `NOTICE` terms; no live
page acquisition, system trust change, or permanent-profile modification occurred.

## Retained unsuccessful attempts

- Probe 01: the observer assumed every provider has `status()`. Electron's
  startup gate does not. Optional status observation now labels that temporary
  gate as initializing without changing its decisions. This attempt is not a pass.
- Probe 02: 24 requests passed twice per runtime (12 block / 12 allow).
- Full 01: both Electron runs finished, then Chromium's automatic list updater
  entered the cancellation hold during navigation. The run is incomplete and
  excluded. The last recorded release was generation 3. This is not evidence
  that cancellation/resumption UX is production ready. The repeat pins the
  automatic-update setting, not a fake ready state or modified decisions.
- The first unit invocation lacked loopback permission (`listen EPERM`). Its log
  is retained; the authorized loopback run passed all **128 tests**. Nine of these
  exercise component packaging, reload handshakes and observer preservation.

Final source snapshots match full-02 capture hashes. Early attempt hashes and
outputs are retained, but their complete historical source snapshots were not
saved. Full-01 retains its partial raw records but not per-page DOM snapshots for
its incomplete native session; final full-02 saves every page independently.

## Service-worker update identity

Eight new unchanged-byte sessions (both runtimes, both profiles, twice each)
fetch the same script twice, retain exactly **one observed worker target**, keep
v1 active, and have no installing/waiting worker after `registration.update()`.
Eight changed-byte regression sessions still replace v1 with v2. Both sets also
pass the bounded controlled-fetch and HTTP-failed initial-loader checks:
**32 paired controlled contexts and 16 failed initial-loader identities** total.
All **16 update-check contexts remain gaps**, with exact reasons recorded in
`unchanged-context-proof.json` and `changed-context-proof.json`. No URL/time-only
match or old/new target token is promoted into an identity.

The pinned source explains the missing link: `service_worker_update_checker.cc`
passes the old version's scope/storage key into the single-script checker;
`service_worker_single_script_update_checker.cc` builds a frameless request and
constructs its browser request ID only at loader creation. An identical result
need not create a replacement execution realm. Existing trace flow pointers and
factory/request tuples do not link that request to a registration in both
runtimes. The exact source anchors and hashes are in the audit archive. Closing
this gate requires independently observed loader-to-registration attribution on
both sides, including identical-byte checks; a later execution target is
insufficient. No native source was changed to invent such a link.

## Operations and remaining gates

**Zero native builds**, zero changes to GN args/toolchains/caches; final guarded
plan: zero actions. Existing measured footprint remains 27 upstream files / 65
hunks (no native-source delta). Latency stayed deferred; no process pauses or
administrator dialogs. Disposable profiles and ephemeral trust material were
removed, and the preserved 156 build/permanent profiles were untouched.

Still open: cross-runtime update-check identity; HTTP validators/cache-only and
broader worker ownership/lifecycle; CSS/procedural cosmetics/scriptlet acceptance;
full request-path coverage; component privilege containment, failure/recovery UX
and in-flight reload behavior; private real-page sanity and qualified latency.
The Task 0 extension-upgrade gate and 156 baseline are unchanged. Plan items 3–6
remain not started. No tranche acceptance or promotion is claimed.
