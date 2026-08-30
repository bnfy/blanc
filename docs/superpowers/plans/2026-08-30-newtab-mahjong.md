# New-Tab Mahjong Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt-in mahjong solitaire at `blanc://mahjong/`, reached from a quiet `mahjong` link in the new-tab footer, gated by a new synced `newtabMahjong` setting (default off).

**Architecture:** A pure, DOM-free engine (`mahjong-engine.js`: turtle layout, winnable-by-construction deals, freeness/match/undo state) + a renderer (`mahjong.js`) that draws ink-on-paper SVG tiles and owns timer/localStorage-best. Served as a normal tab page (never the utility sheet). Spec: `docs/superpowers/specs/2026-08-30-newtab-mahjong-design.md`.

**Tech Stack:** Vanilla JS flat files in `src/renderer/pages/`, `node --test` unit tests, existing `pages.css` tokens.

## Global Constraints

- Editing chrome/internal-page HTML/CSS/JS requires relaunching `npm start` — `Cmd+R` reloads only the active tab's web content. Relaunch the dev app after UI changes and leave it open at the end (user preference).
- `blanc://` serves only flat files directly in `src/renderer/pages/` — no subdirectories.
- Every internal page carries its own CSP `<meta>`; the mahjong page uses exactly `default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:;`.
- `mahjong` must NEVER be added to `UTILITY_PAGES` (it would route into the utility sheet).
- No new CSS custom-property token values — use the existing `pages.css` tokens (`--bg`, `--surface`, `--surface-raised`, `--border`, `--text`, `--text-dim`, `--accent`, `--accent-dim`, `--font-ui`, `--font-mono`, `--radius`); a token *value* change would trip `tokens:check`.
- Never hand-edit `settings-schema/generated/*` — regenerate with `npm run settings:build`.
- Schema (`settings-schema/schema.json` + `build.mjs`) changes land in the SAME commit as the `settings.js` key, or `substrate:check` fails CI.
- User-visible copy is quiet/lowercase where the surrounding page is (footer link is `mahjong`); Settings label is sentence case like its neighbors.
- The game makes no network requests, no IPC, no `JsonStore` writes; its only persistence is `localStorage` (`blanc://mahjong` origin).
- Timer must compute elapsed time from timestamps (`Date.now()` deltas), never by counting interval ticks — background tabs throttle timers.
- Unit tests run with `npm run test:unit` (`node --test test/unit/`). A single file: `node --test test/unit/<file>`.

---

### Task 1: `newtabMahjong` settings key (settings.js + schema + generators)

**Files:**
- Modify: `src/main/settings.js` (DEFAULTS, `SYNCED_KEYS`, `getSettings()` read-coercion, `sanitize()` whitelist)
- Modify: `settings-schema/schema.json` (defaults + settings entry)
- Modify: `settings-schema/build.mjs` (Swift/Kotlin emitters, `parseSettingsJs`, `check()`)
- Modify (generated, via build): `settings-schema/generated/BlancSettings.swift`, `settings-schema/generated/BlancSettings.kt`
- Test: `test/unit/newtab-mahjong-settings.test.js`

**Interfaces:**
- Produces: `getSettings().newtabMahjong: boolean` (default `false`), accepted by `setSettings({ newtabMahjong: boolean })`, present in `exportForSync().values` and adoptable via `mergeFromSync`. Tasks 8 reads `current.newtabMahjong` in `main.js`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/newtab-mahjong-settings.test.js`, modeled on `test/unit/newtab-layout-settings.test.js` (same electron `require.cache` stub + temp-userData loader — copy that file's header verbatim: the `electronId` stub block, `loadSettings()`, and `test.after` cleanup):

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    app: {
      getPath: () => activeUserData,
      on: () => {},
    },
  },
};

function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  return require('../../src/main/settings');
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

test('newtabMahjong defaults off, validates as boolean, and syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-newtab-mahjong-'));
  t.after(async () => {
    // JsonStore writes on a 250 ms debounce; let it finish before removing
    // the isolated directory so a passing test does not emit an ENOENT warning.
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(userData, { recursive: true, force: true });
  });
  const settings = loadSettings(userData);

  assert.equal(settings.getSettings().newtabMahjong, false);

  assert.equal(settings.setSettings({ newtabMahjong: true }).newtabMahjong, true);
  // Non-boolean writes leave the stored choice alone.
  assert.equal(settings.setSettings({ newtabMahjong: 'yes' }).newtabMahjong, true);
  assert.equal(settings.setSettings({ newtabMahjong: 1 }).newtabMahjong, true);
  assert.equal(settings.setSettings({ newtabMahjong: null }).newtabMahjong, true);
  assert.equal(settings.setSettings({ newtabMahjong: false }).newtabMahjong, false);

  // Synced: present in the export, adoptable from a newer remote write.
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'newtabMahjong'),
    true
  );
  settings.mergeFromSync({
    values: { newtabMahjong: false },
    meta: { newtabMahjong: Date.now() + 60_000 },
  });
  assert.equal(settings.getSettings().newtabMahjong, false);
  // A tampered remote value routes through sanitize() and is dropped.
  settings.mergeFromSync({
    values: { newtabMahjong: 'evil' },
    meta: { newtabMahjong: Date.now() + 120_000 },
  });
  assert.equal(settings.getSettings().newtabMahjong, false);
});

test('a corrupted stored newtabMahjong reads back as the default', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-newtab-mahjong-corrupt-'));
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(userData, { recursive: true, force: true });
  });
  fs.writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify({ newtabMahjong: 'always' })
  );
  const settings = loadSettings(userData);
  assert.equal(settings.getSettings().newtabMahjong, false);
});

const settingsSchema = require('../../settings-schema/schema.json');

test('newtabMahjong reaches the schema and both generated mobile artifacts', () => {
  assert.equal(settingsSchema.defaults.newtabMahjong, false);
  assert.equal(settingsSchema.internalDefaults.includes('newtabMahjong'), false);
  assert.ok(settingsSchema.settings.some((s) => s.key === 'newtabMahjong'));

  const generated = (name) =>
    fs.readFileSync(path.join(__dirname, '../../settings-schema/generated/', name), 'utf8');
  assert.match(generated('BlancSettings.swift'), /public static let newtabMahjong: Bool = false/);
  assert.match(generated('BlancSettings.kt'), /const val newtabMahjong = false/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/newtab-mahjong-settings.test.js`
Expected: FAIL — `getSettings().newtabMahjong` is `undefined`, schema assertions fail.

- [ ] **Step 3: Implement in `src/main/settings.js`**

Four line-anchored edits (each on its own line — the schema drift check parses this file with line-anchored regexes):

