# Horizon Shield — monochrome Island and bronze display artwork

On October 3, 2026, the owner requested a less golden, more copper/bronze
Horizon Shield matching the Sunrise sun, everywhere in the app and website.
The owner then explicitly requested separate PRs: this shared master and native
icon ship in the next app release before the redesigned website deploys.

## Final app treatment

The owner subsequently found the full-color texture out of place among the
Island's minimal controls and requested a flat monochrome version there.
`src/renderer/index.html` now embeds a vector outline: the same broad shield
and two curved seams form three layers, drawn with `currentColor`, no fill,
1.25-unit strokes and rounded joins. It stays 16×16 CSS pixels inside the
existing 24px button; the native zoom, count badge, hover circle, off-state
opacity and accessible state descriptions remain.

The SVG inherits the Island's state colors in light and dark appearances.
The unused `src/renderer/shield-horizon.png` is removed, along with its exact
chrome-protocol allowlist entry. No new resource or behavior is introduced.

`assets/horizon-shield.png` remains the recolored 1254×1254 transparent bronze
master for the large website illustration. Its SHA-256 remains
`5882ad8fab1debe245a8cbf92e3e7e5dfc26f755607ddb598eb73187ca54389e`.
This app PR contains no website code or exports. The website PR reuses the
native SVG for its Island hero and keeps bronze artwork only at display scale.
Original Sunrise artwork and historical public captures remain unchanged.

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
2. Include the monochrome native Island icon in the next verified app release.
3. Reconcile the website launch evidence against that immutable public release.
4. Merge and deploy website PR #491 only after the app release is public.

The website PR separately owns its WebP export, 3D rim/material, outline and
website verification ledger. It depends on this app artwork; shipping the app
must never depend on merging or deploying the website redesign.

## Validation

The original bronze revision passed 23 native shield-model and chrome-resource
tests, lint and raster export reproduction. The later monochrome revision
reruns those native state/resource checks and lint; the removed raster path
must now be rejected by the chrome protocol. Website hero and 3D validation
belong to the dependent website PR. No new packaged app release is claimed.
