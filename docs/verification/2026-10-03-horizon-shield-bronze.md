# Horizon Shield — Sunrise bronze revision

On October 3, 2026, the owner requested a less golden, more copper/bronze
Horizon Shield matching the Sunrise sun, everywhere in the app and website.
This supersedes the earlier yellow-gold color direction, while retaining the
three curved plates, raised perimeter, brushed material and transparent
background. The original approval record remains in
`2026-10-03-horizon-shield.md` and revision `03621de6`.

## Shared artwork

- `assets/horizon-shield.png`: edited 1254×1254 transparent master.
- `src/renderer/shield-horizon.png`: alpha-trimmed 128×128 transparent PNG,
  rendered at the existing 16px native size with the original badge and states.
- `site/public/horizon-shield.webp`: alpha-trimmed 960×960 export, used by the
  hero Island, the Privacy fallback and both faces of its 3D model.
- The closed 3D rim uses bronze `#a67b4f`; its key light is `#fff8f0` to reduce
  the earlier yellow cast. Satin roughness and subdued lighting remain.

The original Sunrise mark is unchanged. Historical public product screenshots
remain immutable; this is artwork for the next app/website launch, not a
statement that it has shipped in public v1.26.0. No desktop blocking behavior,
control geometry, hit targets or accessibility strings change.

Both exports are derived with the pinned Sharp version: trim threshold 8,
contain resize and transparent padding. The runtime export uses PNG; the site
uses WebP quality 90, alphaQuality 100, effort 6. Run
`node site/scripts/build-horizon-outline.mjs` after the website export to trace
the final alpha silhouette for the closed mesh. Source/reference/export hashes
and the historical source hash are recorded in `docs/website-blocking-launch.json`.

## Image edit provenance

Tool: built-in `image_gen.imagegen`, edit mode, transparent background.
Image 1 was the existing master at revision `2c950840`. Image 2 was the unchanged
`site/public/sunrise-hero-mark.png` as a palette reference only.

Exact prompt:

> Use case: precise-object-edit. Edit target: image 1, the existing transparent layered Horizon Shield. Palette reference only: image 2, Blanc's original Sunrise mark. Recolor ONLY the shield's metal so it matches the sun's restrained antique copper/bronze: medium brown-bronze face, warm muted copper midtones, deep umber seams, soft pale champagne highlights. Remove the bright yellow-gold/orange-gold cast; avoid reddish rose-gold. The shield should feel the same material and tonal family as the Sunrise sun. Preserve the exact existing shield silhouette, broad rounded top, tapered tip, three curved horizontal plates, two dark seams, raised perimeter, front-facing camera, brushed grain, dimensions and framing. Do not redesign, move the seams, add a sun symbol, text, logo, scene, shadow or background. Preserve genuine alpha transparency. Single recolored shield only, high resolution, sharply defined edges. Retain the satin brushed finish with restrained shine.

Generated output: `exec-6f5c31e0-1ae7-4861-b27f-9dd2cc52e6b8.png`, copied into
the project master. The alpha outline is derived from the final edited artwork;
pixel-identical geometry to the previous raster is not assumed.

## Validation

- All 38 focused native-shield, chrome-resource, hero, website-model and
  public-capture evidence tests pass. The existing export test now reproduces
  both app and website assets byte-for-byte from the shared bronze master;
  original and edited source evidence remain separately pinned.
- Production/SEO build and lint pass. The existing lazy Three.js chunk size
  advisory remains; no dependency changed.
- The website hero icon, large front/back artwork and bronze side surface were
  inspected in the 855×792 browser preview. No page overflow or browser console
  warnings/errors were observed. The original Sunrise mark remains unchanged.
- The 128px native runtime export was visually inspected. This revision did
  not launch a native desktop instance or produce a packaged app; the earlier
  native interaction checks remain historical evidence, not a fresh run.

The change remains on the revamp PR and retains its app-release dependency.
No public app release or website deployment was performed.
