# Blanc Spaces Free for Everyone — Implementation Plan (PR 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can create, save and import Blanc Spaces; Blanc Patron becomes pure support that unlocks nothing.

**Architecture:** Remove the entitlement checks at their three seams — the Electron-free workspace controller (`canCreate`), main's save-as IPC handler, and the Electron-free Arc import service (`patronActive`, with its whole "one window per Space" branch) — then delete everything that only existed to explain or route around the gate: the switcher's Patron row and error, the Arc page's windows wording, the `patronActive` field of the Spaces projection, and the Patron copy that promised an unlock. Tests that encoded the gate are flipped to pin the free behaviour.

**Tech Stack:** Electron main process (CommonJS), `node:test` unit tests, Cucumber + Playwright desktop acceptance, the `copy/` message catalog (six interface languages), the `browser-api` contract checker.

**Spec:** [`docs/superpowers/specs/2026-10-13-blanc-spaces-redesign-design.md`](../specs/2026-10-13-blanc-spaces-redesign-design.md) — section "PR 1 — Spaces free for everyone". PR 2 (the redesign) has its own plan.

## Global Constraints

- Internal identifiers keep the `workspace` names (`workspaces.json`, `chrome:workspaces-*`, `workspace-ui.js`, `/workspace` alias); only user-facing copy says *space*.
- A PR that changes English updates every interface language (`de`, `es`, `fr`, `pt-BR`, `it`) in the same PR; each translated or re-noted key is acknowledged with `npm run copy:ack -- <locale> <keys…>` (never "acknowledge everything"), then `npm run copy:build` and `npm run copy:check`.
- Glossary fixed terms appear verbatim in every language: `Blanc`, `Blanc Patron`, `Patron`, `Blanc Spaces`, `Spaces`, `Arc`. Style: German *du*, Spanish *tú*, French *vous* (no-break space before `: ; ? !`), Brazilian Portuguese *você*, Italian *tu*.
- Never edit `src/renderer/pages/strings.*.js`, `browser-api/generated/*` or `copy/generated/*` by hand; regenerate them.
- Do **not** touch `site/`, `README.md`, Privacy or Terms in this PR: public copy changes after the release ships (`docs/marketing-claims.md`). `test/unit/public-truth.test.js` keeps passing because that copy is unchanged.
- The start-page pill must not say "Support Blanc" (rejected in `design-qa.md` as vague; pinned by `test/unit/migration-checklist-page.test.js`). It becomes **"Become a Blanc Patron"** — the product and the action, without an unlock.
- After editing any trust-boundary file (`src/main/main.js`, `src/main/test-hook.js`, `src/main/tab-preload.js`, `src/main/pages.js`, …) run `npm run audit-inventory:write` and commit `security/audit-surface-inventory.json` with it.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on a branch from `main` in a worktree (`superpowers:using-git-worktrees`); run `npm ci` in a fresh worktree before tests.

## Review Focus

1. **An old Bring Your Tabs page still sends `mode: 'windows'`** (a sheet opened before the update, or a stale cached document): Blanc must still create spaces, never windows. — Task 1, test "a request that still asks for windows creates spaces".
2. **A lapsed or never-active Patron record in `settings.json`** (`patron: null`, or a subscription that expired): every creation path must succeed. — Task 2 controller test ignores any entitlement; Task 4 `@F41-15` drives the real ⌘L "Save this window as…" with no license, and every F41 scenario now runs without seeding Patron.
3. **A profile already at 25 spaces importing from Arc without Patron:** the free-slot refusal now applies to everyone and must still write nothing. — Task 4 `@F45-3` runs without Patron.
4. **The switcher in a storage-error state** (`read-failed`, `future-format`): with the Patron condition gone, the creation commands must still hide on errors. — Task 2 test "creation commands show for everyone but hide on a storage error".
5. **An active Patron after the change:** the Settings card must still show the thank-you state and checkout. — Task 3 keeps `test/unit/patron-checkout-cta.test.js` running against the rewritten card.

---

### Task 1: Arc import always creates spaces

**Files:**
- Modify: `src/main/arc-import.js` (whole file, 145 lines)
- Modify: `src/main/main.js:5361-5375` (delete `openArcSpaceWindows`), `src/main/main.js:5408` and `:5418` (service wiring)
- Modify: `src/renderer/pages/tab-import-arc.js:5-6`, `:149-151`, `:194-195`, `:205-219`, `:237-239`
- Modify: `browser-api/bridges.json:954` (the `tabImport.arcApply` doc)
- Modify: `copy/messages/{en,de,es,fr,it,pt-BR}.json`
- Test: `test/unit/arc-import.test.js`, `test/unit/tab-import-arc.test.js`

**Interfaces:**
- Consumes: `planArcSpacesImport` from `src/main/arc-sidebar.js` (unchanged).
- Produces: `createArcImportService({ readDetected, chooseAndRead, spaceRoom, createSpaces, importFavorites, untitledName, randomId })`. `read()` resolves to `{ sessionId, source, spaces, favoritesCount, skippedCount, remainingSlots }` (no `mode`). `apply(sessionId, { spaceIds, favorites })` resolves to `{ ok: true, created, droppedCount, emptyCount, favoritesAdded, favoritesSkipped }` (no `mode`) or `{ error }`. `MAX_WINDOWS` is no longer exported. The page's `arcApply` request is `{ spaceIds, favorites }`.

- [ ] **Step 1: Rewrite the service tests for the free behaviour**

In `test/unit/arc-import.test.js`, change the import line and the harness, and replace the three Patron-specific tests. The import:

```js
const { createArcImportService } = require('../../src/main/arc-import');
```

The harness (replace the whole `function harness`):

```js
function harness({ room = { remainingSlots: 25, existingNames: [] }, parsed = PARSED } = {}) {
  const calls = { spaces: [], favorites: [] };
  let n = 0;
  const service = createArcImportService({
    readDetected: async () => parsed,
    chooseAndRead: async () => parsed,
    spaceRoom: () => room,
    createSpaces: async (entries) => { calls.spaces.push(entries); return { ok: true }; },
    importFavorites: async (entries) => { calls.favorites.push(entries); return { added: entries.length, skipped: 0 }; },
    untitledName: (i) => `Untitled ${i}`,
    randomId: () => `id-${n += 1}`,
  });
  return { service, calls };
}
```

In the projection test replace `assert.equal(preview.mode, 'spaces');` with:

```js
  assert.equal('mode' in preview, false, 'there is only one kind of import');
  assert.equal(preview.remainingSlots, 25);
```

Replace the test `'Patrons get one space per selected Arc Space, plus Favorites'` with:

