# Named Workspaces remediation plan

Date: September 13, 2026
Status: implemented as an unreleased candidate on `codex/named-workspaces-remediation`; native and release evidence remains pending
Evidence: [source audit](../../audits/named-workspaces-2026-09-13/report.md), [live walkthrough](../../audits/named-workspaces-2026-09-13/visual-review.md)

## Outcome

Named Workspaces should preserve work during ordinary switching, accurately report whether changes are saved, and provide a clear, accessible way to create, find, rename, and remove workspaces. Every audited defect and improvement is assigned below.

Work in an isolated checkout. Preserve unrelated working-tree changes. This plan authorizes neither a merge nor a public release; the repository's launch freeze, owner decisions, affected-machine confirmations, and release evidence requirements still apply. Keep v1.16.2 immutable.

## Product contracts

1. Opening a workspace already shown here is a no-op; opening one shown elsewhere focuses its window. Neither requires discarding anything.
2. Ordinary same-run switching should preserve live page state, including drafts, navigation history, and existing Quiet Tabs recovery state. Saving URLs alone must never be described as saving a page's unsaved work.
3. Private pages never enter saved workspaces, disk snapshots, sync, or Recently Closed. A switch that would close private pages requires a clear decision. Offer Cancel and an explicit way to open the target in another window without closing those pages.
4. An action is reported as saved only after the relevant durable write succeeds. A failed critical write leaves the outgoing tabs available and the existing binding valid.
5. An intentionally empty ordinary-tab set is a valid saved state. Teardown and intermediate swap states are excluded by lifecycle state, not by checking whether the capture is empty.
6. Workspaces remain local to one profile and device. They do not isolate accounts/cookies within the same profile. Existing workspaces remain usable when Patron lapses; creation remains gated in main.
7. Workspace dialogs, validation, and storage errors remain visible regardless of address-bar contents. A failed operation keeps the user's input and does not leave unrelated error messages behind.
8. Inactive residency is process-local, not crash recovery. Full app restart restores the existing safe persisted columns, never serialized form values, POST bodies, view references, or sessionStorage.

## Sequence and dependencies

Implement in this order as reviewable changes. A stage is complete only when its acceptance criteria pass, not merely when code is written.

| Stage | Deliverable | Depends on |
|---|---|---|
| 1 | Regression coverage and a testable workspace controller | Existing audit |
| 2 | Durable persistence, empty saves, and safe schema handling | 1 |
| 3 | Safe switching with truthful, persistent feedback | 1–2 |
| 4 | Preserve inactive workspace page state in memory | 2–3 |
| 5 | Accessible workspace UI and complete editor recovery | 3; residency states from 4 |
| 6 | Stable ordering, efficient autosave, and recoverable deletion | 2, 4–5 |
| 7 | Integrated desktop, packaged, and release validation | 1–6 |

Stages 1–3 provide a reviewable correctness checkpoint. They are not a claim that all findings are resolved: full page-state preservation and the UI/recovery improvements still require stages 4–6. Do not delay a necessary safety correction solely to finish visual polish, but any separate public release still needs explicit owner authorization and all release gates.

## 1. Establish regression tests and extract orchestration

Primary files: `src/main/main.js`, `src/main/workspaces-model.js`, `src/main/workspaces.js`, `src/main/window-runtime-registry.js`; new focused controller and test modules.

- Convert the eight audit probes into tests of desired behavior. Preserve the original probes as historical evidence; do not change them to suggest the original release passed.
- Add isolated Electron acceptance cases for the five live reproductions: dirty draft round trip, same-workspace/private-tab warning, hidden confirmation, duplicate-name recovery, and private-only window close/reopen.
- Extract workspace orchestration behind injected store, ownership, tab-lifecycle, and window adapters. Keep Electron wiring in main and pure decisions importable directly. Replace source-string slicing tests for extracted functions with behavioral tests.
- Make resolution explicit: `noop`, `focus`, or `activate`. Track one in-flight operation per requesting window plus a target-workspace reservation, scoped by profile and workspace ID. Revalidate target existence, ownership, runtime generation, and private-page state after asynchronous work.
- Use a single main-process authority for workspace ownership. Do not introduce a second mutable binding map that can disagree with window/runtime ownership.
- Specify failure results consistently: not found, future format, storage failure, cancelled, protected pages, busy/stale action. Renderer-facing results contain only safe summaries.

**Acceptance:** existing 103 focused tests remain green; new regression tests fail for the known current behavior and pass only with their corresponding later fix. Concurrent opens from two windows cannot create two owners or let a stale response mutate the newer action.

## 2. Make persistence trustworthy

Primary files: `src/main/workspaces.js`, `src/main/workspaces-model.js`, `src/main/store.js`, `src/main/session-workspace.js`, persistence call sites in main.

