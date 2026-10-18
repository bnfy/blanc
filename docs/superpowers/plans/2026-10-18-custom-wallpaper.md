# Blanc personalization: competitor audit + custom wallpaper plan

## Context

A user asked for custom wallpapers. Today the Start Page can show only bundled art: the static Sunrise PNG, or the four time-of-day phases (`newtabDynamicWallpaper`). There's no accent color, no user image, and no file-to-image pipeline. The owner is moving Blanc to a forked Chromium (memory, 2026-10-18; prototype on `origin/codex/chromium-extension-spike`), so whatever we build must carry over: logic in pure modules, settings in `settings-schema/schema.json`, page capabilities in `browser-api/bridges.json`, and no Electron-only storage tricks. Decisions taken: build custom wallpaper in full now and sketch the rest as later phases; the image stays **on this device** (not synced).

## Competitor audit (summary)

| | Custom upload | Gallery / daily | Theme color | Per-space theme | Notable |
|---|---|---|---|---|---|
| Chrome | ✓ | ✓ / ✓ (Refresh daily) | swatches + eyedropper | per profile | "Customize Chrome" side panel, everything saves as you go |
| Edge | ✓ | ✓ / ✓ | 14 swatches | per profile | AI theme generator recolors the frame from an image |
| Vivaldi | ✓ | ✓ / ✓ (Unsplash) | full editor, accent from page | private-window theme | **only theme scheduler**; transparency, corner radius |
| Opera / GX | ✓ | ✓ ; animated live wallpapers | shader themes | ? | mod store: sounds, fonts, wallpapers |
| Brave | ✓ | ✓ ; solid colors + gradients | Chromium | per profile | sponsored images layered on top |
| Firefox | ✓ (since 139) | curated collections | light/dark/colorful | per profile | AMO themes |
| Safari | ✓ | presets | system accent | per profile | Start Page syncs across devices |
| Arc | — | — | color grid, 3-stop gradient, **grain** | **per Space** | maintenance-only now |
| Zen | — | — | gradient + noise picker | **per workspace** | mods registry, live CSS |
| Helium | — | minimal | gray + schemes | — | deliberately plain |
| Orion | ✓ (v129) | — | accent; tab-color borders (paid) | — | — |

Takeaways for Blanc:
1. Custom upload is now table stakes (every major browser has it, Firefox since 139).
2. Per-Space theming is what sets the newer browsers apart, and Blanc already has Space colors and symbols.
3. No browser has a dim/blur readability control. Blanc's auto-legibility footer, per spec `2026-10-18-start-page-footer-blending`, can be the quiet differentiator.
4. Theme scheduling is Vivaldi-only. It's cheap for Blanc because time-of-day phases already exist.
5. Skip theme marketplaces, custom CSS and animated wallpapers. They conflict with "minimal", the security posture and memory claims.

Verification gaps: Dia, SigmaOS and Orion are thinly documented, and none of this goes into marketing copy (`docs/marketing-claims.md`).

## Phase 1 (this plan): Custom wallpaper

### Behavior
- Customize popover (newtab footer centre). The wallpaper control becomes a 3-way choice: **Sunrise** · **Time of day** · **Your image**. Picking "Your image" opens a native file picker (JPEG, PNG, WebP, HEIC where `nativeImage` decodes it). Once an image is set, a small **Change…** / **Remove** pair appears. Settings → General gets the same select.
- The image is drawn `cover`, centred. Footer ink and scrim are chosen automatically from the image's measured luminance (light or dark ink), reusing the per-phase tint variables in `pages.css` (~L2994–3034).
- Private tabs keep the private Start Page styling and never show the custom image. The private page shouldn't reveal personal photos to shoulder-surfers, and it keeps the private theme rule simple.
- Remove returns to Sunrise. A missing or corrupt file also falls back to Sunrise silently, the same as the current image-load failure path in `newtab-wallpaper.js`.

### Data model (fork-portable)
- **Setting:** add `newtabWallpaper` enum `sunrise | time-of-day | custom` to `settings-schema/schema.json` (new `wallpaperSources` enum, default `sunrise`). It's synced: if a device has no image, `custom` renders Sunrise. Keep `newtabDynamicWallpaper` as a derived rollback mirror: `time-of-day` → `true`, otherwise `false`. On first read, migrate `newtabDynamicWallpaper: true` → `time-of-day`, the same pattern as the other one-time migrations in `src/main/settings.js`.
- **Image + metadata:** a new device-local store, not in settings:
  - `userData/wallpaper/current.jpg`: the processed image.
  - `userData/wallpaper.json`, written via `JsonStore` from `src/main/store.js`: `{version:1, hash, width, height, luma, updatedAt}`.
  - Like every device-level setting, it's added to `profile-deletions`-independent device scope and stays out of `SYNCED_KEYS` and Sync entirely.
- **Pure module** `src/main/wallpaper-model.js`, with no `require('electron')`. It holds:
  - size limits (input ≤ 25 MB, output long edge ≤ 3840 px)
  - `chooseInk(luma)`
  - metadata validation and normalisation
  - the source fallback (`effectiveSource(setting, hasImage, isPrivate)`)

  This is the piece that ports to C++ or reuses as test vectors in the fork.