```js
test('each selected Arc Space becomes one space, plus Favorites', async () => {
  const { service, calls } = harness();
  const { sessionId } = await service.read('arc');
  const result = await service.apply(sessionId, { spaceIds: ['space-1', 'space-2', 'space-3'], favorites: true });
  assert.equal(result.ok, true);
  assert.equal('mode' in result, false);
  assert.deepEqual(result.created, ['Work', 'Untitled 1']);
  assert.equal(result.emptyCount, 1);
  assert.equal(calls.spaces.length, 1, 'one durable batch');
  assert.deepEqual(calls.spaces[0][0].capture.urls, ['https://work.example.com/', 'https://today.example.com/']);
  assert.deepEqual(calls.favorites[0], [{ url: 'https://mail.example.com/', title: 'f1', folder: 'Arc' }]);
  assert.equal(result.favoritesAdded, 1);
  assert.equal(service.hasSession(), false, 'a finished import drops the parsed sidebar');
});
```

Replace the tests `'everyone else gets one window per Space'` and `'a Patron lapse between preview and apply creates nothing'` with:

```js
test('a request that still asks for windows creates spaces', async () => {
  const { service, calls } = harness();
  const { sessionId } = await service.read('file');
  const result = await service.apply(sessionId, { mode: 'windows', spaceIds: ['space-1'] });
  assert.equal(result.ok, true);
  assert.equal(calls.spaces.length, 1);
  assert.deepEqual(result.created, ['Work']);
});
```

In the remaining tests, delete every `mode: 'spaces', ` inside `apply(...)` request objects (for example `{ mode: 'spaces', spaceIds: ['space-1', 'space-2'] }` becomes `{ spaceIds: ['space-1', 'space-2'] }`). In `'read errors and cancelled file choices pass through'`, delete both `patronActive: () => true,` lines.

- [ ] **Step 2: Run the service tests and watch them fail**

Run: `node --test test/unit/arc-import.test.js`
Expected: FAIL with `TypeError: patronActive is not a function` — the harness no longer injects `patronActive`, which the old `project()` still calls.

- [ ] **Step 3: Rewrite `src/main/arc-import.js`**

Replace the whole file with:

```js
'use strict';

// F45 Arc Spaces import: one read-and-apply session at a time. The parsed
// sidebar stays here in main; the Bring Your Tabs page sees only names,
// counts and opaque ids. Electron-free: reading and every store mutation
// arrive as injected functions from main. Each selected Space becomes one
// Blanc space, for everyone.

const crypto = require('node:crypto');
const { planArcSpacesImport } = require('./arc-sidebar');

function createArcImportService({
  readDetected,
  chooseAndRead,
  spaceRoom,
  createSpaces,
  importFavorites,
  untitledName = (n) => `Space ${n}`,
  randomId = () => crypto.randomUUID(),
} = {}) {
  let session = null;

  function project(parsed, source) {
    const sessionId = randomId();
    const ids = new Map();
    let untitled = 0;
    const spaces = parsed.spaces.map((space, index) => {
      const id = `space-${index + 1}`;
      ids.set(id, space.sourceSpaceId);
      const base = space.name ?? untitledName(untitled += 1);
      const count = (predicate) => space.tabs.filter(predicate).length;
      return {
        id,
        name: base,
        tabCount: space.tabs.length,
        pinnedCount: count((tab) => tab.section === 'pinned' && tab.folderKey === null),
        todayCount: count((tab) => tab.section === 'today' && tab.folderKey === null),
        folderCount: space.folders.length,
        separateProfile: space.arcProfile === 'custom',
      };
    });
    session = { sessionId, parsed, ids };
    return {
      sessionId,
      source,
      spaces,
      favoritesCount: parsed.favorites.length,
      skippedCount: parsed.skippedCount,
      remainingSlots: spaceRoom().remainingSlots,
    };
  }

  async function read(source) {
    const parsed = source === 'file' ? await chooseAndRead() : await readDetected();
    if (parsed?.cancelled) return { cancelled: true };
    if (!parsed || parsed.error) return { error: parsed?.error ?? 'unreadable' };
    if (!parsed.spaces.some((space) => space.tabs.length) && !parsed.favorites.length) {
      return { error: 'empty' };
    }
    return project(parsed, source === 'file' ? 'file' : 'arc');
  }

  async function apply(sessionId, request = {}) {
    if (!session || session.sessionId !== String(sessionId ?? '')) return { error: 'session-unavailable' };
    const requested = Array.isArray(request.spaceIds) ? request.spaceIds.map(String) : [];
    const selectedSpaceIds = [];
    for (const id of new Set(requested)) {
      const source = session.ids.get(id);
      if (!source) return { error: 'invalid-selection' };
      selectedSpaceIds.push(source);
    }
    const withFavorites = request.favorites === true && session.parsed.favorites.length > 0;
    if (!selectedSpaceIds.length && !withFavorites) return { error: 'nothing-selected' };

    let created = [];
    let droppedCount = 0;
    let emptyCount = 0;
    if (selectedSpaceIds.length) {
      const room = spaceRoom();
      const plan = planArcSpacesImport({
        spaces: session.parsed.spaces,
        selectedSpaceIds,
        existingWorkspaceNames: room.existingNames,
        remainingSlots: room.remainingSlots,
        untitledName,
        randomId,
      });
      if (plan.error) return { error: plan.error };
      if (plan.noRoom.length) {
        return { error: 'no-room', remainingSlots: room.remainingSlots, selectedCount: plan.planned.length + plan.noRoom.length };
      }
      emptyCount = plan.empty.length;
      if (plan.planned.length) {
        const result = await createSpaces(plan.planned.map(({ name, capture }) => ({ name, capture })));
        if (!result?.ok) return { error: result?.error ?? 'apply-failed' };
        created = plan.planned.map(({ name }) => name);
        droppedCount = plan.planned.reduce((sum, entry) => sum + entry.droppedCount, 0);
      }
    }

    let favorites = null;
    if (withFavorites) {
      favorites = await importFavorites(session.parsed.favorites.map(({ url, title }) => ({ url, title, folder: 'Arc' })));
    }
    session = null;
    return {
      ok: true,
      created,
      droppedCount,
      emptyCount,
      favoritesAdded: favorites?.added ?? 0,
      favoritesSkipped: favorites?.skipped ?? 0,
    };
  }

  return {
    read,
    apply,
    cancel(sessionId) {
      if (session && session.sessionId === String(sessionId ?? '')) session = null;
      return { ok: true };
    },
    /** The sheet closed: drop whatever was read, whichever session it was. */
    discard() { session = null; },
    /** Test support: whether a parsed sidebar is still held. */
    hasSession: () => !!session,
  };
}

module.exports = { createArcImportService };
```

- [ ] **Step 4: Run the service tests and watch them pass**

Run: `node --test test/unit/arc-import.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Update main's wiring**

In `src/main/main.js`, delete the comment block and function that start at `// F45 Arc Spaces import. Patrons get one Blanc space per Arc Space in a` and end at the closing `}` of `function openArcSpaceWindows(captures) { … }` (lines 5361–5375). Put this one-line comment in its place, directly above the `// Acceptance runs (unpackaged, BLANC_TEST=1)…` comment:

