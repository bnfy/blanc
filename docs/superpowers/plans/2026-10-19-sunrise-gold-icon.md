# Sunrise Gold App Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed, glass "Sunrise Gold" macOS app icon, selectable in Settings → General → App icon.

**Architecture:**
- `brand:build` generates the Gold artwork from the Sunrise master:
  - a cream glass mark layer and a gold tile layer for Icon Composer;
  - a flat Dock PNG.
- `after-pack-app-icons.js` compiles a two-group Icon Composer stack, named `SunriseGold`, into `Assets.car` beside the existing ones.
- `settings.js` and the schema list the new id. The Mac-only picker and Dock applier then pick it up with no new branches.

**Tech Stack:** Node, sharp, Electron 44, Icon Composer (`actool`), node:test.

**Spec:** `docs/superpowers/specs/2026-10-19-sunrise-gold-icon-design.md`

## Global Constraints

- Id `sunrise-gold`, label `Sunrise Gold`, native name `SunriseGold`. Never reuse the retired monogram id `gold`.
- Tile: a vertical gradient from `#E3BF78` (top) to `#BE8D40` (bottom), screened with a radial glow. The glow runs from `rgb(56,56,56)` (0.22 × 255) at its center to black at a 310 px radius, centered at (512, 482) on the 1024 canvas.
- Mark: a cream `#FFF7E6` silhouette of the **seam-closed** Sunrise.
  - Native layer: 845 px at 89 px on a 1024 canvas.
  - Flat icon: `SUNRISE_FLAT_SIZE` at `SUNRISE_FLAT_POSITION`.
- Native stack:
  - front group: the mark layer, `glass: true`, shadow `neutral` at 0.3;
  - back group: the tile layer, `glass: false`;
  - document fill: `automatic-gradient` with **no** `fill-specializations`.
- Flat icon:
  - tile: an 824 px rounded rect inset 100 px with `rx` 184 and the existing flat drop shadow;
  - mark shadow: dy 6, blur sigma 5, black at 0.22.
- macOS only. No Windows, Linux, copy or website changes. `appIcon` stays device-local.

## Review Focus

1. **Gold must not darken in Dark mode.** The generated document has no `fill-specializations`, and the tile is an image layer. Pinned in Task 2.
2. **A stale saved `gold` (the retired monogram) still reads as `sunrise`.** Pinned in Task 3.
3. **The Dock icon must not change size when switching icons.** The Gold flat mark's share of the tile must match the native layer's share. Pinned in Task 1.
4. **The flat fallback is Gold in both appearances.** `applyDockAppIcon` with `sunrise-gold` and `darkAppearance: true` loads `icon-sunrise-gold.png`. Pinned in Task 3.
5. **The default `Icon` package must stay untouched.** `build/app-icons/Icon.icon` gains no files. Pinned in Task 2's packaging test, which asserts the Assets listing.

---

### Task 1: Generate the Gold artwork

**Files:**
- Modify: `scripts/build-brand-assets.js`
- Create (generated): `build/app-icons/colorways/sunrise-mark-cream.png`, `build/app-icons/colorways/gold-tile.png`, `src/renderer/pages/icon-sunrise-gold.png`
- Test: `test/unit/app-icon.test.js`

**Interfaces:**
- Produces: the three PNGs above. Later tasks reference them by path.

- [ ] **Step 1: Write the failing test** `the Sunrise Gold artwork matches the flat icon scale and stays a fixed gold tile`:
  - Tile:
    - `gold-tile.png` is 1024×1024 and opaque.
    - Pixel (512, 8) is within 12 of `#E3BF78`, and pixel (512, 1015) is within 12 of `#BE8D40`.
    - The center pixel is brighter than (512, 8).
  - Native mark:
    - `sunrise-mark-cream.png` is 1024×1024.
    - Every pixel with alpha > 24 is within 4 of `#FFF7E6`.
    - Its alpha bounds' height is 780–820.
  - Flat icon (`icon-sunrise-gold.png`):
    - The opaque tile is 824 px tall.
    - Cream pixels (`b > 200 && a > 24`) form the mark.
    - Mark height ÷ tile height is within 0.01 of the native mark height ÷ 1024.
    - The horizontal offset rule from the existing Sunrise test holds at < 0.005.
