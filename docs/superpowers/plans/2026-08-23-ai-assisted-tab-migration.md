# Bring Your Tabs (F39) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship **Bring Your Tabs** — bookmark-folder → reviewed quiet tabs + optional tab groups — as a first-class migration bridge for the #TabBarReset ritual. v1 uses on-device embeddings when the packaged model passes performance/licensing gates; deterministic bookmark-folder suggestions ship as the permanent floor.

**Design source:** `docs/superpowers/specs/2026-08-23-ai-assisted-tab-migration-design.md` (locked 2026-08-23). Track as **F39** in platform contracts.

**Architecture:** Pure, Electron-free modules own tree parsing, session tickets, sanitization, clustering, naming, and validation (`node --test`). Main owns `TabImportSessionStore`, trusted `pages:tab-import:*` IPC, and a **batch quiet-tab apply seam** in `main.js`. The utility renderer (`blanc://tab-import/`) holds UI state with opaque IDs only; a sandboxed Web Worker runs WASM embedding inference and posts vectors to main. Clustering never runs in the renderer.

**Tech Stack:** Electron main + utility-sheet renderer, `node --test`, vanilla DOM, optional `@huggingface/transformers` or `onnxruntime-web` in a Web Worker (license + size review required before lock).

## Global Constraints

From the locked spec; every task implicitly includes these:

- **Folder import, not live sessions.** No Chrome session DB, no Firefox `places.sqlite`, no Safari reading list scraping.
- **Explicit discovery (D22).** Profile/HTML reads begin only after the user picks a source in Bring Your Tabs (or the equivalent onboarding CTA). Listing browser profiles in the picker is allowed; reading `Bookmarks` waits until source selection.
- **Renderer never sees full URLs.** Projections: `candidateId`, title, hostname, folder path labels, selected state. Main retains exact URLs in the session store.
- **Favorites folder = immediate subfolder (F30).** Not migration-root stamping. Organizer still gets full `folderPath[]` beneath the root.
- **Apply atomicity.** Tabs/groups batch first; `bookmarks.importBookmarks()` only after every quiet tab record succeeds. Tab-batch failure → no Favorites write. Favorites failure after tabs → partial success + idempotent retry.
- **Preview list order is authoritative** through review, `tabOrder` splice, and the sole woken tab.
- **One live WebContents** after apply (the focused imported tab). All others `asleep: true` with `tab.view === null`.
- **Patron is additive.** Migration + suggested groups are free. Named Workspace save is a separate post-success gesture; never blocks apply.
- **No v1 telemetry.** No new ping fields, no aggregate migration events.
- **Session secrets never persist.** Import sessions do not enter `session.json`, sync, workspaces, logs, or crash reports. Embeddings released on cancel/apply/expiry.
- **F30 compatibility.** `browser-data-import.readSource()` flat `{ entries }` output must remain unchanged for onboarding/Favorites full-profile import.
- **Deterministic fallback is shipping code**, not a prototype. Tests and acceptance must pass with model disabled.
- **Chrome/renderer changes need relaunch** (`npm start`). Utility sheet HTML/JS/CSS is not refreshed by tab reload.

**Decisions made at plan time:**

- **New pure module `bookmark-tree.js`** builds the shared folder-tree + subtree candidate projection from either Chromium JSON traversal or Netscape HTML token stream. `browser-data-import.js` and `bookmark-import.js` call into it so tree shape stays identical across sources.
- **`tab-import` is the sixth utility host** — added to `UTILITY_PAGES`, `KNOWN_PAGES`, and `pageSurfaces.owns` via the existing utility-sheet hook.
- **Batch seam name:** `createQuietTabsBatch(runtime, specs, { insertAt })` — internal to `main.js` (or a thin `tab-import-apply.js` wrapper called only from main). Not exposed over IPC.
- **`MAX_TAB_IMPORT_CANDIDATES = 500`** after exact-URL dedup within the selected subtree.
- **Model packaging gate:** bundle if compressed installer delta ≤ 30 MiB with hash-verified payload on all three desktop platforms; otherwise stop and return to design review — no runtime download fallback.
- **Similarity threshold** for agglomerative clustering is a versioned constant in `tab-import-organizer.js` with fixture-locked tests (start candidate: `0.72` cosine; adjust only with fixture updates).

