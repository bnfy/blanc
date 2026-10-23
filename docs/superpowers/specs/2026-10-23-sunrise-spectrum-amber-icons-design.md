# Sunrise Spectrum and Sunrise Amber app icons — design

Date: 2026-10-23. Status: approved; Mac only.

## Intent

Add two macOS app icons that sit closer to Arc's Liquid Glass icon: **Sunrise Spectrum** (blue to coral) and **Sunrise Amber** (gold to orange). Both redraw the Sunrise's sun and rays, on the shipped artwork's proportions, in heavy rounded strokes and with no water lines. The sun and rays are colored Icon Composer glass over a white rim, on a pale tile. Users choose them in Settings → General → App icon, after Sunrise Gold.

## What the owner decided

- The owner asked for Dock icons "that resemble Arc's icon more" and shared Arc's current glass icon as the reference: a pale tile, glossy gradient ribbons, a white rim and a soft glow.
- From four flat drafts (`assets/2026-10-23-sunrise-spectrum-amber-icons/first-options.png`), the owner chose **A, Glass Sunrise** (the full mark in Arc's blue-to-coral range) and **D, Glass gold** (the same build in Blanc's warm colors), and asked to offer both. B (Ribbons) and C (Three strokes) were not picked.
- The owner asked for authentic Liquid Glass, so both were rebuilt as Icon Composer packages and proven with `ictool` in Default, Dark, Clear and Tinted (`glass-proof.png`).
- **Mac only.** The owner first asked for comparable Windows and Linux options. Drafts were drawn (`windows-linux-drafts.png`): a freestanding glyph in a nine-frame `.ico` for Windows, and an Adwaita-style tile for Linux. On review, the owner chose to keep both icons on Mac only, for the same switching limits as Sunrise Gold:
  - On Windows, only rewriting the installer-owned shortcuts changes the taskbar icon (PR #979).
  - On Linux, the icon comes from the `.desktop` file, and a per-user override is untested across AppImage, Snap and Flatpak.
- **No water lines.** To make the sun and its outline larger and easier to see, the owner compared three water lines, one horizon line and none (`horizon-lines-compare.png`), and chose none.
- **The real Sunrise's proportions.** The owner then asked for the sun and rays to follow the shipped mark more closely: a bigger sun standing higher above the horizon, and a middle ray taller than the rest. The geometry is now measured from `build/app-icons/Icon.icon/Assets/sunrise-mark.png` (`sunrise-proportions-compare.png`).
- **A risen sun.** At those exact proportions the sun still read too small and short, because the glass rays are much heavier than the artwork's hairlines. Three options were compared (`sun-size-options.png`): a bigger half disc, a risen sun, and a risen sun with slimmer rays. The owner chose **B, the risen sun at the current ray weight**.

## Goals

1. On packaged macOS 26+, choosing either icon makes the Dock show its glass stack from the bundle's `Assets.car`. Light shows the pale tile; in Dark, macOS darkens the fill to near-black.
2. In unpackaged and pre-macOS 26 runs, the Dock shows a flat PNG for the current appearance, the same fallback the other icons have.
3. Both appear in the existing Mac-only App icon picker, after Sunrise Gold.

## Non-goals

- No Windows or Linux changes, and no change to the default icon, Finder's icon or the website. Website copy waits for a release (`docs/marketing-claims.md`).
- Clear and Tinted are unchanged: in those styles `app-icon.js` already shows the bundle icon (Sunrise), as it does for Sunrise Gold.
- Patron unlocks nothing.

## Artwork

`scripts/app-icon-colorways.js` draws everything from one geometry, and `brand:build` renders it.

- **Mark:** a risen sun and 7 rays with rounded caps, no water lines.
  - **Rays:** measured from the Browser's native layer. They sit at 0°, ±28°, ±52.5° and ±76°, and their tips reach 545, 470, 455 and 394 from the sun's center, so the middle ray stands tallest.
  - **Sun:** where the artwork has a 210 half disc, the sun here has a radius of 225 and its center stands 80 above its flat base. More than half the disc shows, so it reads larger and taller against the heavy rays.

  Two more things differ from the shipped artwork:
  - the rays are 52 wide, against the artwork's 22, so the glass reads at Dock size;
  - they start 42 beyond the sun's edge, so their white rims stay clear of the sun's.

  The mark is centered on the 1024 canvas and scaled so that, rim included, its longer side is 800 px in the native layers. It is a deliberate redraw, so it is the one Sunrise surface not derived from `assets/sunrise-mark.svg`.
- **Colors** (horizontal gradients across the mark):
  - Spectrum rays `#2F55FF → #7C3BFF → #F0409A → #FF5A72 → #FF8C7A`, sun `#9A3BF5 → #F0409A → #FF6A6A`.
  - Amber rays `#F28A3A → #F5AC3C → #F8C64E → #F5AC3C → #F28A3A`, sun `#F7A52E → #F2803A → #EC6248`.
- **Gloss:** each stroke carries a soft white highlight along its top edge, baked into the layer and masked to the stroke. Icon Composer's specular rim and glow sit on top.

### Native stack

| Group | Layers | Glass | Notes |
|---|---|---|---|
| front | `<prefix>-sun.png`, `<prefix>-rays.png` | **true** | `specular: true`, `lighting: "individual"`, shadow `layer-color` 0.5, translucency 0.15 |
| back | `<prefix>-rim.png`, the white outline 14 px (before scaling) beyond every stroke | false | hidden in `tinted` (Clear and Tinted); shadow `neutral` 0.3 |

- The fill is `automatic-gradient`: Spectrum `#FBFAFD`, Amber `#FFF7EC`, with dark specializations `#3A3942` and `#2E261C`.
- Icon Composer renders both Dark tiles near-black (`#1F1F1E` to `#100F0F`), which the owner approved in `glass-proof.png`.
- `createIconDocument` gains `extraLayers` (more layers in the front group) and `rimImageName` (the back group). Existing colorways are unchanged.

### Flat fallbacks

- `icon-sunrise-<prefix>.png` and `-dark.png` draw the 824 px tile with the flat icons' drop shadow, using tile colors sampled from `ictool`'s renders.
- The glass is approximated with a color glow, the white rim with its own shadow, the strokes and the gloss.
- The flat mark scale is the native scale × 824/1024, so the sun takes the same share of the visible tile in both versions. `test/unit/app-icon.test.js` holds the two together.

## Verification

- `built-stacks.png` shows packages built from the committed layers by `createIconDocument`, rendered by `ictool` in all four appearances, followed by both flat fallbacks.
- Unit tests cover the catalog, the stack structure, the fallback choice, artwork size, the risen sun, the tallest middle ray and the rim.
- `brand:check` guards the generated PNGs.
- Still to check by hand: the live Dock in a packaged build (`dist:dir`), Light and Dark, and switching between icons in Settings.
