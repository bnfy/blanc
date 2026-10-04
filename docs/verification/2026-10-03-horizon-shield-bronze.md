# Horizon Shield — Sunrise bronze app revision

On October 3, 2026, the owner requested a less golden, more copper/bronze
Horizon Shield matching the Sunrise sun, everywhere in the app and website.
The owner then explicitly requested separate PRs: this shared master and native
icon ship in the next app release before the redesigned website deploys.

## App scope

- `assets/horizon-shield.png`: recolored 1254×1254 transparent master.
- `src/renderer/shield-horizon.png`: alpha-trimmed 128×128 transparent PNG,
  rendered at the existing 16px native size, retaining badge and off-state styles.
- Brand and reserved-asset documentation follow the copper/bronze direction.

No website code, website exports, dependency changes, blocking behavior or app
version bump is part of this PR. Original Sunrise artwork and historical public
captures remain unchanged. The earlier native interaction review is preserved
in `2026-10-03-horizon-shield.md`, with the original artwork at `03621de6`.

Reproduce the runtime PNG with the pinned Sharp version:

```js
await sharp('assets/horizon-shield.png')
  .trim({ threshold: 8 })
  .resize(128, 128, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile('src/renderer/shield-horizon.png');
```

SHA-256:

- Master: `5882ad8fab1debe245a8cbf92e3e7e5dfc26f755607ddb598eb73187ca54389e`
- Native PNG: `692e180cfa9e78d0f65062e851050bc8056ea9b64ffd24abefbf0dd3c02c7c96`

## Image edit provenance

Tool: built-in `image_gen.imagegen`, edit mode, transparent background.
Image 1 was the existing master at revision `2c950840`. Image 2 was the unchanged
`site/public/sunrise-hero-mark.png` as a palette reference only. The palette
reference is existing artwork; this PR does not change any website file.

Exact prompt:

> Use case: precise-object-edit. Edit target: image 1, the existing transparent layered Horizon Shield. Palette reference only: image 2, Blanc's original Sunrise mark. Recolor ONLY the shield's metal so it matches the sun's restrained antique copper/bronze: medium brown-bronze face, warm muted copper midtones, deep umber seams, soft pale champagne highlights. Remove the bright yellow-gold/orange-gold cast; avoid reddish rose-gold. The shield should feel the same material and tonal family as the Sunrise sun. Preserve the exact existing shield silhouette, broad rounded top, tapered tip, three curved horizontal plates, two dark seams, raised perimeter, front-facing camera, brushed grain, dimensions and framing. Do not redesign, move the seams, add a sun symbol, text, logo, scene, shadow or background. Preserve genuine alpha transparency. Single recolored shield only, high resolution, sharply defined edges. Retain the satin brushed finish with restrained shine.

Generated output: `exec-6f5c31e0-1ae7-4861-b27f-9dd2cc52e6b8.png`, copied into
the project master. Pixel-identical geometry to the earlier raster is not
assumed; the three plates, two seams and raised outline remain visually intact.

## Delivery order

1. Merge this app-only PR into `main` through normal protected checks.
2. Include the shared bronze master and native PNG in the next verified app release.
3. Reconcile the website launch evidence against that immutable public release.
4. Merge and deploy website PR #491 only after the app release is public.

The website PR separately owns its WebP export, 3D rim/material, outline and
website verification ledger. It depends on this app artwork; shipping the app
must never depend on merging or deploying the website redesign.

## Validation

- All 23 native shield-model and chrome-resource tests pass on this isolated
  app-only branch based on `358cc02d`.
- The transparent 128×128 runtime PNG reproduces byte-for-byte from the shared
  master using pinned Sharp. Both source and runtime artwork were inspected.
- Lint and whitespace checks pass. No dependency or blocking behavior changes.
- This color revision did not launch a native desktop instance or package a
  release. Earlier native interaction checks remain historical evidence.
