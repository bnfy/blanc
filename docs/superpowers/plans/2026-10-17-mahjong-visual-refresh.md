# Mahjong Sunrise Refresh Implementation Plan

> Revised October 17, 2026 after owner review: the implementation must use
> shared Sunrise tokens, the real Start Page sunrise landscape and the authentic
> Sunrise mark. Blue/lilac sky palettes and the synthetic canvas sunrise
> described in earlier tasks below are superseded.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Blanc Mahjong's dark lacquer look with a light Dawn sky (Evening sky in dark mode), refresh the tile art's finish, move the type to Inter Bold numerals plus Instrument Sans UI, and add a match trail and a board-cleared celebration.

**Architecture:** All theming lives in custom properties on `.mahjong-body` in `mahjong.css`. The lacquer image and its two pseudo-element layers are replaced by gradient tokens. Tile art is regenerated from preserved originals by a reproducible `sharp` script with a `--check` mode wired into `substrate:check`. Trail geometry and celebration tiering live in a new pure, Node-testable `mahjong-fx.js` (same dual-export pattern as `mahjong-sound.js`), and `mahjong.js` only places DOM nodes and hooks them into the existing animation bookkeeping.

**Tech Stack:** Plain JS + CSS in `src/renderer/pages/`, `node --test`, `sharp` (already a dependency), Playwright `_electron` smoke (`npm run test:mahjong-standalone`).

**Spec:** `docs/superpowers/specs/2026-10-17-mahjong-visual-refresh-design.md`

## Global Constraints

- Flat-file serving: every new runtime file sits directly in `src/renderer/pages/` (no subdirectories).
- `mahjong.html` CSP stays exactly as it is (`script-src 'self'; img-src 'self'; connect-src 'none'`). No remote assets.
- CSS over inline styles. Per-element geometry is passed as CSS custom properties (`el.style.setProperty('--mj-…', …)`), never as `style.left`/`style.top` on new elements.
- No behaviour change in `mahjong-engine.js` or `mahjong-state.js`. Their test files must pass untouched.
- Do not change `mahjong-sound.js`.
- Light Dawn sky gradient: `#cfe6f7` 0%, `#f3ecf0` 45%, `#fde4cc` 80%, `#fbd7b4` 100%. Tile face `#ffffff`→`#fdf7ef`, edge `#ecc9a2`, shadow `rgba(160,100,50,.18)`. Pills `#ffffffd9`, pill text `#6b5440`. Accent `#ff9f43`. Text `#2a2017`.
- Evening sky: `#1c2340` 0%, `#2e2a4a` 45%, `#5a3a46` 80%, `#7a4a3c` 100%. Tile face `#f7f0e5`→`#ece2d2`, edge `#b9875f`, shadow `rgba(0,0,0,.35)`. Pills `rgba(255,255,255,.1)`, pill text `#eadfce`. Accent `#ffb35c`.
- Private tabs: the same structure shifted to lilac. Starting values: day `#e3dcf5`, `#f3eef8`, `#f6e3ef`, `#efd3e6`, accent `#b07ce0`; night `#1d1830`, `#2b2140`, `#4a2f4f`, `#5e3a52`, accent `#d2a8f0`.
- Suit inks keep ≥ 4.5:1 contrast on both tile faces (`#fdf7ef` and `#ece2d2`).
- Character numerals: Inter 700, about -0.02em. Every other game string uses Instrument Sans via shared `--font-text`. Score, timer, pair counts and key caps stay Inter with `font-variant-numeric: tabular-nums`.
- JetBrains Mono stays bundled (removal is a separate follow-up).
- The Blanc "B" on the white dragon tiles must remain.
- Any new visible or announced string goes in `copy/messages/en.json` and every shipped language (de, es, fr, pt-BR, it) in the same PR, with `npm run copy:ack -- <locale> <keys>`. This plan adds none if followed as written.
- The website preview (`site/src/scripts/mahjong-preview.js`) is out of scope until a public release.
- Verify visually in the real app (`npm start` or a Playwright `_electron` probe), never the Browser pane, because it reports `document.hidden` and freezes Mahjong's animations.
- PR boundaries: **PR 1** = Tasks 1–3, **PR 2** = Task 4, **PR 3** = Tasks 5–7. Task 8 runs before each PR.

