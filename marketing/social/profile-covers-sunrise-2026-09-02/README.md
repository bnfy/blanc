# Sunrise social profile covers

Status: **local review assets. Nothing has been uploaded or published.**

These X and Facebook covers pair the approved golden Sunrise environments with
the current product UI. They contain no marketing headline, tagline, wordmark,
or typography treatment. The domain text belongs to the captured Island and is
not a branding-font decision.

## Direction A — Architectural Dawn

The existing ivory-and-bronze architectural field gives the mark a tactile,
spatial setting. The visual weight stays right of center so the lower-left
profile-photo overlap remains quiet.

- `sunrise-architectural-island-master-3000x1000.jpg`
- `sunrise-architectural-island-x-cover-1500x500.jpg`
- `sunrise-architectural-island-facebook-cover-1640x624.jpg`
- `sunrise-architectural-background-master.png`

## Direction B — Minimal Sunrise

A quieter warm-ivory field uses a restrained dawn glow and sparse bronze
reflection bands behind the current resting Island.

- `sunrise-minimal-island-master-3000x1000.jpg`
- `sunrise-minimal-island-x-cover-1500x500.jpg`
- `sunrise-minimal-island-facebook-cover-1640x624.jpg`
- `sunrise-minimal-background-master.png`

## Quiet Island overlay

`quiet-island-overlay.png` is a transparent, high-resolution render of the
current repository's resting Island demo. It was captured from
`site/dist/features/island.html`, then set to the ordinary `blancbrowser.com`
state with the current Sunrise favicon. It preserves the real four-dot tab
cluster, quiet blocker shield, reload, favorite, and close actions. The UI was
rendered from the DOM rather than generated or redrawn.

## Regenerate

From the repository root:

```sh
node marketing/social/profile-covers-sunrise-2026-09-02/render.js
```

The renderer uses the repository's existing `sharp` dependency and composites
the transparent current-product Island over each background plate.

## Background prompts

The built-in image generation tool produced only the two background plates.
The current Island was added afterward by `render.js`.

### Architectural Dawn

> Create a premium, minimal panoramic background extending the material,
> palette, and tactile finish of the supplied Sunrise app icon without
> reproducing its symbol. Use an expansive warm-ivory paper-and-plaster field,
> subtle dawn light, faint horizontal reflections, and restrained brushed-bronze
> architectural accents toward the far right. Preserve generous clean space.
> Include no logo, icon, sun, rays, letters, words, UI, frame, or watermark.

### Minimal Sunrise

> Create a quiet, typography-free panoramic background extending only the
> material, palette, and dawn-light feeling of the supplied Sunrise app icon.
> Use a nearly empty warm-ivory paper and softly plastered field, a restrained
> honey-gold glow slightly right of center, and a few subtle horizontal bronze
> reflection bands along the lower quarter. Include no logo, Sunrise symbol,
> sun, rays, letters, words, URL, UI, border, or watermark.

## Crop guidance

- X exports use the platform's 1500×500 recommendation. The complete Island
  remains inside the possible 60 px top-and-bottom crop.
- Facebook exports are 1640×624. The complete Island remains inside a centered
  1110×624 mobile-style crop.
- Both directions leave the lower-left area free for the profile avatar.

Any upload remains a separate public account change requiring approval.
