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

## Metadata save ordering and delayed session restore — October 19, 2026

**Save acknowledgement remains an observed failure/gap, not a pass.** The disposable browser's first Session-file write (8-byte header) was held before the syscall. UI initialization, distinct window UUID generation, saving A/B and a complete Spaces switch to B all succeeded while that Session file remained zero bytes. The hook was then released and the disposable browser shut down normally. This directly proves that queued identity registration is not a prerequisite completion acknowledgement for switching. The experiment did not simulate power loss or claim a lost-data recovery outcome; it identifies the missing ordering gate. The harness's `pass` means it reproduced this observation, not that the feature meets durability acceptance.

Source audit: `components/sessions/core/command_storage_manager.cc` Save() invalidates its timer, posts AppendCommands to a sequenced backend and provides only an error callback. HasPendingSave() reflects timer state, not completed IO. Clear/encrypted backends have staged selection rules and delayed encryptor availability. `command_storage_backend.cc` AppendCommandsToFile returns write status internally; no success acknowledgement is propagated through the inspected SessionService path. A delay, an empty pending queue, or AddWindowExtraData returning cannot be treated as durable completion.

**One delayed-restore schedule passes.** With two previously saved windows and a valid synthetic v2 intent, a real Session-file read was held on the backend. A third unrelated regular window was opened via CDP while the read remained held. Its snapshot had no recovery mutation/error and the journal remained. After release, the two real session windows restored; the UUID-matching source recovered, both original saved records and the original decoy remained unchanged, the new third window remained, and the journal cleared. Nonowner windows retained the already-known status error after recovery; this is not a full overlapping/late-duplicate restore qualification.

No product source change or native build. A scoped diagnostic dylib intercepted only owned disposable Session paths; public mock keychain, no real profile/keychain access. Zero-action final guard. Prior measured44files/107hunks unchanged, not re-enumerated. Owned profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified. Evidence includes actual syscall paths/PIDs, before/after snapshots and invocation records.

Required next implementation: carry an identity-generation-specific successful save result from the authoritative session backend to the browser owner; define write-vs-flush guarantees explicitly; refuse/defer destructive switching until that generation is acknowledged; keep errors, encryptor delay and owner destruction fail-closed. This needs a concrete upstream patch inventory before changing the44/120 ceiling; no budget increase or acknowledgement implementation is claimed here. Also still open: late duplicate restoration, multiple overlapping restorer lifetimes, save failures, rebuild/rotation ordering and power-loss durability. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan remains in progress; cold-build accounting and other Task0/F12 gates unchanged.

Evidence: `evidence/ui138-session-save-restore-20261019/`.

## Save acknowledgement implementation proposal — October 19, 2026

The owner requested a fix for the reproduced metadata ordering gap. An **unapplied** patch sketch adds a successful flush result from the selected session backend through CommandStorageManager and SessionServiceBase. It measures **five new upstream files and seven added hunks**, projecting **49 files / 114 hunks** from44/107. The existing44/120 ceiling remains unchanged pending explicit owner approval. No Chromium files/output/profile changed and no build started for this sketch.

New paths: `components/sessions/core/command_storage_backend.{h,cc}`, `components/sessions/core/command_storage_manager.{h,cc}`, and `chrome/browser/sessions/session_service_base.h`. The already-patched session_service_base.cc gains the forwarding method. Counts compare pristine/current/drafted text with the pinned diff flags and record Git version. Candidate API text is reviewable in the evidence directory, not a compiled implementation or acceptance result.

Implementation contract: immediately queue the exact owner UUID again, then request SaveAndFlush; wait for the authoritative clear/encrypted backend and delayed encryptor operations in sequence. A matching owner/generation callback, successful append state and file flush are required before switch intent/staging. Reject busy/pending/error/dead-owner or changed-identity completion; never infer success from timer expiry. Use a weak owner lifetime and a bounded fail-closed timeout if callbacks are dropped during shutdown. Inspect rebuild/write-error ordering and add a generation token to the backend result if a later rebuild could mask failure of the requested batch. The sketch shows the transport/flush seam; that generation validation and the Blanc-owned switch gate must be completed before it is considered correct. Flush success is an OS file-flush acknowledgement, not a claim about hardware/power-loss durability.

Required checks: replay the held-first-write reproducer and prove switching cannot stage/delete tabs while blocked; release and prove matching-generation success permits switching. Inject write/flush errors, delayed encryptor readiness, owner close, identity replacement, rebuild/rotation and callback timeout; preserve source on each refused attempt. Rerun late restoration, duplicate/malformed identities and recovery crash boundaries. Keep all builds incremental and recount before/after. Up to120 hunks remains the proposed limit, with no automatic relaxation if final implementation exceeds it.

Awaiting only the specific file-budget decision: raise44→49, retain120hunks. Plan remains in progress; save-acknowledgement runtime gap remains open. Native input pending; latency deferred; Electron diagnostic build unapproved.

Evidence: `evidence/ui138-save-ack-design-20261019/`.

## Metadata save acknowledgement implemented — October 19, 2026

