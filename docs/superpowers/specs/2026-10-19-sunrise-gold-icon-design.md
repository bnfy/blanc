# Sunrise Gold app icon — design

Date: 2026-10-19 (revised the same day: polished gold in Dark, stronger glass). Status: approved; Mac only.

## Intent

Add a third macOS app icon, **Sunrise Gold**: a cream Sunrise with Icon Composer Liquid Glass on gold. It is soft gold in Light and a darker, polished metallic gold in Dark, so it reads on either Dock. Users choose it in Settings → General → App icon.

Today **Sunrise** switches between a cream and a near-black tile with the system appearance, and **Sunrise Dark** is always the dark tile. Gold stays gold in both appearances, with a finish that suits each.

## What the owner decided

- Direction **B, Gold** (a cream mark on a gold tile), chosen over Dawn (a sky gradient) and Teal.
- Refinement **B3, Glass**: Icon Composer glass on the mark, chosen over a flat cream mark (B1) and an engraved one (B2). See `assets/2026-10-19-sunrise-gold-icon/options.png` and `closeup.png`.
- **Revision, same day.** The owner found the glass too subtle and asked for a more premium, realistic, darker gold in Dark mode. From `dark-finish-options.png` they chose:
  - **D2 Polished** for Dark, over D1 Antique and D3 Black gold;
  - **G1 Specular rims** for the glass, over G2 See-through.
  
  The result is in `final-light-dark.png`. This replaces the first version's "identical in Default and Dark".
- **Clear and Tinted.** In those styles macOS draws its own glass or tint background, so both gold tiles hide there and only the glass mark remains, as with Sunrise (`macos-styles.png`: Sunrise on top, Gold below, all six styles). In the live Dock, though, macOS restyles only the app's bundle icon for Clear and Tinted. An image given to `app.dock.setIcon` stays as drawn, while a named stack still follows Light and Dark. So in Clear and Tinted the Dock shows the bundle icon:
  - Blanc reads `AppleIconAppearanceTheme` (for example `ClearLight` or `TintedDark`; absent in Default).
  - It checks again when it becomes active and every 10 s, because macOS sends apps no notice of the change.
  - It clears the custom image with `app.dock.setIcon(null)`.
  
  Switching back to Sunrise now clears the image the same way. Loading the bundle stack by name had frozen it, so Sunrise lost Clear and Tinted until relaunch. The owner verified Clear, Tinted, Default and Dark in a packaged build on October 19.
- **This PR is macOS only.**
  - **Linux is dropped.** Blanc runs on Wayland whenever a Wayland session exists (`src/main/display-capture-flags.js`), and on X11 the docks draw the `.desktop` icon.
  - **Windows is out.** The October 19 VM spike (PR #979, `docs/research/windows-runtime-app-icon-spike-2026-10-19.md`) found that `setIcon` reaches only Alt-Tab and `setAppDetails` changes nothing. Only rewriting the installer-owned Start menu and pinned shortcuts turns the taskbar gold. The owner decided the same day to leave Windows as it is and ship Sunrise Gold for Mac only.

## Goals

1. On packaged macOS 26+, choosing Sunrise Gold makes the Dock show a glass icon compiled into the bundle's `Assets.car`: soft gold in Default, polished gold in Dark.
2. In unpackaged and pre-macOS 26 runs, the Dock shows a flat PNG of Gold for the current appearance, the same fallback the other icons have. Settings uses the Light PNG as the swatch.
3. Sunrise Gold appears in the existing Mac-only App icon picker, after Sunrise Dark.

## Non-goals and anti-goals

- No Windows or Linux changes. The picker stays macOS-only, still gated by the existing `navigator.platform` check.
- **The retired monogram id `gold` is not reused.** `gold` is a B-monogram colorway (`MONOGRAM_ICON_IDS`, excluded from the package), and a stale saved `gold` must keep sanitizing to Sunrise. The new id is `sunrise-gold`.
- No change to the default icon, Finder's icon (it keeps the bundle's Sunrise, as `macHint` already says), or the website. Website copy waits for a release (`docs/marketing-claims.md`).
- **Anti-goal: letting Icon Composer pick the Dark gold.** Icon Composer darkens an `automatic-gradient` fill on its own in Dark; the first proof showed it, when B and C went black. So both golds are image layers, and the Dark one is chosen by a layer specialization, not by a fill.
- Patron unlocks nothing.

## Artwork (macOS native stack)

An Icon Composer document with two groups:

| Group | Layer | Glass | Notes |
|---|---|---|---|
| front | `sunrise-mark-cream.png`, the Sunrise mark as a cream `#FFF7E6` silhouette | **true** | group: `specular: true`, `lighting: "individual"`, shadow `layer-color` at 0.6, translucency enabled at 0.25 |
| back | `gold-tile-dark.png`, a full 1024 canvas | false | `hidden-specializations`: hidden by default, shown in Dark, hidden in `tinted` (Clear and Tinted) |
| back | `gold-tile.png`, a full 1024 canvas | false | `hidden-specializations`: hidden in Dark and in `tinted` |