**Testing note:** Targeted `node --test test/unit/tab-import-*.test.js` (or per-file) during TDD. `npm run test:unit` before each phase merge. Desktop acceptance: `npm run test:acceptance:desktop` with new `tab-migration` profile tags. `BLANC_TEST=1` test-hook additions for deterministic apply reads.

**Documentation baseline:** Commit this locked design spec and implementation plan before
starting Task 1. They are the reviewed source of truth for every stacked PR; Task 19 is a
final reconciliation against the implementation, not the first time these documents enter git.

## File Structure

| Path | New/Mod | Responsibility |
|---|---|---|
| `src/main/bookmark-tree.js` | New | Pure tree build, folder counts, subtree extraction, dedup, caps |
| `src/main/browser-data-import.js` | Mod | `readFolderTree`, `readSubtreeCandidates`; flat `readSource` unchanged |
| `src/main/bookmark-import.js` | Mod | `parseNetscapeBookmarkTree(html)` sharing `bookmark-tree` |
| `src/main/tab-import-session.js` | New | Ephemeral store: ownership, TTL, generation, projections |
| `src/main/tab-import-organizer.js` | New | Sanitize, folder fallback, cluster, name, validate |
| `src/main/tab-import-apply.js` | New | Pure apply planning (order, group merge rules); optional thin helper |
| `src/main/main.js` | Mod | `createQuietTabsBatch`, `applyTabImport`, session lifecycle hooks |
| `src/main/pages.js` | Mod | `pages:tab-import:*` handlers, `KNOWN_PAGES`, file picker |
| `src/main/tab-preload.js` | Mod | `blanc://tab-import/` bridge only |
| `src/main/utility-pages.js` | Mod | `tab-import` in `UTILITY_PAGES` |
| `src/main/test-hook.js` | Mod | Read-only import session / apply helpers for acceptance |
| `src/renderer/pages/tab-import.html` | New | Utility sheet document + CSP (worker + wasm review) |
| `src/renderer/pages/tab-import.js` | New | Multi-step UI; opaque IDs only |
| `src/renderer/pages/tab-import-worker.js` | New | Embedding Web Worker |
| `src/renderer/pages/bookmarks.html` | Mod | **Bring tabs…** header action |
| `src/renderer/pages/bookmarks.js` | Mod | Opens `blanc://tab-import/` |
| `src/renderer/pages/onboarding.js` | Mod | Post-import + skip-path CTAs |
| `src/renderer/pages/newtab.html` | Mod | Import-step button rows if needed |
| `src/renderer/pages/pages.css` | Mod | Tree, preview, review columns |
| `src/renderer/overlay.js` | Mod | `/bring-tabs` dispatch |
| `src/renderer/pages/shortcuts.js` | Mod | Slash hint substrate |
| `copy/slash-commands.json` | Mod | `/bring-tabs` |
| `security/network-data-inventory.json` | Mod | Local-only IPC inventory |
| `spec/features.md` | Mod | F39 |
| `spec/parity-matrix.md` | Mod | F39 row |
| `spec/acceptance/tab-migration.feature` | New | Gherkin |
| `spec/acceptance/index.md` | Mod | F39 index |
| `test/fixtures/tab-import/` | New | Tree HTML/JSON, embedding fixtures, 100/500 stress sets |
| `test/unit/bookmark-tree.test.js` | New | Tree + subtree + dedup + caps |
| `test/unit/tab-import-session.test.js` | New | TTL, ownership, generation, projections |
| `test/unit/tab-import-organizer.test.js` | New | Fallback, cluster, naming, validator |
| `test/unit/tab-import-apply.test.js` | New | Apply plan ordering |
| `test/unit/browser-data-import.test.js` | Mod | Tree APIs + F30 regression |
| `test/unit/bookmark-import.test.js` | Mod | HTML tree parity |
| `test/desktop/tab-import.mjs` | New | Acceptance steps |
| `scripts/verify-packaged-tab-import-model.js` | New | Optional after model lands — hash gate in `afterPack` |