```js
// F45 Arc Spaces import: one Blanc space per selected Arc Space, in a single
// durable write. Runs in the Bring Your Tabs sheet's window runtime, so the
// active profile is the sheet's profile.
```

In the `createArcImportService({ … })` call, delete these two lines:

```js
  patronActive: () => settings.isPatronActive(),
```

```js
  openSpaceWindows: (captures) => openArcSpaceWindows(captures),
```

- [ ] **Step 6: Rewrite the page tests**

In `test/unit/tab-import-arc.test.js`: delete `  mode: 'spaces',` from `PREVIEW`; in the first test change the `apply` stub to `apply: () => ({ ok: true, created: ['Work', 'Client'], droppedCount: 0, emptyCount: 0, favoritesAdded: 2 }),` and the expected request to `[['session-1', { spaceIds: ['space-1', 'space-2'], favorites: true }]]`. Add this assertion after `assert.match(p.preview.textContent, /You can add 3 more spaces\./);`:

```js
  assert.doesNotMatch(p.preview.textContent, /window/i, 'the preview never offers windows');
```

Delete the whole test `'a Patron lapse turns the preview into windows with an explanation'`.

- [ ] **Step 7: Run the page tests and watch them fail**

Run: `node --test test/unit/tab-import-arc.test.js`
Expected: FAIL at `/You can add 3 more spaces\./` — without `preview.mode` the old page shows the windows explanation and hides the room line.

- [ ] **Step 8: Simplify the page**

In `src/renderer/pages/tab-import-arc.js`:

Replace the header comment's last sentence (lines 5–6, `// only ever sees Space names, counts and opaque ids. Patrons get one Blanc` / `// space per Arc Space; everyone else gets each Space in its own window.`) with:

```js
// only ever sees Space names, counts and opaque ids. Each Arc Space the person
// selects becomes one Blanc space.
```

Replace the two preview lines

```js
      make('p', 'section-hint', preview.mode === 'spaces' ? t('arcImport.mode.spaces') : t('arcImport.mode.windows')),
    ];
    if (preview.mode === 'spaces') nodes.push(make('p', 'section-hint', t('arcImport.room', { count: preview.remainingSlots })));
```

with

```js
      make('p', 'section-hint', t('arcImport.mode.spaces')),
      make('p', 'section-hint', t('arcImport.room', { count: preview.remainingSlots })),
    ];
```

Replace the apply-button label

```js
    applyBtn.textContent = !count ? t('arcImport.apply.favorites')
      : preview.mode === 'spaces' ? t('arcImport.apply.spaces', { count })
        : t('arcImport.apply.windows', { count });
```

with

```js
    applyBtn.textContent = !count ? t('arcImport.apply.favorites') : t('arcImport.apply.spaces', { count });
```

In `apply()`, replace the request object `{ mode: preview.mode, spaceIds: [...selected], favorites: withFavorites, }` with `{ spaceIds: [...selected], favorites: withFavorites }`, and delete the whole `if (result?.error === 'not-patron') { … }` block (5 lines).

In `renderResult()`, replace

```js
      lines.push(result.mode === 'spaces'
        ? t('arcImport.done.spaces', { count: result.created.length, names })
        : t('arcImport.done.windows', { count: result.created.length }));
```

with

```js
      lines.push(t('arcImport.done.spaces', { count: result.created.length, names }));
```

- [ ] **Step 9: Run the page tests and watch them pass**

Run: `node --test test/unit/tab-import-arc.test.js`
Expected: PASS.

- [ ] **Step 10: Remove the windows copy in every language and re-note the spaces copy**

Run from the repo root:

```bash
node - <<'EOF'
const fs = require('fs');
const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pt-BR'];
const file = (l) => `copy/messages/${l}.json`;
const REMOVE = ['arcImport.mode.windows', 'arcImport.apply.windows', 'arcImport.done.windows', 'arcImport.error.notPatron'];
const NOTES = {
  'arcImport.mode.spaces': 'Bring Your Tabs → Arc preview: what the import does. Blanc Spaces is the feature; a space is one saved set.',
  'arcImport.apply.spaces': 'Primary button on the Arc preview.',
};
for (const l of LOCALES) {
  const o = JSON.parse(fs.readFileSync(file(l), 'utf8'));
  for (const k of REMOVE) { if (!(k in o)) throw new Error(`${l}: ${k} missing`); delete o[k]; }
  if (l === 'en') for (const [k, note] of Object.entries(NOTES)) o[k].note = note;
  fs.writeFileSync(file(l), JSON.stringify(o, null, 2) + '\n');
}
EOF
for l in de es fr it pt-BR; do npm run copy:ack -- "$l" arcImport.mode.spaces arcImport.apply.spaces; done
npm run copy:build && npm run copy:check
```

Expected: `copy:check` passes. The two re-noted keys keep their translations (only the note changed); `copy:ack` records that each translation was re-read against the new note.

- [ ] **Step 11: Update the bridge doc and regenerate**

In `browser-api/bridges.json`, change the `tabImport.arcApply` member's `"doc"` to:

```json
        "doc": "Create one Blanc space per selected Arc Space, and optionally import Arc Favorites."
```

Run: `npm run browser-api:build && npm run browser-api:check`
Expected: both succeed; `git status` shows regenerated files under `browser-api/generated/`.

- [ ] **Step 12: Lint, inventory and commit**

Run: `npm run lint && npm run audit-inventory:write && node --test test/unit/arc-import.test.js test/unit/tab-import-arc.test.js test/unit/arc-sidebar.test.js test/unit/arc-import-source.test.js`
Expected: lint clean (no unused `openArcSpaceWindows`/`MAX_WINDOWS`), tests pass.

