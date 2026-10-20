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
