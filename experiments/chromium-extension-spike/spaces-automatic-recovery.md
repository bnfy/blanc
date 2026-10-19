# Interrupted Spaces switch recovery design

Status: October 19, 2026. Owner approved: **Restore the source Space**. Incremental implementation and runtime verification are in progress; final evidence is recorded below when available.

## Durable transaction

Before staging any tab, write an atomic, versioned transaction containing an unpredictable transaction ID, profile-local source-window identity, source and destination names, and complete validated snapshots of both. Failure to persist the transaction must leave live tabs unchanged. Keep it separate from the named Spaces primary/backup generations so normal save recovery does not erase switch intent.

The transaction must remain pending while actual source removals complete. CloseWebContentsAt requests are asynchronous and may finish out of request order, as the latest crash tests demonstrate. A successful API reply alone cannot acknowledge the transaction. Verify the complete resulting capture, including active tab, pins, groups and actual old-tab removal, before durably clearing it. Refuse overlapping profile switches while pending.

## Startup and repeated crashes

Regular profiles only. Read and validate the transaction on the existing sequenced disk runner. Coordinate with SessionRestore::IsRestoring(profile) and its restored callback; snapshot polling alone must not race session restoration. A transaction must identify its originating window. Never choose a window by current focus, order, or matching URL alone, and never replace unrelated startup/restored tabs.

If the original window cannot be identified uniquely, retain the transaction and report recovery required. Do not silently discard the record or guess ownership. Persist recovery identity so another crash cannot create duplicate recovered windows or claim a partial recovery as complete. Corrupt, unknown-version or incomplete transactions fail closed and remain available for diagnosis.

The owner chose rollback to the last saved source Space. Both snapshots must remain available regardless. This is a product behavior choice, not authorization for a cold build or Electron diagnostic build.

## Acceptance cases

- Crash before/after intent persistence: no mutation without a durable intent.
- Crash after first/all destination staging and first/all actual source removals: automatic recovery to the chosen state without bridge/API reopen calls.
- Crash during recovery and before/after intent clearance: idempotent recovery, no duplicate tabs/windows.
- Chromium session restore in flight, unrelated restored window and changed startup tabs: no replacement of unrelated content.
- Multiple regular windows, private window, missing/ambiguous originating identity: strict ownership and private exclusion.
- ENOSPC/EIO/flush/rename failure for intent and acknowledgement: preserve pending evidence and fail closed.
- Malformed/version-unknown record: no navigation from unvalidated data.
- Ordinary completed switch and clean restart: no spurious recovery.

Source audit: the existing SpaceDisk method stores named snapshots but no pending switch identity; Handler::SpaceReady stages tabs then requests source closes and replies, without a durable completion record. The current snapshot-driven autosave is not a recovery coordinator. Chromium's session_restore.h exposes IsRestoring and a restored callback, but integration and exact window identity remain to be implemented and tested.

No product source changes, builds or runtime tests in this design checkpoint. Latency remains deferred; native input and the Electron diagnostic build remain pending. Patch footprint is unchanged from the last measured 41 files / 100 hunks.

## Automatic source-Space recovery — October 19, 2026

Owner decision recorded verbatim: **Restore the source Space (recommended)**. A versioned profile-local `.switch` journal is atomically written before staging, with a random transaction ID, named source and validated source/destination captures. The source must equal its durably saved record. Pending intent blocks other saved-Space mutations. Completion waits for the exact new tab IDs and complete capture before removing the journal; a successful switch API callback alone is insufficient.

Four forced exits after first/all destination staging and first/all actual source removal automatically restore the saved source after restart, without an explicit bridge/API reopen. Saved A/B records remain unchanged, and the completed recovery clears the journal. A second crash during first-tab recovery preserves the same journal; the next restart restores exactly one three-tab source set. Malformed intent and a nonempty unrelated startup page retain the journal and leave live content unchanged. Normal A/B switching and four capture-policy tests pass. Temporary crash hooks are removed; the normal binary is rebuilt and smoke-tested.

This is bounded startup recovery into a sole empty, non-session-restored regular window. It checks SessionRestore::IsRestoring before reading and before applying recovery; it does not identify an original window across macOS restarts. Exact restored-window ownership, in-flight/multiwindow session-restore races and private-runtime recovery still need qualification. Ambiguous startup content fails closed and leaves a recovery error/journal; automatic recovery is not complete for those cases. The UI remains hidden. Intent-write/acknowledgement fault injection, crash around journal deletion, group/pin recovery, power-loss durability and unsaved page state remain gaps. Previous generic Spaces write-error tests do not qualify the new journal. Journal deletion is not claimed as power-loss-durable acknowledgement.

Only guarded incremental builds were used; no cold output, args/toolchain changes, latency tests or Electron diagnostic build. Native input remains pending. The production source contains no diagnostic crash hooks. Owned test profiles/servers are removed; retained preview was untouched (host unavailable, original tabs not reverified). Task 0/F12 gates and plan item 4 remain open.

Evidence: `evidence/ui138-spaces-auto-source-20261019/`. Build wrapper timings: build 39.94 s, build2 38.62 s, diagnostic-build 37.53 s, restore-build 42.17 s. Fresh patch budget: 41 upstream files / 100 hunks. Final zero-action guard is archived. These costs are routine implementation/testing, never the Task 0 cold-build column.
