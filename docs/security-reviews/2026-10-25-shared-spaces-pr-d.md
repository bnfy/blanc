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

Local validation passed:

- Full unit suite: 4,802 passed, 2 skipped, no failures.
- Native window/UI run: 7 scenarios, 50 steps passed.
- Final two-Electron run: 1 scenario, 11 steps passed, including the strict
  per-client rolling window, combined fixed-minute limit and no 429 responses.
- Final peer/crash run: 12 scenarios, 51 steps passed. The index failure stays
  active through relaunch so a background retry cannot invalidate the fault.
- Checked-in Wrangler configuration, migration and SQLite object: local
  Workers runtime test passed, including eviction and quota recovery.
- Lint, substrate and acceptance binding (550 scenarios / 4,187 steps) passed.

The native results come from the targeted runs above on macOS; Linux CI and
the held real-device/platform confirmations remain separate evidence. The draft
PR description records the source commit submitted for review.

Source review fixed an additional expiry edge case: an obsolete index
publication receipt can no longer strand a deleted Space's slot after 30 days.
The client cleans up only after the successful/fetched index excludes the
expired id; a failed DELETE keeps local state for retry.

Selective cleanup also requires the Worker's `X-Blanc-Space-Delete: 1`
capability on its blob GET response. Earlier v1 Workers interpreted a DELETE
with a store suffix as an account wipe. A regression verifies that a client
retains the retired id and sends no selective DELETE to a headerless Worker.

The strict two-client budget audit exposed a reservation/dispatch timing gap:
variable request-log persistence latency could compress actual GETs inside a
60-second window. The queue now charges each reservation through operation
completion and persists that later timestamp. A virtual-clock regression
reproduces the earlier failure without network timing or relaxed assertions.