1. In `DEFAULTS`, after the `newtabLayout: 'ledger',` entry:
```js
  // Opt-in mahjong solitaire link on the new-tab footer (blanc://mahjong).
  // Synced like newtabLayout — it describes the browser you want.
  newtabMahjong: false,
```
2. In `SYNCED_KEYS`, append `'newtabMahjong'`:
```js
const SYNCED_KEYS = ['searchEngine', 'adblockEnabled', 'homePage', 'theme', 'adblockExceptions', 'newtabLayout', 'newtabMahjong'];
```
3. In `getSettings()`, next to the other boolean read-coercions:
```js
  if (typeof data.newtabMahjong !== 'boolean') data.newtabMahjong = DEFAULTS.newtabMahjong;
```
4. In `sanitize()`, next to the `newtabLayout` line:
```js
  if (typeof partial.newtabMahjong === 'boolean') clean.newtabMahjong = partial.newtabMahjong;
```

- [ ] **Step 4: Implement in `settings-schema/schema.json`**

In `"defaults"`, after `"newtabLayout": "ledger",`:
```json
    "newtabMahjong": false,
```
In the `"settings"` array, after the `newtabLayout` entry:
```json
    { "key": "newtabMahjong", "type": "boolean", "default": false, "note": "opt-in mahjong solitaire link on the new-tab page; synced" },
```

- [ ] **Step 5: Implement in `settings-schema/build.mjs`**

- In `genSwift()`, after the `newtabLayout` default line:
```js
  out += `    public static let newtabMahjong: Bool = ${spec.defaults.newtabMahjong}\n`;
```
- In `genKotlin()`, after the `newtabLayout` default line:
```js
  out += `    const val newtabMahjong = ${spec.defaults.newtabMahjong}\n`;
```
- In `parseSettingsJs()`'s defaults object, next to `usagePing`:
```js
    newtabMahjong: s(/^\s*newtabMahjong:\s*(true|false)/m),
```
- In `check()`, next to the `eq('usagePing', ...)` line:
```js
  eq('newtabMahjong', jd.newtabMahjong, String(d.newtabMahjong));
```

- [ ] **Step 6: Regenerate artifacts and verify no drift**

Run: `npm run settings:build && node settings-schema/build.mjs --check`
Expected: both generated files updated; check exits 0.

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --test test/unit/newtab-mahjong-settings.test.js && node --test test/unit/newtab-layout-settings.test.js && npm run substrate:check`
Expected: PASS (including the pre-existing layout test — proves the parser edits didn't break it).

- [ ] **Step 8: Commit**

```bash
git add src/main/settings.js settings-schema/ test/unit/newtab-mahjong-settings.test.js
git commit -m "feat(settings): add synced newtabMahjong opt-in (default off)"
```

---

### Task 2: `KNOWN_PAGES` seam + `mahjong` routing

**Files:**
- Modify: `src/main/utility-pages.js` (becomes the single home of internal-page names)
- Modify: `src/main/pages.js` (drop its local `KNOWN_PAGES`, import instead)
- Test: `test/unit/utility-pages.test.js` (extend)

**Interfaces:**
- Produces: `utility-pages.js` exports `KNOWN_PAGES` (a `Set` including `'mahjong'`) alongside the existing `UTILITY_PAGES` and `isUtilityUrl`. `pages.js` serves `blanc://mahjong/` → `mahjong.html` (file created in Task 6; a 404-on-missing-file until then is fine — routing is what this task delivers).

- [ ] **Step 1: Write the failing test**

Append to `test/unit/utility-pages.test.js` (it already requires `../../src/main/utility-pages`; extend the destructure to include `KNOWN_PAGES`):

```js
test('mahjong is a known page but never a utility page', () => {
  assert.ok(KNOWN_PAGES.has('mahjong'));
  assert.equal(UTILITY_PAGES.has('mahjong'), false);
  assert.equal(isUtilityUrl('blanc://mahjong/'), false);
  assert.equal(isUtilityUrl('blanc://mahjong/?private=1'), false);
  // Every utility page is also a known page — the two sets must not drift.
  for (const page of UTILITY_PAGES) assert.ok(KNOWN_PAGES.has(page));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/utility-pages.test.js`
Expected: FAIL — `KNOWN_PAGES` is not exported (destructures to `undefined`).

- [ ] **Step 3: Implement**

In `src/main/utility-pages.js`, above `UTILITY_PAGES`:
```js
// Every hostname blanc:// serves (pages.js 404s anything else). The five
// UTILITY_PAGES below are the subset that opens in the utility sheet; the
// rest (newtab, error, auth, mahjong) open as ordinary tab pages.
const KNOWN_PAGES = new Set(['newtab', 'bookmarks', 'history', 'downloads', 'settings', 'error', 'auth', 'shortcuts', 'mahjong']);
```
and export it: `module.exports = { KNOWN_PAGES, UTILITY_PAGES, isUtilityUrl };`