## Review Focus

1. Undo, shuffle, new deal, or switching boards while a trail or the celebration is on screen should cancel it cleanly, leaving no stray overlay and no delayed card. Covered in Task 6 Step 1c and Task 7 Step 1c.
2. Window resize or board refit while a trail is visible: the trail must stay attached to the board, not float at stale coordinates. Owned by Task 6, which positions in board-frame coordinates and removes on `invalidateTileAnimations`.
3. A board won while the tab is hidden (`document.hidden`) should show the results card immediately when the player returns, never be stuck waiting for an animation that never ran. Covered in Task 7 Step 1b.
4. Small boards and narrow windows: the trail's thickness scales with tile size so it never covers neighbouring symbols. Covered in Task 5 `trailGeometry` thickness test.
5. Suit-ink legibility in the evening and private themes, where the tile face is darker. Covered in the Task 1 contrast test against both faces.

---

### Task 1: Dawn and Evening sky palette and backdrop

**Files:**
- Modify: `src/renderer/pages/mahjong.css:1-115` (token block, `::before`/`::after`, dark block, private block)
- Delete: `src/renderer/pages/mahjong-lacquer.webp`
- Test: `test/unit/mahjong-page.test.js` (replace the test at line 444 "mahjong restores its local lacquer palette…")

**Interfaces:**
- Produces, as custom properties on `.mahjong-body` that Tasks 2, 6 and 7 consume: `--mj-sky-1`…`--mj-sky-4` (gradient stops), `--mj-text`, `--mj-text-muted`, `--mj-pill`, `--mj-pill-text`, `--mj-pill-line`, `--mj-surface` (dialogs and sheets), `--mj-surface-line`, `--mj-accent`, `--mj-accent-soft` (accent at ~25% alpha, for glows), `--mj-tile-top`, `--mj-tile-bottom`, `--mj-tile-edge`, `--mj-tile-shadow`, and suit inks `--mj-red`, `--mj-green`, `--mj-blue`, `--mj-flower`, `--mj-season`.
- Retired names: `--mj-table*`, `--mj-panel*`, `--mj-brass*`, `--mj-ivory*`, `--mj-line*`, `--mj-muted`, `--mj-tile-side`, `--mj-focus`, `--mj-hint`. Task 2 removes their remaining uses. Until then, keep temporary aliases (for example `--mj-brass: var(--mj-accent)`) at the end of the token block, marked `/* removed in Task 2 */`, so the page still renders.

- [ ] **Step 1: Write the failing tests**

Replace the lacquer test with:

```js
test('mahjong paints a local Dawn sky with an Evening sky in dark mode', () => {
  assert.doesNotMatch(mahjongStyles, /mahjong-lacquer|url\(/, 'no backdrop image');
  assert.ok(!fs.existsSync(path.join(__dirname, '../../src/renderer/pages/mahjong-lacquer.webp')));
  for (const token of ['#cfe6f7', '#f3ecf0', '#fde4cc', '#fbd7b4', '#ff9f43']) assert.ok(mahjongStyles.includes(token), token);
  const dark = mediaBlocks('(prefers-color-scheme: dark)').join('\n');
  for (const token of ['#1c2340', '#2e2a4a', '#5a3a46', '#7a4a3c', '#ffb35c']) assert.ok(dark.includes(token), token);
  assert.match(mahjongStyles, /\.mahjong-body\s*\{[^}]*color-scheme:\s*light;/);
  assert.match(dark, /color-scheme:\s*dark;/);
  assert.match(mahjongStyles, /:root\[data-theme="private"\] \.mahjong-body\s*\{[^}]*--mj-sky-1:\s*#e3dcf5/);
});

test('suit inks stay legible on both tile faces', () => {
  // contrast(hexA, hexB) per WCAG 2.x relative luminance; write the helper in this file.
  const inks = ['--mj-red', '--mj-green', '--mj-blue', '--mj-flower', '--mj-season'].map((name) =>
    mahjongStyles.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))[1]);
  for (const ink of inks) for (const face of ['#fdf7ef', '#ece2d2']) {
    assert.ok(contrast(ink, face) >= 4.5, `${ink} on ${face}`);
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test --test-name-pattern="Dawn sky|suit inks" test/unit/mahjong-page.test.js`
Expected: FAIL (lacquer url present, sky tokens missing).