Model asset path chosen in **Task 15** after benchmark (e.g. `build/tab-import-model/` or `src/renderer/pages/tab-import-model/`).

---

## Phase 1 — Pure substrate + governance

### Task 1: Platform contracts (F39)

**Files:** `spec/features.md`, `spec/parity-matrix.md`, `spec/acceptance/tab-migration.feature`, `spec/acceptance/index.md`, `spec/acceptance/README.md`, `security/network-data-inventory.json`

- [x] **Step 1:** Add **F39 — Bring Your Tabs** to `spec/features.md` (copy acceptance outline from design spec §Spec parity).
- [x] **Step 2:** Add parity-matrix row with desktop, iOS, and Android all `PLANNED`. Desktop may become `SHIPPED` only in Task 18 after its acceptance gate passes; mobile remains `PLANNED` (export-only + folder fallback; no on-device ML until separate review).
- [x] **Step 3:** Create `spec/acceptance/tab-migration.feature` with `@F39` scenarios stubbed from design test matrix (tag `@runnable` only for implemented steps).
- [x] **Step 4:** Update `spec/acceptance/index.md` checklist.
- [x] **Step 5:** Register `pages:tab-import:*` channels in `security/network-data-inventory.json` as local IPC, no network.
- [x] **Step 6:** Commit — `docs(spec): add F39 Bring Your Tabs contracts`

---

### Task 2: Pure bookmark tree (`bookmark-tree.js`)

**Files:** Create `src/main/bookmark-tree.js`, `test/unit/bookmark-tree.test.js`, `test/fixtures/tab-import/chromium-mini.json`, `test/fixtures/tab-import/netscape-mini.html`

**Interfaces (pure, no Electron):**

- `buildChromiumTree(rootsObject, { now, maxNodes, maxDepth })` → `{ folders[], rootFolderIds[] }`
- `buildNetscapeTree(html, { now, maxNodes })` → same shape
- `extractSubtree(tree, rootFolderId)` → `{ candidates[] }` with `url`, `title`, `addedAt`, `folderPath[]`, `favoriteFolder`, `sourceFolderId`
- `dedupeCandidatesByUrl(candidates)` → `{ candidates, duplicateCount }` (exact URL string equality after normalization)
- `enforceCandidateCap(candidates, max = 500)` → `{ ok, candidates }` or `{ ok: false, count }`
- Folder records: `folderId` (stable hash of path within snapshot), `name`, `pathLabels`, `childFolderIds`, `httpCount`, `subtreeHttpCount`

- [ ] **Step 1:** Write failing tests — nested folders, HTTP(S) filter, depth/node caps, dedup collapse, 500 cap after dedup, `folderPath` vs `favoriteFolder` on nested HTML/Chromium fixtures.
- [ ] **Step 2:** `node --test test/unit/bookmark-tree.test.js` → FAIL.
- [ ] **Step 3:** Implement minimal tree builders reusing logic from `parseChromiumBookmarks` / `parseNetscapeBookmarks` traversal patterns.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit — `feat(tab-import): pure bookmark tree and subtree extraction`

---

### Task 3: Wire tree APIs into import modules (F30 regression)

**Files:** Modify `src/main/browser-data-import.js`, `src/main/bookmark-import.js`, extend `test/unit/browser-data-import.test.js`, `test/unit/bookmark-import.test.js`

- [ ] **Step 1:** Add failing tests — `readFolderTree` / `readSubtreeCandidates` on test home via `BLANC_TEST_BROWSER_HOME`; assert `readSource().entries` unchanged vs pre-task snapshots.
- [ ] **Step 2:** `browser-data-import`: after `readSource` parse, also expose `readFolderTree(id)` and `readSubtreeCandidates(id, rootFolderId)` using `bookmark-tree.js`.
- [ ] **Step 3:** `bookmark-import`: export `parseNetscapeBookmarkTree(html)` returning tree shape; keep `parseNetscapeBookmarks` as flat `extractSubtree(all roots)` for F30 compatibility.
- [ ] **Step 4:** All unit tests PASS; `npm run test:unit` green.
- [ ] **Step 5:** Commit — `feat(tab-import): tree read APIs with F30 flat import preserved`