```bash
git add src/main/arc-import.js src/main/main.js src/renderer/pages/tab-import-arc.js browser-api copy src/renderer/pages/strings.*.js src/main/i18n-locales.json security/audit-surface-inventory.json test/unit/arc-import.test.js test/unit/tab-import-arc.test.js
git commit -m "Arc import always creates spaces

Remove the Patron check and the one-window-per-Space branch from the Arc
Spaces import; every selected Space becomes one Blanc space.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Creating a space needs no Patron

**Files:**
- Modify: `src/main/workspace-controller.js:64-67`
- Modify: `src/main/main.js:5333` (adapter `canCreate`), `:7111` (`workspacesProjection`), `:7574` (save-as gate)
- Modify: `src/renderer/workspace-ui.js:22`, `:33`, `:82`, `:172`, `:237-241`, `:246`
- Modify: `src/renderer/overlay.js:177-181`, `:791-800`
- Modify: `browser-api/contract.json` (`WorkspacesPayload`, `WorkspaceActionResult`, `WorkspaceErrorCode`), `browser-api/build.mjs:1122`, `:1143`
- Modify: `copy/messages/{en,de,es,fr,it,pt-BR}.json`
- Test: `test/unit/workspace-controller.test.js`, `test/support/workspace-ui-dom.js`, `test/unit/workspaces-patron-entry.test.js` → rename to `test/unit/workspaces-free-entry.test.js`, `test/unit/workspaces-editor-focus.test.js:16`, `:43`, `test/unit/tab-import-review.test.js:133-139`, `test/unit/browser-api-contract.test.js:216`, `:300-302`, `:313`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: the controller adapter no longer has `canCreate`; `WorkspaceUI.create(...)` payloads are `{ items, deleted, status }` (no `patronActive`); `workspacesProjection()` returns `{ status, deleted, items }`; `WorkspaceErrorCode` no longer includes `'not-patron'`. PR 2 builds on these shapes.

- [ ] **Step 1: Flip the controller test**

In `test/unit/workspace-controller.test.js`, delete `canCreate: () => true, ` from the harness adapter (keep `create: …` on that line) and replace the test `'create guard occurs before writing; Patron is checked in main authority'` with:

```js
test('create guard occurs before writing, and creation consults no entitlement', () => {
  const h = harness({ protection: () => ({ tabCount: 2, privateCount: 0 }), canCreate: () => false });
  assert.equal(h.controller.create(h.runtime, 'New').error, 'unsaved-scratch'); assert.deepEqual(h.calls, []);
  assert.equal(h.controller.create(h.runtime, 'New', { newWindow: true }).ok, true);
  assert.deepEqual(h.calls, ['create', 'new-window']);
});
```

- [ ] **Step 2: Replace the Patron entry test with a free entry test**

```bash
git mv test/unit/workspaces-patron-entry.test.js test/unit/workspaces-free-entry.test.js
```

Replace its contents with:

```js
'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { harness, settle } = require('../support/workspace-ui-dom');
test('anyone reaches both creation editors, and no Patron path remains', () => {
  const h = harness();
  h.ui.begin('create'); assert.equal(h.ui.state.kind, 'create'); h.ui.cancel();
  h.ui.begin('save'); assert.equal(h.ui.state.kind, 'save'); h.ui.cancel();
  h.ui.open();
  assert.equal(h.button('Patron settings'), undefined);
  assert.doesNotMatch(h.text(), /Patron/);
});
test('a new slash-command name opens the save editor prefilled, and an existing one switches', async () => {
  let opens = 0; const h = harness({ openWorkspace: async () => { opens++; return { ok: true }; } });
  h.ui.command('Fresh'); assert.equal(h.doc.getElementById('workspaceName').value, 'Fresh');
  h.ui.cancel(); h.ui.command('First'); await settle(); assert.equal(opens, 1);
});
test('an empty switcher offers the Arc import to everyone', () => {
  const empty = harness({}, { items: [] });
  empty.ui.open();
  empty.button('Import Spaces from Arc').emit('click');
  assert.deepEqual(empty.calls, [['page', 'tab-import']]);
  const existing = harness();
  existing.ui.open();
  assert.equal(existing.button('Import Spaces from Arc'), undefined);
});
test('creation commands show for everyone but hide on a storage error', () => {
  const ids = ['wsSwitcherSep', 'wsSwitcherNew', 'wsSwitcherSaveAs'];
  const ok = harness(); ok.ui.open();
  for (const id of ids) assert.equal(ok.doc.getElementById(id).hidden, false, id);
  const broken = harness({}, { status: 'read-failed' }); broken.ui.open();
  for (const id of ids) assert.equal(broken.doc.getElementById(id).hidden, true, id);
});
test('the switch decision offers Save first whenever an ordinary tab is at risk', async () => {
  const h = harness({ openWorkspace: async () => ({ ok: false, error: 'unsaved-scratch', tabCount: 2, privateCount: 1, decision: 'token' }) });
  h.ui.switchTo({ id: 'b', name: 'Other' }); await settle();
  assert.ok(h.button('Save this window first…'));
});
```

In `test/support/workspace-ui-dom.js`, change the default payload in `ui.apply(...)` from `{ items: [{ id: 'a', name: 'First', active: true, tabCount: 1 }], deleted: [], status: 'saved', patronActive: true, ...payload }` to `{ items: [{ id: 'a', name: 'First', active: true, tabCount: 1 }], deleted: [], status: 'saved', ...payload }`.

In `test/unit/workspaces-editor-focus.test.js`, delete `patronActive: true, ` from the payload on line 16 and the line `    patronActive: true,` near line 43.

In `test/unit/tab-import-review.test.js`, rename the test `'post-import workspace handoff enters the shared, Patron-gated workspace UI'` to `'post-import workspace handoff enters the shared workspace UI, with no Patron gate'` and replace `assert.match(uiSource, /data\.patronActive/);` with:

```js
  assert.doesNotMatch(uiSource, /patronActive/);
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `node --test test/unit/workspace-controller.test.js test/unit/workspaces-free-entry.test.js test/unit/tab-import-review.test.js`
Expected: FAIL — the controller returns `not-patron` for `canCreate: () => false`; the switcher still hides the creation commands without `patronActive`, still shows "Patron settings", and still contains `patronActive`.

- [ ] **Step 4: Remove the controller check**

In `src/main/workspace-controller.js`, delete this line from `create()`:

```js
      if (!adapter.canCreate()) return { ok: false, error: 'not-patron' };
```

- [ ] **Step 5: Remove the switcher's Patron state**

In `src/renderer/workspace-ui.js`:

- Delete the line `    'not-patron': t('ws.error.notPatron'),` from `errors`.
- Change `let data = { items: [], deleted: [], patronActive: false, status: 'saved' };` to `let data = { items: [], deleted: [], status: 'saved' };`.
- Delete from `begin()` the line `      if (['create', 'save'].includes(kind) && !data.patronActive) { state = { kind: 'list' }; open(); return; }`.
- In `renderDecision()`, change `if (result.tabCount > result.privateCount && data.patronActive) actions.append(` to `if (result.tabCount > result.privateCount) actions.append(`.
- Replace the three list lines

```js
        // F45: a Patron starting from nothing can bring Spaces over from Arc.
        if (!data.items.length && data.patronActive) nodes.push(button(t('ws.list.importArc'), 'import-arc', () => { close(); api.openPage('tab-import'); }));
```

with

```js
        // F45: anyone starting from nothing can bring Spaces over from Arc.
        if (!data.items.length) nodes.push(button(t('ws.list.importArc'), 'import-arc', () => { close(); api.openPage('tab-import'); }));
```

  and delete the line `        if (!data.patronActive) nodes.push(button(t('ws.list.patronSettings'), 'patron-settings', () => { close(); api.openPage('settings', 'patron'); }));`.
- Change `doc.getElementById(id).hidden = naming || !data.patronActive || !!errors[data.status];` to `doc.getElementById(id).hidden = naming || !!errors[data.status];`.