- Add durable workspace mutations using the existing `updateAndFlush` contract or an equivalent explicit transaction API. Validate return values before reporting create, rename, delete, or critical outgoing save success. Keep generic store behavior compatible with other consumers.
- Background autosave retains pending changes on failure, exposes an error state, and retries with bounded backoff. A later successful write clears the error. Do not write or log tab URLs, names, or draft contents merely to report an error.
- Remove the blanket zero-URL suppression. Explicitly exclude startup, teardown, aborted transitions, and disposed runtimes while allowing a stable private-only window to save an empty ordinary set.
- Introduce a loader result distinguishing supported, corrupt, and future formats. A newer version is read-only: no repair, autosave, create, rename, or delete may rewrite its bytes. Preserve a recoverable owner-only original before supported-format destructive repair. A backup failure stops the repair.
- Avoid pretending two JSON files form one atomic write. Define crash recovery explicitly: durably checkpoint the outgoing workspace, stage the incoming state without destroying the outgoing one, and use a small versioned transition record if needed to reconcile the session pointer and workspace capture. Store only already-approved session columns and identifiers in that record. On startup, roll an incomplete transition back to its durable outgoing checkpoint; accept a fully committed target only when its referenced record validates.
- Treat rename/delete rollback and session binding updates as part of the same logical operation. A failed delete must not leave a live window unbound from a record that still exists.
- Before changing schema for ordering/recovery, implement the future-format guard. Document migration and old-build behavior; do not claim unmodified v1.16.2 is safe to open a new schema.

**Acceptance:** inject create/rename/delete/autosave failures, including ENOSPC/EACCES and rename/fsync failures; show no false success. Restart after each transition write boundary and recover a coherent owner/tab set. A future-version fixture remains byte-for-byte unchanged across list and all attempted writes. Private-only window close/reopen restores no previously removed ordinary URLs.

## 3. Make switching safe before expanding retention

Primary files: workspace controller, Quiet Tabs protection helpers, `src/renderer/overlay.js`, chrome preload/IPC adapters.

- Resolve no-op/focus before any destructive guard or outgoing mutation. Add a safe “Open in another window” operation that reuses an existing holder if one already exists.
- Remove the broad renderer `force:true` bypass in favor of a main-issued decision tied to the requesting window, target, affected tab IDs, and generation. It is consumed once and revalidated if tabs or capture state change.
- Protect a real destructive swap with the existing dirty-page and lifecycle knowledge. Dirty, capturing, loading/uncertain, permission-pending, or unload-sensitive pages must not be silently closed. Default to preserving the current window; offer opening the target in another window. Explicit discard must describe exactly what will close.
- Do not test unload objections by closing tabs sequentially: that can destroy early tabs before a later tab refuses. If there is no reliable non-destructive probe, treat the state as uncertain and preserve the pages. Stage and retain outgoing state until the operation can commit or roll back.
- A durable URL checkpoint is not proof that arbitrary page state is recoverable. During this transitional stage, warn before any close-and-recreate path; remove that warning only when stage 4 preserves the affected state or the user has explicitly elected to discard it.
- Place pending switch decisions and storage errors in a dedicated workspace action surface independent of `renderList()` query branches. Keep the original intended action while a nested Save First editor validates; saving ordinary URLs must not clear a remaining private-page warning.
- Clear obsolete operation feedback on success, cancellation, and entering a different action. Preserve unrelated active storage failures in their own status area.

**Acceptance:** no-op and cross-window focus never show discard prompts, including with private tabs. `/settings`, search input, and tab broadcasts cannot hide an active decision. Duplicate Save First keeps its field and error visible, then resumes the exact original action after a valid save. A cancel, timeout, failed write, or unload objection leaves all outgoing pages available. Rapid double-clicks cannot bypass protection.

## 4. Retain inactive workspaces without losing page state

This is a separate lifecycle change, not a small extension of `applyWorkspaceToWindow`. Complete its ownership design and adapter tests before connecting it to normal switching.

