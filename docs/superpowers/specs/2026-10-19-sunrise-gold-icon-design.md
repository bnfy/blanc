# Sunrise Gold app icon — design

Date: 2026-10-19. Status: approved; Mac only.

## Intent

Add a third macOS app icon, **Sunrise Gold**: a cream Sunrise with Icon Composer Liquid Glass on a soft gold tile. It is the same in light and dark mode and reads on a light or a dark Dock. Users choose it in Settings → General → App icon.

Today **Sunrise** switches between a cream and a near-black tile with the system appearance, and **Sunrise Dark** is always the dark tile. Each of them sits poorly on a Dock of the opposite appearance. Gold is a mid-tone tile, so it works on both.

## What the owner decided

- Direction **B, Gold** (a cream mark on a gold tile), chosen over Dawn (a sky gradient) and Teal.
- Refinement **B3, Glass**: Icon Composer glass on the mark, chosen over a flat cream mark (B1) and an engraved one (B2). See `assets/2026-10-19-sunrise-gold-icon/options.png` and `closeup.png`.
- The icon is identical in macOS Default and Dark. macOS still restyles it in Clear and Tinted, as it does every app icon. `macos-styles.png` shows, in order: Default, Dark, Clear light, Clear dark, Tinted light, Tinted dark.
- **This PR is macOS only.**
  - **Linux is dropped.** Blanc runs on Wayland whenever a Wayland session exists (`src/main/display-capture-flags.js`), and on X11 the docks draw the `.desktop` icon.
  - **Windows is out.** The October 19 VM spike (PR #979, `docs/research/windows-runtime-app-icon-spike-2026-10-19.md`) found that `setIcon` reaches only Alt-Tab and `setAppDetails` changes nothing. Only rewriting the installer-owned Start menu and pinned shortcuts turns the taskbar gold. The owner decided the same day to leave Windows as it is and ship Sunrise Gold for Mac only.

## Goals

1. On packaged macOS 26+, choosing Sunrise Gold makes the Dock show a glass icon compiled into the bundle's `Assets.car`. It looks the same in Default and Dark.
2. In unpackaged and pre-macOS 26 runs, the Dock shows a flat PNG of Gold, the same fallback the other icons have. Settings uses that PNG as the swatch.
3. Sunrise Gold appears in the existing Mac-only App icon picker, after Sunrise Dark.

## Non-goals and anti-goals

- No Windows or Linux changes. The picker stays macOS-only, still gated by the existing `navigator.platform` check.
- **The retired monogram id `gold` is not reused.** `gold` is a B-monogram colorway (`MONOGRAM_ICON_IDS`, excluded from the package), and a stale saved `gold` must keep sanitizing to Sunrise. The new id is `sunrise-gold`.
- No change to the default icon, Finder's icon (it keeps the bundle's Sunrise, as `macHint` already says), or the website. Website copy waits for a release (`docs/marketing-claims.md`).
- **Anti-goal: a Gold that turns dark in Dark mode.** Icon Composer darkens an `automatic-gradient` fill on its own in Dark; the first proof showed it, when B and C went black. So the gold must be an image layer, not a fill.
- Patron unlocks nothing.

## Artwork (macOS native stack)

An Icon Composer document with two groups:

| Group | Layer | Glass | Notes |
|---|---|---|---|
| front | `sunrise-mark-cream.png`, the Sunrise mark as a cream `#FFF7E6` silhouette | **true** | group shadow `neutral`, opacity 0.3 |
| back | `gold-tile.png`, a full 1024 canvas | false | fixed gold; Icon Composer clips it to the squircle |

