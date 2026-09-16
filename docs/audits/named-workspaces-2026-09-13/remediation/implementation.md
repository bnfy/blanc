# Named Workspaces remediation

Implementation branch: `codex/named-workspaces-remediation`, based on `534e2cd8`. September 13, 2026. This is an unreleased candidate; the public v1.16.2 baseline, version and build number are unchanged. No merge or release is authorized by this record.

## Owner correction

**Do not add a control or label to the closed island.** The proposed resting-workspace indicator was removed following the owner's correction. `index.html` and the resting renderer have no change. Workspaces use the existing expanded-panel footer control and `/workspace` command. Unnamed windows retain the existing icon-only footer trigger.

**Keep the existing footer title compact.** The proposed 240px title allowance was also removed after the owner identified competition with the tab buttons. The original 9ch cap remains and the label can shrink inside its button. Existing launcher/tool groups wrap only when they cannot fit on one line. F41-8 now checks every footer button for containment and non-overlap, plus title truncation, at minimum size and in vertical layout at 125% zoom. The switcher menu can still show longer names; the 60-character naming limit is unchanged.

## Implemented behavior

| Finding | Change | Evidence |
|---|---|---|
| Draft/page-state loss | Retain ordinary WebContentsView instances and existing Quiet Tabs snapshots during same-run switching. Transfer ownership instead of closing pages. | F41-1: same page identity, textarea, sessionStorage and history URL; F41-6: quiet/pinned/grouped page and inactive navigation |
| False persistence success | Durable create/rename/delete/checkpoints; failed writes roll back memory. If the workspace file commits but the session binding does not, the result says the workspace was saved, returns its row, and avoids a duplicate-name retry. Autosaves keep pending captures and retry with a 30-second maximum delay. | Real fsync/rename failure tests; F41-10: the saved record remains discoverable and the outgoing live page is unchanged |
| Confirmation before no-op/focus | Controller resolves same-window and other-window ownership first. Private decisions are main-issued, one-use, target/tab-generation bound, cancellable and expire in 60 seconds. | Direct controller tests; F41-2 |
| Hidden feedback | One workspace action state in a separate popover, independent of search result rendering. Workspace broadcasts wait until a pressed row receives its click. Decisions and rejected editors remain visible until cancellation, including after a backdrop click. | F41-4 and direct UI tests; private-decision-search.png |
| Stale empty capture | Save a stable empty ordinary set, including when private pages remain. A normal window close commits the final workspace capture and session removal before native teardown; a retryable write failure keeps the window and its pages alive. | F41-5, F41-9 and direct close-lifecycle tests |
| List overflow | Viewport-bound flex popover with a separately scrolling list and reachable creation controls. | F41-8 at 640 × 480, island and vertical layouts, including 125% zoom; long-workspace-list*.png |
| Discarded editor text/IME | Explicit Save/Cancel, retained value/selection/focus, inline errors, duplicate-submit suppression and composition handling. | F41-3; direct UI tests; rename-validation.png |
| Destructive future-file repair | Future versions are read-only and byte-preserved. Supported repairs/migration require an owner-only copy of the exact original; backup failure blocks writes. | Future-version and failed-backup store tests |

Additional changes: stable manual order with Move Up/Down, per-workspace content revisions, identical-capture write suppression, only the affected runtime captured on broadcasts, visible management buttons, descriptive current/window/tab-count labels, and seven-day recoverable deletion (up to 25 records). Deleting a resident workspace reveals its pages in a window before removing the saved binding; it does not destroy hidden drafts. F41-7 covers this. F41-11 covers return after explicitly closing a private page.

## Ownership and persistence

The runtime registry is the sole ownership authority, scoped by profile and workspace. Resident runtimes have no native window/chrome and are omitted from `session.json.windows`. Only tab membership, groups, active selection and activation history transfer. Recently Closed, permission prompts, fill presentation, Glance and chrome remain window-local.

Resident views retain their actual page memory. Tab callbacks resolve their current owner at event delivery. Inactive permission requests and `window.open` are denied; page-initiated external-protocol/utility navigation is blocked while resident. New HTTP authentication challenges are cancelled and new downloads are rejected before a save dialog can appear (F41-6); already accepted downloads continue. Capture, pending permission/authentication decisions, loading/waking/quieting transitions and opener families stay in their visible window. The UI offers opening the target elsewhere. No private pages enter residency, workspace files, recovery records or Recently Closed.

The initial cache admits two inactive sets and at most sixteen live ordinary tabs per profile. It does **not** evict pages to meet that limit. When full, the existing window stays intact and the user can open the target in another window. Quiet Tabs continues to obey its normal protection rules and user setting; switching itself never discards a renderer.

