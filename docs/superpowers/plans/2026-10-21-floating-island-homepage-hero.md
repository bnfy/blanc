# Homepage First Screen: the Floating Island — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** blanc.day's first screen keeps the sunrise and "A little less browser.", adds a handwritten "now, none at all", and shows a wide Blanc window below whose Island hides and floats back, as in v1.40.0.

**Architecture:** Two native captures of the published v1.40.0 app (Island hidden, Island revealed) give the page, the window's corners and the macOS buttons. The Island itself is the app's own markup and CSS, extracted at build time (`nativeIslandArt`), drawn over the hidden capture at the place the revealed capture measured. A small script runs the peek loop and lets the visitor's pointer or keyboard bring the Island in. CSS alone gives the static and reduced-motion state.

**Tech Stack:** Astro (site/), plain JS modules, node:test unit tests, Playwright site tests, sharp, the existing installed-capture helpers.

**Spec:** `docs/superpowers/specs/2026-10-21-floating-island-homepage-hero-design.md`

## Global Constraints

- Website only (`site/`, `scripts/`, `docs/`, tests), plus the one stale sentence in `CLAUDE.md` and `AGENTS.md` (kept byte-identical) and the font's entry in `THIRD-PARTY-NOTICES.md`. No app code changes.
- The headline stays exactly `A little less browser.` (`<h1 id="opening-title">`).
- The note is exactly `now, none at all`, in Reenie Beanie (SIL OFL 1.1), self-hosted from `@fontsource/reenie-beanie` 5.3.0, never loaded from a third party.
- Auto-hide is always described as something you turn on; no platform-specific claim.
- A replica draws only what the released app's code draws; the window frame and macOS buttons come from captures of the published v1.40.0 DMG (`Blanc-1.40.0-arm64.dmg`, SHA-256 `38331a6cf265afd6e42115e8f8ea6ae33cf4e51e20d0d1d8e30a6f5cf24f0465`), never drawn.
- The sunrise keeps playing once on load (2.2 s, `prefers-reduced-motion: no-preference` only); no scroll-to-reveal opening.
- The first screen ends on the headline and Download at 1440×900, 1280×800 and 1280×720.
- Narrow screens: the whole window scaled as one piece, never cropped or rearranged; no horizontal page scroll.
- Every new homepage sentence is recorded in `docs/website-v1.40-claims.json`; replaced ones move unchanged to `supersededClaims`.

## Review Focus

1. The loop running while the window is off screen or the tab is hidden — expected: no timers fire and nothing animates until it is visible again (Task 4 test `pauses while off screen or hidden`).
2. The visitor's pointer leaving the window through its top edge into the site header — expected: the Island hides, as in the app when the pointer leaves the window (Task 4 test `pointer leaving the window hides the Island`).
3. Touch screens — expected: a tap anywhere never sticks the Island open; the loop continues (Task 4 test `touch pointers do not take over the loop`).
4. Reenie Beanie failing to load — expected: the note falls back to a cursive face and still never overlaps the headline's letters (Task 5 site test `the note sits above the headline end, clear of its letters`).
5. Resizing across widths — expected: the window stays one scaled drawing, the Island keeps its place on the page, no horizontal scroll at 390 px (Task 5 site test `the window scales as one piece at every width`).

---

### Task 1: Native captures of the floating Island from the published app

**Files:**
- Create: `scripts/capture-installed-float-island.mjs`
- Create: `docs/website-captures-float-island-v1.40.0.json`
- Create: `site/public/feature-captures/float-island-hidden-v1.40.0.png`, `site/public/feature-captures/float-island-revealed-v1.40.0.png`, `site/public/revamp/metmuseum-favicon.png`
- Modify: `package.json` (script `capture:float-island:installed`)
- Test: `test/unit/website-feature-evidence.test.js` (capture manifest list)

**Interfaces:**
- Produces: the two captures (each 2× a 1440×900 window, so 2880×1800, PNG, sRGB, window corners kept by `screencapture -o -l`), and the ledger with, under `measured`: `window: {width, height}` (CSS px), `islandRect: {x, y, width, height}` (CSS px, window coordinates, from the strip document's `#islandPill`), `trafficLightsRect: {x, y, width, height}` (CSS px, the macOS buttons' area), and `pill: {domain, dots, activeDot, shieldCount, favicon}` read from the strip at the revealed moment.

