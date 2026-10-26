# Shared Spaces PR D — candidate source and acceptance evidence

Scope: approved plan Tasks 11–12 and the owner's October 25 quota/navigation
decisions. This is an unreleased candidate. Worker deployment, real-device
validation, merging and PR E remain on hold. No public product claims or
release assets are changed here.

## Coverage

| Requirement | Evidence |
| --- | --- |
| Two complete clients | F57-8 / `@two-clients`: two Electron processes with independent userData and credentials, sharing the actual local Worker handler. After initial joining, ordinary user edits converge through autosave and scheduled synchronization, with no forced capture/pull hooks. Covers bidirectional quiet creation, remote close once, active navigation deferral/release, dormant rejoin and rolling request windows. |
| Broad protocol faults | F57-9 / `@peer-driver`: isolated desktop sync module graphs drive the real Worker fixture. Real encrypted payloads reach the byte cap; held writes and unsynced marks are checked on disk, then ordinary sync retries after tombstone expiry. Session/sidecar PUTs and GETs feed the actual Other-devices projection for dedupe. Injected 429s exercise the device's own queue, all four request classes, reduced rolling caps and recovery. Also covers duplicate names, stale recovery beyond retention at 25 local Spaces, lost index, stale reads, same-version writes and unrecoverable content. These module instances do not substitute for F57-8. |
| Native crashes | F57-10–12: SIGKILL and session recovery on the same disposable profile; deferred close, merged remote create and failed index publication after successful blob storage. The fixture endpoint survives relaunch. |
| Excluded navigation | F57-6 and adapter tests: internal/local navigation retains the last shareable web record; only actual tab closure deletes that record. |
| Account full | F57-7 and sync integration tests: quota refusal is distinct, deleting a Space compacts it immediately, and the next write succeeds without advancing time. Store slots retain the deletion window. |
| Worker runtime | `cloudflare/sync-worker/test/runtime.test.mjs` runs the checked-in Wrangler configuration and real SQLite-backed quota object locally, including eviction and storage recovery. It does not contact or deploy the production Worker. |
| Security | `docs/security-assessment.md`, Shared Spaces PR D section: data/consent, Settings authority, URL guards, credential cancellation, quota ordering and unchanged R3/R5 limitations. |

## Deployment and merge gates

The quota follow-up implements the owner's approved conservative reservation
plan in [#1134 at a303b55f6](https://github.com/bnfy/blanc/pull/1134), replacing
the prior inventory migration gate. Its separate code review is recorded in
[the implementation record](2026-10-25-sync-conservative-quota-implementation.md).
The owner authorized authoritative SQLite Space storage on October 26; that
follow-up uses schema 2 with atomic ciphertext/quota commits and retryable
erasure. It needs no KV inventory/export or maintenance freeze. Provider PITR
retention and SQLite costs remain deployment review inputs. Rechecking legacy
route/writer scope, reviewing exact implementation/config/recovery references
and obtaining separate Worker deployment approval remain mandatory.

Real-device testing against the deployed Worker, server-copy erasure on a
disposable account and written confirmations for Mac, Windows and Linux are
still required before this feature PR can merge. Local fixture tests do not
satisfy those gates. PR E remains untouched. The public privacy policy and FAQ
must be updated with release evidence before Shared Spaces is released.

## Validation status

Local validation passed:

- Full unit suite after the four review corrections: 4,805 passed, 2 skipped,
  no failures.
- Prior native window/UI run at `cc1937358`: 7 scenarios, 50 steps passed.
- Revised automatic two-Electron run: 1 scenario, 11 steps passed, including the strict
  per-client rolling window, combined fixed-minute limit and no 429 responses.
- Revised peer run: 9 scenarios, 27 steps passed.
- Prior crash run at `cc1937358`: 3 scenarios, 24 steps passed. The index failure stays
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

## Review corrections after `cc1937358`

- Successful retirement cancels queued S/R work for that id before dropping
  local state. A cold-start full-pass regression with a stale GET verifies that
  neither tab data nor an empty polling entry can be recreated after DELETE;
  a later full pass makes no further request for the id.
- Any failed quota operation invalidates the cached ledger/bootstrap promise.
  Subsequent writes reload durable state. Regressions cover a transient KV
  inventory failure and a failed ledger reservation write, followed by success
  without eviction or a spurious quota charge.
- The native two-client exchange no longer calls capture or pull after join.
  The retention, dedupe and rate-limit cases now exercise real device/store
  operations through the fixture instead of substituting pure helper checks.
  All nine peer cases pass their Cucumber bindings; the actual backoff queue
  serves every waiting class before repeating one. The revised automatic run
  took seven minutes and retains the existing 35-minute CI job budget.