- [ ] **Step 3: Implement the palette**

Rewrite the token block with the Global Constraints values. Starting suit inks: red `#c8432f`, green `#1c7f53`, blue `#2f6bb8`, flower `#b83a66`, season `#94601a` (tune until the contrast test passes). Set the body background to `linear-gradient(180deg, var(--mj-sky-1) 0%, var(--mj-sky-2) 45%, var(--mj-sky-3) 80%, var(--mj-sky-4) 100%) fixed`, delete the `::before` and `::after` rules, and set `color-scheme: light` (dark block: `dark`). Rewrite the private block with the lilac values, add a private evening block under `@media (prefers-color-scheme: dark)`, and drop the `filter: hue-rotate` rule. Delete the webp.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/mahjong-page.test.js`
Expected: the two new tests PASS. Other failures that only assert the old lacquer token values in rules Task 2 rewrites: note them and leave them for Task 2. Anything else must pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/mahjong.css test/unit/mahjong-page.test.js
git rm src/renderer/pages/mahjong-lacquer.webp
git commit -m "Paint Mahjong on a Dawn sky with an Evening sky in dark mode"
```

### Task 2: Light treatment on every Mahjong surface

**Files:**
- Modify: `src/renderer/pages/mahjong.css` (all rules after the token block: header meters, `.mj-dock`, Boards sheet and layout cards, setup, Records, rescue and notice dialogs, `.mj-tray*`, `.mj-win*`, `.mj-combo-*`, hint glow, blocked-tile shake, `.mj-tile` faces and edges, `.mj-button-primary`)
- Test: `test/unit/mahjong-page.test.js` (lines ~469 "layout-card hover and focus preserve readable lacquer text colors", ~548 `.mj-win-result`, ~569 primary button hover)

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: no retired token names left, which Task 6 and Task 7 rely on (they style with `--mj-accent`, `--mj-accent-soft`, `--mj-surface`).

- [ ] **Step 1: Write the failing tests**

```js
test('no lacquer-era token or hard-coded dark surface survives', () => {
  assert.doesNotMatch(mahjongStyles, /--mj-(table|panel|brass|ivory|line|muted|tile-side|focus|hint)\b/);
  assert.doesNotMatch(mahjongStyles, /rgba\((5, 42, 34|3, 29, 25|0, 10, 8|2, 25, 20)/);
});
```

Rewrite the three existing assertions to the new decisions:
- layout cards: hover/focus text uses `var(--mj-text)` on `var(--mj-surface)`, and the selected card border is `var(--mj-accent)`;
- `.mj-win-result`: `border-radius: 22px` kept, `background: var(--mj-surface)`;
- `.mj-button-primary:is(:hover, :focus-visible)`: `background: var(--mj-accent)`, `color: #fff` by day (the evening variant may use `var(--mj-text)` if contrast needs it; assert whichever you ship).
- `.mj-tile:focus-visible` outline uses `var(--mj-accent)`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/mahjong-page.test.js`
Expected: FAIL on the new test and the rewritten assertions.

- [ ] **Step 3: Restyle the surfaces**

Pills (meters, dock buttons, session badge) use `--mj-pill`, `--mj-pill-text`, `--mj-pill-line`, `border-radius: 999px`, and a soft shadow `0 2px 8px rgba(128,93,40,.14)` (evening `rgba(0,0,0,.25)`). Dialogs and sheets use `--mj-surface` and `--mj-surface-line` with `backdrop-filter: blur(16px)` by night. Tiles: face `linear-gradient(var(--mj-tile-top), var(--mj-tile-bottom))`, bottom edge `0 4px 0 var(--mj-tile-edge)`, drop `0 9px 16px var(--mj-tile-shadow)`. Selected tile ring and hint glow use `--mj-accent` and `--mj-accent-soft`. Remove the Task 1 aliases.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/mahjong-page.test.js test/unit/page-focus-ring.test.js`
Expected: PASS.