In `src/renderer/overlay.js`: change the comment line `  // Workspaces (Blanc Patron). Populated from listWorkspaces() when the` to `  // Workspaces (Blanc Spaces). Populated from listWorkspaces() when the`; delete `  let wsPatronActive = false;`; change `  // --- Workspaces (Blanc Patron) ---` to `  // --- Workspaces (Blanc Spaces) ---`; in `commitWorkspacesPayload` delete `    wsPatronActive = !!payload?.patronActive;` and change `    workspaceUI.apply({ ...payload, patronActive: wsPatronActive, items: wsWorkspaces });` to `    workspaceUI.apply({ ...payload, items: wsWorkspaces });`.

- [ ] **Step 6: Remove main's gate and projection field**

In `src/main/main.js`:

- In the `createWorkspaceController({ … })` adapter, delete `  canCreate: () => settings.isPatronActive(),`.
- In `workspacesProjection()`, delete `    patronActive: settings.isPatronActive(),`.
- In the `chromeHandle('chrome:workspaces-save-as', (_e, name) => {` handler, delete `    if (!settings.isPatronActive()) return { ok: false, error: 'not-patron' };`.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `node --test test/unit/workspace-controller.test.js test/unit/workspaces-free-entry.test.js test/unit/tab-import-review.test.js test/unit/workspaces-editor-focus.test.js test/unit/workspaces-scratch-guard.test.js test/unit/workspaces-overlay-integration.test.js test/unit/workspaces-ui-copy.test.js`
Expected: PASS.

- [ ] **Step 8: Remove the switcher's Patron copy**

```bash
node - <<'EOF'
const fs = require('fs');
const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pt-BR'];
const file = (l) => `copy/messages/${l}.json`;
const REMOVE = ['ws.error.notPatron', 'ws.list.patronSettings'];
for (const l of LOCALES) {
  const o = JSON.parse(fs.readFileSync(file(l), 'utf8'));
  for (const k of REMOVE) { if (!(k in o)) throw new Error(`${l}: ${k} missing`); delete o[k]; }
  if (l === 'en') o['ws.list.importArc'].note = 'Button in the empty space switcher; opens Bring Your Tabs. Spaces is Arc’s feature name.';
  fs.writeFileSync(file(l), JSON.stringify(o, null, 2) + '\n');
}
EOF
for l in de es fr it pt-BR; do npm run copy:ack -- "$l" ws.list.importArc; done
npm run copy:build && npm run copy:check
```

Expected: `copy:check` passes.

- [ ] **Step 9: Update the contract and its fixtures**

In `browser-api/contract.json`:

- In `types.WorkspacesPayload.fields`, delete the `"patronActive": { "type": "boolean" },` entry.
- In `types.WorkspaceActionResult.fields`, delete the `"patronActive": { "type": "boolean", "optional": true },` entry.
- In `types.WorkspaceErrorCode.ts`, delete `'not-patron' | ` so it reads `"'activation-failed' | 'busy' | 'duplicate-name' | 'future-format' | 'invalid-name' | 'invalid-record' | 'limit' | 'not-found' | 'protected-pages' | 'read-failed' | 'repair-failed' | 'saved-not-opened' | 'storage-failed' | 'unsaved-scratch'"`.

In `browser-api/build.mjs` `workspaceControllerFixtures()`: delete `canCreate: () => true, ` from `base` (keep `randomId` and `fingerprint` on that line) and delete the variant line `    'not patron': { canCreate: () => false },`.

In `test/unit/browser-api-contract.test.js`:

- In both tests that call `sendSources('    patronActive: settings.isPatronActive(),\n', '    patronActive: settings.isPatronActive(),\n    plan: settings.plan,\n')` (lines 216 and 313), change the call to `sendSources('    status: namedWorkspaces.status(),\n', '    status: namedWorkspaces.status(),\n    plan: settings.plan,\n')`.
- Replace the test `'a new workspace error code in main.js is reported'` with:

```js
test('a new workspace error code is reported', () => {
  const problems = api.checkWorkspaceCodes(api.loadContract(),
    sendSources("return { ok: false, error: 'busy' };", "return { ok: false, error: 'not-ready' };", 'workspace-controller.js'));
  assert.ok(problems.some((p) => p.includes("error 'not-ready'")), problems.join('\n'));
});
```

Run: `npm run browser-api:build && npm run browser-api:check && node --test test/unit/browser-api-contract.test.js`
Expected: all pass; `browser-api/generated/` and its vectors are regenerated.

- [ ] **Step 10: Lint, inventory and commit**

Run: `npm run lint && npm run audit-inventory:write && npm run test:unit`
Expected: lint clean; the whole unit suite passes.

```bash
git add src/main/workspace-controller.js src/main/main.js src/renderer/workspace-ui.js src/renderer/overlay.js browser-api copy src/renderer/pages/strings.*.js src/main/i18n-locales.json security/audit-surface-inventory.json test/unit test/support/workspace-ui-dom.js
git commit -m "Creating a space needs no Patron

Drop the entitlement check from the workspace controller and the save-as
handler, the patronActive field from the Spaces projection, and the
switcher's Patron row and error.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Patron becomes pure support in the app's copy

**Files:**
- Modify: `src/renderer/pages/settings.html:550-556`
- Modify: `src/renderer/pages/newtab.html:149-150`
- Modify: `copy/messages/{en,de,es,fr,it,pt-BR}.json`
- Test: `test/unit/patron-checkout-cta.test.js:37-38`, `test/unit/migration-checklist-page.test.js:30-42`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: message keys `settings.patron.supportsBlanc` (replaces `settings.patron.blancPatronUnlocksBlanc`) and `newtab.patron.become` (replaces `newtab.patron.upgrade`); `newtab.patron.hide` keeps its key with new English.

- [ ] **Step 1: Pin the new wording in the tests**

In `test/unit/patron-checkout-cta.test.js`, replace

```js
  assert.match(block, /unlocks Blanc Spaces on every platform/);
  assert.match(block, /existing\s+spaces stay available while creating new ones pauses/);
```

with

```js
  assert.match(block, /Blanc Patron is how you support Blanc’s development\./);
  assert.match(block, /Every\s+feature,\s+including\s+Blanc\s+Spaces,\s+is\s+free\s+for\s+everyone\./);
  assert.doesNotMatch(block, /unlock|lapse|pauses/i);
```

In `test/unit/migration-checklist-page.test.js`, rename the test `'one footer Patron pill names the upgrade and can be closed'` to `'one footer Patron pill invites without promising an unlock, and can be closed'`; in its `ctas` regex change `<span>Upgrade to Blanc Patron<\/span>` to `<span>Become a Blanc Patron<\/span>`; change the message `'one Patron upgrade serves every layout'` to `'one Patron pill serves every layout'`; add `assert.doesNotMatch(html, /Upgrade to Blanc Patron/);` after the existing `assert.doesNotMatch(html, />Support Blanc</);`; and in the `patronCalloutHide` regex change `aria-label="Hide the Blanc Patron upgrade for 90 days"` to `aria-label="Hide the Blanc Patron invitation for 90 days"`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test test/unit/patron-checkout-cta.test.js test/unit/migration-checklist-page.test.js`
Expected: FAIL on the new wording.