Owner approval recorded: **"Raise to 49 files; keep 120 hunks"**. Fresh inventory measures **49 upstream files / 114 hunks**, within that limit. Five new upstream session manager/backend/header paths provide a save-and-flush reply through the already-patched SessionServiceBase. The historical 44/107 measurements remain historical.

Before a destructive Spaces switch, the browser queues its exact durable window UUID again, requests a save, and waits for the selected authoritative session backend's valid-file/initial-marker state and OS file-flush result. The requested append is queued before its flush on the same backend sequence; delayed encrypted operations queue append before flush. A failed append closes the backend file, so the immediately following flush refuses rather than acknowledging a later rebuild. No UI task yield occurs between scheduling the batch and its flush. The callback is bound to the owner browser, source capture and a monotonically increasing request generation. Missing/dead/changed owners or sources, errors and stale completions cannot create an intent or stage/remove tabs. This is an OS file-flush acknowledgement, not hardware or power-loss durability.

An initial runtime test exposed a second bug: the native 15-second deadline exceeded the bridge's 10-second deadline, allowing a late completion after the caller timed out. The native deadline is now eight seconds. The failed test is retained. The corrected test receives the native timeout, releases the held write, proves the late callback does not switch, and then completes an explicit retry.

Bounded runtime passes:
- A real first Session write held before its syscall leaves the file at zero bytes, source tabs unchanged and no switch journal; releasing it permits the switch. Repeated with encrypted-only storage selected explicitly, holding the actual Sessions_Encrypted file.
- Injected write EIO and both macOS flush mechanisms failing preserve source tabs and saved records, create no journal, return an error, and allow an explicit retry after injection is removed. Tested under the default configuration, explicit clear-only and explicit encrypted-only storage; default configuration is not assumed to select a particular authoritative backend.
- Source navigation while acknowledgement is pending rejects the stale source capture; the changed page remains and an explicit save/retry succeeds.
- The delayed Session read/third-window restoration schedule passes again. Duplicate persisted UUID, invalid UUID and uppercase UUID regressions safely refuse recovery with records/windows preserved.

Build accounting: one retained compile failure (38.61s wrapper; incomplete SingleThreadTaskRunner type), successful continuation 57.32s, timeout repair 39.36s. All incremental, same output and unchanged GN/toolchain. Final guard schedules zero actions (6.04s). Five focused tests, 11 patch-budget tests and three-module lint pass. Disposable profiles and servers cleaned; retained preview untouched, its host unavailable so original tabs are not reverified.

Remaining qualification gaps: forced delayed-encryptor initialization, explicit owner destruction while waiting, identity replacement during the wait, adversarial rebuild/rotation schedules, late duplicate/overlapping restores, malformed serialization, power-loss/hardware durability and arbitrary lifecycle interleavings. Prior staging/removal crash schedules were not rerun this checkpoint. No full Spaces acceptance or public-controls promotion. Native input pending; latency deferred; Electron diagnostic build unapproved/unstarted. Task 0/F12 gates and cold-build accounting unchanged.

Evidence: `evidence/ui138-save-ack-20261019/` (runtime failures retained alongside final passes).

## Delayed encryptor delivery and owner destruction — October 19, 2026

Four bounded schedules pass: owner destruction while a real first Session write is held, delayed encryptor delivery followed by release, delay through the native acknowledgement timeout followed by release/retry, and source-owner destruction while encryptor delivery is delayed. The normal binary repeats the held-write owner test after diagnostic removal.

The temporary diagnostic pauses the SessionRestore manager's OnEncryptorReady handoff before encrypted-backend construction, only for the exact owned disposable profile. It retains the real encryptor and reschedules through the manager's weak pointer; it does not block the UI thread while waiting. Explicit encrypted-only storage is selected. Three pending operations are observed after requesting the switch, no encrypted Session file exists, source content remains intact, and no switch journal appears. Release permits the queued append/flush acknowledgement and switch. Holding beyond eight seconds returns the native error; release cannot revive the expired switch and an explicit retry succeeds. This qualifies delayed delivery to the session manager, not a real OS keychain/provider failure or cryptographic computation delay.

For owner destruction, CDP closes the source window's actual page targets while an unrelated regular window keeps the profile alive. The source owner disappears before release. After release and the old timeout deadline, no journal or replacement destination appears, the surviving window retains its UUID/content, and that window can save and switch normally. Closing tabs one at a time legitimately changes the saved source through exit flush: an initial overly broad assertion expecting the pre-close store failed and is retained. The final assertion snapshots the store immediately after owner closure and proves the late acknowledgement does not change it. This does not claim whole-window-close preservation of the original tab set or destruction of the entire profile/session manager.

An initial diagnostic launch failed Chromium's blocking-I/O DCHECK before acceptance. The profile-scoped test hook was corrected with a test-only blocking allowance for its local marker checks; the UI delay itself uses asynchronous timers. The failed launch and timeout remain archived. All diagnostic code and its temporary include were removed byte-for-byte afterward; the normal binary was rebuilt and tested. No product-source change from 5c47643a.

The diagnostic inventory measured 49 files/115 hunks initially and 49/116 after its correction, both within the approved 49/120. Restoring the exact source returns to the prior measured 49/114; that final count is source-equality backed, not a new full inventory. Only incremental builds used the existing output; no GN/toolchain changes or cold-build accounting changes.