- [ ] **Step 5: Look at it in the real app**

Run `npm start`, open Mahjong from the Start Page, and step through Boards, setup, Records, a rescue (Burst: fill the tray), the no-moves notice and a win. Do this in System light, dark (Settings → Appearance), and a private tab. Capture screenshots with `npm run capture:mahjong:installed` or a Playwright probe in the scratchpad. Fix any surface still reading dark or drab by day.
Expected: no dark surface in light mode, and every label readable in all three themes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/mahjong.css test/unit/mahjong-page.test.js
git commit -m "Give every Mahjong surface the light Dawn sky treatment"
```

### Task 3: Inter Bold numerals and Instrument Sans game UI

**Files:**
- Modify: `src/renderer/pages/mahjong.css:5-11` (remove `--font-text: var(--font-ui)` and the spacing resets; `--mj-face-font` becomes Inter), `.mj-face text`, `text.mj-character-number`, `.mj-wind-direction-label`, the meter and count rules
- Modify: `test/unit/mahjong-page.test.js:750` ("tile-face type stays JetBrains Mono…"), `test/unit/start-page-fonts.test.js:23,125-126`
- Modify: `docs/brand-usage.md` ("Mahjong: classic lacquer" exception and System v3 "the game keeps Inter for its controls")

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `--mj-face-font: "Inter", <INTER_STACK>`; Task 5's trail does not depend on it.

- [ ] **Step 1: Rewrite the tests to the new decision**

In `mahjong-page.test.js`, rename the test to `'tile numerals are Inter Bold while the game UI uses Instrument Sans'` and assert:

```js
assert.match(mahjongStyles, /\.mahjong-body\s*\{[^}]*--mj-face-font:\s*"Inter"/);
assert.match(mahjongStyles, /text\.mj-character-number\s*\{[^}]*font-weight:\s*700;[^}]*letter-spacing:\s*-0\.02em;/);
assert.doesNotMatch(mahjongStyles, /--font-text:\s*var\(--font-ui\)/);
assert.doesNotMatch(mahjongStyles, /JetBrains Mono/);
// counts stay Inter, tabular
assert.match(mahjongStyles, /\.mj-meter strong\s*\{[^}]*font-family:\s*var\(--font-ui\);[^}]*font-variant-numeric:\s*tabular-nums;/);
```

Keep the existing `pages.css` assertion that JetBrains Mono's `@font-face` declares `400 800`, since the font stays bundled. In `start-page-fonts.test.js`, replace line 23 with `assert.match(mahjong, /--mj-face-font:\s*"Inter"/)`. Replace lines 125–126 with an assertion that `.mahjong-body` sets neither `--font-text` nor `--text-tracking`, with the message `'Mahjong uses the shared Instrument Sans text face (owner choice, October 17)'`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/mahjong-page.test.js test/unit/start-page-fonts.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Adjust the selector `.mj-meter strong` in the test to the real element that holds score, timer and pairs values if it differs, and apply Inter plus tabular numerals there and on key caps. Tune `.mj-wind-direction-label` to weight 700 with -0.01em so it sits with the numerals.

- [ ] **Step 4: Update `docs/brand-usage.md`**

Mark both entries "Superseded 2026-10-17", link the spec, and add a short "Mahjong: Dawn sky" entry: sky gradients, light tiles, Inter Bold numerals, Instrument Sans UI.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/unit/mahjong-page.test.js test/unit/start-page-fonts.test.js test/unit/i18n-documents.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/mahjong.css test/unit/mahjong-page.test.js test/unit/start-page-fonts.test.js docs/brand-usage.md
git commit -m "Set Mahjong numerals in Inter Bold and its interface in Instrument Sans"
```

### Task 4: Refreshed tile art (owner review stop)

> **Dropped (owner decision, 2026-10-17).** The original tile art stays; the owner will have it redone separately. Nothing from this task shipped.

