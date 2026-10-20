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