Remaining: complete profile/session-manager destruction during acknowledgement, provider failure rather than delayed delivery, identity replacement, adversarial session rebuild/rotation, overlapping/late duplicate restoration and arbitrary scheduling/power-loss durability. Full Spaces acceptance remains open. Native input pending; latency deferred; Electron diagnostic build unapproved/unstarted. Retained preview untouched; host unavailable, so original tabs not reverified. Owned profiles/server removed.

Evidence: `evidence/ui138-save-lifetime-20261019/`.

Incremental wrapper times: initial diagnostic 34.75s, repaired diagnostic 36.45s, normal restore 33.55s. Final guard zero actions / 3.94s. 67 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## Profile shutdown and unavailable-provider acknowledgement — October 19, 2026

Two full-browser graceful shutdown schedules pass with an acknowledgement pending. In the first, the SessionRestore manager's real encryptor handoff is delayed and its destructor records three pending encrypted operations. In the second, the first encrypted Session write is held before its syscall; the session-manager destructor is observed before the write is released. Both processes exit with code zero, no switch journal appears, saved Spaces remain unchanged, and a new process using the same disposable profile can save and switch successfully. These tests cover complete application/profile teardown, not hot deletion of one profile while another remains running, or arbitrary forced termination.

The unavailable-provider case supplies a non-null Encryptor with no keys at the SessionRestore manager handoff. The diagnostic confirms IsEncryptionAvailable is false and EncryptString returns nullopt. With encrypted-only session storage selected, two actual switch attempts return the native metadata-save error; source tabs and saved records remain unchanged and no journal is created. No cleartext Session file is observed in this fixture. Clean shutdown exits zero, and restart without the injected unavailable encryptor successfully switches. This is a simulated provider-failure result at the consumer boundary, not a real macOS keychain denial, provider IPC failure, permanent key loss, or in-process provider recovery. The real keychain is untouched; the public mock-keychain mode is used throughout.

A temporary hook scoped to the exact disposable profile records session-manager destruction and holds/replaces encryptor delivery. Its initial two compile failures (private Mojo tag constructor, then missing protected ref-counted destructor) are retained. A first delayed-shutdown run passed teardown but attempted its post-restart save before the page settled; the complete-saved-window guard refused it. That failure is retained; the final harness waits for page readiness before saving. All diagnostic source/include changes are removed byte-for-byte, and the normal binary is rebuilt and passes save/switch, graceful exit and restart/switch checks.

Diagnostic inventory: 49 files / 117 hunks, within the approved 49/120. A pinned-flags recheck confirms the corrected diagnostic manager still has the same four hunks. Normal source equality returns to the prior measured 49/114; no new full normal inventory is claimed. All builds are incremental in the existing output. No product-source changes from 5c47643a; no GN/toolchain or cold-build accounting changes.

Remaining: hot profile deletion/unload, genuine OS/provider failure modes and same-process provider recovery, missing-key decryption of existing records, identity replacement, adversarial session rebuild/rotation and arbitrary lifecycle/power-loss schedules. Full Spaces acceptance remains open. Native input pending; latency deferred; Electron diagnostic build unapproved/unstarted. Owned profiles/server removed; retained preview untouched, host unavailable so original tabs not reverified.

Evidence: `evidence/ui138-save-provider-20261019/`.

Incremental wrapper times: failed diagnostic attempts 7.46s / 10.82s, successful diagnostic 33.24s, normal restore 33.58s. Final guard zero actions / 3.53s. 63 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## Identity replacement and session rebuild/rotation — 2026-10-19

Tests exercise the real native UUID replacement, SessionService reset and current-to-last-session rotation APIs through a temporary control restricted to the exact disposable profile. The write interposer holds the first actual Session header write before its syscall; PID/path and zero-byte file are checked. Both explicit clear-only and encrypted-only session storage use the public mock keychain, never the real keychain.

The established-profile matrix first performs a clean close and restore. Identity replacement while a save acknowledgement is pending rejects the switch before a journal or tab mutation; a fresh save/switch succeeds. Reset and rotation are requested both before acknowledgement starts and while it is pending. The switch stays pending with no journal while the write is held. Successful cases verify the source UUID and untouched decoy contents after an actual owned-browser SIGKILL and session restore. Rotation also requires an observed new Session filename. This does not prove power-loss durability, all rebuild reasons, or arbitrary simultaneous external writes.

A separate fresh-profile first-crash attempt failed to restore the two windows, returning one new blank window instead. That remains an unresolved runtime gap, not a passing matrix cell. The initial cached-identity assertion has a preserved result. A later host-startup timeout and sandbox process-inspection refusal remain in the invocation history; their same-name log files were overwritten by later runs, as explicitly recorded in additional-attempts.txt. The final matrix uses a cleanly primed profile and must not be described as first-ever-session crash coverage.

The first normal-binary smoke attempted to save/switch while restored pages still reported loading and timed out waiting for B; its result/log are preserved. The repeat waits for restored pages before saving. Temporary native diagnostics are removed byte-for-byte and the normal binary rebuilt and checked. Product source is unchanged. Fresh diagnostic inventory is 49 upstream files / 114 hunks; the native diagnostic is in a Blanc-owned file, excluded by the established counting rule. Normal source restoration preserves that footprint within 49/120. All builds use the existing incremental output; no cold-build figures change.