---

### Task 4: Import session store (`tab-import-session.js`)

**Files:** Create `src/main/tab-import-session.js`, `test/unit/tab-import-session.test.js`

**Interfaces:**

- `createSession({ runtimeId, profileId, sourceKind, sourceLabel })` → `{ sessionId, generation }`
- `assignCandidates(sessionId, candidates)` → assigns random `candidateId`s; stores URLs server-side
- `projectCandidates(sessionId)` → renderer-safe rows (no URLs)
- `setSelection(sessionId, { selectedIds, excludedIds })`
- `storeEmbeddings(sessionId, generation, matrix)` / `clearEmbeddings(sessionId)`
- `markTabsApplied(sessionId, generation, { tabIds, focusTabId, favoriteEntries })` — one-way `ready` → `tabsApplied` transition after the transactional tab/group batch
- `resolveFavoritesRetry(sessionId, generation)` — valid only in `tabsApplied`; returns the retained Favorites payload without any tab/group apply data
- `touch(sessionId)` / `expireIdleSessions(now)` — 15-minute TTL
- `destroySession(sessionId, reason)` — cancel, apply, window close, profile delete
- `resolveApply(sessionId, { generation, groups, ungroupedIds })` → validated apply payload only while state is `ready`; `tabsApplied` rejects another tab/group apply
- Ownership: reject cross-runtime/cross-profile; one active session per utility sheet surface (replacing prior session bumps `generation`)

Inject `now`, `randomId`, `randomBytes` for deterministic tests.

- [ ] **Step 1:** Failing tests for TTL, double-apply rejection, stale generation, projection omits URL, `ready` → `tabsApplied`, Favorites-only retry, and destroy on cancel.
- [ ] **Step 2:** Implement store (in-memory Map; no disk). A partial Favorites failure retains only the bounded retry payload and created-tab IDs; it can never transition back to `ready`.
- [ ] **Step 3:** Tests PASS.
- [ ] **Step 4:** Commit — `feat(tab-import): ephemeral main-process session store`

---

### Task 5: Organizer — folder fallback + validator (`tab-import-organizer.js`)

**Files:** Create `src/main/tab-import-organizer.js`, `test/unit/tab-import-organizer.test.js`, `test/fixtures/tab-import/folder-suggestion.json`

**Interfaces:**

- `sanitizeCandidateInput(candidate)` → model input row
- `proposeFromFolders(selectedCandidates)` → `{ version: 1, groups, ungroupedCandidateIds }` using folder anchors (≥2 URLs per subfolder)
- `proposeFromEmbeddings(selectedCandidates, embeddingMatrix, { threshold })` → same schema with `confidence: 'high' | 'review'`
- `deriveGroupName(clusterMembers)` → lowercase ≤40, stop-word filter, no `misc`/`stuff` invention
- `validateProposal(proposal, { selectedIds, excludedIds })` → `{ ok: true, proposal }` or `{ ok: false, reason }`
- `CLUSTER_THRESHOLD = 0.72` (exported constant)

- [ ] **Step 1:** Failing tests for folder anchors, min group size 2, max 12 groups, invalid IDs rejected, generic name avoidance, collision handling.
- [ ] **Step 2:** Implement folder fallback + validator first (no embeddings math yet).
- [ ] **Step 3:** Add cosine similarity + agglomerative clustering with fixed fixture matrix → stable clusters across runs.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit — `feat(tab-import): organizer fallback, clustering, and validator`

---

### Task 6: Pure apply planner (`tab-import-apply.js`)

**Files:** Create `src/main/tab-import-apply.js`, `test/unit/tab-import-apply.test.js`

**Interfaces:**

- `planTabImportApply({ candidates, proposal, existingGroupNames })` → ordered `{ tabs[], groups[], favoriteEntries[], focusCandidateId }`
- Resolves group-name collision with existing window groups (merge vs create)
- Preserves preview order; `focusCandidateId` = first selected in that order

