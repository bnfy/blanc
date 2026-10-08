# Original Blocker geometry, bronze 3D variant

The owner requested a new 3D version closer to the original Blanc Blocker
shield and diagonal slash, retaining the spinning Horizon Shield's bronze
styling. This is a website-only visual variant; app PR #502 and the native
Island's original monochrome SVG are unchanged.

`site/src/components/HorizonShield.astro` now accepts `variant="blocker"`.
The default `horizon` variant preserves the previous layered artwork and
relief. The homepage uses the new variant for review. Both share the same
lighting, bronze walls, scroll timing, reduced-motion and WebGL fallback.

## Artwork and geometry

- Master: `site/src/assets/blocker-shield-bronze.png`.
- Website export: `site/public/blocker-shield-bronze.webp`.
- Alpha outline: `site/src/data/blocker-shield-outline.json`.
- Relief: `site/src/scripts/blocker-shield-model.js`.
- Tool: built-in `image_gen.imagegen`, transparent output.
- References: `assets/horizon-shield.png` for bronze treatment and the
  owner's October 3, 8:52:51 PM screenshot for the original outline/slash.
- The generated artwork interprets the native SVG's peaked top, sloping
  shoulders, curved lower sides and rising diagonal as solid brushed bronze.
  It is a decorative rendering, not a pixel-exact replacement for the SVG.
- The new relief raises the diagonal rather than reusing Horizon's two
  horizontal grooves. Front and back share the same face and relief turned
  180 degrees. Beveled perimeter walls fully close the volume.
- Export: Sharp trim threshold 8; contain 960×960 on transparent padding;
  WebP quality 90, alphaQuality 100, effort 6. No color filter.
- Rebuild silhouette: `node site/scripts/build-horizon-outline.mjs blocker`.
  The command without an argument retains the original Horizon output.
- Asset hashes are recorded in `docs/website-blocking-launch.json`.

## Verification

- 16 focused shield, hero and release-evidence tests passed. Both models pass
  matching front/back relief and UV checks, outward wall normals, physical
  thickness and two-triangles-per-welded-edge closure checks.
- Production build and SEO verification passed: 29 pages, 27 sitemap URLs.
- Browser review at 855×792 and 390×844 confirmed the new WebGL variant loads,
  the diagonal remains readable, the sides are closed during rotation, and
  there is no horizontal overflow or console warning/error.
- Original Horizon source, WebP and outline are unchanged. No native app file
  was changed. The existing release dependency and deployment gate remain.

## Generation prompt

```text
Use case: precise-object-edit.
Asset: transparent front-face artwork for a physically thick spinning 3D shield on Blanc's website.
Input image 1 is the existing Horizon Shield bronze artwork: preserve its copper/bronze hue, fine brushed metal, softly domed relief, rounded bevel, controlled studio highlights and premium solid cast-metal character.
Input image 2 is the ORIGINAL BLANC BLOCKER ICON geometry reference only. Ignore its number badge and all white background.
Create a NEW sibling design, a solid bronze interpretation of that original icon, replacing only the geometry and emblem of image 1. Its outline must have the original distinctly PEAKED TOP CENTER, straight sloping shoulders to upper left/right corners, almost vertical upper sides, smooth curved lower sides tapering to a centered bottom point. Tall/narrow shield proportions, width:height approximately 10:12.4. NOT the existing rounded arched top. Geometry in 16-unit coordinates is M8 1.8 L13 3.7 V7.5 C13 10.6 10.9 12.8 8 14.2 C5.1 12.8 3 10.6 3 7.5 V3.7 Z.
Use a substantial rounded bronze perimeter bevel and a clearly readable DIAGONAL BRONZE SLASH running from the lower left to the upper right, following original icon from (4.4,11.47) to (12.61,3.55). The slash is an integral raised beveled band about the same width as the perimeter, cleanly connected to it at both ends. The two flat/softly domed fields either side of this slash are recessed brushed bronze. No horizontal seams and no three stacked segments.
Straight-on FRONT VIEW, orthographic, centered, upright, perfectly symmetric outer silhouette. No camera angle, no side walls visible outside the silhouette. Everything inside shield is solid opaque bronze; only outside shield is transparent. Use generous transparent padding on all sides; entire shield visible, do not crop. No text, no badge, no number, no extra symbols, no background, no drop shadow. Metallic copper/bronze rather than yellow gold; match image 1. Soft warm highlights with restrained shine, no blown white glare.
```