Remaining: first-run crash restoration, arbitrary rebuild/rotation failure schedules, real keychain/provider faults, hot profile deletion and wider lifecycle/power-loss cases. Native input remains pending, latency deferred, and the Electron diagnostic build unapproved/unstarted. Retained preview is untouched; its host is unavailable, so original tabs are not reverified. Owned test profiles/server are removed.

Evidence: `evidence/ui138-save-rotation-20261019/`.

Ten final diagnostic schedules and one normal-binary smoke pass. Incremental wrapper times: diagnostic 41.29s, normal restore 41.27s. Final guard zero actions / 6.2s. 129 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## First-run profile prerequisite for session acknowledgement — 2026-10-19

Reproduced on the prior normal binary: a first-run Spaces switch completes with a 20,992-byte Session file but no Default/Preferences. After SIGKILL, --restore-last-session produces one new blank window. ProfileImpl::IsNewProfile derives new-profile status from preference-store initialization, and StartupBrowserCreator::GetSessionStartupPref ignores forced restoration for new profiles. This is separate from Chromium's intentional crash-loop protection, which normally requires the recovery prompt after a persisted Crashed exit marker.

The existing Blanc integration now waits for PrefService::CommitPendingWrite after successful authoritative Session save/flush, then checks on the disk sequence that Preferences is a readable JSON dictionary. PrefService's callback alone does not report write failure. The original owner/UUID/capture/generation guards and eight-second timeout still gate journal creation; late completion cannot start a switch. No preferences are fabricated or directly written by Blanc. This checks profile initialization readiness, not that every changed preference has persisted when an older valid Preferences file already exists.

Six bounded runtime checks pass: first-ever-profile crash restoration with clear-only and encrypted-only sessions, held Preferences rename/release, rename EIO refusal, held replacement beyond timeout with stale completion ignored, and source navigation while replacement is held. Both first-run cases verify Preferences exists with Crashed exit marker, exact source UUID/URLs, and untouched decoy identity/URLs after restore. Automated restoration uses --hide-crash-restore-bubble only on the disposable restart so the native engine can be tested while native input is pending. Production crash prompting is unchanged; physical Restore-button acceptance is not claimed. This is not general automatic crash recovery or first-run recovery without a Spaces acknowledgement.

The old-source failure and an initial observer failure that assumed Preferences already existed are retained. Injected errors target only the disposable Preferences rename; no real disk, keychain or retained profile is changed. Five capture/window-identity unit tests pass. Prior ten rebuild/rotation schedules are not rerun on this checkpoint; broader lifecycle/provider/power-loss qualification remains open.

One guarded incremental build: 38.38s wrapper / 34.54s Siso, six steps. Final guard: zero actions / 3.59s. Product changes are confined to the Blanc-owned integration file; upstream footprint remains the prior measured 49 files / 114 hunks within 49/120, not newly re-enumerated. No diagnostic native control remains. Latency deferred; native input pending; Electron diagnostic build unapproved/unstarted. Plan remains in progress.

Evidence: `evidence/ui138-first-session-20261019/`.

67 archive members verified against SHA-256. Owned profile/server and stopped raw profile snapshot removed; retained preview untouched, host unavailable so original tabs not reverified.

## Identity/rebuild/rotation rerun on the profile-persistence fix — 2026-10-19

Rerun against 6c1135a1, including its PrefService completion and readable-profile check. The same ten schedules cover clear-only and encrypted-only storage: identity replacement while acknowledgement is pending, and real SessionService reset/rotation before or during pending acknowledgement. A held first Session write proves no early journal. Identity change must refuse without source/store mutation and permit a fresh retry. Reset/rotation must complete after release. Actual process crash/restoration verifies source UUID and exact source URLs, decoy UUID/URLs, and absence of unfinished switch intent; rotation additionally requires a new Session filename.

Profiles are cleanly primed, matching the earlier matrix. Disposable restarts now explicitly use --hide-crash-restore-bubble because the fix correctly persists the Crashed exit marker. This is an automated restoration-engine test, not native Restore-button acceptance or a production prompt-policy change. The separate first-run checks remain at ui138-first-session-20261019.

Temporary test control is restricted to the exact disposable profile, removed byte-for-byte afterward, and the normal fixed binary rebuilt and smoke-tested. No product-source change. Upstream footprint remains the prior measured 49 files / 114 hunks within49/120; Blanc-owned temporary controls do not add upstream paths. No new inventory or unit-test count is claimed. All builds incremental in the existing output.

Remaining: physical recovery UI, arbitrary overlapping/external writers, real provider failures, hot profile deletion, wider lifecycle and power-loss qualification. Latency deferred; native input pending; Electron diagnostic build unapproved/unstarted. Plan remains in progress. Owned test profiles/server removed; retained preview untouched and unavailable, so original tabs not reverified.

Evidence: `evidence/ui138-save-rotation-fixed-20261019/`.

Ten final diagnostic schedules and one normal-binary smoke pass. Incremental wrapper times: diagnostic 38.36s, normal restore 38.86s. Final guard zero actions / 3.58s. 121 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.