- [ ] **Step 3: Rewrite the copy in every language**

```bash
node - <<'EOF'
const fs = require('fs');
const file = (l) => `copy/messages/${l}.json`;
const rename = (o, from, to) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k === from ? to : k, v]));
const SUPPORT = {
  en: 'Blanc Patron is how you support Blanc’s development. Every feature, including Blanc Spaces, is free for everyone. A one-time founding license activates once, with no further contact. A monthly or annual subscription checks in with Polar about once a day — your license key and activation id only, never browsing data — to confirm it’s still active.',
  de: 'Mit Blanc Patron unterstützt du die Entwicklung von Blanc. Jede Funktion, auch Blanc Spaces, ist für alle kostenlos. Eine einmalige Gründerlizenz wird einmal aktiviert, ohne weiteren Kontakt. Ein Monats- oder Jahresabo meldet sich etwa einmal am Tag bei Polar – nur mit Lizenzschlüssel und Aktivierungs-ID, nie mit Browserdaten –, um zu bestätigen, dass es noch aktiv ist.',
  es: 'Con Blanc Patron apoyas el desarrollo de Blanc. Todas las funciones, incluido Blanc Spaces, son gratis para todos. Una licencia única de fundador se activa una vez, sin más contacto. Una suscripción mensual o anual consulta con Polar una vez al día aproximadamente (solo tu clave de licencia y el ID de activación, nunca datos de navegación) para confirmar que sigue activa.',
  fr: 'Blanc Patron vous permet de soutenir le développement de Blanc. Toutes les fonctionnalités, y compris Blanc Spaces, sont gratuites pour tous. Une licence fondatrice unique s’active une fois, sans autre contact. Un abonnement mensuel ou annuel contacte Polar environ une fois par jour — uniquement votre clé de licence et l’identifiant d’activation, jamais de données de navigation — pour confirmer qu’il est toujours actif.',
  'pt-BR': 'Com o Blanc Patron, você apoia o desenvolvimento do Blanc. Todos os recursos, incluindo o Blanc Spaces, são gratuitos para todos. Uma licença única de fundador é ativada uma vez, sem outro contato. Uma assinatura mensal ou anual consulta o Polar cerca de uma vez por dia — só sua chave de licença e o ID de ativação, nunca dados de navegação — para confirmar que continua ativa.',
  it: 'Con Blanc Patron sostieni lo sviluppo di Blanc. Ogni funzione, Blanc Spaces compreso, è gratuita per tutti. Una licenza fondatore una tantum si attiva una sola volta, senza ulteriori contatti. Un abbonamento mensile o annuale si collega a Polar circa una volta al giorno (solo la tua chiave di licenza e l’ID di attivazione, mai dati di navigazione) per confermare che sia ancora attivo.',
};
const BECOME = { en: 'Become a Blanc Patron', de: 'Blanc Patron werden', es: 'Hazte Blanc Patron', fr: 'Devenir Blanc Patron', 'pt-BR': 'Seja Blanc Patron', it: 'Diventa Blanc Patron' };
const HIDE = {
  en: 'Hide the Blanc Patron invitation for 90 days',
  de: 'Einladung zu Blanc Patron für 90 Tage ausblenden',
  es: 'Ocultar la invitación a Blanc Patron durante 90 días',
  fr: 'Masquer l’invitation Blanc Patron pendant 90 jours',
  'pt-BR': 'Ocultar o convite do Blanc Patron por 90 dias',
  it: 'Nascondi l’invito a Blanc Patron per 90 giorni',
};
for (const l of ['en', 'de', 'es', 'fr', 'it', 'pt-BR']) {
  let o = JSON.parse(fs.readFileSync(file(l), 'utf8'));
  for (const k of ['settings.patron.blancPatronUnlocksBlanc', 'newtab.patron.upgrade', 'newtab.patron.hide']) if (!(k in o)) throw new Error(`${l}: ${k} missing`);
  o = rename(o, 'settings.patron.blancPatronUnlocksBlanc', 'settings.patron.supportsBlanc');
  o = rename(o, 'newtab.patron.upgrade', 'newtab.patron.become');
  o['settings.patron.supportsBlanc'].message = SUPPORT[l];
  o['newtab.patron.become'].message = BECOME[l];
  o['newtab.patron.hide'].message = HIDE[l];
  if (l === 'en') {
    o['settings.patron.supportsBlanc'].note = 'Settings → Blanc Patron: explanation under the heading. Patron is optional support; it unlocks nothing.';
    o['newtab.patron.become'].note = 'Start page footer: pill linking to Blanc Patron in Settings. Patron is optional support for Blanc; it unlocks nothing.';
  }
  fs.writeFileSync(file(l), JSON.stringify(o, null, 2) + '\n');
}
EOF
for l in de es fr it pt-BR; do npm run copy:ack -- "$l" settings.patron.supportsBlanc newtab.patron.become newtab.patron.hide; done
```

- [ ] **Step 4: Update the two pages' inline English**

In `src/renderer/pages/settings.html`, replace the paragraph

```html
            <p class="section-hint" data-i18n="settings.patron.blancPatronUnlocksBlanc">
              Blanc Patron unlocks Blanc Spaces on every platform. A one-time founding
              license activates once, with no further contact. A monthly or annual subscription
              checks in with Polar about once a day — your license key and activation id only,
              never browsing data — to confirm it’s still active. On a lapse, existing
              spaces stay available while creating new ones pauses.
            </p>
```

with

```html
            <p class="section-hint" data-i18n="settings.patron.supportsBlanc">
              Blanc Patron is how you support Blanc’s development. Every feature, including
              Blanc Spaces, is free for everyone. A one-time founding license activates once,
              with no further contact. A monthly or annual subscription checks in with Polar
              about once a day — your license key and activation id only, never browsing
              data — to confirm it’s still active.
            </p>
```

In `src/renderer/pages/newtab.html`, change `<span data-i18n="newtab.patron.upgrade">Upgrade to Blanc Patron</span>` to `<span data-i18n="newtab.patron.become">Become a Blanc Patron</span>`, and on the next line change `aria-label="Hide the Blanc Patron upgrade for 90 days"` to `aria-label="Hide the Blanc Patron invitation for 90 days"`.

- [ ] **Step 5: Build the catalogs and run the tests**

Run: `npm run copy:build && npm run copy:check && node --test test/unit/patron-checkout-cta.test.js test/unit/migration-checklist-page.test.js test/unit/patron-callout.test.js test/unit/start-page-frame.test.js`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/settings.html src/renderer/pages/newtab.html copy src/renderer/pages/strings.*.js src/main/i18n-locales.json test/unit/patron-checkout-cta.test.js test/unit/migration-checklist-page.test.js
git commit -m "Describe Blanc Patron as support, not an unlock