- [ ] **Step 1:** Failing tests — order, merge into existing group name, immediate-subfolder favorite mapping.
- [ ] **Step 2:** Implement pure planner.
- [ ] **Step 3:** Tests PASS.
- [ ] **Step 4:** Commit — `feat(tab-import): pure apply planner`

---

## Phase 2 — Utility surface + trusted IPC (folder fallback E2E)

### Task 7: Utility routing + `tab-import` page shell

**Files:** `src/main/utility-pages.js`, `src/main/pages.js`, `src/renderer/pages/tab-import.html`, `src/renderer/pages/tab-import.js` (skeleton), `src/renderer/pages/pages.css`

- [ ] **Step 1:** Add `tab-import` to `UTILITY_PAGES` and `KNOWN_PAGES`.
- [ ] **Step 2:** Create `tab-import.html` with utility `body.sheet` layout, CSP allowing `worker-src 'self'` (tighten wasm rules in Task 16).
- [ ] **Step 3:** Skeleton `tab-import.js` — step enum (`source` | `folder` | `preview` | `review`), no IPC yet.
- [ ] **Step 4:** `openInternalPage('blanc://tab-import/')` opens sheet; relaunch verify manually.
- [ ] **Step 5:** Commit — `feat(tab-import): utility sheet host and shell`

---

### Task 8: Trusted IPC (`pages.js` + `tab-preload.js`)

**Files:** `src/main/pages.js`, `src/main/tab-preload.js`, `src/main/main.js` (wire session store instance)

**Channels (consolidation allowed, trust model fixed):**

| Channel | Purpose |
|---|---|
| `pages:tab-import:sources` | `browserImport.listSources()` |
| `pages:tab-import:open-source` | Read tree snapshot → session + folder tree projection |
| `pages:tab-import:open-file` | File picker + HTML tree snapshot |
| `pages:tab-import:select-folder` | Subtree candidates → session candidates |
| `pages:tab-import:set-selection` | Toggle selected/excluded IDs |
| `pages:tab-import:suggest-folders` | Folder fallback proposal |
| `pages:tab-import:suggest-embed` | Start worker path; returns generation token (Task 16) |
| `pages:tab-import:submit-embeddings` | Main stores matrix, returns AI proposal |
| `pages:tab-import:apply` | Delegates to `applyTabImport` hook |
| `pages:tab-import:cancel` | Destroy session |

- [ ] **Step 1:** Extend `pageSurfaces.owns` — `UTILITY_PAGES.has(host)` already covers new host when in set.
- [ ] **Step 2:** Register handlers with `handle(channel, 'tab-import', fn)` + `runInPageRuntime`.
- [ ] **Step 3:** `tab-preload.js` — expose `bowserPages.tabImport` only when `host === 'tab-import'`.
- [ ] **Step 4:** Unit-level denial tests via `test/desktop` stub or small `pages-ipc-trust` extension test — wrong host/frame rejected.
- [ ] **Step 5:** Commit — `feat(tab-import): trusted pages:tab-import IPC surface`

---

### Task 9: Folder-picker + preview UI

**Files:** `src/renderer/pages/tab-import.js`, `src/renderer/pages/pages.css`

- [ ] **Step 1:** Source list UI (reuse browser source labels from F30).
- [ ] **Step 2:** Folder tree with counts; highlight heuristic names (`tab reset`, etc.) without auto-select.
- [ ] **Step 3:** Preview table — checkbox per row, select all/none, duplicate-removed badge, hostname + folder path only.
- [ ] **Step 4:** **Use bookmark folders** → folder proposal → review screen (drag/drop can be minimal v1: move menus + keyboard).
- [ ] **Step 5:** Cancel/scrim/Escape → `pages:tab-import:cancel`; session destroyed.
- [ ] **Step 6:** Manual relaunch smoke through folder fallback review (apply stubbed or TODO next task).
- [ ] **Step 7:** Commit — `feat(tab-import): source, folder, and preview UI`

---

### Task 10: Review UI + apply consequence copy