- [ ] **Step 2: Run the test and confirm it fails.** Run `node --test --test-name-pattern="Sunrise Gold artwork" test/unit/app-icon.test.js`. Expected: FAIL (ENOENT).
- [ ] **Step 3: Implement in `build-brand-assets.js`.**
  - `buildSunriseAssets` also returns `inkNativeLayer`: the native layer built from the seam-closed `inked` buffer.
  - Add `async function buildSunriseGoldAssets(sunrise) -> { tile, nativeMark, flat }`. It uses the constants above. The radial glow is an SVG `radialGradient`, composited with sharp `blend: 'screen'`. Cream recoloring joins the motif's alpha onto a solid `#FFF7E6`.
  - `main()` emits the three files.
- [ ] **Step 4: Generate the files.** Run `npm run brand:build`, then `npm run brand:check`. Expected: "Brand assets are current."
- [ ] **Step 5: Run the test.** Expected: PASS. Look at `icon-sunrise-gold.png`; it should match `assets/2026-10-19-sunrise-gold-icon/closeup.png`, B3, apart from the glass.
- [ ] **Step 6: Commit** (`Generate Sunrise Gold icon artwork`).

### Task 2: Compile Gold into the native catalog

**Files:**
- Modify: `src/main/app-icon-assets.js`, `scripts/after-pack-app-icons.js`
- Test: `test/unit/app-icon.test.js`

**Interfaces:**
- Consumes: Task 1's two `build/app-icons/colorways/` PNGs.
- Produces: an `APP_ICON_ASSETS['sunrise-gold']` entry with these fields:
  - `nativeName: 'SunriseGold'`
  - `background: '#CFA65C'` (the hidden fill)
  - `imageDir: 'build/app-icons/colorways'`
  - `imageName: 'sunrise-mark-cream.png'`
  - `glass: true`
  - `tileImageName: 'gold-tile.png'`
  - `shadowOpacity: 0.3`
  - `preserveColor: true`
  - `layerName: 'Sunrise'`

  `createIconDocument(definition)` honors `glass`, `tileImageName` and `shadowOpacity`.

- [ ] **Step 1: Write the failing test** `the Sunrise Gold stack is fixed glass on an image tile`. For `createIconDocument(APP_ICON_ASSETS['sunrise-gold'])`, assert:
  - `fill-specializations` is `undefined`;
  - `groups.length === 2`;
  - `groups[0].layers[0]` has `glass` `true` and `image-name` `sunrise-mark-cream.png`;
  - `groups[0].shadow` deep-equals `{ kind: 'neutral', opacity: 0.3 }`;
  - `groups[1].layers[0]` has `glass` `false` and `image-name` `gold-tile.png`.

  Also rewrite `every selectable colorway has a named native icon stack`:
  - the ids are `['sunrise', 'sunrise-dark', 'sunrise-gold']`;
  - the native names are unique;
  - each definition's images exist under its `imageDir`, defaulting to `build/app-icons/Icon.icon/Assets`;
  - `fs.readdirSync('build/app-icons/Icon.icon/Assets')` deep-equals `['blanc-mark.svg', 'sunrise-mark.png']`.
- [ ] **Step 2: Run both tests and confirm they fail.**
- [ ] **Step 3: Implement.**
  - Add the entry after `'sunrise-dark'`.
  - In `createIconDocument`:
    - the mark layer's `glass` comes from `definition.glass ?? false`;
    - the shadow opacity comes from `shadowOpacity ?? 0.25`;
    - when `tileImageName` is set, append a second group `{ layers: [{ glass: false, 'image-name': tileImageName, name: 'Tile' }] }`.
  - In `afterPackAppIcons`, copy `imageName` and, if set, `tileImageName` from `path.join(root, definition.imageDir ?? 'build/app-icons/Icon.icon/Assets')`.