The Settings card says every feature, Blanc Spaces included, is free; the
start-page pill invites people to become a Patron instead of upgrading.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Acceptance runs without Patron

**Files:**
- Modify: `spec/acceptance/arc-spaces-import.feature:13-36`
- Modify: `spec/acceptance/F41-named-workspaces.feature` (append `@F41-15`)
- Modify: `spec/acceptance/tab-migration.feature:106`
- Modify: `spec/acceptance/index.md:205`, `:207`
- Modify: `test/desktop/steps/arc-import.steps.js:116` (`bringAll`), `:119-124` (`setRoom`), `:159-169`, `:229-261` (delete windows steps)
- Modify: `test/desktop/steps/named-workspaces.steps.js:26`, `:67`, `:155`, `:247`, plus two new steps
- Modify: `test/desktop/steps/workspace-lifecycle.steps.js:16`, `:53`
- Modify: `test/desktop/steps/extended.steps.js:10`
- Modify: `test/desktop/i18n-pseudo-sweep.mjs:211-252`
- Modify: `test/desktop/cucumber.mjs:24`
- Modify: `src/main/test-hook.js:440` (delete `workspacePatron`)

**Interfaces:**
- Consumes: the free behaviour from Tasks 1–3.
- Produces: scenario `@F41-15`; the test hook no longer has `workspacePatron`.

- [ ] **Step 1: Rewrite the Arc scenarios**

In `spec/acceptance/arc-spaces-import.feature`, replace the `@F45-2`, `@F45-3` and `@F45-4` scenarios with:

```gherkin
  @F45-2 @desktop
  Scenario: Each selected Arc Space becomes a space
    Given there is room for three more spaces
    And an Arc sidebar with Spaces named "Work" and "Reading"
    When I bring both Spaces from Arc
    Then Blanc creates spaces named "Work" and "Reading" in one write
    And their loose pinned tabs are pinned and their folders are groups
    And no window is switched to either space

  @F45-3 @desktop
  Scenario: A selection that does not fit creates nothing
    Given there is room for one more space
    And an Arc sidebar with Spaces named "Work" and "Reading"
    When I bring both Spaces from Arc
    Then Blanc explains that only one more space fits
    And no space is created

  @F45-4 @desktop
  Scenario: Arc Spaces become spaces without Blanc Patron
    Given Blanc Patron is not active
    And an Arc sidebar with Spaces named "Work" and "Reading"
    When I bring both Spaces from Arc
    Then Blanc creates spaces named "Work" and "Reading" in one write
    And no window is switched to either space
```

In `spec/acceptance/index.md`, change the F45-2 row's title to `Each selected Arc Space becomes a space` and the F45-4 row's title to `Arc Spaces become spaces without Blanc Patron` (keep the status columns).

- [ ] **Step 2: Update the Arc step definitions**

In `test/desktop/steps/arc-import.steps.js`:

- In `bringAll`, change `const apply = dom.buttons.find((b) => /^(Create|Open) \d/.test(b.text));` to `const apply = dom.buttons.find((b) => /^Create \d/.test(b.text));`.
- In `setRoom`, delete `  await world.call('workspacePatron');`.
- Rename the step strings `'I am a Blanc Patron with room for three more spaces'` → `'there is room for three more spaces'` and `'I am a Blanc Patron with room for one more space'` → `'there is room for one more space'`.
- Delete the two step definitions `Then("two new windows open with each Space's tabs and groups", …)` and `Then('only the selected tab in each window has loaded', …)` in full.

- [ ] **Step 3: Stop seeding Patron in the Spaces steps**

Delete the line `  await this.call('workspacePatron');` from `test/desktop/steps/named-workspaces.steps.js` (in `'a named workspace with a live unsaved draft'`, `'two named workspaces for editing'`, `'twenty five named workspaces with long names'`) and from `test/desktop/steps/workspace-lifecycle.steps.js` (both `Given` steps that have it). In `'a private-only secondary window bound to a named workspace'`, change `  await this.call('workspacePatron'); this.secondary = await this.call('openNewWindow');` to `  this.secondary = await this.call('openNewWindow');`.

Delete `    workspacePatron() { settings.setPatron({ kind: 'founding', status: 'active' }); },` from `src/main/test-hook.js`.

In `test/desktop/steps/extended.steps.js`, change the comment line `//   F17-1 Patron activation -> Named Workspaces` to `//   F17-1 current app icon applies`.

In `test/desktop/i18n-pseudo-sweep.mjs`: change the comment `// keys. Surfaces run in order and share state: Patron and two workspaces are` to `// keys. Surfaces run in order and share state: two workspaces are`; rename the surface `'workspace switcher (without Patron)'` to `'workspace switcher (empty)'`; and delete `      await callTestHook(ctx.app, 'workspacePatron');` from the `'workspace switcher (list)'` surface.

In `spec/acceptance/tab-migration.feature`, change `    Then Blanc uses the existing Patron-gated workspace flow as a separate gesture` to `    Then Blanc uses the existing space flow as a separate gesture`.

- [ ] **Step 4: Add the free-save scenario**

Append to `spec/acceptance/F41-named-workspaces.feature`:

```gherkin

  @F41-15
  Scenario: Anyone can save a window as a space
    Given there is no active supporter license
    When I save this window as a space named "Free for all" from the switcher
    Then a space named "Free for all" is saved and this window is in it
```

Append to `test/desktop/steps/named-workspaces.steps.js`:

```js
When('I save this window as a space named {string} from the switcher', async function (name) {
  await openOverlaySurface(this, 'openPanel', 'panel'); const page = await overlayPage();
  await page.click('#footerWorkspace');
  await page.click('#wsSwitcherSaveAs');
  await page.fill('#workspaceName', name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
});
Then('a space named {string} is saved and this window is in it', async function (name) {
  const data = await waitForValue(() => this.call('workspaceAction', 'list'), (d) => d.items.some((w) => w.name === name), `space ${name}`);
  assert.equal(data.items.find((w) => w.name === name).active, true);
});
```

In `test/desktop/cucumber.mjs`, change `  '@F41-12', '@F41-13', '@F41-14',` to `  '@F41-12', '@F41-13', '@F41-14', '@F41-15',`.

- [ ] **Step 5: Dry-run the scenarios**

Run: `npm run test:acceptance:dry`
Expected: PASS — every step resolves; no undefined or ambiguous steps.

- [ ] **Step 6: Run the affected scenarios for real**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F45 or @workspace' --retry 0`
Expected: all F45 and F41 scenarios pass (a real Blanc window opens and closes during the run). On headless Linux prefix `xvfb-run -a`.

Then: `npm run test:i18n:desktop`
Expected: PASS.

- [ ] **Step 7: Inventory and commit**

Run: `npm run audit-inventory:write`

