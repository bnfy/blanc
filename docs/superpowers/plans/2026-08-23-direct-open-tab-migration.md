# Bring Your Tabs (F39) — corrected implementation plan

**Goal:** Replace the rejected bookmark-folder implementation with direct import of a selected
Chromium-family profile's currently restorable open tabs, followed by selection and Blanc Named
Group organization. Applying creates quiet tabs/groups only and never writes Favorites.

**Design source:** `docs/superpowers/specs/2026-08-23-direct-open-tab-migration-design.md`

**Status:** Corrected implementation complete; verification in progress. F39 remains `PLANNED`
until packaged/platform evidence passes.

## Non-negotiable corrections

- Read `Sessions/Session_*`, not `Bookmarks`.
- Remove the Folder step and bookmarks HTML fallback from Bring Your Tabs.
- Do not deduplicate open tabs.
- Do not create/import Favorites or retain a Favorites retry state.
- Preserve named source tab groups when eligible; leave everything else editable and ungrouped.
- Keep the approved official-logo browser-card source UI.
- Do not reuse the previous bookmark-backed acceptance results as evidence for this product.
- Ask for a normal source-browser quit only after a recoverability preflight; never force-quit,
  never overpromise automatic reopening, and never proceed from a stale post-quit snapshot.

## Phase 1 — Repair the source of truth

### Task 1: Governance correction

- [x] Replace the bookmark-folder design with the direct-session design.
- [x] Record why the prior design was invalid and return F39 to `PLANNED`.
- [x] Update `spec/features.md`, parity matrix, divergence register, acceptance index/README, and
  marketing-facing copy so none claims folder import equals open-tab migration.
- [x] Preserve F30 Favorites contracts separately.

### Task 2: Remove newly introduced misleading UI copy

- [x] Remove “saved pages,” “bookmarks folder,” “Save to Favorites,” and Favorites apply copy from
  the in-progress source redesign.
- [x] Change progress labels to **Source / Tabs / Organize / Review**.
- [x] Remove HTML-file fallback from F39; leave it on F30 Favorites import.
- [x] Keep official browser cards, profile rows, responsive layout, and permission states.

## Phase 2 — Pure session substrate

### Task 3: Chromium command framing and pickle reader

Create `src/main/chromium-session.js` with no Electron dependency.

- [x] Parse/validate `SNSS` header and cleartext version 3.
- [x] Parse uint16-framed commands with bounded offsets and tolerate only a partial final command
  after a valid initial-state marker.
- [x] Implement a bounded Chromium Pickle cursor for int32, uint32, int64/uint64, bool, string, and
  UTF-16 string with 4-byte alignment.
- [x] Extract navigation command fields only through URL/title/current-index; skip page-state bytes
  without decoding them.
- [x] Reject version 5 as `encrypted-session` without OS credential access.
- [x] Unit-test malformed/truncated/oversized commands and strings.

### Task 4: Session reconstruction

- [x] Replay known commands for tab-window membership, visual order, current navigation, window
  type/selection, active window, tab/window close, pinned state, tab-group token, and group title.
- [x] Ignore unknown command IDs without failing the whole file.
- [x] Include normal windows only; filter candidates to HTTP(S).
- [x] Preserve duplicates, source window boundaries, tab order, named group metadata, and last
  active time when available.
- [x] Add synthetic multi-window/group/duplicate/close fixtures built by a test helper—not copied
  from a real user profile.

### Task 5: Session-file selection

- [x] Enumerate `Sessions/Session_*` by encoded timestamp with a 64 MiB cap.
- [x] Open/read through one descriptor and require a valid marker.
- [x] Select the newest usable snapshot; do not fall back past a locked newest file.
- [x] Return structured permission/locked/encrypted/empty/malformed/too-many errors.
- [x] Add a recoverability preflight that can establish a usable saved session before any quit
  prompt is shown.
- [x] After the user's normal-quit confirmation, require a stable, exact newest complete snapshot;
  otherwise stop and tell the user to reopen the source browser. Do not infer or terminate source
  processes.
- [x] Unit-test current file, partial tail, missing marker, lock simulation, stabilization,
  preflight refusal, post-quit refusal, and candidate cap.

## Phase 3 — Main-process integration

### Task 6: Browser source discovery and explicit read

- [x] Discover profile directories independently of a `Bookmarks` file.
- [x] Keep `readSource()` and all F30 bookmark methods unchanged.
- [x] Add `readOpenTabs(sourceId)`; bytes are read only after profile selection.
- [x] Public source rows remain URL-free and include browser/profile labels only.
- [x] Update permission guidance to refer to profile/session access, not HTML export.

### Task 7: Correct the ephemeral session model

- [x] Extend raw candidates with source window/order, source group name/token, pinned, last active.
- [x] Project only opaque ID, bounded title/hostname, source window/order, group name, pin, and
  selection state to the utility renderer.
- [x] Remove `favoriteFolder`, `favoriteEntries`, and Favorites-retry storage. Retain only the
  minimal applied-tab IDs needed to prevent duplicate creation if first-tab activation must retry.
- [x] Mark a successful tab batch applied and immediately destroy the session after activation.
- [x] Keep ownership, generation, 15-minute TTL, cancel, window-close, and quit destruction tests.