In `src/main/pages.js`: delete the local `const KNOWN_PAGES = new Set([...]);` (line ~27) and change the existing import to `const { UTILITY_PAGES, KNOWN_PAGES } = require('./utility-pages');`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/utility-pages.test.js && node --test test/unit/utility-sheet-navigation.test.js && node --test test/unit/pages-ipc-trust.test.js`
Expected: PASS (neighbors prove the import shuffle broke nothing).

- [ ] **Step 5: Commit**

```bash
git add src/main/utility-pages.js src/main/pages.js test/unit/utility-pages.test.js
git commit -m "feat(pages): route blanc://mahjong as a normal tab page"
```

---

### Task 3: Engine — turtle layout, tile set, RNG, freeness

**Files:**
- Create: `src/renderer/pages/mahjong-engine.js`
- Test: `test/unit/mahjong-engine.test.js`

**Interfaces:**
- Produces (namespace `MahjongEngine`, `module.exports` under Node, `window.MahjongEngine` in the page):
  - `TURTLE_LAYOUT: Array<{x:number,y:number,z:number}>` — 144 positions, half-tile units (a tile spans 2×2 in x/y)
  - `createRng(seed:number): () => number` — deterministic, [0,1)
  - `matchKey(kind:string): string` — `'flower-3'`→`'flower'`, `'season-1'`→`'season'`, else identity
  - `isFreeAt(layout, i:number, present:(k:number)=>boolean): boolean`
- Tile kind strings (used by every later task): `dot-1`…`dot-9`, `bam-1`…`bam-9`, `chr-1`…`chr-9`, `wind-e|s|w|n`, `drg-c|f|p`, `flower-1`…`flower-4`, `season-1`…`season-4`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/mahjong-engine.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../../src/renderer/pages/mahjong-engine');

test('turtle layout: 144 positions, unique, well-formed', () => {
  assert.equal(E.TURTLE_LAYOUT.length, 144);
  const seen = new Set(E.TURTLE_LAYOUT.map((p) => `${p.x},${p.y},${p.z}`));
  assert.equal(seen.size, 144);
  const perLayer = [0, 0, 0, 0, 0];
  for (const p of E.TURTLE_LAYOUT) {
    assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y) && Number.isInteger(p.z));
    perLayer[p.z]++;
  }
  assert.deepEqual(perLayer, [87, 36, 16, 4, 1]);
  // No two tiles on the same layer overlap (tiles are 2x2 in half-units).
  for (let i = 0; i < 144; i++) for (let j = i + 1; j < 144; j++) {
    const a = E.TURTLE_LAYOUT[i], b = E.TURTLE_LAYOUT[j];
    if (a.z !== b.z) continue;
    assert.ok(Math.abs(a.x - b.x) >= 2 || Math.abs(a.y - b.y) >= 2,
      `tiles ${i} and ${j} overlap`);
  }
});

test('rng is deterministic and in [0,1)', () => {
  const a = E.createRng(42), b = E.createRng(42), c = E.createRng(43);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, [c(), c(), c()]);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('matchKey: flowers and seasons are class-matched, all else identity', () => {
  assert.equal(E.matchKey('flower-1'), 'flower');
  assert.equal(E.matchKey('flower-4'), 'flower');
  assert.equal(E.matchKey('season-2'), 'season');
  assert.equal(E.matchKey('dot-5'), 'dot-5');
  assert.equal(E.matchKey('wind-e'), 'wind-e');
  assert.equal(E.matchKey('drg-p'), 'drg-p');
});

test('freeness: covered tiles and doubly-flanked tiles are blocked', () => {
  const L = E.TURTLE_LAYOUT;
  const all = () => true;
  // The apex tile (z=4) is free on a full board.
  const apex = L.findIndex((p) => p.z === 4);
  assert.ok(E.isFreeAt(L, apex, all));
  // The far-left odd tile (x=0) is free on a full board.
  const farLeft = L.findIndex((p) => p.x === 0);
  assert.ok(E.isFreeAt(L, farLeft, all));
  // The very last tile of the far-right pair (x=28) is free; its inner
  // neighbor (x=26) is flanked on both sides -> blocked.
  const outerRight = L.findIndex((p) => p.x === 28);
  const innerRight = L.findIndex((p) => p.x === 26);
  assert.ok(E.isFreeAt(L, outerRight, all));
  assert.equal(E.isFreeAt(L, innerRight, all), false);
  // A z=0 tile under the z=1 block (col 4..9, row 1..6) is covered -> blocked,
  // and becomes free-able once the covering tile is gone and a side opens.
  const covered = L.findIndex((p) => p.z === 0 && p.x === 8 && p.y === 2);
  assert.equal(E.isFreeAt(L, covered, all), false);
  // Row 0 end tile (x=24, y=0): right side open on a full board -> free.
  const rowEnd = L.findIndex((p) => p.z === 0 && p.x === 24 && p.y === 0);
  assert.ok(E.isFreeAt(L, rowEnd, all));
  // ...and blocked once we pretend a tile sits at x=26 on the same row? No
  // such position exists on row 0, so instead: an interior row-0 tile is
  // flanked left+right and uncovered -> still blocked.
  const interior = L.findIndex((p) => p.z === 0 && p.x === 12 && p.y === 0);
  assert.equal(E.isFreeAt(L, interior, all), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/mahjong-engine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/renderer/pages/mahjong-engine.js`**

```js
// Pure mahjong-solitaire logic: the turtle position table, seeded RNG,
// freeness, winnable deal generation, and the game-state machine. No DOM,
// no require('electron') — unit-tested directly under node --test and
// loaded in blanc://mahjong via a plain <script> tag (window.MahjongEngine).
(() => {
  'use strict';

  // Positions in half-tile units: a tile occupies [x, x+2) x [y, y+2) on
  // layer z. Classic 144-tile turtle: 87 + 36 + 16 + 4 + 1.
  function buildTurtleLayout() {
    const p = [];
    // Layer 0: eight rows of whole-tile columns (col -> x = col * 2).
    const rows = [[1, 12], [3, 10], [2, 11], [1, 12], [1, 12], [2, 11], [3, 10], [1, 12]];
    rows.forEach(([from, to], row) => {
      for (let col = from; col <= to; col++) p.push({ x: col * 2, y: row * 2, z: 0 });
    });
    // The three half-row tiles: far left, and the two on the far right.
    p.push({ x: 0, y: 7, z: 0 }, { x: 26, y: 7, z: 0 }, { x: 28, y: 7, z: 0 });
    for (let col = 4; col <= 9; col++) for (let row = 1; row <= 6; row++) p.push({ x: col * 2, y: row * 2, z: 1 });
    for (let col = 5; col <= 8; col++) for (let row = 2; row <= 5; row++) p.push({ x: col * 2, y: row * 2, z: 2 });
    for (let col = 6; col <= 7; col++) for (let row = 3; row <= 4; row++) p.push({ x: col * 2, y: row * 2, z: 3 });
    p.push({ x: 13, y: 7, z: 4 });
    return p;
  }
  const TURTLE_LAYOUT = buildTurtleLayout();

  // mulberry32 — small, deterministic, good enough for shuffling.
  function createRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function matchKey(kind) {
    if (kind.startsWith('flower-')) return 'flower';
    if (kind.startsWith('season-')) return 'season';
    return kind;
  }

  // A tile is free iff no present tile overlaps it on the layer above and at
  // least one of its sides is fully open. `present(k)` says whether tile k is
  // still on the board (callers decide: full board, partial deal, live game).
  function isFreeAt(layout, i, present) {
    const p = layout[i];
    let leftOpen = true;
    let rightOpen = true;
    for (let k = 0; k < layout.length; k++) {
      if (k === i || !present(k)) continue;
      const q = layout[k];
      if (q.z === p.z + 1 && Math.abs(q.x - p.x) < 2 && Math.abs(q.y - p.y) < 2) return false;
      if (q.z === p.z && Math.abs(q.y - p.y) < 2) {
        if (q.x === p.x - 2) leftOpen = false;
        if (q.x === p.x + 2) rightOpen = false;
      }
    }
    return leftOpen || rightOpen;
  }

  const MahjongEngine = { TURTLE_LAYOUT, createRng, matchKey, isFreeAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = MahjongEngine;
  else window.MahjongEngine = MahjongEngine;
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/mahjong-engine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/mahjong-engine.js test/unit/mahjong-engine.test.js
git commit -m "feat(mahjong): engine layout, rng, freeness"
```

---

### Task 4: Engine — winnable deal generation

**Files:**
- Modify: `src/renderer/pages/mahjong-engine.js`
- Test: `test/unit/mahjong-engine.test.js` (extend)

**Interfaces:**
- Produces: `generateDeal(seed:number): { kinds: string[144], solution: Array<[number,number]> }` — `kinds[i]` is the tile at `TURTLE_LAYOUT[i]`; `solution` is 72 index-pairs in a playable removal order. Throws `Error('mahjong: deal generation failed')` only past a 1000-attempt defensive cap (never a non-constructive fallback).

- [ ] **Step 1: Write the failing test**

Append to `test/unit/mahjong-engine.test.js`:

```js
test('deals are winnable by construction across many seeds', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { kinds, solution } = E.generateDeal(seed);
    assert.equal(kinds.length, 144);
    assert.ok(kinds.every((k) => typeof k === 'string'));
    assert.equal(solution.length, 72);
    // Full standard set: 34 quads + 4 flowers + 4 seasons.
    const counts = new Map();
    for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const suit of ['dot', 'bam', 'chr']) for (let n = 1; n <= 9; n++) {
      assert.equal(counts.get(`${suit}-${n}`), 4);
    }
    for (const w of ['e', 's', 'w', 'n']) assert.equal(counts.get(`wind-${w}`), 4);
    for (const d of ['c', 'f', 'p']) assert.equal(counts.get(`drg-${d}`), 4);
    for (let n = 1; n <= 4; n++) {
      assert.equal(counts.get(`flower-${n}`), 1);
      assert.equal(counts.get(`season-${n}`), 1);
    }
    // Replay the recorded removal order as an actual game: every step must
    // remove a FREE, MATCHING pair, and the board must end empty.
    const removed = new Array(144).fill(false);
    const present = (k) => !removed[k];
    for (const [i, j] of solution) {
      assert.notEqual(i, j);
      assert.ok(!removed[i] && !removed[j]);
      assert.ok(E.isFreeAt(E.TURTLE_LAYOUT, i, present), `seed ${seed}: tile ${i} not free`);
      assert.ok(E.isFreeAt(E.TURTLE_LAYOUT, j, present), `seed ${seed}: tile ${j} not free`);
      assert.equal(E.matchKey(kinds[i]), E.matchKey(kinds[j]));
      removed[i] = removed[j] = true;
    }
    assert.ok(removed.every(Boolean));
  }
});

test('deals are deterministic per seed and differ across seeds', () => {
  assert.deepEqual(E.generateDeal(7).kinds, E.generateDeal(7).kinds);
  assert.notDeepEqual(E.generateDeal(7).kinds, E.generateDeal(8).kinds);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/mahjong-engine.test.js`
Expected: FAIL — `E.generateDeal` is not a function.

- [ ] **Step 3: Implement**

Inside the IIFE in `mahjong-engine.js`, before the exports:

```js
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 72 matching pairs covering the standard 144-tile set: two identical
  // pairs per quad, flowers paired with flowers, seasons with seasons.
  function shuffledPairs(rng) {
    const pairs = [];
    for (const suit of ['dot', 'bam', 'chr']) for (let n = 1; n <= 9; n++) {
      pairs.push([`${suit}-${n}`, `${suit}-${n}`], [`${suit}-${n}`, `${suit}-${n}`]);
    }
    for (const w of ['e', 's', 'w', 'n']) pairs.push([`wind-${w}`, `wind-${w}`], [`wind-${w}`, `wind-${w}`]);
    for (const d of ['c', 'f', 'p']) pairs.push([`drg-${d}`, `drg-${d}`], [`drg-${d}`, `drg-${d}`]);
    const flowers = shuffle(['flower-1', 'flower-2', 'flower-3', 'flower-4'], rng);
    pairs.push([flowers[0], flowers[1]], [flowers[2], flowers[3]]);
    const seasons = shuffle(['season-1', 'season-2', 'season-3', 'season-4'], rng);
    pairs.push([seasons[0], seasons[1]], [seasons[2], seasons[3]]);
    return shuffle(pairs, rng);
  }

  // Winnable by construction: simulate a winning game on the full layout.
  // Both picked positions are free at the same board state, so the recorded
  // order is itself a valid playthrough of the finished deal. A greedy pass
  // can dead-end (e.g. a lone surviving stack leaves only one free tile);
  // retry with the advancing RNG. The cap only turns a never-expected
  // infinite loop into an error — there is no non-constructive fallback.
  function generateDeal(seed) {
    const rng = createRng(seed);
    for (let attempt = 0; attempt < 1000; attempt++) {
      const kinds = new Array(TURTLE_LAYOUT.length).fill(null);
      const occupied = new Array(TURTLE_LAYOUT.length).fill(true);
      const present = (k) => occupied[k];
      const solution = [];
      let dead = false;
      for (const [a, b] of shuffledPairs(rng)) {
        const free = [];
        for (let i = 0; i < TURTLE_LAYOUT.length; i++) {
          if (occupied[i] && isFreeAt(TURTLE_LAYOUT, i, present)) free.push(i);
        }
        if (free.length < 2) { dead = true; break; }
        const i = free.splice(Math.floor(rng() * free.length), 1)[0];
        const j = free.splice(Math.floor(rng() * free.length), 1)[0];
        kinds[i] = a;
        kinds[j] = b;
        occupied[i] = occupied[j] = false;
        solution.push([i, j]);
      }
      if (!dead) return { kinds, solution };
    }
    throw new Error('mahjong: deal generation failed');
  }
```

Add `generateDeal` to the exported namespace object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/mahjong-engine.test.js`
Expected: PASS (50 seeds validated).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/mahjong-engine.js test/unit/mahjong-engine.test.js
git commit -m "feat(mahjong): winnable-by-construction deal generation"
```

---

### Task 5: Engine — game state (remove / undo / moves / win)

**Files:**
- Modify: `src/renderer/pages/mahjong-engine.js`
- Test: `test/unit/mahjong-engine.test.js` (extend)

**Interfaces:**
- Produces:
  - `createGame(seed:number): state` — `{ seed, kinds: string[144], removed: boolean[144], history: Array<[number,number]> }`
  - `isFree(state, i:number): boolean` — free AND not removed
  - `movesAvailable(state): Array<[number,number]>` — every currently matchable free pair (empty ⇒ stuck or won)
  - `removePair(state, i, j): boolean` — validates (distinct, present, free, matching); mutates + records history on success
  - `undo(state): boolean` — restores the last removed pair
  - `isWon(state): boolean`
- Task 7 consumes exactly these six functions.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/mahjong-engine.test.js`:

```js
test('game state: remove validates, undo round-trips, win detected', () => {
  const game = E.createGame(11);
  assert.equal(game.removed.filter(Boolean).length, 0);

  const moves = E.movesAvailable(game);
  assert.ok(moves.length > 0);
  const [i, j] = moves[0];

  // Invalid removals are rejected without mutating.
  assert.equal(E.removePair(game, i, i), false);
  const blocked = game.kinds.findIndex((_, k) => !E.isFree(game, k));
  assert.equal(E.removePair(game, i, blocked), false);
  assert.equal(game.history.length, 0);

  // A valid removal mutates and records.
  const before = JSON.parse(JSON.stringify({ removed: game.removed }));
  assert.equal(E.removePair(game, i, j), true);
  assert.ok(game.removed[i] && game.removed[j]);
  assert.equal(game.history.length, 1);

  // Undo restores exactly the prior state.
  assert.equal(E.undo(game), true);
  assert.deepEqual(game.removed, before.removed);
  assert.equal(game.history.length, 0);
  assert.equal(E.undo(game), false); // nothing left to undo

  // Playing the whole generated solution wins the game.
  const { solution } = E.generateDeal(11);
  for (const [a, b] of solution) assert.equal(E.removePair(game, a, b), true);
  assert.equal(E.isWon(game), true);
  assert.deepEqual(E.movesAvailable(game), []);

  // Undo after a win resumes play.
  assert.equal(E.undo(game), true);
  assert.equal(E.isWon(game), false);
  assert.equal(E.movesAvailable(game).length > 0, true);
});

