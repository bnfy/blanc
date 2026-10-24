# Sunrise Spectrum and Sunrise Amber app icons — design

Date: 2026-10-23. Status: approved; Mac only.

## Intent

Add two macOS app icons that sit closer to Arc's Liquid Glass icon: **Sunrise Spectrum** (coral and red over royal blue and navy, Arc's colors) and **Sunrise Amber** (gold and bronze). Both redraw the Sunrise on its own geometry as an outlined ring sun, seven rays and six stepped water lines. Where the ring passes behind a water line, the line takes on the ring's color, the way Arc's strokes overlap. The parts are colored Icon Composer glass over one white rim with a drop shadow, on a light tile: Arc's graded gray for Spectrum, cream for Amber. Users choose them in Settings → General → App icon, after Sunrise Gold.

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
- **Colors.** The owner asked for Spectrum to come closer to Arc's coloring, with more deep blue and purple, and for Amber to be darker and bronzer, since it read too light in Light mode. From three palettes each (`color-options.png`), the owner chose **P2, deeper indigo and purple**, and **Q2, bronze**.
- **Arc's red middle.** With P2 the owner missed Arc's brighter red and pink. Two more rounds followed: more coral (`spectrum-pink-options.png`), then Arc's order of blue, red, then light pink (`spectrum-red-options.png`). The owner chose **S2**: blue left rays, Arc's deeper red at the center ray and the middle of the sun, fading to light pink on the right. Amber stays Q2.
- **Arc's gray tile.** The owner then asked for Spectrum's tile to use the gray Arc's icon sits on in the Dock, in place of near-white. Amber keeps its cream, and Dark is unchanged.
- **Arc's outline, shadow and graded tile.** The owner asked for thicker white outlines and a drop shadow closer to Arc's design. Arc's outline is about 3.2% of the tile, against our 1.4%, and Arc's shadow is a soft gray close around it. From three options (`outline-shadow-options.png`) the owner chose **O3**: Arc's outline thickness and a stronger drawn shadow, with the rays moved out so every outline stays separate. The owner also asked for the middle ray to stand taller still, and for Spectrum's tile to follow Arc's gradient from darker gray at the top to lighter below, rather than one flat gray.
- **Five bold rays.** The owner still disliked the result and asked for a simpler mark with fewer, thicker rays like Arc's strokes. Three rays (`three-ray-options.png`) no longer read as a sun. Of three bolder sunbursts (`bold-sunburst-options.png`), the owner chose **F3**: five thick rays (76 wide) at 0°, ±38° and ±76°, with their outlines kept separate. The owner also decided the names stay Sunrise Spectrum and Sunrise Amber, with no reference to Arc.
- **Arc's stroke weight.** Beside Arc in the Dock, F3 still felt too small and thin. Arc's A covers about the same share of the tile, but its strokes are about 14% of the tile wide against our 7%, and they overlap into one dense shape. Rays about twice as thick (`arc-weight-options.png`) were then lengthened to fill more of the tile (`longer-ray-options.png`). The owner chose **L1, with even thicker rays**: of 130, 150, 165 and 180 (`thick-ray-options.png`), 165 is the heaviest before neighboring rays touch.
- **Back to the Sunrise's geometry.** The owner felt something was still off. The risen sun read as a dome with no horizon under it, the rays fanned from a raised center, and the middle ray's highlight sat off to one side. Of three corrections (`half-disc-options.png`) the owner chose **R2**: a half-disc sun with the artwork's fan of rays, 150 wide, and a centered highlight. The wider middle ray had straddled Spectrum's blue-to-red switch, so the switch moved just left of it.
- **The ring sun, after Gemini.** The owner then shared an interpretation by Gemini that they liked: an outlined ring sun whose lower half shows through translucent water lines, seven rays, the six stepped water lines back, coral above and blue below, and one white outline. It was rebuilt on the real Sunrise geometry as three Icon Composer prototypes (`ring-sun-prototypes.png`). The owner chose **Y**: Gemini's proportions on Spectrum's graded gray tile, with Amber in bronze on its cream tile. This replaces the five-ray mark and brings the water lines back.

## Goals

1. On packaged macOS 26+, choosing either icon makes the Dock show its glass stack from the bundle's `Assets.car`. Light shows the light tile; in Dark, macOS darkens the fill to near-black.
2. In unpackaged and pre-macOS 26 runs, the Dock shows a flat PNG for the current appearance, the same fallback the other icons have.
3. Both appear in the existing Mac-only App icon picker, after Sunrise Gold.

## Non-goals

- No Windows or Linux changes, and no change to the default icon, Finder's icon or the website. Website copy waits for a release (`docs/marketing-claims.md`).
- Clear and Tinted are unchanged: in those styles `app-icon.js` already shows the bundle icon (Sunrise), as it does for Sunrise Gold.
- Patron unlocks nothing.