### Task 8: Correct organizer and apply planner

- [x] Add deterministic proposal from eligible named source groups.
- [x] Blank/single-tab source groups remain ungrouped; no placeholder groups.
- [x] Keep rename/move/create validation, normalized collision merge, 12-group cap, and complete
  disposition validation.
- [x] Remove `favoriteEntries` from `planTabImportApply()` and all tests.
- [x] Preserve preview order and first-selected focus.

### Task 9: Simplify main apply

- [x] Keep `createQuietTabsBatch()` transaction and full rollback.
- [x] Remove `importTabImportFavorites`, Favorites failure injection, partial-success state, and
  retry paths.
- [x] Apply: resolve → plan → batch → wake one → destroy session → close sheet → optional Workspace
  CTA → one coalesced broadcast/persist/menu rebuild.
- [x] Prove Favorites store is semantically unchanged by successful and failed F39 apply.

## Phase 4 — Utility flow

### Task 10: Replace folder IPC

- [x] Replace `readFolderTree`, `selectFolder`, and `suggestFolders` F39 handlers with explicit
  `readOpenTabs` and `suggestSourceGroups` handlers.
- [x] Keep surface ownership, main-frame, runtime/profile, and session-generation checks.
- [x] Remove HTML-source handling from the F39 bridge.
- [x] Keep F30 folder/tree APIs only if still used by Favorites; do not expose them as Bring Tabs.

### Task 11: Tabs screen

- [x] Render candidates by source window in source order.
- [x] Show title, hostname, source group, and pin metadata; no URL/query exposure.
- [x] Select all/none and per-row selection; selected count remains live.
- [x] Duplicate URLs render as independent candidates.
- [x] Provide exact empty/locked/permission/encrypted/malformed/limit errors and retry where safe.
- [x] Show a quit prompt only when preflight proves saved/restorable tabs exist; state that Blanc
  reads without removing them and that automatic reopening remains a source-browser preference.

### Task 12: Organize and review screens

- [x] Seed editable groups from named source groups.
- [x] Render ungrouped lane; support rename, create, move, and delete-group-to-ungrouped.
- [x] Remove folder suggestion button and any semantic-AI copy from v1.
- [x] Review summary/button: **Open N tabs in Blanc** and **N Named Groups**; no Favorites language.
- [x] Apply errors remain inline without dismissing the sheet.

### Task 13: Entry-point copy

- [x] Onboarding says **Bring your open tabs…** regardless of Favorites import choice.
- [x] Favorites sheet labels F30 import and F39 open-tab migration as separate actions.
- [x] `/bring-tabs` description says it reads open/restorable tabs from another browser.
- [x] Audit all generated copy and current docs for “folder in as tabs” residue; superseded records
  remain historical and are labeled as such.

## Phase 5 — Acceptance and release evidence

### Task 14: Unit and desktop acceptance

- [x] Replace bookmark-tree F39 scenarios with session fixtures covering the 15-item acceptance
  floor in the design spec.
- [x] Keep separate F30 bookmark regression coverage.
- [x] Update test hook to open a synthetic profile/session and inspect projected/apply results
  without returning full URLs to renderer-facing hooks.
- [x] Run focused tests, `npm run test:unit`, and `npm run test:acceptance:desktop`.

### Task 15: Packaged/platform verification

- [x] Run substrate/parity/security checks.
- [x] Build `npm run dist:dir`; verify no model/WASM payload.
- [ ] macOS: signed candidate reads an explicitly selected real test profile with Full Disk Access.
- [ ] Windows: prove locked-current-file quit/retry behavior and read after browser exit.
- [ ] Linux: prove installed Chromium-family cleartext session read.
- [x] Capture visual QA for Source, Tabs, Organize, Review at desktop and narrow sheet sizes.
- [x] Update `design-qa.md` with reference-vs-live comparisons and final pass.

### Task 16: Governance reconciliation and PR

- [x] Mark only corrected scenarios `@runnable` and only after they pass.
- [ ] Move F39 from `PLANNED` to `SHIPPED` only after Task 15 release evidence.
- [x] Amend PR #205 description to disclose that the bookmark-folder implementation was replaced,
  list new parser/security boundaries, and remove prior acceptance claims.
- [x] Push for human review; do not merge automatically.

## Reuse vs. replacement

| Existing work | Decision |
|---|---|
| Official-logo browser cards | Keep |
| Utility-sheet host/trusted IPC framework | Keep |
| Ephemeral opaque-ID session ownership | Keep, simplify |
| Quiet transactional tab batch | Keep |
| Review editing UI | Keep structure, seed from source groups |
| Bookmark tree/subtree selection | Remove from F39; retain only if F30 uses it |
| Favorites apply/retry | Delete from F39 |
| Folder-based organizer | Delete from F39 path |
| Embedding benchmark/model | Remains deferred |
| Bookmark-backed F39 acceptance | Replace; not valid evidence |

## Stop conditions

- Do not retrieve another browser's OS-crypt keys.
- Do not silently import a stale session when the newest file is locked.
- Do not market F39 as open-tab migration until corrected packaged evidence exists.
- Do not alter or regress F30 Favorites import while replacing F39.