test('movesAvailable pairs are all free and matching', () => {
  const game = E.createGame(23);
  for (const [i, j] of E.movesAvailable(game)) {
    assert.ok(E.isFree(game, i) && E.isFree(game, j));
    assert.equal(E.matchKey(game.kinds[i]), E.matchKey(game.kinds[j]));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/mahjong-engine.test.js`
Expected: FAIL — `E.createGame` is not a function.

- [ ] **Step 3: Implement**

Inside the IIFE, before the exports:

```js
  function createGame(seed) {
    const { kinds } = generateDeal(seed);
    return {
      seed,
      kinds,
      removed: new Array(TURTLE_LAYOUT.length).fill(false),
      history: [],
    };
  }

  function isFree(state, i) {
    if (state.removed[i]) return false;
    return isFreeAt(TURTLE_LAYOUT, i, (k) => !state.removed[k]);
  }

  function movesAvailable(state) {
    const freeByKey = new Map();
    for (let i = 0; i < TURTLE_LAYOUT.length; i++) {
      if (!isFree(state, i)) continue;
      const key = matchKey(state.kinds[i]);
      if (!freeByKey.has(key)) freeByKey.set(key, []);
      freeByKey.get(key).push(i);
    }
    const moves = [];
    for (const indices of freeByKey.values()) {
      for (let a = 0; a < indices.length; a++) {
        for (let b = a + 1; b < indices.length; b++) moves.push([indices[a], indices[b]]);
      }
    }
    return moves;
  }

  function removePair(state, i, j) {
    if (i === j) return false;
    if (!isFree(state, i) || !isFree(state, j)) return false;
    if (matchKey(state.kinds[i]) !== matchKey(state.kinds[j])) return false;
    state.removed[i] = state.removed[j] = true;
    state.history.push([i, j]);
    return true;
  }

  function undo(state) {
    const last = state.history.pop();
    if (!last) return false;
    state.removed[last[0]] = state.removed[last[1]] = false;
    return true;
  }

  function isWon(state) {
    return state.removed.every(Boolean);
  }
```

Add `createGame`, `isFree`, `movesAvailable`, `removePair`, `undo`, `isWon` to the exported namespace object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/mahjong-engine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/mahjong-engine.js test/unit/mahjong-engine.test.js
git commit -m "feat(mahjong): game-state machine (remove/undo/moves/win)"
```

---

### Task 6: Game page — shell, styles, tile faces, board render

**Files:**
- Create: `src/renderer/pages/mahjong.html`
- Create: `src/renderer/pages/mahjong.js`
- Modify: `src/renderer/pages/pages.css` (append a `/* ---- mahjong ---- */` section)

**Interfaces:**
- Consumes: `window.MahjongEngine` from Task 3–5 (`createGame`, `isFree`, plus `TURTLE_LAYOUT`).
- Produces: a rendered, scaled board at `blanc://mahjong/` with correct light/dark/private theming. Interactivity lands in Task 7 — this task's deliverable is visual (board renders, tiles legible, free/blocked distinguishable). `mahjong.js` exposes its state on a top-level `let game` and renders via `renderBoard()` / `refreshTiles()`, which Task 7 extends.

- [ ] **Step 1: Create `src/renderer/pages/mahjong.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:;" />
  <title>Mahjong</title>
  <link rel="icon" href="icon.svg" />
  <link rel="stylesheet" href="pages.css" />
</head>
<body class="mahjong-body">
  <main class="mj">
    <header class="mj-head">
      <a class="mj-title" href="blanc://newtab/">mahjong</a>
      <span class="mj-controls">
        <button id="mjUndo" type="button">undo</button><span class="mj-sep">·</span>
        <button id="mjHint" type="button">hint</button><span class="mj-sep">·</span>
        <button id="mjNew" type="button">new deal</button>
      </span>
      <span class="mj-meters">
        <span id="mjPairs" class="mj-pairs"></span>
        <span id="mjTimer" class="mj-timer">0:00</span>
      </span>
    </header>
    <div class="mj-board-wrap" id="mjBoardWrap">
      <div id="mjBoard" class="mj-board"></div>
      <div id="mjWin" class="mj-win" hidden>
        <svg class="mj-win-mark" viewBox="0 0 157.08 207.08" width="36" height="47" aria-hidden="true" fill="currentColor"><!-- Blanc mark: copy BOTH <path> elements verbatim from the first .ob-tile-blanc svg in newtab.html (the canonical mark — never redraw it) --></svg>
        <div id="mjWinTime" class="mj-win-time"></div>
        <div id="mjWinBest" class="mj-win-best"></div>
        <button id="mjWinNew" type="button">new deal</button>
      </div>
    </div>
    <div id="mjNotice" class="mj-notice" hidden>
      no moves left — <button id="mjNoticeUndo" type="button">undo</button> or
      <button id="mjNoticeNew" type="button">new deal</button>
    </div>
  </main>
  <script src="mahjong-engine.js"></script>
  <script src="mahjong.js"></script>
</body>
</html>
```

The Blanc mark paths are ~6 KB of path data — the HTML comment above marks where they go; paste both `<path>` elements exactly as they appear in `newtab.html` (starting `M126.07,9.65` and `M153.05,123.49`). Embedding the canonical asset verbatim is a hard rule (`design-asset-verification` memory).

- [ ] **Step 2: Append styles to `src/renderer/pages/pages.css`**

```css
/* ---- mahjong (blanc://mahjong — opt-in solitaire, see 2026-08-30 spec) ---- */
.mahjong-body {
  margin: 0;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
}
.mj { display: flex; flex-direction: column; height: 100%; }
.mj-head {
  display: flex;
  align-items: baseline;
  gap: 24px;
  padding: 18px 28px 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
}
.mj-title { color: var(--text); text-decoration: none; letter-spacing: 0.04em; }
.mj-title:hover { text-decoration: underline; }
.mj-controls button, .mj-notice button {
  all: unset;
  cursor: pointer;
  font: inherit;
  color: var(--text-dim);
}
.mj-controls button:hover, .mj-notice button:hover { color: var(--text); }
.mj-controls button:focus-visible, .mj-notice button:focus-visible,
.mj-tile:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
.mj-sep { margin: 0 8px; }
.mj-meters { margin-left: auto; display: flex; gap: 20px; }
.mj-timer { font-variant-numeric: tabular-nums; }
.mj-board-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 16px;
}
.mj-board { position: relative; flex: none; transform-origin: center center; }
.mj-tile {
  all: unset;
  position: absolute;
  box-sizing: border-box;
  display: block;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: -2px 2px 0 rgba(0, 0, 0, 0.10);
  cursor: pointer;
  color: var(--text);
}
.mj-tile svg { display: block; width: 100%; height: 100%; }
.mj-tile[data-blocked] { cursor: default; filter: brightness(0.92); }
@media (prefers-color-scheme: dark) {
  .mj-tile[data-blocked] { filter: brightness(0.78); }
}
:root[data-theme="private"] .mj-tile[data-blocked] { filter: brightness(0.78); }
.mj-tile.selected {
  border-color: var(--accent);
  background: var(--accent-dim);
}
.mj-tile.hinted { animation: mj-pulse 0.6s ease-in-out 2; }
@keyframes mj-pulse {
  50% { border-color: var(--accent); background: var(--accent-dim); }
}
.mj-tile.shake { animation: mj-shake 0.18s ease-in-out; }
@keyframes mj-shake {
  25% { translate: -2px 0; }
  75% { translate: 2px 0; }
}
.mj-notice {
  padding: 0 28px 18px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
  text-align: center;
}
.mj-win {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-dim);
}
.mj-win-mark { color: var(--text); margin-bottom: 8px; }
.mj-win-time { font-size: 20px; color: var(--text); font-variant-numeric: tabular-nums; }
.mj-win button {
  all: unset;
  cursor: pointer;
  font: inherit;
  color: var(--text);
  border-bottom: 1px solid var(--border);
}
.mj-win button:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
```

Dark/private need the stronger dim because `brightness(0.92)` is nearly invisible on dark surfaces. `nativeTheme.themeSource` drives `prefers-color-scheme` in Electron renderers, so the media query tracks the Settings theme correctly.

- [ ] **Step 3: Create `src/renderer/pages/mahjong.js` (render pass)**

```js
// blanc://mahjong — board rendering and (Task 7) interaction. All game rules
// live in MahjongEngine; this file owns DOM, timer, and the localStorage best.
'use strict';

const E = window.MahjongEngine;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Private tabs carry ?private=1 (same mechanism as newtab.js) — token
// selection only; the session itself needs no signal.
const isPrivate = new URLSearchParams(location.search).has('private');
if (isPrivate) document.documentElement.dataset.theme = 'private';

// Geometry: half-unit -> px. A tile is 2x2 half-units = 52x68 px; layers
// shift 4px up-right so stack depth reads without 3D theatrics.
const HU_X = 26;
const HU_Y = 34;
const LAYER_SHIFT = 4;
const EXTENT_X = Math.max(...E.TURTLE_LAYOUT.map((p) => p.x)) + 2;
const EXTENT_Y = Math.max(...E.TURTLE_LAYOUT.map((p) => p.y)) + 2;
const BOARD_W = EXTENT_X * HU_X + 5 * LAYER_SHIFT;
const BOARD_H = EXTENT_Y * HU_Y + 5 * LAYER_SHIFT;

const board = document.getElementById('mjBoard');
board.style.width = `${BOARD_W}px`;
board.style.height = `${BOARD_H}px`;

// --- tile faces -----------------------------------------------------------
// One-color ink marks: dots/bamboo pictorial, characters numeral + rule,
// winds/dragons mono letterforms, white dragon a hollow frame, flowers and
// seasons small marks with a corner numeral. All currentColor.

const NINE_GRID = { xs: [11, 22, 33], ys: [13, 30, 47] };
const SPOTS = {
  1: [[22, 30]],
  2: [[11, 13], [33, 47]],
  3: [[11, 13], [22, 30], [33, 47]],
  4: [[11, 13], [33, 13], [11, 47], [33, 47]],
  5: [[11, 13], [33, 13], [22, 30], [11, 47], [33, 47]],
  6: [[11, 13], [33, 13], [11, 30], [33, 30], [11, 47], [33, 47]],
  7: [[11, 13], [33, 13], [11, 30], [22, 30], [33, 30], [11, 47], [33, 47]],
  8: [[11, 9], [33, 9], [11, 23], [33, 23], [11, 37], [33, 37], [11, 51], [33, 51]],
  9: NINE_GRID.ys.flatMap((y) => NINE_GRID.xs.map((x) => [x, y])),
};

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function textEl(x, y, size, content) {
  const t = el('text', {
    x, y,
    'font-size': size,
    'text-anchor': 'middle',
    fill: 'currentColor',
  });
  t.textContent = content;
  return t;
}

function faceSVG(kind) {
  const svg = el('svg', { viewBox: '0 0 44 60', 'aria-hidden': 'true' });
  svg.classList.add('mj-face');
  const [family, id] = kind.split('-');
  if (family === 'dot') {
    for (const [x, y] of SPOTS[Number(id)]) svg.append(el('circle', { cx: x, cy: y, r: 4.5, fill: 'currentColor' }));
  } else if (family === 'bam') {
    for (const [x, y] of SPOTS[Number(id)]) {
      svg.append(el('rect', { x: x - 2, y: y - 7, width: 4, height: 14, rx: 2, fill: 'currentColor' }));
    }
  } else if (family === 'chr') {
    svg.append(textEl(22, 36, 26, id));
    svg.append(el('rect', { x: 12, y: 46, width: 20, height: 1.5, fill: 'currentColor' }));
  } else if (family === 'wind') {
    svg.append(textEl(22, 38, 24, id.toUpperCase()));
  } else if (family === 'drg') {
    if (id === 'p') svg.append(el('rect', { x: 13, y: 18, width: 18, height: 24, rx: 3, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
    else svg.append(textEl(22, 38, 24, id.toUpperCase()));
  } else if (family === 'flower') {
    for (const [dx, dy] of [[0, -8], [8, 0], [0, 8], [-8, 0]]) {
      svg.append(el('circle', { cx: 22 + dx, cy: 28 + dy, r: 4, fill: 'currentColor' }));
    }
    svg.append(textEl(36, 54, 10, id));
  } else if (family === 'season') {
    svg.append(el('path', { d: 'M22 16 L32 28 L22 40 L12 28 Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
    svg.append(textEl(36, 54, 10, id));
  }
  return svg;
}

// --- board ----------------------------------------------------------------

let game = null;
const tileButtons = [];

function renderBoard() {
  board.replaceChildren();
  tileButtons.length = 0;
  E.TURTLE_LAYOUT.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mj-tile';
    b.dataset.i = i;
    b.style.left = `${p.x * HU_X + p.z * LAYER_SHIFT}px`;
    b.style.top = `${(EXTENT_Y - 2 - p.y) * HU_Y - p.z * LAYER_SHIFT + 5 * LAYER_SHIFT}px`;
    b.style.width = `${2 * HU_X}px`;
    b.style.height = `${2 * HU_Y}px`;
    b.style.zIndex = p.z;
    b.append(faceSVG(game.kinds[i]));
    board.append(b);
    tileButtons.push(b);
  });
  refreshTiles();
}

function refreshTiles() {
  tileButtons.forEach((b, i) => {
    b.hidden = game.removed[i];
    if (E.isFree(game, i)) {
      delete b.dataset.blocked;
      b.removeAttribute('aria-disabled');
    } else {
      b.dataset.blocked = '';
      b.setAttribute('aria-disabled', 'true');
    }
  });
  document.getElementById('mjPairs').textContent =
    `${72 - game.history.length} pairs left`;
}

function fitBoard() {
  const wrap = document.getElementById('mjBoardWrap');
  const scale = Math.min(
    1.25,
    (wrap.clientWidth - 32) / BOARD_W,
    (wrap.clientHeight - 32) / BOARD_H
  );
  board.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitBoard);

function newGame() {
  game = E.createGame(Math.floor(Math.random() * 2 ** 31));
  renderBoard();
  fitBoard();
}

newGame();
```

Font for SVG text: add to the pages.css mahjong section:
```css
.mj-face text { font-family: var(--font-mono); }
```

- [ ] **Step 4: Visual verification (relaunch dev app)**

Kill any running dev instance, `npm start`, open `blanc://mahjong/` by typing it in the island. Verify: turtle renders centered and scaled; stack depth reads (upper layers offset up-right, painting over); blocked tiles visibly dimmer than free ones; faces legible and distinguishable per suit at rest; dark theme (`/theme`) and a private tab at `blanc://mahjong/?private=1` both re-ink correctly. Fix in source and relaunch until true. (Playwright per `driving-blanc-with-playwright` memory if scripted checks help; otherwise eyeball via screenshots.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/mahjong.html src/renderer/pages/mahjong.js src/renderer/pages/pages.css
git commit -m "feat(mahjong): board rendering, ink-on-paper tile faces"
```

---

### Task 7: Game page — interaction, timer, best time

**Files:**
- Modify: `src/renderer/pages/mahjong.js`

**Interfaces:**
- Consumes: Task 5's `movesAvailable`, `removePair`, `undo`, `isWon`; Task 6's `game`, `tileButtons`, `refreshTiles`, `newGame`.
- Produces: the complete playable game. Timer computes elapsed from `Date.now()` deltas (never tick counting). Best time in `localStorage` key `mahjong.best` (ms, stringified), all reads/writes try/catch-wrapped.

- [ ] **Step 1: Implement selection / removal / undo / hint / stuck / win**

Replace the bare `newGame()` bootstrapping at the end of `mahjong.js` with the interaction layer (everything below appends to the file; `newGame` grows the reset lines shown):

```js
// --- interaction ----------------------------------------------------------

let selected = null;

function setSelected(i) {
  if (selected !== null) tileButtons[selected].classList.remove('selected');
  selected = i;
  if (i !== null) tileButtons[i].classList.add('selected');
}

function checkEndStates() {
  const notice = document.getElementById('mjNotice');
  if (E.isWon(game)) {
    stopTimer();
    notice.hidden = true;
    showWin();
    return;
  }
  document.getElementById('mjWin').hidden = true;
  notice.hidden = E.movesAvailable(game).length > 0;
}

board.addEventListener('click', (event) => {
  const tile = event.target.closest('.mj-tile');
  if (!tile || tile.hidden) return;
  const i = Number(tile.dataset.i);
  if (!E.isFree(game, i)) {
    tile.classList.remove('shake');
    void tile.offsetWidth; // restart the animation
    tile.classList.add('shake');
    return;
  }
  startTimer();
  if (selected === null) { setSelected(i); return; }
  if (selected === i) { setSelected(null); return; }
  if (E.removePair(game, selected, i)) {
    setSelected(null);
    refreshTiles();
    checkEndStates();
  } else {
    setSelected(i); // non-matching free tile: move the selection
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setSelected(null);
});

document.getElementById('mjUndo').addEventListener('click', () => {
  if (!E.undo(game)) return;
  resumeTimerAfterUndo();
  setSelected(null);
  refreshTiles();
  checkEndStates();
});
document.getElementById('mjNoticeUndo').addEventListener('click', () =>
  document.getElementById('mjUndo').click());

document.getElementById('mjHint').addEventListener('click', () => {
  const moves = E.movesAvailable(game);
  if (!moves.length) return;
  const [i, j] = moves[0];
  for (const k of [i, j]) {
    tileButtons[k].classList.remove('hinted');
    void tileButtons[k].offsetWidth;
    tileButtons[k].classList.add('hinted');
  }
});

document.getElementById('mjNew').addEventListener('click', newGame);
document.getElementById('mjNoticeNew').addEventListener('click', newGame);
document.getElementById('mjWinNew').addEventListener('click', newGame);
```

- [ ] **Step 2: Implement the timestamp-based timer and best time**

```js
// --- timer + best ---------------------------------------------------------
// Elapsed is always Date.now() - startedAt: background tabs throttle
// intervals, so ticks only repaint — they never accumulate time.

let startedAt = null;
let finishedAt = null;
let tickHandle = null;

function formatMs(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function paintTimer() {
  const elapsed = startedAt === null ? 0 : (finishedAt ?? Date.now()) - startedAt;
  document.getElementById('mjTimer').textContent = formatMs(elapsed);
}

function startTimer() {
  if (startedAt !== null) return;
  startedAt = Date.now();
  tickHandle = setInterval(paintTimer, 500);
}

function stopTimer() {
  finishedAt = Date.now();
  clearInterval(tickHandle);
  tickHandle = null;
  paintTimer();
}

function resumeTimerAfterUndo() {
  if (finishedAt === null) return;
  startedAt += Date.now() - finishedAt; // don't bill the time spent won
  finishedAt = null;
  tickHandle = setInterval(paintTimer, 500);
}

function resetTimer() {
  clearInterval(tickHandle);
  tickHandle = null;
  startedAt = null;
  finishedAt = null;
  paintTimer();
}

function readBest() {
  try {
    const raw = Number(localStorage.getItem('mahjong.best'));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch { return null; }
}

function writeBest(ms) {
  try { localStorage.setItem('mahjong.best', String(ms)); } catch { /* no best line */ }
}

function showWin() {
  const elapsed = finishedAt - startedAt;
  const prior = readBest();
  const isNewBest = prior === null || elapsed < prior;
  if (isNewBest) writeBest(elapsed);
  document.getElementById('mjWinTime').textContent = formatMs(elapsed);
  document.getElementById('mjWinBest').textContent = isNewBest
    ? (prior === null ? 'first win' : `new best — was ${formatMs(prior)}`)
    : `best ${formatMs(readBest())}`;
  document.getElementById('mjWin').hidden = false;
}
```

Extend `newGame()` to reset per-deal state:

```js
function newGame() {
  game = E.createGame(Math.floor(Math.random() * 2 ** 31));
  selected = null;
  resetTimer();
  document.getElementById('mjNotice').hidden = true;
  document.getElementById('mjWin').hidden = true;
  renderBoard();
  fitBoard();
}
```

(Deal generation throwing past the defensive cap is never expected; if it ever did, the uncaught error leaves a blank board — acceptable for v1, per spec §6 the cap exists to fail loudly, and a plain reload re-rolls. Add a `try/catch` around `E.createGame` that renders "couldn't deal — try again" in `#mjNotice` with `#mjNoticeNew` visible.)

- [ ] **Step 3: Full manual playthrough (relaunch dev app)**

Relaunch `npm start`. At `blanc://mahjong/`:
- select/deselect/switch-selection behaviors; blocked tile shakes; pair clears; pairs-left counts down.
- undo restores (repeatedly, to zero); hint pulses a real pair; Esc deselects.
- timer starts on first click, not on load; switch away to another tab for 60s, switch back — timer shows wall-clock elapsed, not a throttled undercount.
- play a full game with hints/undo to win: mark + time + `first win`; new deal; win again faster/slower to see `new best` / `best m:ss`; quit app fully, relaunch — best persists.
- stuck state (deal, then undo/redo random pairs until stuck, or temporarily hint-exhaust): notice appears inline with working undo / new deal.
- private tab: `blanc://mahjong/?private=1` — private tokens; best NOT persisted across app restarts.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/mahjong.js
git commit -m "feat(mahjong): interaction, timestamp timer, local best"
```

---

### Task 8: New-tab entry, `startPageStatus` projection, Settings toggle

**Files:**
- Modify: `src/main/main.js` (`startPageStatus()` — one line)
- Modify: `src/renderer/pages/newtab.html` (footer link)
- Modify: `src/renderer/pages/newtab.js` (show/hide + private href)
- Modify: `src/renderer/pages/settings.html` + `src/renderer/pages/settings.js` (toggle)
- Modify: `src/renderer/pages/pages.css` (only if the footer link needs a class not already styled — reuse `.layout-switcher button` styling idioms first)

**Interfaces:**
- Consumes: Task 1's `getSettings().newtabMahjong`; Task 2's routing.
- Produces: `startPageStatus()` includes `newtabMahjong: boolean` — reaching the page BOTH via initial `pages:start:data` (which spreads `hooks.startPage.status()`) and every `pages:start:status` push. No new IPC channels.

- [ ] **Step 1: Project the setting from main**

In `src/main/main.js`, inside `startPageStatus()` (search for `layout: current.newtabLayout,`), add alongside it:

```js
      // Gates the start-page footer's mahjong link (spec 2026-08-30).
      newtabMahjong: current.newtabMahjong === true,
```

No other main.js change: `pages:start:data` already spreads `...hooks.startPage?.status?.()`, and settings changes already trigger `broadcastStartPageStatus()`.

- [ ] **Step 2: Footer link in `newtab.html`**

In the `<footer class="ledger-footer">`, between the `layoutSwitcher` span and `goAnywhere`:

```html
    <a id="mahjongLink" class="mahjong-link" href="blanc://mahjong/" hidden>mahjong</a>
```

Style (pages.css, next to the existing `.layout-switcher` rules, matching their look):

```css
.mahjong-link { color: inherit; text-decoration: none; }
.mahjong-link:hover { text-decoration: underline; }
```

(Check the real `.layout-switcher button` rules first and mirror their color/hover treatment exactly; the footer is all `--text-dim` mono.)

- [ ] **Step 3: Wire it in `newtab.js`**

Near the other footer setup (the `goAnywhere` line at the top):

```js
const mahjongLink = document.getElementById('mahjongLink');
if (isPrivate) mahjongLink.href = 'blanc://mahjong/?private=1';
const renderMahjongLink = (on) => { mahjongLink.hidden = !on; };
```

In the `dataReady` handler (after `renderPatronCallout(data.patronActive);`):
```js
  renderMahjongLink(data.newtabMahjong === true);
```

In the `onStatus` callback:
```js
  if (status && 'newtabMahjong' in status) renderMahjongLink(status.newtabMahjong === true);
```

- [ ] **Step 4: Settings toggle**

`settings.html` — in the General group, after the Quiet-inactive-tabs setting (`#tabSleepSetting`):

```html
            <div class="setting" id="newtabMahjongSetting">
              <div class="label">
                <span>Mahjong on new tab</span>
                <span class="hint">Adds a quiet mahjong solitaire link to the new-tab page.</span>
              </div>
              <label class="toggle">
                <input id="newtabMahjong" type="checkbox" />
                <span class="track"></span>
              </label>
            </div>
```

`settings.js` — next to the other toggles, following the `usagePing` idiom exactly (including the unsupported-capability removal branch):

```js
  if (supports('newtabMahjong')) {
    const newtabMahjong = document.getElementById('newtabMahjong');
    newtabMahjong.checked = settings.newtabMahjong;
    newtabMahjong.addEventListener('change', () =>
      window.bowserPages.settings.set({ newtabMahjong: newtabMahjong.checked }));
  } else {
    document.getElementById('newtabMahjong')?.closest('.setting')?.remove();
  }
```

- [ ] **Step 5: Run the guard suites**

Run: `npm run test:unit && npm run substrate:check`
Expected: PASS — the settings fan-out / first-run / pages-ipc suites must not regress; substrate stays clean (no enum/copy/token changed in this task).

- [ ] **Step 6: Manual verification (relaunch dev app)**

Relaunch `npm start`:
- Toggle OFF (default): no `mahjong` anywhere on the new tab, in all four layouts (footer is shared — check ledger + one other).
- Settings → General → Mahjong on new tab ON: an already-open new tab shows the footer link WITHOUT reload (live `pages:start:status` push); a fresh new tab shows it too (initial `pages:start:data`).
- Click: navigates the same tab to the game; back returns to the start page.
- Private tab (⌘⇧N): link carries `?private=1`; game opens with private theme.
- Toggle OFF again: link disappears from open new tabs live.

- [ ] **Step 7: Commit**

```bash
git add src/main/main.js src/renderer/pages/newtab.html src/renderer/pages/newtab.js src/renderer/pages/settings.html src/renderer/pages/settings.js src/renderer/pages/pages.css
git commit -m "feat(mahjong): opt-in new-tab entry and settings toggle"
```

---

### Task 9: Verification sweep

**Files:** none new.

- [ ] **Step 1: Full unit + substrate run**

Run: `npm run test:unit && npm run substrate:check && npm run test:acceptance:dry`
Expected: all PASS (acceptance dry-run proves no step-definition resolution broke).

- [ ] **Step 2: End-to-end manual pass (relaunch dev app, leave it open)**

One sitting, fresh relaunch: enable in Settings → open new tab → footer link → play to a win (hints allowed) → best persists across a full app restart → private-tab pass → toggle off → link gone live. Confirm the game page issues zero network requests (main-process console stays quiet; no fetch anywhere in `mahjong.js`).

- [ ] **Step 3: Update `CLAUDE.md`**

Add one sentence to the `blanc://` internal-pages paragraph: `mahjong` is a KNOWN page served flat like the others but deliberately NOT a utility page (opens as a normal tab, opt-in via `newtabMahjong`).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note blanc://mahjong in architecture overview"
```

Then use superpowers:finishing-a-development-branch (PRs in this repo are squash-merged).