- Introduce a main-process workspace session with one of three ownership states: attached to a window, resident but inactive, or persisted-only. Scope identity by profile and workspace. A resident session is not a second native window and is not a second autosave writer.
- Transfer tab membership through one controlled ownership seam. Retain actual WebContentsView instances and existing Quiet Tabs snapshots; do not close and rebuild them merely to switch workspaces. Reattach incoming views and restore active tab, groups, pins, and navigation state.
- Keep window chrome, prompt surfaces, fill state, and Glance presentation owned by the native window. Specify Recently Closed as window-local, preserving the existing contract; workspace parking must not flood it or silently transplant it to another window.
- Audit every callback that currently assumes `runtimeForTab()` implies an active native window: navigation, history, permissions, child windows, capture, downloads, autosave, crash recovery, menu updates, and focus. Resident pages update only their own session and cannot manipulate the newly active workspace's chrome.
- Do not reuse the Recently Closed deny-all firewall wholesale: resident workspaces remain live browser pages. Define a separate resident policy. No hidden permission UI or unexpected popup may appear; a new permission request while inactive is denied/requires retry after activation. Active capture, pending permission decisions, and unsafe opener families initially stay in their visible window; offer opening the target elsewhere.
- Do not park private tabs. Keep their explicit close-or-stay decision, with the non-destructive new-window alternative. Keep all recovery data out of disk, IPC, sync, telemetry, logs, and crash reports.
- Reuse Quiet Tabs only under its existing safety rules and user setting. Never discard a dirty, shared/uncertain, capturing, or unload-protected renderer to meet a cache budget. Restoring a previously quiet tab must preserve its bounded navigation snapshot and sessionStorage behavior.
- Add a conservative, measured residency budget. Initial evaluation point: two inactive workspace sets and at most sixteen live retained ordinary tabs, separately tracking quiet snapshots. These are proposed engineering limits, not a public promise; tune from measurements before release. If admitting another set requires unsafe eviction, preserve the current set and offer opening the target in another window or cancelling. Safe eviction may reuse Quiet Tabs' existing proven recovery path; never silently drop arbitrary page state just because a cache is full.
- Treat app quit/restart, explicit window close, deletion, profile removal, and renderer crashes as separate lifecycle events. A renderer crash cannot preserve its JS state; report restoration honestly and retain the safe recovery floor. Preserve the macOS dock-close ownership behavior.

**Acceptance:** the captured draft fixture survives A → B → A with the exact text and same live page identity, without a network reload. Cover back/forward history, scroll, sessionStorage, already-quiet pages, grouped/pinned tabs, and an inactive page that navigates. Two-window races, deletion, profile removal, capture, and shutdown leave no leaked views, double owners, or hidden prompts. Budget exhaustion never silently loses protected work. Measure active/resident/quiet memory and switch latency against the audit baseline; document actual results rather than asserting improvement.

## 5. Complete the workspace interface

Primary files: `src/renderer/overlay.js`, `overlay.html`, `styles.css`, context-menu model, relevant copy/tokens and generated substrates. Owner correction: do not add any control or label to the closed island.

Build on the captured island/footer UI and existing Sunrise theme. Prepare focused before/after states for the trigger, long list, editor error, private warning, and deletion confirmation before implementing the broader layout changes. This is not a general browser redesign.

- Keep the closed island unchanged. Use the existing expanded-panel footer control and `/workspace` command. Named workspaces show their name in the existing footer control, with a full accessible name and full-name reveal for truncation; unnamed windows retain its icon-only presentation.
- Use “New empty workspace” and “Save this window as…” with a short explanation of autosave, private exclusion, and profile/device locality. Do not imply account isolation or cloud sync.
- Show which workspace is current and which is open in another window. The latter action says “Show window.” Include an accessible tab count, not a bare number read without context.
- Add a visible row action button for Rename/Delete while retaining right-click as a shortcut. Do not nest buttons within a menuitem button; choose a coherent semantic structure for the list and its actions.
- Constrain the popover to available viewport height; scroll the workspace list while keeping creation controls accessible. Recalculate on resize/content changes without losing scroll or focus. Validate 0, 1, 10, and 25 entries with 60-character names.
- Replace the independent editor booleans with one explicit UI state and a pending-action context. Preserve text, selection, and focus on rejection. Add Save/Cancel buttons, inline validation, `aria-invalid`/`aria-describedby`, a pending state, and an `isComposing` guard. Prevent duplicate submissions and preserve input through background broadcasts.
- Provide intentional keyboard entry, roving selection where appropriate, arrows/Home/End, Escape by layer, and focus return to the invoker. Use dialog/form semantics while editing rather than treating every child as a menu item. Announce current selection, validation errors, and save status appropriately. Do not claim a semantics fix without reader verification.
- Give destructive decisions readable action sizes, clear labels, a safe default focus, and the exact consequence. Clear prior rename errors before Delete or a new operation. Explain that deleting the saved workspace leaves currently open tabs in place.

**Acceptance:** reproduce every screenshot flow with the corrected behavior; mouse and keyboard can complete creation, rename, switching, cancellation, and delete recovery. Verify light/private themes, increased text scale, minimum window size, vertical tabs, long translated-like strings, VoiceOver, and a Windows screen reader. Measure contrast/targets on final colors and geometry; no inaccessible controls below the viewport.

## 6. Stable ordering, efficient saves, and delete recovery

