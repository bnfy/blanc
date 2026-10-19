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

## Spaces journal failures and multiwindow ownership — October 19, 2026

Five native journal fault cases pass: ENOSPC/EIO on the actual intent temporary write, both F_BARRIERFSYNC and fallback fsync EIO, final intent rename EIO, and completion unlinkat EIO. All markers identify the disposable browser PID and exact profile-local path. The four intent failures leave source tab IDs/URLs and saved records unchanged, expose an error, then successfully switch on retry with journal clearance. Completion-clear failure retains the journal and complete saved records, refuses another save, then restores the source and clears intent on a normal uninjected restart. This is injected syscall-failure evidence, not a physically full disk, power-loss or hardware-durability claim.

Four controlled startup ownership cases pass using a synthetic valid journal plus complete saved A/B store, holding the actual journal fread while windows change. A second regular window and an identical empty regular window cause refusal: neither window changes and intent remains. A private window stays unchanged while the sole regular window automatically restores the source. Closing the candidate window before the read completes leaves the other regular window and intent unchanged. Saved A/B store bytes are unchanged in all four cases. This qualifies safe refusal/private isolation, **not successful multiwindow recovery or identification of the original restored window**. Candidate closure currently leaves recovery pending until another startup; no in-process reassignment is claimed.

Initial acknowledgement helper intercepted unlink rather than Chromium's unlinkat and missed the fault; its timeout is retained. The corrected probe observes actual unlinkat EIO. The first restart assertion ran before host initialization; retained failure, readiness wait corrected, subsequent source recovery passed. Initial intent-only ownership probes are also retained, followed by the four stronger complete-store runs. Earlier switch/restore acceptance remains unchanged.

No product code changed and no Chromium compilation ran. Final guard: zero actions / 3.72 s. Existing footprint remains 41 files / 100 hunks (no new source edits; not freshly recounted). Test helper dylibs were scoped to owned profiles and are excluded from the evidence archive; source/build logs remain. Disposables removed; retained preview untouched, host unavailable so original tabs not reverified. Plan, results and routine ledger updated; public Spaces controls remain hidden. Latency deferred; native input and Electron diagnostic build pending. Task 0/F12/visual acceptance gates remain open.

Remaining: exact durable window identity across session rebuild and both restore paths, live multiwindow recovery rather than refusal, repeated startup ordering, failure around deletion/crash/powerloss, recovery group/pin and unsaved state. Source audit below identifies the integration points; this checkpoint does not expand the patch ceiling or claim them implemented.

Evidence: `evidence/ui138-spaces-journal-ownership-20261019/`.

# Durable window ownership audit — Chromium 157.0.8103.6

Source checkout pristine revision 41520584daa68d0040db7746ae562a0ff82187f6. Read-only audit; no upstream changes in this checkpoint.

- `chrome/browser/sessions/session_restore.cc:1335` receives restored window extra_data. Lines 1353–1355 assign restore_id only under IS_OZONE. Mac cannot use that ID as the prior-session identity. The subsequent extra-data handling recognizes individual existing features, not a generic Blanc token.
- `chrome/browser/sessions/session_service.cc:376` exposes AddWindowExtraData for incremental command storage. Writing a custom token once is insufficient: session rebuild must retain it too.
- `chrome/browser/sessions/session_service_base.cc:764` explicitly appends existing feature window metadata during rebuilding. A Blanc UUID would need corresponding rebuild coverage here.
- `chrome/browser/ui/browser_live_tab_context.cc:208` enumerates closed-window extra data, and the restore path around line 509 consumes named features. Both collection and restoration must retain a token if Recently Closed/window restoration can intersect pending intent.

Candidate implementation: generate an opaque browser-owned regular-window UUID; include it in intent and session window extra_data, retain it during session rebuild, and attach it to the restored BrowserWindowInterface before recovery considers that window. Reject missing/duplicate/unknown UUIDs and defer until session restoration settles. Do not reuse title, workspace, window order, URL similarity, or active focus as identity. A session save acknowledgement/durable ordering also needs proof before claiming the token survives a process crash.

