# Split View migration baseline — PR #993

Reviewed source commit `98ea48fc01d79759cfef40009b18cf69715eaed8` from bnfy/blanc#993 on October 20, 2026. PR 1 implements two panes; the pure model supports 2–4. PR 2 features must not be claimed from that fact. The spec says Glance itself remains temporary: Keep as split creates persistent equal panes.

## Contract and native mapping

| Electron #993 behavior | Chromium work required |
| --- | --- |
| Focused pane equals activeTabId for Split View | Add distinct persistent-split mode; do not reuse Glance MainIndex for persistent split identity. |
| Keep as split / Split with; initiating group wins | Native ownership/group eligibility validation and explicit conversion; preserve current ratio. |
| One split row; shortcut counts once | Panel and rail cluster adapters, selection/focus and grouped moves. |
| 30px headers on every pane; centered Island | Native geometry and header hit regions, divider/fallback implementation and visual comparison. |
| splits + splitIds parallel to URLs | Native snapshot, Spaces store/journal/session schema and recovery must preserve these columns. |
| Close Split is one Recently Closed entry | Persist membership/layout/focus and whole-entry restore; preserve legacy compatibility. |
| Pin removes pane, keeps it shown; removed pane follows row | Explicit order and group policy across native tab actions. |
| No quiet/archive for visible panes; no Glance while split visible | Lifecycle and eligibility guards across all command entrypoints. |

## Initial reference checkpoint (superseded by native checkpoint below)

Copied the three first-party pure model/layout modules byte-for-byte into `electron-split-reference/`; provenance records source commit and SHA256 digests. Existing MIT terms apply. The Spaces capture adapter now delegates split serialization to that exact model and emits parallel splitIds plus layout/focusedIndex records. Seven tests pass, including restoration with new tab IDs, temporary Glance exclusion, private refusal and incomplete capture when an unsupported member is omitted.

