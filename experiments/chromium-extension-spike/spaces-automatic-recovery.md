# Interrupted Spaces switch recovery design

Status: source audit and acceptance design, October 19, 2026. Runtime implementation pending the owner's source-versus-destination recovery preference. Existing automatic recovery is not claimed.

## Durable transaction

Before staging any tab, write an atomic, versioned transaction containing an unpredictable transaction ID, profile-local source-window identity, source and destination names, and complete validated snapshots of both. Failure to persist the transaction must leave live tabs unchanged. Keep it separate from the named Spaces primary/backup generations so normal save recovery does not erase switch intent.

The transaction must remain pending while actual source removals complete. CloseWebContentsAt requests are asynchronous and may finish out of request order, as the latest crash tests demonstrate. A successful API reply alone cannot acknowledge the transaction. Verify the complete resulting capture, including active tab, pins, groups and actual old-tab removal, before durably clearing it. Refuse overlapping profile switches while pending.

## Startup and repeated crashes

Regular profiles only. Read and validate the transaction on the existing sequenced disk runner. Coordinate with SessionRestore::IsRestoring(profile) and its restored callback; snapshot polling alone must not race session restoration. A transaction must identify its originating window. Never choose a window by current focus, order, or matching URL alone, and never replace unrelated startup/restored tabs.

If the original window cannot be identified uniquely, retain the transaction and report recovery required. Do not silently discard the record or guess ownership. Persist recovery identity so another crash cannot create duplicate recovered windows or claim a partial recovery as complete. Corrupt, unknown-version or incomplete transactions fail closed and remain available for diagnosis.

The owner is choosing whether recovery rolls back to the source or finishes the destination. Both snapshots must remain available regardless. This is a product behavior choice, not authorization for a cold build or Electron diagnostic build.

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
