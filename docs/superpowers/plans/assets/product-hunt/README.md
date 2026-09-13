# Product Hunt media provenance

All current launch media was captured on September 13 from installed packaged public Blanc
v1.16.2 in the dedicated `Launch demo` profile using public pages only. The
selected release tag points to
`0cced924b458496869295c711162c315a4d5da29`.

- `thumbnail-240x240.png` is a 240×240 Lanczos export of
  `site/public/logo.png`; SHA-256
  `21b075a4b9cc62f160b002d1beda2197c2c63f60003accdf44888c4cd02b3e8e`.
- `island-resting-1270x760.png` shows public v1.16.2 over the live Blanc
  homepage and its current “A little less browser.” headline; SHA-256
  `00ee5eb5a9fe1903eb6a7b760de973631af3a533562886aff58564ad45097b8a`.
- `quick-switcher-1270x760.png` shows the same public app and homepage behind
  the real Quick Switcher, with public Blanc-site results only; SHA-256
  `25508f3fe5ccef634d532fb691038110c5422bc98b146e68fe68373ede1e2eb8`.

The v1.16.2 stills were captured at 2× native resolution and Lanczos-scaled to
1270×760. They contain the real macOS window controls, Blanc Island, and live
website; no product controls, text, or colors were composited. They exclude
private data, remote-device identifiers, development indicators, dialogs, and
the pointer. They are ready for owner review before upload to the unpublished
draft at `https://www.producthunt.com/products/blanc-3?launch=blanc-3`.

The replacement 42-second overview is a local review artifact at
`output/product-demos/overview-review-v1.16.2/blanc-launch-overview.mp4`. It
uses only the installed public v1.16.2 app, the live Blanc site, The Verge, and
the dedicated demo profile. It demonstrates the Billboard start page, a named
tab group, slash commands, Quick Switcher, the live homepage, and the real
blocker count and per-site controls. Its seven captions are release-backed by
the v1.16.2 tag and current public site. The final file is 1920×1200, 30 fps
H.264 BT.709, exactly 42.000 seconds, with no audio stream; SHA-256
`9ca7b00220da3916055934db4e398896fa63f6e74992eadc9b98bde02796cb5d`.
The matching local poster SHA-256 is
`5c5a8b25e88c7765bc2cbec4d4d14062edff6bd63f00e12de26cd88947d96453`.
Owner approval and the new YouTube URL remain pending; do not upload this file
or replace the Product Hunt video until that approval is recorded.

The current [22-second source demo](../island-demo.mp4) is a 1920×1200,
30 fps H.264 BT.709 export from the same v1.16.2 capture set with no audio
stream; SHA-256
`0391ade1b070370c8676292d934caea2bc8e9150ecc639c85c527e94e9c03205`.
The 960×600 GIF SHA-256 is
`6ce898171346c8606347593548917023abbaa408440ed18534686f2bd0d7bc99`.

The historical v1.16.0 overview remains unlisted at
`https://www.youtube.com/watch?v=X5pAN07iuks`, and its privacy-enhanced embed
remains `youtube-nocookie.com/embed/X5pAN07iuks`. It is a historical input and
must not be published as the v1.16.2 launch overview. The older v1.15.0 video
also remains intact.

The live Product Hunt editor previously reported `Scheduled` for September 17
at 12:01 a.m. PDT (3:01 a.m. EDT). That schedule remains contingent on explicit
owner selection of v1.16.2, approval and upload of the finished creative,
merge of the release-bound changes, the replacement freeze anchor, and the
fresh soak clearing at or after September 13 at 5:36 p.m. ET.

Verify dimensions before upload:

```bash
sips -g pixelWidth -g pixelHeight \
  docs/superpowers/plans/assets/product-hunt/*.png
```

Expected: thumbnail 240×240; both gallery stills 1270×760.
