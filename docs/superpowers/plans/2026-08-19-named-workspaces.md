# Named Workspaces — Implementation Plan (Blanc Patron, Phase 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship **Named Workspaces** — user-named, savable, switchable sets of tabs + groups — as Blanc Patron's anchor feature. A Patron can save the current window as a named workspace, switch between workspaces (tabs swap in place), rename and delete them, all from the ⌘L panel and a `/workspace` command. Non-Patrons see the surface, quietly locked.

**Design source:** `docs/superpowers/specs/2026-08-18-blanc-patron-design.md` § *Anchor feature — Named Workspaces* (locked). This plan details the shape and UI the spec deferred to plan time.

**Architecture:** All workspace *decisions* live in a new pure, Electron-free `src/main/workspaces-model.js` (mirrors `patron-model.js` / `session-workspace.js` / `tabsync-model.js`), covered by `node:test`. `src/main/workspaces.js` owns the profile-scoped `JsonStore` and is the only writer. `main.js` gains the capture/apply seams and the window↔workspace binding. The ⌘L panel and `/workspace` command are the surface. Entitlement is read through the existing `settings.isPatronActive()`.

**Tech Stack:** Electron main process, `JsonStore(name, defaults, { scope: 'profile' })`, `node --test` over `test/unit/`, the existing overlay renderer.

## Global Constraints

From the locked spec; every task implicitly includes these:

- **Patron only ever ADDS.** Nothing free today moves behind Patron. A window with no named workspace is a **scratch** window and behaves exactly as Blanc does now.
- **Profile-scoped.** A workspace belongs to exactly one local profile and can never move tabs between profiles (each profile has its own Electron session — cookies/storage/permissions differ). Storage is a profile-scoped `workspaces.json` via `JsonStore(..., { scope: 'profile' })`, which already places Personal at the userData root and named profiles under `profiles/<opaque-id>/`.
- **NOT folded into `session.json`.** That file carries the delicate v2 + v0-flat rollback mirror for 1.0.x downgrades. `session.json` stays the *live* window state; `workspaces.json` holds the *saved* named sets.
- **Single-window binding.** A named workspace is bound to at most one window at a time. Opening a workspace already bound elsewhere **focuses that window** instead of double-binding. This removes concurrent-edit conflict by construction.
- **Binding SURVIVES QUIT (correctness requirement).** A bound window must still be bound after relaunch, or autosave silently breaks: quit while bound to "Work" → relaunch restores a *scratch* window → later edits write only `session.json` → opening "Work" applies the **stale** snapshot and destroys the post-relaunch work. Persist a **pointer, not the tab set**: a `workspaceId` on the live window entry in `session.json`. The spec forbids folding named *sets* into that file; a pointer is not a set. Re-bind in `releaseStartup` after the tab set exists (`runtime.id` is already stable across restart). See Task 6.
- **Lapse gates CREATION ONLY.** Per the spec, only *creating new* workspaces is Patron-gated. `create` and `save-as` are the gated writes. **`rename`, `delete`, `open`/`switch`, and `list` are NOT gated** — an existing workspace is the user's own data and stays fully usable when Patron lapses.
- **Continuous autosave.** A bound window continuously mirrors its live tab set into its workspace slot (debounced, like session persistence). The outgoing workspace is already saved before an incoming one loads — "nothing is lost on switch" means autosave-on-change.
- **Private tabs are NEVER captured** into a workspace (consistent with session persistence).
- **Never synced.** Workspaces are device-local in this project (v2-sync-carries-workspaces is future work). `workspaces.json` must not enter `SYNCED_KEYS` or any sync payload.
- **Deleted with the profile.** Living under the profile directory means the existing profile-deletion path removes it automatically — verify, don't re-implement.
- **Lapse behavior:** on Patron lapse existing workspaces stay openable/switchable; only *creating new* ones is gated. **No free-tier floor** — a non-Patron creates zero workspaces.
- **Renderer least-privilege:** the overlay receives only a projection (`{id, name, active, tabCount}`) — never raw urls/meta.