**Files:** `src/renderer/pages/tab-import.js`, `src/renderer/pages/pages.css`

- [ ] **Step 1:** Review columns — rename group (validated input), move between groups, ungrouped lane, exclude/restore.
- [ ] **Step 2:** Confidence treatment — solid / “needs a look” / ungrouped; no numeric scores; not color-only.
- [ ] **Step 3:** Primary button copy — `Open N tabs in M groups · K ungrouped` dynamic counts.
- [ ] **Step 4:** Post-apply Patron workspace CTA + quiet non-Patron line (no checkout); wire workspace save only to existing `chrome:workspaces-save-as` / patron surfaces.
- [ ] **Step 5:** A11y — live region for progress/errors; checkbox rows; keyboard move menus.
- [ ] **Step 6:** Commit — `feat(tab-import): review UI and apply confirmation`

---

## Phase 3 — Batch apply + entry points

### Task 11: Batch quiet-tab seam + `applyTabImport`

**Files:** `src/main/main.js` (primary), optionally `src/main/tab-import-apply.js` caller

**`createQuietTabsBatch(runtime, tabSpecs, { insertAt })`:**

- Does **not** call `hideUtilitySheet()`, `broadcastTabs()`, `persistSession()`, or a per-tab menu rebuild. Refactor the existing tab-record constructor behind a narrow internal side-effect suppression context; do not duplicate tab construction.
- For each spec: same validation as `createTab` (`isForbiddenTopLevelUrl`, `isUtilityUrl`, private=false).
- Resolves each normalized group-name intent against the destination runtime without calling `groupTabByName()` (that helper assigns immediately and broadcasts). An existing exact lowercase name reuses its group ID; a new group record is created transactionally with its first member.
- Creates quiet records (`bornQuiet`), splices `tabOrder` at `insertAt` (active index + 1, else end) preserving spec order.
- Returns `{ tabIds[], tabIdByCandidateId, createdGroupIds[], error? }`. On the first fatal error, roll back every tab record, `tabOrder` insertion, runtime attachment, and group created by this batch. Pre-existing groups are left unchanged. No intermediate state is broadcast or persisted.

**`applyTabImport(runtime, validatedPlan)`:**

1. Resolve and revalidate a `ready` session plus the pure apply plan.
2. `createQuietTabsBatch` transactionally creates the tabs and any new groups; an error rolls back both and leaves Favorites untouched.
3. `pruneEmptyGroups()` and map `focusCandidateId` to its new tab ID.
4. Atomically mark the session `tabsApplied` with the created tab IDs, focus tab ID, and bounded Favorites retry payload. From this point, the apply endpoint must never create tabs/groups again, including if activation fails.
5. Wake and activate only that tab. Extend the internal activation call with `dismissUtilitySheet: false` so the normal `setActiveTab()` dismissal does not hide a recoverable result. If activation fails, retain `tabsApplied`, leave Favorites untouched, broadcast/persist the created tabs once, and offer activation retry without recreating anything.
6. Call `bookmarks.importBookmarks(favoriteEntries)`. On failure, perform the single `broadcastTabs()`/session persistence and menu rebuild, retain the `tabsApplied` session, keep the sheet open, and return `{ ok: false, phase: 'favorites', tabIds, retryable: true }`.
7. On initial success—or a later Favorites-only retry—perform the single broadcast/persist/menu update if it has not already occurred, destroy the import session and embeddings, and call `hideUtilitySheet()` once.

**Favorites retry:** the retry action calls `resolveFavoritesRetry()` and
`bookmarks.importBookmarks()` only. It must not re-run `planTabImportApply`,
`createQuietTabsBatch`, group resolution, wake, or activation. Because the existing
Favorites import is add-only and deduplicating, retry is idempotent even if the first
write partially reached disk.

Wire window close, profile deletion, utility sheet dismiss, and app quit to `tabImportSessions.destroyForRuntime(runtimeId)`.

