# Horizon Shield

The owner selected Horizon Shield from three gold-shield concepts on October 3,
2026, reviewed it in an isolated native Blanc dev instance, and approved the
smaller 16px revision before requesting a squash merge for the next release.

The later same-day copper/bronze color direction supersedes the gold palette
below. See `2026-10-03-horizon-shield-bronze.md` for the revised shared master,
app and website exports, edit prompt and validation. This record preserves the
original selection and native interaction review.

## Final presentation

Three curved gold plates form a rounded shield with two dark bronze seams.
`src/renderer/shield-horizon.png` replaces the old stroked SVG at 16×16 CSS
pixels inside the unchanged 24px button. The existing 1.15 Island zoom applies
to both. The original count anchor, hover target, accessible state label and
site-controls interaction remain. Blocking-off presentation uses the existing
reduced opacity plus grayscale on the artwork. Blocking policy is unchanged.

The approved artwork is Blanc's product mark, not uBlock Origin's logo. This
change adds no uBO functionality or claim that uBO support has shipped.

## Source and export

`assets/horizon-shield.png` is the 1254×1254 transparent source, created with
the built-in image generation tool from the selected concept. The edit prompt
requested the exact left-hand shield: broad rounded top, tapered point, three
curved horizontal gold plates, two bronze seams, thin raised perimeter,
brushed gold material and front-facing perspective; remove all presentation
backgrounds, labels, toolbar mockups and cast shadows, with no added symbol.

The 128×128 transparent runtime PNG is an alpha-trimmed export. Reproduce it
with the repository's pinned Sharp version:

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

Both artwork paths are listed in `ASSET-LICENSE.md`.

## Local visual review

Native macOS dev captures used a 1280×800 CSS-pixel window at 2× density and a
disposable profile. The owner found the initial 20px icon too large; 16px was
then checked in light and dark Island appearances with a real count of one.
The gold layers remained legible, the badge left the face visible, and clicking
the shield opened the existing site controls. Escape dismissed the popover.
The owner responded “much better!” to the smaller version.

This is a presentation change, not a platform-sensitive browser feature.
The visual review does not claim native Windows/Linux acceptance, packaged
release verification, or uBO integration coverage. Those remain part of their
respective release gates.

## Merge validation

- ESLint passed, along with 41 focused unit tests for the chrome protocol,
  shield model, Island geometry and brand assets.
- All substrate checks passed after preparing the fresh worktree's ignored
  blocker seed with the normal `adblock/seed.mjs --prepare` setup step.
- Existing desktop acceptance scenarios F12-3 through F12-9 passed: seven
  scenarios and 52 steps covering blocking settings and site controls.
- The packaging file matcher includes the runtime PNG. Its transparent
  128×128 dimensions and byte-for-byte reproduction from the master were checked.