- [ ] **Step 1: Add the manifest entry to the capture test (fails: file missing)**

In `test('public product captures match their reviewed dimensions, hashes, and source release'`, add `['docs/website-captures-float-island-v1.40.0.json', 'v1.40.0', '17ed22052bc0e1d0c0ce3920cbcb85c4792d306e', 2]`.

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/unit/website-feature-evidence.test.js`
Expected: FAIL, ENOENT for the new ledger.

- [ ] **Step 3: Write `scripts/capture-installed-float-island.mjs`**

Model it on `scripts/capture-installed-glance.mjs` (same helpers, `launchPackagedOverCdp`, disposable profile, `BLANC_CAPTURE_VERSION=1.40.0`). Settings seed adds `islandAutoHide: true`, `islandAutoHideStyle: 'float'`, `islandHoverOpen: false`. One tab: `https://www.metmuseum.org/art/collection/search/436535`. Size the window to a 1440×900 content area. States:
- `hidden`: pointer parked in the page's middle; wait until the strip document's `#islandPill` reports hidden (the float pill view not visible) and 1 s more.
- `revealed`: move the system pointer to the window's top edge, centered, with a tiny Swift helper calling `CGWarpMouseCursorPosition` (Blanc's dwell sampler reads `screen.getCursorScreenPoint()`, so a warped cursor reveals it; the window must be frontmost). Wait for the reveal, then 600 ms.
For each state, capture with `screencapture -o -x -l<windowId>` and keep the 2× PNG as is (sRGB conversion with sharp, no resize). At the revealed moment, read from the strip document over CDP: `#islandPill.getBoundingClientRect()`, the pill's domain text, dot count and active index, the shield count, and the active tab's favicon (save its bytes to the favicon PNG). Measure the traffic lights' rect from the two captures: the bounding box of pixels that differ (any channel by more than 8) within the top-left 120×40 CSS px, padded by 2 px. Print every measured value.

- [ ] **Step 4: Run it against the mounted published DMG and write the ledger**

Run: `BLANC_PACKAGED_EXECUTABLE=<mounted Blanc-1.40.0-arm64.dmg>/Blanc.app/Contents/MacOS/Blanc BLANC_CAPTURE_VERSION=1.40.0 BLANC_CAPTURE_OUTPUT_DIR=<tmp> npm run capture:float-island:installed`
Then copy the files into place and write the ledger in the shape of `docs/website-captures-v1.40.0.json` (`release`, `sourceSha`, `source` with `dmgSha256`, `settings.usagePing: false`, `settings.searchSuggestions: false`, `method`, `captures[]` with `state`, `file`, `width`, `height`, `sha256`, `verdict: "verified"`, `evidence`), plus `measured` as in Interfaces.
Expected: both captures 2880×1800; in the revealed one the Island and the buttons show; in the hidden one nothing is drawn over the page.

- [ ] **Step 5: Run the test**

Run: `node --test test/unit/website-feature-evidence.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/capture-installed-float-island.mjs package.json docs/website-captures-float-island-v1.40.0.json site/public/feature-captures/float-island-*-v1.40.0.png site/public/revamp/metmuseum-favicon.png test/unit/website-feature-evidence.test.js
git commit -m "Website: capture the floating Island from the published v1.40.0 app"
```

### Task 2: Display copies of the captures

**Files:**
- Modify: `site/scripts/build-display-images.mjs`, `site/src/data/display-images.json` (whichever the script reads; follow its existing entries)
- Create (generated): `site/public/revamp/float-island-hidden-v1.40.0-display.webp` (2560 px wide), `…-800.webp` (800 px), `site/public/revamp/float-island-lights-v1.40.0.webp` (the traffic-lights crop at 2×)
- Test: `test/unit/website-display-images.test.js`

**Interfaces:**
- Consumes: Task 1's captures and `measured.trafficLightsRect`.
- Produces: the three WebP files above at the named paths.