## Artwork

`scripts/app-icon-colorways.js` draws everything from one geometry, and `brand:build` renders it.

- **Mark:** an outlined ring sun, 7 rays and 6 water lines with rounded caps, on the Sunrise artwork's own geometry (measured from `build/app-icons/Icon.icon/Assets/sunrise-mark.png`).
  - **Sun:** a ring of radius 215 and stroke 70, centered on the horizon. It shows above the top water line, and below it only through the water.
  - **Rays:** at 0°, ±28°, ±52.5° and ±76°, 54 wide. Their tips reach 570, 505, 485 and 440 from the sun's center, and they start 30 clear of the ring.
  - **Water:** the artwork's six stepped lines, 40 thick, at heights 670, 717, 764, 809, 853 and 900, with half widths 395, 318, 224, 162, 79 and 33. The last line sits 8 lower than in the artwork, so at this stroke weight it keeps the others' gap instead of touching the line above.
  - **Overlap:** where the ring passes behind a water line, the ring's color is screened into the line at 55%. That turns Spectrum's blue lines purple there, and lightens Amber's bronze ones.

  The mark is centered on the 1024 canvas and scaled so that, rim included, its longer side is 860 px in the native layers. It is a deliberate redraw, so it is the one Sunrise surface not derived from `assets/sunrise-mark.svg`.
- **Colors** (vertical gradients, top to bottom):
  - Spectrum: ring and rays `#FF7A86 → #F94A64 → #E23A55` (Arc's coral and red), water `#1942CD → #2338C8 → #20108F → #1A007F` (Arc's royal blue to navy).
  - Amber: ring and rays `#E2AE4E → #CD8530 → #B8692A`, water `#A4582A → #8E4A22 → #6E3818 → #5A2C12`.
- **Shine:** no highlight is painted on; Icon Composer's specular rim and glow give the glass its shine, as in the approved prototype.

### Native stack

| Group | Layers | Glass | Notes |
|---|---|---|---|
| front | `<prefix>-sun.png`, `<prefix>-rays.png`, `<prefix>-water.png` | **true** | `specular: true`, `lighting: "individual"`, shadow `layer-color` 0.5, translucency 0.15 |
| middle | `<prefix>-rim.png`: one white outline, 24 (before scaling) beyond every stroke, over a drawn drop shadow (12 down, blur 16, black at 0.32) | false | hidden in `tinted` (Clear and Tinted); shadow `neutral` 0.3 |
| back (Spectrum) | `spectrum-tile.png`, `spectrum-tile-dark.png` | false | Gold's tile-image pair: the light tile hidden in Dark and in `tinted`, the near-black one shown only in Dark |

- The fill is `automatic-gradient`: Spectrum `#C3C9D2`, Amber `#FFF7EC`, with dark specializations `#3A3942` and `#2E261C`.
- **Spectrum's tile** is Arc's graded gray, which a one-color fill can't express, so it is drawn as tile images over the fill:
  - Light: `#A9B0BA` at the top, `#B3B9C2` at 0.3, `#CED3DB` at 0.85 and `#D2D7DE` at the bottom. It was sampled from the owner's Dock screenshot, since Arc's asset catalog carries no tile color. `ictool` renders it at `#ACB2BB` to `#D1D5DC`.
  - Dark: a near-black tile from `#1F1F1E` to `#100F0F`.
- Icon Composer renders both Dark tiles near-black (`#1F1F1E` to `#100F0F`), which the owner approved in `glass-proof.png`.
- `createIconDocument` gains `extraLayers` (more layers in the front group) and `rimImageName` (the rim group). Existing colorways are unchanged.

### Flat fallbacks

- `icon-sunrise-<prefix>.png` and `-dark.png` draw the 824 px tile with the flat icons' drop shadow, using the same tile gradients (Amber's sampled from `ictool`'s render of its fill).
- The glass is approximated with a color glow, the white rim with its shadow, and the colored strokes.
- The flat mark scale is the native scale × 824/1024, so the mark takes the same share of the visible tile in both versions. `test/unit/app-icon.test.js` holds the two together.

## Verification

- `built-stacks.png` shows packages built from the committed layers by `createIconDocument`, rendered by `ictool` in all four appearances, followed by both flat fallbacks.
- Unit tests cover the catalog, the stack structure, the fallback choice, artwork size, the ring sun, the tallest middle ray, the six stepped water lines with the ring's color showing through, the rim and its shadow, and Spectrum's graded tile.
- `brand:check` guards the generated PNGs.
- Still to check by hand: the live Dock in a packaged build (`dist:dir`), Light and Dark, and switching between icons in Settings.
