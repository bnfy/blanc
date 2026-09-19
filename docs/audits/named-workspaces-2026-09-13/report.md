# Named Workspaces audit — September 13, 2026

The main risk is preservation of work: a saved workspace preserves tab URLs and organization, but switching destroys the pages themselves. Several guard, persistence, and editor behaviors make that distinction unsafe or unclear.

Scope: source and executable policy/store audit of checkout `534e2cd8b391314083ff59dd15cfb8c6bb287246`. The reviewed `main.js`, workspace model/store, overlay renderer, and stylesheet have no diff from local release tag `v1.16.2`. No production code was changed. Existing unrelated working-tree edits were left intact.

**Live follow-up:** After the owner unlocked the desktop, the installed `/Applications/Blanc.app` (UI version 1.16.2) was exercised through Computer Use in separate audit windows. Five findings were reproduced live: draft loss (#1), false same-workspace warning (#3), hidden switch warning (#4), stale-tab restoration (#5), and discarded editor state (#7). Fourteen screenshots were saved and reopened for inspection. See the [screenshot walkthrough](visual-review.md). A further feedback collision was observed: a duplicate-name error in “save first” stays hidden behind the original switch warning until that warning is cancelled.

**Remaining limits:** No disk failures were injected into the installed app, no future-format file was placed in user data, and no 25-item live menu was created. Those findings retain the isolated probe/source evidence below. No claims about measured contrast, actual screen-reader speech, Windows/Linux runtime behavior, or overall accessibility compliance are made. Temporary screenshot failures while the tool treated the popover as a top-level menu were resolved through the context-menu flow; they are not classified as product defects.

## Findings, ordered by impact

### 1. High — Switching a saved workspace can silently lose drafts and page state

**Trigger:** In a named workspace, edit an ordinary web form or maintain an in-memory document, then switch to an unopened workspace. Switch back.

The guard treats all ordinary tabs in a bound workspace as protected. The capture contains URLs, group membership, pins, titles, and favicons, not form state, navigation history, POST bodies, or sessionStorage. Apply closes every outgoing tab with `record:false`, bypassing Recently Closed. The close path calls `wc.close()` without `waitForBeforeUnload`; the installed Electron API documentation explicitly says the unspecified option does not wait for unload prevention. Incoming tabs are recreated from URLs.

**Impact:** Saving the workspace does not protect unsaved page work. The feature's “save first” path can give the same false reassurance. Already-quiet tabs also lose the richer recovery snapshot when closed during switching.

**Fix:** Preflight every outgoing page before any destructive swap; honor unload objections and dirty-page checks. Prefer retaining live/quiet tab state for inactive workspaces within the process, with bounded memory eviction. Keep sensitive recovery state memory-only, as Quiet Tabs already does. At minimum, clearly explain that URLs are saved and obtain a deliberate decision before discarding page work.

Evidence: [guard](../../../src/main/workspaces-model.js#L251), [capture](../../../src/main/main.js#L3713), [apply](../../../src/main/main.js#L4764), [close](../../../src/main/main.js#L5534). **Confirmed live:** a local textarea with a `beforeunload` handler was filled using real typing. Switching to another audit workspace produced no warning; returning recreated the page with an empty field. [Before](screenshots/06-draft-before-switch.png) / [after](screenshots/07-draft-lost-after-switch.png). Fixture: [draft-fixture.html](draft-fixture.html).

### 2. High — Save success is reported even when persistence fails

**Trigger:** Create or autosave a workspace when its destination cannot be written, then switch away or exit.

`create`, `rename`, `remove`, and `saveCapture` use debounced `JsonStore.update()` and return `ok:true`. A later write failure is only logged. Switching does not require the outgoing capture to reach disk before closing its tabs. The existing store already has `updateAndFlush()` for critical transitions, but workspaces do not use it.

**Reproduced:** A disposable invalid destination produced an actual write failure while create returned `ok:true` and the workspace remained visible in memory. No workspace file existed afterward. This proves false success for a failed destination; disk-full itself was not simulated.

**Fix:** Require a successful durable commit before a save-and-switch operation can close outgoing tabs. Return a visible retryable storage error and preserve the existing binding on failure. For background autosave, track pending/error state, retry, and expose failure without claiming the data is saved. Reconcile session pointers and workspace records across partial writes.

Evidence: [workspace writes](../../../src/main/workspaces.js#L72), [store transaction API](../../../src/main/store.js#L101), [outgoing save](../../../src/main/main.js#L4619).

### 3. Medium — Harmless focus and same-workspace actions trigger a destructive warning

**Trigger:** A scratch window contains a real tab and the selected workspace is already open in another window. Alternatively, the current workspace contains a private tab and the user selects that same workspace.

`scratchGuardResult()` runs before `resolveOpen()`. Both actions are refused with `unsaved-scratch`, even though the correct operation is focus or no-op and closes no tabs. The UI can claim tabs “will close” and require “discard” to perform a harmless window switch.

**Reproduced:** Real switch-function probes returned the guard error for both focus and no-op bindings. **Confirmed live for no-op:** `/workspace Audit Draft September 13` while that exact workspace was already active and contained a disposable private page produced “1 private tab will close.” The action was cancelled. [Screenshot](screenshots/08-same-workspace-private-warning.png).

**Fix:** Resolve the binding first. Only a genuine swap should evaluate destructive-switch protection. Mark rows already open elsewhere with “Open in another window,” and describe the action as focusing that window.

Evidence: [switch ordering](../../../src/main/main.js#L4603), [row labels](../../../src/renderer/overlay.js#L955).

### 4. Medium — Switch warnings and errors disappear behind address-bar results

**Trigger:** Type `/settings` or search text into the command panel, then use its still-visible workspace footer to switch from a scratch window. The switch requires confirmation.

`renderList()` only renders `pendingScratchGuard` and `commandNotice` in the resting-tab branch. The slash-command and search branches take precedence. The main process refuses the switch, but the confirmation is absent until the address field is cleared. Validation errors from workspace editors can disappear for the same reason.

**Reproduced:** With `/settings` present and a pending scratch warning, the real rendering function produced only the command row. **Confirmed live:** entering `/settings` hid a pending switch warning; clearing the field restored it. [Visible](screenshots/02-switch-warning.png) / [hidden](screenshots/03-warning-hidden-by-command.png). **Additional live case:** entering an existing name through “save first” cleared the editor but hid the duplicate-name error behind `pendingScratchGuard`. Cancelling the original switch finally exposed the error. Both defects come from competing feedback occupying the same list slot.

**Fix:** Place action feedback in a dedicated workspace surface independent of the address-query mode. Keep the confirmation visible, focus its safe action, and announce errors/status changes accessibly.

Evidence: [render branches](../../../src/renderer/overlay.js#L1963), [guard storage](../../../src/renderer/overlay.js#L1182).

### 5. Medium — Removing the last ordinary tab can leave stale saved tabs

**Trigger:** In a secondary window bound to a workspace, open a private tab, close every ordinary tab, then close the window. Reopen that workspace from another window.

`autosaveWorkspaceBindings()` skips every capture with zero persistable URLs. That includes a legitimate user state containing only private tabs, not just a transient teardown. The old ordinary URLs remain saved. Secondary-window close unbinds the workspace without replacing that stale capture. Reopening can restore tabs the user deliberately removed.

**Reproduced:** The real autosave function skipped the empty capture and never called the store. **Confirmed live:** the audit workspace's ordinary local page was closed while its private local page remained, then the secondary window was closed. Opening that saved workspace in a fresh window restored the ordinary page that had been deliberately removed. The private page was correctly excluded. [Private-only state](screenshots/09-private-only-before-close.png) / [stale ordinary page restored](screenshots/10-closed-tab-restored.png).

**Fix:** Distinguish deliberate empty state from teardown/swap suspension. Persist valid empty captures, using the existing explicit lifecycle guards to suppress transitional writes.

Evidence: [empty-capture guard](../../../src/main/main.js#L4535), [secondary window close](../../../src/main/main.js#L7233).

### 6. Medium — A long workspace list can extend beyond the window

**Trigger:** Accumulate workspaces toward the supported 25-workspace limit, especially in a short window.

The menu has no `max-height` or vertical scrolling. Placement flips or clamps its top but cannot make an oversized menu fit. The page itself hides overflow. Lower workspaces and the bottom New/Save actions can therefore be inaccessible.

**Reproduced geometry:** The actual placement function places an 850px-high menu at y=8 in a 600px viewport, leaving 258px below the viewport. This is a layout calculation, not a measured live 25-row screenshot.

**Fix:** Constrain the menu to available viewport height and scroll the list while keeping actions visible. Validate 0, 1, 10, and 25 items at minimum window size and increased text scale.

Evidence: [placement](../../../src/renderer/overlay.js#L743), [menu CSS](../../../src/renderer/styles.css#L2595).

### 7. Medium — Validation failure discards the name the user entered

**Trigger:** Rename to an existing name, save with an empty name, or create at the workspace limit.

Create, save-as, and rename all clear their editor state before the result is known. A rejection returns the user to the list with a detached notice, forcing them to reopen the editor and re-enter the name. The editors also have no visible Save/Cancel controls; submission relies on Enter.

**Reproduced:** Rename cleared the value and pending editor before its duplicate-name result was handled. **Confirmed live:** renaming “Audit Draft September 13” to the existing “Audit September 13” removed the input and returned to the menu, with the error above the main tab list. Save-first duplicate handling also reproduced the editor loss. [Editor](screenshots/11-rename-editor.png) / [failure](screenshots/12-rename-failure.png).

**Fix:** Keep the field, value, selection, and focus until success. Show an adjacent validation message with `aria-describedby`/`aria-invalid`, and add explicit Save and Cancel controls. Check IME composition: the workspace input's Enter handler currently lacks the `isComposing` check used by the address input.

Evidence: [save/create](../../../src/renderer/overlay.js#L1129), [rename](../../../src/renderer/overlay.js#L1244), [input handler](../../../src/renderer/overlay.js#L852).

### 8. Medium, future compatibility — Reading a newer store rewrites it destructively

**Trigger:** Run this build against a workspace file written by a future version.

`normalizeFile()` always stamps version 1 and reconstructs known record fields; first access writes the result back. This differs from `session-workspace.js`, which treats a newer format as read-only. The current test suite explicitly expects normalization of version 99, so the unsafe downgrade behavior is entrenched rather than accidental test absence.

**Reproduced:** Listing a valid temporary version-99 file rewrote it to version 1 and removed an unknown record field. This is a compatibility defect, not evidence that current v1 stores are already losing unknown data.

**Fix:** Refuse mutation for a newer version, preserve the original bytes, and provide a clear upgrade/recovery message. Keep corruption repair separate from schema migration and retain a recoverable original before repair.

Evidence: [normalization](../../../src/main/workspaces-model.js#L71), [write on read](../../../src/main/workspaces.js#L41), [existing expectation](../../../test/unit/workspaces-store.test.js#L140).

## Structural and UI improvements

- **Make workspace identity visible during browsing.** The bound name currently appears in the expanded panel footer. Add a compact current-workspace indicator in the resting chrome, with an obvious route to switching. Distinguish “Unsaved window” from a named workspace.
- **Explain the model at the decision point.** Use “New empty workspace” and “Save this window as…” instead of “new…” and “save as…”. Briefly state that changes save automatically, private tabs are excluded, and workspaces are local to this profile/device. Keep the distinction between profiles and workspaces clear: workspaces do not isolate accounts/cookies.
- **Expose management actions.** Rename/Delete are available through a context menu only. Add a visible per-row action menu usable by pointer and keyboard. State that deleting a saved workspace leaves currently open tabs in place; offer Undo or recoverable deletion.
- **Complete keyboard/menu semantics.** The popover declares `role="menu"`, but opening does not focus its first/current item, and it lacks workspace-menu arrow navigation. Its active checkmark is hidden from accessibility APIs without an explicit checked/current state on the menu item. Add intentional focus entry/return, arrow/Home/End behavior, and accessible current/tab-count labels. Verify with VoiceOver and Windows assistive technology; these are source-identified risks, not observed reader output.
- **Separate ordering from autosave churn.** Every `persistSession()` recaptures every live bound window, and `updateCapture()` advances `updatedAt` even for unchanged data. Sorting by that timestamp therefore does not reliably express last-used order. Track last activation separately or support a stable user order; only persist changed captures. Benchmark main-process cost before claiming a performance improvement.
- **Extract an explicit workspace controller.** The store/model split is good, but switching still lives in the large `main.js`, and UI state is represented by several independent booleans and IDs. Use a testable controller with explicit resolve → protect → persist → apply → bind phases, plus a single editor/action state. Avoid duplicating tab recovery or profile-routing logic.

## Flow coverage

Live coverage supplements the source review. All fourteen captures and per-step notes are in [visual-review.md](visual-review.md).

| Step | User task | Source-review health |
|---|---|---|
| 1 | Discover/open the workspace switcher | Captured: compact identity is heavily truncated; management requires right-click |
| 2 | Save the current window or create an empty workspace | Save-as succeeded; duplicate-name recovery failed live; blank creation not separately exercised |
| 3 | Switch among saved workspaces | Draft loss and false same-workspace warning confirmed live |
| 4 | Resolve scratch/private-tab warnings | Hidden confirmation and hidden save-first validation error confirmed live |
| 5 | Rename or delete a workspace | Rename failure captured; delete confirmation inspected; both audit workspaces deleted after owner approval |
| 6 | Close windows, reopen, and restore workspaces | Stale ordinary-tab restoration confirmed live; private tab correctly excluded |

Strengths worth keeping: profile-scoped storage, main-process entitlement enforcement, lapse-safe access to existing workspaces, private-tab exclusion, one-window ownership including dock-closed holders, delayed binding commit during swaps, and quiet creation of incoming tabs.

## Verification and repair order

- `node --test test/unit/workspaces-*.test.js test/unit/session-workspace.test.js`: **103 passed, 0 failed**. Full output: [unit-test-results.txt](unit-test-results.txt).
- `node docs/audits/named-workspaces-2026-09-13/reproduce.cjs`: all eight defect probes passed. [Probe source](reproduce.cjs) and [results](reproduction-results.txt). These assert current defective behavior and are audit evidence, not regression tests for a fixed implementation.
- The isolated probes launched no Electron app and used disposable temporary files. The later desktop pass used the installed app, created two clearly named audit workspaces, and kept tests in separate windows. Existing workspace records were not renamed, deleted, or switched into. After explicit owner approval, both audit workspaces were deleted through their confirmation controls. The menu returned to only Default (14 tabs) and Personal (1 tab). Audit windows were closed, the original browsing window remained, and the localhost server was stopped.

Repair order: first protect live work and make critical saves durable; then fix focus/no-op guard ordering, feedback visibility, and deliberate empty saves; then complete the menu/editor and recovery experience. Preserve the repository's launch freeze and release gates: this audit is not authorization to merge or release product changes.

Before a repair is considered verified, turn the observed dirty-form, duplicate-name, hidden-warning, same-workspace, and private-only restore cases into regression tests. Broaden desktop coverage to quiet-tab history, profile separation, disk failure, full app restart, keyboard/screen-reader behavior, and a 25-item menu at minimum window size. The visual follow-up reproduced existing defects; it does not verify a repair.