**Files:**
- Create: `scripts/build-mahjong-art.mjs`
- Create: `assets/mahjong-art/source/` (move the current 18 tile PNGs here unchanged: `mahjong-{bamboo-gold,bamboo-jade,bamboo-one,dot-pip,dragon-*,flower,season,wind-*}.png`; the combo glint and particles stay where they are)
- Modify: the same 18 PNGs in `src/renderer/pages/` (regenerated, same names and pixel sizes)
- Modify: `package.json` (`"mahjong-art:build": "node scripts/build-mahjong-art.mjs"`, `"mahjong-art:check": "node scripts/build-mahjong-art.mjs --check"`, and append `&& npm run mahjong-art:check` to `substrate:check`)
- Test: `test/unit/mahjong-art.test.js`

**Interfaces:**
- Exports from `build-mahjong-art.mjs`: `refreshPixel([r,g,b,a]) -> [r,g,b,a]` (pure), `TILE_ART: string[]` (the 18 file names), `buildAll({ check: boolean }) -> Promise<{ changed: string[] }>`, `writeContactSheet(outPath) -> Promise<void>`.

- [ ] **Step 1: Write the failing tests**

```js
test('gold trim becomes softer champagne', () => {
  const [r, g, b] = refreshPixel([201, 160, 72, 255]);           // brass gold
  const before = hsl([201, 160, 72]), after = hsl([r, g, b]);
  assert.ok(after.s < before.s * 0.7 && after.l > before.l);
});
test('transparent pixels and alpha are untouched', () => {
  assert.deepEqual(refreshPixel([10, 20, 30, 0]), [10, 20, 30, 0]);
  assert.equal(refreshPixel([180, 40, 40, 128])[3], 128);
});
test('deep shadows lift and jade brightens without changing hue family', () => {
  const jade = refreshPixel([24, 92, 60, 255]);
  assert.ok(hsl(jade).l > hsl([24, 92, 60]).l);
  assert.ok(Math.abs(hsl(jade).h - hsl([24, 92, 60]).h) < 8);
});
test('every tile asset keeps its name and pixel size', async () => { /* compare sharp metadata of source vs output for TILE_ART */ });
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/mahjong-art.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `refreshPixel`**

Use HSL with these starting constants (tune for the finish): gold band = hue 30–58° with s > 0.3 → s × 0.55, l → l + (0.82 − l) × 0.45. Everything else: s × 1.12 (cap 1), shadows l < 0.35 → l + (0.35 − l) × 0.35. Specular highlights (l > 0.92, s < 0.15) → l = 0.92 to soften gloss. `buildAll` reads each source with `sharp(...).ensureAlpha().raw()`, maps pixels, and writes PNG. With `--check`, it compares output to the committed file using `scripts/png-equivalence.js`'s `pngsEquivalent` and exits non-zero on drift. `writeContactSheet` lays out the old and new versions of each asset on a `#fdf7ef` tile and on a `#ece2d2` tile over the Dawn and Evening gradients.

- [ ] **Step 4: Run the tests to verify they pass, then build**

Run: `node --test test/unit/mahjong-art.test.js && npm run mahjong-art:build && npm run mahjong-art:check`
Expected: PASS, then "18 assets up to date".

- [ ] **Step 5: STOP for owner review**

Run `node scripts/build-mahjong-art.mjs --sheet <scratchpad>/mahjong-art-sheet.png` and send the sheet to the owner. Do not continue until the owner approves the finish. Re-tune constants and repeat on feedback. If an asset can't reach the finish by mapping, name it to the owner instead of redrawing it. The white-dragon B must be visibly intact on the sheet.

- [ ] **Step 6: Check in the real app, then commit**

Relaunch `npm start` and confirm the tiles in light, dark and private.

```bash
git add scripts/build-mahjong-art.mjs assets/mahjong-art/source src/renderer/pages/mahjong-*.png package.json test/unit/mahjong-art.test.js
git commit -m "Refresh the Mahjong tile art with a lighter enamel finish"
```

Run `npm run audit-inventory:check` and `npm run compliance:check`. If either flags the new script or assets, follow its printed instruction (for example `audit-inventory:write`) and amend.

### Task 5: Pure effects module

**Files:**
- Create: `src/renderer/pages/mahjong-fx.js` (dual export like `mahjong-sound.js`: `module.exports` in Node, `window.MahjongFx` in the page)
- Modify: `src/renderer/pages/mahjong.html:330-333` (add `<script src="mahjong-fx.js"></script>` before `mahjong.js`)
- Modify: `copy/i18n-scope.json` (add `"src/renderer/pages/mahjong-fx.js": { "state": "guarded", "allow": [] }`)
- Test: `test/unit/mahjong-fx.test.js`