- [ ] **Step 1: Add the three outputs to the display-image list** — the lights crop is `trafficLightsRect` × 2 from the revealed capture (lossless crop, then WebP quality 90), the window copies are resizes of the hidden capture.
- [ ] **Step 2: Run** `node site/scripts/build-display-images.mjs` **and** `node --test test/unit/website-display-images.test.js` — Expected: files written; PASS (the test checks every listed output exists and matches its source's aspect).
- [ ] **Step 3: Commit** `git commit -m "Website: display copies of the floating Island captures"`

### Task 3: The window component

**Files:**
- Create: `site/src/components/FloatingIslandWindow.astro`
- Create: `test/unit/website-home-hero.test.js`

**Interfaces:**
- Consumes: Task 1 `measured` (import the ledger JSON at build time), Task 2 images, `nativeIslandArt` and `namespaceNativeArt` from `site/src/lib/native-island-art.mjs`.
- Produces: markup `<figure class="float-window" data-float-window data-state="shown">` containing `.float-window-page` (the hidden capture, `<picture>` with the 800 px source under 760 px), `.float-window-lights` (the lights crop, absolutely placed at `trafficLightsRect` as % of the window), `.float-window-island` (a `<blanc-native-island>` shadow host, `inert aria-hidden`, placed at `islandRect` as %), `.float-window-pointer` (an inline SVG arrow, `aria-hidden`), and a `<figcaption class="sr-only">` text alternative. `data-state` is `shown` or `hidden`; CSS keyed on it moves the Island and lights.

- [ ] **Step 1: Write the failing tests**

```js
test('the hero window draws the app’s own Island over a published capture', () => {
  const src = read('site/src/components/FloatingIslandWindow.astro');
  assert.match(src, /nativeIslandArt\(\{ styles, document, renderer \}\)/);
  assert.match(src, /var\(--shadow-island-float\)/);            // the float view's own shadow
  assert.match(src, /float-island-hidden-v1\.40\.0/);
  assert.match(src, /float-island-lights-v1\.40\.0/);
  assert.doesNotMatch(src, /<svg[^>]*class="[^"]*island/);         // no hand-drawn pill
});
test('the Island and buttons sit where the published app put them', () => {
  const { measured } = JSON.parse(read('docs/website-captures-float-island-v1.40.0.json'));
  const src = read('site/src/components/FloatingIslandWindow.astro');
  assert.match(src, /website-captures-float-island-v1\.40\.0\.json/); // positions come from the ledger, not typed in
  assert.ok(measured.islandRect.width > 300 && measured.islandRect.y >= 0);
  // The pill's sample state is the measured one, not typed in.
  for (const field of ['domain', 'dots', 'activeDot', 'shieldCount']) assert.match(src, new RegExp(`measured\\.pill\\.${field}`));
});
```

- [ ] **Step 2: Run** `node --test test/unit/website-home-hero.test.js` — Expected: FAIL, file not found.
- [ ] **Step 3: Implement the component** — follow `NativeIslandHero.astro` for the shadow root and fonts; replace the sample state as `GlanceIsland.astro` does, with `measured.pill` (domain, favicon `/revamp/metmuseum-favicon.png`, `measured.pill.dots` dots with `activeDot` active, `shieldCount`). Presentation adds `#islandPill { box-shadow: var(--shadow-island-float); }`. Place layers with `left/top/width` as percentages of `measured.window`. The figcaption reads: "A web page filling a Blanc window to its top edge. With Auto-hide on, Blanc’s Island hides, then floats back over the page when the pointer reaches the top edge."
- [ ] **Step 4: Run** the test file — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Website: the floating Island hero window"`

### Task 4: The peek loop

**Files:**
- Create: `site/src/scripts/floating-island-hero.js`
- Modify: `site/src/scripts/home.js` (call `initFloatingIslandHero(document.querySelector('[data-float-window]'), { view })`)
- Test: `test/unit/website-home-hero.test.js`

**Interfaces:**
- Produces: `export const TIMING = Object.freeze({ rest: 1600, approach: 1000, shown: 2600, leave: 500, resumeAfterVisitor: 2400 })`, `export const TOP_BAND = 0.07` (fraction of the window's height that counts as its top edge), and `export function initFloatingIslandHero(root, { view = window } = {}): { stop(): void }`. It sets `root.dataset.state` to `hidden`/`shown` and the pointer element's `--pointer-x/--pointer-y` (percent).

- [ ] **Step 1: Write the failing tests** — use a fake `view` (`setTimeout`/`clearTimeout` recorded and advanced by hand, `matchMedia`, `IntersectionObserver`, `document.visibilityState`, `addEventListener`) as `test/unit/website-home-demos.test.js`'s Glance fixture does:
  - `loops: hidden → pointer to the top → shown → hidden` — after `rest`, the pointer moves to the top (`--pointer-y` ≤ 2%); after `approach`, `data-state="shown"`; after `shown`, the pointer leaves and after `leave` `data-state="hidden"`.
  - `reduced motion shows the Island at rest and never loops` — with `matchMedia('(prefers-reduced-motion: reduce)').matches`, `data-state="shown"` and no timers scheduled.
  - `the visitor’s pointer in the top band brings it in and pauses the loop` — a `pointermove` at y within `TOP_BAND` of the window sets `shown`, clears the loop timers; a `pointermove` below it sets `hidden`; the loop resumes after `resumeAfterVisitor`.
  - `pointer leaving the window hides the Island` (Review Focus 2) — `pointerleave` while shown sets `hidden`.
  - `keyboard focus shows it` — `focusin` on the window (it has `tabindex="0"`) sets `shown`; `focusout` sets `hidden`.
  - `touch pointers do not take over the loop` (Review Focus 3) — a `pointermove` with `pointerType: 'touch'` changes nothing and the loop keeps its timers.
  - `pauses while off screen or hidden` (Review Focus 1) — an IntersectionObserver entry with `isIntersecting: false`, or `visibilitychange` to hidden, clears every timer; coming back restarts from `rest`.
- [ ] **Step 2: Run** `node --test test/unit/website-home-hero.test.js` — Expected: the new tests FAIL (module missing).
- [ ] **Step 3: Implement `initFloatingIslandHero`** — one scheduled timeout at a time, stored so every pause clears it.
- [ ] **Step 4: Run** the test file — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Website: the floating Island hero's peek loop"`

### Task 5: The first screen

**Files:**
- Modify: `site/src/pages/index.astro` (the `#opening` section), `site/src/styles/home.css` (the sunrise block and its motion block)
- Create: `site/src/styles/reenie-beanie.css` (one `@font-face`, `font-display: swap`), `site/public/fonts/reenie-beanie/reenie-beanie-latin-400-normal.woff2`, `site/public/fonts/reenie-beanie/OFL.txt` (both from the `@fontsource/reenie-beanie` 5.3.0 tarball, `npm pack`, bytes unmodified)
- Modify: `THIRD-PARTY-NOTICES.md` (a "Reenie Beanie website source — SIL OFL 1.1" section in the Newsreader section's form)
- Test: `test/unit/website-home-demos.test.js`, new `test/site/home-hero.test.mjs`

**Interfaces:**
- Consumes: Task 3 `<FloatingIslandWindow />`, Task 4 `home.js` hook.
- Produces: in `#opening`: the sunrise (its `--w` smaller, builder's call), `<h1 id="opening-title">A little less browser.</h1>` with `<span class="opening-note" lang="en">now, none at all</span>` positioned against the headline's end, the lead, `.actions` (unchanged Download and switch link), then `<FloatingIslandWindow />` inside `.opening-window`, whose top half is on the first screen.

- [ ] **Step 1: Write the failing tests**
  - Unit (`website-home-demos.test.js`): the h1 assertion stays; add `assert.match(home, /<span class="opening-note"[^>]*>now, none at all<\/span>/)`, `assert.match(home, /<FloatingIslandWindow \/>/)`, and that `reenie-beanie.css` references only `/fonts/reenie-beanie/` (no `fonts.googleapis`).
  - Site (`test/site/home-hero.test.mjs`, against `BLANC_SITE_URL`):
    - `the first screen ends on the headline and Download` — at 1440×900, 1280×800, 1280×720 (reduced motion, after load): `#opening-title` and the Download link are fully inside the viewport, and the window's top edge is visible.
    - `the note sits above the headline end, clear of its letters` (Review Focus 4) — the note's box doesn't intersect the h1's text box (use a Range over the h1 text), with the font loaded and with `/fonts/reenie-beanie/*` blocked by `page.route`.
    - `the window scales as one piece at every width` (Review Focus 5) — at 390, 768, 1024, 1440 px: no horizontal page scroll; the Island's box keeps its share of the window (within 1%) of the ledger's `islandRect`.
    - `reduced motion and no script show the Island at rest` — with `reducedMotion: 'reduce'`, and with JavaScript disabled, `[data-float-window]` is `data-state="shown"` and the Island is visible.
    - `the loop runs` — with motion, within 8 s `data-state` is seen as both `hidden` and `shown`.
- [ ] **Step 2: Run** `node --test test/unit/website-home-demos.test.js` and the site test against a preview — Expected: FAIL.
- [ ] **Step 3: Build the first screen** — keep the sunrise keyframes; the copy's negative margin under the mark changes with the smaller mark; the window gets its own reveal only by the existing `sun-copy` timing (no new scroll-driven motion). The note: Reenie Beanie, `color: var(--gold)`-family, rotated about 6°, with a hand-drawn underline (an inline SVG path, `aria-hidden`); it is real text. Download font files with `npm pack @fontsource/reenie-beanie@5.3.0` and copy `files/reenie-beanie-latin-400-normal.woff2` and `LICENSE` (as `OFL.txt`) unmodified; record the tarball's SHA-512 integrity in the notices section.
- [ ] **Step 4: Run** the unit and site tests, plus `npm run site:build` and `BLANC_SITE_URL=<preview> node --test test/site/scroll-motion.test.mjs test/site/footer.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Website: the floating Island on the homepage's first screen"`

### Task 6: Claims, notices and the stale sentence

**Files:**
- Modify: `docs/website-v1.40-claims.json` (new claims; superseded), `docs/website-cinematic-homepage-claims-v1.34.json` (drifted lead claim moves to `supersededClaims`), `CLAUDE.md`, `AGENTS.md`
- Test: `test/unit/website-feature-evidence.test.js`, `npm run compliance:check`

- [ ] **Step 1: Run** `npm run test:unit` — Expected: FAIL on unrecorded homepage sentences and the drifted lead.
- [ ] **Step 2: Record** each new sentence (the note, the lead, the figcaption) as a `v140-` claim with evidence groups `floatStyle` (new: `src/main/island-autohide.js`, `docs/press/release-notes/v1.40.0.md`, `spec/features.md`, `docs/superpowers/specs/2026-10-20-floating-island-design.md`; qualification: opt-in Auto-hide, float by default since v1.40.0, the window buttons hide with the Island on every platform since #1003, the 6 px drag band stays invisible). Move the drifted lead claim, unchanged, to `supersededClaims` with the October 21 reason. Use the move-verification script from the Glance website PR (#1015): same claims, same order, nothing else touched.
- [ ] **Step 3: Fix the stale sentence** in both CLAUDE.md and AGENTS.md: "on Windows and Linux the window controls (on screen the whole time in float mode) and the main-menu button (which comes and goes with the pill)" → "on Windows and Linux the window controls and the main-menu button, which come and go with the pill (#1003)". Keep the two files' paragraphs byte-identical.
- [ ] **Step 4: Run** `npm run test:unit` and `npm run compliance:check` (THIRD-PARTY-NOTICES.md ships in `app.asar`; if the check reports drift, run `npm run compliance:build` and commit its output) — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Website: record the floating Island hero's copy and its font"`

### Task 7: Review artifacts and the PR

- [ ] **Step 1:** Build, preview, and take before (live blanc.day) / after screenshots of the first screen at 1440×900, 1280×720 and 390×844, and a frame sequence (or a short WebM via Playwright `recordVideo`) of one loop.
- [ ] **Step 2:** Run the full site browser suites against the preview: `BLANC_SITE_URL=<preview> node --test test/site/*.test.mjs` — Expected: all pass except the known shield-popover `pointerOffset` test, which also fails on live blanc.day (recorded in #1015).
- [ ] **Step 3:** Push and open a PR; send the owner the screenshots and the loop. Merge and deploy only after the owner approves.