**Decisions made at plan time (user, 2026-08-19):**
- **Switch model: swap tabs in place.** The window keeps its identity; its tab set is replaced. Not one-window-per-workspace.
- **Entry points: `/workspace` command + a ⌘L panel section.** No permanent pill affordance (protects the resting pill's minimalism).
- **Non-Patron: visible but locked** — the surface shows with a quiet `patron` tag pointing at Settings, exactly like the locked colorway tiles.
- **`/workspace <name>` = switch-if-exists, create-if-not.** An existing name in this profile **switches** to it; a new name **creates** (Patron-gated). Bare `/workspace` focuses the ⌘L section. "Save as" while already bound to a *different* workspace is a separate explicit action, never an implicit side effect of typing a name.
- **`MAX_WORKSPACES = 25`** — a plan-time bound, not from the spec. Chosen to match the existing closed-tab-entry cap so the file stays small and the ⌘L list stays scannable.
- **A switch is destructive and does not prompt.** `closeTab` does not warn on unsaved form state or active media capture, and this plan does not add a confirm. Accepted for v1 and recorded here so it is a decision, not a discovery. **Private tabs are destroyed by a switch** — they are never captured into a workspace (by spec) and the apply step closes every tab, with no reopen path (private tabs are excluded from Reopen Closed Tab). A future revision may add a confirm when the outgoing window holds private or capturing tabs.

**Testing note:** run one model file with `node --test test/unit/workspaces-model.test.js` (targeted TDD). `npm run test:unit` is the final full-suite check. Chrome/renderer changes need a relaunch (`npm start`) and are verified manually — the controller batches that.

## File Structure

- **Create `src/main/workspaces-model.js`** — pure, no `require('electron')`. Record shape, validation/normalization, create/rename/delete, binding resolution, capture/apply projections, versioned migration.
- **Create `test/unit/workspaces-model.test.js`** — `node:test` coverage for every branch.
- **Create `src/main/workspaces.js`** — the profile-scoped `JsonStore` owner; the only module that writes `workspaces.json`. Thin: delegates all decisions to the model.
- **Modify `src/main/session-workspace.js` + `test/unit/session-workspace.test.js`** — add a validated `workspaceId` to the live window entry so a binding survives quit. **`entryFrom` returns a fixed literal shape, so an unlisted key is silently dropped** — the field must be added there explicitly. It must **NOT** be added to `mirrorProjection` (the 5-key v0 rollback mirror, which deliberately excludes window ids and metadata). No `SESSION_WORKSPACE_VERSION` bump: the change is additive, an older build simply drops the unknown key on read (graceful rollback), and a newer build reading an older file gets the `null` default.
- **Modify `src/main/main.js`** — extract the existing per-window capture into a reusable helper, add apply-to-window, window↔workspace binding on the window runtime, re-bind on restore, autosave hook, and the `chrome:*` IPC surface.
- **Modify `src/renderer/overlay.js`** — the ⌘L workspaces section + `/workspace` command.
- **Modify `src/renderer/pages/shortcuts.js`, `src/main/main.js` (`SLASH_COMMANDS`), `copy/slash-commands.json`** — the `/workspace` copy, kept in sync (substrate S3 gate).
- **Modify `src/renderer/styles.css`** — overlay rows for the workspaces section (chrome stylesheet, not the substrate-guarded `:root` token values).

---

### Task 1: Pure record shape + validation (`workspaces-model.js`)

**Files:**
- Create: `src/main/workspaces-model.js`
- Test: `test/unit/workspaces-model.test.js`

**Interfaces — Produces:**
- `WORKSPACES_VERSION = 1`.
- `EMPTY_FILE()` → `{ version: 1, workspaces: [] }`.
- `normalizeWorkspace(raw)` → a valid workspace record or `null`. Shape:
  `{ id, name, profileId, createdAt, updatedAt, urls, activeIndex, groups, groupIds, pinned, meta }`
  — the same tab columns `session-workspace.js`'s `EMPTY_ENTRY` already models, so capture/apply reuse the proven shape. Reject: non-string/empty `id`, invalid `profileId`, a `name` that is not a non-empty string after trim, `urls` not an array. Coerce the parallel columns to arrays, and drop `meta` unless `meta.length === urls.length` (the same zip invariant session restore enforces).
- `normalizeFile(raw)` → `{ version, workspaces }`, dropping records that fail `normalizeWorkspace`, de-duplicating by `id` (first wins), and capping at `MAX_WORKSPACES = 25` (bounded like closed-tab entries; excess dropped from the end).
- `MAX_NAME_LENGTH = 60`; `sanitizeName(raw)` → trimmed, collapsed-whitespace, length-capped string or `null`.

- [ ] **Step 1: Write the failing test** covering: a full valid record round-trips; a record missing `name` / with a blank name / with a bad `profileId` is dropped; `meta` of mismatched length is dropped while the record survives; duplicate ids collapse; over-cap files truncate; `sanitizeName` trims/collapses/caps and returns `null` for empty.
- [ ] **Step 2: Run test to verify it fails** — `node --test test/unit/workspaces-model.test.js`.
- [ ] **Step 3: Write minimal implementation** — pure functions only, no `require('electron')`, no I/O.
- [ ] **Step 4: Run test to verify it passes.**
- [ ] **Step 5: Commit** — `feat(workspaces): pure record shape, validation, and bounded file normalization`

---

### Task 2: Pure mutations — create / rename / delete / touch

**Files:** Modify `src/main/workspaces-model.js`; extend `test/unit/workspaces-model.test.js`.

**Interfaces — Produces (all pure; each takes a file object and returns `{ file, workspace?, error? }`, never mutating the input):**
- `createWorkspace(file, { name, profileId, capture, now, id })` — rejects (`error: 'invalid-name'`) a name that fails `sanitizeName`; rejects (`error: 'limit'`) at `MAX_WORKSPACES`; rejects (`error: 'duplicate-name'`) a name already used **within the same profile** (case-insensitive) — names are the user's handle for switching, so collisions are confusing. Stamps `createdAt`/`updatedAt`.
- `renameWorkspace(file, id, name, now)` — same name rules, same-profile duplicate check, bumps `updatedAt`.
- `deleteWorkspace(file, id)` — removes it; returns `{ file, removed: boolean }`.
- `updateCapture(file, id, capture, now)` — replaces the tab columns from an autosave capture and bumps `updatedAt`. Returns unchanged file when the id is unknown.
- `listForProfile(file, profileId)` — records for one profile, newest-updated first.

- [ ] **Step 1: Write the failing test** — each rejection path by name (`invalid-name`, `limit`, `duplicate-name`), case-insensitive duplicate detection, duplicates allowed **across** different profiles, `updateCapture` on an unknown id is a no-op, `listForProfile` filters and orders, and every function leaves its input object untouched (deep-equal a pre-call snapshot).
- [ ] **Step 2: Run test to verify it fails.**
- [ ] **Step 3: Write minimal implementation.**
- [ ] **Step 4: Run test to verify it passes.**
- [ ] **Step 5: Commit** — `feat(workspaces): pure create/rename/delete/capture mutations with bounded, per-profile-unique names`

---

### Task 3: Pure binding resolution (single-window binding)

**Files:** Modify `src/main/workspaces-model.js`; extend `test/unit/workspaces-model.test.js`.

**Interfaces — Produces:**
- `resolveOpen(bindings, workspaceId, requestingWindowId)` → one of
  `{ action: 'focus', windowId }` (already bound to a *different* live window — focus it, never double-bind),
  `{ action: 'noop' }` (already bound to the requesting window),
  `{ action: 'swap' }` (unbound — the requesting window should capture-then-apply).
  `bindings` is a plain `{ [workspaceId]: windowId }` map; own-property lookups only (fail-closed, mirroring `resolveKind`).
- `bindingsAfterSwap(bindings, { workspaceId, windowId })` → bindings with this window bound to exactly one workspace (its previous binding, if any, released) and the workspace bound to exactly one window.
- `bindingsAfterUnbind(bindings, { windowId })` and `bindingsAfterDelete(bindings, workspaceId)` — used on window close and workspace delete (a deleted workspace's window becomes scratch).

- [ ] **Step 1: Write the failing test** — the three `resolveOpen` outcomes; inherited-property keys (`__proto__`, `toString`) never resolve to a binding; swapping releases the window's prior binding **and** the workspace's prior window; unbind/delete leave other bindings intact; all functions are non-mutating.
- [ ] **Step 2: Run test to verify it fails.**
- [ ] **Step 3: Write minimal implementation.**
- [ ] **Step 4: Run test to verify it passes.**
- [ ] **Step 5: Commit** — `feat(workspaces): pure single-window binding resolution`

---

### Task 4: Persistence module (`workspaces.js`)

**Files:** Create `src/main/workspaces.js`.

**Interfaces:**
- Consumes the model; produces `list()`, `create({name, capture})`, `rename(id, name)`, `remove(id)`, `saveCapture(id, capture)`, `get(id)`.
- Store: `new JsonStore('workspaces', EMPTY_FILE(), { scope: 'profile' })` created lazily in an `ensureStore()` (the `bookmarks.js` pattern), normalizing through `normalizeFile` on first access so a hand-edited or older file is repaired in place.
- `profileId` for new records is stamped from `activeLocalProfileId()`, matching how the store already scopes files.
- **A profile-scoped file never legitimately mixes profiles.** `ensureStore()` therefore also **drops any record whose `profileId` does not match the file's own profile** (a hand-edited or mis-copied file). The model's cross-profile allowances (Task 2) are model-level generality; this store enforces the single-profile invariant at the boundary.

- [ ] **Step 1: Implement** the thin wrapper — every decision delegated to the model; this file only reads/writes the store and stamps `Date.now()`.
- [ ] **Step 2: Verify** `npm run test:unit` still passes (no unit test for this file — it imports Electron; the model carries the coverage). Confirm by reading that `workspaces` appears in NO sync path: grep `SYNCED_KEYS`, `exportForSync`, `mergeFromSync`, and `sync.js` for `workspace`.
- [ ] **Step 3: Commit** — `feat(workspaces): profile-scoped workspaces.json store`

---

### Task 5: Capture + apply seams in `main.js`

**Files:** Modify `src/main/main.js`.

This is the task most likely to disturb existing behavior — treat the extraction as a pure refactor first, verified by the existing suite, before anything new consumes it.

**Interfaces:**
- **Extract** the per-window entry builder currently inline inside `persistSession()` (the object with `urls`/`groupIds`/`pinned`/`meta`/`groups`/`activeIndex`, built from `persistableEntries(...)` and `sessionTabMeta(...)` — both imported from `./session-snapshot`) into a named helper — e.g. `captureWindowEntry(runtime, { previousActiveIndex })` — and have `persistSession()` call it. **Behavior must be byte-identical**; this is a refactor, not a rewrite. Private-tab exclusion and the active-index preservation rule come along unchanged, which is exactly why the workspace capture must reuse it rather than re-derive it.
- **Add** `applyWorkspaceToWindow(runtime, workspace)` — closes the window's current tabs and creates the workspace's. This must copy the **full** restore/close protocol `releaseStartup` and `closeGroup` already use; a partial copy pollutes undo, wakes quiet tabs, drops groups, or rewrites `session.json` to a half-empty window. **Ordered checklist — every line is load-bearing:**

  1. **`hideOverlay()` and `hideUtilitySheet()`** before touching tabs (same guard other main-process navigations use).
  2. **Collapse Glance** if this window has one (`glanceTabId` is window-local and never persisted, so it must not survive into the incoming set).
  3. **Set `sessionPersistenceSuspended = true`** for the whole swap, restoring it in a `finally`. `persistSession` already refuses to write while tabs close one-by-one during teardown — the identical erosion happens mid-switch and would persist a half-empty window.
  4. **Close with `closeTab(id, { record: false, selectReplacement: false })`** — the batch pattern `closeGroup` uses. The defaults (`record: true`, `selectReplacement: true`) would push every outgoing tab into Recently Closed and, on the last tab, **spawn a replacement newtab** mid-swap.
  5. **Assign `runtime.groups = workspace.groups` BEFORE any `createTab`.** `createTab` silently drops `groupId` unless the group already exists on the runtime (`groupId && rt().groups.some((g) => g.id === groupId) ? groupId : null`, `main.js` ~3267). Startup does this same ordering.
  6. **Run `filterRestoredSession(...)`** (from `./session-restore`) over the captured columns before creating anything, exactly as `releaseStartup` does — it drops utility/forbidden URLs and keeps the parallel columns zipped.
  7. **Create tabs `asleep: true`** with `title`/`favicon` from `meta`, then `pruneEmptyGroups()` and `setActiveTab(restoreTargetId(ids, activeIndex), { focusContent: true })`. Tabs are born quiet; only the selected one loads, so a switch is cheap.
  8. **If the filtered set is empty, create exactly one `blanc://newtab`** — a window is never allowed to go tabless.
  9. **After the swap, `persistSession()` once** so `session.json` reflects the new live set (and the new `workspaceId` pointer from Task 6).
- **Add** `switchWindowToWorkspace(runtime, workspaceId)` — the ordered operation: (1) if the window is bound, `saveCapture` its current state (so nothing is lost); (2) resolve binding via the model; (3) on `focus`, focus the other window and stop; (4) on `swap`, apply the target and update bindings.
- **Bindings** live on the window-runtime record (`window-runtime-registry.js`) as `runtime.workspaceId`, with the process-wide `{workspaceId: windowId}` map derived from live runtimes. The **durable** copy is the `session.json` pointer (Task 6), not this in-memory map.
- **Autosave:** where `persistSession()` is already called, also `saveCapture` for a bound window (same debounce; no new timer). A scratch window writes nothing to `workspaces.json`.

- [ ] **Step 1: Extract the capture helper** and run `npm run test:unit` — the session/persistence tests must pass unchanged, proving the refactor is behavior-preserving. Do not proceed until they do.
- [ ] **Step 2: Add apply + switch + bindings + autosave**, following the 9-point checklist above in order.
- [ ] **Step 3: Verify** `npm run test:unit`. Manual verification is batched by the controller (`npm start`): save a workspace, switch, confirm tabs swap in place; confirm Recently Closed is **not** polluted by a switch; confirm groups survive the swap; confirm a second window opening the same workspace focuses the first; confirm a switch from a window whose captured set is empty still leaves one newtab.
- [ ] **Step 4: Commit** — `feat(workspaces): capture/apply seams, single-window binding, and autosave`

---

### Task 6: Binding survives quit (`session.json` pointer)

**Files:** Modify `src/main/session-workspace.js`, `test/unit/session-workspace.test.js`, `src/main/main.js`.

Without this, autosave silently breaks across a relaunch and a later switch destroys real work (see Global Constraints). A **pointer**, never the tab set.

**Interfaces:**
- `session-workspace.js`: add `workspaceId: null` to `EMPTY_ENTRY`, and to `entryFrom` as `validWorkspaceId(source.workspaceId) ? source.workspaceId : null`. **`entryFrom` returns a fixed literal — an unlisted key is dropped silently**, so this addition is mandatory, not incidental. Reuse/extend the existing id-shape validator rather than inventing a new regex.
- **`mirrorProjection` stays exactly five keys.** The v0 rollback mirror deliberately excludes window ids and metadata; a binding pointer is metadata. Adding it there would leak a Patron concept into the 1.0.x downgrade path.
- **No `SESSION_WORKSPACE_VERSION` bump** — additive and rollback-safe in both directions (older build drops the unknown key; newer build defaults to `null`).
- `main.js`: `persistSession()`'s per-window entry carries `workspaceId: runtime.workspaceId ?? null`. In `releaseStartup`, **after** the window's tabs are restored, re-bind `runtime.workspaceId` from the saved entry — but only if that workspace still exists in this profile's `workspaces.json` (a deleted-while-quit workspace leaves a scratch window, never a dangling binding).
- Unbind on window close and on workspace delete (Task 3's `bindingsAfterUnbind` / `bindingsAfterDelete`).

- [ ] **Step 1: Extend the entry shape + its unit tests** — `session-workspace.test.js` must cover: a valid `workspaceId` round-trips through `entryFrom`; an invalid/absent one normalizes to `null`; **`mirrorProjection` still emits exactly the five legacy keys**; `hasMirror` is unaffected.
- [ ] **Step 2: Run** `node --test test/unit/session-workspace.test.js` — green.
- [ ] **Step 3: Persist + re-bind** in `main.js` (`persistSession` writes it; `releaseStartup` restores it, dropping bindings whose workspace no longer exists).
- [ ] **Step 4: Verify** `npm run test:unit`. Manual (batched): bind a window to a workspace, **quit and relaunch**, confirm the window is still bound and that editing tabs then re-opening the workspace shows the *post-relaunch* set — the exact bug this task exists to prevent.
- [ ] **Step 5: Commit** — `feat(workspaces): persist the window↔workspace binding across quit`

---

### Task 7: IPC surface

**Files:** Modify `src/main/main.js` (the `chrome:*` handlers) and `src/main/preload.js`.

**Interfaces:**
- **Registered with `chromeHandle` / `chromeOn`** (`main.js` ~4209/4225), never raw `ipcMain` — those wrappers carry the same trusted-sender check every other `chrome:*` channel uses.
- `chrome:workspaces-list` → `{ patronActive, items: [{id, name, active, tabCount}] }` — **projection only**, never urls/meta/profileId.
- `chrome:workspaces-open` (id), `chrome:workspaces-save-as` (name), `chrome:workspaces-rename` (id, name), `chrome:workspaces-remove` (id).
- **Gating (matches the spec exactly): only `save-as`/create re-checks `settings.isPatronActive()` in main.** `list`, `open`, `rename`, and `remove` are **ungated** — an existing workspace is the user's data and stays fully usable on lapse. The renderer's `patronActive` boolean is for *display*; main is the authority for the one gated write (same rule as the permission/pages IPC).
- Results return `{ ok, error? }` so the overlay can show a quiet notice (`limit`, `duplicate-name`, `invalid-name`, `not-patron`).
- **Freshness:** every mutating handler **returns the updated list**, and switching/unbinding **broadcasts `chrome:workspaces-updated`** to open chrome renderers. A pull-once ⌘L list would keep showing the old "active" row after a switch.

- [ ] **Step 1: Implement** the handlers + preload bridge methods.
- [ ] **Step 2: Verify** — `npm run test:unit`; confirm by reading that no handler returns a raw workspace record, that only create/save-as checks entitlement, and that all channels go through `chromeHandle`/`chromeOn`.
- [ ] **Step 3: Commit** — `feat(workspaces): chrome IPC surface with creation-only entitlement gate`

---

### Task 8: ⌘L panel section + `/workspace` command

**Files:** Modify `src/renderer/overlay.js`, `src/renderer/styles.css`.

**Interfaces:**
- A **workspaces section** in the ⌘L panel's list area, below the tab switcher: one row per workspace (name + tab count), the bound one marked active. Clicking switches. Reuses the existing group-header/row visual language — no new component vocabulary.
- **Rename and delete are reachable from the row's context menu**, the pattern tab rows already use (`tab-context-menu-model.js` / `tab-context-menu.js`). Without this the Task 7 `rename`/`remove` handlers ship unused and the spec's management surface (create / rename / switch / delete / save-current-as) is incomplete. Delete asks for confirmation in-panel (a workspace is user data); a deleted workspace's bound window becomes scratch.
- **Non-Patron:** the section renders with a single quiet row carrying a `patron` tag that opens Settings at `#group-patron` (`openPage('settings','patron')`), mirroring the locked colorway tiles. A lapsed Patron with existing workspaces still sees and can switch/rename/delete them — only creation is refused.
- **`/workspace`** command: bare `/workspace` focuses the section. **`/workspace <name>` switches** if a workspace with that name exists in this profile (case-insensitive), and **creates** (Patron-gated) if it does not — the plan-time decision above. It is *not* create-only, and not `/group`-style find-or-create-a-group. Hint copy: `Switch to a named workspace, or type a new name to save this window`.
- **Save-as while bound elsewhere** is a separate explicit row/action, never an implicit consequence of typing a name.
- Chrome requires a relaunch to see changes — never verify a chrome change with a plain reload.

- [ ] **Step 1: Implement** the section + command.
- [ ] **Step 2: Substrate sync** — add `/workspace` to `src/renderer/pages/shortcuts.js`, `main.js`'s `SLASH_COMMANDS`, and `copy/slash-commands.json`; run `npm run copy:build` then `npm run copy:check` (must pass) and `npm run substrate:check` (all four).
- [ ] **Step 3: Verify manually** (relaunch `npm start`): section lists workspaces, switching swaps tabs in place, a non-Patron sees the locked row that opens Settings.
- [ ] **Step 4: Commit** — `feat(workspaces): ⌘L workspaces section and /workspace command`

---

### Task 9: Profile deletion + lapse verification

**Files:** Verification-first; modify only if a gap is found.

- [ ] **Step 1: Verify profile deletion removes `workspaces.json`** — pre-verified while writing this plan: `main.js` removes the profile directory wholesale (`fs.rmSync(namedProfileDataDirectory(profileId), { recursive: true, force: true })`), so a profile-scoped `workspaces.json` goes with it and needs no new code. Re-confirm the call still reads that way, and that Personal's root-level `workspaces.json` is *not* caught by any profile-removal path.
- [ ] **Step 2: Verify lapse behavior** — with `patron` cleared, existing workspaces still **list, open, switch, rename, and delete**; only create/save-as returns `not-patron`. Confirm the *main-side* check enforces that one gate, and that nothing else is accidentally gated.
- [ ] **Step 3: Verify never-synced** — grep the sync modules and confirm `workspaces` appears in no payload, `SYNCED_KEYS`, or export path.
- [ ] **Step 4: Commit** (only if changes were needed) — `fix(workspaces): <the specific gap>`

---

## Self-Review

**Spec coverage:** profile-scoped storage in its own `workspaces.json`, never `session.json` (T1, T4); single-window binding with focus-instead-of-double-bind (T3, T5) **that survives quit via a pointer, not a set** (T6); continuous debounced autosave so the outgoing workspace is saved before the incoming loads (T5); private tabs never captured — inherited from the reused `persistableEntries` path (T5); never synced (T4, T9); deleted with the profile (T9); lapse leaves existing workspaces fully usable and gates **creation only** (T7, T9); ⌘L + `/workspace` surface with rename/delete affordances and a visible-but-locked non-Patron state (T8). ✓

**Deliberately out of scope:** cross-profile workspaces (impossible by design — different Electron sessions); workspaces following you across devices (needs v2 authenticated sync — its own project); per-workspace window geometry; workspace icons/colors; a confirm prompt before a destructive switch (recorded as an accepted v1 trade-off above, not an oversight).

**Risk notes:**
1. **Task 5 touches `persistSession`**, load-bearing for ordinary session restore. The plan front-loads a behavior-preserving extraction verified by the existing suite before any workspace code consumes it — a regression there would corrupt normal tab restore for every user, Patron or not.
2. **Task 6 touches `session-workspace.js`**, which owns the v2 record *and* the v0 rollback mirror for 1.0.x downgrades. The field is additive, validated, and explicitly excluded from `mirrorProjection`; its unit tests must assert the mirror still emits exactly five keys.
3. **Apply is destructive by design** (closes every tab, including private ones, without a prompt). The 9-point checklist in Task 5 is the guard against it also being *lossy* — skipping any line pollutes undo, drops groups, or persists a half-empty window.
