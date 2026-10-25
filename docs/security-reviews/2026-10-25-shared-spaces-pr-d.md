# Shared Spaces PR D — candidate source and acceptance evidence

Scope: approved plan Tasks 11–12 and the owner's October 25 quota/navigation
decisions. This is an unreleased candidate. Worker deployment, real-device
validation, merging and PR E remain on hold. No public product claims or
release assets are changed here.

## Coverage

| Requirement | Evidence |
| --- | --- |
| Two complete clients | F57-8 / `@two-clients`: two Electron processes with independent userData and credentials, sharing the actual local Worker handler. Covers bidirectional quiet creation, remote close once, active navigation deferral/release, dormant rejoin and rolling request windows. |
| Broad protocol faults | F57-9 / `@peer-driver`: isolated desktop sync module graphs drive the real Worker fixture. Covers duplicate names, tombstone capacity/expiry, stale recovery beyond retention at 25 local Spaces, lost index, stale reads, same-version writes, unrecoverable content, exact-occurrence dedupe and backoff/fairness. These module instances do not substitute for F57-8. |
| Native crashes | F57-10–12: SIGKILL and session recovery on the same disposable profile; deferred close, merged remote create and failed index publication after successful blob storage. The fixture endpoint survives relaunch. |
| Excluded navigation | F57-6 and adapter tests: internal/local navigation retains the last shareable web record; only actual tab closure deletes that record. |
| Account full | F57-7 and sync integration tests: quota refusal is distinct, deleting a Space compacts it immediately, and the next write succeeds without advancing time. Store slots retain the deletion window. |
| Worker runtime | `cloudflare/sync-worker/test/runtime.test.mjs` runs the checked-in Wrangler configuration and real SQLite-backed quota object locally, including eviction and storage recovery. It does not contact or deploy the production Worker. |
| Security | `docs/security-assessment.md`, Shared Spaces PR D section: data/consent, Settings authority, URL guards, credential cancellation, quota ordering and unchanged R3/R5 limitations. |

## Deployment and merge gates

The owner must approve the quota implementation and values, the legacy
inventory migration and Worker deployment. A first-use eventually consistent
KV listing cannot prove every old blob was inventoried; migration evidence
must establish the complete legacy charge before activation.

Real-device testing against the deployed Worker, server-copy erasure on a
disposable account and written confirmations for Mac, Windows and Linux are
still required before this feature PR can merge. Local fixture tests do not
satisfy those gates. PR E remains untouched. The public privacy policy and FAQ
must be updated with release evidence before Shared Spaces is released.

## Validation status

Final source validation is in progress. The draft PR description will record
the resulting source SHA and completed results; this document does not turn
pending Linux CI or platform confirmation into a pass.