Likely upstream touch points are session_service_base.cc, session_restore.cc and browser_live_tab_context.cc, none present in the current 41-file inventory. The native helper can call the existing AddWindowExtraData API without editing session_service.cc. Exact diff/hunk cost is not measured; a straightforward design would add three paths (44 total), so the present 41-file ceiling is unchanged and this implementation is not started. A patch-consolidation audit or explicit bounded budget change must precede that approach. This is a candidate integration design, not proof that three changes alone suffice.

## Durable window identity budget request — October 19

Unapplied hook sketch: three new upstream paths / seven hunks, projected44files/107hunks. Existing41/120 ceiling unchanged; explicit owner budget response pending. Design and acceptance contract: `evidence/ui138-window-identity-design-20261019/README.md`. No product source/build/profile changes or new runtime claims. Identity save acknowledgement remains a prerequisite to prove. Latency deferred; native input/Electron diagnostic build pending.

## Durable window identity — October 19, 2026

Owner explicitly approved: **Raise to 44 files; keep 120 hunks**. The counter and §7 now use that ceiling. Actual measured footprint: **44 upstream files / 107 hunks**, with exactly the three reviewed new paths. No further expansion.

Regular prototype windows receive a browser-owned UUID. Session rebuild serializes it, normal session restoration reattaches it, and native Recently Closed exports/imports it. Private windows have no identity. New version-2 switch journals bind their saved source to that UUID; recovery requires one matching same-profile window after session restoration settles. Missing/invalid/duplicate matches are refused instead of choosing by URL, title or window order. Version-1 journals retain their earlier restricted fallback. Current-session tab IDs/capture are still revalidated after disk work. Incremental identity metadata is queued through SessionService; an acknowledgement of durable save is not available from the inspected interface and is not claimed.

Two real two-window runs pass: first distinct content, then identical two-tab URL/layout contents. UUIDs survive normal restart; the owned browser is then SIGKILLed while a diagnostic rename hook holds immediately after the version-2 journal is atomically installed. Restart with Chromium session restore automatically recovers the UUID-matching source, clears intent, preserves both saved records and leaves the other window's content/identity unchanged. This is a before-staging journal-commit crash point, not all prior staging/removal points rerun under version 2. Native Recently Closed window restoration independently preserves the source UUID and two-tab content. Private window identity is empty and saving is refused. A valid but nonmatching UUID in a synthetic version-2 intent leaves both restored windows unchanged and retains the journal.

Five focused tests and three scoped module lint checks pass. First build failed on two diagnostics from one dictionary chaining expression; repaired without changing args or cleaning output. Initial incremental wrapper38.12s failed, continuation56.99s succeeded (50.68s Siso,9steps). Final guard0/4.44s. A package-resolving lint invocation was canceled because this worktree has no node_modules; the existing installed scoped linter passed. Actual runtime proofs and failures are retained. No Electron diagnostic build or latency run. Owned profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified.

Remaining: crash before newly queued identity metadata reaches disk, explicit session-rebuild fault injection, duplicate/malformed persisted UUID runtime tests, version-2 crashes during staging/removal/recovery, late overlapping restore windows, original-session unsaved state, deletion/power-loss durability and public recovery UX. Missing identity intentionally leaves recovery pending; successful full multiwindow/lifecycle acceptance is not claimed. Nonowner windows can retain a recovery-status error until reinitialization. Public Spaces controls remain hidden. Native input pending; latency deferred; Electron diagnostic build unapproved. Task 0/F12 and plan item4 remain open.

Evidence: `evidence/ui138-window-identity-20261019/`. Routine implementation/test time only; Task0 cold column unchanged.

## Window identity and recovery boundaries — October 19, 2026

