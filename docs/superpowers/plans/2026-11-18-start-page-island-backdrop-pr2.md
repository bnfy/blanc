# Start Page wallpaper behind the Island (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On a Start Page the strip's top band paints its slice of the page's own wallpaper layers, so a photo, Sunrise or a Color fill runs behind the Island without a seam. The vertical tabs rail keeps its surface.

**Architecture:** The page reports its computed wallpaper layers over a new `pages:start:backdrop` channel. Main checks them (the pure `src/main/start-backdrop.js`), decides whether the band continues the page, replies with the band height (0 to stand aside), and forwards the spec to the window's strip surfaces as `chrome:page-backdrop`. The strip paints the layers in a box laid out from the band's top, clipped to the band above the page. This is the fork's design (`chromium/blanc/island/host.js` `paintBackdrop`, `newtab-adapter.js` `islandBackdrop` on `chromium/next`), on Electron's own surfaces.

**Spec:** `docs/superpowers/specs/2026-11-18-start-page-widgets-and-island-backdrop-port-design.md` (goal 7, PR 2; owner, 2026-11-18: top band only).

## Global Constraints

- The spec is refused whole on any bad field: zoom 0.25–5, width and height 1–20000, 1–4 layers, each string ≤ 4096 characters and without `\`, opacity 0–1.
- Images: every `url(...)` in a layer must be `blanc://newtab/<flat file name>` or the current `user-wallpaper-*` URL from `wallpaper.js`; gradients pass.
- The band stands aside (band 0, strip gets `null`) for: a private tab, a tab that isn't the window's active one, a visible split, an open Glance, Island auto-hide (either style), full screen, and Match site colors off. Turning Match site colors on or off asks every open Start Page again.
- The vertical tabs rail is never painted; the page needs no horizontal offset.
- The existing top-rows color sample stays (it feeds the fallback color and the window controls' light-or-dark ink).
- New channels change `tab-preload.js`, `pages.js` and `browser-api/bridges.json` together; the strip event changes `preload.js` and `browser-api/contract.json` together; `npm run browser-api:build`, `audit-inventory:write`, and the Android adapter (`node chromium/tools/android-pages.mjs`, `python3 chromium/tools/refresh-source-map.py`).
- Window-opening checks run on the Mac Studio. No AI model name in commits.

## Review Focus

1. A Start Page in a background tab, or in another window, must never paint the active window's band.
2. Switching from a Start Page to a website tab must drop the backdrop at once (the website's sampled color returns).
3. A wallpaper change (Sunrise → photo, a new photo, Color) must update the band, cross-fading with the page.
4. Turning on vertical tabs or changing Island size must keep the seam (the page re-reports on resize).
5. Private Start Pages keep their private theme color.

---

### Task 1: The rules (`src/main/start-backdrop.js`)

- `normalizeBackdrop(spec, { wallpaperUrl }) -> {zoom,width,height,layers} | null`
- `backdropBand({ isActive, isPrivate, splitVisible, glanceOpen, autoHide, fullScreen, siteColors, pageTop }) -> number` (0 to stand aside)
- Test `test/unit/start-backdrop.test.js`: a valid Sunrise spec and a photo spec pass unchanged; each bad field refuses the whole spec; a `url()` to another host, a nested path, `javascript:` or a stale wallpaper URL refuses; each stand-aside reason gives 0; otherwise the page top.

### Task 2: Page and main

- `src/renderer/pages/newtab-backdrop.js` (the fork's reporter, minus its photo-key rewrite: Electron's photo already has a `blanc://newtab/` URL); `pages.css` gets the fork's `[data-island-band]` rules without the rail offset.
- `pages:start:backdrop` (newtab only) → main hook; `pages:start:backdrop-refresh` event to every Start Page when Match site colors changes.
- main forwards `{ tabId, spec: {...normalized, band} | null }` on `chrome:page-backdrop` to `stripSurfaces(runtime)`.

### Task 3: Strip

- `preload.js` `onPageBackdrop`; contract entry.
- `index.html` `#bandBackdrop` (four layer divs) as the strip's first child; `styles.css` places it at `left: var(--vertical-tabs-w)` in vertical layout, clipped to the band, `z-index: -1`, layers cross-fade 2 s (none with reduced motion), strip background transparent while shown.
- `renderer.js` keeps the latest spec per tab and paints for the active tab only when its URL is `blanc://newtab/` and it isn't private.

### Task 4: Checks

- `test/desktop/start-backdrop-smoke.mjs`: on a Sunrise Start Page and over a photo, the strip's last band row and the page's first row differ by less than 6 of 255 on average; a website tab drops the backdrop; Match site colors off drops it; vertical tabs keep the band above the page only. Added to `parity-guards.yml` beside the widget smoke.
- Unit, lint, substrate, bridge and the fork's unit checks locally; the smoke and `@F35` on the Mac Studio.