- **Tile:** a vertical gradient from `#E3BF78` (top) to `#BE8D40` (bottom), screened with a soft radial glow so a little warmth sits behind the sun. The glow fades from white to black over a 620 px diameter, at 0.22 strength, centered 30 px above the canvas center.
- **Fill:** the document-level `fill` stays an `automatic-gradient` with no dark specialization. It is hidden behind the opaque tile.
- **Mark:** the same placement as the Browser's native layer (`sunrise-mark.png`: 845 px at 89 px on the 1024 canvas), drawn as a silhouette through its alpha. My call: use the **seam-closed** version (`closeVerticalSeams` with `SUNRISE_INK_SEAM`), following the repo's rule that flat silhouettes close the hairline between the disc and the horizon bar.
- `npm run brand:build` generates both PNGs from `assets/sunrise-mark-4096.png`, and `brand:check` guards them, like every other Sunrise surface. They live in `build/app-icons/colorways/` (my call), outside the committed `Icon.icon` package, so the default icon's package is unchanged.

## Artwork (flat PNG)

`src/renderer/pages/icon-sunrise-gold.png` is drawn by `brand:build` with sharp, so it builds the same way on any OS.

- **Geometry:** the existing flat-Dock layout of `icon-sunrise.png`, an 824 px tile inset 100 px with `rx` 184 and the same drop shadow.
- **Content:** the same gold tile and glow, the same cream seam-closed mark at the flat size and position (`SUNRISE_FLAT_SIZE`/`SUNRISE_FLAT_POSITION`), and a soft shadow under the mark (dy 6, blur 10, black at 0.22) standing in for the glass shadow.
- My call: no attempt is made to imitate refraction.

## Code changes

- **`src/main/app-icon-assets.js`:** add `'sunrise-gold'` with `nativeName: 'SunriseGold'` and a shape that names the mark image, its glass flag and the tile image. The exact field names are the builder's call.
- **`scripts/after-pack-app-icons.js`:** `createIconDocument` gains an optional back tile layer and per-layer `glass`, and copies images from the definition's own directory instead of always from `Icon.icon/Assets`. The `Icon` (default) skip stays.
- **`src/main/app-icon.js`:** no new branches. Gold is not adaptive, so its PNG fallback is `icon-sunrise-gold.png` in both appearances.
- **`src/main/settings.js`:** `APP_ICON_LABELS` gains `'sunrise-gold': 'Sunrise Gold'` after Sunrise Dark. The existing startup guard requires the matching `app-icon-assets.js` entry.
- **`settings-schema/schema.json`:** `appIcons` gains the same entry, and the `appIcon` note says Gold is fixed. Then run `settings:build`.
- **Copy:** none. Labels are proper names (`data-i18n-ignore`), and the macOS hint is unchanged.
- `appIcon` stays device-local.

## Tests that must change

- **`test/unit/app-icon.test.js`, "every selectable colorway…":** it hard-codes `['sunrise', 'sunrise-dark']` and expects every stack to use `sunrise-mark.png`. Rewrite it to cover Gold's two layers, glass on the mark, and no dark specialization.
- **The flat/native size-match test** finds the mark by a gold-on-light color test, which cannot see a cream mark on gold. Add a Gold variant that detects the mark by its alpha or by its contrast with the tile.
- **New tests:**
  - `createIconDocument` for the Gold definition.
  - A stale saved `gold` still sanitizes to `sunrise`.
  - `applyDockAppIcon` uses `icon-sunrise-gold.png` in both appearances.
- Check `development-brand-preview.test.js`, `first-run-settings.test.js` and `brand-assets.test.js` for id lists.

## Docs to update in the same PR

- `CLAUDE.md` **and** `AGENTS.md`, App icon paragraph: "Its selectable catalog is Sunrise and Sunrise Dark" now includes Sunrise Gold, and the paragraph says Gold is a fixed glass icon.
- `spec/features.md` and `spec/parity-matrix.md`, where they list app icons.
- `ASSET-LICENSE.md`, if it lists the icon files.

## Verification

- `npm run test:unit`, `npm run substrate:check`, `npm run lint`.
- **Unpackaged:** `npm start`, select Sunrise Gold, and confirm the flat Dock PNG in Light and Dark.
- **Packaged:**
  - `npm run dist:dir` on this Mac (macOS 26), select Gold, and screenshot the Dock in Light and Dark.
  - Switch back to Sunrise and confirm the adaptive icon returns.
  - Render the compiled stack's source `.icon` with `ictool` (Default and Dark) and compare it with `options.png` B3.