## Malformed Spaces recovery journals — 2026-10-19

Eight bounded native checks pass on the normal f45e4107 binary. Synthetic truncated JSON, unsupported version, missing window identity, non-string identity, out-of-range active tab, unsafe file URL and invalid group index are refused with an error. Each retains the exact journal bytes, preserves both source and decoy UUIDs/URLs and the saved store, and refuses a save while recovery is unresolved. A valid v2 control recovers the source and clears its journal while preserving the decoy and store.

The encrypted-session disposable profile uses the mock keychain and cleanly persisted two-window state. Restarts explicitly use the diagnostic crash-bubble bypass only in this test profile; no native recovery-button acceptance is claimed. Invalid journals are replaced only while the test browser is stopped. These are authored serialization negatives, not physical disk corruption, power loss, or exhaustive parser/lifecycle qualification.

Two initial seed attempts failed in the harness: the shell selected Node20 without global WebSocket, and the helper caught that error as host-not-ready. Both failures are preserved. The complete matrix uses bundled Node24.19.0. No product changes or native compilation; final check-only guard schedules zero actions (4.81s). Prior measured footprint49files/114hunks is unchanged within49/120, not re-enumerated. Owned profile/server removed; retained preview untouched and host unavailable, so original tabs not reverified.

Remaining: actual OS provider faults, hot profile deletion, arbitrary overlapping restore/writers, unsaved state and power-loss qualification; full Spaces acceptance remains open. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Evidence: `evidence/ui138-journal-validation-20261019/`.

66 archived members verified against SHA-256. No new unit-test count claimed.

## Overlapping restore and unsaved page state — October 19, 2026

A held actual Session read overlaps two new regular-window creations and closure of one of those windows. The journal remains while held. After release, the original source UUID/URLs recover, the original and surviving new decoys remain, saved Spaces are unchanged and the journal clears. Two bounded runs pass. This is one delayed session restoration with concurrent window activity, not two independent overlapping SessionRestore operations or arbitrary interleavings.

A live authored form with a beforeunload handler refuses switching before any journal/tab/store mutation and preserves its typed value and 700px scroll. After removing the handler and crashing the owned browser, a synthetic valid v2 intent exercises source rollback. The settled-session repeat restores the saved source structure, but the form value is empty and scroll is zero: **unsaved form and scroll recovery fail**. The harness's procedural pass does not mean those acceptance cells pass. The recovery record carries URLs/group/pin/active structure, not live document state; full Spaces acceptance remains open.

An initial immediate crash attempt timed out waiting for three windows and journal clearance. It is retained as unresolved; adding four seconds of session-settling before the repeat is a narrower test, not a product fix or proof of the cause. Nonowner recovery-status errors also remain visible after successful source recovery. No arbitrary overlap, history/form serialization or power-loss claim.

Only disposable profiles and the public mock keychain were used. The Session read interposer is confined to the disposable launch; the final restart uses the normal binary without injection. Explicit crash-bubble bypass is test-only, not physical Restore acceptance. Test helper compilation is not a Chromium build. No product changes or native compilation; final guard zero actions/4.04s. Prior measured49files/114hunks unchanged within49/120, not re-enumerated. Owned browser/server/profile removed; retained preview untouched/unavailable.

Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Remaining: exact concurrent restoration scheduling, immediate post-restore crash behavior, unsaved document state, real provider/hot-profile/power-loss qualification. Evidence: `evidence/ui138-overlap-unsaved-20261019/`.

39 archive members SHA-256 verified. No new unit-test count claimed.

## Preserve session-restored page state during Spaces rollback — October 19, 2026

The old rollback reopened every source URL even when Chromium had already restored the exact source window, destroying its restored page state. After the existing durable UUID, SessionRestore-in-progress, capture and live-tab-ID guards, a complete matching session-restored window is now retained. Its existing tab IDs enter the same completion/journal-clear checks. Mismatching/partially staged windows continue through the existing source reconstruction path. No renderer form extraction or extra plaintext form storage is introduced.

A named authored form populated through CDP Input.insertText and a 700px scroll establish the regression: ordinary settled session restoration retains both; old Spaces rollback loses both; the fixed binary retains both. The earlier fixture used autocomplete=off and direct value assignment, so it was not an adequate guarantee of Chromium form serialization; that limitation is corrected explicitly rather than rewriting historical evidence. beforeunload refusal remains passing. Eight malformed/valid-journal regressions and five focused capture/identity tests pass.

Immediate-crash investigation: cleanly primed two-window and held-read/overlapping three-window repeats recover the expected structural state without the four-second settling pause, but lose very recent form/scroll updates. A no-Spaces immediate control loses those updates too. Source audit records Chromium's delayed page-state synchronization and 2.5-second session-save timer. This explains the unpersisted-state limitation, not the original timeout: **that earlier timeout was not reproduced and its cause remains unresolved**. A separate unprimed control timed out with one new window, retained as a profile-initialization limitation; it must not be substituted as proof of the historical timeout's cause.

