# Mahjong Layouts + Records Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five verified-solvable Mahjong layouts (eight total, Daily rotating across all eight) and a Records sheet showing best results per board, boards cleared, and the daily streak, all device-local.

**Architecture:** Layouts are pure position builders registered in `mahjong-engine.js`'s frozen `LAYOUTS` map; `mahjong-state.js` mirrors ids/revisions and derives everything the Records sheet shows from the existing records aggregate plus a new durable `totals` block maintained by a two-phase compaction in `mergeEvents()`. The page (`mahjong.js`/`mahjong.html`/`mahjong.css`) only maps a pure `recordsSummary()` view model to DOM, following the existing Boards-sheet modal pattern.

**Tech Stack:** Vanilla JS (classic scripts, no modules), `node --test` unit suites with source-guard regex tests for the page, Cucumber + Playwright-Electron desktop acceptance (dry run only in this environment), plain CSS with existing tokens.

**Spec:** `docs/superpowers/specs/2026-09-02-mahjong-layouts-records-design.md`

## Global Constraints

- Coordinates are half-tile units; a tile occupies `[x, x+2) × [y, y+2)` on one layer. No same-layer overlap (`|dx| < 2 && |dy| < 2`), every `z > 0` tile overlaps a tile at `z − 1`, even count ≥ 28.
- Registry order and `LAYOUT_IDS` order are identical: `turtle, arch, peaks, pyramid, fortress, butterfly, bridge, cross`. New layouts have `revision: 1`.
- `RECORDS_VERSION` stays `2`; `TRAY_SCORING_REVISION` stays `2`; the aggregate shape is extended, never versioned.
- `totals` is durable: never prune an event whose count has not been persisted; prune only counted events; compact `countedEvents` afterwards.
- Copy is lowercase-calm in the dock and sheets. No level, rank, or comparison copy. No telemetry, no network, no remote assets.
- Every new CSS value uses existing tokens/literals in `mahjong.css`; no `tokens/tokens.json` change, so `npm run substrate:check` is unaffected.
- Desktop rail keeps 64 px circular controls with a 16 px gap at 1280×800; the pinned page test regex changes from `repeat(5, 64px)` to `repeat(6, 64px)`.
- Commands: `node --test test/unit/mahjong-<name>.test.js`, `npm run test:unit`, `npm run test:acceptance:dry`. Never launch the Electron app from this plan's tasks (another session may be running acceptance); the browser pass uses a static server over `127.0.0.1`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Five layout builders in the engine

**Files:**
- Modify: `src/renderer/pages/mahjong-engine.js` (builders after `buildPeaksLayout`, `LAYOUTS` map, exports)
- Test: `test/unit/mahjong-engine.test.js` (fixture test `all v2 layouts have the promised size…`, new integrity test)

**Interfaces:**
- Produces: `E.LAYOUTS` with eight frozen entries `{ id, name, revision, positions, tileCount, layers }` in the order above; exported constants `PYRAMID_LAYOUT`, `FORTRESS_LAYOUT`, `BUTTERFLY_LAYOUT`, `BRIDGE_LAYOUT`, `CROSS_LAYOUT`.

- [ ] **Step 1: Extend the registry fixture and add the integrity test (failing)**

In `test/unit/mahjong-engine.test.js`, replace the `expected` object and the key assertion inside `all v2 layouts have the promised size, layer count, and valid coordinates`:

```js
  const expected = {
    turtle: { count: 144, layers: [87, 36, 16, 4, 1] },
    arch: { count: 96, layers: [72, 18, 6] },
    peaks: { count: 72, layers: [48, 16, 6, 2] },
    pyramid: { count: 108, layers: [60, 32, 12, 4] },
    fortress: { count: 96, layers: [50, 44, 2] },
    butterfly: { count: 94, layers: [70, 21, 3] },
    bridge: { count: 100, layers: [52, 29, 15, 4] },
    cross: { count: 86, layers: [48, 24, 13, 1] },
  };
  assert.deepEqual(Object.keys(E.LAYOUTS), [
    'turtle', 'arch', 'peaks', 'pyramid', 'fortress', 'butterfly', 'bridge', 'cross',
  ]);
```

Append a new test at the end of the file:

```js
test('every layout is physically valid, opens as specified, and always deals', () => {
  const freeAtStart = {
    turtle: 35, arch: 18, peaks: 18, pyramid: 26, fortress: 20, butterfly: 43, bridge: 8, cross: 17,
  };
  for (const [id, definition] of Object.entries(E.LAYOUTS)) {
    const positions = definition.positions;
    assert.ok(positions.length % 2 === 0 && positions.length >= 28, `${id}: even count of at least 28`);
    assert.equal(definition.id, id);
    assert.equal(typeof definition.name, 'string');
    for (const [index, position] of positions.entries()) {
      if (position.z === 0) continue;
      const supported = positions.some((other) => other.z === position.z - 1
        && Math.abs(other.x - position.x) < 2 && Math.abs(other.y - position.y) < 2);
      assert.ok(supported, `${id}: tile ${index} at (${position.x},${position.y},${position.z}) floats`);
    }
    const free = positions.filter((_, index) => E.isFreeAt(positions, index, () => true)).length;
    assert.equal(free, freeAtStart[id], `${id}: free tiles at the start`);
    const width = Math.max(...positions.map((p) => p.x)) + 2;
    const height = Math.max(...positions.map((p) => p.y)) + 2;
    assert.ok(width <= 30 && height <= 16, `${id}: footprint ${width}x${height} exceeds Turtle's 30x16`);
    for (let seed = 1; seed <= 60; seed++) {
      const game = E.createGame({ seed, layoutId: id, mode: 'classic' });
      assert.ok(E.availableMoves(game).length > 0, `${id}/${seed}: opening move`);
    }
  }
});
```

- [ ] **Step 2: Run to verify both fail**

Run: `node --test test/unit/mahjong-engine.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: `all v2 layouts…` fails on the `Object.keys` deepEqual (three ids vs eight); the new test fails with `freeAtStart[id]`-style assertion or before it (only three layouts exist). Both are `AssertionError`, not syntax errors.

- [ ] **Step 3: Add the builders and registry entries**

In `src/renderer/pages/mahjong-engine.js`, after `buildPeaksLayout()` and before `freezePositions`, add:

```js
  // Shared helpers for the v2.1 layouts. `grid` seats one tile at every
  // (x, y) pair on one layer; `span` lists half-unit coordinates in steps of
  // two (whole tiles) or one (half offsets, used for bridging courses).
  function span(from, to, step = 2) {
    const values = [];
    for (let value = from; value <= to; value += step) values.push(value);
    return values;
  }
  function grid(xs, ys, z) {
    return xs.flatMap((x) => ys.map((y) => ({ x, y, z })));
  }

  // One solid stepped block. Only the edges start free, so it plays hard.
  function buildPyramidLayout() {
    return [
      ...grid(span(0, 18), span(0, 10), 0),
      ...grid(span(2, 16), span(2, 8), 1),
      ...grid(span(4, 14), span(4, 6), 2),
      ...grid(span(6, 12), [5], 3),
    ];
  }

  // A two-course wall around a courtyard keep. Free tiles are the wall
  // corners and the keep's edges.
  function buildFortressLayout() {
    const ring = (z) => [
      ...grid(span(0, 26), [0, 14], z),
      ...grid([0, 26], span(2, 12), z),
    ];
    return [
      ...ring(0), ...ring(1),
      ...grid(span(8, 16), [6, 8], 0),
      ...grid(span(9, 15), [7], 1),
      ...grid([11, 13], [7], 2),
    ];
  }

  // Two lifted wings with a one-tile gap to a slim body. Plays easy.
  function buildButterflyLayout() {
    const wing = (ox) => [
      ...grid(span(ox + 2, ox + 8), [0, 10], 0),
      ...grid(span(ox, ox + 10), [2, 4, 6, 8], 0),
      ...grid(span(ox + 3, ox + 7), [3, 5, 7], 1),
      { x: ox + 5, y: 5, z: 2 },
    ];
    return [
      ...wing(0), ...wing(18),
      ...grid([14], span(0, 10), 0),
      ...grid([14], [3, 5, 7], 1),
      { x: 14, y: 5, z: 2 },
    ];
  }

  // Two four-course pylons and a low span with a half-tile gap on each side.
  // Only eight tiles open at the start; the deck ends wait under the cables.
  function buildBridgeLayout() {
    const pylon = (ox) => [
      ...grid(span(ox, ox + 6), span(0, 8), 0),
      ...grid(span(ox + 1, ox + 5), span(1, 7), 1),
      ...grid(span(ox + 2, ox + 4), span(2, 6), 2),
      ...grid([ox + 3], [3, 5], 3),
    ];
    return [
      ...pylon(0), ...pylon(22),
      ...grid(span(9, 19), [3, 5], 0),
      ...grid(span(10, 18), [4], 1),
      ...grid([12, 14, 16], [4], 2),
    ];
  }

  // A plus sign that rises toward its centre.
  function buildCrossLayout() {
    return [
      ...grid(span(0, 28), [6, 8], 0),
      ...grid([12, 14, 16], [0, 2, 4, 10, 12, 14], 0),
      ...grid(span(3, 25), [7], 1),
      ...grid([13, 15], [1, 3, 5, 9, 11, 13], 1),
      ...grid(span(6, 22), [7], 2),
      ...grid([14], [3, 5, 9, 11], 2),
      { x: 14, y: 7, z: 3 },
    ];
  }
```