- [ ] **Step 4: Run the whole file.** `node --test test/unit/app-icon.test.js` should PASS, including the unchanged Sunrise assertions.
- [ ] **Step 5: Prove the render.** Write the generated document and both PNGs to a scratch `SunriseGold.icon`. Render Default and Dark with `/Applications/Icon Composer.app/Contents/Executables/ictool … --rendition Default|Dark`. Expected: the two renders match each other and B3.
- [ ] **Step 6: Commit** (`Compile Sunrise Gold into the macOS icon catalog`).

### Task 3: Make Gold selectable

**Files:**
- Modify: `src/main/settings.js` (`APP_ICON_LABELS`), `settings-schema/schema.json` (`appIcons` and the `appIcon` note), the generated `settings-schema/generated/*`
- Test: `test/unit/app-icon.test.js`, plus any id list in `test/unit/first-run-settings.test.js` or `development-brand-preview.test.js` that breaks

**Interfaces:**
- Consumes: `APP_ICON_ASSETS['sunrise-gold']` (Task 2) and `icon-sunrise-gold.png` (Task 1).
- Produces: `settings.APP_ICON_LABELS['sunrise-gold'] === 'Sunrise Gold'`.

- [ ] **Step 1: Write the failing tests.**
  - `the flat Sunrise Gold fallback stays gold in dark appearance`: unpackaged `applyDockAppIcon({ appIcon: 'sunrise-gold', darkAppearance: true, … })` returns `{ source: 'png', appIcon: 'sunrise-gold' }` and loads `icon-sunrise-gold.png`.
  - `Sunrise Gold is selectable and the retired gold monogram is not`:
    - `settings.isAppIconAllowed('sunrise-gold') === true`;
    - `settings.isAppIconAllowed('gold') === false`;
    - `Object.keys(settings.APP_ICON_LABELS)` deep-equals `['sunrise', 'sunrise-dark', 'sunrise-gold']`.
- [ ] **Step 2: Run the tests and confirm the second one fails.** The first may already pass, because `applyDockAppIcon` keys off `APP_ICON_ASSETS`.
- [ ] **Step 3: Implement.**
  - Add the label.
  - Add `{ "id": "sunrise-gold", "label": "Sunrise Gold" }` to the schema. Its note reads: "Sunrise Gold is a fixed glass icon, the same in light and dark".
  - Run `npm run settings:build`.
- [ ] **Step 4: Run the checks.** `npm run test:unit` and `npm run substrate:check`. Expected: all pass.
- [ ] **Step 5: Commit** (`Make Sunrise Gold selectable in Settings`).

### Task 4: Docs

**Files:** `CLAUDE.md`, `AGENTS.md`, `spec/features.md`, `spec/parity-matrix.md`, and `ASSET-LICENSE.md` if it lists icon files.

- [ ] **Step 1: Update the docs.**
  - In both `CLAUDE.md` and `AGENTS.md`, the App icon paragraph changes from "Its selectable catalog is Sunrise and Sunrise Dark" to name Sunrise Gold, adding: "a fixed glass icon, the same in light and dark, built from `build/app-icons/colorways/`".
  - Make the matching edits in `spec/` wherever the app-icon list appears.
- [ ] **Step 2: Run the checks.** `npm run test:unit` (some tests read CLAUDE.md) and `npm run lint`. Expected: pass.
- [ ] **Step 3: Commit** (`Document Sunrise Gold`).

### Task 5: Verify in the app

- [ ] **Step 1: Unpackaged check.**
  - `npm start`.
  - Settings → General → App icon shows three swatches.
  - Choosing Sunrise Gold turns the Dock tile gold in both Light and Dark.
  - Take a screenshot.
- [ ] **Step 2: Packaged check.**
  - `npm run dist:dir`, then launch `dist/mac-arm64/Blanc.app` with a copy of a dev profile.
  - Choose Gold and confirm the Dock in Light and Dark.
  - Choose Sunrise and confirm the adaptive icon returns.
  - Take screenshots.
- [ ] **Step 3: Report.** Report the results with the screenshots. Do not commit or push until the owner approves.
