# Product Hunt media provenance

All current launch media was captured from installed packaged public Blanc
v1.16.0 in the dedicated launch-demo profile using public pages only.

- `thumbnail-240x240.png` is a 240×240 Lanczos export of
  `site/public/logo.png`.
- `island-resting-1270x760.png` shows public v1.16.0 over the live Blanc
  homepage and its current “A little less browser.” headline.
- `quick-switcher-1270x760.png` shows the same public app and page behind the
  real Quick Switcher, with public Blanc-site results only.

The September 10 stills were captured at 2× native resolution and Lanczos-
scaled to 1270×760. They contain the real macOS window controls, Blanc Island,
and live website; no product controls, text, or colors were composited. They
exclude private data, remote-device identifiers, development indicators,
dialogs, and the pointer. They are ready for the unpublished draft at
`https://www.producthunt.com/products/blanc-3?launch=blanc-3`.

The current 42-second overview is unlisted at
`https://www.youtube.com/watch?v=X5pAN07iuks`. It demonstrates real Quick
Switcher and slash-command use, a named tab group, Glance Make main, the real
blocker count and controls, Explore/Build Named Workspace switching with
`Named Workspaces · Patron` visible, and one legal Mahjong match. The final
1920×1200, 30 fps H.264 BT.709 file is exactly 42.000 seconds and has no audio
stream. SHA-256:
`b104a8249c5949ecb24fb0da07cd1339a7e1a249e0abfeb5322a890f98e18bd0`.
Anthony approved its 38 px Inter secondary labels on September 10.

YouTube reported no copyright issues. The watch URL and
`youtube-nocookie.com/embed/X5pAN07iuks` both returned HTTP 200. Product Hunt
reported “All changes saved successfully” after the full URL was entered;
rendered-player validation remains on the morning-of checklist. YouTube is
using an automatically generated frame. No phone-verification flow was
attempted. The matching local poster SHA-256 is
`6eba52476bca81c228bdfc28bd033324a4f570b8277b207d9b28c4449f83e184`.
The historical v1.15.0 YouTube video was not deleted.

The current [22-second source demo](../island-demo.mp4) is a 1920×1200,
30 fps H.264 BT.709 cut from the approved v1.16.0 overview with no audio stream;
SHA-256 `d8fb663e0a0267912757275e12056d69c8163d6de88e9dd5f98a50e1a6ab6c0b`.
The 960×600 GIF SHA-256 is
`0bc6fc025283ff2c5a8e6dcd01cdcbe809b2d631a2c3f1738436ae03056de637`.

The live editor reports `Scheduled` for September 17 at 12:01 a.m. PDT
(3:01 a.m. EDT). The schedule remains contingent on the final freeze anchor
and fresh 48-hour soak clearing before launch week.

Verify dimensions before upload:

```bash
sips -g pixelWidth -g pixelHeight \
  docs/superpowers/plans/assets/product-hunt/*.png
```

Expected: thumbnail 240×240; both gallery stills 1270×760.