- [ ] **Step 1:** Failing tests for batch splice order, existing-group merge without `groupTabByName()` side effects, full tab/group rollback, the `ready` → `tabsApplied` transition, and Favorites-only retry without duplicate tabs.
- [ ] **Step 2:** Implement batch seam + apply hook.
- [ ] **Step 3:** Verify `createTab` loop would have called `hideUtilitySheet` — batch path does not.
- [ ] **Step 4:** `npm run test:unit` green.
- [ ] **Step 5:** Commit — `feat(tab-import): batch quiet-tab apply seam`

---

### Task 12: Entry points — Favorites + slash command

**Files:** `src/renderer/pages/bookmarks.html`, `src/renderer/pages/bookmarks.js`, `copy/slash-commands.json`, `src/renderer/overlay.js`, `src/renderer/pages/shortcuts.js`

- [ ] **Step 1:** Favorites header **Bring tabs…** → `openInternalPage('blanc://tab-import/')` via `bowserPages` surface opener or IPC already used for navigation.
- [ ] **Step 2:** Add `/bring-tabs` to `copy/slash-commands.json`; `npm run copy:build`.
- [ ] **Step 3:** `overlay.js` — dispatch opens tab-import sheet (same as bookmarks).
- [ ] **Step 4:** `shortcuts.js` hint line; `npm run substrate:check`.
- [ ] **Step 5:** Commit — `feat(tab-import): Favorites and slash entry points`

---

### Task 13: F36 onboarding handoff

**Files:** `src/renderer/pages/onboarding.js`, `src/renderer/pages/newtab.html`, `docs/superpowers/specs/2026-08-16-newtab-layouts-onboarding-design.md` (amend import step copy)

- [ ] **Step 1:** After successful `importBrowser` / file import — show **Bring a folder in as tabs…** secondary action.
- [ ] **Step 2:** Skip / zero-import path — **Bring tabs without importing everything…**.
- [ ] **Step 3:** Both call existing utility opener (closes onboarding dialog first if needed).
- [ ] **Step 4:** Update onboarding design spec cross-ref paragraph.
- [ ] **Step 5:** Manual fresh-profile smoke; repoint F30-3/F36 acceptance steps if needed.
- [ ] **Step 6:** Commit — `feat(tab-import): onboarding import-step handoff`

---

### Task 14: Test hook + desktop acceptance (folder fallback path)

**Files:** `src/main/test-hook.js`, `test/desktop/tab-import.mjs`, extend `spec/acceptance/tab-migration.feature` `@runnable` tags

- [ ] **Step 1:** Test hook — `openTabImport()`, `getTabImportSessionProjection()`, `applyTabImportFixture(name)` for fixtures only when `BLANC_TEST=1`.
- [ ] **Step 2:** Desktop steps — open sheet, select fixture source/folder, folder fallback, apply, assert quiet tabs, single wake, favorite folders, profile isolation, IPC denial cases.
- [ ] **Step 3:** `npm run test:acceptance:desktop -- --tags "@F39 and @runnable"`.
- [ ] **Step 4:** Commit — `test(tab-import): acceptance harness and folder-fallback scenarios`

---

## Phase 4 — On-device embeddings

### Task 15: Model selection + packaging benchmark

**Files:** research note in plan commit or `docs/superpowers/specs/2026-08-23-ai-assisted-tab-migration-design.md` appendix, `package.json` (if dep added), `src/THIRD_PARTY_NOTICES.txt`

- [ ] **Step 1:** Evaluate 1–2 candidates (e.g. small MiniLM-class ONNX via `transformers.js`) on 100- and 500-candidate fixtures — time, memory, installer delta.
- [ ] **Step 2:** Record SHA-256, license, compressed size; fail gate if > 30 MiB installer increase.
- [ ] **Step 3:** Pin exact model bytes in repo; add SBOM/notices entries.
- [ ] **Step 4:** If gate fails — document ship decision: folder-only until re-review; skip Tasks 16–17 model enablement.
- [ ] **Step 5:** Commit — `chore(tab-import): pin embedding model and packaging benchmark`

---

### Task 16: Web Worker embedding path

**Files:** `src/renderer/pages/tab-import-worker.js`, `src/renderer/pages/tab-import.js`, `src/renderer/pages/tab-import.html` (CSP), `src/main/pages.js` (`submit-embeddings` handler)