This adapter is not the native persistence implementation. Native SpaceCapture/SpaceDisk still need a versioned split-aware schema and validated restore. No live Split View UI, native multi-pane persistence, resize, focus or crash acceptance is claimed. Three/four-pane runtime support is not implemented. Imported Electron restore limitations (including malformed pinned/mixed-group records identified in #993) are not silently considered resolved; validate at the native admission boundary before enabling the feature.

A draft older-Glance promotion implementation was compiled before the owner supplied #993. It was removed before commit/UI exposure and the normal binary restored by a second guarded incremental build. Its standalone policy tests are not Split View evidence. Retained preview was not restarted or modified. No upstream patch-count change; last authoritative inventory 49/117 within49/120. Latency deferred; Electron diagnostic build unapproved.

Next: add an explicit native persistent-split snapshot/schema, preserve focused identity, and exercise Spaces capture/restore before exposing Keep as split. Treat the remaining #993 review findings as a checklist rather than migrating them blindly.

## October 20 — Native Split View persistence and recovery

Implemented a bounded native path based on PR #993 at98ea48fc: one active two-pane columns split, matching string tab IDs, saved widths/focusedIndex, explicit persistent metadata, store v2 and journal v4. Existing unsplit versions remain readable. Native save/reopen, Split/Plain round trip, actual session crash restart, journal-boundary source rollback, equal-pane visibility, 40/60 layout, seven malformed-record refusals and temporary-Glance exclusion across restart pass. Session-rebuild marker loss found during testing was repaired through existing hooks. Eight focused tests and scoped lint pass. Evidence: `evidence/native-split-persistence-20261020/README.md`. Four successful incremental builds plus one retained compile failure; final guard0. Fresh footprint49files/117hunks remains within49/120; no budget increase needed.

Multiple/inactive splits, global split identity, pane headers/rail/public controls, group-policy and whole-split Recently Closed runtime parity, later staging crash boundaries and broader lifecycle/provider faults remain gaps. Native runtime tests use disposable profiles and diagnostic crash-bubble bypass; retained preview untouched. Latency deferred; Electron diagnostic build unapproved.

## October 20 — Multiple and inactive native Split View

Extended PR993-based native persistence to multiple two-pane splits with independent last-focused members, including when a loose tab is active. Focus metadata survives session rebuild/closed-tab capture; native snapshot and restore preserve each membership separately. Two-split Spaces round trips, actual browser crash/session restore, actual journal-boundary source rollback, independent30/70and65/35layouts and repeated clean restart pass. Seven malformed multi-split records are refused unchanged. Initial unequal-width fixture changed the saved source and was correctly refused; final test uses a separate destination. Eight focused tests and scoped lint pass; one56.47s incremental build, idempotentprepare, finalguard0. Fresh49files/117hunks within49/120. Evidence: `evidence/multi-split-persistence-20261020/README.md`.

Runtime qualification is bounded to two splits in a regular disposable profile. Global split identity, historical unknown inactive focus, arbitrary counts, private/multiwindow/group/pin mutations, later staging/partial-history recovery and broader provider/durability cases remain gaps. Public controls/pane headers/rail and full Recently Closed parity remain open. Retained preview untouched; latency deferred; Electron diagnostic build unapproved.

## October 20 — Private and multiwindow Split View recovery

Evidence-only checks on65ecb3a1: two regular UUID-owned windows retain independent split membership/focus across actual browser crash; private Spaces save/open/recover refuse, private fixture URLs are absent from the Spaces store and private tabs do not return after restart. Actual journal-boundary crash rolls back the source UUID and leaves the other split window unchanged. Two bounded runs pass; final normal exit0. Evidence: `evidence/private-multiwindow-split-20261020/README.md`. No compile; final incremental guard0; unchanged prior49/117 within49/120.

Private native pair creation succeeds but snapshot splits are omitted by the persistence-only capture path: private snapshot/UI parity remains a gap. Multiple splits combined with multiwindow, private focus/layout visuals, group/pin mutation and later/partial-history recovery boundaries remain unqualified. Physical recovery input pending; latency deferred; Electron diagnostic build unapproved. Retained preview untouched.

## October 20 — Private Split View live snapshot fix

Separated live split snapshot generation from Spaces persistence admission. Private snapshots now expose exact native member IDs, layout and last-focused pane while private persistence remains refused and marker updates remain memory-only. Seven bounded runtime checks pass: private active/inactive focus metadata, adapter/native persistence refusal, store/private restart exclusion, regular multiwindow crash preservation and journal-boundary source rollback with decoy unchanged. Eight focused tests pass. Evidence: `evidence/private-split-snapshot-20261020/README.md`.

Initial signed-index compile failure retained and repaired; successful guarded incremental build41.46s/sixsteps, finalguard0. No upstream hook changes; prior49/117within49/120 unchanged. Private visuals/native input, multiple private splits, group/pin mutation and broader lifecycle/recovery boundaries remain gaps. Retained preview untouched; latency deferred; Electron diagnostic build unapproved.

## October 20 — Multiple private splits and mutation differences

Evidence-only run on6ac8714e confirms two inactive private splits retain independent focus, privacy flags survive mutations, pinning dissolves the affected two-pane split without losing tabs, private Spaces operations refuse and the regular store remains byte-identical. Private context disposal leaves regular window intact. Eight recorded checkpoints completed, not eight parity passes.

Two confirmed differences against pinned #993: grouping one pane dissolves the split instead of moving all members into its group; unpinning leaves the tab at the front instead of moving it to the end. No repair included. Evidence: `evidence/private-split-mutations-20261020/README.md`. No compile; guard0; prior49/117unchanged. Broader group/move/close/reorder/private-multiwindow and native visual coverage remain open. Latency deferred; native input pending; Electron diagnostic build unapproved; preview untouched.

## October 20 — Split grouping and unpin-order fixes

Repaired the two observed #993 differences: group operations apply to all native split members, and unpinning an ungrouped tab appends it to the end. Nine bounded private runtime checkpoints pass, including new/existing-group moves, ungrouping with membership/focus retained, affected-split-only pin dissolution, append-on-unpin, private capture/native persistence refusal, byte-identical regular Spaces store and context disposal. Eight focused tests pass. Evidence: `evidence/private-split-group-fix-20261020/README.md`.

One35.93s/sixstep guarded incremental build, finalguard0; no upstream hook changes, prior49/117within49/120 unchanged. Grouped persistence/recovery, broader merges/moves/reorders, Recently Closed and physical/visual checks remain unqualified. Preview untouched; latency deferred; native input pending; Electron diagnostic build unapproved.

## October 20 — Grouped Split View recovery failure

Grouped Spaces round trip passes with exact source UUID, membership, right focus, blue collapsed group and loose active tab. Actual crash restart fails the two-window gate: only the source grouped split returns; the second grouped window is absent. Fresh ten-second settled control repeats this missing-window result; cause unresolved. Journal-boundary recovery stage not reached. Green CI cannot close this runtime failure. Evidence: `evidence/grouped-split-recovery-20261020/README.md`.

Initial invalid color-name fixture refusal retained; hexadecimal-color runs used thereafter. No implementation repair/compile; guard0; prior49/117unchanged. Profiles removed, preview untouched. Native input pending; latency deferred; Electron diagnostic build unapproved.

## October 20 — Missing grouped-window save repaired

Before-fix native session streams contained only the source UUID despite both windows reporting initial save success. Initial-window acknowledgement now rebuilds commands from current native browsers before the existing flush. Fixed stream contains both windows. Six grouped runtime checkpoints pass, including Spaces roundtrip, actual two-window crashrestore and journalboundary source rollback preserving blue collapsed group/focus/layout/UUID and decoy. Nine private regressions and eight focused tests pass. Evidence: `evidence/grouped-window-save-fix-20261020/README.md`.

One35.56s/sixstep incremental build; finalguard0; prior49/117 unchanged. Short diagnostic-startup timeout retained; final established-timeout run passes. Broader concurrent/pending-close/provider/write-error rebuild cases and powerloss remain unqualified. Rebuild latency unmeasured/deferred. Native input pending; Electron diagnostic build unapproved; preview untouched.

## October 20 — Concurrent-window recovery failure

Overlapping new-window creation acknowledges all live owners but actual crashrestart returns only a new NewTab window. Combined close/replacement/beforeunload-pending schedule fails; fresh direct-firstrestart repeat confirms1instead4. No-dialog close/replacement control and creation-only control both restore1instead3. Thus overlapping creation is sufficient; close/dialog not necessary. Cause unresolved; no repair included. Evidence: `evidence/concurrent-window-recovery-20261020/README.md`.

Live source split preservation and successful pending-dialog dismissal do not qualify recovery. No compile;guard0;prior49/117unchanged. Profilesremovedpreviewuntouched. NativeinputpendinglatencydeferredElectronbuildunapproved. GreenCI does not close this runtime failure.

## October 20 — Concurrent-window crash restoration repaired

The fresh-profile reproduction contained all three window UUIDs in its native session streams, but no `Preferences` file. Restart therefore treated the profile as new and skipped restoration. Initial-window acknowledgement now orders the profile preference write and requires a readable dictionary before marking the window saved, retaining the existing owner/capture validation and retry handling. PrefService completion does not itself report write errors; this is a restart-prerequisite check, not a power-loss guarantee.

Creation-only crash recovery passes with all three exact UUIDs and normalized contents. The combined overlapping-creation, completed-close/replacement and genuine beforeunload-pending-close schedule passes with all four remaining windows restored; the closed window stays excluded and source grouped split state is preserved. Ten recorded runtime checkpoints across these two runs and eight focused tests pass. Before-fix failure and decoded session evidence are retained in `evidence/concurrent-window-fix-20261020/`.

One 36.09-second/six-step guarded incremental build; final guard zero. No upstream hook changes; prior authoritative footprint 49 files/117 hunks remains within 49/120. Fresh profile directories removed; retained preview untouched. Broader provider/write-error/rebuild interleavings, failed preference writes, power loss and unpersisted recent edits remain unqualified. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.

## October 20 — Preference-write and unavailable-provider recovery

Fresh-profile Preferences rename EIO tests pass with clear and encrypted-only session storage. The actual scoped rename hook records EIO, no Preferences file exists, and initial save remains failed through repeated attempts. Removing the fault permits automatic retry; an actual browser crash then restores the exact saved window identity and contents. This covers a missing-file write failure, not an existing stale Preferences dictionary, physically full disk or general preference durability.

A temporary diagnostic supplies an Encryptor with no keys only to the exact disposable profile's SessionRestore consumer. IsEncryptionAvailable is false and EncryptString returns nullopt. Initial-window save stays failed; two Spaces switch attempts refuse while preserving source and stored bytes. No cleartext Session file is produced. Graceful shutdown succeeds; a fresh process with the fault removed acknowledges a save and subsequently crash-restores the exact window. This is not an actual OS keychain/provider failure, same-process provider recovery or loss of decryption keys for existing records.

The diagnostic is removed byte-for-byte and the normal binary rebuilt. Native input remains pending, latency deferred, and the Electron diagnostic build unapproved/unstarted. Broader preference/provider/lifecycle and power-loss gates remain open. Retained preview untouched.

Four schedules (15 recorded checkpoints) and eight focused tests pass. Diagnostic and normal incremental builds: 28.39s and 28.34s, six steps each; final guard zero. No permanent code changes. Prior normal footprint49/117 unchanged; temporary two-hunk addition in an already-patched file gives a conservative49/119 upper bound within49/120, not a new full inventory. Four disposable profiles removed. Evidence: `evidence/preference-provider-recovery-20261020/`.

## October 20 — Stale Preferences and same-process encryption recovery

Clear and encrypted-only stale-file schedules confirm that an existing readable Preferences dictionary permits initial-window acknowledgement even when its replacement fails with injected rename EIO. The old bytes remain unchanged. Actual crash restart nevertheless restores the exact window UUID and contents in both cases. This establishes the existing check's limited contract: restart eligibility, not freshness or successful persistence of all current preferences. A stale readable file can mask the rewrite error; latest-preference durability remains an explicit gap.

The encrypted-session consumer also recovers in the same browser process after a scoped no-key serialization fault is removed. Initial acknowledgement and a switch refuse while the fault is active; source/store are preserved. Fault removal allows automatic initial save and explicit switching with the same PID, no cleartext Session fallback, and subsequent exact-identity crash restoration. The real encryptor is retained throughout; temporary serialization selects a no-key Encryptor to produce actual encryption-unavailable results. This tests recovery of the session consumer after transient encryption errors, not reacquiring keys, OS keychain unlock, provider IPC reconnection or same-process replacement of a permanently unavailable provider. Those remain gaps.

The stale fixture seeds a minimal authored readable dictionary, not an old production profile. Other stale schema/content and current-preference durability remain unqualified. No product code changes; temporary diagnostic removed byte-for-byte and normal binary restored. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.

Four schedules (11 checkpoints) and eight focused tests pass, including a normal-binary stale-file repeat. Incremental diagnostic/restore builds30.69s/30.34s, six steps each; final guard zero. Prior normal49files/117hunks unchanged; temporary one-hunk addition in an existing patched file gives conservative49/118 upper bound, within49/120. No new full inventory claimed. Four test profiles removed; retained preview untouched. Evidence: `evidence/stale-provider-recovery-20261020/`.

## October 20 — Stale preference acknowledgement repaired

Owner approval: **"Raise to 50 files; keep 120 hunks"**. A prototype-only preference is registered through Chromium's normal profile registration. Both initial-window and Spaces-switch acknowledgements now write a process-unique epoch plus increasing sequence through PrefService and require that marker (or a later sequence from the same process) in Preferences after completion. An old readable file no longer satisfies a fresh request. Later coalesced writes can satisfy earlier requests; owner/capture/timeout/retry validation remains. No direct writes to Preferences from the prototype.

Clear and encrypted-only tests inject actual Preferences rename EIO. An old-process marker refuses initial acknowledgement and switching with source/store unchanged; removing the fault permits automatic retry. A previous marker from the same process also refuses a later switch under EIO, then explicit retry succeeds and crash restart restores the exact authored-page owner. Twelve checkpoints across these two schedules pass.

The first clear run retained a separate failure: a successful Source switch produced two blank New Tabs and restart restored one. Its five acknowledgement checkpoints passed before the final exact-tab assertion failed. The final clear/encrypted recovery runs remove blank tabs before saving the fixture; they do not close this blank-tab lifecycle discrepancy. First-attempt evidence is retained.

This verifies the ordinary Preferences write marker, not Secure Preferences, all preference freshness under arbitrary concurrent edits, or hardware/power-loss durability. Broader provider/rebuild/lifecycle gates remain open. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.

Concurrent creation/replacement/pending-close crash recovery also passes all six checkpoints, restoring four remaining window identities and preserving the source grouped split. Total final schedules:18 checkpoints plus eight focused tests. One42.21s/seven-step guarded incremental build; final guard zero. Fresh authoritative footprint50files/118hunks within owner-approved50/120. All four disposable profiles removed; preview untouched. Evidence: `evidence/preference-ack-fix-20261020/`.

## October 20 — Split View / Glance eligibility

Rechecked merged PR993 at unchanged98ea48fc. Native Glance now refuses while any native split is visible, even when supplied two loose tabs. Glance closure synchronously revalidates temporary ownership. Eight bounded regular/private runtime checks pass, including unchanged refusal state, inactive-split allowance, close preserving split, immediate save and Spaces reopen. Seven capture tests pass; two guarded incremental builds and final zero-action guard. Initial fixture failures retained and not mislabeled as product regressions. No new upstream hooks; prior50/118 within50/120. Public controls, headers/dividers/rail, whole-split Recently Closed and broader lifecycle remain open; latency deferred, Electron diagnostic build unapproved, preview untouched. Evidence: `evidence/split-glance-eligibility-20261020/README.md`.

## October 20 — Public Split View controls and pane headers

PR993-based Split with choices are available in the Island tab menu; initiating group wins. Reserved30px persistent-pane headers provide live title/favicon, focus, Back and Remove from Split. Removal retains both tabs and puts the removed pane after its survivor. Final21 automated regular/private checkpoints and seven capture tests pass, including public menu activation, header focus/title, order and Spaces save/reopen. Initial const compile failure retained; incremental repair48.76s/11steps, guardzero. Fresh50files/116zero-context hunks within50/120. Evidence: `evidence/split-public-controls-20261020/README.md`.

Still open: public Glance Keep as split, full pane menu/divider, exact unequal-width alignment, rail clustering/shortcut semantics, whole-split Recently Closed, Back history scenario, physical input/full visual and broader lifecycle. Menu choices are currently a scrollable list rather than nested submenu. Latency deferred; Electron diagnostic build unapproved; retained preview untouched.

## October 20 — Split View divider and pane menus

PR993-based persistent divider drag, keyboard sizing/reset and accessible values now control the native ratio, with ordered visible-pair validation. Pane menus provide reload, per-tab mute, pin, remove and close; Escape returns focus. Final 37 automated regular/private checkpoints and seven capture tests pass, including saved 55/45 ratio recovery and destructive pane actions. Initial compiler shadowing failure and inactive-private-fixture timeout retained; repaired incremental build 35.17s/six steps, final guard zero. Fresh footprint 50 files/118 hunks within approved50/120. Evidence: `evidence/split-divider-menus-20261020/README.md`.

Remaining: full-height/narrow-window alignment, complete group/move/whole-split menu parity, public Glance conversion, rail/shortcut/Recently Closed integration and broader lifecycle/physical-input/accessibility checks. Header handle only; no full visual parity claim. Retained preview untouched; latency deferred and Electron diagnostic build unapproved.

## October 20 — Full-height divider / narrow geometry checks

Thirty actual regular/private window cases captured at1200/900/700/600/500px and20/50/80 percent. Four width500 extreme-ratio header-overflow failures remain; no repair yet. Pinned PR993 pure layout expects stacked rows in12 width600/500 cases, whereas native stays side-by-side. Full-height source audit also finds double-click swap versus #993 reset and50px versus percentage keyboard steps. These native-input behaviors remain unverified: CUA selected retained preview, so no input was sent. Evidence: `evidence/split-narrow-geometry-20261020/README.md`.

No compile/product changes; zero-action guard, prior50/118 unchanged. Next: coordinate narrow fallback/native/header geometry and divider semantics, then test native full-height hit regions. Green CI does not close these runtime parity failures. Latency deferred; Electron diagnostic build unapproved; retained preview untouched.

## October 20 — Narrow layout and full-height divider repair

Owner approved51 files/120 hunks. The native layout hook now shares page/header/gutter geometry: minimum300px columns, stacked rows below612px, focused-pane fallback for short windows. Fallback preserves saved column ratios. Full-height Island gutter double-click resets widths without swapping; transient fallback resize is refused. Former500px header overflow is repaired in all four cases.

Final context-matched regular/private matrix:30 geometry cases plus wide-return ratio/full-height CDP reset/short-focus/Spaces observations (71 records including30 pre-resize snapshots). Existing37 pane/menu regression checkpoints, seven capture tests and eleven counter tests pass. Compiler failures and zero-size probe runtime failure retained; probe publication fixed. Incremental successes48.98s and36.01s; final guardzero. Fresh51 files/120 hunks is at the approved ceiling. Evidence: `evidence/split-narrow-fix-20261020/README.md`.

Physical native hit-testing, broad accessibility, rail/fullscreen/drag-drop and display-scale/lifecycle matrices remain open. No full acceptance claim. Retained preview untouched; latency deferred; Electron diagnostic build unapproved.


## 2026-10-20 — Split View rail, numbered commands and Recently Closed

Implemented against PR993 at 98ea48fc01d79759cfef40009b18cf69715eaed8: persistent pairs appear as one rail row with both icons/titles and last-focused-pane activation. Explicit Close Split View uses native batch closure, creating one Recently Closed Split entry. Island reopening restores persistent markers, ratio and last focus, including explicit-entry reopening after restart. Native numbered commands count splits once (and group/pinned/loose clusters in grouped windows); cyclic navigation still visits each pane. Private closure creates no history.

Validation: 31 regular/private acceptance checks, 37 pane regressions, seven capture tests and eleven counter tests pass. Initial missing restore metadata was repaired. A later most-recent restart timeout was a fixture assumption: shutdown added a newer Window entry; known-latest split and explicit-entry restart semantics are now tested separately. Pane drag fixture failures were overlay interception and pass after dismissal. Failed attempts retained in [evidence](evidence/split-rail-shortcuts-20261020/README.md).

Five guarded incremental builds (37.83/61.85/37.77/37.56/37.95 seconds), final guard zero. Fresh upstream inventory: 51 files/122 hunks, exactly the owner-approved ceiling. No latency measurements or Electron diagnostic build. Retained preview untouched. Physical shortcuts, browser-menu/accelerator Restore Tab metadata, whole-split drag/reorder, group/window-contained history, partial beforeunload cancellation and wider platform/accessibility parity remain open; this is bounded migration acceptance, not full PR993 parity.


## 2026-10-20 — Native Restore Tab and whole-split reorder

Based on PR993 at 98ea48fc01d79759cfef40009b18cf69715eaed8. Rail pointer and Alt+Shift+Arrow reordering now move persistent pairs as one native collection, including group changes and destination-split boundary normalization. The shared chrome::RestoreTab entry point restores loaded persistent-split history with metadata, ratio and focused pane. Ordinary tab restoration retains native behavior; private restoration remains inert.

Final 48 regular/private runtime checkpoints pass, plus seven capture and eleven counter tests. Earlier 47-check drag control passed. Initial synthetic click-sequence failure and real action-path bypass are archived; the command-switch hook was replaced with the shared entry-point hook. [Evidence](evidence/split-native-restore-drag-20261020/README.md) includes failed attempts and final results.

Owner approved 52 files/124 hunks after runtime proved the initial 51/123 hook was bypassed. Fresh inventory is exactly52/124. Three incremental builds38.93/70.23/41.68s; final guard zero. Disposable profiles removed, retained preview untouched. Latency deferred; Electron diagnostic build unapproved. Physical native input, unloaded-history async restoration, group/window-contained history, cross-window dragging, partial beforeunload cancellation and broader accessibility/platform/lifecycle acceptance remain pending.


## 2026-10-20 — Unloaded history and cross-window split boundaries

Seven isolated fixture checkpoints pass: Restore Tab is accepted while an actual Tabs_* read is held; release restores the persistent pair, 35/65 ratio and right focus. Open-session records were removed from both disposable clear/encrypted Session_* stores to isolate closed history, with Tabs_* retained. Combined-session attempts selected newer recovered Window entries; these are retained and not claimed as split restoration passes.

Cross-window move intents reject foreign source/destination identities and preserve both windows. Actual cross-window dragging remains unsupported: the rail API lacks a destination-window field. Negative boundary tests are not transfer acceptance. [Evidence](evidence/split-unloaded-crosswindow-20261020/README.md) records all attempts and the corrected fixture.

No product changes/native compile; guard zero, prior52/124 unchanged. Only the small diagnostic read-hold helper was compiled. Profiles removed; retained preview untouched. Latency deferred; native input and Electron diagnostic build pending. Combined-session ordering, async owner destruction/repeated requests and physical cross-window transfer remain open.


## Unloaded-history owner destruction and repeated requests — October 20

On the unchanged native binary, five Restore Tab requests while an actual Tabs read is held coalesce into exactly one split restoration, preserving 35/65 ratio and right focus (six checkpoints). Closing the requesting window through Target.closeTarget before release leaves the surviving window unchanged and the browser exits cleanly (seven checkpoints). These are automated disposable-profile checks, not physical native input.

The owner-close first attempt used Island closeTab and timed out because that path retained the last tab/window; it does not establish an owner-destruction failure. A Node WebSocket runtime mismatch and stale release-marker timeout also preceded the fresh successful fixture. Failed results are retained. Closed history was isolated by removing only disposable open-session records from both clear/encrypted stores while stopped, retaining Tabs records. Combined session priority, post-load repeated requests, replacement-owner requests and full profile destruction remain unqualified.

No product changes or native compile. Read-only build guard schedules zero actions; sandbox ps denial retained before successful escalated guard. Prior upstream footprint 52 files/124 hunks unchanged. Retained preview untouched. Latency deferred; native input and Electron diagnostic build pending.

Evidence: `evidence/split-history-owner-repeat-20261020/README.md`.


## Replacement-owner Restore Tab and combined-session recovery — October 20

Combined-session check passes (11 checkpoints): actual Tabs read held with both clear/encrypted open-session records retained. Native Restore Tab restores two newer recovered Window entries before the older Split. The final state contains each fixture URL exactly once, one split, 35/65 ratio and right-pane focus. This uses a disposable restart with crash-bubble bypass, not physical Restore UI acceptance.

**Open runtime failure:** replacement-window requests accepted while history is held restore nothing after the original requesting window closes. This repeats after waiting for the old host target to disappear plus 300ms. A fresh post-load request successfully restores the split with ratio/focus and the survivor tab retained. The final 11-checkpoint diagnostic passes its reproduction/control assertions; it does not mean pending replacement requests pass. The precise cancellation/ownership cause is not proven; no product repair was applied. Source inspection shows a profile-wide pending-restorer slot and owner-close cleanup, but does not establish the timing of that cleanup. Earlier assumptions that a newer closed owner entry explained the result were disproven by recorded snapshots.

Three failed assertions and final reproduction/control are retained. Requests use native ExecuteCommand through the diagnostic bridge; physical input, complete window destructor instrumentation, multi-profile and broader lifecycle remain unqualified. No native compile; zero-action guard. Prior footprint52/124 unchanged. Browser/guard logs stay local, outside the published manifest. Disposable profiles removed after process-exit verification; retained preview untouched. Latency deferred; native input and Electron diagnostic build pending.

Evidence: `evidence/split-replacement-combined-20261020/README.md`.


## Replacement-owner correction and recovery rerun — October 20

The previously reported replacement-owner product gap was a fixture false positive. Closing the requesting window creates a newer Window history entry. The replacement request restores that entry into a separate window, not the requesting window. The old assertion observed only the requester and incorrectly concluded nothing restored. This supersedes the open-runtime-failure claims in the preceding replacement/combined checkpoint.

Corrected all-window checks pass twice on the original implementation: three pending replacement requests restore exactly one newer blank owner window; the subsequent request restores the older split into the replacement window with 35/65 ratio and right focus, retaining its survivor tab. Two ten-checkpoint runs plus six coalescing, seven owner-cancellation and eleven combined-session checkpoints pass (44 total). The combined test retains both clear/encrypted open-session records and restores each fixture URL once. Seven capture tests and eleven patch-counter tests also pass.

A speculative pending-owner class did not change the faulty assertion's outcome. Temporary lifecycle tracing showed completion dispatch, prompting the all-window inspection. Both the proposal and diagnostics were removed byte-for-byte before final tests; the native product file matches the prior committed source. Discarded proposal and failed assertions retained as diagnostic history, not shipping code. Browser/pointer/guard logs stay local. No current replacement-owner failure is established by these tests.

Three guarded incremental builds:40.27s proposal,38.30s diagnostics,38.61s original normal build restored. Final zero-action guard; no new upstream hooks, prior52/124 unchanged. Disposable profiles removed after exit verification, retained preview untouched. Physical native input, arbitrary multi-owner concurrent requests, encrypted-only closed history and wider lifecycle remain unqualified. Latency deferred; Electron diagnostic build pending approval.

Evidence: `evidence/split-replacement-correction-20261020/README.md`.