Four actual abrupt exits pass with version-2 durable identity journals: after the first destination tab, all destination tabs, first actual source removal and all source removals. Temporary profile-scoped native diagnostics record live URLs at each boundary (3,4,3,2 tabs respectively) and exit86. After real Chromium session restoration, only the matching source UUID is recovered automatically, both saved records remain byte-equivalent as parsed JSON, the unrelated window retains its UUID/content, and the journal clears. This extends the prior before-staging journal-write crash proof; it does not prove every interleaving or power-loss durability.

With the owned browser stopped, the duplicate-identity harness replaces the second window UUID with the first in both plaintext and mock-keychain-encrypted Session records. No real keychain/profile is accessed. A synthetic valid v2 intent then targets that duplicated UUID. Both restored windows expose the duplicate, recovery reports no unique match, both window contents and saved records remain unchanged, and the journal remains. Repeated on the restored normal binary. This proves bounded duplicate persisted identity refusal, not late-arriving duplicate ownership or malformed-record handling.

All four crash cases, normal-binary duplicate refusal and normal A→B→A switching with explicit completed saves pass. The initial immediate B→A attempt was refused by the complete-saved-window guard; that failure is retained. A second snapshot sampled one source-removal callback before completion; final verification waits for the journal acknowledgement and exact final tab count. Both attempts are retained. Immediate reverse-switch acceptance is not claimed. Native diagnostics removed byte-for-byte; normal binary rebuilt and tested. Two guarded incremental builds only: diagnostic wrapper 38.65s and normal restore 37.91s. Final zero-action guard 5.16s. Product source unchanged from536e33bd; prior measured44files/107hunks within44/120 remains unchanged, not re-enumerated. Test profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified.

Remaining: metadata save acknowledgement/crash before identity persistence, late or overlapping session restores, malformed persisted identities, crash during v2 recovery itself, groups/pins/unsaved page state across these exact boundaries, arbitrary interleavings and power-loss/deletion durability. Full multiwindow recovery acceptance and public Spaces controls remain open. Native input pending, latency deferred, Electron diagnostic build unapproved. Other Task0/F12 gates unchanged. Routine evidence/testing only; cold-build ledger unchanged.

Evidence: `evidence/ui138-window-recovery-boundaries-20261019/`.

## Interrupted recovery and malformed identity — October 19, 2026

Four version-2 recovery interruption schedules pass. Each starts with two regular windows, persists their distinct UUIDs, crashes after the first destination tab during a switch, then restarts with real session restoration and crashes again during automatic source recovery: first/all source tabs staged, first/all prior tabs removed. The exact recovery marker is recorded and the journal remains byte-identical across the second crash. A third launch without the crash flag restores exactly the saved source content under its original UUID, preserves the decoy and saved records, and clears the journal. This is bounded process-crash coverage, not power-loss or every callback interleaving.

Two synthetic malformed persisted identity cases pass on the restored normal binary: 36 invalid characters and an uppercase UUID. Only owned disposable plaintext/mock-encrypted session records are mutated using Chromium's public mock keychain. Restored source identity is empty, the decoy retains its valid identity/content, both windows and saved records remain unchanged, recovery reports no unique match, and the valid journal remains. No fallback UUID is invented. This does not qualify malformed serialized lengths, missing metadata save acknowledgement, or late-arriving restore windows.

Temporary diagnostics removed byte-for-byte and normal binary rebuilt. Incremental wrappers: diagnostic 39.02s, normal restore 36.82s; final guard0/3.28s. Product source unchanged; prior measured44files/107hunks remains unchanged within44/120, not re-enumerated. Owned profiles and fixture server cleaned; retained preview untouched, host unavailable so its original tabs not reverified.

Remaining: metadata save acknowledgement/crash before initial identity persistence, late or overlapping restores, malformed session serialization and journal variants, groups/pins/unsaved state at these boundaries, arbitrary scheduling and power-loss/deletion durability. Full Spaces acceptance/public controls remain open. Native input pending; latency deferred; Electron diagnostic build unapproved. Task0/F12 gates unchanged. Routine testing evidence only; cold-build accounting unchanged.

Evidence: `evidence/ui138-recovery-interruption-20261019/`.
