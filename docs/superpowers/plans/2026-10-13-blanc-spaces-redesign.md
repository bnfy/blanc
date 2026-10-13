# Blanc Spaces Redesign — Implementation Plan (PR 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every space a colour and a symbol, show the current space as a mark on the Island that opens a redesigned Spaces menu (in-place editor, custom colour picker with a readability guard, delete with Undo, drag reorder, a clearer switch prompt), and polish it with Apple-style motion.

**Architecture:** A pure identity module (`src/renderer/space-identity.js`) owns presets, symbols, defaults and the composited-contrast guard and is shared by main, the strip and the overlay. The store gains optional `color`/`symbol` fields that the existing load-repair path persists once. Main exposes update, move-to-index and undo-delete IPC and adds a `'spaces'` overlay mode anchored to a new pill mark (the shield popover's pattern). The overlay's Spaces menu (`workspace-ui.js`) is rebuilt on those calls and shown in two places: tight around the mark, and above the ⌘L footer button.

**Tech Stack:** Electron main (CommonJS), sandboxed renderer documents over `blanc-chrome://`, `node:test`, Cucumber + Playwright desktop acceptance, the `copy/` catalog, the `browser-api` contract, the `tokens/` substrate.

**Spec:** [`docs/superpowers/specs/2026-10-13-blanc-spaces-redesign-design.md`](../specs/2026-10-13-blanc-spaces-redesign-design.md) — section "PR 2 — The redesign" (§1–§12) and its Testing section. Prototype: [`2026-10-13-blanc-spaces-redesign-prototype.html`](../specs/2026-10-13-blanc-spaces-redesign-prototype.html).

**Prerequisite:** PR 1 ([`2026-10-13-blanc-spaces-free.md`](./2026-10-13-blanc-spaces-free.md)) is merged. This plan assumes its shapes: no `patronActive` in the Spaces projection, no `not-patron` error, no `workspacePatron` test hook.

**Reviewed assets:** several files below were written and their tests run green before this plan was published (116 unit tests). They live in [`assets/2026-10-13-blanc-spaces/`](./assets/2026-10-13-blanc-spaces/) and [`assets/2026-10-13-blanc-spaces-copy.json`](./assets/2026-10-13-blanc-spaces-copy.json); tasks copy them into place verbatim. Read each asset before copying it — it is the implementation, not a sketch.

## Global Constraints

- Internal identifiers keep `workspace` (`workspaces.json`, `chrome:workspaces-*`, `workspace-ui.js`, `/workspace`); user-facing copy says *space*. American spelling (*color*).
- Readability: a space's drawn ink must reach **4.5:1** against every surface in its theme's set **and** against its own wash composited over each (light wash 15%, dark/private 20%), after rounding to hex. Light set `#ffffff #f7f7f7 #f5f5f5`; dark `#1f1f1f #171717 #282828`; private `#191919 #131313 #222222`. The stored hex is never changed.
- Presets (stored hex): Sage `#426c4c`, Sky `#376694`, Iris `#6757a3`, Rose `#9b4761`, Clay `#974f2a`, Sand `#815c02`, Slate `#576471`, Graphite `#3a3a3a`. Symbols: `briefcase house code flask book music camera plane heart star leaf coffee cap gamepad wallet sun` (Lucide geometry; Lucide is already in `THIRD-PARTY-NOTICES.md`).
- `WORKSPACES_VERSION` stays **2**. Missing or invalid `color`/`symbol` get the first unused preset/symbol in list order, assigned by `normalizeFile` so the existing load path writes them once with its `.before-repair` backup.
- Every space-tile surface uses a fill from the guard's set: Spaces-menu rows hover/selected use `--surface`; ⌘L rows keep their 4% `--text` wash.
- Adjacent filled rows never touch: menu rows carry a 3px gap.
- Motion: CSS transitions for open/close (interruptible), critically damped `cubic-bezier(.2,.9,.25,1)`; open 340ms, height morph 320ms, cross-fade 160ms, switch slide 300ms, colour 350ms, press 100ms. `prefers-reduced-motion: reduce` → opacity only. `prefers-contrast: more` → 1px ink border on marks and tiles.
- The tint variants `island`/`frame` exist only when `!app.isPackaged`; packaged builds always render `mark`.
- A PR that changes English updates `de es fr pt-BR it` in the same PR; ack each key per locale with `npm run copy:ack -- <locale> <keys…>`; `npm run copy:build`, `npm run copy:check`. Glossary changes are recorded in the commit message.
- Never hand-edit `src/renderer/pages/strings.*.js`, `browser-api/generated/*`, `tokens/generated/*`, `copy/generated/*`.
- New chrome-document files must be added to the exact allowlist in `src/main/chrome-protocol.js` (fails closed otherwise).
- After editing a trust-boundary file (`main.js`, `preload.js`, `tab-preload.js`, `pages.js`, `test-hook.js`, `chrome-protocol.js`) run `npm run audit-inventory:write` and commit the inventory.
- In `src/main/main.js`, `test/unit/workspaces-apply.test.js` lifts `applyWorkspaceToWindow` up to `\nfunction removeNamedWorkspace` and `saveCurrentWindowAsWorkspace` up to `\nfunction switchWindowToWorkspace`: never insert a function inside those ranges.
- Renderer code: no `innerHTML` with messages; build SVG with `createElementNS`; CSS over inline styles (dynamic values go through custom properties via `style.setProperty`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work in a worktree from `main` after PR 1 merged; `npm ci` first.

## Review Focus

1. **A pale or very dark custom colour** (`#ffffff`, `#000000`, `#F5E663`) in each theme, including private: the mark and tiles must stay readable and the editor must say what is drawn. — Task 1 sweep test plus Task 6 test "a typed hex shows the readability note".
2. **A space file written by v1.32 and then by this build** (no identity fields; a downgrade that strips them; a re-upgrade): defaults assigned once, a single backup, and later edits never recolour other spaces. — Task 2 store test "upgrading assigns each existing space an identity once".
3. **Undo after the window has moved on** (the person opened another space, closed the window, or another window took the space): Undo restores the record and must not steal or double-bind. — Task 3 `undoRebindTarget` tests.
4. **The menu opened from the mark while the Island is mid-swell or the window is narrow** (≤ 640px): bounds stay inside the window and the menu stays anchored. — Task 7 `calculateSpacesBounds` tests.
5. **A live edit whose save fails just as the person presses Done** (disk full, or a duplicate name that raced in from another window): the editor must stay open with the error and Try again, keep the edit, and never close over it; closing the menu instead of pressing Done must wait the same way, and a forced dismissal must keep the failed edit and show it on reopening; an empty or duplicate name must never be creatable. — Task 6 tests "Done straight after an edit waits for the save…", "a newer edit made while a save is failing…", "closing the menu straight after an edit waits for the save…", "closing straight after an edit closes once the edit has saved", "a forced dismissal keeps a failed edit…", "a failed edit for a space deleted meanwhile is dropped…" and "names are validated as you type, announced…". (Keyboard-only and Reduce Motion use are pinned by `@F41-22` and `@F41-23`.)

---

### Task 1: The identity module, its tokens and its allowlist

**Files:**
- Create: `src/renderer/space-identity.js` (copy of `docs/superpowers/plans/assets/2026-10-13-blanc-spaces/space-identity.js`)
- Create: `test/unit/space-identity.test.js` (copy of the asset of the same name)
- Create: `test/unit/space-identity-tokens.test.js`
- Modify: `tokens/tokens.json` (8 tokens), `src/renderer/styles.css` (first `:root` block), `tokens/generated/*` (regenerated)
- Modify: `src/main/chrome-protocol.js:44-58` (allowlist), `test/unit/chrome-protocol.test.js`

**Interfaces:**
- Produces (`require('../renderer/space-identity')` in main, `window.SpaceIdentity` in the chrome documents):
  - `PRESETS: ReadonlyArray<{ id: 'sage'|'sky'|'iris'|'rose'|'clay'|'sand'|'slate'|'graphite', hex: string }>`
  - `SYMBOLS: Record<SymbolId, Array<[ 'path'|'rect'|'circle', Record<string, string|number> ]>>`, `SYMBOL_IDS: SymbolId[]`
  - `normalizeHex(value: unknown): string|null` (lower-case `#rrggbb`), `isSymbol(value: unknown): boolean`
  - `inkFor(hex: string, theme: 'light'|'dark'|'private'): string|null`, `paint(hex, theme): { ink: string, wash: string }|null`
  - `defaultsFor(existing: Array<{ color?, symbol? }>): { color: string, symbol: SymbolId }`, `presetFor(hex): Preset|null`
  - `worstContrast(ink, theme): number`, `contrast(a, b): number`, `composite(ink, alpha, base): string`, `SURFACES`, `MIN_CONTRAST`

- [ ] **Step 1: Copy the test and watch it fail**

```bash
cp docs/superpowers/plans/assets/2026-10-13-blanc-spaces/space-identity.test.js test/unit/space-identity.test.js
node --test test/unit/space-identity.test.js
```

Expected: FAIL with `Cannot find module '../../src/renderer/space-identity'`.

- [ ] **Step 2: Copy the module and watch the test pass**

```bash
cp docs/superpowers/plans/assets/2026-10-13-blanc-spaces/space-identity.js src/renderer/space-identity.js
node --test test/unit/space-identity.test.js
```

Expected: PASS (7 tests), including the 1,440-case sweep and the `#767676 → #636363` worked example.

- [ ] **Step 3: Pin the palette to the design tokens**

Create `test/unit/space-identity-tokens.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PRESETS } = require('../../src/renderer/space-identity');

const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, '../../tokens/tokens.json'), 'utf8')).tokens;

test('the space palette is defined once: tokens.json mirrors the identity module', () => {
  const space = tokens.filter((t) => t.name.startsWith('space-'));
  assert.deepEqual(space.map((t) => [t.name, t.values.common]), PRESETS.map((p) => [`space-${p.id}`, p.hex]));
  for (const t of space) {
    assert.equal(t.group, 'color', t.name);
    assert.deepEqual(t.consumers, ['chrome'], t.name);
  }
});
```

Run: `node --test test/unit/space-identity-tokens.test.js` — Expected: FAIL (no `space-*` tokens).

- [ ] **Step 4: Add the tokens and declare them**

In `tokens/tokens.json`, insert these eight entries into `tokens` directly after the `patron-gold` entry:

```json
    { "name": "space-sage", "group": "color", "consumers": ["chrome"], "values": { "common": "#426c4c" } },
    { "name": "space-sky", "group": "color", "consumers": ["chrome"], "values": { "common": "#376694" } },
    { "name": "space-iris", "group": "color", "consumers": ["chrome"], "values": { "common": "#6757a3" } },
    { "name": "space-rose", "group": "color", "consumers": ["chrome"], "values": { "common": "#9b4761" } },
    { "name": "space-clay", "group": "color", "consumers": ["chrome"], "values": { "common": "#974f2a" } },
    { "name": "space-sand", "group": "color", "consumers": ["chrome"], "values": { "common": "#815c02" } },
    { "name": "space-slate", "group": "color", "consumers": ["chrome"], "values": { "common": "#576471" } },
    { "name": "space-graphite", "group": "color", "consumers": ["chrome"], "values": { "common": "#3a3a3a" } },
```

(Match the file's existing formatting: one property per line if that is how neighbouring entries are written.)

In `src/renderer/styles.css`, inside the **first** `:root {` block, directly after `  --danger: #ff3b30;` / `  --on-danger: #ffffff;`, add:

```css
  /* Blanc Spaces preset colors (stored values; space-identity.js derives the
     drawn ink per theme). Mirrors tokens.json space-*. */
  --space-sage: #426c4c;
  --space-sky: #376694;
  --space-iris: #6757a3;
  --space-rose: #9b4761;
  --space-clay: #974f2a;
  --space-sand: #815c02;
  --space-slate: #576471;
  --space-graphite: #3a3a3a;
```

Do not add them to the dark or private `:root` blocks.

Run: `npm run tokens:build && npm run tokens:check && node --test test/unit/space-identity-tokens.test.js`
Expected: all pass; `tokens/generated/Tokens.swift`, `Tokens.kt` and `tokens.css` change.

- [ ] **Step 5: Allow the module in the strip and overlay documents**

In `test/unit/chrome-protocol.test.js`, after the test `'only the rail and island documents can load the shared tab-drag controller'`, add:

```js
test('only the strip and overlay documents can load the space identity module', () => {
  const asset = path.join(renderer, 'space-identity.js');
  assert.equal(chromeResourcePath('blanc-chrome://index/space-identity.js'), asset);
  assert.equal(chromeResourcePath('blanc-chrome://overlay/space-identity.js'), asset);
  for (const url of [
    'blanc-chrome://permission/space-identity.js',
    'blanc-chrome://fill-status/space-identity.js',
    'blanc-chrome://display-capture-helper/space-identity.js',
    'blanc-chrome://overlay/space-identity.js?v=1',
  ]) assert.equal(chromeResourcePath(url), null, url);
});
```

Run it: `node --test test/unit/chrome-protocol.test.js` — Expected: FAIL.

In `src/main/chrome-protocol.js` `HOST_ASSETS`, add to the `'index'` map after the `tab-drag.js` entry and to the `'overlay'` map after its `tab-drag.js` entry:

```js
    // Pure Blanc Spaces identity (presets, symbols, readability guard). No IPC
    // and no application data; the strip mark and the Spaces menu share it.
    ['/space-identity.js', 'space-identity.js'],
```

Run: `node --test test/unit/chrome-protocol.test.js` — Expected: PASS.

- [ ] **Step 6: Inventory and commit**

```bash
npm run audit-inventory:write
git add src/renderer/space-identity.js test/unit/space-identity.test.js test/unit/space-identity-tokens.test.js tokens src/renderer/styles.css src/main/chrome-protocol.js test/unit/chrome-protocol.test.js security/audit-surface-inventory.json
git commit -m "Add the Blanc Spaces identity module and palette tokens

Presets, symbols, default assignment and a readability guard that keeps a
space's ink at 4.5:1 against its own composited wash on every surface.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Spaces remember a colour and a symbol

**Files:**
- Modify: `src/main/workspaces-model.js` (require, `normalizeWorkspace`, `normalizeFile`, `createWorkspace`, `renameWorkspace` → `updateWorkspace`, `moveWorkspace` → `moveWorkspaceTo`, exports)
- Modify: `src/main/workspaces.js` (`create`, `createMany`, `rename` → `update`, `move` → `moveTo`)
- Modify: `src/main/main.js` (the two existing callers: the rename handler and the move table entry)
- Modify: `browser-api/contract.json` (`WorkspaceErrorCode`), regenerate `browser-api/generated/*`
- Test: `test/unit/workspaces-model.test.js`, `test/unit/workspaces-store.test.js`

**Interfaces:**
- Consumes: Task 1 `normalizeHex`, `isSymbol`, `defaultsFor`.
- Produces: records gain `color: string` and `symbol: SymbolId` after `normalizeFile`. Model: `createWorkspace(file, { name, profileId, capture, now, id, color?, symbol? })`, `updateWorkspace(file, id, { name?, color?, symbol? }, now)` → `{ file, workspace, unchanged? } | { file, error: 'not-found'|'invalid-name'|'duplicate-name'|'invalid-color'|'invalid-symbol' }`, `moveWorkspaceTo(file, id, index)` → `{ file, workspace, unchanged } | { error: 'not-found' }`. Repository: `create({ name, capture, color?, symbol? })`, `createMany([{ name, capture, color?, symbol? }])`, `update(id, patch)`, `moveTo(id, index)`; `rename` and `move` are gone.

- [ ] **Step 1: Write the failing model tests**

In `test/unit/workspaces-model.test.js`:

- In the import list, replace `  renameWorkspace,` with `  updateWorkspace,`.
- Replace every `renameWorkspace(A, B, C, D)` call with `updateWorkspace(A, B, { name: C }, D)` (lines 233–243 and 301), rename the test `'renameWorkspace applies name rules and bumps updatedAt'` to `'updateWorkspace applies name rules and bumps updatedAt'`, and in the ordering test replace `model.renameWorkspace(updated, 'a', 'Renamed', 1000)` with `model.updateWorkspace(updated, 'a', { name: 'Renamed' }, 1000)` and `model.moveWorkspace(updated, 'a', 'up')` with `model.moveWorkspaceTo(updated, 'a', 0)`. This one command does all of it:

```bash
python3 - <<'EOF'
import re
p = 'test/unit/workspaces-model.test.js'; s = open(p).read()
s = re.sub(r"renameWorkspace\(([^,()]+), ('[^']*'), ('[^']*'), (\d+)\)", r"updateWorkspace(\1, \2, { name: \3 }, \4)", s)
s = s.replace("  renameWorkspace,\n", "  updateWorkspace,\n", 1)
s = s.replace("test('renameWorkspace applies name rules and bumps updatedAt'", "test('updateWorkspace applies name rules and bumps updatedAt'")
s = s.replace("model.renameWorkspace(updated, 'a', 'Renamed', 1000)", "model.updateWorkspace(updated, 'a', { name: 'Renamed' }, 1000)")
s = s.replace("model.moveWorkspace(updated, 'a', 'up')", "model.moveWorkspaceTo(updated, 'a', 0)")
open(p, 'w').write(s)
EOF
```

Append these tests to the end of the file:

```js

test('every record gets a stable colour and symbol: valid ones kept, missing ones defaulted in list order', () => {
  const file = normalizeFile({ version: WORKSPACES_VERSION, workspaces: [
    { ...VALID(), id: 'a' },
    { ...VALID(), id: 'b', name: 'B', color: '#426C4C', symbol: 'house' },
    { ...VALID(), id: 'c', name: 'C', color: 'not-a-colour', symbol: 'toString' },
  ] });
  assert.deepEqual(file.workspaces.map(({ id, color, symbol }) => [id, color, symbol]), [
    ['a', '#376694', 'briefcase'], ['b', '#426c4c', 'house'], ['c', '#6757a3', 'code'],
  ]);
  assert.deepEqual(normalizeFile(file), file, 'assigned identities are stable on the next load');
  const { deleteWorkspace: remove } = require('../../src/main/workspaces-model');
  assert.equal(remove(file, 'a', 500).file.workspaces.find((w) => w.id === 'c').color, '#6757a3', 'deleting one space never recolours another');
  assert.deepEqual(normalizeWorkspace({ ...VALID(), color: '#ABCDEF' }), { ...VALID(), color: '#abcdef' }, 'a record keeps only valid identity fields');
});

test('a deleted space keeps an identity too', () => {
  const file = normalizeFile({ version: WORKSPACES_VERSION, workspaces: [{ ...VALID(), id: 'a', color: '#426c4c', symbol: 'briefcase' }],
    deleted: [{ workspace: { ...VALID(), id: 'gone', name: 'Gone' }, deletedAt: 1, index: 1 }] });
  assert.deepEqual([file.deleted[0].workspace.color, file.deleted[0].workspace.symbol], ['#376694', 'house']);
});

test('createWorkspace takes a chosen identity or the next unused one', () => {
  const first = createWorkspace(EMPTY_FILE(), { name: 'One', profileId: 'default', capture: CAPTURE(), now: 1, id: 'one' });
  assert.deepEqual([first.workspace.color, first.workspace.symbol], ['#426c4c', 'briefcase']);
  const second = createWorkspace(first.file, { name: 'Two', profileId: 'default', capture: CAPTURE(), now: 2, id: 'two', color: '#F5E663', symbol: 'sun' });
  assert.deepEqual([second.workspace.color, second.workspace.symbol], ['#f5e663', 'sun']);
  const third = createWorkspace(second.file, { name: 'Three', profileId: 'default', capture: CAPTURE(), now: 3, id: 'three', color: 'red', symbol: 'nope' });
  assert.deepEqual([third.workspace.color, third.workspace.symbol], ['#376694', 'house'], 'an unusable choice falls back to the next default');
});

test('updateWorkspace recolours and changes the symbol, rejects unusable values, and writes nothing for no change', () => {
  const start = createWorkspace(EMPTY_FILE(), { name: 'Work', profileId: 'default', capture: CAPTURE(), now: 1, id: 'ws_1' }).file;
  const done = updateWorkspace(start, 'ws_1', { color: '#F5E663', symbol: 'star' }, 50);
  assert.deepEqual([done.workspace.color, done.workspace.symbol, done.workspace.updatedAt], ['#f5e663', 'star', 50]);
  assert.equal(updateWorkspace(start, 'ws_1', { color: '#zzz' }, 5).error, 'invalid-color');
  assert.equal(updateWorkspace(start, 'ws_1', { symbol: 'constructor' }, 5).error, 'invalid-symbol');
  assert.equal(updateWorkspace(done.file, 'ws_1', { color: '#f5e663', name: 'Work' }, 99).unchanged, true);
});

test('moveWorkspaceTo moves a space to an index, clamped, and ignores a non-integer index', () => {
  const { moveWorkspaceTo } = require('../../src/main/workspaces-model');
  let file = EMPTY_FILE();
  for (const id of ['a', 'b', 'c']) file = createWorkspace(file, { name: id, profileId: 'default', capture: CAPTURE(), now: 1, id }).file;
  assert.deepEqual(moveWorkspaceTo(file, 'a', 2).file.workspaces.map((w) => w.id), ['b', 'c', 'a']);
  assert.deepEqual(moveWorkspaceTo(file, 'c', -5).file.workspaces.map((w) => w.id), ['c', 'a', 'b']);
  assert.equal(moveWorkspaceTo(file, 'b', 1.5).unchanged, true);
  assert.equal(moveWorkspaceTo(file, 'nope', 0).error, 'not-found');
});
```

Run: `node --test test/unit/workspaces-model.test.js` — Expected: FAIL (`updateWorkspace is not a function`, missing colours).

- [ ] **Step 2: Implement the model**

In `src/main/workspaces-model.js`:

After `const { validWorkspaceId } = require('./session-workspace');` add:

```js
// A space's colour and symbol: the shared pure module the chrome documents
// also load, so main and the menu agree on presets, symbols and defaults.
const Identity = require('../renderer/space-identity');
```

In `normalizeWorkspace`, after the `localFiles` conditional spread and before the closing `};` of the returned object, add:

```js
    // Identity fields only when valid; normalizeFile assigns the defaults.
    ...(Identity.normalizeHex(raw.color) ? { color: Identity.normalizeHex(raw.color) } : {}),
    ...(Identity.isSymbol(raw.symbol) ? { symbol: raw.symbol } : {}),
```

Directly after `normalizeWorkspace`'s closing brace, add:

```js

/** Records with a colour and symbol each: a missing or invalid one becomes the
 * first preset/symbol no other record uses, in list order. Stable once
 * written: the load path persists the result (spec D13). */
function withIdentities(records, others = []) {
  const result = records.map((record) => ({ ...record }));
  for (const record of result) {
    if (record.color && record.symbol) continue;
    const taken = [...others, ...result.filter((other) => other !== record)];
    const defaults = Identity.defaultsFor(taken.map(({ color, symbol }) => ({ color, symbol })));
    if (!record.color) record.color = defaults.color;
    if (!record.symbol) record.symbol = defaults.symbol;
  }
  return result;
}
```

In `normalizeFile`, replace the final `  return { version: WORKSPACES_VERSION, workspaces, deleted };` with:

```js
  const identified = withIdentities(workspaces);
  return {
    version: WORKSPACES_VERSION,
    workspaces: identified,
    deleted: deleted.map((entry) => ({ ...entry, workspace: withIdentities([entry.workspace], identified)[0] })),
  };
```

In `createWorkspace`, change the signature to `function createWorkspace(file, { name, profileId, capture, now, id, color, symbol } = {}) {` and replace

```js
  const workspace = normalizeWorkspace({
    id, name: safeName, profileId, createdAt: now, updatedAt: now, ...captureColumns(capture),
  });
```

with

```js
  const defaults = Identity.defaultsFor(clean.workspaces);
  const workspace = normalizeWorkspace({
    id, name: safeName, profileId, createdAt: now, updatedAt: now, ...captureColumns(capture),
    color: Identity.normalizeHex(color) ?? defaults.color,
    symbol: Identity.isSymbol(symbol) ? symbol : defaults.symbol,
  });
```

Replace the whole `function renameWorkspace(file, id, name, now) { … }` with:

```js
/** Rename, recolour or change the symbol of one space: any subset of
 * `{ name, color, symbol }`. Unchanged values write nothing. */
function updateWorkspace(file, id, patch = {}, now) {
  const clean = normalizeFile(file);
  const existing = clean.workspaces.find((w) => w.id === id);
  if (!existing) return { file: clean, error: 'not-found' };
  const next = { ...existing };
  if (patch.name !== undefined) {
    const safeName = sanitizeName(patch.name);
    if (safeName === null) return { file: clean, error: 'invalid-name' };
    if (nameTaken(clean, existing.profileId, safeName, id)) return { file: clean, error: 'duplicate-name' };
    next.name = safeName;
  }
  if (patch.color !== undefined) {
    const color = Identity.normalizeHex(patch.color);
    if (!color) return { file: clean, error: 'invalid-color' };
    next.color = color;
  }
  if (patch.symbol !== undefined) {
    if (!Identity.isSymbol(patch.symbol)) return { file: clean, error: 'invalid-symbol' };
    next.symbol = patch.symbol;
  }
  if (next.name === existing.name && next.color === existing.color && next.symbol === existing.symbol) {
    return { file: clean, workspace: existing, unchanged: true };
  }
  next.updatedAt = now;
  return {
    file: withWorkspaces(clean, clean.workspaces.map((w) => (w.id === id ? next : w))),
    workspace: next,
  };
}
```

Replace the whole `function moveWorkspace(file, id, direction) { … }` with:

```js
/** Move one space to `index` in this profile's list, clamped; a non-integer
 * index leaves the list as it is. */
function moveWorkspaceTo(file, id, index) {
  const clean = normalizeFile(file);
  const from = clean.workspaces.findIndex((w) => w.id === id);
  if (from < 0) return { error: 'not-found' };
  const target = Number.isInteger(index) ? Math.max(0, Math.min(clean.workspaces.length - 1, index)) : from;
  const [workspace] = clean.workspaces.splice(from, 1);
  clean.workspaces.splice(target, 0, workspace);
  return { file: clean, workspace, unchanged: target === from };
}
```

In `module.exports`, change `restoreWorkspace, moveWorkspace, RECOVERY_TTL_MS,` to `restoreWorkspace, moveWorkspaceTo, RECOVERY_TTL_MS,` and `  renameWorkspace,` to `  updateWorkspace,`.

Run: `node --test test/unit/workspaces-model.test.js` — Expected: PASS (39 tests).

- [ ] **Step 3: Write the failing store tests**

In `test/unit/workspaces-store.test.js` apply:

```bash
python3 - <<'EOF'
import re
p = 'test/unit/workspaces-store.test.js'; s = open(p).read()
s = re.sub(r"workspaces\.rename\(([^,()]+), ('[^']*')\)", r"workspaces.update(\1, { name: \2 })", s)
s = s.replace("workspaces.move('future', 'up')", "workspaces.moveTo('future', 0)")
s = s.replace("test('rename and remove persist'", "test('update and remove persist'")
open(p, 'w').write(s)
EOF
```

Append:

```js

test('upgrading assigns each existing space an identity once, keeping the original as a backup', () => {
  const dir = path.join(userData, 'profiles', 'profile_upgrade');
  const file = path.join(dir, 'workspaces.json');
  fs.mkdirSync(dir, { recursive: true });
  const record = (id, name) => ({ id, name, profileId: 'profile_upgrade', createdAt: 1, updatedAt: 1, revision: 0, urls: ['https://a.test/'], activeIndex: 0, groups: [], groupIds: [null], pinned: [false], meta: [] });
  const bytes = JSON.stringify({ version: 2, workspaces: [record('ws_a', 'Work'), record('ws_b', 'Home')], deleted: [] });
  fs.writeFileSync(file, bytes);
  const backups = () => fs.readdirSync(dir).filter((name) => name.startsWith('workspaces.json.before-repair-'));
  withLocalProfile('profile_upgrade', () => {
    const first = workspaces.createRepository();
    assert.deepEqual(first.list().map(({ name, color, symbol }) => [name, color, symbol]), [['Work', '#426c4c', 'briefcase'], ['Home', '#376694', 'house']]);
    assert.equal(backups().length, 1);
    assert.equal(fs.readFileSync(path.join(dir, backups()[0]), 'utf8'), bytes, 'the backup is the exact original');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).workspaces[1].symbol, 'house', 'the identities are on disk');
    const second = workspaces.createRepository();
    second.list();
    assert.equal(backups().length, 1, 'a second load writes nothing');
    assert.equal(second.update('ws_a', { color: '#f5e663' }).ok, true);
    assert.equal(workspaces.createRepository().list()[1].color, '#376694', 'changing one space never recolours another');
  });
});
```

Run: `node --test test/unit/workspaces-store.test.js` — Expected: FAIL (`workspaces.update is not a function`).

- [ ] **Step 4: Implement the repository**

In `src/main/workspaces.js`:

- Replace `create({ name, capture }) { return mutate((data) => model.createWorkspace(data, { name, capture, now: clock(), id: makeId(), profileId: activeLocalProfileId() })); },` with `create({ name, capture, color, symbol }) { return mutate((data) => model.createWorkspace(data, { name, capture, color, symbol, now: clock(), id: makeId(), profileId: activeLocalProfileId() })); },`.
- In `createMany`, change `for (const { name, capture } of Array.isArray(entries) ? entries : []) {` to `for (const { name, capture, color, symbol } of Array.isArray(entries) ? entries : []) {` and the call on the next line to `model.createWorkspace(file, { name, capture, color, symbol, now: clock(), id: makeId(), profileId: activeLocalProfileId() })`.
- Replace `rename(id, name) { return mutate((data) => model.renameWorkspace(data, id, name, clock())); },` with:

```js
      /** Any subset of { name, color, symbol }; see model.updateWorkspace. */
      update(id, patch) { return mutate((data) => model.updateWorkspace(data, id, patch, clock())); },
```

- Replace `move(id, direction) { return mutate((data) => model.moveWorkspace(data, id, direction)); },` with `moveTo(id, index) { return mutate((data) => model.moveWorkspaceTo(data, id, index)); },`.

Run: `node --test test/unit/workspaces-store.test.js test/unit/workspaces-model.test.js` — Expected: PASS (22 + 39).

- [ ] **Step 5: Keep main's two callers working**

The existing rename and up/down IPC stay until Task 6 replaces the menu. In `src/main/main.js`, in the `chromeHandle('chrome:workspaces-rename', (_e, id, name) => {` handler change `const result = namedWorkspaces.rename(id, name);` to `const result = namedWorkspaces.update(id, { name });`, and in the handler table replace `['chrome:workspaces-move', (id, direction) => namedWorkspaces.move(id, direction)],` with:

```js
    ['chrome:workspaces-move', (id, direction) => {
      const index = namedWorkspaces.list().findIndex((w) => w.id === id);
      return namedWorkspaces.moveTo(id, index + (direction === 'up' ? -1 : 1));
    }],
```

The model now has two new error literals; the contract checker scans `workspaces-model.js` for them. In `browser-api/contract.json` `types.WorkspaceErrorCode.ts`, insert `'invalid-color' | 'invalid-symbol' | ` after `'invalid-name' | `.

Run: `npm run browser-api:build && npm run browser-api:check && npm run test:unit && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
npm run audit-inventory:write
git add src/main/workspaces-model.js src/main/workspaces.js src/main/main.js browser-api security/audit-surface-inventory.json test/unit/workspaces-model.test.js test/unit/workspaces-store.test.js
git commit -m "Store a colour and a symbol with every space

Missing identities are assigned in list order and written once through the
existing repair path; spaces can be recoloured, re-symboled and moved to a
position.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Main carries identity, edits, moves and Undo

**Files:**
- Modify: `src/main/workspace-residency.js` (add `undoRebindTarget`), `src/main/workspace-controller.js:73`
- Modify: `src/main/main.js`: residency require (~317), controller adapter `create` (~5335), `saveCurrentWindowAsWorkspace` (~5450), `removeNamedWorkspace` (~5557) plus a new `undoRemoveNamedWorkspace` directly after it, `workspacesProjection` (~7109), the save-as / create-blank handlers (~7573, ~7600), new update / move-to / undo handlers, the test hook's `workspaceTestAction` (~10179)
- Modify: `src/main/preload.js` (new members), `browser-api/contract.json`, `browser-api/build.mjs`, regenerate `browser-api/generated/*`
- Test: `test/unit/workspace-controller.test.js`

**Interfaces:**
- Consumes: Task 2 repository `create({…, color, symbol})`, `update`, `moveTo`, `restore`.
- Produces (`window.browserAPI`, all alongside the existing members, which Task 6 retires):
  - `saveWorkspaceAs(name: string, identity?: { color?: string, symbol?: string })`
  - `createBlankWorkspace(name: string, opts?: { decision?, newWindow?, color?, symbol? })`
  - `updateWorkspace(id: WorkspaceId, patch: { name?, color?, symbol? })` → `WorkspaceActionResult` (channel `chrome:workspaces-update`)
  - `moveWorkspaceTo(id: WorkspaceId, index: number)` → `WorkspaceActionResult` (channel `chrome:workspaces-move-to`)
  - `undoRemoveWorkspace(id: WorkspaceId)` → `WorkspaceActionResult` (channel `chrome:workspaces-undo-remove`)
  - `WorkspacesPayload` gains `windowTabCount: number` and `tint: 'mark'|'island'|'frame'`; `WorkspaceListItem` gains `color: string`, `symbol: string`.
  - `undoRebindTarget(runtimeIds: string[], runtimes: Runtime[], workspaceId: string): Runtime|null` in `workspace-residency.js`.
  - Test-hook `workspaceAction('undo-remove', id)` and `workspaceAction('update', id, patch)`.

- [ ] **Step 1: Write the failing controller tests**

In `test/unit/workspace-controller.test.js`, change the residency import to `const { transferSession, residencyCapacity, undoRebindTarget } = require('../../src/main/workspace-residency');` and append:

```js
test('Undo rebinds only the window the delete unbound, and only while nothing else holds the space', () => {
  const runtime = (id, extra = {}) => ({ id, workspaceId: null, closing: false, resident: false, workspaceTransition: false, ...extra });
  const a = runtime('a'); const b = runtime('b');
  assert.equal(undoRebindTarget(['a'], [a, b], 'ws'), a);
  assert.equal(undoRebindTarget(['a'], [{ ...a, workspaceId: 'other' }, b], 'ws'), null, 'the window has joined another space');
  assert.equal(undoRebindTarget(['a'], [a, { ...b, workspaceId: 'ws' }], 'ws'), null, 'another window holds the space');
  assert.equal(undoRebindTarget(['a'], [{ ...a, closing: true }], 'ws'), null, 'the window is closing');
  assert.equal(undoRebindTarget(['a'], [{ ...a, resident: true }], 'ws'), null, 'hidden resident sets are never rebound');
  assert.equal(undoRebindTarget(['a'], [{ ...a, workspaceTransition: true }], 'ws'), null, 'mid-switch');
  assert.equal(undoRebindTarget(['gone'], [a, b], 'ws'), null, 'the window no longer exists');
  assert.equal(undoRebindTarget([], [a], 'ws'), null);
});
test('a created space is handed its chosen identity', () => {
  let seen = null;
  const h = harness({ create: (_r, name, options) => { seen = [name, options.color, options.symbol]; return { ok: true, workspace: { id: 'new' } }; } });
  assert.equal(h.controller.create(h.runtime, 'Side', { newWindow: true, color: '#6757a3', symbol: 'code' }).ok, true);
  assert.deepEqual(seen, ['Side', '#6757a3', 'code']);
});
```

Run: `node --test test/unit/workspace-controller.test.js` — Expected: FAIL (`undoRebindTarget is not a function`; `options` undefined in the adapter).

- [ ] **Step 2: Implement the helper and pass options through**

In `src/main/workspace-residency.js`, before `module.exports`, add:

```js
/** The window an Undo may rebind to a restored workspace: one the delete
 * unbound that is still open, visible, in no workspace and not mid-switch —
 * and only while no other window holds the workspace (single-window binding). */
function undoRebindTarget(runtimeIds, runtimes, workspaceId) {
  if (runtimes.some((r) => r.workspaceId === workspaceId)) return null;
  const wanted = new Set(runtimeIds);
  return runtimes.find((r) => wanted.has(r.id) && r.workspaceId == null && !r.closing && !r.resident && !r.workspaceTransition) ?? null;
}
```

and change the export to `module.exports = { transferSession, residencyCapacity, undoRebindTarget, SESSION_FIELDS };`.

In `src/main/workspace-controller.js`, change `      const made = adapter.create(runtime, name);` to `      const made = adapter.create(runtime, name, options);`.

Run: `node --test test/unit/workspace-controller.test.js` — Expected: PASS.

- [ ] **Step 3: Main**

In `src/main/main.js`:

1. Change the residency require to `const { transferSession, residencyCapacity, undoRebindTarget } = require('./workspace-residency');`.

2. In the `createWorkspaceController({ … })` adapter, replace the `create:` line with:

```js
  create: (_r, name, options = {}) => namedWorkspaces.create({
    name,
    capture: { urls: [], groups: [], groupIds: [], pinned: [], meta: [], activeIndex: 0 },
    color: options.color,
    symbol: options.symbol,
  }),
```

3. Change `function saveCurrentWindowAsWorkspace(runtime, name) {` to `function saveCurrentWindowAsWorkspace(runtime, name, identity = {}) {` and its first line inside `withWindowRuntime` to:

```js
    const result = namedWorkspaces.create({ name, capture: workspaceCapture(runtime), color: identity.color, symbol: identity.symbol });
```

4. Replace `removeNamedWorkspace` with this version and add `undoRemoveNamedWorkspace` immediately after it (both are outside the ranges `workspaces-apply.test.js` lifts):

```js
// Which windows each delete unbound, so Undo can put them back (spec §7). Keyed
// by profile and workspace; memory only, cleared by the Undo itself.
const removedWorkspaceBindings = new Map();

/** Remove the saved record durably before unbinding matching windows in this profile. Resident pages become a visible ordinary window so deletion cannot destroy hidden drafts. */
function removeNamedWorkspace(id) {
  const holder = workspaceOwner(rt(), id);
  if (holder?.resident) {
    const shown = switchWindowToWorkspace(rt(), id, { newWindow: true });
    if (!shown.ok) return shown;
  }
  const result = namedWorkspaces.remove(id);
  if (result.ok) {
    const unbound = [];
    for (const runtime of windowRuntimes.all()) {
      if (runtime.profileId === rt().profileId && runtime.workspaceId === id) {
        runtime.workspaceId = null;
        unbound.push(runtime.id);
      }
    }
    removedWorkspaceBindings.set(`${rt().profileId}:${id}`, unbound);
    flushWorkspaceSession();
  }
  return result;
}

/** Undo of a delete: restore the record, then rebind the window the delete
 * unbound when it can still take it. Same commit path as save-as: bind,
 * durably flush the session pointer (rolling back on failure), then persist so
 * the window's live tabs autosave into the space again. */
function undoRemoveNamedWorkspace(id) {
  const key = `${rt().profileId}:${id}`;
  const result = namedWorkspaces.restore(id);
  if (!result.ok) return result;
  const runtimeIds = removedWorkspaceBindings.get(key) ?? [];
  removedWorkspaceBindings.delete(key);
  const peers = windowRuntimes.all().filter((r) => r.profileId === rt().profileId);
  const target = undoRebindTarget(runtimeIds, peers, id);
  if (target) {
    withWindowRuntime(target, () => {
      target.workspaceId = id;
      if (!flushWorkspaceSession().ok) { target.workspaceId = null; return; }
      persistSession();
    });
  }
  return result;
}
```

5. Directly above `function workspacesProjection()` add:

```js
// Dev-only comparison of how strongly a space tints the chrome (spec §11).
// Packaged builds always draw the mark alone.
const spaceTint = !app.isPackaged && ['island', 'frame'].includes(process.env.BLANC_SPACE_TINT) ? process.env.BLANC_SPACE_TINT : 'mark';
```

and replace the body of `workspacesProjection()` with:

```js
  return {
    status: namedWorkspaces.status(),
    deleted: namedWorkspaces.deleted().map((d) => ({ id: d.workspace.id, name: d.workspace.name, deletedAt: d.deletedAt })),
    items: namedWorkspaces.list().map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      active: workspace.id === rt().workspaceId,
      openElsewhere: !!workspaceOwner(rt(), workspace.id) && !workspaceOwner(rt(), workspace.id).resident && workspace.id !== rt().workspaceId,
      resident: workspaceOwner(rt(), workspace.id)?.resident === true,
      revision: workspace.revision,
      tabCount: workspace.urls.length,
      color: workspace.color,
      symbol: workspace.symbol,
    })),
    // "This window · N tabs" in the new-space editor: what save-as would keep.
    windowTabCount: rt().tabOrder.filter((tabId) => tabs.get(tabId) && !tabs.get(tabId).private).length,
    tint: spaceTint,
  };
```

6. In the save-as handler change `(_e, name) => {` to `(_e, name, identity) => {` and `saveCurrentWindowAsWorkspace(rt(), name)` to:

```js
saveCurrentWindowAsWorkspace(rt(), name, {
      color: typeof identity?.color === 'string' ? identity.color : undefined,
      symbol: typeof identity?.symbol === 'string' ? identity.symbol : undefined,
    })
```

7. In the create-blank handler replace the options object `{ decision: typeof opts?.decision === 'string' ? opts.decision : null, newWindow: opts?.newWindow === true }` with:

```js
{
      decision: typeof opts?.decision === 'string' ? opts.decision : null,
      newWindow: opts?.newWindow === true,
      color: typeof opts?.color === 'string' ? opts.color : undefined,
      symbol: typeof opts?.symbol === 'string' ? opts.symbol : undefined,
    }
```

8. Directly after the `chromeHandle('chrome:workspaces-remove', …)` block add:

```js
  chromeHandle('chrome:workspaces-update', (_e, id, patch) => {
    const result = namedWorkspaces.update(id, {
      ...(typeof patch?.name === 'string' ? { name: patch.name } : {}),
      ...(typeof patch?.color === 'string' ? { color: patch.color } : {}),
      ...(typeof patch?.symbol === 'string' ? { symbol: patch.symbol } : {}),
    });
    if (!result.ok) return result; // not-found | invalid-name | duplicate-name | invalid-color | invalid-symbol
    broadcastWorkspacesUpdated();
    return { ok: true, ...workspacesProjection() };
  });
  chromeHandle('chrome:workspaces-undo-remove', (_e, id) => {
    const result = undoRemoveNamedWorkspace(id);
    if (!result.ok) return result;
    broadcastWorkspacesUpdated();
    return { ok: true, ...workspacesProjection() };
  });
```

   and add to the handler table, after the existing `chrome:workspaces-move` entry:

```js
    ['chrome:workspaces-move-to', (id, index) => namedWorkspaces.moveTo(id, Number.isInteger(index) ? index : -1)],
```

9. In the test hook's `workspaceTestAction`, after the `'remove'` line add:

```js
        if (action === 'undo-remove') return undoRemoveNamedWorkspace(args[0]);
        if (action === 'update') return namedWorkspaces.update(args[0], args[1]);
```

- [ ] **Step 4: Preload**

In `src/main/preload.js`, change `saveWorkspaceAs: (name) => ipcRenderer.invoke('chrome:workspaces-save-as', name),` to `saveWorkspaceAs: (name, identity) => ipcRenderer.invoke('chrome:workspaces-save-as', name, identity),` and add after `moveWorkspace`:

```js
  updateWorkspace: (id, patch) => ipcRenderer.invoke('chrome:workspaces-update', id, patch),
  moveWorkspaceTo: (id, index) => ipcRenderer.invoke('chrome:workspaces-move-to', id, index),
  undoRemoveWorkspace: (id) => ipcRenderer.invoke('chrome:workspaces-undo-remove', id),
```

- [ ] **Step 5: The contract**

In `browser-api/contract.json`:

- `types.WorkspaceListItem.fields`: add `"color": { "type": "string", "doc": "Stored #rrggbb; the chrome derives the drawn ink." }` and `"symbol": { "type": "string", "doc": "A space-identity.js symbol id." }`.
- `types.WorkspacesPayload.fields` and `types.WorkspaceActionResult.fields`: add `"windowTabCount": { "type": "number", "doc": "This window's ordinary tabs, for the new-space editor." }` and `"tint": { "type": "SpaceTint" }` (both `"optional": true` in `WorkspaceActionResult`, like its other projection fields).
- `types.OpenWorkspaceOptions.fields`: add `"color": { "type": "string", "optional": true }` and `"symbol": { "type": "string", "optional": true }`; set its doc to `"Options for opening or creating a workspace; creation also takes a colour and symbol."`.
- Add the types:

```json
    "SpaceTint": {
      "ts": "'mark' | 'island' | 'frame'",
      "doc": "How strongly a space tints the chrome; island and frame exist only in unpackaged builds (BLANC_SPACE_TINT)."
    },
    "SpaceIdentityInput": {
      "doc": "A chosen colour and symbol for a new space; main validates both.",
      "fields": {
        "color": { "type": "string", "optional": true },
        "symbol": { "type": "string", "optional": true }
      }
    },
    "WorkspacePatch": {
      "doc": "An edit to one space: any subset of name, colour and symbol.",
      "fields": {
        "name": { "type": "string", "optional": true },
        "color": { "type": "string", "optional": true },
        "symbol": { "type": "string", "optional": true }
      }
    },
```

- Members: in `saveWorkspaceAs.params` add `{ "name": "identity", "type": "SpaceIdentityInput", "optional": true }`. After `moveWorkspace` add:

```json
    {
      "name": "updateWorkspace",
      "group": "workspaces",
      "kind": "invoke",
      "channel": "chrome:workspaces-update",
      "params": [{ "name": "id", "type": "WorkspaceId" }, { "name": "patch", "type": "WorkspacePatch" }],
      "returns": "WorkspaceActionResult",
      "doc": "Rename, recolour or change the symbol of a space."
    },
    {
      "name": "moveWorkspaceTo",
      "group": "workspaces",
      "kind": "invoke",
      "channel": "chrome:workspaces-move-to",
      "params": [{ "name": "id", "type": "WorkspaceId" }, { "name": "index", "type": "number" }],
      "returns": "WorkspaceActionResult",
      "doc": "Move a space to a position in the list."
    },
    {
      "name": "undoRemoveWorkspace",
      "group": "workspaces",
      "kind": "invoke",
      "channel": "chrome:workspaces-undo-remove",
      "params": [{ "name": "id", "type": "WorkspaceId" }],
      "returns": "WorkspaceActionResult",
      "doc": "Undo the delete just made: restore the space and rebind the window it left."
    },
```

In `browser-api/build.mjs` `checkWorkspaceCodes`, add `'chrome:workspaces-update', 'chrome:workspaces-undo-remove'` to the channel list and `'undoRemoveNamedWorkspace'` to `WORKSPACE_FUNCTIONS`.

Run:

```bash
npm run browser-api:build
npm run browser-api:check
npm run test:unit
npm run lint
```

Expected: all pass. If `browser-api:check` names a field main reads or returns that the contract lacks, add exactly that field to the named type: the checker is the authority on shapes.

- [ ] **Step 6: Inventory and commit**

```bash
npm run audit-inventory:write
git add src/main browser-api test/unit security/audit-surface-inventory.json
git commit -m "Carry space identity, edits, moves and Undo through main

Creation takes a colour and symbol, the projection carries them, update and
move-to-position calls join the existing ones, and Undo of a delete rebinds
the window the delete left.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Every new string, in every language

**Files:**
- Modify: `copy/messages/{en,de,es,fr,it,pt-BR}.json`, `copy/glossary.json` (`sameAsSource`)
- Regenerate: `src/renderer/pages/strings.*.js`, `src/main/i18n-locales.json`, `copy/generated/*`
- Read: `docs/superpowers/plans/assets/2026-10-13-blanc-spaces-copy.json` (56 English entries with notes and `maxLength`, their five translations, and the 22 glossary `sameAsSource` additions; validated with `copy/lib/catalog.mjs` `checkTranslation` before this plan was written)

**Interfaces:**
- Produces the message keys later tasks use: `ws.new`, `ws.list.emptyHint`, `ws.row.edit`, `ws.undo.deleted`, `ws.undo.button`, `ws.editor.{newTitle,editTitle,name,color,symbol,startWith,thisWindow,empty,createButton,done,retry}`, `ws.error.{invalidColor,invalidSymbol}`, `ws.decision.{title,saveThenSwitch}`, `spaces.mark.current`, `spaces.color.{sage,sky,iris,rose,clay,sand,slate,graphite,custom}`, `spaces.symbol.<id>` for the 16 symbols, `spaces.picker.{square,squareValue,hue,hex}`, `spaces.guard.{light,dark,both}`, `result.tag.space`, `workspaceMenu.edit`, `newtab.checklist.space`. Existing keys the new menu reuses are untouched; Task 12 removes the retired ones.

- [ ] **Step 1: Apply the reviewed strings**

```bash
node - <<'EOF'
const fs = require('fs');
const asset = JSON.parse(fs.readFileSync('docs/superpowers/plans/assets/2026-10-13-blanc-spaces-copy.json', 'utf8'));
const file = (l) => `copy/messages/${l}.json`;
const load = (l) => JSON.parse(fs.readFileSync(file(l), 'utf8'));
const save = (l, o) => fs.writeFileSync(file(l), JSON.stringify(o, null, 2) + '\n');
const en = load('en');
for (const [key, entry] of Object.entries(asset.en)) { if (key in en) throw new Error(`en already has ${key}`); en[key] = entry; }
save('en', en);
for (const [locale, entries] of Object.entries(asset.translations)) {
  const tr = load(locale);
  for (const [key, message] of Object.entries(entries)) { if (key in tr) throw new Error(`${locale} already has ${key}`); tr[key] = { message }; }
  save(locale, tr);
}
const glossary = JSON.parse(fs.readFileSync('copy/glossary.json', 'utf8'));
for (const [locale, keys] of Object.entries(asset.sameAsSource)) glossary.sameAsSource[locale] = [...glossary.sameAsSource[locale], ...keys];
fs.writeFileSync('copy/glossary.json', JSON.stringify(glossary, null, 2) + '\n');
EOF
git diff --stat copy/glossary.json
```

Expected: no error. If `git diff copy/glossary.json` shows reformatting beyond the 22 added keys, restore the file (`git checkout copy/glossary.json`) and add the keys by hand at the end of each locale's `sameAsSource` list instead, preserving the file's formatting.

- [ ] **Step 2: Acknowledge, build and check**

```bash
KEYS=$(node -e "console.log(Object.keys(require('./docs/superpowers/plans/assets/2026-10-13-blanc-spaces-copy.json').en).join(' '))")
for l in de es fr it pt-BR; do npm run copy:ack -- "$l" $KEYS; done
npm run copy:build
npm run copy:check
```

Expected: `copy:check` passes with no stale, missing, invalid or identical-to-English entries.

- [ ] **Step 3: Commit**

```bash
git add copy src/renderer/pages/strings.*.js src/main/i18n-locales.json
git commit -m "Add the Blanc Spaces redesign strings in every language

Machine-translated German, Spanish, French, Portuguese (Brazil) and Italian
for the mark, menu, editor, picker and switch prompt. The glossary's
sameAsSource gains the 22 entries that are correctly the same as English in
a language (Name, Symbol, Iris, Hex, the lowercase space tag and similar).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The custom colour picker

**Files:**
- Create: `src/renderer/space-picker.js` (copy of the asset of the same name)
- Create: `test/unit/space-picker.test.js` (copy of the asset of the same name)
- Modify: `src/main/chrome-protocol.js` (overlay allowlist), `test/unit/chrome-protocol.test.js`

**Interfaces:**
- Produces `window.SpacePicker` / `require('./space-picker.js')`: `create({ document, hex, t, onInput(hex), onCommit(hex) })` → `{ element, setHex(hex), hex }`, plus `hsvToHex(h, s, v)` and `hexToHsv(hex)`. The element is `div.space-picker` holding `div.space-picker-sv` (role `slider`, arrow keys: ←/→ saturation, ↑/↓ brightness, Shift ×10) with `span.space-picker-knob`, `input.space-picker-hue` (range 0–359), and `label.space-picker-hex-row` with `input.space-picker-hex`. It sets `--hue`, `--x`, `--y`, `--pick` on the square. Strings: `spaces.picker.square`, `spaces.picker.squareValue`, `spaces.picker.hue`, `spaces.picker.hex` (Task 4).

- [ ] **Step 1: Copy the test and watch it fail**

```bash
cp docs/superpowers/plans/assets/2026-10-13-blanc-spaces/space-picker.test.js test/unit/space-picker.test.js
node --test test/unit/space-picker.test.js
```

Expected: FAIL with `Cannot find module '../../src/renderer/space-picker'`.

- [ ] **Step 2: Copy the module and watch the test pass**

```bash
cp docs/superpowers/plans/assets/2026-10-13-blanc-spaces/space-picker.js src/renderer/space-picker.js
node --test test/unit/space-picker.test.js
```

Expected: PASS (6 tests: round-trip, opening colour, 1:1 captured drag committing once on release, arrow keys, hue keeps saturation and brightness, typed hex).

- [ ] **Step 3: Allow it in the overlay only**

Add to `test/unit/chrome-protocol.test.js`:

```js
test('only the overlay can load the Spaces colour picker', () => {
  assert.equal(chromeResourcePath('blanc-chrome://overlay/space-picker.js'), path.join(renderer, 'space-picker.js'));
  for (const url of [
    'blanc-chrome://index/space-picker.js',
    'blanc-chrome://permission/space-picker.js',
    'blanc-chrome://fill-status/space-picker.js',
    'blanc-chrome://overlay/space-picker.js#x',
  ]) assert.equal(chromeResourcePath(url), null, url);
});
```

In `src/main/chrome-protocol.js`, in the `'overlay'` host map after the `space-identity.js` entry, add:

```js
    // The Spaces editor's colour picker, drawn inside the overlay (a native
    // colour panel would take focus and blur-dismiss the menu).
    ['/space-picker.js', 'space-picker.js'],
```

Run: `node --test test/unit/chrome-protocol.test.js` — Expected: PASS.

- [ ] **Step 4: Inventory and commit**

```bash
npm run audit-inventory:write
git add src/renderer/space-picker.js test/unit/space-picker.test.js src/main/chrome-protocol.js test/unit/chrome-protocol.test.js security/audit-surface-inventory.json
git commit -m "Add the in-menu colour picker for Blanc Spaces

A saturation/brightness square that tracks the pointer 1:1, a hue slider
and a hex field, all keyboard-operable.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The rebuilt Spaces menu

**Files:**
- Replace: `src/renderer/workspace-ui.js` (asset), `test/support/workspace-ui-dom.js` (asset `workspace-ui-dom.js`)
- Create: `test/unit/spaces-menu.test.js` (asset)
- Replace: `test/unit/workspaces-editor-focus.test.js`, `test/unit/workspaces-scratch-guard.test.js`, `test/unit/workspaces-ui-copy.test.js`, `test/unit/workspaces-free-entry.test.js` (assets of the same names)
- Modify: `src/renderer/overlay.html:64-84`, `:111-121`, `:223`
- Modify: `src/renderer/overlay.js:85-88`, `:185-191`, `:822-823`, `:1786-1792`, `:2438-2439`, after `:2634`
- Modify: `src/renderer/styles.css` (remove the old `.ws-switcher*` rules and the end-of-file workspace block; add the Spaces menu block)
- Modify: `src/main/main.js` (retire the rename handler and up/down move entry; context-menu actions), `src/main/preload.js`, `src/main/workspace-context-menu-model.js`, `src/main/workspace-context-menu.js`
- Modify: `browser-api/contract.json`, `browser-api/build.mjs`, regenerate `browser-api/generated/*`
- Create: `test/unit/workspace-context-menu-model.test.js`
- Modify: `test/unit/browser-api-contract.test.js`, `test/unit/tab-import-review.test.js:133-139`
- Modify: `test/desktop/steps/named-workspaces.steps.js:71-99`, `:187-215`; `test/desktop/i18n-pseudo-sweep.mjs:240-290`

**Interfaces:**
- Consumes: Task 1 `SpaceIdentity`, Task 5 `SpacePicker`, Task 3 preload members, Task 4 strings.
- Produces `WorkspaceUI.create({ document, window, api, popup, list, commands, trigger, label, feedback, onOpenChange, theme, placement })` → `{ apply, open, close, cancel, render, layout, begin(kind, workspace?, options?), toggle, switchTo, command, opened, editing, reset, state }` where `begin('new', null, { name?, start? })`, `begin('edit', workspace)`, `begin('delete', workspace)` (immediate, with Undo). Module also exports `makeTile(document, identity, theme, className?)` and `errors`, `WORKSPACE_LIMIT`. The menu calls `api.openWorkspace`, `api.createBlankWorkspace(name, { …options, color, symbol })`, `api.saveWorkspaceAs(name, { color, symbol })`, `api.updateWorkspace`, `api.removeWorkspace`, `api.undoRemoveWorkspace`, `api.restoreWorkspace`, `api.forgetWorkspace`, `api.moveWorkspaceTo`, `api.cancelWorkspaceAction`, `api.closeOverlay`, `api.openPage`. Row DOM: `div.workspace-row.ws-row[data-workspace-id]` > `button.ws-row-main[data-focus-key="open:<id>"]` + `button.ws-row-more[data-focus-key="edit:<id>"]`; commands carry `data-focus-key` `new`, `recently-deleted`, `import-arc`, `undo`; editor `form#workspaceEditor.ws-editor` with `input#workspaceName` and a status row (`#workspaceEditorError`, role `alert`, plus a `retry` button shown only after a failed live save), swatches `color:<preset>` / `color:custom`, symbols `symbol:<id>`, segments `start:window|empty`, actions `create`/`cancel` or `delete`/`done` (Create and Done are disabled while the name is empty or already used; Done, back, Escape and a normal `close()` wait for pending live saves and stay in the editor if one failed, `close()` returning `false` meanwhile; a forced `reset()` closes at once, keeps a failed edit, and the next `open()` lands on that space's editor with the error and Try again); decision `section.ws-decision` with `save-first`, `new-window`, `close-and-switch`, `cancel`.
- Preload after this task: `renameWorkspace` and `moveWorkspace` are gone; `onWorkspaceAction(cb)` is new.

- [ ] **Step 1: Copy the tests and harness and watch them fail**

```bash
A=docs/superpowers/plans/assets/2026-10-13-blanc-spaces
cp $A/workspace-ui-dom.js test/support/workspace-ui-dom.js
for f in spaces-menu workspaces-editor-focus workspaces-scratch-guard workspaces-ui-copy workspaces-free-entry; do cp "$A/$f.test.js" "test/unit/$f.test.js"; done
node --test test/unit/spaces-menu.test.js test/unit/workspaces-editor-focus.test.js test/unit/workspaces-scratch-guard.test.js test/unit/workspaces-ui-copy.test.js test/unit/workspaces-free-entry.test.js
```

Expected: FAIL — the old `workspace-ui.js` renders no tiles, no editor form, no `new` command.

- [ ] **Step 2: Copy the menu and watch the tests pass**

```bash
cp docs/superpowers/plans/assets/2026-10-13-blanc-spaces/workspace-ui.js src/renderer/workspace-ui.js
node --test test/unit/spaces-menu.test.js test/unit/workspaces-editor-focus.test.js test/unit/workspaces-scratch-guard.test.js test/unit/workspaces-ui-copy.test.js test/unit/workspaces-free-entry.test.js
```

Expected: PASS (37 tests).

- [ ] **Step 3: Overlay markup**

In `src/renderer/overlay.html`:

- On the `#footerWorkspace` button, change `class="footer-act"` to `class="footer-act ws"`, and on `#footerWorkspaceLabel` delete the `hidden` attribute (the label now always shows the current space or "Spaces").
- Replace the block

```html
    <!-- Outside #islandPanel so fixed placement isn't clipped by the panel box. -->
    <div id="workspaceSwitcher" class="ws-switcher" hidden role="dialog" aria-label="Spaces" data-i18n-aria-label="footer.workspaces">
      <div id="workspaceSwitcherList"></div>
      <div id="wsSwitcherSep" class="ws-switcher-sep" role="separator"></div>
      <button type="button" class="ws-switcher-cmd" id="wsSwitcherNew" data-i18n="ws.newEmpty">New empty space</button>
      <button type="button" class="ws-switcher-cmd" id="wsSwitcherSaveAs" data-i18n="ws.saveAs">Save this window as…</button>
    </div>
  </div>
```

with

```html
  </div>
  <!-- The Spaces menu: above the ⌘L footer button in the panel, or alone in
       the 'spaces' overlay mode opened from the Island's space mark. Outside
       #panelAnchor so it can show without the panel. -->
  <div id="workspaceSwitcher" class="ws-switcher" hidden role="dialog" aria-label="Spaces" data-i18n-aria-label="footer.workspaces">
    <div id="workspaceSwitcherList"></div>
    <div id="workspaceSwitcherCommands" class="ws-commands" hidden></div>
  </div>
```

(the leading `</div>` is the one that closed `#panelAnchor`; it now closes it before the menu).
- Replace `  <script src="workspace-ui.js"></script>` with:

```html
  <script src="space-identity.js"></script>
  <script src="space-picker.js"></script>
  <script src="workspace-ui.js"></script>
```

- [ ] **Step 4: Overlay wiring**

In `src/renderer/overlay.js`:

- Delete `  const wsSwitcherNew = document.getElementById('wsSwitcherNew');` and `  const wsSwitcherSaveAs = document.getElementById('wsSwitcherSaveAs');`.
- Replace the `WorkspaceUI.create({ … })` call with:

```js
  const workspaceUI = WorkspaceUI.create({
    document, window, api: window.browserAPI,
    popup: workspaceSwitcher, list: workspaceSwitcherList,
    commands: document.getElementById('workspaceSwitcherCommands'),
    trigger: footerWorkspace, label: footerWorkspaceLabel,
    feedback: document.getElementById('workspaceFeedback'),
    // Task 9 moves this into a shared spaceTheme() for the Quick Switcher too.
    theme: () => (document.documentElement.dataset.theme === 'private' ? 'private'
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    placement: () => (mode === 'spaces' ? 'view' : 'anchored'),
    onOpenChange(open) {
      workspaceSwitcherOpen = open; window.browserAPI.setWorkspaceSwitcherOpen(open);
      // Opened from the Island's space mark the menu is the whole overlay, so
      // closing it closes the overlay and focus returns to the mark.
      if (!open && mode === 'spaces') window.browserAPI.closeOverlay('cancel');
    },
  });
```

- Delete `  function beginCreateWorkspace() { workspaceUI.begin('create'); }` and `  function beginSaveWorkspace() { workspaceUI.begin('save'); }`, and the two listener lines `  wsSwitcherNew.addEventListener('click', () => beginCreateWorkspace());` / `  wsSwitcherSaveAs.addEventListener('click', () => beginSaveWorkspace());`.
- In `applyMode`'s purpose handling replace the three `purpose.renameWorkspaceId` / `purpose.deleteWorkspaceId` / `purpose.postImportWorkspace` lines with:

```js
        if (purpose.postImportWorkspace) { pendingPostImportWorkspacePrompt = true; workspaceUI.begin('new', null, { start: 'window' }); }
        if (purpose.openSpaces) openWorkspaceSwitcher();
```

- After the `window.browserAPI.onWorkspacesUpdated(…)` block add:

```js
  // A space row's right-click choice (main's native menu) runs in this menu.
  window.browserAPI.onWorkspaceAction(({ kind, id }) => {
    const workspace = wsWorkspaces.find((w) => w.id === id);
    if (workspace && (kind === 'edit' || kind === 'delete')) workspaceUI.begin(kind, workspace);
  });
```

In `test/unit/tab-import-review.test.js`, in `'post-import workspace handoff enters the shared workspace UI, with no Patron gate'`, change `assert.match(overlaySource, /workspaceUI\.begin\('save'\)/);` to `assert.match(overlaySource, /workspaceUI\.begin\('new', null, \{ start: 'window' \}\)/);`.

- [ ] **Step 5: Main, preload and the contract retire rename and up/down**

In `src/main/main.js`:

- Delete the `chromeHandle('chrome:workspaces-rename', …)` block and the `['chrome:workspaces-move', …]` handler-table entry (the multi-line one Task 2 added).
- Replace `beginRenameWorkspace`, `beginDeleteWorkspace` and `workspaceMenuContextActions` with:

```js
/** A row's right-click choice runs in the Spaces menu that is already open. */
function sendWorkspaceAction(kind, workspaceId) {
  const wc = rt().overlayView?.webContents;
  if (wc && !wc.isDestroyed()) wc.send('overlay:workspace-action', { kind, id: workspaceId });
}
function workspaceMenuContextActions(owner) {
  const b = (fn) => bindWindowRuntime(owner, fn);
  return {
    edit: b((id) => sendWorkspaceAction('edit', id)),
    remove: b((id) => sendWorkspaceAction('delete', id)),
  };
}
```

In `src/main/workspace-context-menu-model.js` return:

```js
  return [
    { id: 'edit', label: t('workspaceMenu.edit') },
    { id: 'delete', label: t('workspaceMenu.delete') },
  ];
```

and in its header comment change "Rename and Delete only" to "Edit and Delete only" and "so Rename/Delete are always valid" to "so Edit/Delete are always valid". In `src/main/workspace-context-menu.js` change `      case 'rename': return actions.rename(workspace.id);` to `      case 'edit': return actions.edit(workspace.id);`.

Create `test/unit/workspace-context-menu-model.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWorkspaceContextMenu } = require('../../src/main/workspace-context-menu-model');
const { runWorkspaceContextMenuItem } = require('../../src/main/workspace-context-menu');

test('a space row offers Edit… and Delete', () => {
  assert.deepEqual(buildWorkspaceContextMenu({ id: 'a' }, (key) => key),
    [{ id: 'edit', label: 'workspaceMenu.edit' }, { id: 'delete', label: 'workspaceMenu.delete' }]);
});
test('each item runs its action with the row\'s space', () => {
  const calls = [];
  const actions = { edit: (id) => calls.push(['edit', id]), remove: (id) => calls.push(['delete', id]) };
  runWorkspaceContextMenuItem('edit', { workspace: { id: 'a' }, actions });
  runWorkspaceContextMenuItem('delete', { workspace: { id: 'a' }, actions });
  assert.deepEqual(calls, [['edit', 'a'], ['delete', 'a']]);
});
```

(`workspace-context-menu.js` requires `electron` at the top; if `node --test` cannot load it outside Electron, keep only the first test and cover the second through `@F41-21` in Task 11.)

In `src/main/preload.js`, delete `renameWorkspace: …` and `moveWorkspace: …`, and after `onWorkspacesUpdated` add:

```js
  onWorkspaceAction: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('overlay:workspace-action', listener);
    return () => ipcRenderer.removeListener('overlay:workspace-action', listener);
  },
```

In `browser-api/contract.json`: delete the members `renameWorkspace` and `moveWorkspace` and the type `WorkspaceMoveDirection`; add the type

```json
    "WorkspaceActionEvent": {
      "doc": "A space row's right-click choice, run by the open Spaces menu.",
      "fields": {
        "kind": { "type": "'edit' | 'delete'" },
        "id": { "type": "WorkspaceId" }
      }
    },
```

and, after `onWorkspacesUpdated`, the member

```json
    {
      "name": "onWorkspaceAction",
      "group": "workspaces",
      "kind": "event",
      "channel": "overlay:workspace-action",
      "payload": "WorkspaceActionEvent",
      "doc": "Run a space row's right-click choice in the open Spaces menu."
    },
```

In `browser-api/build.mjs` `checkWorkspaceCodes`, remove `'chrome:workspaces-rename'` from the channel list.

In `test/unit/browser-api-contract.test.js`: in `'a handler-table workspace action is resolved and checked'` change the fixture call to `sendSources("      return { ok: true, ...workspacesProjection() };\n    });\n  }", "      return { ok: true, moved: true, ...workspacesProjection() };\n    });\n  }")` (unchanged) and the expectation `p.includes('moveWorkspace result')` to `p.includes('restoreWorkspace result')`; in `'a workspace result spread that drifts from its type is reported'` change `p.includes('renameWorkspace result')` to `p.includes('updateWorkspace result')`.

Run:

```bash
npm run browser-api:build
npm run browser-api:check
node --test test/unit/browser-api-contract.test.js test/unit/workspace-context-menu-model.test.js test/unit/tab-import-review.test.js
```

Expected: all pass.

- [ ] **Step 6: The menu's styles**

In `src/renderer/styles.css` delete:

- every rule from the comment `/* Workspace switcher popover — viewport-fixed, placed by overlay.js against` through the rule `.ws-switcher-mini.danger:focus-visible { color: var(--danger); }`;
- the line `#panelAnchor .ws-switcher { pointer-events: auto; }` and the two comment lines above it;
- the block from `/* Workspace actions remain independent of address/search results. */` to the end of the file (`.ws-switcher [hidden] { display: none !important; }`).

Keep `.footer-act.ws`, `.footer-act.ws.bound` and `.footer-ws-label`. Then append:

```css
/* ---- Blanc Spaces menu ---------------------------------------------------
   One surface, two anchors: above the ⌘L footer button (overlay.js places it
   through --ws-top/--ws-right), or alone in the 'spaces' overlay view, whose
   bounds main sizes around it with room for the shadow and the opening scale.
   It grows out of its trigger and collapses back into it (transform-origin),
   on a critically damped curve; Reduce Motion keeps only the fade. */
#workspaceSwitcher.ws-switcher {
  position: fixed;
  z-index: 5;
  top: var(--ws-top, 16px);
  right: var(--ws-right, auto);
  width: 300px;
  max-width: calc(100vw - 16px);
  max-height: var(--ws-max-height, calc(100vh - 16px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 6px;
  font-family: var(--font-ui);
  color: var(--text);
  background: var(--surface-raised);
  border: 1px solid color-mix(in srgb, var(--text) 6%, transparent);
  border-radius: var(--island-panel-radius);
  box-shadow: var(--shadow-popover);
  pointer-events: auto;
  transform-origin: var(--ws-origin, 85% 100%);
  transition: opacity 140ms ease, transform 340ms cubic-bezier(.2, .9, .25, 1), display 340ms allow-discrete;
}
#workspaceSwitcher.ws-switcher[hidden] { display: none; opacity: 0; transform: scale(.92) translateY(6px); }
@starting-style {
  #workspaceSwitcher.ws-switcher:not([hidden]) { opacity: 0; transform: scale(.92) translateY(6px); }
}
body[data-mode="spaces"] #workspaceSwitcher.ws-switcher { top: 16px; left: 16px; right: auto; --ws-origin: 22px -6px; }
body[data-mode="spaces"] #workspaceSwitcher.ws-switcher[hidden] { transform: scale(.92) translateY(-6px); }
#workspaceSwitcher.morphing { height: var(--ws-height); transition: height 320ms cubic-bezier(.2, .9, .25, 1); }
#workspaceSwitcherList {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 3px; /* filled rows never touch */
}
#workspaceSwitcherList > * { animation: ws-fade 160ms ease-out; }
@keyframes ws-fade { from { opacity: 0; } }
.ws-commands { display: flex; flex-direction: column; gap: 3px; flex-shrink: 0; margin-top: 3px; padding-top: 3px; border-top: 1px solid var(--border); }
.ws-commands[hidden] { display: none; }

/* A space's symbol on its wash. --space-ink/--space-wash come from
   space-identity.js (readability-guarded per theme); colour changes fade. */
.ws-tile {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: var(--space-ink);
  background: var(--space-wash);
  transition: color 350ms ease, background-color 350ms ease;
}
.ws-symbol, .ws-glyph { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

.ws-row { position: relative; display: flex; align-items: center; border-radius: 11px; }
.ws-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 8px 0 6px;
  border: 0;
  border-radius: 11px;
  background: none;
  color: var(--text);
  font: 500 13.5px/1 var(--font-ui);
  text-align: left;
  cursor: pointer;
}
.ws-row:hover .ws-row-main, .ws-row-main:focus-visible, .ws-row-main.on { background: var(--surface); outline: none; }
.ws-row-main:active { transform: scale(.985); transition: transform 100ms ease-out; }
.ws-row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-row-count { color: var(--text-dim); font-size: 12px; font-variant-numeric: tabular-nums; }
.ws-row-main.on::after { content: ''; width: 9px; height: 5px; margin: 0 4px 3px 2px; border-left: 1.6px solid currentColor; border-bottom: 1.6px solid currentColor; transform: rotate(-45deg); }
.ws-row-more {
  position: absolute;
  right: 6px;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-dim);
  opacity: 0;
  cursor: pointer;
}
.ws-row:hover .ws-row-more, .ws-row:focus-within .ws-row-more { opacity: 1; }
.ws-row:hover .ws-row-count, .ws-row:focus-within .ws-row-count,
.ws-row:hover .ws-row-main.on::after, .ws-row:focus-within .ws-row-main.on::after { visibility: hidden; }
.ws-row-more:hover, .ws-row-more:focus-visible { background: color-mix(in srgb, var(--text) 8%, transparent); color: var(--text); outline: none; }
.ws-row.dragging { z-index: 2; transform: translateY(var(--drag-y, 0)); background: var(--surface-raised); box-shadow: 0 8px 24px -10px color-mix(in srgb, var(--text) 35%, transparent); }

.ws-cmd {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 0 10px 0 12px;
  border: 0;
  border-radius: 11px;
  background: none;
  color: var(--text);
  font: 13px/1.2 var(--font-ui);
  text-align: left;
  cursor: pointer;
}
.ws-cmd .ws-glyph { color: var(--text-dim); }
.ws-cmd:hover, .ws-cmd:focus-visible { background: var(--surface); outline: none; }
.ws-cmd.quiet { color: var(--text-dim); font-size: 12px; }
.ws-empty { margin: 8px 10px 4px; color: var(--text-dim); font: 12.5px/1.45 var(--font-ui); }
.ws-undo { display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 12px; border-radius: 11px; background: var(--surface); font: 12.5px/1.3 var(--font-ui); }
.ws-undo-text { flex: 1; min-width: 0; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ws-pill { height: 30px; padding: 0 14px; border: 0; border-radius: var(--radius-full); background: var(--surface); color: var(--text); font: 550 12.5px/1 var(--font-ui); cursor: pointer; }
.ws-pill:hover { background: color-mix(in srgb, var(--text) 9%, var(--surface-raised)); }
.ws-pill.primary { background: var(--accent); color: var(--surface-raised); }
.ws-pill.danger-text { background: transparent; color: var(--danger); font-weight: 500; }
.ws-pill.quiet { background: transparent; color: var(--text-dim); font-weight: 500; }
.ws-pill:disabled { opacity: .45; cursor: default; }
.ws-pill:focus-visible, .ws-swatch:focus-visible, .ws-segment:focus-visible { outline: 1px solid var(--text-dim); outline-offset: 2px; }

.ws-editor, .ws-decision, .ws-recovery { display: flex; flex-direction: column; padding: 8px 8px 6px; }
.ws-editor-head { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
.ws-editor-title { margin: 0; font: 600 13px/1.2 var(--font-ui); color: var(--text); }
.ws-icon-button { width: 24px; height: 24px; display: grid; place-items: center; margin-left: -4px; border: 0; border-radius: var(--radius-sm); background: none; color: var(--text-dim); cursor: pointer; }
.ws-icon-button:hover, .ws-icon-button:focus-visible { background: var(--surface); color: var(--text); outline: none; }
.ws-editor-ident { display: flex; align-items: center; gap: 10px; }
.ws-tile.ws-editor-tile { width: 40px; height: 40px; border-radius: 12px; }
.ws-editor-tile .ws-symbol { width: 20px; height: 20px; stroke-width: 1.7; }
.ws-name { flex: 1; min-width: 0; height: 36px; padding: 0 11px; border: 1px solid transparent; border-radius: var(--radius-md); background: var(--surface); color: var(--text); font: 14px/1 var(--font-ui); }
.ws-name::placeholder { color: var(--text-dim); }
.ws-name:focus { outline: none; background: var(--surface-raised); border-color: var(--border); }
.ws-name[aria-invalid="true"] { border-color: var(--danger); }
.ws-editor-status { display: flex; align-items: center; gap: 8px; min-height: 16px; margin: 4px 2px 0 50px; }
.ws-editor-status .ws-error { flex: 1; min-width: 0; margin: 0; color: var(--danger); font: 12px/1.35 var(--font-ui); }
.ws-editor-status .ws-pill { height: 26px; padding: 0 10px; }
.ws-editor-status .ws-pill[hidden] { display: none; }
.ws-label { margin: 12px 2px 7px; color: var(--text-dim); font: 550 11.5px/1 var(--font-ui); }
.ws-swatches { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 2px; }
.ws-swatch { position: relative; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; background: var(--swatch); cursor: pointer; }
.ws-swatch.custom { background: conic-gradient(#e5484d, #f5a524, #e2c932, #46a758, #0090ff, #8e4ec6, #e5484d); }
.ws-swatch[aria-checked="true"]::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; box-shadow: 0 0 0 1.5px var(--swatch, var(--text-dim)); }
.ws-symbols { display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px; }
.ws-symbol-button { aspect-ratio: 1; display: grid; place-items: center; padding: 0; border: 0; border-radius: var(--radius-sm); background: none; color: var(--text-dim); cursor: pointer; }
.ws-symbol-button:hover, .ws-symbol-button:focus-visible { background: var(--surface); color: var(--text); outline: none; }
.ws-symbol-button[aria-checked="true"] { color: var(--space-ink); background: var(--space-wash); }
.ws-segmented { display: grid; grid-template-columns: 1fr 1fr; padding: 2px; border-radius: var(--radius-md); background: var(--surface); }
.ws-segment { height: 28px; border: 0; border-radius: var(--radius-sm); background: none; color: var(--text-dim); font: 12.5px/1 var(--font-ui); cursor: pointer; }
.ws-segment[aria-checked="true"] { background: var(--surface-raised); color: var(--text); font-weight: 550; box-shadow: 0 1px 2px color-mix(in srgb, var(--text) 10%, transparent); }
.ws-editor .ws-help, .ws-recovery .ws-help { margin: 10px 2px 0; color: var(--text-dim); font: 11.5px/1.45 var(--font-ui); }
.ws-editor-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 14px; }
.ws-editor-actions .danger-text { margin-right: auto; padding: 0 6px; }
.ws-picker-slot:empty { display: none; }
.space-picker { margin: 12px 2px 0; }
.space-picker-sv { position: relative; height: 118px; border-radius: var(--radius-md); cursor: crosshair; touch-action: none; background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(var(--hue, 0) 100% 50%)); }
.space-picker-sv:focus-visible { outline: 1px solid var(--text-dim); outline-offset: 2px; }
.space-picker-knob { position: absolute; left: var(--x, 0%); top: var(--y, 0%); width: 14px; height: 14px; margin: -7px 0 0 -7px; border: 2px solid #fff; border-radius: 50%; background: var(--pick); box-shadow: 0 0 0 1px rgb(0 0 0 / .25), 0 1px 3px rgb(0 0 0 / .3); pointer-events: none; }
.space-picker-hue { width: 100%; height: 12px; margin: 10px 0 0; border-radius: var(--radius-full); appearance: none; background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
.space-picker-hue::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; border: 2px solid #fff; border-radius: 50%; background: transparent; box-shadow: 0 0 0 1px rgb(0 0 0 / .25), 0 1px 3px rgb(0 0 0 / .3); }
.space-picker-hex-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.space-picker-hex-label { color: var(--text-dim); font: 550 11.5px/1 var(--font-ui); }
.space-picker-hex { width: 96px; height: 28px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font: 12.5px/1 var(--font-ui); font-variant-numeric: tabular-nums; text-transform: uppercase; }
.space-picker-hex:focus { outline: none; border-color: var(--border); background: var(--surface-raised); }
.space-picker-hex[aria-invalid="true"] { border-color: var(--danger); }
.ws-guard { min-height: 16px; margin: 7px 2px 0; color: var(--text-dim); font: 11.5px/1.4 var(--font-ui); }

.ws-decision-head { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 12px; }
.ws-decision-head .ws-tile { width: 34px; height: 34px; border-radius: 10px; }
.ws-decision-title { margin: 0 0 3px; font: 600 13.5px/1.25 var(--font-ui); color: var(--text); }
.ws-decision .ws-switcher-confirm-msg { margin: 0; color: var(--text-dim); font: 12.5px/1.45 var(--font-ui); overflow-wrap: anywhere; }
.ws-decision-actions { display: flex; flex-direction: column; gap: 6px; }
.ws-decision-actions .ws-pill { width: 100%; height: 34px; border-radius: 11px; }
.ws-recovery-row { display: flex; align-items: center; gap: 6px; padding: 6px 2px; }
.ws-recovery-row .ws-row-name { font: 500 13px/1.3 var(--font-ui); color: var(--text); }
#workspaceSwitcherList > .ws-error { margin: 6px 8px; color: var(--danger); font: 12.5px/1.45 var(--font-ui); }
#workspaceFeedback { flex-shrink: 0; padding: 0 12px; }
#workspaceFeedback .ws-error { margin: 6px 0; color: var(--danger); font: 12.5px/1.45 var(--font-ui); }

@media (prefers-reduced-motion: reduce) {
  #workspaceSwitcher.ws-switcher, #workspaceSwitcher.ws-switcher[hidden] { transform: none; transition: opacity 140ms ease, display 140ms allow-discrete; }
  @starting-style { #workspaceSwitcher.ws-switcher:not([hidden]) { transform: none; } }
  #workspaceSwitcher.morphing { transition: none; }
  .ws-row-main:active { transform: none; }
  .ws-tile { transition: none; }
}
@media (prefers-contrast: more) {
  .ws-tile { box-shadow: inset 0 0 0 1px var(--space-ink); }
}
```

- [ ] **Step 7: Update the desktop steps and the language sweep for the new menu**

In `test/desktop/steps/named-workspaces.steps.js`, replace the body of `When('I rename one workspace to the other workspace name', …)` with:

```js
  await openOverlaySurface(this, 'openPanel', 'panel'); const page = await overlayPage();
  await page.click('#footerWorkspace');
  await page.getByRole('button', { name: 'Edit First workspace', exact: true }).click();
  await page.fill('#workspaceName', 'Second workspace');
  await page.locator('#workspaceName').evaluate((input) => input.setSelectionRange(2, 6));
```

and in the following `Then('the name and validation error stay visible in the workspace editor', …)` change `assert.equal(await page.isVisible('#wsSwitcherNew'), false);` to `assert.equal(await page.isVisible('[data-focus-key="new"]'), false);`. In `When('I try switching with a private page and type a slash query', …)` and `Then('the private switch decision remains visible', …)` replace every `.ws-switcher-confirm` with `.ws-decision`. In `Then('the workspace list scrolls while creation controls remain visible', …)` replace both `document.getElementById('wsSwitcherNew')` with `document.querySelector('[data-focus-key="new"]')` and `.ws-managed-row` with `.ws-row`.

In `test/desktop/i18n-pseudo-sweep.mjs`, replace `const manageFirst = …` and the workspace surfaces after `'workspace switcher (list)'` with:

```js
const editFirst = ['#workspaceSwitcher .ws-row-more', '#workspaceName'];
```

```js
  { name: 'workspace editor (new)', open: switcherStep(['[data-focus-key="new"]', '#workspaceName']) },
  { name: 'workspace editor (edit)', open: switcherStep(editFirst) },
  { name: 'workspace colour picker', open: switcherStep(editFirst, ['[data-focus-key="color:custom"]', '.space-picker']) },
  {
    name: 'workspace switch decision',
    // A private page (a blank private start page doesn't count) in the bound
    // window makes switching ask first.
    open: async (ctx) => {
      await callTestHook(ctx.app, 'openTab', [`${permissionPageUrl}?private`, { private: true }]);
      // Opening a tab dismisses the overlay; reopen only once it has settled.
      await waitForValue(async () => (await callTestHook(ctx.app, 'state')).tabs.find((t) => t.private && !t.isLoading), Boolean, 'private page loaded');
      return switcherStep(['#workspaceSwitcher .ws-row-main:not(.on)', '.ws-decision'])(ctx);
    },
  },
  { name: 'workspace switcher (after delete)', open: switcherStep(editFirst, ['[data-focus-key="delete"]', '[data-focus-key="undo"]']) },
  { name: 'workspace recently deleted', open: switcherStep(['[data-focus-key="recently-deleted"]', '.ws-recovery']) },
  {
    name: 'workspace permanent delete confirmation',
    open: switcherStep(['[data-focus-key="recently-deleted"]', '.ws-recovery'], ['[data-focus-key^="forget:"]', '.ws-decision']),
  },
```

and in the `'workspace switcher (list)'` surface change `.ws-managed-row + .ws-managed-row` to `.ws-row + .ws-row`.

- [ ] **Step 8: Run everything the menu touches**

```bash
npm run lint
npm run test:unit
npm run substrate:check
npm run test:acceptance:dry
npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@workspace' --retry 0
npm run test:i18n:desktop
```

Expected: all pass. Restart any running `npm start` before looking at the menu by hand: chrome documents load once per window.

- [ ] **Step 9: Inventory and commit**

```bash
npm run audit-inventory:write
git add src test browser-api security/audit-surface-inventory.json
git commit -m "Rebuild the Spaces menu around identity, live edits and Undo

Rows show each space's symbol on its colour; the editor reshapes the menu
in place with live edits (kept and offered again if a save fails), validated
names, preset and custom colours and a symbol grid;
delete is immediate with Undo; rows reorder by drag or Option/Alt+arrows;
the switch prompt leads with saving. Rename and up/down moves retire.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The space mark on the Island and the `'spaces'` overlay mode

**Files:**
- Modify: `src/main/chrome-layout.js` (add `calculateSpacesBounds` + constants + exports)
- Create: `test/unit/spaces-bounds.test.js` (asset)
- Modify: `src/main/window-runtime-registry.js:64-95` (mode comment, two anchor fields)
- Modify: `src/main/main.js`: chrome-layout import (~258), `overlayBounds()` (~2977-2995), a new `setSpacesAnchor` after `setShieldAnchor` (~3005), the overlay `before-input-event` comment only, `hideOverlay` (~3487-3535), the tab-switch dismissal (~6134), `chrome:island-rect` (~7431), a new `chrome:open-spaces` handler after `chrome:open-shield` (~7485)
- Modify: `src/main/preload.js` (`openSpacesMenu`), `browser-api/contract.json` (`OverlayMode`, `RestoreTrigger`, `IslandRectReport`, `SpacesAnchor`, member), regenerate
- Modify: `src/renderer/index.html:30-31` (mark), `:158` (script)
- Modify: `src/renderer/renderer.js` (lookups ~39, mark rendering, click, `onIslandState` ~950, `reportIslandRect` ~1003)
- Modify: `src/renderer/overlay.js` `applyMode` (~1748 and the mode branches)
- Modify: `src/renderer/styles.css` (mark styles; `#islandPill` proximity guard ~1006, ~1360)

**Interfaces:**
- Consumes: Task 1 `SpaceIdentity` (strip), Task 3 projection (`items[].color/symbol/active`, `tint`), Task 6 `placement: 'view'` and `onOpenChange` closing the overlay.
- Produces: `browserAPI.openSpacesMenu(anchor: { left: number, bottom: number })` (send, channel `chrome:open-spaces`); overlay mode `'spaces'`; restore trigger `'spaces'`; `IslandRectReport.spacesAnchor?`; `calculateSpacesBounds({ windowWidth, windowHeight, stripHeight, anchorLeft, anchorBottom }) → { x, y, width, height }`; strip DOM `button#pillSpace.space-mark[data-state="none"|"neutral"|"space"]` with `#pillSpaceSymbol` and `#pillSpaceName`, `aria-expanded` mirroring the menu; `#islandPill.has-space` / `.spaces-open`; root `data-space-tint` and `--space-band-wash`.

- [ ] **Step 1: Bounds — test first**

```bash
cp docs/superpowers/plans/assets/2026-10-13-blanc-spaces/spaces-bounds.test.js test/unit/spaces-bounds.test.js
node --test test/unit/spaces-bounds.test.js
```

Expected: FAIL (`calculateSpacesBounds is not a function`).

In `src/main/chrome-layout.js`, directly above `module.exports = {`, add:

```js
// The 'spaces' overlay: the Spaces menu (300px) opened from the Island's
// space mark. The view starts SPACES_MENU_PAD left of and above the menu so
// its shadow and its opening scale (it grows out of the mark) are never
// clipped by the view's edge; SPACES_MENU_GAP separates the menu from the mark.
const SPACES_MENU_WIDTH = 300;
const SPACES_MENU_PAD = 16;
const SPACES_MENU_GAP = 6;
const SPACES_MENU_MAX_HEIGHT = 640;

/**
 * Bounds for the 'spaces' overlay mode: the menu's left edge under the mark,
 * just below it, clamped inside the window.
 * @param {{windowWidth: number, windowHeight: number, stripHeight: number, anchorLeft?: number|null, anchorBottom?: number|null}} input
 */
function calculateSpacesBounds({ windowWidth, windowHeight, stripHeight, anchorLeft, anchorBottom }) {
  const winWidth = dimension(windowWidth);
  const winHeight = dimension(windowHeight);
  const width = Math.min(SPACES_MENU_WIDTH + SPACES_MENU_PAD * 2, winWidth);
  const left = Number.isFinite(anchorLeft) ? anchorLeft - SPACES_MENU_PAD : (winWidth - width) / 2;
  const x = Math.round(Math.max(0, Math.min(left, winWidth - width)));
  const below = Number.isFinite(anchorBottom) ? Math.min(anchorBottom, dimension(stripHeight)) : dimension(stripHeight);
  const y = Math.max(0, Math.round(below + SPACES_MENU_GAP - SPACES_MENU_PAD));
  const height = Math.max(0, Math.min(SPACES_MENU_MAX_HEIGHT, winHeight - y));
  return { x, y, width, height };
}
```

and add to `module.exports`, after `  calculateCaptureBounds,`:

```js
  SPACES_MENU_WIDTH,
  SPACES_MENU_PAD,
  SPACES_MENU_GAP,
  SPACES_MENU_MAX_HEIGHT,
  calculateSpacesBounds,
```

Run: `node --test test/unit/spaces-bounds.test.js test/unit/chrome-layout.test.js` — Expected: PASS.

- [ ] **Step 2: Main — the mode**

In `src/main/window-runtime-registry.js`, change the `overlayMode` type comment to `/** @type {null | 'panel' | 'palette' | 'find' | 'shield' | 'capture' | 'spaces'} */` and after `captureAnchorRight: null,` add:

```js
    /** The space mark's left/bottom edge while the 'spaces' menu is open. */
    spacesAnchorLeft: null,
    spacesAnchorBottom: null,
```

In `src/main/main.js`:

1. Add `calculateSpacesBounds,` to the `require('./chrome-layout')` destructuring next to `calculateShieldBounds,`.
2. In `overlayBounds()`, before the final `return layout.panelBounds;`, add:

```js
  if (rt().overlayMode === 'spaces') {
    return calculateSpacesBounds({
      windowWidth: rt().window.getContentBounds().width,
      windowHeight: rt().window.getContentBounds().height,
      stripHeight: rt().chromeHeight,
      anchorLeft: rt().spacesAnchorLeft,
      anchorBottom: rt().spacesAnchorBottom,
    });
  }
```

3. After `function setShieldAnchor(anchor) { … }` add:

```js
function setSpacesAnchor(anchor) {
  const width = rt().window?.getContentBounds().width ?? 0;
  const valid = Number.isFinite(anchor?.left) && anchor.left >= 0 && anchor.left <= width
    && Number.isFinite(anchor?.bottom) && anchor.bottom >= 0 && anchor.bottom <= rt().chromeHeight;
  rt().spacesAnchorLeft = valid ? anchor.left : null;
  rt().spacesAnchorBottom = valid ? anchor.bottom : null;
}
```

4. In `hideOverlay`, after `  rt().captureAnchorRight = null;` add `  rt().spacesAnchorLeft = null;` and `  rt().spacesAnchorBottom = null;`; in its `restoreTrigger` chain change `            : closingMode === 'capture' ? 'capture'` to:

```js
            : closingMode === 'capture' ? 'capture'
              : closingMode === 'spaces' ? 'spaces'
```

5. In the tab-switch dismissal change `if (rt().overlayMode === 'find' || rt().overlayMode === 'shield' || rt().overlayMode === 'capture') {` to `if (['find', 'shield', 'capture', 'spaces'].includes(rt().overlayMode)) {` and extend its comment with ` The Spaces menu describes this window, but a switch away from it is a fresh context too.`
6. In `chromeOn('chrome:island-rect', …)`, after the shield re-anchoring `if`, add:

```js
    if (event.sender === rt().window?.webContents && rt().overlayMode === 'spaces' && rect?.spacesAnchor) {
      setSpacesAnchor(rect.spacesAnchor);
      rt().overlayView?.setBounds(overlayBounds());
    }
```

7. After the `chromeOn('chrome:open-shield', …)` handler add:

```js
  // The Island's space mark opens the Spaces menu on its own, tight around it.
  // Escape, blur, a click outside, a tab switch or a space switch close it;
  // focus returns to the mark.
  chromeOn('chrome:open-spaces', (_e, anchor) => {
    if (rt().overlayMode === 'spaces') return hideOverlay({ refocusContent: false }); // re-click toggles shut
    setSpacesAnchor(anchor);
    showOverlay('spaces');
  });
```

The overlay `before-input-event` already forwards Escape to the menu while `workspaceSwitcherOpen` is true, and blur already dismisses every mode except find and display-share; no change there.

In `src/main/preload.js`, after `openCapturePopover`, add `  openSpacesMenu: (anchor) => ipcRenderer.send('chrome:open-spaces', anchor),`.

In `browser-api/contract.json`: add `| 'spaces'` to `OverlayMode.ts` and to `RestoreTrigger.ts`; add

```json
    "SpacesAnchor": {
      "doc": "Where the Spaces menu opens: the space mark's left and bottom edges in window coordinates. Main validates both.",
      "fields": {
        "left": { "type": "number" },
        "bottom": { "type": "number" }
      }
    },
```

add to `IslandRectReport.fields` `"spacesAnchor": { "type": "SpacesAnchor", "optional": true, "doc": "Present while the Spaces menu is open from the mark, so it follows the pill." }`, and add after `openCapturePopover`:

```json
    {
      "name": "openSpacesMenu",
      "group": "workspaces",
      "kind": "send",
      "channel": "chrome:open-spaces",
      "params": [{ "name": "anchor", "type": "SpacesAnchor" }],
      "doc": "Open the Spaces menu from the Island's space mark."
    },
```

Run: `npm run browser-api:build && npm run browser-api:check` — Expected: PASS.

- [ ] **Step 3: The strip draws the mark**

In `src/renderer/index.html`, insert directly after `<div id="islandPill" …>` (before `<div id="pillNav" class="pill-btns"></div>`):

```html
        <button id="pillSpace" class="space-mark" type="button" aria-haspopup="dialog" aria-expanded="false" data-state="none" hidden>
          <span id="pillSpaceSymbol" class="space-mark-symbol" aria-hidden="true"></span>
          <span id="pillSpaceName" class="space-mark-name" data-i18n-ignore></span>
        </button>
```

and before `  <script src="renderer.js"></script>` add `  <script src="space-identity.js"></script>`.

In `src/renderer/renderer.js`:

1. After `  const pillShieldCount = document.getElementById('pillShieldCount');` add:

```js
  const pillSpace = document.getElementById('pillSpace');
  const pillSpaceSymbol = document.getElementById('pillSpaceSymbol');
  const pillSpaceName = document.getElementById('pillSpaceName');
```

2. Directly before `  function render() {` add:

```js
  // ---- Blanc Spaces mark (F41) ----
  // The strip reads the same projection as the Spaces menu and only draws the
  // current space's mark: its symbol and name on its colour, a grey glyph when
  // this window is in no space, nothing before the first space exists.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // The footer's stacked-windows mark on the 24px symbol grid.
  const NEUTRAL_SPACE_GLYPH = [
    ['rect', { x: 3.75, y: 7.125, width: 13.125, height: 12.75, rx: 2.25 }],
    ['path', { d: 'M7.875 7.125V4.875a1.5 1.5 0 0 1 1.5-1.5h10.5a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5h-2.25' }],
  ];
  let spaces = { items: [], tint: 'mark' };
  let markedSpace = { id: null, index: -1 };
  let spaceMarkPainted = false;
  function symbolSvg(elements) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    for (const [tag, attrs] of elements) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      svg.append(node);
    }
    return svg;
  }
  function chromeTheme() {
    if (document.documentElement.dataset.theme === 'private') return 'private';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function spacesAnchor() {
    const r = pillSpace.getBoundingClientRect();
    return { left: r.left, bottom: r.bottom };
  }
  function renderSpaceMark() {
    const items = Array.isArray(spaces.items) ? spaces.items : [];
    const index = items.findIndex((w) => w.active);
    const bound = index >= 0 ? items[index] : null;
    const state = bound ? 'space' : items.length ? 'neutral' : 'none';
    const widthBefore = pillSpace.hidden ? 0 : pillSpace.getBoundingClientRect().width;
    pillSpace.hidden = state === 'none';
    pillSpace.dataset.state = state;
    islandPill.classList.toggle('has-space', state === 'space');
    document.documentElement.dataset.spaceTint = spaces.tint || 'mark';
    if (bound) {
      const painted = SpaceIdentity.paint(bound.color, chromeTheme()) ?? SpaceIdentity.paint(SpaceIdentity.PRESETS[0].hex, chromeTheme());
      pillSpace.style.setProperty('--space-ink', painted.ink);
      pillSpace.style.setProperty('--space-wash', painted.wash);
      document.documentElement.style.setProperty('--space-band-wash', painted.wash);
      pillSpace.title = blancI18n.t('spaces.mark.current', { name: bound.name });
    } else {
      pillSpace.style.removeProperty('--space-ink');
      pillSpace.style.removeProperty('--space-wash');
      document.documentElement.style.removeProperty('--space-band-wash');
      pillSpace.title = blancI18n.t('footer.workspaces');
    }
    pillSpace.setAttribute('aria-label', pillSpace.title);
    const symbol = bound ? (SpaceIdentity.isSymbol(bound.symbol) ? bound.symbol : SpaceIdentity.SYMBOL_IDS[0]) : 'neutral';
    if (pillSpaceSymbol.dataset.symbol !== symbol) {
      pillSpaceSymbol.replaceChildren(symbolSvg(bound ? SpaceIdentity.SYMBOLS[symbol] : NEUTRAL_SPACE_GLYPH));
      pillSpaceSymbol.dataset.symbol = symbol;
    }
    pillSpaceName.textContent = bound?.name ?? '';
    const next = { id: bound?.id ?? null, index };
    if (spaceMarkPainted && next.id !== markedSpace.id) animateSpaceSwitch(markedSpace.index, index, widthBefore);
    markedSpace = next;
    spaceMarkPainted = true;
  }
  // Task 8 replaces this with the switch motion.
  function animateSpaceSwitch() {}
  function applySpaces(payload) {
    spaces = payload && Array.isArray(payload.items) ? payload : { items: [], tint: 'mark' };
    renderSpaceMark();
  }
  window.browserAPI.listWorkspaces().then(applySpaces, () => {});
  window.browserAPI.onWorkspacesUpdated(applySpaces);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderSpaceMark);
  pillSpace.addEventListener('mousedown', (e) => e.preventDefault());
  pillSpace.addEventListener('click', (e) => {
    e.stopPropagation(); // the pill's own click opens the ⌘L panel
    window.browserAPI.openSpacesMenu(spacesAnchor());
  });
```

3. At the start of `render()`'s body, add `    renderSpaceMark(); // the private theme may have just changed`.
4. In `onIslandState`, after `    pillShield.setAttribute('aria-expanded', String(shieldOpen && trigger === 'shield'));` add:

```js
    pillSpace.setAttribute('aria-expanded', String(mode === 'spaces'));
    islandPill.classList.toggle('spaces-open', mode === 'spaces');
```

   and after `    else if (restoreTrigger === 'insecure') pillInsecure.focus();` add `    if (restoreTrigger === 'spaces') pillSpace.focus();`.
5. In `reportIslandRect`, change `const k = islandPill.classList.contains('shield-open') ? 0 : …` to `const k = islandPill.classList.contains('shield-open') || islandPill.classList.contains('spaces-open') ? 0 : Number(islandPill.style.getPropertyValue('--island-k')) || 0;` and add `      ...(pillSpace.getAttribute('aria-expanded') === 'true' ? { spacesAnchor: spacesAnchor() } : {}),` inside the `rect` object after the `shieldAnchor` spread.

- [ ] **Step 4: The overlay shows the menu alone in `'spaces'` mode**

In `src/renderer/overlay.js` `applyMode`:

- Change `    if (next !== 'panel' && next !== 'palette') closeWorkspaceSwitcher();` to `    if (next !== 'panel' && next !== 'palette' && next !== 'spaces') closeWorkspaceSwitcher();`.
- In the branch chain that starts `    if (next === 'panel' || next === 'palette') {`, add before `} else if (next === 'shield') {`:

```js
    } else if (next === 'spaces') {
      // The menu is the whole overlay here; data refreshes behind the first paint.
      refreshSwitcherData();
      if (!reshow) openWorkspaceSwitcher();
```

- Update the mode type comment near line 102 to include `'spaces'`.

- [ ] **Step 5: Mark styles**

In `src/renderer/styles.css`:

- Change `#islandPill.proximity-active:not(.shield-open) {` to `#islandPill.proximity-active:not(.shield-open):not(.spaces-open) {`, and after `#islandPill.shield-open { transform: none; transition: none; }` add `#islandPill.spaces-open { transform: none; transition: none; }`.
- Append:

```css
/* ---- Blanc Spaces mark (strip) -------------------------------------------
   The current space at the Island's leading edge: its symbol and name on its
   wash (space-identity.js guards the ink). Authored inside #islandPill's
   zoom, so 24px renders at ~28px. Neutral = in no space yet. */
.space-mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  max-width: 150px;
  padding: 0 8px 0 6px;
  border: 0;
  border-radius: 8px;
  color: var(--space-ink);
  background: var(--space-wash);
  font: 550 11px/1 var(--font-ui);
  cursor: pointer;
  transition: color 350ms ease, background-color 350ms ease, box-shadow 200ms ease;
}
.space-mark[hidden] { display: none; }
.space-mark:active { transform: scale(.96); transition: transform 100ms ease-out; }
.space-mark:hover, .space-mark[aria-expanded="true"] { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--space-ink) 28%, transparent); }
.space-mark:focus-visible { outline: 1px solid var(--text-dim); outline-offset: 2px; }
.space-mark-symbol { display: grid; place-items: center; }
.space-mark-symbol svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.space-mark-name { min-width: 0; max-width: 122px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.space-mark[data-state="neutral"] { --space-ink: var(--text-dim); --space-wash: color-mix(in srgb, var(--text) 6%, transparent); width: 24px; padding: 0; justify-content: center; }
.space-mark[data-state="neutral"] .space-mark-name { display: none; }
#islandPill:has(> .space-mark:not([hidden])) { padding-left: 7px; }
.island-row .row-space-tile { width: 20px; height: 20px; border-radius: 6px; }
.island-row .row-space-tile .ws-symbol { width: 12px; height: 12px; }
```

- [ ] **Step 6: Run and look**

```bash
npm run lint && npm run test:unit && npm run substrate:check
```

Expected: pass. Then restart the dev app (`npm start`; chrome documents load once per window) and check by hand: with no spaces the pill is unchanged; create a space from ⌘L → Spaces → New space…; the mark appears with its symbol and name; clicking it opens the menu directly below it, and clicking it again closes it; Escape closes it and focus returns to the mark.

- [ ] **Step 7: Inventory and commit**

```bash
npm run audit-inventory:write
git add src browser-api test/unit/spaces-bounds.test.js security/audit-surface-inventory.json
git commit -m "Show the current space on the Island and open its menu there

A tinted mark with the space's symbol and name leads the Island (a grey
glyph when this window is in no space); it opens the Spaces menu in a new
'spaces' overlay mode sized around the menu, like the shield popover.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Switch motion, Reduce Motion, Increased Contrast and the dev tints

**Files:**
- Modify: `src/renderer/renderer.js` (`animateSpaceSwitch`)
- Modify: `src/renderer/styles.css` (append)

**Interfaces:**
- Consumes: Task 7 `renderSpaceMark` calling `animateSpaceSwitch(fromIndex, toIndex, widthBefore)`; root `data-space-tint`, `--space-band-wash`, `#islandPill.has-space`.
- Produces: nothing other tasks call. `@F41-23` (Task 11) asserts the Reduce Motion behaviour.

- [ ] **Step 1: The switch motion**

In `src/renderer/renderer.js`, replace

```js
  // Task 8 replaces this with the switch motion.
  function animateSpaceSwitch() {}
```

with

```js
  // A switch slides the new mark in from the side it comes from in the list
  // (moving down the list, content moves up) while the page cluster follows
  // and the mark settles to its new width — critically damped, no overshoot.
  // Reduce Motion keeps only a cross-fade.
  function animateSpaceSwitch(fromIndex, toIndex, widthBefore) {
    const easing = 'cubic-bezier(.2, .9, .25, 1)';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const node of [pillSpaceSymbol, pillSpaceName]) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      return;
    }
    const dir = toIndex > fromIndex ? 1 : -1;
    for (const node of [pillSpaceSymbol, pillSpaceName]) {
      node.animate([{ transform: `translateY(${7 * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing });
    }
    for (const node of [pillDots, pillFavicon, pillDomain]) {
      node.animate([{ transform: `translateX(${10 * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing });
    }
    const widthAfter = pillSpace.hidden ? 0 : pillSpace.getBoundingClientRect().width;
    if (widthBefore && widthAfter && widthBefore !== widthAfter) {
      pillSpace.animate([{ width: `${widthBefore}px` }, { width: `${widthAfter}px` }], { duration: 320, easing });
    }
  }
```

- [ ] **Step 2: Accessibility media and the dev-only tints**

Append to `src/renderer/styles.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .space-mark { transition: none; }
  .space-mark:active { transform: none; }
}
@media (prefers-contrast: more) {
  .space-mark[data-state="space"] { box-shadow: inset 0 0 0 1px var(--space-ink); }
}

/* Dev-only comparison of how strongly a space tints the chrome (spec §11,
   BLANC_SPACE_TINT in an unpackaged build). 'mark' — the chip alone — ships. */
:root[data-space-tint="island"] #islandPill.has-space::after {
  background: linear-gradient(var(--space-band-wash), var(--space-band-wash)), var(--island-resting-surface);
}
:root[data-space-tint="island"] .space-mark[data-state="space"] { color: var(--surface-raised); background: var(--space-ink); padding: 0; width: 24px; justify-content: center; }
:root[data-space-tint="island"] .space-mark[data-state="space"] .space-mark-name { display: none; }
:root[data-space-tint="frame"] #strip { background-image: linear-gradient(180deg, var(--space-band-wash, transparent), transparent); }
:root[data-space-tint="frame"] .vertical-tabs-rail { background-image: linear-gradient(180deg, var(--space-band-wash, transparent), transparent 70%); }
```

- [ ] **Step 3: Look at it, all three ways**

Restart the dev app and switch between two spaces from the mark: the mark's symbol and name slide in from below when moving down the list, from above when moving up, the page cluster follows, the width settles, the colour fades. Turn on Reduce Motion (macOS System Settings → Accessibility → Display) and switch again: only a fade. Then compare the dev tints:

```bash
BLANC_SPACE_TINT=island npm start
```

```bash
BLANC_SPACE_TINT=frame npm start
```

Run: `npm run lint && npm run substrate:check` — Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/renderer.js src/renderer/styles.css
git commit -m "Animate a space switch on the Island

The new mark slides in from its side of the list, the page cluster follows
and the width settles, cross-fading only under Reduce Motion; Increased
Contrast outlines the mark; island and frame tints for dev comparison.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Spaces in the Quick Switcher

**Files:**
- Modify: `src/renderer/overlay.js` (`RESULT_TAGS` ~711, `switcherResults` ~1176, its de-dup key ~1224, `resultKey` ~1288, `pickResult` ~1296, `resultRow` ~1317 and ~1344, and a shared `spaceTheme()`)
- Create: `test/unit/switcher-spaces.test.js` (asset)

**Interfaces:**
- Consumes: Task 6 `WorkspaceUI.makeTile`, `workspaceUI.switchTo`; Task 4 `result.tag.space`.
- Produces: Quick Switcher results `{ kind: 'space', title, sub, workspace, score }`, keyed `space:<id>`.

- [ ] **Step 1: Copy the test and watch it fail**

```bash
cp docs/superpowers/plans/assets/2026-10-13-blanc-spaces/switcher-spaces.test.js test/unit/switcher-spaces.test.js
node --test test/unit/switcher-spaces.test.js
```

Expected: FAIL — no `space` results.

- [ ] **Step 2: Implement**

In `src/renderer/overlay.js`:

1. Above the `WorkspaceUI.create({ … })` call add a shared theme and use it there (`theme: spaceTheme,` replacing the inline arrow from Task 6):

```js
  // The theme space colours are drawn for: the private chrome is its own surface.
  function spaceTheme() {
    if (document.documentElement.dataset.theme === 'private') return 'private';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
```

2. In `RESULT_TAGS`, after `    remote: blancI18n.t('result.tag.remote'),` add `    space: blancI18n.t('result.tag.space'),`.
3. In `switcherResults`, directly after `    const results = [];` add:

```js
    // Spaces rank with groups: typing a space's name switches to it. The
    // current space is already here, so it never appears.
    for (const w of wsWorkspaces) {
      if (w.active) continue;
      const s = matchScore(query, w.name);
      if (s) results.push({ kind: 'space', title: w.name, sub: blancI18n.t('result.groupCount', { count: w.tabCount }), workspace: w, score: s + 0.3 });
    }
```

4. In its de-dup filter change `        const key = r.kind === 'tab' ? \`tab:${r.tab.id}\` : r.kind === 'group' ? \`group:${r.group.id}\` : r.url;` to `        const key = r.kind === 'tab' ? \`tab:${r.tab.id}\` : r.kind === 'group' ? \`group:${r.group.id}\` : r.kind === 'space' ? \`space:${r.workspace.id}\` : r.url;`.
5. In `resultKey`, after the `group` line add `    if (result.kind === 'space') return \`space:${result.workspace.id}\`;`.
6. At the top of `pickResult` add:

```js
    // The Spaces menu closes the overlay itself after a switch, and keeps it
    // open when switching must first ask about this window's tabs.
    if (result.kind === 'space') { workspaceUI.switchTo(result.workspace); return; }
```

7. In `resultRow`, change `    if (result.kind === 'group') {` (the `leading` branch) to:

```js
    if (result.kind === 'space') {
      leading = WorkspaceUI.makeTile(document, result.workspace, spaceTheme(), 'ws-tile row-space-tile');
    } else if (result.kind === 'group') {
```

   and change `    if (result.kind !== 'group') sub.dataset.i18nIgnore = '';` to `    if (result.kind !== 'group' && result.kind !== 'space') sub.dataset.i18nIgnore = '';` (a tab count is interface text; the space name is the title, already marked as data).

Run: `node --test test/unit/switcher-spaces.test.js test/unit/switcher-favorite-favicon.test.js && npm run copy:check && npm run lint` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/overlay.js test/unit/switcher-spaces.test.js
git commit -m "Find and switch to a space from the Quick Switcher

Typing a space's name in ⌘L offers it beside groups, with its symbol tile;
picking it switches through the Spaces menu, which asks first when needed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: "Make your first space" on the moving-in checklist

**Files:**
- Modify: `src/main/migration-checklist.js`, `test/unit/migration-checklist.test.js`
- Modify: `src/main/settings.js` (DEFAULTS ~153-158, the two key loops ~316 and ~373), `settings-schema/schema.json` (`internalDefaults`), `test/unit/migration-checklist-settings.test.js:10`
- Modify: `src/main/main.js` (startup next to the Sync migration ~9318; `startPageStatus` ~9817; the creation handlers; start-page hooks ~9994), `src/main/pages.js` (~551), `src/main/tab-preload.js` (~88), `browser-api/bridges.json`
- Modify: `src/renderer/pages/newtab.html:118-145`, `src/renderer/pages/newtab.js` (~174-292)
- Modify: `test/unit/migration-checklist-wiring.test.js`, `test/unit/migration-checklist-page.test.js`
- Modify: `src/main/test-hook.js` (~814-849, ~1003-1075), `test/desktop/steps/migration-checklist.steps.js`, `spec/acceptance/sync.feature:31,47,60-65`

**Interfaces:**
- Consumes: Task 6 overlay purpose `openSpaces`.
- Produces: settings keys `spaceMigrationCompleted` and `spaceChecklistIntroduced` (device-local booleans, never synced); `migrationChecklistState({ firstRunComplete, dismissed, syncComplete, tabsComplete, spaceComplete })` → `{ visible, completedCount, syncComplete, tabsComplete, spaceComplete }` (visible while fewer than 3); `spaceTaskIntroduction(settings)` → patch or `null`; `bowserPages.start.openSpaces()` (channel `pages:start:open-spaces`, host `newtab`).

- [ ] **Step 1: Model tests first**

In `test/unit/migration-checklist.test.js`, change the import to also take `spaceTaskIntroduction`, set `base` to include `spaceComplete: false`, and replace the progress assertions with:

```js
  const project = (extra) => migrationChecklistState({ ...base, ...extra });
  assert.deepEqual(project({}), { visible: true, completedCount: 0, syncComplete: false, tabsComplete: false, spaceComplete: false });
  assert.deepEqual(project({ syncComplete: true }), { visible: true, completedCount: 1, syncComplete: true, tabsComplete: false, spaceComplete: false });
  assert.deepEqual(project({ syncComplete: true, tabsComplete: true }), { visible: true, completedCount: 2, syncComplete: true, tabsComplete: true, spaceComplete: false });
  assert.deepEqual(project({ syncComplete: true, tabsComplete: true, spaceComplete: true }), { visible: false, completedCount: 3, syncComplete: true, tabsComplete: true, spaceComplete: true });
```

(keep the three `.visible` gate assertions after them), and append:

```js
test('the third task never reopens a checklist that already retired', () => {
  const intro = (s) => spaceTaskIntroduction({ spaceChecklistIntroduced: false, migrationChecklistDismissed: false, syncMigrationCompleted: false, tabImportCompleted: false, ...s });
  assert.deepEqual(intro({}), { spaceChecklistIntroduced: true }, 'a checklist still showing gains the task');
  assert.deepEqual(intro({ syncMigrationCompleted: true, tabImportCompleted: true }), { spaceChecklistIntroduced: true, migrationChecklistDismissed: true }, 'a finished checklist stays retired');
  assert.deepEqual(intro({ migrationChecklistDismissed: true }), { spaceChecklistIntroduced: true });
  assert.equal(intro({ spaceChecklistIntroduced: true }), null, 'it runs once');
});
```

Run: `node --test test/unit/migration-checklist.test.js` — Expected: FAIL.

- [ ] **Step 2: Model**

Replace `src/main/migration-checklist.js` with:

```js
'use strict';

const TASKS = 3;

function migrationChecklistState({
  firstRunComplete,
  dismissed,
  syncComplete,
  tabsComplete,
  spaceComplete,
} = {}) {
  const syncDone = syncComplete === true;
  const tabsDone = tabsComplete === true;
  const spaceDone = spaceComplete === true;
  const completedCount = Number(syncDone) + Number(tabsDone) + Number(spaceDone);

  return {
    visible: firstRunComplete === true && dismissed === false && completedCount < TASKS,
    completedCount,
    syncComplete: syncDone,
    tabsComplete: tabsDone,
    spaceComplete: spaceDone,
  };
}

/** One-time settings patch when the checklist gained "Make your first space"
 * (F41): a checklist that had already retired with both earlier tasks done
 * stays retired (spec D16). Null once applied. */
function spaceTaskIntroduction(settings = {}) {
  if (settings.spaceChecklistIntroduced === true) return null;
  const retired = settings.syncMigrationCompleted === true && settings.tabImportCompleted === true;
  return { spaceChecklistIntroduced: true, ...(retired ? { migrationChecklistDismissed: true } : {}) };
}

function migrationChecklistForTab(checklist, tab, defaultProfileId) {
  if (!checklist || !tab || tab.private || tab.profileId !== defaultProfileId) return null;
  return { ...checklist };
}

module.exports = { MIGRATION_CHECKLIST_TASKS: TASKS, migrationChecklistState, spaceTaskIntroduction, migrationChecklistForTab };
```

Run: `node --test test/unit/migration-checklist.test.js` — Expected: PASS.

- [ ] **Step 3: Settings keys**

In `src/main/settings.js` DEFAULTS, after `  tabImportCompleted: false,` add:

```js
  // F41: "Make your first space" completed, and the one-time introduction of
  // that task (so a checklist that already retired stays retired).
  spaceMigrationCompleted: false,
  spaceChecklistIntroduced: false,
```

and in both loops `for (const key of ['migrationChecklistDismissed', 'syncMigrationCompleted', 'tabImportCompleted']) {` add `'spaceMigrationCompleted', 'spaceChecklistIntroduced'` to the array. In `settings-schema/schema.json` add both names to `internalDefaults` after `"tabImportCompleted"`. In `test/unit/migration-checklist-settings.test.js` change `const KEYS = ['migrationChecklistDismissed', 'syncMigrationCompleted', 'tabImportCompleted'];` to include the two new keys.

Run: `npm run settings:build && npm run settings:check && node --test test/unit/migration-checklist-settings.test.js` — Expected: PASS.

- [ ] **Step 4: Main**

In `src/main/main.js`:

1. Add `spaceTaskIntroduction,` to the `require('./migration-checklist')` destructuring.
2. Directly after the block `if (sync.status().enabled && !settings.getSettings().syncMigrationCompleted) { … }` add:

```js
  // Introduce "Make your first space" once, before any window exists, without
  // reopening a checklist that already retired (spec D16).
  const spaceTaskPatch = spaceTaskIntroduction(settings.getSettings());
  if (spaceTaskPatch) settings.setSettings(spaceTaskPatch);
```

3. In `startPageStatus`, add `          spaceComplete: current.spaceMigrationCompleted,` after `          tabsComplete: current.tabImportCompleted,`.
4. Add near `workspacesProjection`:

```js
/** "Make your first space" is done once a space exists in Personal. */
function noteSpaceCreated() {
  if (rt().profileId === DEFAULT_PROFILE_ID && !settings.getSettings().spaceMigrationCompleted) {
    settings.setSettings({ spaceMigrationCompleted: true });
  }
}
```

   and call `noteSpaceCreated();` right after `broadcastWorkspacesUpdated();` in the success paths of the save-as handler and the create-blank handler, and inside the Arc service's `createSpaces(entries)` when `result.ok`.
5. In the start-page hooks object, after `dismissMigrationChecklist`, add:

```js
      openSpaces: () => {
        showOverlay('panel', { purpose: { openSpaces: true } });
        return true;
      },
```

In `src/main/pages.js`, after the `'pages:start:focus-group'` handler add:

```js
  handle('pages:start:open-spaces', 'newtab', () => hooks.startPage?.openSpaces?.() === true);
```

In `src/main/tab-preload.js`, after `focusGroup: (id) => invoke('pages:start:focus-group', id),` add `        openSpaces: () => invoke('pages:start:open-spaces'),`. In `browser-api/bridges.json`, add a `start.openSpaces` member mirroring `start.focusGroup` (kind `invoke`, channel `pages:start:open-spaces`, hosts `["newtab"]`, no params, returns `unknown`, doc `"Open the Spaces menu from the moving-in checklist."`).

In `test/unit/migration-checklist-wiring.test.js`, extend the first regex to end with `tabsComplete: current\.tabImportCompleted,\s*spaceComplete: current\.spaceMigrationCompleted,` and add:

```js
test('the space task is introduced once at startup and completes on the first space', () => {
  const main = read('src/main/main.js');
  const intro = main.indexOf('const spaceTaskPatch = spaceTaskIntroduction(settings.getSettings());');
  assert.ok(intro > 0 && intro < main.indexOf('settings.onSettingsChanged((s) => {'), 'before the settings fan-out');
  assert.match(main, /function noteSpaceCreated\(\) \{[\s\S]{0,200}spaceMigrationCompleted: true/);
  assert.ok((main.match(/noteSpaceCreated\(\);/g) ?? []).length >= 3, 'save-as, create-blank and the Arc import each complete it');
});
```

- [ ] **Step 5: Start page**

In `src/renderer/pages/newtab.html`: change the ring `<span class="js-migration-progress">0/2</span>` to `0/3`, and after the `#migrationTabsTask` `<li>` add:

```html
            <li id="migrationSpaceTask">
              <button id="migrationSpaceAction" class="migration-task" type="button">
                <span class="migration-task-check" aria-hidden="true"></span>
                <span class="migration-task-label" data-i18n="newtab.checklist.space">Make your first space</span>
                <span class="page-sr-only migration-task-status" data-i18n="newtab.checklist.notCompleted">Not completed</span>
              </button>
            </li>
```

In `src/renderer/pages/newtab.js`:

- With the other checklist element lookups add `const migrationSpaceTask = document.getElementById('migrationSpaceTask');` and `const migrationSpaceAction = document.getElementById('migrationSpaceAction');`, and above `function paintMigrationChecklist` add `const MIGRATION_TASKS = 3; // keep in step with migration-checklist.js`.
- In `paintMigrationChecklist`, change `` el.textContent = `${checklist.completedCount}/2`; `` to `` el.textContent = `${checklist.completedCount}/${MIGRATION_TASKS}`; `` and add `  setMigrationTask(migrationSpaceTask, migrationSpaceAction, checklist.spaceComplete, t('newtab.checklist.space'));` after the tabs line.
- In `renderMigrationChecklist`, change `previous.completedCount < 2 && checklist.completedCount === 2;` to `previous.completedCount < MIGRATION_TASKS && checklist.completedCount === MIGRATION_TASKS;` and `if (migrationChecklistPendingCompletion && checklist.completedCount === 2) {` to `if (migrationChecklistPendingCompletion && checklist.completedCount === MIGRATION_TASKS) {`.
- After `migrationTabsAction.addEventListener('click', closeMigrationChecklistPopover);` add:

```js
migrationSpaceAction.addEventListener('click', () => {
  closeMigrationChecklistPopover();
  window.bowserPages?.start.openSpaces().catch(() => {});
});
```

In `test/unit/migration-checklist-page.test.js`, in `'renderer reflects progress…'` change the regex `/previous\.completedCount < 2 && checklist\.completedCount === 2/` to `/previous\.completedCount < MIGRATION_TASKS && checklist\.completedCount === MIGRATION_TASKS/` and add `assert.match(js, /start\.openSpaces\(\)/);`; in `'start page carries one shared accessible migration checklist'` add `assert.match(html, /id="migrationSpaceAction"[^>]*>[\s\S]*?Make your first space/);`.

- [ ] **Step 6: Test hooks and the checklist scenarios**

In `src/main/test-hook.js`: in `readMigrationChecklistDom` add `const space = document.getElementById('migrationSpaceTask');` and `spaceComplete: space?.classList.contains('is-complete') ?? false,`; in `clickMigrationChecklist` add `space: 'migrationSpaceAction',` to `ids` and change `const inPopover = action === 'sync' || action === 'tabs';` to `const inPopover = action === 'sync' || action === 'tabs' || action === 'space';`; in `resetMigrationChecklist` add `spaceMigrationCompleted: false,` to the patch and `spaceComplete: current.spaceMigrationCompleted,` to the result; change `setMigrationChecklistProgress(syncComplete, tabsComplete)` to

```js
    setMigrationChecklistProgress(syncComplete, tabsComplete, spaceComplete = false) {
      settings.setSettings({ syncMigrationCompleted: !!syncComplete, tabImportCompleted: !!tabsComplete, spaceMigrationCompleted: !!spaceComplete });
      return true;
    },
```

and add `spaceComplete: current.spaceMigrationCompleted === true,` to `migrationChecklistSettings()`.

In `test/desktop/steps/migration-checklist.steps.js`: add `spaceComplete: false,` to the reset expectation; in `'I mark Sync complete…'` and `'I mark tab migration complete…'` pass `current.spaceComplete` as the third argument; replace `'I complete both moving-in tasks'` with

```js
When('I complete every moving-in task', async function () {
  assert.equal(await this.call('setMigrationChecklistProgress', true, true, true), true);
});

When('I mark the first space complete in the moving-in checklist', async function () {
  const current = await this.call('migrationChecklistSettings');
  assert.equal(await this.call('setMigrationChecklistProgress', current.syncComplete, current.tabsComplete, true), true);
});
```

and change both `'2/2'` literals (and the message `'the moving-in checklist pill to confirm 2/2'`) to `'3/3'`. Update every feature that used `I complete both moving-in tasks` to `I complete every moving-in task` (`git grep -n "I complete both moving-in tasks" spec/acceptance`).

In `spec/acceptance/sync.feature`: change both `Then the moving-in checklist shows "0/2"` to `"0/3"`, `Then the Sync task stays checked at "1/2"` to `"1/3"`, and in `@F27-7` insert `    And I mark the first space complete in the moving-in checklist` directly after `    When I mark tab migration complete in the moving-in checklist`.

Run:

```bash
node --test test/unit/migration-checklist*.test.js
npm run browser-api:build && npm run browser-api:check
npm run test:acceptance:dry
npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F27-4 or @F27-5 or @F27-7 or @F35' --retry 0
```

Expected: all pass.

- [ ] **Step 7: Inventory and commit**

```bash
npm run audit-inventory:write
git add src settings-schema browser-api test spec/acceptance security/audit-surface-inventory.json
git commit -m "Add Make your first space to the moving-in checklist

A third task that opens the Spaces menu and completes on the first space in
Personal; a checklist that already retired is not reopened.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Acceptance scenarios for the mark and the menu

**Files:**
- Modify: `spec/acceptance/F41-named-workspaces.feature` (append `@F41-16` … `@F41-25`), `test/desktop/cucumber.mjs` (RUNNABLE)
- Create: `test/desktop/steps/spaces-redesign.steps.js`
- Modify: `src/main/test-hook.js` (Spaces hooks)

**Interfaces:**
- Consumes: everything above. Test-hook additions: `spaceMarkState(windowId?)`, `clickPillSpace()`, `pressOverlayKey(keyCode, modifiers?)`, `emulateReducedMotion(on)`; existing `workspaceAction`, `workspaceActionInWindow`, `openNewWindow`, `openTabInWindow`, `closeWindowRuntime`, `overlayRendererMode`, `overlayBounds`, `chromeFocusedId`, `openTab`, `closeOverlay`.

- [ ] **Step 1: Test hooks**

In `src/main/test-hook.js`, after `pressOverlayEscape() { … },` add:

```js
    // ---- Blanc Spaces mark and menu (F41) ----
    spaceMarkState(windowId) {
      const read = () => {
        const wc = getChromeWebContents();
        if (!wc) return null;
        return wc.executeJavaScript(`(() => {
          const mark = document.getElementById('pillSpace');
          if (!mark) return null;
          const rect = mark.getBoundingClientRect();
          const parts = [document.getElementById('pillSpaceSymbol'), document.getElementById('pillSpaceName')];
          return {
            hidden: mark.hidden,
            state: mark.dataset.state,
            name: parts[1].textContent,
            label: mark.getAttribute('aria-label'),
            expanded: mark.getAttribute('aria-expanded'),
            ink: mark.style.getPropertyValue('--space-ink'),
            symbol: parts[0].dataset.symbol ?? null,
            left: rect.left,
            bottom: rect.bottom,
            animatedProperties: [...new Set(parts.flatMap((p) => p.getAnimations()).flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k))))],
          };
        })()`);
      };
      return windowId ? refs.runInWindowRuntime(String(windowId), read) : read();
    },
    clickPillSpace() {
      const wc = getChromeWebContents();
      if (!wc) throw new Error('chrome webContents unavailable');
      return wc.executeJavaScript(`document.getElementById('pillSpace').click()`);
    },
    pressOverlayKey(keyCode, modifiers = []) {
      const wc = getOverlayWebContents();
      if (!wc) throw new Error('overlay is not open');
      wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
      return true;
    },
    async emulateReducedMotion(on) {
      for (const wc of [getChromeWebContents(), getOverlayWebContents()].filter(Boolean)) {
        if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
        await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : '' }] });
      }
      return true;
    },
```

(If `refs.runInWindowRuntime` is not passed to the hook under that name, use the same reference `workspaceActionInWindow` uses.)

- [ ] **Step 2: Scenarios**

Append to `spec/acceptance/F41-named-workspaces.feature`:

```gherkin

  @F41-16
  Scenario: The Island shows no space mark before the first space
    Then the Island shows no space mark

  @F41-17
  Scenario: A window that is in no space shows the quiet Spaces mark
    Given a space named "Elsewhere" saved from another window
    Then the Island shows the quiet Spaces mark

  @F41-18
  Scenario: The space mark names the current space and opens its menu
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    Then the Island's space mark reads "Work" in "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    Then the Spaces menu opens directly below the mark
    When I open the Spaces menu from the space mark
    Then the Spaces menu is closed

  @F41-19
  Scenario: Editing a space changes the mark as you edit
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    And I edit "Work" to the color "sky" and the symbol "star"
    Then the Island's space mark reads "Work" in "#376694" with the symbol "star"

  @F41-20
  Scenario: A custom color is kept and drawn readably
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    And I give "Work" the custom color "#F5E663"
    Then the space "Work" is saved with the color "#f5e663"
    And the Island's space mark reads "Work" in "#6d6400" with the symbol "briefcase"
    And the editor says the color is shown as "#6D6400" in light mode

  @F41-21
  Scenario: Undo after deleting this window's space puts the window back in it
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    And I delete "Work" from its editor
    Then the Island shows no space mark
    When I undo the delete
    Then this window is in the space "Work" again

  @F41-22
  Scenario: The Spaces menu works from the keyboard
    Given spaces named "Work" and "Reading", with this window in "Work"
    When I open the Spaces menu from the space mark
    And I move "Work" down with Option or Alt and the down arrow
    Then the spaces are listed as "Reading" then "Work"
    When I press Escape in the Spaces menu
    Then the Spaces menu is closed and the space mark has focus

  @F41-23
  Scenario: With Reduce Motion a switch only cross-fades
    Given spaces named "Work" and "Reading", with this window in "Work"
    And Reduce Motion is on
    When I switch to "Reading" from the Spaces menu
    Then the space mark changes to "Reading" without sliding

  @F41-24
  Scenario: Typing a space's name in the panel switches to it
    Given spaces named "Work" and "Reading", with this window in "Work"
    When I type "Read" into the panel and pick the space result
    Then the Island's space mark reads "Reading"

  @F41-25
  Scenario: Switching from unsaved tabs leads with saving them
    Given a page open in a window that is in no space, and a saved space named "Target"
    When I open the Spaces menu from the space mark
    And I pick "Target" in the Spaces menu
    Then the switch prompt offers save, new window, close, then cancel
```

In `test/desktop/cucumber.mjs`, change `  '@F41-12', '@F41-13', '@F41-14', '@F41-15',` to `  '@F41-12', '@F41-13', '@F41-14', '@F41-15', '@F41-16', '@F41-17', '@F41-18', '@F41-19', '@F41-20', '@F41-21', '@F41-22', '@F41-23', '@F41-24', '@F41-25',`.

- [ ] **Step 3: Step definitions**

Create `test/desktop/steps/spaces-redesign.steps.js`:

```js
'use strict';
// F41 Blanc Spaces redesign: the Island's space mark, the Spaces menu opened
// from it, live editing, Undo, keyboard use, Reduce Motion and the Quick
// Switcher. Spaces and Patron state are reset between scenarios by the
// global Before hook.
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { overlayPage } = require('../support/overlay');
const { openOverlaySurface, waitForValue } = require('../support/poll');

async function saveSpace(world, name, identity) {
  const saved = await world.call('workspaceAction', 'save', name);
  assert.equal(saved.ok, true, `save ${name}: ${JSON.stringify(saved)}`);
  if (identity) assert.equal((await world.call('workspaceAction', 'update', saved.workspace.id, identity)).ok, true);
  return saved.workspace.id;
}
async function spaceByName(world, name) {
  const data = await world.call('workspaceAction', 'list');
  return data.items.find((w) => w.name === name);
}
const mark = (world, predicate, label) => waitForValue(() => world.call('spaceMarkState'), (m) => !!m && predicate(m), label);
async function menu() {
  const page = await overlayPage();
  await page.waitForSelector('#workspaceSwitcher', { state: 'visible' });
  return page;
}

Given('a space named {string} in this window, colored {string} with the symbol {string}', async function (name, color, symbol) {
  this.spaceIds = { [name]: await saveSpace(this, name, { color, symbol }) };
});
Given('spaces named {string} and {string}, with this window in {string}', async function (first, second, current) {
  assert.equal(current, first, 'the scenario saves the current window first');
  this.spaceIds = { [first]: await saveSpace(this, first) };
  const other = await this.call('openNewWindow');
  const saved = await this.call('workspaceActionInWindow', other, 'save', second);
  assert.equal(saved.ok, true);
  this.spaceIds[second] = saved.workspace.id;
  await this.call('closeWindowRuntime', other); // "Reading" is saved but open nowhere
  await waitForValue(async () => (await this.call('workspaceAction', 'list')).items.length, (n) => n === 2, 'both spaces listed');
});
Given('a space named {string} saved from another window', async function (name) {
  const other = await this.call('openNewWindow');
  assert.equal((await this.call('workspaceActionInWindow', other, 'save', name)).ok, true);
  this.otherWindow = other;
});
Given('a page open in a window that is in no space, and a saved space named {string}', async function (name) {
  const other = await this.call('openNewWindow');
  assert.equal((await this.call('workspaceActionInWindow', other, 'save', name)).ok, true);
  await this.call('closeWindowRuntime', other);
  const tab = await this.call('openTab', this.fixtureUrl('workspace-draft'));
  await this.waitForState((s) => s.tabs.some((t) => t.id === tab && !t.isLoading));
});
Given('Reduce Motion is on', async function () {
  assert.equal(await this.call('emulateReducedMotion', true), true);
  this.after = async () => { await this.call('emulateReducedMotion', false); };
});

When('I open the Spaces menu from the space mark', async function () {
  await this.call('clickPillSpace');
});
When('I edit {string} to the color {string} and the symbol {string}', async function (name, color, symbol) {
  const page = await menu(); const space = await spaceByName(this, name);
  await page.click(`[data-focus-key="edit:${space.id}"]`);
  await page.click(`[data-focus-key="color:${color}"]`);
  await page.click(`[data-focus-key="symbol:${symbol}"]`);
});
When('I give {string} the custom color {string}', async function (name, hex) {
  const page = await menu(); const space = await spaceByName(this, name);
  await page.click(`[data-focus-key="edit:${space.id}"]`);
  await page.click('[data-focus-key="color:custom"]');
  await page.fill('.space-picker-hex', hex);
});
When('I delete {string} from its editor', async function (name) {
  const page = await menu(); const space = await spaceByName(this, name);
  await page.click(`[data-focus-key="edit:${space.id}"]`);
  await page.click('[data-focus-key="delete"]');
  await page.waitForSelector('[data-focus-key="undo"]');
});
When('I undo the delete', async function () {
  const page = await menu();
  await page.click('[data-focus-key="undo"]');
});
When('I move {string} down with Option or Alt and the down arrow', async function (name) {
  const page = await menu(); const space = await spaceByName(this, name);
  await page.focus(`[data-focus-key="open:${space.id}"]`);
  assert.equal(await this.call('pressOverlayKey', 'Down', ['alt']), true);
});
When('I press Escape in the Spaces menu', async function () {
  assert.equal(await this.call('pressOverlayKey', 'Escape'), true);
});
When('I switch to {string} from the Spaces menu', async function (name) {
  await this.call('clickPillSpace');
  const page = await menu(); const space = await spaceByName(this, name);
  await page.click(`[data-focus-key="open:${space.id}"]`);
});
When('I pick {string} in the Spaces menu', async function (name) {
  const page = await menu(); const space = await spaceByName(this, name);
  await page.click(`[data-focus-key="open:${space.id}"]`);
});
When('I type {string} into the panel and pick the space result', async function (text) {
  await openOverlaySurface(this, 'openPanel', 'panel');
  const page = await overlayPage();
  await page.fill('#addressInput', text);
  const row = page.locator('.island-row', { has: page.locator('.row-space-tile') }).first();
  await row.waitFor();
  await row.click();
});

Then('the Island shows no space mark', async function () {
  await mark(this, (m) => m.hidden === true && m.state === 'none', 'no space mark');
});
Then('the Island shows the quiet Spaces mark', async function () {
  const m = await mark(this, (s) => s.hidden === false && s.state === 'neutral', 'the neutral mark');
  assert.equal(m.name, '');
  assert.equal(m.label, 'Spaces');
});
Then('the Island\'s space mark reads {string} in {string} with the symbol {string}', async function (name, ink, symbol) {
  await mark(this, (m) => m.state === 'space' && m.name === name && m.ink === ink && m.symbol === symbol, `the mark for ${name} in ${ink} with ${symbol}`);
});
Then('the Island\'s space mark reads {string}', async function (name) {
  const m = await mark(this, (s) => s.state === 'space' && s.name === name, `the mark for ${name}`);
  assert.equal(m.label, `Space: ${name}`);
});
Then('the Spaces menu opens directly below the mark', async function () {
  await waitForValue(() => this.call('overlayRendererMode'), (m) => m === 'spaces', 'the spaces overlay mode');
  const m = await this.call('spaceMarkState');
  assert.equal(m.expanded, 'true');
  const bounds = await this.call('overlayBounds');
  assert.ok(Math.abs(bounds.x - Math.max(0, Math.round(m.left - 16))) <= 1, `menu left edge under the mark: ${JSON.stringify({ bounds, m })}`);
  assert.ok(bounds.y < m.bottom + 6, 'the menu starts just below the mark');
});
Then('the Spaces menu is closed', async function () {
  await waitForValue(() => this.call('overlayRendererMode'), (m) => m == null, 'the overlay to close');
  assert.equal((await this.call('spaceMarkState')).expanded, 'false');
});
Then('the Spaces menu is closed and the space mark has focus', async function () {
  await waitForValue(() => this.call('overlayRendererMode'), (m) => m == null, 'the overlay to close');
  await waitForValue(() => this.call('chromeFocusedId'), (id) => id === 'pillSpace', 'focus to return to the space mark');
});
Then('the space {string} is saved with the color {string}', async function (name, color) {
  await waitForValue(() => spaceByName(this, name), (w) => w?.color === color, `${name} saved as ${color}`);
});
Then('the editor says the color is shown as {string} in light mode', async function (hex) {
  const page = await menu();
  await page.waitForFunction((value) => document.querySelector('.ws-guard')?.textContent.includes(`shown as ${value} in light mode`), hex);
});
Then('this window is in the space {string} again', async function (name) {
  await waitForValue(() => spaceByName(this, name), (w) => w?.active === true, `${name} bound again`);
  await mark(this, (m) => m.state === 'space' && m.name === name, 'the mark again');
});
Then('the spaces are listed as {string} then {string}', async function (first, second) {
  await waitForValue(async () => (await this.call('workspaceAction', 'list')).items.map((w) => w.name).join(','), (v) => v === `${first},${second}`, 'the new order');
});
Then('the space mark changes to {string} without sliding', async function (name) {
  const m = await mark(this, (s) => s.name === name && s.animatedProperties.length > 0, `the switch animation to ${name}`);
  assert.equal(m.animatedProperties.includes('transform'), false, `only opacity animates: ${m.animatedProperties}`);
});
Then('the switch prompt offers save, new window, close, then cancel', async function () {
  const page = await menu();
  await page.waitForSelector('.ws-decision');
  const order = await page.$$eval('.ws-decision-actions button', (buttons) => buttons.map((b) => b.dataset.focusKey));
  assert.deepEqual(order, ['save-first', 'new-window', 'close-and-switch', 'cancel']);
});
```

Notes for the implementer: in `@F41-23` the switch animation lasts 200ms, so the poll must read `animatedProperties` while it runs; if the CI renderer is slow to paint, assert on the first non-empty read as written rather than adding a sleep. If the World has no `after` hook convention, reset Reduce Motion in an `After({ tags: '@F41-23' })` instead.

- [ ] **Step 4: Run them**

```bash
npm run audit-inventory:write
npm run test:acceptance:dry
npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@workspace' --retry 0
```

Expected: every `@workspace` scenario passes, including `@F41-16`…`@F41-25`. Prove each new assertion can fail once (positive control): temporarily change `'#6d6400'` to `'#000000'` in `@F41-20`, run that scenario, see it fail, and revert.

- [ ] **Step 5: Commit**

```bash
git add spec/acceptance/F41-named-workspaces.feature test/desktop src/main/test-hook.js security/audit-surface-inventory.json
git commit -m "Cover the space mark and the Spaces menu in desktop acceptance

Ten scenarios: mark states, opening below the mark, live edits, a custom
colour's readable ink, Undo rebinding, keyboard use, Reduce Motion, the
Quick Switcher and the switch prompt's order.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Retire the old strings, update the records, run the gate, capture the proof

**Files:**
- Modify: `copy/messages/{en,de,es,fr,it,pt-BR}.json` (17 retired keys), regenerate catalogs
- Modify: `spec/features.md` (F41), `spec/parity-matrix.md` (F41 row), `CLAUDE.md`, `AGENTS.md`
- Modify: the next release's draft notes in `docs/press/release-notes/`

**Interfaces:** none.

- [ ] **Step 1: Remove the strings nothing uses any more**

```bash
RETIRED="ws.newEmpty ws.saveAs ws.editor.rename ws.editor.create ws.editor.saveAs ws.editor.save ws.decision.saveFirst ws.manage.label ws.manage.back ws.manage.rename ws.manage.delete ws.manage.moveUp ws.manage.moveDown ws.delete.confirm ws.list.undo ws.list.empty workspaceMenu.rename"
for k in $RETIRED; do git grep -n "['\"]$k['\"]" -- src test ':!src/renderer/pages/strings.*.js' && echo "STILL USED: $k"; done
node - $RETIRED <<'EOF'
const fs = require('fs');
const keys = process.argv.slice(2);
for (const l of ['en', 'de', 'es', 'fr', 'it', 'pt-BR']) {
  const p = `copy/messages/${l}.json`;
  const o = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const k of keys) { if (!(k in o)) throw new Error(`${l}: ${k} missing`); delete o[k]; }
  fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
}
EOF
npm run copy:build && npm run copy:check
```

Expected: the loop prints nothing (no `STILL USED`), and `copy:check` passes. If a key is still used, stop and remove that use first; do not delete a referenced key.

- [ ] **Step 2: Records**

In `spec/features.md`, in the `## F41 — Blanc Spaces (desktop)` entry (added by PR 1), insert after its first bullet:

```markdown
- Each space has a **colour** (any `#rrggbb`; eight presets) and one of
  sixteen **symbols**. Missing or invalid values get the first unused preset
  and symbol in list order, written once on load. The drawn ink is derived so
  the symbol and name reach 4.5:1 against every surface they sit on and their
  own wash, in light, dark and private; the stored hex is never changed.
- The Island shows the current space as a **mark** at its leading edge
  (symbol and name on its colour); a window in no space shows a quiet grey
  mark once any space exists; before the first space nothing is shown. The
  mark opens the **Spaces menu** directly below it; the ⌘L footer's Spaces
  button opens the same menu, and the Quick Switcher matches space names.
- The menu edits in place (name validated as you type, preset and custom
  colours, symbols; changes apply live), deletes immediately with **Undo**
  (which also puts the window back in the space), reorders by drag or
  Option/Alt+↑/↓, and asks before a switch would close unsaved tabs, leading
  with saving them. Motion follows Reduce Motion (cross-fade only).
```

and change its Acceptance line to mention `test/desktop/steps/spaces-redesign.steps.js`.

In `spec/parity-matrix.md`, change the F41 row's contract text to `Desktop only. Named, profile-scoped sets of a window's tabs and groups that swap in place and autosave; each has a colour and symbol shown as the Island's space mark; free for everyone; at most 25 per profile; never synced.`

In `CLAUDE.md` and `AGENTS.md`, in the paragraph that begins `**The island's expanded states live in a separate always-on-top overlay`, after the `'shield'` sentence add: `` `'spaces'` — the Spaces menu alone, opened from the Island's space mark (the pill's leading chip showing the current space's symbol and name; `calculateSpacesBounds` sizes the view around the 300px menu with room for its shadow and opening scale; dismissed like the shield popover, focus returning to the mark).`` In the Blanc Patron paragraph (updated by PR 1) add: `A space's colour and symbol come from the pure `src/renderer/space-identity.js`, shared by main, the strip and the overlay; its readability guard derives the drawn ink, never the stored hex.`

- [ ] **Step 3: The release note**

In the next unreleased version's draft notes (`docs/press/release-notes/v<next>.md`; create it from the latest file's layout if none exists), add under `## Added` (create the heading if needed):

```markdown
- **Blanc Spaces, redesigned.** Each space now has a colour and a symbol,
  shown at the start of the Island; click it to switch, edit, reorder or
  delete (with Undo). Pick any colour — Blanc keeps the symbol readable in
  light and dark mode.
```

The owner approves release-note wording at release time.

- [ ] **Step 4: The full gate**

```bash
npm run lint
npm run test:unit
npm run substrate:check
npm run test:acceptance:dry
npm run test:workspaces:desktop
npm run test:i18n:desktop
```

Expected: all pass.

- [ ] **Step 5: Proof in the running app**

Restart the dev app with a scratch profile (`npm start -- --user-data-dir=$(mktemp -d)`), create three spaces with different colours and symbols, and capture full-resolution crops, before (current `main`) over after, of:

1. the Island with the mark, in light and dark;
2. the Spaces menu opened from the mark;
3. the editor with the custom picker open and `#F5E663` typed (showing the readability note);
4. the switch prompt;
5. the menu above the ⌘L footer button;
6. the Island under `BLANC_SPACE_TINT=island` and `BLANC_SPACE_TINT=frame` (dev comparison for spec D2).

Attach them to the PR description. Verify the hover and selected row pair in the menu: the two filled rows must not touch.

- [ ] **Step 6: Commit**

```bash
git add copy src/renderer/pages/strings.*.js src/main/i18n-locales.json spec CLAUDE.md AGENTS.md docs/press/release-notes
git commit -m "Retire the old Spaces strings and record the redesign

Remove the 17 strings the rebuilt menu no longer uses, describe identity,
the mark and the menu in F41 and the guides, and draft the release note.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

After merge, offer a Design System sync of the mark and the menu (it needs the owner's explicit approval before any push).