This fix preserves state Chromium actually restored. It does not serialize arbitrary DOM state, recover edits lost before session persistence, or retain forms when a partially staged window must be reconstructed from URL/group/pin records. Full unsaved-state and lifecycle acceptance remains open. Password/disabled-autocomplete semantics remain Chromium-owned. Nonowner recovery-status errors remain a separate gap.

One guarded incremental build:42.84s wrapper/36.46s Siso/six steps. Final guard zero/3.49s. Only Blanc-owned source changes; prior measured49files/114hunks unchanged within49/120, not re-enumerated. Test interposer compilation is separate from native build cost. No cold output, GN or toolchain changes. Disposable profiles/servers removed; retained preview untouched/unavailable. Test-only crash-bubble bypass is not native input acceptance. Latency deferred; native input pending; Electron diagnostic build unapproved/unstarted. Evidence: `evidence/ui138-state-preservation-20261019/`.

134 archived members SHA-256 verified; failed/control results remain included.

## Partial Spaces page-state recovery by durable tab identity — October 19, 2026

Version-3 switch journals now carry source tab UUIDs. The existing session metadata acknowledgement includes those UUIDs, and two hooks in already-patched session files preserve them through session rebuild/restoration. Recovery reuses only session-restored tabs whose durable identity and URL both match the source record; missing tabs are reconstructed and staging/imposter tabs removed. The durable window UUID, restore-in-progress, live-tab/capture and completion checks remain. No form contents are extracted into the Spaces store. Versions 1/2 remain supported; only v3 can supply validated tab identities, and malformed/duplicate source identity lists fail closed.

The final binary preserves the authored surviving form and 700px scroll in a partially reconstructed source window containing a missing New Tab, an extra destination tab and a same-URL imposter with different form contents. The imposter is excluded, the missing tab reconstructed, the decoy window unchanged and the journal cleared. The journal is captured from a real switch after acknowledged metadata persistence; the partial session shape is deliberately constructed and cleanly persisted, not a claim of crashing at every staging instruction. Five malformed identity-list cases retain their exact journals/windows/store, and a legacy v2 journal with an unvalidated extra v3 field is handled by the legacy path. The grouped variant also preserves the blue collapsed group and pinned slot. Its follow-on switch exposed an order regression; a native trace showed an old pinned tab still present after asynchronous close, constraining absolute moves. Final staging uses the returned WebContents directly and orders desired tabs at the unpinned end before assigning pins/groups, while completion still waits for the exact final capture. Ordinary and grouped A/B switching pass through journal completion. Five focused capture/identity tests pass.

Three fresh immediate-crash probes on the final normal binary (ordinary restoration plus two legacy-v2 Spaces repeats) restore the expected two-window structure without timeout. All lose the edits made just before the crash, including the no-Spaces control. The original three-window immediate timeout remains unreproduced and unresolved; these observations do not establish its cause. Observed restart completion intervals are diagnostic timestamps, not latency qualification. Recovery still cannot restore document state absent from Chromium's persisted session, including removed source tabs or very recent edits. Nonowner recovery-status errors and wider lifecycle/identity corruption coverage remain open.

Build record: initial incremental compile failed on a missing WebContents forward declaration (13.08s); repaired incremental build63.18s wrapper/59.34s Siso/18steps; validation hardening incremental39.05s/35.15s/sixsteps. Final guard zero actions/4.51s. The complete build invocation table, including the ordering repair and diagnostic iteration, is recorded in the evidence README. Fresh inventory49files/116hunks within approved49/120, two additional hunks in existing paths. Temporary native ordering logs were removed before the final build. No cold output, GN/toolchain changes or native-input/latency runs. The local ESLint invocation was unavailable because this checkout lacks its eslint dependency; module syntax and focused tests passed, with CI pending. Failed fixture API/background-target and stale-marker attempts are retained, not counted as acceptance.

Native input remains pending; latency deferred; Electron diagnostic build unapproved/unstarted. Test-only crash-prompt bypass and mock keychain are confined to disposable profiles. Evidence: `evidence/ui138-partial-state-20261019/`. Plan item4 and broader Spaces acceptance remain in progress.

324 archived members SHA-256 verified. Owned profiles/servers removed; retained preview untouched/unavailable. Normal final incremental40.12s/34.55s Siso/sixsteps; temporary diagnostic38.93s and ordering attempt40.76s are also separately logged.


### October 19 — Missing-tab page state and immediate-crash diagnosis (in progress)

Added durable tab identity to Chromium closed-tab metadata through the existing BrowserLiveTabContext integration. V3 Spaces recovery waits for closed history to load, rejects duplicate matching identities, and can restore a uniquely identified ungrouped top-level closed tab through Chromium's native navigation-state restoration. Identity and committed URL must both match; no URL-only lookup and no form contents added to the Spaces journal. Group/window history entries, grouped tab entries, absent/pruned history and unpersisted edits remain unqualified. Closed history is retained, not consumed by this bounded path; subsequent duplicate identity records deliberately refuse recovery and require further lifecycle coverage.

Two disposable missing-tab runs, including the final bounded binary, recover the closed HTTP source's saved form text and scroll700. A same-URL imposter is excluded, the surviving New Tab and decoy window remain, the journal clears, and A/B/A switching passes. These construct a partial persisted session after authentic journal capture; they are not every possible crash instruction boundary. The focused identity-hook test passes. Evidence: [missing-tab checkpoint](evidence/ui138-missing-state-20261019/README.md).

