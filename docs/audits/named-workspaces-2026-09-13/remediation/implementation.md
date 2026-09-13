# Named Workspaces remediation

Implementation branch: `codex/named-workspaces-remediation`, based on `534e2cd8`. September 13, 2026. This is an unreleased candidate; the public v1.16.2 baseline, version and build number are unchanged. No merge or release is authorized by this record.

## Owner correction

**Do not add a control or label to the closed island.** The proposed resting-workspace indicator was removed following the owner's correction. `index.html` and the resting renderer have no change. Workspaces use the existing expanded-panel footer control and `/workspace` command. Unnamed windows retain the existing icon-only footer trigger.

**Keep the existing footer title compact.** The proposed 240px title allowance was also removed after the owner identified competition with the tab buttons. The original 9ch cap remains and the label can shrink inside its button. Existing launcher/tool groups wrap only when they cannot fit on one line. F41-8 now checks every footer button for containment and non-overlap, plus title truncation, at minimum size and in vertical layout at 125% zoom. The switcher menu can still show longer names; the 60-character naming limit is unchanged.

## Implemented behavior

| Finding | Change | Evidence |
|---|---|---|
| Draft/page-state loss | Retain ordinary WebContentsView instances and existing Quiet Tabs snapshots during same-run switching. Transfer ownership instead of closing pages. | F41-1: same page identity, textarea, sessionStorage and history URL; F41-6: quiet/pinned/grouped page and inactive navigation |
| False persistence success | Durable create/rename/delete/checkpoints; failed writes roll back memory. Autosaves keep pending captures and retry with a 30-second maximum delay. | Real fsync/rename failure tests; F41-10: failed session commit restores the outgoing live page |
| Confirmation before no-op/focus | Controller resolves same-window and other-window ownership first. Private decisions are main-issued, one-use, target/tab-generation bound, cancellable and expire in 60 seconds. | Direct controller tests; F41-2 |
| Hidden feedback | One workspace action state in a separate popover, independent of search result rendering. Decisions and rejected editors remain visible until cancellation. | F41-4 and direct UI tests; private-decision-search.png |
| Stale empty capture | Save a stable empty ordinary set, including when private pages remain. Checkpoint before secondary-window teardown. | F41-5 and F41-9 |
| List overflow | Viewport-bound flex popover with a separately scrolling list and reachable creation controls. | F41-8 at 640 × 480, island and vertical layouts, including 125% zoom; long-workspace-list*.png |
| Discarded editor text/IME | Explicit Save/Cancel, retained value/selection/focus, inline errors, duplicate-submit suppression and composition handling. | F41-3; direct UI tests; rename-validation.png |
| Destructive future-file repair | Future versions are read-only and byte-preserved. Supported repairs/migration require an owner-only copy of the exact original; backup failure blocks writes. | Future-version and failed-backup store tests |

Additional changes: stable manual order with Move Up/Down, per-workspace content revisions, identical-capture write suppression, only the affected runtime captured on broadcasts, visible management buttons, descriptive current/window/tab-count labels, and seven-day recoverable deletion (up to 25 records). Deleting a resident workspace reveals its pages in a window before removing the saved binding; it does not destroy hidden drafts. F41-7 covers this. F41-11 covers return after explicitly closing a private page.

## Ownership and persistence

The runtime registry is the sole ownership authority, scoped by profile and workspace. Resident runtimes have no native window/chrome and are omitted from `session.json.windows`. Only tab membership, groups, active selection and activation history transfer. Recently Closed, permission prompts, fill presentation, Glance and chrome remain window-local.

Resident views retain their actual page memory. Tab callbacks resolve their current owner at event delivery. Inactive permission requests and `window.open` are denied; page-initiated external-protocol/utility navigation is blocked while resident. New HTTP authentication challenges are cancelled and new downloads are rejected before a save dialog can appear (F41-6); already accepted downloads continue. Capture, pending permission/authentication decisions, loading/waking/quieting transitions and opener families stay in their visible window. The UI offers opening the target elsewhere. No private pages enter residency, workspace files, recovery records or Recently Closed.

The initial cache admits two inactive sets and at most sixteen live ordinary tabs per profile. It does **not** evict pages to meet that limit. When full, the existing window stays intact and the user can open the target in another window. Quiet Tabs continues to obey its normal protection rules and user setting; switching itself never discards a renderer.

A switch first durably checkpoints the outgoing workspace and session. The incoming set is staged while the outgoing views remain available. A single atomic `session.json` write contains both the complete safe incoming capture and its binding, serving as the commit record. A failed commit transfers the original session back. No cross-file atomicity is claimed. An interrupted operation before that commit restores the outgoing checkpoint; a later interruption restores the incoming safe session columns. Ordinary page memory is process-local and cannot survive an app/renderer crash.

Deletion's workspace-file mutation is durable before unbinding. A stale session pointer after a failed secondary session write cannot recreate a deleted workspace: startup validates the referenced record and restores the ordinary session as unnamed. Recovery never steals a newer binding. Profile deletion disposes residents and cancels pending repository retries before removing the profile directory.

## Format and downgrade boundary

Workspace format v2 stores manual order as the active array order, content revisions, and safe deleted-record snapshots. Migration from v1 keeps the previous displayed order once. Originals are preserved at `workspaces.json.before-repair-<id>.bak` with owner-only permissions. Expired recovery entries are removed on the next access; the recovery list never offers them after seven days.

Unmodified public v1.16.2 rewrites unknown formats. **Do not open a candidate profile with v1.16.2 and expect automatic downgrade compatibility.** Use disposable profiles for validation; recovering an older-format profile requires its pre-migration original. No form values, POST bodies, view references or sessionStorage are serialized.

## Verification

- Full unit suite: 1,782 passed, none failed. Summary in unit-results.txt. Ten UI tests also pass after the final compact-footer correction.
- Full runnable desktop suite: 152 scenarios / 908 steps passed, including eleven new workspace scenarios (one automatic retry in the configured profile). Full-suite evidence is in desktop-results.txt; all eleven workspace cases also pass after the final compact-footer correction (desktop-focused-results.txt).
- Acceptance dry run resolves all 152 scenarios / 908 steps.
- Substrate check passed: brand, tokens, settings, copy, pinned blocker and compliance artifacts current.
- Screenshot evidence uses disposable fixtures only, never the owner's installed profile. The original audit screenshots remain in the original local checkout.

`candidate-measurement.json` records one raw A → new empty B → A timing, including test IPC and B's first load, plus process counts. Its aggregate working-set values are diagnostic only: shared pages may be counted more than once, so they are not a valid memory benchmark or a release comparison. A comparison using the repository's process-tree physical-footprint harness remains pending.

The backend candidate at `1d213603` passed private Windows/Linux validation ([run 34781611047](https://github.com/bnfy/blanc/actions/runs/34781611047)) and a local signed macOS package build. Packaged v1.16.2 → candidate migration preserved the exact pre-migration workspace backup with owner-only permissions, retained the binding after restart, and left a future-format file byte-identical through rejected mutations and shutdown. The final compact-footer candidate's native evidence is recorded below when complete.

## Remaining release evidence

Affected-machine confirmations, packaged crash-boundary runs, VoiceOver and Windows screen-reader verification, physical-footprint comparison, and a longer residency soak remain release gates. Minimum window size and vertical layout were checked at ordinary and 125% page zoom; that does not cover every operating-system accessibility scaling setting. DOM semantics and screenshot inspection do not substitute for a screen-reader pass. An explicit owner decision is still required for merge, immutable release selection and the launch schedule. Nothing in this branch changes the release freeze.