**Interfaces:**
- Produces:
  - `trailGeometry(from: Rect, to: Rect, origin: Rect) -> { x: number, y: number, length: number, angle: number, thickness: number }`. `Rect` = `{left, top, width, height}`. `x`/`y` = centre of `from` relative to `origin`; `length` = centre-to-centre distance; `angle` in degrees (`Math.atan2`); `thickness` = `clamp(min(from.width, to.width) * 0.12, 3, 8)`.
  - `celebrationTier({ zen: boolean, outcome: 'record'|'first'|null, reducedMotion: boolean, hidden: boolean }) -> 'none'|'still'|'quiet'|'standard'|'grand'`.
  - `CELEBRATION_MS = { none: 0, still: 0, quiet: 700, standard: 1200, grand: 1500 }`, `TRAIL_MS = 320`, `AUTO_TRAIL_DELAY_MS = 180`.

- [ ] **Step 1: Write the failing tests**

```js
test('trail runs centre to centre in origin coordinates', () => {
  const g = trailGeometry({ left: 110, top: 50, width: 40, height: 52 }, { left: 210, top: 50, width: 40, height: 52 }, { left: 100, top: 40, width: 600, height: 400 });
  assert.deepEqual([g.x, g.y, g.length, g.angle], [30, 36, 100, 0]);
});
test('trail thickness scales with tile size and is clamped', () => {
  assert.equal(trailGeometry(r(20), r(20), O).thickness, 3);
  assert.equal(trailGeometry(r(50), r(50), O).thickness, 6);
  assert.equal(trailGeometry(r(120), r(120), O).thickness, 8);
});
test('celebration tiers', () => {
  assert.equal(celebrationTier({ zen: false, outcome: null, reducedMotion: false, hidden: true }), 'none');
  assert.equal(celebrationTier({ zen: false, outcome: 'record', reducedMotion: true, hidden: false }), 'still');
  assert.equal(celebrationTier({ zen: true, outcome: 'record', reducedMotion: false, hidden: false }), 'quiet');
  assert.equal(celebrationTier({ zen: false, outcome: null, reducedMotion: false, hidden: false }), 'standard');
  assert.equal(celebrationTier({ zen: false, outcome: 'first', reducedMotion: false, hidden: false }), 'grand');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/mahjong-fx.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `mahjong-fx.js`**

Precedence for `celebrationTier`: hidden → `none`, reducedMotion → `still`, zen → `quiet`, record/first → `grand`, else `standard`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/mahjong-fx.test.js && npm run copy:check && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/mahjong-fx.js src/renderer/pages/mahjong.html copy/i18n-scope.json test/unit/mahjong-fx.test.js
git commit -m "Add Mahjong trail geometry and celebration tiers"
```

### Task 6: Match trail

**Files:**
- Modify: `src/renderer/pages/mahjong.js` (new `launchMatchTrail(fromEl, toEl, { tier })` and `launchMatchMarks(elements)` near `launchTrayBurst` at ~783; call sites in `animateTileResult` at ~852; cleanup in `invalidateTileAnimations` at ~567)
- Modify: `src/renderer/pages/mahjong.css` (`.mj-trail`, `.mj-match-mark`, their keyframes, the reduced-motion block)
- Modify: `test/desktop/mahjong-standalone-smoke.mjs` (assert a trail appears on the pair it already plays)
- Test: `test/unit/mahjong-page.test.js`

**Interfaces:**
- Consumes: `MahjongFx.trailGeometry`, `TRAIL_MS`, `AUTO_TRAIL_DELAY_MS` (Task 5); `--mj-accent`, `--mj-accent-soft` (Task 1).
- Produces: trail elements carry class `mj-trail` (and `mj-trail-heated|brilliant|masterful` for combo tiers) and live inside `.mj-board-frame`. Marks carry class `mj-match-mark`. Both register through `trackTransient(element, duration)`.

- [ ] **Step 1: Write the failing tests**