The original three-window overlap schedule now reproduces the immediate timeout with observations: source and original decoy restore, journal clears and both become idle, but the newly created late-decoy window is absent. The harness times out on its exact-three-window expectation, not on a stuck Spaces transaction. A four-second settled control restores all three and completes. This isolates a persistence-timing boundary but does not prove the precise upstream write that was omitted or fix crash loss of newly created windows. The control's programmatically assigned form value remains absent, while scroll700 restores; this is not a physical typing acceptance test. Earlier typed immediate-edit loss remains open. Nonowner recovery-status errors also remain.

Incremental wrappers only:38.20s (7 Siso steps,34.38s) and39.33s (6 steps,34.47s). Final guard0 actions/3.73s. Fresh footprint49 files/117 hunks within approved49/120; one added hunk in an already patched file. No cold build or Task0 benchmark change. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Broader identity/history lifecycle, nested closed entries, power-loss and original caller/acceptance gates remain open.


### October 19 — Newly created window immediate-crash repair (bounded pass)

The initial-window integration now requests a one-time native Session save/flush after restore finishes and the new regular window's initial navigation settles, instead of relying solely on the ordinary 2.5-second delayed save. It includes all live same-profile window and tab identities in that flush. Callback success is recorded only for the same surviving browser and unchanged captured window; changed captures retry on a later refresh, backend failure remains false/failed. Private windows are excluded. No parallel session format or direct session-file writes were added. The hook runs from the existing host refresh; this is not a guarantee for a crash before the first flush completes or for later unsaved edits.

The original immediate three-window overlap schedule passes with explicit clear and encrypted session storage: source, original decoy and newly created late-decoy all restore with exact UUIDs and URLs, and the recovery journal clears. The new window's save acknowledgement is observed before SIGKILL, without the earlier four-second settled wait. Only disposable restart uses the crash-bubble bypass; native Restore remains pending. Recent programmatically assigned form text and scroll still fail to survive this immediate schedule and are explicitly not claimed fixed.

An initial repair saved the new window but flushed before restored neighbours' UUID metadata was re-enqueued. Both failed clear/encrypted schedules are retained: three windows returned but two identities were absent and recovery safely refused. Including all live identities fixes that observed ordering failure. On the final binary, missing-tab saved form/scroll700 recovery, same-URL imposter exclusion and A/B/A switching also pass. Five focused capture/identity tests pass. Wider overlapping lifecycle, hot profile destruction, initial-window provider/disk fault qualification, grouped/pruned history, duplicate-record lifecycle, first-ever profile persistence and power-loss remain open.

Two incremental wrappers40.19s and38.38s; Siso34.28/34.63s, six steps each. Final guard0 actions/5.51s. All product edits are in the Blanc-owned integration; no new upstream hook/file and no requested budget increase. Existing approved ceiling remains49 files/120 hunks. Evidence: [new-window save](evidence/ui138-new-window-save-20261019/README.md). All owned profiles/servers removed; preview untouched/unavailable, tabs not reverified. Latency deferred, native input pending, Electron diagnostic build unapproved/unstarted. Task0 cold benchmark and other acceptance gates unchanged.

Final inventory confirms49 upstream files/117 hunks, within49/120.


### October 19 — Initial-window save failures and pre-write crash boundary

Six disposable-profile schedules pass their bounded assertions on the unchanged normal binary, in explicit clear and encrypted session modes. Injected EIO at both macOS barrier-flush and fallback fsync sets `initialWindowSaveFailed=true`, while `initialWindowSaved=false`. Removing the fault leaves that failed status during the one-second observation; automatic retry is not implemented or claimed. The new window happened to restore after this flush-error process crash because writes had already reached the OS; that is not durability or power-loss evidence.

Holding the first selected Session write before its syscall keeps both saved/failed flags false. SIGKILL while held loses the new unacknowledged window in both modes, while the previously saved source and decoy return with exact UUIDs/URLs. This is a measured pre-save data-loss boundary, not a recovery pass for that new window. Paired release controls remain unsaved while held, then acknowledge success after release and restore the new window after SIGKILL. Marker PID/path evidence confirms the owned browser and expected clear/encrypted store. The crash helpers match either session store but the recorded selected path is explicitly asserted; release helpers select the exact store. No hardware or power-loss simulation is claimed.

Profiles were primed and cleanly closed before these tests. Restart uses crash-bubble bypass only in disposable profiles; native Restore remains untested. No Chromium source edit or compilation; final guard zero actions/5.16s. Last measured footprint remains49 files/117 hunks within49/120. All six task profiles and servers removed; retained preview untouched (host unavailable, tabs not reverified). Native input pending, latency deferred, Electron diagnostic build unapproved. Remaining gaps include retry after an initial save failure, actual provider/hardware failure, pre-ack recent edits, first-ever profile persistence and broader lifecycle.

Evidence: [initial save boundaries](evidence/ui138-initial-save-boundaries-20261019/README.md).


### October 19 — Automatic retry of initial-window save failures