```bash
git add spec/acceptance test/desktop src/main/test-hook.js security/audit-surface-inventory.json
git commit -m "Run the Spaces and Arc scenarios without Patron

Every F41 scenario now creates spaces with no license, F45 asserts spaces
for everyone, and @F41-15 saves a window through the real switcher.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Records and the full gate

**Files:**
- Modify: `spec/features.md` (F17 at `:353-354`, F40 at `:971-973`, F45 at `:1041-1048`, start page at `:813` and `:817`, and a new `## F41` entry between F40 and F42)
- Modify: `spec/parity-matrix.md:33`, `:55`, plus a new F41 row after the F40 row (`:52`)
- Modify: `CLAUDE.md:143`, `AGENTS.md:163`
- Modify: `docs/press/release-notes/v1.33.0.md` (only if this PR merges before v1.33.0 is cut; otherwise the next version's notes)

**Interfaces:** none (records only).

- [ ] **Step 1: Update the feature spec**

In `spec/features.md`:

- F17: replace the bullet `- Patron unlocks Blanc Spaces, not icon variants. Renderers only ever see a` / `  derived \`patronActive\` boolean; the entitlement record stays in main.` with:

```markdown
- Patron is optional support and unlocks nothing: Blanc Spaces (F41) is free
  for everyone, and icon variants were never a Patron benefit. Renderers only
  ever see a derived `patronActive` boolean; the entitlement record stays in
  main.
```

- F40: replace `moving-in checklist task complete. A space remains a separate` / `optional Patron gesture. (F45 Arc Spaces import is the one exception: it` / `creates spaces directly for Patrons.)` with:

```markdown
  moving-in checklist task complete. Saving the result as a space (F41)
  remains a separate gesture. (F45 Arc Spaces import is the one exception: it
  creates spaces directly.)
```

- F45: replace the two bullets that start `- **Patrons** get one Blanc space per selected Space` and `- **Everyone else** gets each selected Space in its own new window` with:

```markdown
- **Spaces.** Each selected Space becomes one Blanc space, for everyone, all
  in one durable write: every space or none. Names avoid this profile's
  existing spaces (`Name (Arc)`, `Name (Arc 2)`…); untitled Spaces become
  `Space N`. A selection that does not fit the free space slots (25 per
  profile) is refused before anything is written. Unlike F40, no window is
  switched: the new spaces wait in the list.
```

- Start page: change `hint. Private start pages show no Patron upgrade and no blocked counts.` to `hint. Private start pages show no Patron pill and no blocked counts.`, and change `- Non-Patron, non-private start pages show one "Upgrade to Blanc Patron" pill` to `- Non-Patron, non-private start pages show one "Become a Blanc Patron" pill`.

- Insert this entry directly before `## F42 — Dark websites`:

```markdown
## F41 — Blanc Spaces (desktop)

- A **space** is a named, saved set of one window's tabs and groups in the
  current profile; a profile holds at most 25. Creating, saving, importing,
  switching, renaming, reordering and deleting spaces is free for everyone.
- Opening a space swaps it into the current window in place. While a window
  is in a space, its tab set autosaves into it; private tabs are never saved.
  A space is in at most one window at a time: opening one held by another
  window focuses that window.
- Switching away from a window whose ordinary tabs are in no space asks first:
  save them as a space, open the target in a new window, or close them and
  switch. Up to two recently left sets (16 live tabs) stay resident so
  switching back keeps their pages as they were.
- Deleted spaces stay in Recently deleted for 7 days, where they can be
  restored or forgotten.
- Entry points: the ⌘L panel footer's Spaces button, `/space` (alias
  `/workspace`), Bring Your Tabs (F40) and the Arc Spaces import (F45).
- Spaces are device-local and profile-scoped; they never sync.
- **Acceptance:**
  [`acceptance/F41-named-workspaces.feature`](./acceptance/F41-named-workspaces.feature)
  (`@workspace`, bound in `test/desktop/steps/named-workspaces.steps.js` and
  `test/desktop/steps/workspace-lifecycle.steps.js`);
  `test/unit/workspace*.test.js`.
```

- [ ] **Step 2: Update the parity matrix**

In `spec/parity-matrix.md`: in the F17 row replace `Patron unlocks Blanc Spaces, not icon variants.` with `Patron is optional support and unlocks nothing; Blanc Spaces (F41) is free.`; in the F45 row replace `becomes one Blanc space per Arc Space for Patrons, in one all-or-nothing write, or one window per Space otherwise;` with `becomes one Blanc space per Arc Space, in one all-or-nothing write;`; and insert after the F40 row:

```markdown
| F41 | Blanc Spaces | SHIPPED | — | — | Desktop only. Named, profile-scoped sets of a window's tabs and groups that swap in place and autosave; free for everyone; at most 25 per profile; never synced. | — |
```

- [ ] **Step 3: Update the agent guides**

In both `CLAUDE.md` and `AGENTS.md`, replace the sentence `**Blanc Patron and app icons:** Patron unlocks space creation; it does not unlock icon variants.` with:

```markdown
**Blanc Patron and app icons:** Patron is optional support and unlocks nothing: Blanc Spaces became free for everyone in October 2026 (`docs/superpowers/specs/2026-10-13-blanc-spaces-redesign-design.md`), and Patron does not unlock icon variants either.
```

- [ ] **Step 4: Draft the release-note line**

If v1.33.0 has not been cut when this PR merges, add to `docs/press/release-notes/v1.33.0.md`, directly under `# Blanc 1.33.0`, a section the owner approves at release time:

```markdown
## Changed

- Blanc Spaces is free for everyone. Anyone can save, switch between and
  import spaces, including bringing Spaces over from Arc. Blanc Patron is now
  simply a way to support Blanc — thank you to every Patron whose support
  made Spaces possible.
```

If v1.33.0 is already public, put the same section in the next version's draft notes file instead.

- [ ] **Step 5: Run the full gate**

Run, in order, from the worktree root:

```bash
npm run lint
npm run test:unit
npm run substrate:check
npm run test:acceptance:dry
```

Expected: every command passes. If `audit-inventory:check` (inside `substrate:check`) reports a stale hash, run `npm run audit-inventory:write` and re-run `substrate:check`.

- [ ] **Step 6: Commit**

```bash
git add spec/features.md spec/parity-matrix.md CLAUDE.md AGENTS.md docs/press/release-notes
git commit -m "Record Blanc Spaces as free in the spec and guides

Add the missing F41 Blanc Spaces entry, rewrite F17/F40/F45 and the parity
matrix, update the agent guides, and draft the release-note line.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Prove it in the running app**

Launch a scratch profile with no license (`npm start -- --user-data-dir=$(mktemp -d)`), open ⌘L → Spaces, choose **Save this window as…**, save "Free check", and confirm the row appears with a ✓; open Settings → Blanc Patron and confirm the new paragraph; open a new tab and confirm the footer pill reads "Become a Blanc Patron". Capture the switcher and the pill (full-resolution crops) for the PR description.