Replace the constants and `LAYOUTS` block:

```js
  const TURTLE_LAYOUT = freezePositions(buildTurtleLayout());
  const ARCH_LAYOUT = freezePositions(buildArchLayout());
  const PEAKS_LAYOUT = freezePositions(buildPeaksLayout());
  const PYRAMID_LAYOUT = freezePositions(buildPyramidLayout());
  const FORTRESS_LAYOUT = freezePositions(buildFortressLayout());
  const BUTTERFLY_LAYOUT = freezePositions(buildButterflyLayout());
  const BRIDGE_LAYOUT = freezePositions(buildBridgeLayout());
  const CROSS_LAYOUT = freezePositions(buildCrossLayout());
  const LAYOUTS = Object.freeze({
    turtle: Object.freeze({ id: 'turtle', name: 'Turtle', revision: 1, positions: TURTLE_LAYOUT, tileCount: 144, layers: 5 }),
    arch: Object.freeze({ id: 'arch', name: 'Arch', revision: 2, positions: ARCH_LAYOUT, tileCount: 96, layers: 3 }),
    peaks: Object.freeze({ id: 'peaks', name: 'Peaks', revision: 1, positions: PEAKS_LAYOUT, tileCount: 72, layers: 4 }),
    pyramid: Object.freeze({ id: 'pyramid', name: 'Pyramid', revision: 1, positions: PYRAMID_LAYOUT, tileCount: 108, layers: 4 }),
    fortress: Object.freeze({ id: 'fortress', name: 'Fortress', revision: 1, positions: FORTRESS_LAYOUT, tileCount: 96, layers: 3 }),
    butterfly: Object.freeze({ id: 'butterfly', name: 'Butterfly', revision: 1, positions: BUTTERFLY_LAYOUT, tileCount: 94, layers: 3 }),
    bridge: Object.freeze({ id: 'bridge', name: 'Bridge', revision: 1, positions: BRIDGE_LAYOUT, tileCount: 100, layers: 4 }),
    cross: Object.freeze({ id: 'cross', name: 'Cross', revision: 1, positions: CROSS_LAYOUT, tileCount: 86, layers: 4 }),
  });
```

In the `MahjongEngine` export object, after `PEAKS_LAYOUT,` add:

```js
    PYRAMID_LAYOUT,
    FORTRESS_LAYOUT,
    BUTTERFLY_LAYOUT,
    BRIDGE_LAYOUT,
    CROSS_LAYOUT,
```

- [ ] **Step 4: Run the engine suite**

Run: `node --test test/unit/mahjong-engine.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: `# fail 0`. If `free tiles at the start` fails for a layout, the builder differs from §3.1 of the spec; fix the builder, not the number (the numbers were probed against these exact coordinates).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/mahjong-engine.js test/unit/mahjong-engine.test.js
git commit -m "feat(mahjong): add Pyramid, Fortress, Butterfly, Bridge, and Cross layouts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Registry mirror and eight-day Daily rotation

**Files:**
- Modify: `src/renderer/pages/mahjong-state.js` (`LAYOUT_IDS`, `LAYOUT_REVISIONS`)
- Test: `test/unit/mahjong-state.test.js` (`daily deal identity…` test)

**Interfaces:**
- Produces: `S.LAYOUT_IDS` (eight ids, registry order), `S.LAYOUT_REVISIONS` (adds five `1`s). `S.dailyLayoutId(key)` now cycles eight.

- [ ] **Step 1: Update the rotation test (failing)**

Replace the body of `daily deal identity is deterministic and rotates Turtle, Arch, Peaks` and rename it:

```js
test('daily deal identity is deterministic and rotates through every layout', () => {
  const first = S.dailyDeal('2026-08-30');
  assert.deepEqual(first, S.dailyDeal('2026-08-30'));
  assert.notEqual(first.seed, S.dailySeed('2026-08-31'));
  const days = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14'];
  const layouts = days.map((day) => S.dailyLayoutId(day));
  assert.deepEqual([...layouts].sort(), [...S.LAYOUT_IDS].sort(), 'eight consecutive days visit every layout once');
  assert.equal(S.dailyLayoutId('2026-09-15'), layouts[0], 'the ninth day wraps');
  assert.equal(S.LAYOUT_IDS.length, 8);
  assert.deepEqual(S.LAYOUT_IDS, ['turtle', 'arch', 'peaks', 'pyramid', 'fortress', 'butterfly', 'bridge', 'cross']);
  assert.equal(S.dailyKey(new Date(2026, 7, 30, 23, 59)), '2026-08-30');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/unit/mahjong-state.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: the renamed test fails on the sorted `deepEqual` (three ids vs eight); the existing `record revisions stay aligned with engine layout revisions` test also fails because `E.LAYOUTS` now has eight entries and `LAYOUT_REVISIONS` has three.

- [ ] **Step 3: Extend the constants**

In `src/renderer/pages/mahjong-state.js`:

```js
  const LAYOUT_IDS = Object.freeze(['turtle', 'arch', 'peaks', 'pyramid', 'fortress', 'butterfly', 'bridge', 'cross']);
  // Record revisions deliberately mirror the pure engine's layout revisions.
  // A missing revision is legacy revision 1, which keeps unchanged Turtle and
  // Peaks results while preventing the retired portrait Arch from replaying
  // into the wider revision-2 board.
  const LAYOUT_REVISIONS = Object.freeze({
    turtle: 1, arch: 2, peaks: 1, pyramid: 1, fortress: 1, butterfly: 1, bridge: 1, cross: 1,
  });
```

`dailyLayoutId` already uses `LAYOUT_IDS.length`; no change.

- [ ] **Step 4: Run the state suite**

Run: `node --test test/unit/mahjong-state.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/mahjong-state.js test/unit/mahjong-state.test.js
git commit -m "feat(mahjong): rotate the Daily deal across all eight layouts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Eight layout cards in the Boards sheet

**Files:**
- Modify: `src/renderer/pages/mahjong.html` (`.mj-layout-grid` cards)
- Modify: `src/renderer/pages/mahjong.css` (`.mj-layout-grid` columns, new `.mj-layout-mini-*` rules, a `max-width: 900px` block)
- Modify: `test/desktop/steps/newtab-layouts.steps.js` (`MAHJONG_TILE_COUNTS`)
- Test: `test/unit/mahjong-page.test.js`

**Interfaces:**
- Consumes: `S.LAYOUT_IDS` order from Task 2.
- Produces: buttons `#mjLayoutPyramid`, `#mjLayoutFortress`, `#mjLayoutButterfly`, `#mjLayoutBridge`, `#mjLayoutCross` with `data-layout` ids; the existing `paintSetupChoices()` loop over `button[data-layout]` picks them up unchanged.

- [ ] **Step 1: Add page tests (failing)**

Append to `test/unit/mahjong-page.test.js`:

```js
test('the Boards sheet lists all eight layouts in registry order on a four-column grid', () => {
  const S = require('../../src/renderer/pages/mahjong-state');
  const ids = [...html.matchAll(/class="mj-choice mj-layout-choice[^"]*"[^>]*data-layout="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, [...S.LAYOUT_IDS]);
  for (const id of ['Pyramid', 'Fortress', 'Butterfly', 'Bridge', 'Cross']) {
    assert.match(html, new RegExp(`id="mjLayout${id}"`), `missing card for ${id}`);
    assert.match(mahjongStyles, new RegExp(`\\.mj-layout-mini-${id.toLowerCase()} i:nth-child\\(1\\)`), `missing preview for ${id}`);
  }
  assert.match(html, /108 tiles · steep/);
  assert.match(html, /96 tiles · walled/);
  assert.match(html, /94 tiles · open/);
  assert.match(html, /100 tiles · narrow/);
  assert.match(html, /86 tiles · layered/);
  assert.match(mahjongStyles, /\.mj-layout-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(mahjongStyles, /@media \(max-width: 900px\)\s*\{[^@]*\.mj-layout-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/unit/mahjong-page.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: the new test fails on the `deepEqual` of ids (three vs eight).

- [ ] **Step 3: Add the five cards**

In `src/renderer/pages/mahjong.html`, inside `<div class="mj-layout-grid">`, after the Peaks button:

```html
            <button id="mjLayoutPyramid" class="mj-choice mj-layout-choice" type="button" data-layout="pyramid" aria-pressed="false">
              <span class="mj-layout-mini mj-layout-mini-pyramid" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
              <span><strong>Pyramid</strong><small>108 tiles · steep</small></span>
            </button>
            <button id="mjLayoutFortress" class="mj-choice mj-layout-choice" type="button" data-layout="fortress" aria-pressed="false">
              <span class="mj-layout-mini mj-layout-mini-fortress" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
              <span><strong>Fortress</strong><small>96 tiles · walled</small></span>
            </button>
            <button id="mjLayoutButterfly" class="mj-choice mj-layout-choice" type="button" data-layout="butterfly" aria-pressed="false">
              <span class="mj-layout-mini mj-layout-mini-butterfly" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
              <span><strong>Butterfly</strong><small>94 tiles · open</small></span>
            </button>
            <button id="mjLayoutBridge" class="mj-choice mj-layout-choice" type="button" data-layout="bridge" aria-pressed="false">
              <span class="mj-layout-mini mj-layout-mini-bridge" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
              <span><strong>Bridge</strong><small>100 tiles · narrow</small></span>
            </button>
            <button id="mjLayoutCross" class="mj-choice mj-layout-choice" type="button" data-layout="cross" aria-pressed="false">
              <span class="mj-layout-mini mj-layout-mini-cross" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
              <span><strong>Cross</strong><small>86 tiles · layered</small></span>
            </button>
```

- [ ] **Step 4: Grid columns and previews**

In `src/renderer/pages/mahjong.css`, change the `.mj-layout-grid` rule to four columns:

```css
.mj-layout-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
}
```

After the last `.mj-layout-mini-peaks` rule, add the previews (later `<i>` paint above earlier ones, same as the existing three):

```css
/* v2.1 previews. Pyramid: a four-course stepped stack. Fortress: a ring with
   a raised keep. Butterfly: two lifted wings and a body. Bridge: two towers
   and a low span. Cross: a plus that rises at the centre. */
.mj-layout-mini-pyramid i:nth-child(1) { left: 20%; top: 62px; }
.mj-layout-mini-pyramid i:nth-child(2) { left: 40%; top: 62px; }
.mj-layout-mini-pyramid i:nth-child(3) { left: 60%; top: 62px; }
.mj-layout-mini-pyramid i:nth-child(4) { left: 80%; top: 62px; }
.mj-layout-mini-pyramid i:nth-child(5) { left: 30%; top: 46px; }
.mj-layout-mini-pyramid i:nth-child(6) { left: 50%; top: 46px; }
.mj-layout-mini-pyramid i:nth-child(7) { left: 70%; top: 46px; }
.mj-layout-mini-pyramid i:nth-child(8) { left: 40%; top: 30px; }
.mj-layout-mini-pyramid i:nth-child(9) { left: 60%; top: 30px; }
.mj-layout-mini-pyramid i:nth-child(10) { left: 50%; top: 14px; }

.mj-layout-mini-fortress i:nth-child(1) { left: 10%; top: 58px; }
.mj-layout-mini-fortress i:nth-child(2) { left: 50%; top: 58px; }
.mj-layout-mini-fortress i:nth-child(3) { left: 90%; top: 58px; }
.mj-layout-mini-fortress i:nth-child(4) { left: 10%; top: 30px; }
.mj-layout-mini-fortress i:nth-child(5) { left: 50%; top: 30px; }
.mj-layout-mini-fortress i:nth-child(6) { left: 90%; top: 30px; }
.mj-layout-mini-fortress i:nth-child(7) { left: 50%; top: 44px; }

.mj-layout-mini-butterfly i:nth-child(1) { left: 12%; top: 58px; }
.mj-layout-mini-butterfly i:nth-child(2) { left: 30%; top: 58px; }
.mj-layout-mini-butterfly i:nth-child(3) { left: 70%; top: 58px; }
.mj-layout-mini-butterfly i:nth-child(4) { left: 88%; top: 58px; }
.mj-layout-mini-butterfly i:nth-child(5) { left: 21%; top: 40px; }
.mj-layout-mini-butterfly i:nth-child(6) { left: 79%; top: 40px; }
.mj-layout-mini-butterfly i:nth-child(7) { left: 50%; top: 60px; }
.mj-layout-mini-butterfly i:nth-child(8) { left: 50%; top: 42px; }
.mj-layout-mini-butterfly i:nth-child(9) { left: 50%; top: 24px; }

.mj-layout-mini-bridge i:nth-child(1) { left: 12%; top: 60px; }
.mj-layout-mini-bridge i:nth-child(2) { left: 88%; top: 60px; }
.mj-layout-mini-bridge i:nth-child(3) { left: 37%; top: 52px; }
.mj-layout-mini-bridge i:nth-child(4) { left: 50%; top: 52px; }
.mj-layout-mini-bridge i:nth-child(5) { left: 63%; top: 52px; }
.mj-layout-mini-bridge i:nth-child(6) { left: 12%; top: 42px; }
.mj-layout-mini-bridge i:nth-child(7) { left: 88%; top: 42px; }
.mj-layout-mini-bridge i:nth-child(8) { left: 12%; top: 24px; }
.mj-layout-mini-bridge i:nth-child(9) { left: 88%; top: 24px; }

