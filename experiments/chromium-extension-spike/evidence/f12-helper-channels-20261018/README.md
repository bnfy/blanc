# Helper runtime and navigation evidence

## Logger, noscript, picker and navigation checkpoint — October 18, 2026

Six disposable regular-profile Chromium schedules pass: logger, noscript and
picker each drain normally and fail closed on an intentionally withheld API
acknowledgement, then recover after release/retry. These exercise the real helper
files. Noscript replaces its authored fallback; picker preserves its awaited
reply and does not return early. Logger coverage proves helper execution and
completion ordering, not the logger UI or every logged cosmetic rule.

Two additional picker schedules navigate after actual helper execution while its
acknowledgement is withheld: same URL and another path on the same origin. The
actual extension MessageSender documentId matches webNavigation's old document;
the new document has a different ID and cannot retire the old pending lease.
These are post-execution identity observations, not document-bound pre-dispatch
targeting. Legacy executeScript loads the file asynchronously and targets a frame;
ScriptExecutor explicitly notes its preallocated document ID can become stale.
Pre-dispatch navigation, cross-origin/BFCache/lifecycle races, async effects and
other injection channels remain gaps. No full atomicity or acceptance claim.

Diagnostic payloads only add exact helper-entry observations and controlled
completion holds; no production/native changes. First attempt failed because the
picker hold intercepted initialization instead of the requested picker helper;
the corrected harness arms picker after initialization. The failed attempt and
intermediate pass remain archived; the final source passes all six cases with
the document observer enabled. Independent verification rejects eight corrupted
evidence variants. 272 regression tests pass; 127 scoped lint files clean;
zero-action build guard, no compilation, binary hashes unchanged from 249b086c.
Fresh disposable profiles/certificate keys removed. See
`record.tar.gz` and `inventory.json`.
Latency deferred; Electron diagnostic build approval remains unchecked. Spikes
A/B remain in progress, items 3–6 not started, no baseline promotion.

Archive contains failed/intermediate/final runs, source snapshots, diagnostic payload deltas, checks and hashes. Earlier failed-run source is not reconstructed; run02-source.mjs preserves the intermediate harness. `binary-hashes.json` verifies no native rebuild.
