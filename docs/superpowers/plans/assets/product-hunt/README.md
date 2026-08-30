# Product Hunt media provenance

These files are launch media for packaged public Blanc v1.10.0. They contain
no mockup, development-build UI, or behavior from post-release `main`.

- `thumbnail-240x240.png` is a 240×240 Lanczos export of the production
  `site/public/logo.png` mark.
- `island-resting-1270x760.png` is the 1.5-second frame from
  `../island-demo.mp4`, scaled proportionally to 760 px high and padded on the
  white page background to Product Hunt's recommended 1270×760 canvas.
- `quick-switcher-1270x760.png` is the 7.3-second frame from the same video,
  after the complete `git` query and results are visible, exported with the
  same scale and pad.

The source demo was captured on August 30, 2026 from the installed packaged
public v1.10.0 macOS app in an isolated local profile. Its full provenance and
verification are recorded in `../launch-copy.md` and
`../../2026-08-20-growth-counter-offensive.md`.

Before uploading, verify the files rather than trusting filenames:

```bash
sips -g pixelWidth -g pixelHeight \
  docs/superpowers/plans/assets/product-hunt/*.png
```

Expected: the thumbnail is exactly 240×240 and both gallery stills are exactly
1270×760.