- [ ] **Step 1:** Worker loads model lazily on first **Suggest groups on this device**; progress UI “Finding related pages…”.
- [ ] **Step 2:** Worker computes embeddings; posts `Float32Array[]` + generation to main via `pages:tab-import:submit-embeddings` (main validates generation + session).
- [ ] **Step 3:** Main runs `proposeFromEmbeddings`; worker terminated on cancel/apply (`worker.terminate()`).
- [ ] **Step 4:** Renderer does not retain embedding arrays outside worker message flight.
- [ ] **Step 5:** Unit tests with fixed embedding fixture matrix (no worker) already cover clustering; add one integration test with mock embeddings through IPC if feasible.
- [ ] **Step 6:** Commit — `feat(tab-import): on-device embedding worker path`

---

### Task 17: Packaged verification + performance gates

**Files:** `scripts/verify-packaged-tab-import-model.js`, hook in `scripts/verify-packaged-adblock.js` pattern or `afterPack`, extend acceptance for AI path

- [ ] **Step 1:** Verify model/runtime bytes in packaged `app.asar` / resources SHA-256 match pinned manifest.
- [ ] **Step 2:** Run 100-candidate ≤3s and 500-candidate ≤10s checks on release-class hardware (document machine in test or manual gate checklist).
- [ ] **Step 3:** Transient memory ≤250 MiB above baseline during organizer (manual or scripted probe).
- [ ] **Step 4:** Acceptance — model absent/corrupt → folder fallback; cancel during embedding leaves no worker.
- [ ] **Step 5:** `npm run test:unit` + tagged acceptance green.
- [ ] **Step 6:** Commit — `test(tab-import): packaged model verification and AI path acceptance`

---

## Phase 5 — Release readiness

### Task 18: Final governance + substrate

- [ ] **Step 1:** `spec/acceptance/index.md` — mark F39 scenarios ✅ as implemented.
- [ ] **Step 2:** `npm run substrate:check` + `npm run test:unit` + full desktop acceptance profile.
- [ ] **Step 3:** Confirm no startup model load (packaged smoke: devtools/network idle at launch).
- [ ] **Step 4:** Confirm macOS library validation unchanged (only Plugin helper exception).
- [ ] **Step 5:** Commit — `docs(spec): mark F39 desktop scenarios runnable`

---

### Task 19: Final spec + plan reconciliation

- [ ] **Step 1:** Re-read the tracked design spec and plan against the implemented interfaces, accepted model decision, final copy, and F39 acceptance evidence. Amend only to record intentional implementation decisions; do not silently weaken locked requirements.
- [ ] **Step 2:** Confirm no unchecked plan-time decision or stale task reference remains.
- [ ] **Step 3:** Commit any reconciliation — `docs(tab-import): reconcile F39 spec and implementation plan`

---

## Verification checklist (release gate)

Before enabling #TabBarReset campaign copy:

- [ ] Folder-only path complete on macOS, Windows, Linux.
- [ ] AI path passes performance + packaging gates on all three platforms, or AI button hidden with folder fallback only (explicit product decision recorded).
- [ ] No full URL in renderer projection (grep + acceptance).
- [ ] Import session absent from `session.json` and sync payloads.
- [ ] 500-candidate stress: one live WebContents, one broadcast on apply.
- [ ] Upgrade from public baseline v1.8.2 preserves existing tabs/Favorites/workspaces.
- [ ] `npm run substrate:check` green.

## Suggested merge sequence

Land as **stacked PRs** matching phases to keep review bounded:

1. **PR1 — Pure + F30 tree APIs** (Tasks 1–6, no UI)
2. **PR2 — Utility surface + IPC + folder fallback UI** (Tasks 7–10)
3. **PR3 — Apply seam + entry points + acceptance floor** (Tasks 11–14)
4. **PR4 — Embeddings + packaged gates** (Tasks 15–17, optional if model gate fails)
5. **PR5 — Governance cleanup** (Task 18–19)

Each PR should keep `npm run test:unit` green and expand `@F39 @runnable` coverage monotonically.