a. In `mahjong-page.test.js`:

```js
test('match trail is positioned by custom properties inside the board frame', () => {
  assert.match(controller, /function launchMatchTrail\(fromEl, toEl, \{ tier \} = \{\}\)/);
  assert.match(controller, /setProperty\('--mj-trail-length'/);
  assert.match(mahjongStyles, /\.mj-trail\s*\{[^}]*position:\s*absolute;[^}]*width:\s*calc\(var\(--mj-trail-length\) \* 1px\);[^}]*background:[^}]*var\(--mj-accent\)/);
  assert.match(mahjongStyles, /\.mj-trail\s*\{[^}]*pointer-events:\s*none;/);
});
test('reduced motion swaps the travelling trail for static marks', () => {
  const reduced = mediaBlocks('(prefers-reduced-motion: reduce)').join('\n');
  assert.match(reduced, /\.mj-trail\s*\{[^}]*display:\s*none;/);
  assert.match(controller, /launchMatchMarks\(/);
});
```

b. In the smoke test, after the existing pair click, poll `document.querySelector('.mj-board-frame .mj-trail')` within 300 ms and assert it existed, then assert it is gone after 1 s.

c. In the smoke test, click a pair and then immediately trigger Undo (`#mjUndo` or the dock's undo button). Assert `.mj-trail` count is 0 within 100 ms.

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-name-pattern="trail|static marks" test/unit/mahjong-page.test.js && npm run test:mahjong-standalone`
Expected: FAIL.

- [ ] **Step 3: Implement**

`launchMatchTrail` measures both elements and `.mj-board-frame` with `getBoundingClientRect` and calls `trailGeometry`. It creates a `div.mj-trail`, sets `--mj-trail-x/y/length/angle/thickness` with `style.setProperty`, appends it to the frame, and calls `trackTransient(el, TRAIL_MS)`. CSS draws it with `transform-origin: 0 50%`, `translate(x,y) rotate(angle)`, a `scaleX(0→1)` draw over ~180 ms followed by an opacity fade, a gradient `transparent → var(--mj-accent) → #fff8 → transparent`, and `box-shadow: 0 0 12px var(--mj-accent-soft)`. Combo tiers (from `comboTier(result.comboCount).name` when `comboCount >= 3`) add a class that thickens and brightens it slightly.

Call sites in `animateTileResult`, before the departing loop:
- `type === 'pair'`: `tileButtons[result.indices[0]]` → `tileButtons[result.indices[1]]`.
- `type === 'tray-pair'`: the tray slot `.mj-tray-slot[data-tile-index="${result.indices[0]}"]` → `tileButtons[index]` (before `startTrayFlight` hides the source).
- `result.autoClear`: after `AUTO_TRAIL_DELAY_MS`, between its two elements (a tray slot when `source === 'tray'`), guarded by `generation === tileAnimationGeneration`.
- Under reduced motion, call `launchMatchMarks([...])` instead: one `div.mj-match-mark` per tile at its frame-relative rect (same custom-property approach), opacity-only fade over 400 ms.

In `invalidateTileAnimations`, remove every `.mj-trail` and `.mj-match-mark` (through `clearTransientMotion` if it already empties `transientMotion`; confirm it does).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/mahjong-page.test.js && npm run test:mahjong-standalone`
Expected: PASS.

- [ ] **Step 5: Check the feel in the real app**

`npm start`: play Classic and Burst (Auto rules, to hit an auto-clear), then try reduced motion (macOS Accessibility → Display → Reduce motion). Resize the window mid-game. The trail must never delay the next click, and must not outlive its tiles.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/mahjong.js src/renderer/pages/mahjong.css test/unit/mahjong-page.test.js test/desktop/mahjong-standalone-smoke.mjs
git commit -m "Draw a glowing trail between matched Mahjong tiles"
```

### Task 7: Board-cleared celebration

**Files:**
- Modify: `src/renderer/pages/mahjong.html` (add `<div id="mjCelebrate" class="mj-celebrate" aria-hidden="true" hidden>` with two `<img>` children reusing `mahjong-combo-particles.png` and `mahjong-combo-glint.png`, inside `.mj-board-frame`)
- Modify: `src/renderer/pages/mahjong.js` (`showWin` at ~1337 and `checkEndStates` at ~652; new `playCelebration(tier, done)` and `cancelCelebration()`; `invalidateTileAnimations` calls `cancelCelebration()`)
- Modify: `src/renderer/pages/mahjong.css` (`.mj-celebrate`, `[data-tier="quiet|standard|grand"]`, keyframes, sky-brighten overlay, reduced-motion block)
- Test: `test/unit/mahjong-page.test.js`

**Interfaces:**
- Consumes: `MahjongFx.celebrationTier`, `CELEBRATION_MS` (Task 5).
- Produces: `#mjCelebrate[data-tier]` while playing. `showWin()` keeps its signature, so the announcement still fires immediately and only `setDialogVisible(win, true)` waits.

- [ ] **Step 1: Write the failing tests**

a.

```js
test('win shows the card after a tiered celebration that can be skipped', () => {
  assert.match(html, /<div id="mjCelebrate" class="mj-celebrate" aria-hidden="true" hidden>/);
  assert.match(controller, /celebrationTier\(\{ zen: isZen, outcome: game\._outcome \|\| null, reducedMotion, hidden: document\.hidden \}\)/);
  assert.match(controller, /function playCelebration\(tier, done\)/);
  assert.match(controller, /addEventListener\('pointerdown', skip/);
  assert.match(controller, /addEventListener\('keydown', skip/);
});
```

b. Timers, not `animationend`: assert `controller` uses `window.setTimeout(` inside `playCelebration` and does not use `animationend` there. This covers the Review Focus hidden-tab case. Add: `assert.match(controller, /visibilitychange[^]*?skip/)`, so returning to a tab with a pending celebration finishes it at once.

c. `invalidateTileAnimations` calls `cancelCelebration()`: `assert.match(controller, /function invalidateTileAnimations\(\)\s*\{[^}]*cancelCelebration\(\)/)`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test --test-name-pattern="celebration" test/unit/mahjong-page.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `showWin`, after filling the card, compute `tier` and call `playCelebration(tier, () => setDialogVisible(win, true))`. Call `announce(announcement)` immediately, before the celebration. `playCelebration` with tier `none` or `still` calls `done()` synchronously. `still` also flashes a static accent glow class for 400 ms under reduced motion. Otherwise it unhides `#mjCelebrate`, sets `data-tier`, adds a body class that brightens the sky via an overlay (opacity animation on a `.mj-celebrate::before` radial `--mj-accent-soft` wash), and plays particles and glint. After `CELEBRATION_MS[tier]` (or on skip, via one-shot `pointerdown`/`keydown`/`visibilitychange`-to-visible listeners), it hides the overlay, removes the listeners and calls `done()` exactly once. `cancelCelebration()` clears the timer and listeners and hides the overlay without calling `done`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/mahjong-page.test.js && npm run lint`
Expected: PASS.

- [ ] **Step 5: Check the feel in the real app**

`npm start`: win a small board (Peaks, 72 tiles) in Classic, in Burst, in Zen, and once for a new record. Also try reduced motion, clicking during the celebration, and switching tabs during it and coming back.
Expected: the card always arrives, and skipping works.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/mahjong.html src/renderer/pages/mahjong.js src/renderer/pages/mahjong.css test/unit/mahjong-page.test.js
git commit -m "Celebrate a cleared Mahjong board before the results card"
```

### Task 8: Gate before each PR

- [ ] **Step 1: Full checks**

Run: `npm run test:unit && npm run lint && npm run substrate:check && npm run test:mahjong-standalone`
Expected: all pass. If a failure is unrelated to Mahjong, compare against `origin/main` before touching it.

- [ ] **Step 2: Real-app captures for the PR**

Capture light, dark and private screenshots of the board, the Boards sheet and the results card, at Retina density (≥ 2 device px per CSS px), and attach them to the PR as before/after pairs.

- [ ] **Step 3: Open the PR**

Base `main`. PR 1 (Tasks 1–3), PR 2 (Task 4, only after the owner's art sign-off), PR 3 (Tasks 5–7). Each PR description lists what was verified in the real app and in which themes.