Failed initial-window Session save/flush attempts now retry from the existing host refresh with exponential delays of1,2,4,8,16 and then30 seconds. The cap bounds retry frequency, not the number of attempts. Only one save may be in flight. Each attempt rechecks regular-profile, restore, settled-navigation and capture eligibility and re-enqueues current same-profile window/tab identities. A weak browser callback and unchanged capture remain required before acknowledgement. The failure flag stays visible until a successful acknowledgement; successful windows stop retrying. Private/restored-window exclusions remain unchanged.

Six normal-binary disposable schedules pass in explicit clear and encrypted modes. Persistent injected flush EIO remains failed/not saved through repeated attempts (three fsync failures observed in each bounded fault window). Removing the fault automatically retries to saved/not failed without an explicit Space command. SIGKILL after that acknowledgement restores the new UUID plus the saved source and decoy UUIDs/URLs. Held-write regressions still report neither success nor failure while pending: killing before the syscall loses the unacknowledged new window, while releasing the write acknowledges and restores it. Pre-flush crash protection is not claimed.

Five focused capture/identity tests pass. One guarded incremental build39.83s wrapper/34.08s Siso, six steps. Fresh footprint49 files/117 hunks within49/120, no new upstream files/hunks. Final guard zero actions/5.11s. No cold build or Task0 benchmark change. All owned profiles/servers removed; preview untouched, host unavailable and tabs not reverified. Profiles were primed; disposable restart alone bypasses the crash bubble. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Long-duration30-second backoff, retry-specific owner destruction or changed-capture schedules, actual provider/hardware failures, first-ever profile persistence and unpersisted recent edits remain unqualified.

Evidence: [initial save boundaries](evidence/ui138-initial-save-retry-20261019/README.md).


### October 20 — Retry backoff and owner/window lifecycle checks

Six disposable clear/encrypted schedules test the unchanged automatic-retry implementation. Long-backoff schedules retain eight failed flush observations with monotonic timestamps, including consecutive30-second intervals, then remove the fault, await successful acknowledgement and crash/restart to verify the new UUID/URL and unchanged source/decoy. These measure retry scheduling, not the deferred performance/latency qualification.

Owner-destruction schedules first cause a save failure, then hold the next retry inside its fallback fsync. Closing that new window before release leaves the two original windows usable; release and later crash/restart do not resurrect the closed owner and preserve source/decoy UUIDs/URLs. Changed-window schedules navigate the retry owner while that flush is held, release it, await successful current capture acknowledgement and verify the changed URL under the same UUID after restart. These are bounded navigation and window-close schedules, not every mutation, entire-profile destruction, or direct observation of every callback rejection branch.

Fault injection is confined to disposable Session paths and validates the owning PID/path. The helper forces the macOS barrier call to fail so fallback fsync can be held; no product controls or native source edits. All task profiles/servers are removed. The first clear long-run cleanup completed owned cleanup but its read-only preview fetch returned ECONNREFUSED; original failure and follow-up are retained. Subsequent cleanup records preview unavailable. Preview untouched; its tabs were not reverified.

No native compilation; guard zero actions/5.32s. Prior measured footprint49 files/117 hunks unchanged within49/120. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Before-ack crashes, first-ever profile persistence, recent unpersisted edits, actual provider/hardware faults, long unattended soak, mutation variants and broader lifecycle remain gaps. Disposable restart alone uses the crash-bubble bypass; no native Restore or power-loss claim.

Evidence: [initial save boundaries](evidence/ui138-retry-lifetime-20261020/README.md).


### October 20 — Retry-specific profile shutdown and tab mutations

Six clear/encrypted disposable schedules exercise the unchanged normal binary. Each first forces initial-window flush failure, then holds the next retry's fallback fsync. Full-browser shutdown is requested while held; releasing the flush allows the process to exit. Restart restores source, decoy and new window UUIDs/URLs. This covers full-browser shutdown and its profile lifetime, not hot deletion of one profile while another remains alive, nor a directly instrumented Profile destructor ordering claim.

Mutation schedules add two tabs and remove the captured original tab during the held retry, or add two tabs and pin the last tab (moving it to the front). After release, a current-state save acknowledgement is observed. An abrupt process crash followed by restart retains exact ordered URLs and pinned flags under the same window UUID, while source/decoy UUIDs and URLs stay unchanged. The pin schedule also requests active-tab selection, but active selection is not asserted across restart and is not qualified here. These are bounded structural changes, not arbitrary grouping, split/move-window, beforeunload, mutation during callback dispatch or every stale-callback branch.

All six task profiles/servers removed; retained preview untouched and unavailable to read-only verification, so its tabs were not reverified. Tests use cleanly primed disposable profiles, explicit clear/encrypted feature flags and disposable restart crash-bubble bypass. No native input claim. No native source change or compilation; final guard zero actions/5.17s. Previous measured footprint49 files/117 hunks unchanged within49/120. Latency deferred; Electron diagnostic build unapproved/unstarted. Hot profile deletion, actual provider/hardware failures, before-ack crash loss, first-ever profile initialization, unpersisted recent edits and broader mutation/lifecycle remain open.

Evidence: [initial save boundaries](evidence/ui138-retry-profile-20261020/README.md).
