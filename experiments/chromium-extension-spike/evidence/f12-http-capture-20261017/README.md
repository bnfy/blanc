# Electron HTTP capture pilot — October 17, 2026

This is a **harness checkpoint**, not F12 acceptance. It uses installed Blanc
1.36.0's extracted source on stock Electron 44.8.0 (Chromium 152.0.7977.167),
with the real Blanc Blocker enabled and its pinned EasyList/EasyPrivacy snapshot.
The only source-copy changes are a bootstrap entry and runtime observation of
the coordinator's provider method; original decisions are returned unchanged.
No shipping files, installed app, Chromium source/output, or permanent profile
were edited. Native build invocations: **0**; no cold-build time is added.

## Observation

The final run loads one authored HTTP page in each of a regular and private tab.
Each page causes five actual provider decisions: its navigation, two scripts,
and two fetches. Across both profiles that is **10 captured decisions: 6 allow,
4 cancel**. Allowed requests reach the loopback proxy with their original URLs
and Host headers. Neither blocked request reaches the proxy. The allowed script
executes and the allowed fetch returns the fixture payload; both blocked DOM
outcomes report errors. This proves those specific paths in this pilot only.

The observer obtains `profileKind` from the actual originating Session's
persistence. Raw frame/top-frame URLs, resource types and `referrer` are recorded;
Electron supplies no `initiator` in these observations. The adapter must not
invent one. Ghostery derives its source URL from `referrer`, so true initiator
and effective engine input need separate treatment during normalization.

- [Final report](run-06/report.json), including runtime, source/filter hashes,
  original page origins, per-profile outcomes and cleanup checks.
- [Raw actual decisions](run-06/decisions.jsonl).
- [Independent proxy arrivals](run-06/proxy-requests.json).
- [Runtime download digest](runtime-download.json), verified against the pinned
  Electron npm package's archive checksum.
- [Harness and operating instructions](../../fixtures/replay/pilot/README.md).

## Attempts are retained

| Run | Result | Interpretation |
| --- | --- | --- |
| [01](run-01/report.json) | Failed before capture | Strict path-string check rejected macOS `/var` versus `/private/var` aliases. Changed to canonical filesystem comparison. |
| [02](run-02/report.json) | Failed fixture expectation | `doubleclick.net/advertisement.js` was allowed by the real engine. Its raw decision and proxy arrival remain saved. The fixture was corrected to `ad.doubleclick.net`, covered by the pinned `||ad.doubleclick.net^` EasyList rule. This was not a blocking regression. |
| [03](run-03/report.json) | Passed both profiles | First passing actual capture. Waiting for destruction of a closed page took time because Recently Closed retains it. |
| [04](run-04/report.json) | Passed both profiles | Select new page identities explicitly and verify removal through the tab model instead of requiring immediate renderer destruction. |
| [05](run-05/report.json) | Failed harness wait | Page-identity selection timed out despite five real provider decisions. Readiness now observes the coordinator releasing its navigation gates, and regular selection permits an existing page. The real blocker still recorded five decisions; no result was fabricated. |
| [06](run-06/report.json) | Passed both profiles | Final harness waits for gate release and uses `--use-mock-keychain`; recorded harness hash matches committed source. |

All run reports retain their original outcomes. The installed ASAR digest is
unchanged and the disposable app/profile tree was removed after each run. The
loopback proxy is closed. The installed app and both Chromium prototype instances
were never attached. Proxy-only tests pass **3/3**; their first sandboxed attempt
could not bind a socket (EPERM), then all passed with loopback access.

## Limits and next work

Captured **acceptance-corpus requests: 0**. The ten final pilot observations are
authored fixture traffic and must not be counted toward the 2,000 blocked plus
2,000 allowed real-page corpus. These raw records are not yet normalized into
the replay validator's schema or correlated across browsers. There is no 157
replay result, TLS/fixture-CA support, redirect chain, worker/service-worker,
post-teardown keepalive, WebSocket/WebTransport, cosmetic, scriptlet or latency
acceptance result. Synchronous instrumentation is not latency measurement.

Next: isolate certificate trust for HTTPS, capture permitted real-page requests
and responses with provenance, preserve observed source/initiator differences,
and add stable per-request/hop correlation before comparing 157 decisions.
Task 0's extension-upgrade gate remains open. This experiment makes no baseline
promotion or migration decision.

Session bracket: work began at the observed October 17 **17:47:00 UTC** checkpoint;
the final run's finish time is in its report. That is elapsed session time,
**not measured active agent time or owner attention**. No owner input was needed
for these disposable runs. This record is routine experiment work and is never
summed into Rebase 0's clean-build recovery benchmark.