A switch first durably checkpoints the outgoing workspace and session. The incoming set is staged while the outgoing views remain available. A single atomic `session.json` write contains both the complete safe incoming capture and its binding, serving as the commit record. A failed commit transfers the original session back. Membership is validated in full before either runtime changes. No cross-file atomicity is claimed. When creation committed to `workspaces.json` first, a later session failure leaves that record available and reports the partial result explicitly. An interrupted operation before the session commit restores the outgoing checkpoint; a later interruption restores the incoming safe session columns. Ordinary page memory is process-local and cannot survive an app/renderer crash.

Deletion's workspace-file mutation is durable before unbinding. A stale session pointer after a failed secondary session write cannot recreate a deleted workspace: startup validates the referenced record and restores the ordinary session as unnamed. Recovery never steals a newer binding. Profile deletion disposes residents and cancels pending repository retries before removing the profile directory.

## Format and downgrade boundary

Workspace format v2 stores manual order as the active array order, content revisions, and safe deleted-record snapshots. Migration from v1 keeps the previous displayed order once. Originals are preserved at `workspaces.json.before-repair-<id>.bak` with owner-only permissions. Expired recovery entries are removed on the next access; the recovery list never offers them after seven days.

Unmodified public v1.16.2 rewrites unknown formats. **Do not open a candidate profile with v1.16.2 and expect automatic downgrade compatibility.** Use disposable profiles for validation; recovering an older-format profile requires its pre-migration original. No form values, POST bodies, view references or sessionStorage are serialized.

## Verification

- Full unit suite at `d06981da`: 1,790 passed, none failed locally. Summary in unit-results.txt.
- Final full runnable desktop suite at `d06981da`: 152 scenarios / 908 steps passed, including eleven workspace scenarios (one automatic retry in the configured profile). The exact focused workspace run passed 11 scenarios / 43 steps. Full-suite evidence is in desktop-results.txt; focused workspace, footer geometry, and mouse-save focus/selection evidence is in desktop-focused-results.txt.
- Acceptance dry run resolves all 152 scenarios / 908 steps.
- Substrate check passed: brand, tokens, settings, copy, pinned blocker and compliance artifacts current.
- Screenshot evidence uses disposable fixtures only, never the owner's installed profile. The original audit screenshots remain in the original local checkout.

`candidate-measurement.json` records one raw A → new empty B → A timing, including test IPC and B's first load, plus process counts. Its aggregate working-set values are diagnostic only: shared pages may be counted more than once, so they are not a valid memory benchmark or a release comparison. A comparison using the repository's process-tree physical-footprint harness remains pending.

The earlier product revision `970bd6f963fdc18b2337107a0cbb640a0b914897` passed private Windows/Linux validation ([run 34782228785](https://github.com/bnfy/blanc/actions/runs/34782228785)) and a local signed macOS package build. The Windows/Linux workflow passed its signature/fuse/payload and existing media/protocol smoke gates. The local macOS after-sign check confirmed strict deep signature integrity, the authorized embedded provisioning profile and required entitlements. The review fixes in `d06981da` change app bytes, so that native evidence does not validate the current revision.

Packaged v1.16.2 → `970bd6f9` migration preserved the exact pre-migration workspace backup with owner-only permissions, retained the binding after restart, and left a future-format file byte-identical through rejected mutations and shutdown. See packaged-migration-results.txt. Current-revision [Parity guards](https://github.com/bnfy/blanc/actions/runs/34788234794) (substrate, acceptance wiring, OAuth and tab handoff) and [CodeQL](https://github.com/bnfy/blanc/actions/runs/34788234790) passed after the review fixes were pushed. Native validation remains pending for the current app bytes.

## Remaining release evidence

Current-revision Windows/Linux validation and a signed macOS package build, affected-machine confirmations, packaged migration/crash-boundary runs, VoiceOver and Windows screen-reader verification, physical-footprint comparison, and a longer residency soak remain release gates. Minimum window size and vertical layout were checked at ordinary and 125% page zoom; that does not cover every operating-system accessibility scaling setting. DOM semantics and screenshot inspection do not substitute for a screen-reader pass. On September 13, 2026, after the missing evidence and packaged-platform risk were stated, the owner explicitly waived current-revision native/package validation and affected-machine confirmation for the squash merge of PR #340. The waiver does not authorize an immutable release, shorten any release gate, or change the launch freeze; it is recorded in `docs/release-incidents/2026-09-13-named-workspaces-merge-waiver.md`.