.mj-layout-mini-cross i:nth-child(1) { left: 14%; top: 50px; }
.mj-layout-mini-cross i:nth-child(2) { left: 32%; top: 50px; }
.mj-layout-mini-cross i:nth-child(3) { left: 68%; top: 50px; }
.mj-layout-mini-cross i:nth-child(4) { left: 86%; top: 50px; }
.mj-layout-mini-cross i:nth-child(5) { left: 50%; top: 66px; }
.mj-layout-mini-cross i:nth-child(6) { left: 50%; top: 34px; }
.mj-layout-mini-cross i:nth-child(7) { left: 50%; top: 18px; }
.mj-layout-mini-cross i:nth-child(8) { left: 50%; top: 50px; }
```

Immediately before the existing `@media (max-width: 780px) {` block, add:

```css
@media (max-width: 900px) {
  .mj-layout-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

(The 780 px block's `grid-template-columns: 1fr` still wins below 780 because it comes later.)

- [ ] **Step 5: Extend the desktop tile-count map**

In `test/desktop/steps/newtab-layouts.steps.js`:

```js
const MAHJONG_TILE_COUNTS = Object.freeze({
  turtle: 144, arch: 96, peaks: 72, pyramid: 108, fortress: 96, butterfly: 94, bridge: 100, cross: 86,
});
```

- [ ] **Step 6: Run the page suite and the acceptance dry run**

Run: `node --test test/unit/mahjong-page.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: `# fail 0` (the existing `setup cards devote their visual field…` test still passes; it asserts sizing, not count).
Run: `npm run test:acceptance:dry 2>&1 | tail -3`
Expected: `130 scenarios (130 skipped)`, no undefined steps.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/mahjong.html src/renderer/pages/mahjong.css test/desktop/steps/newtab-layouts.steps.js test/unit/mahjong-page.test.js
git commit -m "feat(mahjong): offer all eight layouts in the Boards sheet

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Durable `totals` with two-phase compaction

**Files:**
- Modify: `src/renderer/pages/mahjong-state.js` (`emptyRecords`, `normalizeRecords`, `mergeEvents`, exports)
- Test: `test/unit/mahjong-state.test.js`

**Interfaces:**
- Produces: `records.totals = { cleared: { classic: {[layoutId]: n}, tray: {[layoutId]: n} }, countedEvents: [eventId] }` on every object returned by `normalizeRecords`/`read()`; `S.emptyTotals()` exported. `createRecordStore().read()` persists totals before pruning and prunes only counted events.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/mahjong-state.test.js`. First a storage subclass the tests share (place it right after `MemoryStorage`):

```js
class HookedStorage extends MemoryStorage {
  constructor(entries) { super(entries); this.failKeys = new Set(); this.onSet = null; }
  setItem(key, value) {
    if (this.failKeys.has(key)) throw new Error(`write refused: ${key}`);
    super.setItem(key, value);
    if (this.onSet) { const hook = this.onSet; this.onSet = null; hook(key); }
  }
}

function completion(layoutId, mode, extra = {}) {
  return {
    layoutId, layoutRevision: S.LAYOUT_REVISIONS[layoutId], mode, elapsedMs: 60_000, score: mode === 'tray' ? 1000 : 0,
    scoringRevision: mode === 'tray' ? 2 : 0, completed: true, assists: { undo: 0, hint: 0, shuffle: 0 }, ...extra,
  };
}

function rawEvent(storage, number, result, updatedAt) {
  const eventId = uuid(number);
  storage.setItem(`${S.RECORD_EVENT_PREFIX}${eventId}`, JSON.stringify({ version: 2, eventId, updatedAt, result }));
  return eventId;
}
```

Then the tests:

```js
test('totals count each completion once across repeated reads and are normalised safely', () => {
  const storage = new HookedStorage();
  let clock = 1000;
  const store = S.createRecordStore({ storage, now: () => clock, uuid: () => uuid(clock++) });
  store.record(completion('peaks', 'classic'));
  store.record(completion('peaks', 'classic'));
  store.record(completion('arch', 'tray'));
  for (let i = 0; i < 3; i++) store.read();
  const records = store.read();
  assert.deepEqual(records.totals.cleared, { classic: { peaks: 2 }, tray: { arch: 1 } });
  assert.equal(records.totals.countedEvents.length, 3);
  assert.deepEqual(S.emptyRecords().totals, S.emptyTotals());
  const corrupt = S.normalizeRecords({ version: 2, classic: { peaks: { layoutRevision: 1, bestTimeMs: 5 } }, totals: { cleared: { classic: { peaks: -4, castle: 2 }, tray: 'x' }, countedEvents: 'nope' } });
  assert.deepEqual(corrupt.totals, S.emptyTotals());
  assert.equal(corrupt.classic.peaks.bestTimeMs, 5, 'a corrupt totals block never disturbs best records');
});

test('a failed aggregate write leaves every event in place and never prunes', () => {
  const storage = new HookedStorage();
  for (let n = 1; n <= S.MAX_RECORD_EVENTS + 1; n++) rawEvent(storage, n, completion('turtle', 'classic'), n);
  storage.failKeys.add(S.RECORDS_KEY);
  const store = S.createRecordStore({ storage, now: () => 10_000, uuid: () => uuid(9_999) });
  const view = store.read();
  assert.equal(view.totals.cleared.classic.turtle, S.MAX_RECORD_EVENTS + 1, 'the in-memory view still counts');
  assert.equal(storage.getItem(S.RECORDS_KEY), null, 'nothing persisted');
  const remaining = [...storage.values.keys()].filter((key) => key.startsWith(S.RECORD_EVENT_PREFIX));
  assert.equal(remaining.length, S.MAX_RECORD_EVENTS + 1, 'no event pruned while the count is unpersisted');
  storage.failKeys.clear();
  const recovered = store.read();
  assert.equal(recovered.totals.cleared.classic.turtle, S.MAX_RECORD_EVENTS + 1);
  const afterPrune = [...storage.values.keys()].filter((key) => key.startsWith(S.RECORD_EVENT_PREFIX));
  assert.equal(afterPrune.length, S.MAX_RECORD_EVENTS);
  assert.equal(storage.getItem(`${S.RECORD_EVENT_PREFIX}${uuid(1)}`), null, 'the oldest counted event is the one pruned');
  assert.equal(recovered.totals.countedEvents.length, S.MAX_RECORD_EVENTS, 'countedEvents compacts to retained ids');
  assert.ok(!recovered.totals.countedEvents.includes(uuid(1)));
});

test('an event written between persist and prune is never pruned before it is counted', () => {
  const storage = new HookedStorage();
  for (let n = 1; n <= S.MAX_RECORD_EVENTS + 1; n++) rawEvent(storage, n, completion('turtle', 'classic'), n);
  const late = S.MAX_RECORD_EVENTS + 2;
  // Another tab lands its completion the instant this tab persists its aggregate.
  storage.onSet = (key) => { if (key === S.RECORDS_KEY) rawEvent(storage, late, completion('cross', 'tray'), late); };
  const store = S.createRecordStore({ storage, now: () => 10_000, uuid: () => uuid(9_999) });
  const first = store.read();
  assert.equal(first.totals.cleared.classic.turtle, S.MAX_RECORD_EVENTS + 1);
  assert.equal(first.totals.cleared.tray.cross, undefined, 'the late event is not yet counted');
  assert.notEqual(storage.getItem(`${S.RECORD_EVENT_PREFIX}${uuid(late)}`), null, 'the late event survived pruning');
  assert.equal(storage.getItem(`${S.RECORD_EVENT_PREFIX}${uuid(1)}`), null, 'the oldest counted event was pruned instead');
  const second = store.read();
  assert.equal(second.totals.cleared.tray.cross, 1);
  assert.equal(second.totals.cleared.classic.turtle, S.MAX_RECORD_EVENTS + 1, 'no double count');
  const retained = [...storage.values.keys()].filter((key) => key.startsWith(S.RECORD_EVENT_PREFIX)).length;
  assert.equal(retained, S.MAX_RECORD_EVENTS);
  assert.equal(second.totals.countedEvents.length, S.MAX_RECORD_EVENTS);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/mahjong-state.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: the three new tests fail (`totals` undefined / `S.emptyTotals is not a function`).

- [ ] **Step 3: Implement totals and the two-phase merge**

In `src/renderer/pages/mahjong-state.js`:

Replace `emptyRecords`:

```js
  function emptyTotals() {
    return { cleared: { classic: {}, tray: {} }, countedEvents: [] };
  }

  function emptyRecords() {
    return { version: RECORDS_VERSION, classic: {}, tray: {}, trayLegacy: {}, daily: {}, totals: emptyTotals() };
  }

  function normalizeTotals(value) {
    const clean = emptyTotals();
    if (!isObject(value)) return clean;
    const cleared = isObject(value.cleared) ? value.cleared : {};
    for (const mode of MODES) {
      const bucket = isObject(cleared[mode]) ? cleared[mode] : {};
      for (const layoutId of LAYOUT_IDS) {
        const count = bucket[layoutId];
        if (finiteInteger(count, 1)) clean.cleared[mode][layoutId] = Math.min(count, 1_000_000);
      }
    }
    if (Array.isArray(value.countedEvents)) {
      clean.countedEvents = [...new Set(
        value.countedEvents.filter(isValidGameId).map((id) => id.toLowerCase())
      )].slice(0, MAX_RECORD_EVENTS * 2);
    }
    return clean;
  }
```

In `normalizeRecords`, immediately after `const clean = emptyRecords();` and the version guard, before the `for (const layoutId of LAYOUT_IDS)` loop, add:

```js
    clean.totals = normalizeTotals(value.totals);
```

Replace `mergeEvents` inside `createRecordStore`:

```js
    // Best-of records are rebuilt from retained events, so re-applying them
    // on every read is harmless. Counts are not: once an event is pruned it
    // is gone, so `totals` is a durable aggregate. The order below is the
    // contract: count, persist, then prune only what was persisted, then
    // compact the counted list.
    function mergeEvents(records) {
      const events = storedRecordEvents(storage);
      let merged = normalizeRecords(records);
      const counted = new Set(merged.totals.countedEvents);
      for (const event of events) {
        merged = applyResult(merged, event.result, event.updatedAt);
        if (counted.has(event.eventId)) continue;
        const { mode, layoutId } = event.result;
        if (event.result.completed !== false && MODES.includes(mode) && LAYOUT_IDS.includes(layoutId)) {
          const bucket = merged.totals.cleared[mode];
          bucket[layoutId] = (bucket[layoutId] || 0) + 1;
        }
        counted.add(event.eventId);
      }
      merged.totals.countedEvents = [...counted];
      // Phase 1: persist counts for every seen event before anything is pruned.
      if (!write(merged)) return merged;
      // Phase 2: prune only counted events beyond the cap, oldest first. An
      // event another tab wrote after our snapshot is never in `counted`.
      const pruned = new Set();
      if (events.length > MAX_RECORD_EVENTS) {
        const excess = events.length - MAX_RECORD_EVENTS;
        for (const event of events.filter((entry) => counted.has(entry.eventId)).slice(0, excess)) {
          safeRemove(storage, event.key);
          pruned.add(event.eventId);
        }
      }
      // Phase 3: compact to ids still retained (best effort; a failed write
      // here only leaves extra ids until a later read succeeds).
      const retained = new Set(events.filter((entry) => !pruned.has(entry.eventId)).map((entry) => entry.eventId));
      const compacted = merged.totals.countedEvents.filter((id) => retained.has(id));
      if (compacted.length !== merged.totals.countedEvents.length) {
        merged.totals.countedEvents = compacted;
        write(merged);
      }
      return merged;
    }
```

Add `emptyTotals,` to the `MahjongState` export object right after `emptyRecords,`.

- [ ] **Step 4: Run the state suite**

Run: `node --test test/unit/mahjong-state.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: `# fail 0`. If `record events discard retired Arch revisions…` or `immutable record events recover both modes…` fail, check that `normalizeTotals` is applied before the per-layout loop and that `write()` still normalises (it calls `normalizeRecords`, which now preserves `totals`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/mahjong-state.js test/unit/mahjong-state.test.js
git commit -m "feat(mahjong): keep durable completion totals with two-phase event compaction

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `dailyStreak` and `recordsSummary` view model

**Files:**
- Modify: `src/renderer/pages/mahjong-state.js` (new pure functions near `describeDailyResult`, exports)
- Test: `test/unit/mahjong-state.test.js`

**Interfaces:**
- Produces:
  - `S.shiftDailyKey(key: string, days: number): string`
  - `S.dailyStreak(records, today?: Date|string): { current: number, longest: number, cleared: number }`
  - `S.recordsSummary(records, { today?, layoutIds?, currentLayoutId?, days? }): { overview: { cleared, streak, longest, dailies }, rows: Array<{ layoutId, classicBestMs: number|null, trayBestScore: number|null, trayBestMs: number|null, cleared: number, current: boolean }>, days: Array<{ key, cleared: boolean, today: boolean }> }` — `rows` follow `layoutIds` order; `days` are oldest-first and end with today.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/mahjong-state.test.js`:

```js
function dailyRecords(entries) {
  let records = S.emptyRecords();
  for (const [dailyKey, mode, layoutId] of entries) {
    records = S.applyResult(records, completion(layoutId, mode, { dailyKey }), 5);
  }
  return records;
}

test('dailyStreak counts consecutive local days with any completed daily', () => {
  assert.deepEqual(S.dailyStreak(S.emptyRecords(), '2026-09-02'), { current: 0, longest: 0, cleared: 0 });
  assert.deepEqual(S.dailyStreak(dailyRecords([['2026-09-02', 'classic', 'arch']]), '2026-09-02'), { current: 1, longest: 1, cleared: 1 });
  // yesterday only: today is not yet broken
  assert.deepEqual(S.dailyStreak(dailyRecords([['2026-09-01', 'tray', 'peaks']]), '2026-09-02'), { current: 1, longest: 1, cleared: 1 });
  // a gap resets current but keeps longest
  const gappy = dailyRecords([
    ['2026-08-20', 'classic', 'turtle'], ['2026-08-21', 'classic', 'turtle'], ['2026-08-22', 'tray', 'turtle'],
    ['2026-09-01', 'classic', 'arch'], ['2026-09-02', 'classic', 'arch'],
  ]);
  assert.deepEqual(S.dailyStreak(gappy, '2026-09-02'), { current: 2, longest: 3, cleared: 5 });
  // both modes on one day count once; two days ago does not extend the streak
  const doubled = dailyRecords([['2026-08-31', 'classic', 'peaks'], ['2026-08-31', 'tray', 'peaks']]);
  assert.deepEqual(S.dailyStreak(doubled, '2026-09-02'), { current: 0, longest: 1, cleared: 1 });
  assert.equal(S.shiftDailyKey('2026-03-01', -1), '2026-02-28');
  assert.equal(S.shiftDailyKey('2026-12-31', 1), '2027-01-01');
});

test('recordsSummary lays out eight rows in order, marks the current board, and ends its strip today', () => {
  const storage = new MemoryStorage();
  let clock = 100;
  const store = S.createRecordStore({ storage, now: () => clock, uuid: () => uuid(clock++) });
  store.record(completion('cross', 'classic', { elapsedMs: 90_000, dailyKey: '2026-09-02' }));
  store.record(completion('cross', 'classic', { elapsedMs: 80_000 }));
  store.record(completion('bridge', 'tray', { elapsedMs: 200_000, score: 4200, dailyKey: '2026-09-01' }));
  const summary = S.recordsSummary(store.read(), { today: '2026-09-02', currentLayoutId: 'bridge' });
  assert.deepEqual(summary.overview, { cleared: 3, streak: 2, longest: 2, dailies: 2 });
  assert.deepEqual(summary.rows.map((row) => row.layoutId), [...S.LAYOUT_IDS]);
  assert.deepEqual(summary.rows.find((row) => row.layoutId === 'cross'), {
    layoutId: 'cross', classicBestMs: 80_000, trayBestScore: null, trayBestMs: null, cleared: 2, current: false,
  });
  assert.deepEqual(summary.rows.find((row) => row.layoutId === 'bridge'), {
    layoutId: 'bridge', classicBestMs: null, trayBestScore: 4200, trayBestMs: 200_000, cleared: 1, current: true,
  });
  assert.equal(summary.rows.filter((row) => row.current).length, 1);
  assert.equal(summary.days.length, 28);
  assert.deepEqual(summary.days.at(-1), { key: '2026-09-02', cleared: true, today: true });
  assert.deepEqual(summary.days.at(-2), { key: '2026-09-01', cleared: true, today: false });
  assert.equal(summary.days[0].key, '2026-08-06');
  assert.equal(summary.days.filter((day) => day.cleared).length, 2);
  const empty = S.recordsSummary(S.emptyRecords(), { today: '2026-09-02' });
  assert.deepEqual(empty.overview, { cleared: 0, streak: 0, longest: 0, dailies: 0 });
  assert.ok(empty.rows.every((row) => row.classicBestMs === null && row.trayBestScore === null && row.cleared === 0 && !row.current));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/mahjong-state.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: both fail with `S.dailyStreak is not a function` / `S.recordsSummary is not a function`.

- [ ] **Step 3: Implement**

In `src/renderer/pages/mahjong-state.js`, after `describeDailyResult`:

```js
  function shiftDailyKey(key, days) {
    const [year, month, day] = dailyKey(key).split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + days));
    return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
  }

  function clearedDailyKeys(records) {
    const clean = normalizeRecords(records);
    return new Set(Object.entries(clean.daily)
      .filter(([, modes]) => MODES.some((mode) => modes[mode] && modes[mode].completed))
      .map(([key]) => key));
  }

  // Derived, never stored. A day counts when either mode's daily is complete.
  // `current` counts back from today, or from yesterday while today is still
  // open, so a streak is not shown as broken before the day is over.
  function dailyStreak(records, today = new Date()) {
    const days = clearedDailyKeys(records);
    const todayKey = dailyKey(today);
    let cursor = days.has(todayKey) ? todayKey : shiftDailyKey(todayKey, -1);
    let current = 0;
    while (days.has(cursor)) {
      current += 1;
      cursor = shiftDailyKey(cursor, -1);
    }
    let longest = 0;
    let run = 0;
    let previous = null;
    for (const key of [...days].sort()) {
      run = previous !== null && shiftDailyKey(previous, 1) === key ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = key;
    }
    return { current, longest, cleared: days.size };
  }

  function recordsSummary(records, { today = new Date(), layoutIds = LAYOUT_IDS, currentLayoutId = null, days = 28 } = {}) {
    const clean = normalizeRecords(records);
    const streak = dailyStreak(clean, today);
    const rows = layoutIds.map((layoutId) => {
      const classic = clean.classic[layoutId] || null;
      const tray = clean.tray[layoutId] || null;
      return {
        layoutId,
        classicBestMs: classic ? classic.bestTimeMs : null,
        trayBestScore: tray ? tray.bestScore : null,
        trayBestMs: tray ? tray.bestTimeMs : null,
        cleared: (clean.totals.cleared.classic[layoutId] || 0) + (clean.totals.cleared.tray[layoutId] || 0),
        current: layoutId === currentLayoutId,
      };
    });
    const cleared = rows.reduce((sum, row) => sum + row.cleared, 0);
    const clearedDays = clearedDailyKeys(clean);
    const todayKey = dailyKey(today);
    const strip = [];
    for (let offset = days - 1; offset >= 0; offset--) {
      const key = shiftDailyKey(todayKey, -offset);
      strip.push({ key, cleared: clearedDays.has(key), today: offset === 0 });
    }
    return {
      overview: { cleared, streak: streak.current, longest: streak.longest, dailies: streak.cleared },
      rows,
      days: strip,
    };
  }
```

Add to the `MahjongState` export object after `describeDailyResult,`:

```js
    shiftDailyKey,
    dailyStreak,
    recordsSummary,
```

- [ ] **Step 4: Run the state suite**

Run: `node --test test/unit/mahjong-state.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/mahjong-state.js test/unit/mahjong-state.test.js
git commit -m "feat(mahjong): derive daily streaks and a records summary from stored results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Records sheet markup, dock button, icon, and CSS

**Files:**
- Modify: `src/renderer/pages/mahjong.html` (dock button, sheet section)
- Modify: `src/renderer/pages/mahjong-icons.svg` (`records` symbol)
- Modify: `src/renderer/pages/mahjong.css` (dock six-up, desktop rail six rows, records styles)
- Test: `test/unit/mahjong-page.test.js`

**Interfaces:**
- Produces: ids `mjRecords`, `mjRecordsSheet`, `mjRecordsScrim`, `mjRecordsClose`, `mjRecordsTitle`, `mjRecordsCleared`, `mjRecordsStreak`, `mjRecordsLongest`, `mjRecordsDailies`, `mjRecordsRows`, `mjRecordsDays`, `mjRecordsDaysCaption`; classes `mj-records-card`, `mj-records-overview`, `mj-records-table`, `mj-records-days`, `mj-records-strip`. Task 7 fills them.

- [ ] **Step 1: Update the pinned dock tests and add records tests (failing)**

In `test/unit/mahjong-page.test.js`:

Change the icon list in `the game dock uses one local professional SVG icon family…` to:

```js
  for (const icon of ['boards', 'records', 'undo', 'hint', 'shuffle', 'sound-on', 'sound-off']) {
```

In `desktop Mahjong overlays its left rail inside a centered full-width table`, change `repeat\(5,\s*64px\)` to `repeat\(6,\s*64px\)`.

Append:

```js
test('the Records dock action and sheet are wired with accessible semantics', () => {
  const icons = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/mahjong-icons.svg'), 'utf8');
  assert.match(icons, /<symbol id="records" viewBox="0 0 24 24">/);
  assert.match(html, /<button id="mjRecords" class="mj-dock-action" type="button" aria-label="Records" data-tooltip="Records" aria-haspopup="dialog" aria-controls="mjRecordsSheet" aria-keyshortcuts="R">[\s\S]*?mahjong-icons\.svg#records[\s\S]*?data-dock-label>records<\/span>/);
  assert.match(html, /id="mjSetup"[\s\S]*id="mjRecords"[\s\S]*id="mjUndo"/, 'records follows boards in the dock');
  assert.match(html, /<section id="mjRecordsSheet" class="mj-modal" role="dialog" aria-modal="true" aria-labelledby="mjRecordsTitle" hidden>/);
  for (const id of ['mjRecordsScrim', 'mjRecordsClose', 'mjRecordsCleared', 'mjRecordsStreak', 'mjRecordsLongest', 'mjRecordsDailies', 'mjRecordsRows', 'mjRecordsDays', 'mjRecordsDaysCaption']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(html, /<table class="mj-records-table">\s*<caption>best results by board<\/caption>\s*<thead>\s*<tr>\s*<th scope="col">board<\/th>\s*<th scope="col">classic best<\/th>\s*<th scope="col">burst best<\/th>\s*<th scope="col">cleared<\/th>/);
  assert.match(html, /<tbody id="mjRecordsRows"><\/tbody>/);
  assert.match(mahjongStyles, /\.mj-dock\s*\{[^}]*grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(mahjongStyles, /\.mj-records-overview\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(mahjongStyles, /\.mj-records-table tr\[aria-current="true"\] th\s*\{/);
  assert.match(mahjongStyles, /\.mj-records-strip i\.is-cleared\s*\{/);
  assert.match(mahjongStyles, /\.mj-records-strip i\.is-today\s*\{/);
  assert.match(mahjongStyles, /@media \(min-width: 1000px\) and \(min-height: 611px\) and \(max-height: 720px\)\s*\{[^@]*\.mj-dock\s*\{[^}]*repeat\(6, 54px\)/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/mahjong-page.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: three failures: the icon-family test (`missing records dock icon`), the desktop rail test (`repeat(6, 64px)`), and the new test.

- [ ] **Step 3: Icon symbol**

In `src/renderer/pages/mahjong-icons.svg`, after the `boards` symbol:

```xml
  <symbol id="records" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="9" r="5.2" />
      <path d="M9.2 13.4 7.6 21l4.4-2.2 4.4 2.2-1.6-7.6" />
      <path d="M10.4 9.2l1.1 1.1 2.2-2.4" />
    </g>
  </symbol>
```

- [ ] **Step 4: Dock button and sheet markup**

In `src/renderer/pages/mahjong.html`, inside `<nav class="mj-dock">`, immediately after the `#mjSetup` button:

```html
      <button id="mjRecords" class="mj-dock-action" type="button" aria-label="Records" data-tooltip="Records" aria-haspopup="dialog" aria-controls="mjRecordsSheet" aria-keyshortcuts="R">
        <svg class="mj-dock-icon" aria-hidden="true"><use href="mahjong-icons.svg#records"></use></svg>
        <span data-dock-label>records</span>
      </button>
```

After the closing `</section>` of `#mjSetupSheet` and before `#mjRescue`:

```html
    <section id="mjRecordsSheet" class="mj-modal" role="dialog" aria-modal="true" aria-labelledby="mjRecordsTitle" hidden>
      <div id="mjRecordsScrim" class="mj-modal-scrim" aria-hidden="true"></div>
      <div class="mj-setup-card mj-records-card">
        <header class="mj-modal-head">
          <div><p class="mj-overline">your table</p><h1 id="mjRecordsTitle">Records</h1></div>
          <button id="mjRecordsClose" class="mj-close" type="button" aria-label="Close records">×</button>
        </header>

        <div class="mj-records-overview" aria-label="Overview">
          <span><small>boards cleared</small><strong id="mjRecordsCleared">0</strong></span>
          <span><small>daily streak</small><strong id="mjRecordsStreak">0</strong></span>
          <span><small>longest streak</small><strong id="mjRecordsLongest">0</strong></span>
          <span><small>dailies cleared</small><strong id="mjRecordsDailies">0</strong></span>
        </div>

        <table class="mj-records-table">
          <caption>best results by board</caption>
          <thead>
            <tr>
              <th scope="col">board</th>
              <th scope="col">classic best</th>
              <th scope="col">burst best</th>
              <th scope="col">cleared</th>
            </tr>
          </thead>
          <tbody id="mjRecordsRows"></tbody>
        </table>

        <div class="mj-records-days">
          <div id="mjRecordsDays" class="mj-records-strip" role="img" aria-label="No dailies cleared in the last 28 days."></div>
          <p id="mjRecordsDaysCaption">no dailies cleared yet</p>
        </div>
      </div>
    </section>
```

- [ ] **Step 5: CSS**

In `src/renderer/pages/mahjong.css`:

1. In the base `.mj-dock` rule, change `grid-template-columns: repeat(5, minmax(0, 1fr));` to `grid-template-columns: repeat(6, minmax(0, 1fr));`.
2. In the desktop `@media (min-width: 1000px) and (min-height: 611px)` block's `.mj-dock` rule, change `grid-template-rows: repeat(5, 64px);` to `grid-template-rows: repeat(6, 64px);`.
3. Immediately after that desktop media block's closing `}` (before `@media (max-width: 1080px)`), add the short-desktop fallback so a six-control rail still fits a 611–720 px tall table:

```css
@media (min-width: 1000px) and (min-height: 611px) and (max-height: 720px) {
  .mj-dock { grid-template-rows: repeat(6, 54px); gap: 10px; width: 54px; }
  .mj-dock > button { width: 54px; height: 54px; }
  .mj-dock-icon { width: 28px; height: 28px; flex-basis: 28px; }
}
```

4. After the `.mj-win-daily[hidden]` rule, add the records styles:

```css
/* Records sheet: reuses the setup card shell; the overview tiles mirror the
   completion card's stat tiles, the table is semantic and tabular. */
.mj-records-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.mj-records-overview span {
  min-height: 67px;
  display: grid;
  place-content: center;
  gap: 7px;
  padding: 8px;
  border: 1px solid rgba(226, 195, 120, 0.2);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.035);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.06), 0 8px 18px rgba(0, 8, 6, 0.14);
  text-align: center;
}
.mj-records-overview small { color: var(--mj-muted); font: 660 10px/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; }
.mj-records-overview strong { color: var(--mj-ivory); font: 760 22px/1 var(--font-mono); font-variant-numeric: tabular-nums; }

.mj-records-table {
  width: 100%;
  margin-top: 22px;
  border-collapse: collapse;
  color: var(--mj-ivory);
  font: 520 12px/1.4 var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.mj-records-table caption {
  caption-side: top;
  padding-bottom: 9px;
  color: var(--mj-muted);
  font: 660 10px/1 var(--font-mono);
  letter-spacing: 0.14em;
  text-align: left;
  text-transform: uppercase;
}
.mj-records-table th,
.mj-records-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--mj-line);
  text-align: left;
  vertical-align: middle;
}
.mj-records-table th[scope="col"] {
  color: var(--mj-muted);
  font: 600 10px/1 var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.mj-records-table th[scope="row"] { font-weight: 660; }
.mj-records-table th:not(:first-child),
.mj-records-table td:not(:first-child) { text-align: right; }
.mj-records-table tr[aria-current="true"] th {
  box-shadow: inset 3px 0 0 var(--mj-brass);
  color: var(--mj-brass-bright);
}

.mj-records-days { margin-top: 22px; }
.mj-records-strip {
  display: grid;
  grid-template-columns: repeat(14, minmax(0, 1fr));
  gap: 5px;
  max-width: 420px;
}
.mj-records-strip i {
  display: block;
  aspect-ratio: 1;
  border: 1px solid var(--mj-line);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
}
.mj-records-strip i.is-cleared {
  border-color: var(--mj-brass);
  background: var(--mj-brass);
}
.mj-records-strip i.is-today {
  outline: 1px solid var(--mj-ivory);
  outline-offset: 1px;
}
.mj-records-days p { margin: 9px 0 0; color: var(--mj-muted); font: 520 11px/1.4 var(--font-mono); }
```

5. Inside the existing `@media (max-width: 780px)` block, add:

```css
  .mj-records-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mj-records-table { font-size: 11px; }
  .mj-records-table th, .mj-records-table td { padding: 7px 6px; }
```

- [ ] **Step 6: Run the page suite**

Run: `node --test test/unit/mahjong-page.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: `# fail 0`. The `the Mahjong stylesheet has balanced blocks` test guards the CSS edits.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/mahjong.html src/renderer/pages/mahjong-icons.svg src/renderer/pages/mahjong.css test/unit/mahjong-page.test.js
git commit -m "feat(mahjong): add the Records dock action and sheet markup

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Records sheet behaviour

**Files:**
- Modify: `src/renderer/pages/mahjong.js` (`activeModal`, keydown handler, new records section, dock wiring)
- Test: `test/unit/mahjong-page.test.js`

**Interfaces:**
- Consumes: `S.recordsSummary` (Task 5), ids from Task 6, existing `pauseTimer`, `startTimer`, `setDialogVisible`, `formatMs`, `E.LAYOUTS`.
- Produces: top-level `openRecords()`, `closeRecords()`, `paintRecords()` (classic-script globals; Task 8's test hook calls the first two by name).

- [ ] **Step 1: Write the failing test**

Append to `test/unit/mahjong-page.test.js`:

```js
test('the Records sheet opens from the dock and R, paints from the pure summary, and returns focus', () => {
  assert.match(controller, /function activeModal\(\) \{\s*return \['mjSetupSheet', 'mjRecordsSheet', 'mjRescue', 'mjWin'\]/);
  assert.match(controller, /function paintRecords\(\)[\s\S]*?S\.recordsSummary\(recordStore\.read\(\), \{[\s\S]*?currentLayoutId: game\?\.layoutId \|\| null/);
  assert.match(controller, /function openRecords\(\) \{\s*pauseTimer\(\);\s*paintRecords\(\);\s*setDialogVisible\(document\.getElementById\('mjRecordsSheet'\), true\);/);
  assert.match(controller, /function closeRecords\(\) \{[\s\S]*?setDialogVisible\(document\.getElementById\('mjRecordsSheet'\), false\);[\s\S]*?document\.getElementById\('mjRecords'\)\?\.focus\(\);/);
  assert.match(controller, /if \(event\.key === 'Escape' && modal\.id === 'mjRecordsSheet'\) \{[\s\S]*?closeRecords\(\);/);
  assert.match(controller, /!event\.altKey && key === 'r'\) \{\s*event\.preventDefault\(\);\s*openRecords\(\);/);
  assert.match(controller, /getElementById\('mjRecords'\)\?\.addEventListener\('click', openRecords\)/);
  assert.match(controller, /getElementById\('mjRecordsClose'\)\?\.addEventListener\('click', closeRecords\)/);
  assert.match(controller, /getElementById\('mjRecordsScrim'\)\?\.addEventListener\('click', closeRecords\)/);
  // rows are real table semantics built per layout, with the current board marked
  assert.match(controller, /name\.scope = 'row'/);
  assert.match(controller, /tr\.setAttribute\('aria-current', 'true'\)/);
  assert.match(controller, /'No dailies cleared in the last 28 days\.'/);
  assert.match(controller, /`cleared \$\{clearedDays\.length\} of the last 28 dailies`/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/unit/mahjong-page.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: the new test fails on the `activeModal` regex.

- [ ] **Step 3: Implement**

In `src/renderer/pages/mahjong.js`:

1. `activeModal()`:

```js
function activeModal() {
  return ['mjSetupSheet', 'mjRecordsSheet', 'mjRescue', 'mjWin']
    .map((id) => document.getElementById(id))
    .find((element) => element && !element.hidden) || null;
}
```

2. In the keydown handler's modal branch, right after the `mjSetupSheet` Escape block:

```js
    if (event.key === 'Escape' && modal.id === 'mjRecordsSheet') {
      event.preventDefault();
      closeRecords();
      return;
    }
```

3. In the non-modal shortcut chain, after the `key === 's'` branch and before the `Escape` deselect branch:

```js
  } else if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 'r') {
    event.preventDefault();
    openRecords();
```

4. After the `closeSetup()`/`startSetupChoice()` functions (before the `for (const button of document.querySelectorAll('#mjSetupSheet button[data-layout]'))` loop), add the records section:

```js
// --- records sheet -----------------------------------------------------------
// Everything shown here is derived by S.recordsSummary from the local records
// aggregate; this file only maps that view model to DOM.

function paintRecords() {
  if (!recordStore) return;
  const summary = S.recordsSummary(recordStore.read(), {
    today: new Date(),
    layoutIds: S.LAYOUT_IDS,
    currentLayoutId: game?.layoutId || null,
  });
  document.getElementById('mjRecordsCleared').textContent = summary.overview.cleared.toLocaleString();
  document.getElementById('mjRecordsStreak').textContent = String(summary.overview.streak);
  document.getElementById('mjRecordsLongest').textContent = String(summary.overview.longest);
  document.getElementById('mjRecordsDailies').textContent = String(summary.overview.dailies);

  const rows = document.getElementById('mjRecordsRows');
  rows.replaceChildren(...summary.rows.map((row) => {
    const tr = document.createElement('tr');
    if (row.current) tr.setAttribute('aria-current', 'true');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = E.LAYOUTS[row.layoutId]?.name || row.layoutId;
    const classic = document.createElement('td');
    classic.textContent = row.classicBestMs == null ? '—' : formatMs(row.classicBestMs);
    const burst = document.createElement('td');
    burst.textContent = row.trayBestScore == null
      ? '—'
      : `${row.trayBestScore.toLocaleString()} · ${formatMs(row.trayBestMs)}`;
    const cleared = document.createElement('td');
    cleared.textContent = String(row.cleared);
    tr.append(name, classic, burst, cleared);
    return tr;
  }));

  const strip = document.getElementById('mjRecordsDays');
  strip.replaceChildren(...summary.days.map((day) => {
    const cell = document.createElement('i');
    cell.classList.toggle('is-cleared', day.cleared);
    cell.classList.toggle('is-today', day.today);
    return cell;
  }));
  const clearedDays = summary.days.filter((day) => day.cleared);
  strip.setAttribute('aria-label', clearedDays.length
    ? `Daily cleared on ${clearedDays.map((day) => day.key).join(', ')}.`
    : 'No dailies cleared in the last 28 days.');
  document.getElementById('mjRecordsDaysCaption').textContent = clearedDays.length
    ? `cleared ${clearedDays.length} of the last 28 dailies`
    : 'no dailies cleared yet';
}

function openRecords() {
  pauseTimer();
  paintRecords();
  setDialogVisible(document.getElementById('mjRecordsSheet'), true);
}

function closeRecords() {
  setDialogVisible(document.getElementById('mjRecordsSheet'), false);
  document.getElementById('mjRecords')?.focus();
  if (!document.hidden && embedActive && hasStarted && game?.status === 'playing') startTimer();
}

document.getElementById('mjRecords')?.addEventListener('click', openRecords);
document.getElementById('mjRecordsClose')?.addEventListener('click', closeRecords);
document.getElementById('mjRecordsScrim')?.addEventListener('click', closeRecords);
```

- [ ] **Step 4: Run the page suite**

Run: `node --test test/unit/mahjong-page.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: `# fail 0`. If the `key === 'r'` regex fails, check the branch is written exactly as `} else if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 'r') {`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/mahjong.js test/unit/mahjong-page.test.js
git commit -m "feat(mahjong): open the Records sheet from the dock and the R key

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Desktop acceptance: records containment and focus return

**Files:**
- Modify: `src/main/test-hook.js` (new `readMahjongRecordsGeometry` after `readMahjongCompletionGeometry`)
- Modify: `test/desktop/steps/newtab-layouts.steps.js` (new `Then` step)
- Modify: `spec/acceptance/newtab-layouts.feature` (one line in the `Mahjong layout embeds a playable deal` scenario)

**Interfaces:**
- Consumes: globals `openRecords`/`closeRecords` from Task 7; ids from Task 6.
- Produces: hook `readMahjongRecordsGeometry()` returning `{ card, viewport, scrollWidth, clientWidth, overflowY, rowCount, focusReturned, viewportWidth, viewportHeight }`.

- [ ] **Step 1: Add the feature line and step (the dry run will report the step as undefined until Step 3)**

In `spec/acceptance/newtab-layouts.feature`, after `And the Mahjong completion dialog remains usable at the minimum desktop size`, add:

```gherkin
    And the Mahjong records sheet stays contained at the default and minimum desktop sizes
```

Run: `npm run test:acceptance:dry 2>&1 | tail -6`
Expected: the dry run reports 1 undefined step (this proves the step binding below is what satisfies it).

- [ ] **Step 2: Add the test hook**

In `src/main/test-hook.js`, immediately after the `readMahjongCompletionGeometry()` method:

```js
    async readMahjongRecordsGeometry() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return null;
      const frame = tab.view.webContents.mainFrame.framesInSubtree
        .find((candidate) => candidate.url.startsWith('blanc://mahjong/'));
      if (!frame) return null;
      try {
        return await frame.executeJavaScript(`(async () => {
          const sheet = document.getElementById('mjRecordsSheet');
          const card = sheet?.querySelector('.mj-records-card');
          const trigger = document.getElementById('mjRecords');
          if (!sheet || !card || !trigger || typeof openRecords !== 'function' || typeof closeRecords !== 'function') return null;
          if (!sheet.hidden) closeRecords();
          openRecords();
          await new Promise((resolve) => setTimeout(resolve, 320));
          const cardRect = card.getBoundingClientRect();
          const measured = {
            card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom },
            viewport: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
            scrollWidth: card.scrollWidth,
            clientWidth: card.clientWidth,
            overflowY: getComputedStyle(card).overflowY,
            rowCount: document.querySelectorAll('#mjRecordsRows tr').length,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
          };
          closeRecords();
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
          measured.focusReturned = document.activeElement === trigger;
          return measured;
        })()`);
      } catch {
        return null;
      }
    },
```

- [ ] **Step 3: Add the step**

In `test/desktop/steps/newtab-layouts.steps.js`, after the `the Mahjong completion dialog remains usable at the minimum desktop size` step:

```js
Then('the Mahjong records sheet stays contained at the default and minimum desktop sizes', async function () {
  const original = await this.call('windowContentBounds');
  assert.ok(original, 'window content bounds should be available');
  try {
    for (const size of [{ width: 1280, height: 800 }, { width: 640, height: 480 }]) {
      await this.call('setWindowContentSize', size.width, size.height);
      await waitForValue(
        () => this.call('windowContentBounds'),
        (bounds) => bounds?.width === size.width && bounds?.height === size.height,
        `${size.width}x${size.height} desktop content bounds`
      );
      const records = await waitForValue(
        () => this.call('readMahjongRecordsGeometry'),
        (value) => value?.viewportWidth === size.width,
        `Mahjong records sheet at ${size.width}x${size.height}`
      );
      const context = `records sheet at ${size.width}x${size.height}`;
      assert.equal(records.rowCount, 8, `${context} lists every layout`);
      assert.ok(records.scrollWidth <= records.clientWidth + 1, `${context} scrolls horizontally`);
      assert.equal(records.overflowY, 'auto', `${context} must scroll vertically when needed`);
      assert.ok(records.card.left >= records.viewport.left - 1, `${context} overflows left`);
      assert.ok(records.card.top >= records.viewport.top - 1, `${context} overflows top`);
      assert.ok(records.card.right <= records.viewport.right + 1, `${context} overflows right`);
      assert.ok(records.card.bottom <= records.viewport.bottom + 1, `${context} overflows bottom`);
      assert.equal(records.focusReturned, true, `${context} must return focus to the records control`);
    }
  } finally {
    await this.call('setWindowContentSize', original.width, original.height);
    await waitForValue(
      () => this.call('windowContentBounds'),
      (bounds) => bounds?.width === original.width && bounds?.height === original.height,
      'restored desktop content bounds'
    );
  }
});
```

- [ ] **Step 4: Dry run resolves; unit guards still green**

Run: `npm run test:acceptance:dry 2>&1 | tail -4`
Expected: `130 scenarios (130 skipped)`, `0 undefined`.
Run: `node --test test/unit/ 2>&1 | grep -E "^# (pass|fail)"` — some test-hook wiring is unit-guarded (`test/unit/*test-hook*`), so run the whole directory.
Expected: only the pre-existing `compliance-model` license-file failure, if that environment failure is still present; nothing Mahjong-related.

The desktop run itself (`npm run test:acceptance:desktop`) cannot run in this environment; the PR test plan must carry it as an unchecked item for the owner or CI.

- [ ] **Step 5: Commit**

```bash
git add src/main/test-hook.js test/desktop/steps/newtab-layouts.steps.js spec/acceptance/newtab-layouts.feature
git commit -m "test(mahjong): assert the Records sheet stays contained and returns focus

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Browser verification pass and spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-mahjong-layouts-records-design.md` (status line only)

**Interfaces:** none.

- [ ] **Step 1: Serve the pages directory and load the game**

```bash
cd src/renderer/pages && (nohup python3 -m http.server 4399 --bind 127.0.0.1 >/dev/null 2>&1 &) && sleep 1 && lsof -nP -iTCP:4399 -sTCP:LISTEN | tail -1
```

Open `http://127.0.0.1:4399/mahjong.html` in the Browser pane at 1280×800.

- [ ] **Step 2: Each new layout renders inside the table**

For each of `pyramid`, `fortress`, `butterfly`, `bridge`, `cross`, run in the page:

```js
startGame({ layoutId: '<id>', mode: 'classic', seed: 7 });
await new Promise((r) => setTimeout(r, 300));
const frame = document.querySelector('.mj-board-frame').getBoundingClientRect();
const off = tileButtons.filter((b) => { const r = b.getBoundingClientRect(); return r.left < frame.left || r.right > frame.right || r.top < frame.top || r.bottom > frame.bottom; }).length;
({ layout: game.layoutId, tiles: tileButtons.length, offCanvas: off, free: document.querySelectorAll('.mj-tile:not([data-blocked])').length })
```

Expected: `offCanvas: 0` for every layout; `tiles` equal to 108/96/94/100/86; `free` equal to 26/20/43/8/17. Take one screenshot per layout. Repeat `bridge` and `cross` at 720×560 (`resize_window`) and confirm `offCanvas: 0`.

- [ ] **Step 3: Boards sheet at three widths**

Open Boards (dock, first button) at 1280×800, 900×700, and 720×560; screenshot each. Expected: four columns, two columns, one column; eight cards; the daily card set reads disabled.

- [ ] **Step 4: Records sheet empty and populated**

Clear storage, reload, press `R`, screenshot: zeros, eight "—" rows, "no dailies cleared yet". Close with Esc and confirm `document.activeElement.id === 'mjRecords'`. Then script a Peaks Classic clear:

```js
startGame({ layoutId: 'peaks', mode: 'classic', seed: 11 });
const plan = window.MahjongEngine.generateDeal({ seed: game.seed, layoutId: 'peaks' }).solution;
for (const [a, b] of plan) { tileButtons[a].click(); await new Promise((r) => setTimeout(r, 25)); tileButtons[b].click(); await new Promise((r) => setTimeout(r, 25)); }
await new Promise((r) => setTimeout(r, 900)); game.status
```

Then run a Daily Burst clear the same way after `startGame({ ...window.MahjongState.dailyDeal(new Date()), mode: 'tray' })` (Burst: click first then second of each solution pair; wait for `!document.getElementById('mjBoard').hasAttribute('aria-busy')` between pairs). Open Records: expected boards cleared 2, daily streak 1, the Peaks row shows a classic time, the daily layout's row shows a burst score, the last strip square is filled and outlined. Screenshot at 1280×800 and at 640×480 (the card must scroll vertically, never horizontally: check `card.scrollWidth <= card.clientWidth`).

- [ ] **Step 5: Stop the server, run everything**

```bash
kill $(lsof -tnP -iTCP:4399 -sTCP:LISTEN) 2>/dev/null; npm run test:unit 2>&1 | grep -E "^# (pass|fail)|^not ok"; npm run test:acceptance:dry 2>&1 | tail -2
```

Expected: only the pre-existing `compliance-model` failure (if any); dry run resolves.

- [ ] **Step 6: Record status in the spec and commit**

Add under the spec's `**Status:**` line: `Implemented on branch claude/mahjong-layouts-stats (see docs/superpowers/plans/2026-09-02-mahjong-layouts-records.md).`

```bash
git add docs/superpowers/specs/2026-09-02-mahjong-layouts-records-design.md
git commit -m "docs: mark the Mahjong layouts/records spec implemented

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then push and open the PR (`gh pr create --base main`), carrying the browser-pass screenshots' findings in the test plan and an unchecked item for `npm run test:acceptance:desktop` (new step: records containment at 1280×800 and 640×480) plus a hand-check that the six-control desktop rail fits at the app's 1000×611 breakpoint.