- Keep the user's list predictable with a persisted manual order. New workspaces append; rename, navigation, autosave, and switching do not reorder the list. Provide accessible Move Up/Move Down actions; drag reorder is optional and not required to complete this plan. Migrate existing lists once in their displayed order.
- Track content revision separately from ordering and activation timestamps. Mark only the affected workspace dirty, avoid full recapture/normalization of every workspace on unrelated tab broadcasts, and skip writes for unchanged safe captures. Do not hash or serialize secret recovery state to detect change.
- Use revision-aware renderer updates that preserve focus, editor selection, and list scroll. Maintain truthful pending/saved/error status without announcing every background navigation.
- Add a bounded recoverable-delete record rather than permanently discarding the saved snapshot on the first action. Proposed policy: retain up to 25 deleted records for seven days, with immediate Undo and a Recently Deleted surface; profile deletion removes them too. Store only the same ordinary persisted columns, under owner-only permissions, never private pages or live recovery state. The UI states retention and offers explicit permanent removal.
- Deletion of an active workspace unbinds its window and leaves its tabs open; inactive residency disposal follows the protected-work policy. If inactive live work cannot safely be discarded, surface that consequence before completing deletion. Do not implicitly drop dirty resident state because a saved snapshot was moved to recovery.
- Undo restores the saved identity/order without stealing a window binding from newer work. Resolve a name conflict visibly and handle the 25-active-workspace limit without deleting another record. Undo must persist successfully before reporting restoration.

**Acceptance:** background load in another window changes neither order nor unrelated workspace revisions; repeated identical captures cause no new disk writes. Reorder works with keyboard. Delete → Undo, restart → Recently Deleted, name conflict, capacity limit, expiry, permanent removal, write failure, and profile deletion all behave consistently. The old “already exists” error is absent after a successful delete.

## 7. Verification and release readiness

Use disposable profiles and fixture data for all destructive/failure tests. Do not repeat failure injection against the owner's installed profile.

1. Run focused model/store/controller/editor tests, then `npm run test:unit` and `npm run test:acceptance:dry`. Add workspace scenarios to the real runnable acceptance profile; do not leave them tagged out.
2. Run the desktop flows with live Electron and the draft fixture. Include private-only close/reopen, two ordinary windows, macOS primary dock-close/reopen, profile isolation, rapid concurrent actions, quiet snapshots, downloads/capture, and interrupted transitions.
3. Run `npm run substrate:check` when changing copy/tokens/settings and regenerate the affected substrate through its builder. Capture fresh corrected screenshots and map each to its original audit evidence.
4. Build private platform candidates through the documented validation workflow. Verify macOS, Windows, and Linux behavior, including the affected-machine confirmations required before merging platform-sensitive changes. Record unavailable evidence as pending rather than passed.
5. Test packaged migration from v1.16.2 and newer-format refusal. Record precisely what an old build can and cannot read after migration; retain a recoverable pre-migration backup and avoid promising automatic downgrade compatibility.
6. Only after explicit owner release/launch decisions, follow `docs/release-verification.md`: new immutable version and macOS build number, signed/notarized artifacts, native signatures, manifest authentication, public smoke, adjacent updater handoffs, and any fresh launch soak. Never overwrite v1.16.2 or treat this remediation plan as a freeze waiver.

## Coverage map

| Audit item | Implementation stages | Required proof |
|---|---|---|
| #1 Draft/page-state loss | 3–4 | Draft and quiet-history round trips; no partial teardown on refusal |
| #2 False persistence success | 2–3 | Fault injection and crash-boundary recovery |
| #3 Guard before focus/no-op | 1, 3 | Same workspace/private tab and cross-window focus |
| #4 Hidden warnings/errors | 3, 5 | Query mode, Save First validation, stale-error clearing |
| #5 Stale empty capture | 2, 4 | Private-only close/reopen without resurrected URLs |
| #6 Overflowing list | 5 | 25 items at minimum size and increased text scale |
| #7 Lost editor input/IME | 5 | Failed create/save/rename retains value, focus, composition |
| #8 Destructive future-format read | 2 | Byte-preservation across read and mutation attempts |
| Existing expanded-control identity and clearer labels | 5 | Closed island unchanged; normal/private/vertical layouts, long names |
| Visible management and keyboard semantics | 5 | Pointer, keyboard, and screen-reader flows |
| Undo/recoverable deletion | 6 | Delete/restore/restart/conflict/failure/expiry |
| Stable order and reduced autosave work | 6 | Multiwindow stability and write-count measurements |
| Controller and single UI state | 1, 3–5 | Direct behavioral tests and stale-action/race tests |

## Completion criteria

All eight findings have passing regression coverage; all five live defects are re-run and corrected in a built app; the six structural/UI recommendations above are implemented and verified; the screenshot walkthrough is replaced or supplemented with matched corrected states; protected work and private data invariants hold across failures and lifecycle events. The report must clearly separate completed engineering work from pending native validation, merge, release, and launch decisions.

Recommended first implementation task: add the five live regressions and extract the controller seam, then implement durable checkpoints and resolution-before-guard. This establishes the safety foundation for all later changes.