- **Light tile:** a vertical gradient from `#E3BF78` (top) to `#BE8D40` (bottom), screened with a soft radial glow so a little warmth sits behind the sun. The glow fades from `#383838` to black over a 310 px radius, centered at (512, 482).
- **Dark tile (D2 Polished):**
  - A diagonal metallic gradient, top-left to bottom-right, with these stops: `#3B2709` 0, `#7D5A22` .22, `#B48D45` .36, `#805C23` .46, `#432D0D` .7, `#6A4A1B` .86, `#241705` 1.
  - Overlaid in soft-light with horizontal brushed grain: seeded noise, a 121 px horizontal box blur, normalized, then mapped to 40% ± 10% gray.
  - The seed is fixed, so every build draws the same streaks.
- **Fill:** the document-level `fill` stays an `automatic-gradient` with no dark specialization. It is hidden behind the opaque tiles.
- **Mark:** the same placement as the Browser's native layer (`sunrise-mark.png`: 845 px at 89 px on the 1024 canvas), drawn as a silhouette through its alpha. My call: use the **seam-closed** version (`closeVerticalSeams` with `SUNRISE_INK_SEAM`), following the repo's rule that flat silhouettes close the hairline between the disc and the horizon bar.
- `npm run brand:build` generates the three PNGs from `assets/sunrise-mark-4096.png`, and `brand:check` guards them, like every other Sunrise surface. They live in `build/app-icons/colorways/` (my call), outside the committed `Icon.icon` package, so the default icon's package is unchanged.

## Artwork (flat PNGs)

`src/renderer/pages/icon-sunrise-gold.png` (Light) and `icon-sunrise-gold-dark.png` (Dark) are drawn by `brand:build` with sharp, so they build the same way on any OS.

- **Geometry:** the existing flat-Dock layout of `icon-sunrise.png`, an 824 px tile inset 100 px with `rx` 184 and the same drop shadow.
- **Content:**
  - each appearance's tile;
  - the same cream seam-closed mark at the flat size and position (`SUNRISE_FLAT_SIZE`/`SUNRISE_FLAT_POSITION`);
  - a halo standing in for the glass layer's shadow. In Light it is a dark shadow (black at 0.22, blur 5, dy 6). In Dark it is a cream glow (0.45, blur 9).
- My call: no attempt is made to imitate refraction.

## Code changes

- **`src/main/app-icon-assets.js`:** add `'sunrise-gold'` with `nativeName: 'SunriseGold'`, plus fields for the mark, its glass and group settings, both tiles, and `darkFlatIcon: 'sunrise-gold-dark'`. Sunrise gains `darkFlatIcon: 'sunrise-dark'`, which replaces the hard-coded Sunrise case.
- **`scripts/after-pack-app-icons.js`:** `createIconDocument` gains:
  - optional group `shadow`, `specular`, `lighting` and `translucency`, with the old values as defaults;
  - per-layer `glass`;
  - an optional tile group, with an optional Dark tile shown through `hidden-specializations`; every tile hides in the `tinted` appearance.
  
  It copies images from the definition's own directory. The `Icon` (default) skip stays.
- **`src/main/app-icon.js`:**
  - The flat fallback uses the definition's `darkFlatIcon` in Dark (`flatIconIdFor`), instead of special-casing Sunrise.
  - In Clear and Tinted (`isMonochromeIconStyle`), and whenever the bundle icon is the target, it clears the Dock image instead of loading a stack by name.
- **`src/main/main.js`:** passes `iconStyle` and watches it (`watchIconStyle`: `did-become-active` plus a 10 s check, packaged macOS only). `security/audit-surface-inventory.json` is refreshed with it.
- **`src/main/settings.js`:** `APP_ICON_LABELS` gains `'sunrise-gold': 'Sunrise Gold'` after Sunrise Dark. The existing startup guard requires the matching `app-icon-assets.js` entry.
- **`settings-schema/schema.json`:** `appIcons` gains the same entry, and the `appIcon` note describes Gold. Then run `settings:build`.
- **Copy:** none. Labels are proper names (`data-i18n-ignore`), and the macOS hint is unchanged.
- `appIcon` stays device-local.

## Tests

- **`test/unit/app-icon.test.js`:**
  - Every colorway's images exist, and the default `Icon.icon/Assets` is unchanged.
  - The Gold stack is a glass mark with the G1 group settings over per-appearance tiles, with no fill specialization.
  - The other colorways keep the default single-group stack.
  - The flat fallback follows appearance.
  - The artwork test checks: the tiles' colors and opacity; the Dark tile is much deeper and still gold; the cream mark; and both flat icons drawing the mark at the native layer's scale.
- **`test/unit/first-run-settings.test.js`:** Gold is selectable, and a saved `gold` reads as Sunrise.
- **`test/unit/brand-assets.test.js`:** both Gold flat PNGs ship.

## Docs to update in the same PR

- `CLAUDE.md` **and** `AGENTS.md`, App icon paragraph.
- `spec/features.md` and `spec/parity-matrix.md`, where they list app icons.

## Verification

- `npm run test:unit`, `npm run substrate:check`, `npm run lint`.
- **Unpackaged:** `npm start`, select Sunrise Gold, and confirm the flat Dock PNG in Light and Dark.
- **Packaged:**
  - `npm run dist:dir` on this Mac (macOS 26), select Gold, and screenshot the Dock in Light and Dark.
  - Switch back to Sunrise and confirm the adaptive icon returns.
  - Render the generated stack with `ictool` in all six styles and compare it with `final-light-dark.png` and `macos-styles.png`.