- **Electron adapter** `src/main/wallpaper.js`:
  - the picker (pattern: `pages:bookmarks:import` in `src/main/pages.js:206`, with its size check and `fs.promises.open`)
  - decode via `nativeImage.createFromBuffer`, with the sandboxed canvas decoder in `src/main/icon-raster.js` as fallback for WebP
  - resize, re-encode to JPEG q≈85, which also **strips EXIF/GPS**
  - compute mean luminance from a 32×32 downscale
  - atomic write: temp file + rename, mode 0600

### Serving (no data URLs, no localStorage)
- Add one exact-match route in `src/main/pages.js`'s protocol handler: `blanc://newtab/user-wallpaper` (the `?v=<hash>` query is only a cache-buster). It streams `userData/wallpaper/current.jpg` with `image/jpeg`. It's checked *before* the flat `resolvePagesAsset` path, so the basename-only rule for `PAGES_DIR` is untouched. It's served only to the `newtab` host and only when a file exists; otherwise it returns 404.
- The `newtab.html` CSP needs no change: `img-src 'self'` already covers same-origin `blanc://newtab`.
- In the fork, this maps 1:1 to a WebUI data source path (`chrome://newtab/user-wallpaper`). Record that in the F-spec.

### Bridge / IPC
- New `pages:*` channels registered with `handle(channel, ['newtab','settings'], fn)`:
  - `pages:start:set-wallpaper-source` (enum)
  - `pages:start:choose-wallpaper` (opens the picker; returns `{ok, error?}` with fixed error ids `too-large | unsupported | cancelled | failed`)
  - `pages:start:remove-wallpaper`

  Each returns the projected status, never paths or file bytes. They replace or extend `pages:start:set-dynamic-wallpaper` (`pages.js:564`); keep the old channel working as an alias for one release.
- Extend `startPageStatus()` (`main.js:~11308`) with `wallpaperSource`, `customWallpaper: {url, ink} | null`, and carry it through `broadcastStartPageStatus` so Settings and open Start Pages update live.
- Update `src/main/tab-preload.js` start members, `browser-api/bridges.json`, `security/audit-surface-inventory.json`, then run `npm run browser-api:build` and `npm run audit-inventory:write`.

### Renderer
- `src/renderer/pages/newtab-wallpaper.js`: add a `custom` source. It reuses the existing two-layer crossfade and preload, swapping `--wallpaper-image` to the served URL and setting a `data-wallpaper-ink="light|dark"` attribute that `pages.css` maps to the footer tint tokens. Styling stays in CSS classes and tokens, no inline styles.
- `newtab.html` / `newtab.js` (~L881–941): the popover control, plus Change/Remove.
- `settings.html` / `settings.js` (~L68–96): replace the toggle row with a select, plus a Choose image… button.
- Copy: new keys in `copy/messages/en.json` *and* de/es/fr/pt-BR/it in the same PR, then `npm run copy:build`.

### Spec & docs
- `spec/features.md`: new **F49 Start page wallpaper** (sources, fallback, private rule, device-local image, serving contract). Update the F35 Customize popover text. Fix the stale F17 colorway count in passing, only if it's touched.
- `docs/superpowers/specs/2026-10-18-custom-wallpaper-design.md` + a plan file, per the repo workflow.
- Note in the spec that the fork prototype's `localStorage` wallpaper prefs (`prototype/newtab-adapter.js`) must move to this schema key.

## Later phases (sketch only, separate specs)
2. **Solid and gradient backgrounds:** a 4th source, `color`, using the 8 `SpaceIdentity.PRESETS` plus a soft two-stop gradient. It's pure CSS, so it syncs trivially.
3. **Per-Space wallpaper:** a Space optionally carries `wallpaper: 'inherit' | source`. The Start Page follows the active Space, matching Arc and Zen's best feature on top of existing Space identity (`src/renderer/space-identity.js`, `workspaces-model.js`).
4. **Light/dark schedule:** `theme: 'time-of-day'`, reusing `phaseForTime` from `newtab-wallpaper.js`, so dark follows dusk and night. It drives `nativeTheme` today and `ThemeService` in the fork (plan F15).
5. **Wallpaper sync:** a separately budgeted encrypted image store, like tab icons, only if users ask.

Deliberately out: custom CSS, theme marketplace, animated wallpapers, an Island accent color (brand rule: Island stays neutral).

## Verification
- Unit: `test/unit/wallpaper-model.test.js` covers limits, ink choice, fallback matrix and migration. Extend `newtab-wallpaper.test.js` and `newtab-layout-settings.test.js`, plus a protocol test that `user-wallpaper` is newtab-only and 404s without a file.
- Guards: `npm run substrate:check`, `npm run browser-api:check`, `npm run copy:check`, `npm run audit-inventory:check`, `npm run lint`, `npm run test:unit`.
- Desktop: extend `test/desktop/newtab-wallpaper-smoke.mjs` to set a fixture JPEG via the test hook (bypassing the picker, like `arcTestChosenFile`), then assert the layer URL, ink attribute, private-tab fallback and Remove. Add an acceptance scenario under `spec/acceptance/` for F49.
- Manual: relaunch `npm start` (chrome loads once), pick a bright photo and a dark photo, check footer legibility in light and dark themes, and confirm with `exiftool` that the stored JPEG has no GPS metadata. Then a packaged `dist:dir` check with a real profile.
- No website or marketing mention until a public release ships it.

> Implementation notes: see the "Deviations from the first plan" section of `docs/superpowers/specs/2026-10-18-custom-wallpaper-design.md`.
